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
    return [
        day.day_offset
        for day in plan
        if day.workout_type in {"long", "tempo", "intervals"}
    ]


def test_weekly_distance_plan_has_rest_and_real_pace_based_sessions() -> None:
    plan = generate_weekly_plan(
        42000.0,
        WeekPlanOptions(training_paces=TRAINING_PACES),
    )

    assert len(plan) == 7
    assert [day.day_offset for day in plan] == list(range(7))
    assert sum(1 for day in plan if day.workout_type == "rest") >= 1
    assert all(
        day.target_distance_m is None if day.workout_type == "rest" else day.target_distance_m > 0
        for day in plan
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
