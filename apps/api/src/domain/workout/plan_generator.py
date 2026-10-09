from dataclasses import dataclass
from typing import Final

from domain.workout.prescription import (
    EASY,
    INTERVALS,
    LONG,
    PACE_KEYS,
    RECOVERY,
    REST,
    TEMPO,
    description,
    duration_min,
    workout_segments,
)

HARD_WORKOUTS: Final[set[str]] = {LONG, TEMPO, INTERVALS}
TSS_WEIGHTS: Final[dict[str, float]] = {LONG: 0.35, INTERVALS: 0.20, TEMPO: 0.20}
TSS_PER_MINUTE: Final[dict[str, float]] = {
    REST: 0.0,
    EASY: 0.75,
    LONG: 0.85,
    TEMPO: 1.20,
    INTERVALS: 1.35,
    RECOVERY: 0.55,
}
MAX_WEEKDAY = 6


@dataclass(frozen=True)
class PlannedDay:
    day_offset: int
    workout_type: str
    target_tss: float
    duration_min: int
    description: str
    workout_segments: tuple[dict[str, object], ...] = ()
    pace_min_s_km: int | None = None
    pace_max_s_km: int | None = None


def generate_weekly_plan(
    target_weekly_tss: float,
    sport: str = "Run",
    rest_days: int = 1,
    preferred_days_off: list[int] | None = None,
    training_paces: dict[str, dict[str, float]] | None = None,
    week_number: int = 0,
    progression_weeks: int = 3,
    max_session_duration_min: int = 180,
) -> list[PlannedDay]:
    target = max(target_weekly_tss, 0.0)
    max_session_duration_min = min(max(max_session_duration_min, 1), 600)
    rest_count = min(max(rest_days, 0), 6)
    preferred = _valid_days(preferred_days_off)
    if target == 0.0:
        return [_planned_day(day, REST, 0.0, sport) for day in range(7)]

    long_day, rest_before_long = _weekend_structure(preferred, rest_count)
    rest_day_set = _rest_days(preferred, rest_count, long_day, rest_before_long)
    if long_day in rest_day_set:
        long_day = 5 if 5 not in rest_day_set else 6
    workout_types: dict[int, str] = {day: REST for day in rest_day_set}
    workout_types[long_day] = LONG

    interval_day = _available_day([1, 2, 0, 3, 4], workout_types)
    if interval_day is not None:
        workout_types[interval_day] = INTERVALS
    tempo_day = _available_day([3, 2, 4, 0, 1], workout_types)
    if tempo_day is not None:
        workout_types[tempo_day] = TEMPO

    easy_toggle = True
    for day in range(7):
        if day not in workout_types:
            workout_types[day] = EASY if easy_toggle else RECOVERY
            easy_toggle = not easy_toggle

    progression_index = week_number % max(progression_weeks + 1, 1)
    progressed = target * min(1.0 + 0.025 * progression_index, 1.2)
    is_recovery_week = progression_weeks > 0 and (week_number + 1) % (progression_weeks + 1) == 0
    tss_by_day = _target_tss_by_day(
        workout_types, progressed * (0.7 if is_recovery_week else 1.0)
    )
    return [
        _planned_day(
            day,
            workout_types[day],
            min(tss_by_day[day], max_session_duration_min * TSS_PER_MINUTE[workout_types[day]]),
            sport,
            training_paces,
            max_session_duration_min,
        )
        for day in range(7)
    ]


def _valid_days(days: list[int] | None) -> list[int]:
    if days is None:
        return []
    return sorted({day for day in days if 0 <= day <= MAX_WEEKDAY})


def _weekend_structure(preferred_days: list[int], rest_count: int) -> tuple[int, int]:
    if rest_count and 5 in preferred_days:
        return 6, 5
    if rest_count and 6 in preferred_days:
        return 5, 4
    if rest_count and 4 in preferred_days:
        return 6, 4
    if rest_count >= 2:
        return 5, 4
    return 6, 5


def _rest_days(
    preferred_days: list[int], rest_count: int, long_day: int, rest_before_long: int
) -> set[int]:
    preferred_rest = [day for day in preferred_days if day != long_day][:rest_count]
    fallback_rest_days = [rest_before_long, 0, 2, 4, 6, 3, 1]
    remaining_rest = [
        day
        for day in fallback_rest_days
        if day != long_day and day not in preferred_rest
    ][: max(rest_count - len(preferred_rest), 0)]
    rest = preferred_rest + remaining_rest
    return set(rest[:rest_count])


def _available_day(candidates: list[int], workout_types: dict[int, str]) -> int | None:
    fallback: int | None = None
    for day in candidates:
        if day in workout_types:
            continue
        if fallback is None:
            fallback = day
        if not _has_hard_neighbor(day, workout_types):
            return day
    return fallback


def _has_hard_neighbor(day: int, workout_types: dict[int, str]) -> bool:
    return any(workout_types.get(neighbor) in HARD_WORKOUTS for neighbor in [day - 1, day + 1])


def _target_tss_by_day(workout_types: dict[int, str], target_weekly_tss: float) -> dict[int, float]:
    tss_by_day = {day: 0.0 for day in range(7)}
    weights: dict[int, float] = {}
    flexible_days: list[int] = []
    for day, workout_type in workout_types.items():
        if workout_type == REST:
            continue
        if workout_type in TSS_WEIGHTS:
            weights[day] = TSS_WEIGHTS[workout_type]
        else:
            flexible_days.append(day)
    fixed_weight = sum(weights.values())
    if flexible_days:
        flexible_weight = max(0.0, 1.0 - fixed_weight) / len(flexible_days)
        weights.update({day: flexible_weight for day in flexible_days})
    elif fixed_weight > 0:
        weights = {day: weight / fixed_weight for day, weight in weights.items()}
    for day, weight in weights.items():
        tss_by_day[day] = target_weekly_tss * weight
    _cap_flexible_days(tss_by_day, workout_types, target_weekly_tss)
    return tss_by_day


def _cap_flexible_days(
    tss_by_day: dict[int, float], workout_types: dict[int, str], target_weekly_tss: float
) -> None:
    threshold = target_weekly_tss / 7 * 0.8
    surplus = 0.0
    for day, workout_type in workout_types.items():
        if workout_type not in (EASY, RECOVERY) or tss_by_day[day] <= threshold:
            continue
        surplus += tss_by_day[day] - threshold
        tss_by_day[day] = threshold
    hard_days = [day for day, kind in workout_types.items() if kind in HARD_WORKOUTS]
    hard_tss = sum(tss_by_day[day] for day in hard_days)
    if surplus and hard_tss:
        for day in hard_days:
            tss_by_day[day] += surplus * (tss_by_day[day] / hard_tss)


def _planned_day(
    day: int,
    workout_type: str,
    target_tss: float,
    sport: str,
    training_paces: dict[str, dict[str, float]] | None = None,
    max_session_duration_min: int = 180,
) -> PlannedDay:
    duration = min(duration_min(workout_type, target_tss, TSS_PER_MINUTE), max_session_duration_min)
    pace_key = PACE_KEYS.get(workout_type)
    pace = training_paces.get(pace_key) if training_paces and pace_key else None
    pace_min = round(pace["min"]) if pace else None
    pace_max = round(pace["max"]) if pace else None
    return PlannedDay(
        day_offset=day,
        workout_type=workout_type,
        target_tss=target_tss,
        duration_min=duration,
        description=description(workout_type, sport),
        workout_segments=workout_segments(workout_type, duration, pace_min, pace_max),
        pace_min_s_km=pace_min,
        pace_max_s_km=pace_max,
    )
