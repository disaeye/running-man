"""Personal records (PRs) — pure functions computed on demand.

Distance PRs (running): fastest estimated time at standard distances, derived
from activity_summary distance_m + duration_s using average-pace extrapolation.

Power PRs (cycling): highest sustained power over standard durations, derived
from activity_streams power samples (assumed 1 Hz sampling).

No DB access here — pass plain dicts in, get plain dicts out.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date, datetime
from decimal import Decimal
from typing import TypedDict

from domain.sports import is_riding, is_running

# Standard running distances (metres): 1K / 5K / 10K / half / full marathon.
RUN_DISTANCES_M: tuple[int, ...] = (1000, 5000, 10000, 21097, 42195)
# Standard cycling durations (seconds): 1 / 5 / 20 / 60 minutes.
RIDE_DURATIONS_S: tuple[int, ...] = (60, 300, 1200, 3600)

# Sport classification mirrors apps/web/lib/sport-config.ts (Task 8).
#
# Both are case- and separator-insensitive via `domain.sports`, which is the
# single source of truth for this. These two functions used to hold their own
# sets spelled the way the Intervals.icu API writes sports ("Run"), while the
# sync stores the canonical lowercase key ("run") — so a synced run was never
# recognised here. Personal records, intensity distribution, gear assignment
# and race prediction all silently returned empty for an athlete with 28 runs.
# Spelled `is_running`/`is_riding` to match the domain module they delegate to;
# the old names are kept as aliases so this file's callers do not have to change
# in the same commit.


class PersonalRecord(TypedDict):
    """One best-effort result.

    For distance PRs (category="distance"): distance_m is set, duration_s is
    None, best_value is the estimated finish time in seconds (lower = better).

    For power PRs (category="power"): duration_s is set, distance_m is None,
    best_value is the average watts (higher = better).
    """

    category: str
    distance_m: int | None
    duration_s: int | None
    best_value: float
    activity_id: str
    date: str  # ISO date (YYYY-MM-DD)


def is_run_sport(sport: str | None) -> bool:
    """Alias of `domain.sports.is_running`, kept for existing callers."""
    return is_running(sport)


def is_ride_sport(sport: str | None) -> bool:
    """Alias of `domain.sports.is_riding`, kept for existing callers."""
    return is_riding(sport)


def compute_run_prs(activities: Sequence[Mapping[str, object]]) -> list[PersonalRecord]:
    """Top-N distance PRs: for each standard distance, the fastest estimated time.

    An activity qualifies for distance D if its total distance_m >= D. The
    estimated time at distance D assumes constant average pace:
        estimated_time_s = duration_s * D / distance_m
    The minimum estimated_time_s across all qualifying activities wins.
    """
    prs: list[PersonalRecord] = []
    for target_distance in RUN_DISTANCES_M:
        best_value: float | None = None
        best_act: Mapping[str, object] | None = None
        for act in activities:
            distance_m = _as_float(act.get("distance_m"))
            duration_s = _as_float(act.get("duration_s"))
            if distance_m is None or duration_s is None:
                continue
            if distance_m < target_distance or duration_s <= 0:
                continue
            estimated_time = duration_s * target_distance / distance_m
            if best_value is None or estimated_time < best_value:
                best_value = estimated_time
                best_act = act
        if best_act is not None and best_value is not None:
            prs.append(_distance_record(target_distance, best_value, best_act))
    return prs


def compute_ride_prs(
    activities_with_power: Mapping[str, tuple[Mapping[str, object], Sequence[float]]],
) -> list[PersonalRecord]:
    """Top-N power PRs: for each standard duration, the highest sustained watts.

    ``activities_with_power`` maps activity_id -> (summary_dict, power_samples).
    Power samples are assumed to be 1 Hz (one sample per second, ordered by
    sample_time). Short activities that don't cover the window are skipped.
    """
    prs: list[PersonalRecord] = []
    for window_s in RIDE_DURATIONS_S:
        best_value: float | None = None
        best_act: Mapping[str, object] | None = None
        for _activity_id, (act, powers) in activities_with_power.items():
            peak = max_sustained_power(powers, window_s)
            if peak is None:
                continue
            if best_value is None or peak > best_value:
                best_value = peak
                best_act = act
        if best_act is not None and best_value is not None:
            prs.append(_power_record(window_s, best_value, best_act))
    return prs


def max_sustained_power(powers: Sequence[float], window_s: int) -> float | None:
    """Maximum rolling average over a sliding window of ``window_s`` samples.

    Assumes 1 Hz sampling. Returns None if fewer than ``window_s`` samples are
    available. Uses an O(n) running-sum update instead of re-summing each window.
    """
    if window_s <= 0 or len(powers) < window_s:
        return None
    running_sum = sum(powers[:window_s])
    best_sum = running_sum
    for index in range(window_s, len(powers)):
        running_sum += powers[index] - powers[index - window_s]
        best_sum = max(best_sum, running_sum)
    return best_sum / window_s


# ---------------------------------------------------------------------------
# Internal builders — keep the public functions free of dict-shaping noise.
# ---------------------------------------------------------------------------
def _distance_record(
    distance_m: int, best_value: float, act: Mapping[str, object]
) -> PersonalRecord:
    return PersonalRecord(
        category="distance",
        distance_m=distance_m,
        duration_s=None,
        best_value=best_value,
        activity_id=str(act["activity_id"]),
        date=_iso_date(act.get("start_time")),
    )


def _power_record(duration_s: int, best_value: float, act: Mapping[str, object]) -> PersonalRecord:
    return PersonalRecord(
        category="power",
        distance_m=None,
        duration_s=duration_s,
        best_value=best_value,
        activity_id=str(act["activity_id"]),
        date=_iso_date(act.get("start_time")),
    )


def _iso_date(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _as_float(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, int | float | Decimal | str):
        try:
            return float(value)
        except ValueError:
            return None
    return None
