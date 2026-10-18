from datetime import date, timedelta

from domain.workout.periodization import Phase, generate_phases

CTL = 60.0
BASELINE_WEEK = CTL * 7  # 420 TSS


def test_standard_84_day_runway_has_four_training_phases() -> None:
    today = date(2026, 1, 1)
    race_date = today + timedelta(days=84)

    phases = generate_phases(race_date=race_date, current_ctl=CTL, today=today)

    assert [phase.name for phase in phases] == ["base", "build", "peak", "taper"]
    assert phases[0].start_date == today
    assert phases[0].end_date == today + timedelta(days=27)
    assert phases[-1].end_date == race_date - timedelta(days=1)


def test_the_plan_climbs_above_the_current_week() -> None:
    """BUILD and PEAK must exceed the athlete's current chronic load.

    The ladder used to be 0.8 / 1.0 / 0.9 of the current week, so the peak was
    below the athlete's existing load and the whole plan could not raise
    fitness.
    """
    today = date(2026, 1, 1)
    phases = generate_phases(
        race_date=today + timedelta(days=84), current_ctl=CTL, today=today
    )
    peaks = {phase.name: phase.target_weekly_tss for phase in phases}

    assert peaks["build"] > BASELINE_WEEK
    assert peaks["peak"] > peaks["build"]
    assert peaks["taper"] < peaks["peak"] * 0.65


def test_each_phase_ramps_between_its_own_weeks() -> None:
    today = date(2026, 1, 1)
    phases = generate_phases(
        race_date=today + timedelta(days=84), current_ctl=CTL, today=today
    )
    build = next(phase for phase in phases if phase.name == "build")

    first_week = build.weekly_tss_for(build.start_date)
    last_week = build.weekly_tss_for(build.end_date - timedelta(days=6))

    assert last_week > first_week
    assert first_week < build.target_weekly_tss


def test_14_day_runway_returns_taper_and_race() -> None:
    today = date(2026, 6, 1)
    race_date = today + timedelta(days=14)

    phases = generate_phases(race_date=race_date, current_ctl=50.0, today=today)

    assert [phase.name for phase in phases] == ["taper", "race"]
    assert phases[0].start_date == today
    assert phases[0].end_date == race_date - timedelta(days=1)
    # Taper starts at 0.75 of the current week (350) and falls to 0.55 (192.5).
    assert phases[0].start_weekly_tss > phases[0].target_weekly_tss
    assert phases[1] == Phase("race", race_date, race_date, 0.0, 0.0)


def test_short_runway_has_a_taper_then_race_day() -> None:
    today = date(2026, 7, 10)
    race_date = today + timedelta(days=3)

    phases = generate_phases(race_date, current_ctl=55.0, today=today)

    assert [phase.name for phase in phases] == ["taper", "race"]
    assert phases[0].start_date == today
    assert phases[0].end_date == race_date - timedelta(days=1)


def test_athlete_without_load_history_gets_a_beginner_week() -> None:
    today = date(2026, 1, 1)

    phases = generate_phases(
        race_date=today + timedelta(days=84), current_ctl=0.0, today=today
    )

    assert phases[0].target_weekly_tss > 150.0
    assert phases[0].target_weekly_tss < 260.0


def test_race_today_returns_race_phase_only() -> None:
    today = date(2026, 7, 10)

    assert generate_phases(today, current_ctl=55.0, today=today) == [
        Phase("race", today, today, 0.0, 0.0),
    ]
