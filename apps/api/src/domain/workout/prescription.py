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


def workout_segments(
    workout_type: str, duration_min: int, pace_min: int | None, pace_max: int | None
) -> tuple[dict[str, object], ...]:
    if workout_type == REST or duration_min <= 0:
        return ()
    if workout_type in (TEMPO, INTERVALS) and duration_min >= 25:
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
            quality["repetitions"] = 6
            quality["recovery_min"] = 2
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
