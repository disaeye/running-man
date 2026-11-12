from dataclasses import dataclass
from datetime import date
from typing import Final

from domain.workout.plan_evidence import (
    PlanScience,
    format_plan_expression,
    session_science,
)
from domain.workout.plan_segments import enrich_plan_segments
from domain.workout.prescription import (
    EASY,
    INTERVALS,
    LONG,
    PACE_KEYS,
    RECOVERY,
    REST,
    TEMPO,
    description,
    session_distance_m,
    workout_segments,
)

HARD_WORKOUTS: Final[set[str]] = {LONG, TEMPO, INTERVALS}
DISTANCE_WEIGHTS: Final[dict[str, float]] = {LONG: 0.35, INTERVALS: 0.20, TEMPO: 0.20}
MAX_WEEKDAY = 6


@dataclass(frozen=True)
class PlannedDay:
    day_offset: int
    workout_type: str
    target_distance_m: float | None
    duration_min: int
    description: str
    workout_segments: tuple[dict[str, object], ...] = ()
    pace_min_s_km: int | None = None
    pace_max_s_km: int | None = None
    science: PlanScience | None = None
    display_line: str | None = None


@dataclass(frozen=True)
class WeekPlanOptions:
    """一周训练安排所需的休息日、配速和时间限制。"""

    sport: str = "Run"
    rest_days: int = 1
    preferred_days_off: list[int] | None = None
    training_paces: dict[str, dict[str, float]] | None = None
    week_number: int = 0
    progression_weeks: int = 3
    max_session_duration_min: int = 180
    long_run_day: int | None = None
    pace_effective_from: str | None = None
    pace_source_refs: tuple[str, ...] = ()
    pace_anchors: dict[str, dict[str, object]] | None = None
    plan_date: date | None = None
    # 比赛距离与阶段名：半马及以上的 build/peak 阶段长距离课改用马拉松配速。
    race_distance_m: float | None = None
    phase_name: str | None = None


