from domain.workout.plan_generator import (
    PlannedDay,
    WeekPlanOptions,
    generate_weekly_plan,
)

TRAINING_PACES = {
    "easy": {"min": 340.0, "max": 390.0},
    "threshold": {"min": 270.0, "max": 285.0},
    "interval": {"min": 245.0, "max": 260.0},
}


def _hard_days(plan: list[PlannedDay]) -> list[int]:
    return [day.day_offset for day in plan if day.workout_type in {"long", "tempo", "intervals"}]


def test_weekly_distance_plan_has_rest_and_real_pace_based_sessions() -> None:
    plan = generate_weekly_plan(
        42000.0,
        WeekPlanOptions(training_paces=TRAINING_PACES),
    )

    assert len(plan) == 7
    assert [day.day_offset for day in plan] == list(range(7))
    assert sum(1 for day in plan if day.workout_type == "rest") >= 1
    assert all(day.target_distance_m is None for day in plan if day.workout_type == "rest")
    assert all(
        isinstance(day.target_distance_m, float) and day.target_distance_m > 0
        for day in plan
        if day.workout_type != "rest"
    )
    assert all(day.duration_min > 0 for day in plan if day.workout_type != "rest")
    assert all(
        day.pace_min_s_km is not None and day.pace_max_s_km is not None
        for day in plan
        if day.workout_type != "rest"
    )
    assert not set(_hard_days(plan)) & {day + 1 for day in _hard_days(plan)}


def test_rest_days_and_long_run_preference_are_respected() -> None:
    plan = generate_weekly_plan(
        42000.0,
        WeekPlanOptions(
            training_paces=TRAINING_PACES,
            rest_days=2,
            preferred_days_off=[0, 5],
        ),
    )

    assert sum(1 for day in plan if day.workout_type == "rest") == 2
    assert plan[0].workout_type == "rest"
    assert plan[5].workout_type == "rest"
    assert plan[6].workout_type == "long"


def test_zero_rest_days_keeps_all_seven_days_available() -> None:
    plan = generate_weekly_plan(
        42000.0,
        WeekPlanOptions(rest_days=0, training_paces=TRAINING_PACES),
    )

    assert len(plan) == 7
    assert all(day.workout_type != "rest" for day in plan)


def test_recovery_week_reduces_distance_and_cycle_repeats() -> None:
    weeks = [
        generate_weekly_plan(
            42000.0,
            WeekPlanOptions(week_number=week_number, training_paces=TRAINING_PACES),
        )
        for week_number in range(8)
    ]
    distances = [sum(day.target_distance_m or 0 for day in week) for week in weeks]

    assert distances[3] < distances[2]
    assert distances[4] > distances[3]
    assert distances[7] < distances[6]
    assert distances[7] == distances[3]


def test_session_time_over_athlete_limit_is_rejected() -> None:
    try:
        generate_weekly_plan(
            42000.0,
            WeekPlanOptions(
                rest_days=6,
                preferred_days_off=[0, 1, 2, 3, 4, 5],
                max_session_duration_min=30,
                training_paces=TRAINING_PACES,
            ),
        )
    except ValueError as error:
        assert str(error) == "计划中的单次跑步时长超过运动员设置的上限"
    else:
        raise AssertionError("a plan must not exceed the athlete's session time limit")


def test_missing_actual_pace_is_rejected() -> None:
    try:
        generate_weekly_plan(42000.0)
    except ValueError as error:
        assert "缺少有效跑步配速" in str(error)
    else:
        raise AssertionError("plan without a real pace source must be rejected")


def test_non_positive_weekly_distance_is_rejected() -> None:
    try:
        generate_weekly_plan(0.0, WeekPlanOptions(training_paces=TRAINING_PACES))
    except ValueError as error:
        assert str(error) == "目标周跑量必须大于零"
    else:
        raise AssertionError("zero weekly distance must be rejected")


MARATHON_PACES = {
    **TRAINING_PACES,
    "marathon": {"min": 295.0, "max": 320.0},
}


def test_long_run_uses_marathon_pace_for_endurance_races_in_build_phase() -> None:
    plan = generate_weekly_plan(
        60000.0,
        WeekPlanOptions(
            training_paces=MARATHON_PACES,
            race_distance_m=42195.0,
            phase_name="build",
        ),
    )
    long_days = [day for day in plan if day.workout_type == "long"]
    assert long_days, "长距离课必须存在"
    assert all(day.pace_min_s_km == 295 for day in long_days)
    assert all(day.pace_max_s_km == 320 for day in long_days)


def test_long_run_keeps_easy_pace_for_base_phase_and_short_races() -> None:
    for phase_name, race_distance_m in (("base", 42195.0), ("build", 10000.0)):
        plan = generate_weekly_plan(
            42000.0,
            WeekPlanOptions(
                training_paces=MARATHON_PACES,
                race_distance_m=race_distance_m,
                phase_name=phase_name,
            ),
        )
        long_days = [day for day in plan if day.workout_type == "long"]
        assert long_days, "长距离课必须存在"
        assert all(day.pace_min_s_km == 340 for day in long_days)
        assert all(day.pace_max_s_km == 390 for day in long_days)
