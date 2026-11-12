from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Final, cast
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from domain.physiology.vdot import (
    VDOT_ALGORITHM_VERSION,
    VDOT_SOURCE_REFS,
    race_performance_paces,
    vdot_from_threshold_pace,
    vdot_pace_anchor,
)
from domain.physiology.vdot import (
    training_paces as compute_training_paces,
)

MIN_RACE_DISTANCE_FOR_PACE_M = 1500
TRAINING_PACE_ANCHOR: Final = "Daniels-VDOT"


@dataclass(frozen=True)
class TrainingPaceStep:
    effective_from: date
    paces: dict[str, dict[str, float]]
    intensity_anchor: str = TRAINING_PACE_ANCHOR
    algorithm_version: str = VDOT_ALGORITHM_VERSION
    source_refs: tuple[str, ...] = VDOT_SOURCE_REFS


async def training_pace_history(
    athlete_id: UUID, race_date: date, db_conn: AsyncConnection[DictRow]
) -> tuple[TrainingPaceStep, ...]:
    async with db_conn.cursor() as cur:
        _ = await cur.execute(
            "SELECT effective_from, threshold_pace FROM athlete_thresholds "
            "WHERE athlete_id = %s AND effective_from <= %s AND threshold_pace IS NOT NULL "
            "ORDER BY effective_from",
            (athlete_id, race_date),
        )
        rows = await cur.fetchall()
    steps: list[TrainingPaceStep] = []
    for row in rows:
        threshold_pace = float(row["threshold_pace"])
        if threshold_pace <= 0:
            continue
        vdot = vdot_from_threshold_pace(threshold_pace)
        if vdot is None:
            continue
        paces = compute_training_paces(vdot)
        if paces:
            steps.append(
                TrainingPaceStep(
                    cast(date, row["effective_from"]),
                    paces,
                    intensity_anchor=TRAINING_PACE_ANCHOR,
                    algorithm_version=VDOT_ALGORITHM_VERSION,
                    source_refs=VDOT_SOURCE_REFS,
                )
            )
    return tuple(steps)


def pace_anchor(step: TrainingPaceStep, pace_key: str) -> dict[str, object]:
    """Bind one VDOT pace range to the step's date, model and source refs."""
    anchor = {
        **vdot_pace_anchor(
            step.paces,
            pace_key,
            effective_from=(
                step.effective_from.isoformat() if step.effective_from != date.min else None
            ),
            source_refs=step.source_refs,
        ),
        "model": step.intensity_anchor,
        "intensity_anchor": step.intensity_anchor,
        "algorithm_version": step.algorithm_version,
    }
    if step.effective_from == date.min:
        anchor["effective_from"] = None
        anchor["source_refs"] = [*dict.fromkeys((*step.source_refs, "user-goal-race-target"))]
    return anchor


def pace_anchors(step: TrainingPaceStep) -> dict[str, dict[str, object]]:
    """One dated, source-bound anchor per VDOT pace key in a history step."""
    return {key: pace_anchor(step, key) for key in step.paces}


def goal_training_paces(goal: dict[str, object]) -> tuple[TrainingPaceStep, ...]:
    distance = goal.get("race_distance_m")
    target_time = goal.get("race_target_time_s")
    if (
        isinstance(distance, bool)
        or not isinstance(distance, int | float)
        or distance < MIN_RACE_DISTANCE_FOR_PACE_M
        or isinstance(target_time, bool)
        or not isinstance(target_time, int)
    ):
        return ()
    paces = race_performance_paces(float(distance), target_time)
    if not paces:
        return ()
    return (
        TrainingPaceStep(
            date.min,
            paces,
            intensity_anchor=TRAINING_PACE_ANCHOR,
            algorithm_version=VDOT_ALGORITHM_VERSION,
            source_refs=VDOT_SOURCE_REFS,
        ),
    )


def pace_step_for_date(
    history: tuple[TrainingPaceStep, ...], target_date: date
) -> TrainingPaceStep | None:
    eligible = [step for step in history if step.effective_from <= target_date]
    return max(eligible, key=lambda step: step.effective_from) if eligible else None


def paces_for_date(
    history: tuple[TrainingPaceStep, ...], target_date: date
) -> dict[str, dict[str, float]] | None:
    step = pace_step_for_date(history, target_date)
    return step.paces if step else None
