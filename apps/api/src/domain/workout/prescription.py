from dataclasses import dataclass
from typing import Final

from domain.workout.prescription_science import science_fields

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

DEFAULT_REPETITIONS = 6
DEFAULT_RECOVERY_MIN = 2
STRUCTURED_MIN_DURATION_MIN = 25


@dataclass(frozen=True, slots=True)
class SegmentOptions:
    distance_m: float = 0.0
    pace_min: int | None = None
    pace_max: int | None = None
    rpe_min: int = 2
    rpe_max: int = 4
    repetitions: int = 1
    sets: int = 1
    recovery_duration_s: float | None = None
    recovery_distance_m: float | None = None


def workout_segments(
    workout_type: str, duration_min: int, pace_min: int | None, pace_max: int | None
) -> tuple[dict[str, object], ...]:
    """Generate expanded segments; one row per work bout and recovery bout."""
    if workout_type == REST or duration_min <= 0:
        return ()
    mean_pace = _mean_pace(pace_min, pace_max)
    if workout_type in (TEMPO, INTERVALS) and duration_min >= STRUCTURED_MIN_DURATION_MIN:
        if mean_pace is None:
            raise ValueError("缺少有效跑步配速，无法生成有距离目标的训练计划")
        warmup_min = min(15, max(5, round(duration_min * 0.2)))
        cooldown_target = min(10, max(5, round(duration_min * 0.2)))
        quality_min = max(10, duration_min - warmup_min - cooldown_target)
        cooldown_min = duration_min - warmup_min - quality_min
        warmup = _segment(workout_type, "warmup", "warmup", warmup_min * 60.0, SegmentOptions())
        cooldown = _segment(
            workout_type, "cooldown", "cooldown", cooldown_min * 60.0, SegmentOptions()
        )
        if workout_type == TEMPO:
            quality_s = quality_min * 60.0
            work = _segment(
                workout_type,
                "threshold",
                "work",
                quality_s,
                SegmentOptions(
                    distance_m=quality_s / mean_pace * 1000.0,
                    pace_min=pace_min,
                    pace_max=pace_max,
                    rpe_min=6,
                    rpe_max=8,
                ),
            )
            return (warmup, work, cooldown)
        reps = DEFAULT_REPETITIONS
        recovery_s = DEFAULT_RECOVERY_MIN * 60.0
        work_total_s = quality_min * 60.0 - recovery_s * (reps - 1)
        if work_total_s <= 0:
            raise ValueError("间歇课程时长不足以容纳轮数与恢复")
        work_s = work_total_s / reps
        work_distance_m = work_s / mean_pace * 1000.0
        segments: list[dict[str, object]] = [warmup]
        for index in range(reps):
            segments.append(
                _segment(
                    workout_type,
                    "intervals",
                    "work",
                    work_s,
                    SegmentOptions(
                        distance_m=work_distance_m,
                        pace_min=pace_min,
                        pace_max=pace_max,
                        rpe_min=8,
                        rpe_max=9,
                        recovery_duration_s=recovery_s,
                        recovery_distance_m=0.0,
                    ),
                )
            )
            if index < reps - 1:
                segments.append(
                    _segment(
                        workout_type,
                        "recovery",
                        "recovery",
                        recovery_s,
                        SegmentOptions(
                            recovery_duration_s=recovery_s,
                            recovery_distance_m=0.0,
                        ),
                    )
                )
        segments.append(cooldown)
        return tuple(segments)

    duration_s = duration_min * 60.0
    distance_m = duration_s / mean_pace * 1000.0 if mean_pace else 0.0
    return (
        _segment(
            workout_type,
            workout_type,
            "work",
            duration_s,
            SegmentOptions(
                distance_m=distance_m,
                pace_min=pace_min,
                pace_max=pace_max,
                rpe_min=2 if workout_type == RECOVERY else 3,
                rpe_max=4 if workout_type == RECOVERY else 5,
            ),
        ),
    )


def _segment(
    workout_type: str,
    segment_type: str,
    role: str,
    duration_s: float,
    options: SegmentOptions,
) -> dict[str, object]:
    science = science_fields(workout_type, role)
    quality_target = science["quality_target"]
    assert isinstance(quality_target, dict)
    quality_target["work_distance_m"] = round(options.distance_m if role == "work" else 0.0, 1)
    quality_target["work_duration_s"] = round(duration_s if role == "work" else 0.0, 1)
    quality_target["target_repetitions"] = options.repetitions if role == "work" else 1
    return {
        "type": segment_type,
        "role": role,
        "duration_min": round(duration_s / 60.0, 2),
        "duration_s": round(duration_s, 1),
        "distance_m": round(options.distance_m, 1),
        "pace_min_s_km": options.pace_min,
        "pace_max_s_km": options.pace_max,
        "rpe_min": options.rpe_min,
        "rpe_max": options.rpe_max,
        "repetitions": options.repetitions,
        "sets": options.sets,
        "recovery_duration_s": options.recovery_duration_s,
        "recovery_distance_m": options.recovery_distance_m,
        "intensity_domain": science["intensity_domain"],
        "source_refs": science["source_refs"],
        "rationale": science["rationale"],
        "target_adaptation": science["target_adaptation"],
        "quality_target": quality_target,
        "target": {},
        "measured": {},
        **science,
    }


def session_distance_m(
    segments: tuple[dict[str, object], ...] | list[dict[str, object]],
    pace_min_s_km: int | None,
    pace_max_s_km: int | None,
) -> float | None:
    """The distance a session covers, from its steps and their pace targets."""
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


def _mean_pace(pace_min: int | None, pace_max: int | None) -> float | None:
    return _midpoint_pace({}, pace_min, pace_max)


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
