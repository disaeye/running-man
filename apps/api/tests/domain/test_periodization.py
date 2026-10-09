from datetime import date, timedelta
from math import isclose

from domain.workout.periodization import Phase, generate_phases


def test_standard_84_day_runway_has_four_training_phases() -> None:
    today = date(2026, 1, 1)
    race_date = today + timedelta(days=84)

    phases = generate_phases(race_date=race_date, current_ctl=60.0, today=today)

    assert [phase.name for phase in phases] == ["base", "build", "peak", "taper"]
    assert phases == [
        Phase("base", today, today + timedelta(days=27), 336.0),
        Phase("build", today + timedelta(days=28), today + timedelta(days=55), 420.0),
        Phase("peak", today + timedelta(days=56), today + timedelta(days=69), 378.0),
        Phase("taper", today + timedelta(days=70), race_date - timedelta(days=1), 210.0),
    ]


def test_14_day_runway_returns_taper_and_race() -> None:
    today = date(2026, 6, 1)
    race_date = today + timedelta(days=14)

    phases = generate_phases(race_date=race_date, current_ctl=50.0, today=today)

    assert [phase.name for phase in phases] == ["taper", "race"]
    assert phases[0].start_date == today
    assert phases[0].end_date == race_date - timedelta(days=1)
    assert isclose(phases[0].target_weekly_tss, 175.0)
    assert phases[1] == Phase("race", race_date, race_date, 0.0)


def test_short_runway_has_a_taper_then_race_day() -> None:
    today = date(2026, 7, 10)
    race_date = today + timedelta(days=3)

    phases = generate_phases(race_date, current_ctl=55.0, today=today)

    assert [phase.name for phase in phases] == ["taper", "race"]
    assert phases[0].start_date == today
    assert phases[0].end_date == race_date - timedelta(days=1)


def test_race_today_returns_race_phase_only() -> None:
    today = date(2026, 7, 10)

    assert generate_phases(today, current_ctl=55.0, today=today) == [
        Phase("race", today, today, 0.0),
    ]
