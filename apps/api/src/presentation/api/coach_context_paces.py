"""Pace targets for the coach context.

Split out of `coach_context.py`, which is at its pure-LOC limit. The threshold
pace is the stored physiology estimate; the training bands are Daniels' ranges
for the VDOT that pace implies.
"""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from application.physiology.service import cached_physiology
from application.thresholds.effective import resolve_effective_thresholds
from domain.physiology.vdot import training_paces as compute_training_paces
from domain.physiology.vdot import vdot_from_threshold_pace


async def resolve_threshold_pace(athlete_id: UUID) -> float | None:
    """Resolve current threshold pace (s/km), preferring effective thresholds."""
    effective = await resolve_effective_thresholds(athlete_id)
    if effective.threshold_pace.value is not None:
        return float(effective.threshold_pace.value)
    cached = await cached_physiology(athlete_id)
    if cached is not None and cached.threshold_pace is not None:
        return float(cached.threshold_pace)
    return None


async def training_paces_for(athlete_id: UUID) -> dict[str, dict[str, float]] | None:
    """Daniels pace bands derived from the current threshold pace.

    None when neither effective thresholds nor cached physiology has a threshold:
    the prescription then carries a load target and a duration but no pace, which
    is the honest state for an athlete without a threshold yet.
    """
    threshold_pace = await resolve_threshold_pace(athlete_id)
    if threshold_pace is None:
        return None
    vdot = vdot_from_threshold_pace(threshold_pace)
    if vdot is None:
        return None
    return compute_training_paces(vdot) or None


def latest_acwr(loads: Sequence[dict[str, object]]) -> float | None:
    for row in reversed(loads):
        acwr = row.get("acwr")
        if isinstance(acwr, int | float):
            return float(acwr)
    return None