def generate_weekly_plan(
    target_weekly_distance_m: float,
    options: WeekPlanOptions | None = None,
) -> list[PlannedDay]:
    """按真实周跑量与实际配速安排七天的跑步训练。"""
    if target_weekly_distance_m <= 0:
        raise ValueError("目标周跑量必须大于零")
    settings = options or WeekPlanOptions()
    rest_count = min(max(settings.rest_days, 0), 6)
    preferred = _valid_days(settings.preferred_days_off)
    max_session_duration_min = min(max(settings.max_session_duration_min, 1), 600)
    long_day = settings.long_run_day

    if long_day is None or long_day not in range(7):
        long_day, rest_before_long = _weekend_structure(preferred, rest_count)
    else:
        rest_before_long = (long_day - 1) % 7

    rest_day_set = _rest_days(preferred, rest_count, long_day, rest_before_long)
    if long_day in rest_day_set:
        long_day = 5 if 5 not in rest_day_set else 6
    if settings.long_run_day is not None and 0 <= settings.long_run_day <= MAX_WEEKDAY:
        long_day = settings.long_run_day
        rest_day_set = _rest_days(preferred, rest_count, long_day, rest_before_long)
        rest_day_set.discard(long_day)

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

    progression_index = settings.week_number % max(settings.progression_weeks + 1, 1)
    recovery_week = (
        settings.progression_weeks > 0
        and settings.week_number > 0
        and progression_index == settings.progression_weeks
    )
    progressed = target_weekly_distance_m * min(1.0 + 0.025 * progression_index, 1.2)
    target = progressed * (0.7 if recovery_week else 1.0)
    distance_by_day = _target_distance_by_day(workout_types, target)
    return [
        _planned_day(
            day,
            workout_types[day],
            distance_by_day[day],
            settings,
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
        day for day in fallback_rest_days if day != long_day and day not in preferred_rest
    ][: max(rest_count - len(preferred_rest), 0)]
    return set((preferred_rest + remaining_rest)[:rest_count])


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


def _target_distance_by_day(
    workout_types: dict[int, str], target_weekly_distance_m: float
) -> dict[int, float]:
    distances = {day: 0.0 for day in range(7)}
    weights: dict[int, float] = {}
    flexible_days: list[int] = []
    for day, workout_type in workout_types.items():
        if workout_type == REST:
            continue
        if workout_type in DISTANCE_WEIGHTS:
            weights[day] = DISTANCE_WEIGHTS[workout_type]
        else:
            flexible_days.append(day)
    fixed_weight = sum(weights.values())
    if flexible_days:
        flexible_weight = max(0.0, 1.0 - fixed_weight) / len(flexible_days)
        weights.update({day: flexible_weight for day in flexible_days})
    elif fixed_weight > 0:
        weights = {day: weight / fixed_weight for day, weight in weights.items()}
    for day, weight in weights.items():
        distances[day] = target_weekly_distance_m * weight
    _cap_flexible_days(distances, workout_types, target_weekly_distance_m)
    return distances


def _cap_flexible_days(
    distances: dict[int, float], workout_types: dict[int, str], target_weekly_distance_m: float
) -> None:
    threshold = target_weekly_distance_m / 7 * 0.8
    surplus = 0.0
    for day, workout_type in workout_types.items():
        if workout_type not in (EASY, RECOVERY) or distances[day] <= threshold:
            continue
        surplus += distances[day] - threshold
        distances[day] = threshold
    long_days = [day for day, kind in workout_types.items() if kind == LONG]
    if surplus and long_days:
        distances[long_days[0]] += surplus


def _long_run_pace_key(options: WeekPlanOptions) -> str:
    """长距离课的配速键：半马及以上在 build/peak 用马拉松配速，其余用轻松配速。"""
    if (
        options.race_distance_m is not None
        and options.race_distance_m >= 21097.5
        and options.phase_name in ("build", "peak")
    ):
        return "marathon"
    return "easy"


def _planned_day(
    day: int,
    workout_type: str,
    target_distance_m: float,
    options: WeekPlanOptions,
    max_session_duration_min: int,
) -> PlannedDay:
    if workout_type == REST:
        return PlannedDay(day, REST, None, 0, description(REST, options.sport))

    pace_key = _long_run_pace_key(options) if workout_type == LONG else PACE_KEYS.get(workout_type)
    if pace_key is None:
        raise ValueError(f"workout type has no training pace: {workout_type}")
    pace = options.training_paces.get(pace_key) if options.training_paces else None
    pace_min = round(pace["min"]) if pace else None
    pace_max = round(pace["max"]) if pace else None
    if pace_min is None or pace_max is None or pace_min <= 0 or pace_max < pace_min:
        raise ValueError("缺少有效跑步配速，无法生成有距离目标的训练计划")

    duration = round(target_distance_m / 1000 * ((pace_min + pace_max) / 2) / 60)
    if duration > max_session_duration_min:
        raise ValueError("计划中的单次跑步时长超过运动员设置的上限")
    duration = max(duration, 1)
    raw_segments = workout_segments(workout_type, duration, pace_min, pace_max)
    science = session_science(
        workout_type,
        duration,
        options.training_paces,
        pace_effective_from=options.pace_effective_from,
        pace_source_refs=options.pace_source_refs,
        pace_anchors=(options.pace_anchors or {}).get(pace_key),
    )
    segments = enrich_plan_segments(raw_segments, science, pace_min, pace_max)
    display_line = format_plan_expression(science, segments)
    actual_distance = session_distance_m(segments, pace_min, pace_max)
    return PlannedDay(
        day_offset=day,
        workout_type=workout_type,
        target_distance_m=actual_distance,
        duration_min=duration,
        description=description(workout_type, options.sport),
        workout_segments=segments,
        pace_min_s_km=pace_min,
        pace_max_s_km=pace_max,
        science=science,
        display_line=display_line,
    )
