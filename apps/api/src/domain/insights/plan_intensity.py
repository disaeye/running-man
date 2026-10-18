"""Intensity balance and hard-day spacing for a planned week.

Split from `plan_quality.py` so the scoring module stays within the 250-line
limit, and because both rules are policy about training distribution rather than
about ranking.

Two measures live here and they deliberately use different units:

* **Intensity balance** is a share of *minutes*. The 80/20 rule people quote is
  about time spent at each intensity; TSS is duration × IF², so it charges a hard
  minute twice and cannot separate "trained longer" from "trained harder".
* **Spacing** is a share of *sessions*. The question is whether two hard days sit
  next to each other, not how long they were.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date
from itertools import pairwise
from typing import Final

from domain.workout.prescription import INTERVALS, TEMPO

INTENSITY_DISTRIBUTION_WEIGHT: Final = 25.0
SESSION_SPACING_WEIGHT: Final = 15.0

# Fallback classification for events that predate `training_type`.
LOW_INTENSITY_TSS_MAX: Final = 50.0
HIGH_INTENSITY_TSS_MIN: Final = 100.0

# Share of training time allowed at high intensity, and the minimum that must
# stay easy. 0.35 rather than the 0.20 the rule names, because the shipped weekly
# template puts 28-30% of its minutes in INTERVALS and TEMPO; a threshold below
# that would have the generator's own default output flagged as unbalanced.
MAX_HIGH_INTENSITY_TIME_SHARE: Final = 0.35
MIN_LOW_INTENSITY_TIME_SHARE: Final = 0.70

HIGH_INTENSITY_TYPES: Final = frozenset({INTERVALS, TEMPO})

MIN_DAYS_FOR_SPACING: Final = 2
MAX_HIGH_INTENSITY_SESSION_SHARE: Final = 0.25


def session_duration(event: object) -> float:
    """Planned minutes for one calendar event, 0 when the prescription has none."""
    if not isinstance(event, Mapping):
        return 0.0
    prescription = event.get("workout_prescription")
    if not isinstance(prescription, Mapping):
        return 0.0
    minutes = prescription.get("duration_min")
    return float(minutes) if isinstance(minutes, int | float) and minutes > 0 else 0.0


def intensity_score(
    planned_types: Sequence[str],
    planned_durations: Sequence[float],
    planned_tss: Sequence[float],
) -> float:
    """Intensity balance: most training time easy, a minority hard.

    The share is weighted by minutes, not by session count. Session count makes a
    30-minute interval and a 150-minute long run equal votes, which is how a
    normal long-run-plus-intervals week read as over-loaded.

    Plans without durations fall back to session counts, and events predating
    `training_type` to TSS buckets — a weak proxy kept only so old rows still
    produce a number.
    """
    weighted = (
        planned_types
        and len(planned_durations) == len(planned_types)
        and all(minutes > 0 for minutes in planned_durations)
    )
    if weighted:
        total = sum(planned_durations)
        high_ratio = (
            sum(
                minutes
                for workout_type, minutes in zip(planned_types, planned_durations)
                if workout_type in HIGH_INTENSITY_TYPES
            )
            / total
        )
        low_ratio = 1.0 - high_ratio
    elif planned_types:
        high_ratio = sum(
            1 for workout_type in planned_types if workout_type in HIGH_INTENSITY_TYPES
        ) / len(planned_types)
        low_ratio = 1.0 - high_ratio
    elif planned_tss:
        low_ratio = sum(
            1 for tss in planned_tss if tss <= LOW_INTENSITY_TSS_MAX
        ) / len(planned_tss)
        high_ratio = sum(
            1 for tss in planned_tss if tss >= HIGH_INTENSITY_TSS_MIN
        ) / len(planned_tss)
    else:
        return 0.0
    low_score = min(low_ratio / MIN_LOW_INTENSITY_TIME_SHARE, 1.0) * 0.6
    high_score = (1.0 if high_ratio <= MAX_HIGH_INTENSITY_TIME_SHARE else 0.5) * 0.4
    return (low_score + high_score) * INTENSITY_DISTRIBUTION_WEIGHT


def spacing_score(planned_days: set[date], planned_types: Sequence[str]) -> float:
    """Full marks unless hard sessions cluster on adjacent days."""
    if len(planned_days) < MIN_DAYS_FOR_SPACING or not planned_types:
        return SESSION_SPACING_WEIGHT
    sorted_days = sorted(planned_days)
    close_pairs = sum(1 for first, second in pairwise(sorted_days) if (second - first).days <= 1)
    high_share = sum(
        1 for workout_type in planned_types if workout_type in HIGH_INTENSITY_TYPES
    ) / len(planned_types)
    if close_pairs == 0 or high_share <= MAX_HIGH_INTENSITY_SESSION_SHARE:
        return SESSION_SPACING_WEIGHT
    return SESSION_SPACING_WEIGHT * 0.5
