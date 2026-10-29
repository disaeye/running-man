"""Training prescriptions: the steps of one planned session.

A step says how long a part of the session lasts, or how far it covers. Both
are needed: a warm-up is naturally a duration ("10 minutes"), while the work
part of an interval session is naturally a distance ("5 × 1000 m"). The demo
pages print whichever the step carries.

Every step also carries the target that defines "done": a pace range, a heart
rate range, or a perceived exertion range. A step without any target cannot
be judged against what the athlete actually did, so the plan-versus-actual
comparison has nothing to say about it.
"""

from typing import Final

REST = "rest"
EASY = "easy"
LONG = "long"
TEMPO = "tempo"
INTERVALS = "intervals"
RECOVERY = "recovery"

MAX_WEEKDAY = 6
PACE_KEYS: Final[dict[str, str]] = {
    EASY: "easy",
    RECOVERY: "easy",
    LONG: "easy",
    TEMPO: "threshold",
    INTERVALS: "interval",
}

# The interval repetition the generator uses, and the recovery it inserts
# between them.
DEFAULT_REPETITIONS = 6
DEFAULT_RECOVERY_MIN = 2

# A step of a session longer than this gets a warm-up and a cool-down around
# it; a shorter session is one continuous block.
STRUCTURED_MIN_DURATION_MIN = 25


def workout_segments(
    workout_type: str, duration_min: int, pace_min: int | None, pace_max: int | None
) -> tuple[dict[str, object], ...]:
    """The steps of a session of the given type and length.

    The result is a tuple of plain dicts so it can be stored as JSON next to
    the calendar event.
    """
    if workout_type == REST or duration_min <= 0:
        return ()
    if workout_type in (TEMPO, INTERVALS) and duration_min >= STRUCTURED_MIN_DURATION_MIN:
        warmup_min = min(15, max(5, round(duration_min * 0.2)))
        cooldown_target = min(10, max(5, round(duration_min * 0.2)))
        quality_min = max(10, duration_min - warmup_min - cooldown_target)
        quality: dict[str, object] = {
            "type": "threshold" if workout_type == TEMPO else "intervals",
            "duration_min": quality_min,
            "pace_min_s_km": pace_min,
            "pace_max_s_km": pace_max,
            "rpe_min": 6,
            "rpe_max": 8,
        }
        if workout_type == INTERVALS:
            quality["repetitions"] = DEFAULT_REPETITIONS
            quality["recovery_min"] = DEFAULT_RECOVERY_MIN
        return (
            {"type": "warmup", "duration_min": warmup_min, "rpe_min": 2, "rpe_max": 4},
            quality,
            {
                "type": "cooldown",
                "duration_min": duration_min - warmup_min - quality_min,
                "rpe_min": 2,
                "rpe_max": 4,
            },
        )
    return (
        {
            "type": workout_type,
            "duration_min": duration_min,
            "pace_min_s_km": pace_min,
            "pace_max_s_km": pace_max,
            "rpe_min": 2 if workout_type == RECOVERY else 3,
            "rpe_max": 4 if workout_type == RECOVERY else 5,
        },
    )


def session_distance_m(
    segments: tuple[dict[str, object], ...] | list[dict[str, object]],
    pace_min_s_km: int | None,
    pace_max_s_km: int | None,
) -> float | None:
    """The distance a session covers, from its steps and their pace targets.

    A step with a distance target contributes that distance. A step with only
    a duration contributes the distance the athlete covers at the midpoint of
    its pace range.

    ``None`` when no step carries a distance or a pace: a session with no
    distance target has no distance, and multiplying a duration by nothing
    would invent one.
    """
    total = 0.0
    known = False
    for segment in segments:
        distance = segment.get("distance_m")
        if isinstance(distance, int | float) and distance > 0:
            total += float(distance)
            known = True
            continue
        duration = segment.get("duration_min")
        if not isinstance(duration, int | float) or duration <= 0:
            continue
        pace = _midpoint_pace(segment, pace_min_s_km, pace_max_s_km)
        if pace is None:
            continue
        total += duration / 60.0 * pace
        known = True
    if not known:
        return None
    return round(total, 1)


def _midpoint_pace(
    segment: dict[str, object],
    fallback_min: int | None,
    fallback_max: int | None,
) -> float | None:
    """Seconds per kilometre for one step.

    The step's own pace range wins; the session's range is the fallback for a
    step that only states a duration.
    """
    step_min = segment.get("pace_min_s_km")
    step_max = segment.get("pace_max_s_km")
    low = step_min if isinstance(step_min, int | float) else fallback_min
    high = step_max if isinstance(step_max, int | float) else fallback_max
    if isinstance(low, int | float) and isinstance(high, int | float):
        return (float(low) + float(high)) / 2.0
    if isinstance(low, int | float):
        return float(low)
    if isinstance(high, int | float):
        return float(high)
    return None


def duration_min(workout_type: str, target_tss: float, rates: dict[str, float]) -> int:
    rate = rates[workout_type]
    if rate == 0 or target_tss <= 0:
        return 0
    return max(15, round(target_tss / rate))


def description(workout_type: str, sport: str) -> str:
    sport_name = sport.strip().lower()
    if sport_name in {"run", "trail_run", "trailrun", "virtual_run", "virtualrun"}:
        return {
            REST: "休息日",
            LONG: "长距离跑",
            TEMPO: "节奏跑",
            INTERVALS: "间歇跑",
            RECOVERY: "恢复跑",
            EASY: "轻松跑",
        }[workout_type]
    sport_label = {
        "ride": "骑行",
        "bike": "骑行",
        "virtual_ride": "室内骑行",
        "swim": "游泳",
        "workout": "力量训练",
    }.get(sport_name, "其他运动")
    if workout_type == REST:
        return "休息日"
    if workout_type == LONG:
        return f"{sport_label} 长距离训练"
    if workout_type == TEMPO:
        return f"{sport_label} 节奏训练"
    if workout_type == INTERVALS:
        return f"{sport_label} 间歇训练"
    if workout_type == RECOVERY:
        return f"{sport_label} 恢复训练"
    return f"{sport_label} 轻松训练"
