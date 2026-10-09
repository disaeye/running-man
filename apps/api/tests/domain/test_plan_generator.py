from domain.workout.plan_generator import PlannedDay, generate_weekly_plan


def _high_tss_days(plan: list[PlannedDay], threshold: float) -> list[int]:
    return [day.day_offset for day in plan if day.target_tss > threshold]


def test_350_tss_week_has_rest_and_no_consecutive_over_100_tss() -> None:
    plan = generate_weekly_plan(350.0)

    assert len(plan) == 7
    assert [day.day_offset for day in plan] == list(range(7))
    assert 315.0 <= sum(day.target_tss for day in plan) <= 385.0
    assert sum(1 for day in plan if day.workout_type == "rest") >= 1
    assert not set(_high_tss_days(plan, 100.0)) & {day + 1 for day in _high_tss_days(plan, 100.0)}


def test_zero_tss_week_returns_all_rest_days() -> None:
    plan = generate_weekly_plan(0.0)

    assert len(plan) == 7
    assert all(day.workout_type == "rest" for day in plan)
    assert all(day.target_tss == 0.0 for day in plan)
    assert all(day.duration_min == 0 for day in plan)


def test_600_tss_week_spreads_load_without_single_day_overload() -> None:
    plan = generate_weekly_plan(600.0)

    assert len(plan) == 7
    assert 540.0 <= sum(day.target_tss for day in plan) <= 660.0
    assert max(day.target_tss for day in plan) <= 210.0
    assert sum(1 for day in plan if day.workout_type == "rest") >= 1
    assert plan[5].workout_type == "rest"
    assert plan[6].workout_type == "long"


def test_preferred_day_off_is_used_when_it_preserves_long_run_rule() -> None:
    plan = generate_weekly_plan(350.0, preferred_days_off=[5])

    assert plan[5].workout_type == "rest"
    assert plan[6].workout_type == "long"


def test_custom_rest_days_add_recovery_days() -> None:
    plan = generate_weekly_plan(300.0, rest_days=2, preferred_days_off=[0, 5])

    assert sum(1 for day in plan if day.workout_type == "rest") == 2
    assert plan[0].workout_type == "rest"
    assert plan[5].workout_type == "rest"


def test_zero_rest_days_keeps_all_seven_days_available() -> None:
    plan = generate_weekly_plan(300.0, rest_days=0)

    assert len(plan) == 7
    assert all(day.workout_type != "rest" for day in plan)


def test_all_weekdays_can_be_selected_as_rest_preferences() -> None:
    plan = generate_weekly_plan(300.0, rest_days=6, preferred_days_off=[0, 1, 2, 3, 4, 5])

    assert sum(1 for day in plan if day.workout_type == "rest") == 6
    assert sum(1 for day in plan if day.workout_type != "rest") == 1


def test_progression_deload_repeats_after_each_cycle() -> None:
    week_three = generate_weekly_plan(300.0, week_number=2)
    week_four = generate_weekly_plan(300.0, week_number=3)
    week_seven = generate_weekly_plan(300.0, week_number=6)

    assert sum(day.target_tss for day in week_three) == sum(day.target_tss for day in week_seven)
    assert sum(day.target_tss for day in week_four) < sum(day.target_tss for day in week_three)
