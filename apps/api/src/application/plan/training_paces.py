from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import cast
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from domain.physiology.vdot import (
    race_performance_paces,
)
from domain.physiology.vdot import (
    training_paces as compute_training_paces,
)

MIN_RACE_DISTANCE_FOR_PACE_M = 1500


@dataclass(frozen=True)
class TrainingPaceStep:
    effective_from: date
    paces: dict[str, dict[str, float]]


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
        threshold_m_per_min = 60.0 / threshold_pace * 1000.0
        v_vo2max = threshold_m_per_min / 0.88
        vdot = v_vo2max * 0.2 + 3.5
        paces = compute_training_paces(vdot)
        if paces:
            steps.append(TrainingPaceStep(cast(date, row["effective_from"]), paces))
    return tuple(steps)


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
    return (TrainingPaceStep(date.min, paces),) if paces else ()


def paces_for_date(
    history: tuple[TrainingPaceStep, ...], target_date: date
) -> dict[str, dict[str, float]] | None:
    eligible = [step for step in history if step.effective_from <= target_date]
    return max(eligible, key=lambda step: step.effective_from).paces if eligible else None
