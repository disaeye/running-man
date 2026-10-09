from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from application.insights.service import events_for_day, readiness_inputs
from application.physiology.service import cached_physiology
from application.recommendations.engine import build_recommendations
from domain.insights.readiness import compute_readiness
from domain.physiology.vdot import training_paces as compute_training_paces
from infrastructure.repositories.insight_reads import InsightReadRepo


async def recommendations_for_day(athlete_id: UUID, target_day: date) -> list[dict[str, object]]:
    wellness, loads = await readiness_inputs(athlete_id, target_day)
    events = await events_for_day(athlete_id, target_day + timedelta(days=1))
    readiness = compute_readiness(target_day, wellness, loads)
    latest_load = _latest_load(loads, target_day)
    training_paces = await _training_paces(athlete_id)
    weekly_adherence = await _weekly_adherence_pct(athlete_id, target_day, loads)
    return build_recommendations(
        tsb=_number(latest_load, "tsb"),
        acwr=_number(latest_load, "acwr"),
        readiness=_integer(readiness.get("score")),
        has_planned_workout_tomorrow=bool(events),
        training_paces=training_paces,
        weekly_adherence=weekly_adherence,
    )


def _latest_load(rows: list[dict[str, object]], target_day: date) -> dict[str, object] | None:
    return next((row for row in reversed(rows) if row.get("day") == target_day), None)


def _number(row: dict[str, object] | None, key: str) -> float | None:
    value = row.get(key) if row else None
    return float(value) if isinstance(value, int | float | Decimal | str) else None


def _integer(value: object) -> int | None:
    return int(value) if isinstance(value, int | float | Decimal | str) else None


async def _training_paces(athlete_id: UUID) -> dict[str, dict[str, float]] | None:
    """Load VDOT-derived training paces from the cached physiology snapshot.

    Returns None when physiology is not computed — the engine falls back to
    generic load-based recommendations without pace targets.
    """
    cached = await cached_physiology(athlete_id)
    if cached is None or cached.threshold_pace is None:
        return None
    # Invert threshold pace → VDOT → training paces (same proxy as the ability
    # endpoint). threshold_pace = 88% of vVO2max.
    threshold_m_per_min = 60.0 / cached.threshold_pace * 1000.0
    v_vo2max = threshold_m_per_min / 0.88
    vdot = v_vo2max * 0.2 + 3.5
    return compute_training_paces(vdot) or None


async def _weekly_adherence_pct(
    athlete_id: UUID,
    target_day: date,
    loads: list[dict[str, object]],
) -> float | None:
    """7-day completed TSS / planned TSS from calendar events."""
    week_start = target_day - timedelta(days=6)
    completed = 0.0
    for row in loads:
        day = row.get("day")
        if day is None:
            continue
        if isinstance(day, date) and week_start <= day <= target_day:
            completed += _number(row, "tss") or 0.0
        elif isinstance(day, str):
            try:
                parsed = date.fromisoformat(day[:10])
            except ValueError:
                continue
            if week_start <= parsed <= target_day:
                completed += _number(row, "tss") or 0.0

    try:
        planned, _recent = await InsightReadRepo().week_context(
            athlete_id, week_start, target_day, target_day
        )
    except Exception:
        return None
    if planned <= 0:
        return None
    return round(completed / planned * 100, 1)
