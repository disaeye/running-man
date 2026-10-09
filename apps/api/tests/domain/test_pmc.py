from datetime import date, timedelta

import pytest

from domain.load.pmc import compute_ctl_atl_tsb


def test_ctl_day1_with_100_tss() -> None:
    metrics = compute_ctl_atl_tsb({date(2026, 1, 1): 100.0})

    assert metrics["ctl"][-1] == pytest.approx(2.4, abs=0.5)


def test_ctl_stabilizes_42_days() -> None:
    start_day = date(2026, 1, 1)
    daily_tss = {start_day + timedelta(days=day_number): 100.0 for day_number in range(42)}

    metrics = compute_ctl_atl_tsb(daily_tss)

    assert metrics["ctl"][-1] == pytest.approx(63.2, abs=1.0)


def test_tsb_is_ctl_minus_atl() -> None:
    metrics = compute_ctl_atl_tsb({date(2026, 1, 1): 100.0})

    assert metrics["tsb"][-1] == pytest.approx(metrics["ctl"][-1] - metrics["atl"][-1], abs=0.1)


def test_missing_day_decays_ctl() -> None:
    daily_tss = {date(2026, 1, 1): 100.0, date(2026, 1, 3): 100.0}

    metrics = compute_ctl_atl_tsb(daily_tss, seed_ctl=50.0)

    assert metrics["dates"] == [date(2026, 1, 1), date(2026, 1, 2), date(2026, 1, 3)]
    assert metrics["ctl"][1] < metrics["ctl"][0]


class TestCtlWarmup:
    """CTL starts from a zero seed, so early values describe the warm-up.

    With a 42-day time constant the EWMA needs about two constants to converge.
    Before that the figure is far below the athlete's true fitness, which reads
    as "you are unfit" rather than "not enough history yet". The flag exists so
    the UI can say the latter.
    """

    def test_early_days_are_flagged_as_warming_up(self) -> None:
        from domain.load.pmc import build_pmc_series

        series = build_pmc_series({date(2026, 7, 1): 100.0, date(2026, 7, 30): 100.0})

        assert all(point["ctl_warming_up"] for point in series)

    def test_flag_clears_once_history_is_long_enough(self) -> None:
        from domain.load.pmc import CTL_WARMUP_DAYS, build_pmc_series

        start = date(2026, 1, 1)
        daily = {start + timedelta(days=offset): 100.0 for offset in range(CTL_WARMUP_DAYS + 5)}
        series = build_pmc_series(daily)

        assert series[CTL_WARMUP_DAYS - 2]["ctl_warming_up"] is True
        assert series[CTL_WARMUP_DAYS - 1]["ctl_warming_up"] is False
        assert series[-1]["ctl_warming_up"] is False

    def test_a_new_athlete_sees_a_much_lower_ctl_than_steady_state(self) -> None:
        # Demonstrates why the flag matters: after two weeks at a steady load the
        # reported CTL is still less than half the converged value.
        from domain.load.pmc import build_pmc_series

        start = date(2026, 1, 1)
        two_weeks = {start + timedelta(days=d): 100.0 for d in range(14)}
        two_years = {start + timedelta(days=d): 100.0 for d in range(400)}

        early = build_pmc_series(two_weeks)[-1]["ctl"]
        converged = build_pmc_series(two_years)[-1]["ctl"]

        assert isinstance(early, float)
        assert isinstance(converged, float)
        assert early < converged * 0.5

    def test_warmup_days_counts_down(self) -> None:
        from domain.load.pmc import CTL_WARMUP_DAYS, warmup_days

        assert warmup_days(0) == CTL_WARMUP_DAYS
        assert warmup_days(CTL_WARMUP_DAYS) == 0
        assert warmup_days(CTL_WARMUP_DAYS + 100) == 0
