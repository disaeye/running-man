from datetime import date, timedelta

from domain.workout.periodization import Phase, generate_phases

BASELINE_WEEK = 42000.0


def test_standard_84_day_runway_has_four_training_phases() -> None:
    today = date(2026, 1, 1)
    race_date = today + timedelta(days=84)

    phases = generate_phases(race_date, BASELINE_WEEK, today)

    assert [phase.name for phase in phases] == ["base", "build", "peak", "taper"]
    assert phases[0].start_date == today
    assert phases[0].end_date == today + timedelta(days=27)
    assert phases[-1].end_date == race_date - timedelta(days=1)


def test_run_distance_phases_build_and_taper_from_recent_weekly_distance() -> None:
    today = date(2026, 1, 1)
    phases = generate_phases(today + timedelta(days=84), BASELINE_WEEK, today)
    targets = {phase.name: phase.target_weekly_distance_m for phase in phases}

    assert targets["build"] > BASELINE_WEEK
    assert targets["peak"] > targets["build"]
    assert targets["taper"] < targets["peak"] * 0.65


def test_each_phase_ramps_between_its_own_weeks() -> None:
    today = date(2026, 1, 1)
    phases = generate_phases(today + timedelta(days=84), BASELINE_WEEK, today)
    build = next(phase for phase in phases if phase.name == "build")

    first_week = build.weekly_distance_for(build.start_date)
    last_week = build.weekly_distance_for(build.end_date - timedelta(days=6))

    assert last_week > first_week
    assert first_week < build.target_weekly_distance_m


def test_14_day_runway_returns_taper_and_race() -> None:
    today = date(2026, 6, 1)
    race_date = today + timedelta(days=14)

    phases = generate_phases(race_date, 35000.0, today)

    assert [phase.name for phase in phases] == ["taper", "race"]
    assert phases[0].start_date == today
    assert phases[0].end_date == race_date - timedelta(days=1)
    assert phases[0].start_weekly_distance_m > phases[0].target_weekly_distance_m
    assert phases[1] == Phase("race", race_date, race_date, 0.0, 0.0)


def test_short_runway_has_a_taper_then_race_day() -> None:
    today = date(2026, 7, 10)
    race_date = today + timedelta(days=3)

    phases = generate_phases(race_date, 38500.0, today)

    assert [phase.name for phase in phases] == ["taper", "race"]
    assert phases[0].start_date == today
    assert phases[0].end_date == race_date - timedelta(days=1)


def test_race_today_returns_race_phase_only() -> None:
    today = date(2026, 7, 10)

    assert generate_phases(today, 38500.0, today) == [
        Phase("race", today, today, 0.0, 0.0),
    ]


def test_zero_weekly_run_distance_is_rejected() -> None:
    today = date(2026, 7, 10)

    try:
        generate_phases(today + timedelta(days=84), 0.0, today)
    except ValueError as error:
        assert str(error) == "最近跑步周跑量必须大于零"
    else:
        raise AssertionError("zero run-distance history must be rejected")
