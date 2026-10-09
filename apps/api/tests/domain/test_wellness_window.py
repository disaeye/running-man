"""Which wellness observation describes a given day.

These rules exist because readiness used to look for an exact-date match. Since
wellness is uploaded overnight, the row for "today" was usually absent — or
present but entirely NULL — so every factor reported "数据不足" and the score
sat at a neutral 50 regardless of how the athlete had actually slept. The app
looked like it had no data while the data was right there, one day back.

The tests below pin the window rules: recent enough to be meaningful, never
forward-looking, and always the most recent *measured* day rather than the most
recent row.
"""

from datetime import date, timedelta

from domain.insights.wellness_window import (
    MAX_OBSERVATION_AGE_DAYS,
    baseline_days,
    is_usable_for,
    observation_day,
)

TARGET = date(2026, 9, 12)


class TestObservationDay:
    def test_yesterdays_data_describes_today(self) -> None:
        # The normal case: sleep is uploaded the morning after.
        assert observation_day(TARGET, (TARGET - timedelta(days=1),)) == TARGET - timedelta(days=1)

    def test_picks_the_most_recent_measured_day(self) -> None:
        observed = (
            TARGET - timedelta(days=4),
            TARGET - timedelta(days=2),
            TARGET - timedelta(days=1),
        )
        assert observation_day(TARGET, observed) == TARGET - timedelta(days=1)

    def test_today_wins_when_present(self) -> None:
        observed = (TARGET - timedelta(days=1), TARGET)
        assert observation_day(TARGET, observed) == TARGET

    def test_never_looks_forward(self) -> None:
        # A source writing ahead must not be treated as describing today.
        assert observation_day(TARGET, (TARGET + timedelta(days=1),)) is None
        assert observation_day(TARGET, (TARGET + timedelta(days=1), TARGET)) == TARGET

    def test_rejects_observations_older_than_the_cap(self) -> None:
        too_old = TARGET - timedelta(days=MAX_OBSERVATION_AGE_DAYS + 1)
        assert observation_day(TARGET, (too_old,)) is None

    def test_accepts_an_observation_at_the_cap(self) -> None:
        at_cap = TARGET - timedelta(days=MAX_OBSERVATION_AGE_DAYS)
        assert observation_day(TARGET, (at_cap,)) == at_cap

    def test_returns_none_with_no_observations(self) -> None:
        # Callers must render this as "not assessed", never as a mid-range score.
        assert observation_day(TARGET, ()) is None

    def test_the_cap_is_overridable_for_the_load_series(self) -> None:
        # PMC facts are written by a recompute job and can trail further than
        # wellness uploads do.
        stale = TARGET - timedelta(days=3)
        assert observation_day(TARGET, (stale,)) is None
        assert observation_day(TARGET, (stale,), max_age_days=3) == stale


class TestIsUsableFor:
    def test_accepts_same_day_and_recent_past(self) -> None:
        assert is_usable_for(TARGET, TARGET) is True
        assert is_usable_for(TARGET - timedelta(days=1), TARGET) is True

    def test_rejects_future_and_stale(self) -> None:
        assert is_usable_for(TARGET + timedelta(days=1), TARGET) is False
        assert is_usable_for(TARGET - timedelta(days=30), TARGET) is False


class TestBaselineDays:
    def test_excludes_the_target_day_itself(self) -> None:
        # A baseline that includes the value under comparison can never show a
        # deviation.
        observed = (TARGET - timedelta(days=1), TARGET)
        assert TARGET not in baseline_days(TARGET, observed)

    def test_returns_only_days_before_the_target(self) -> None:
        observed = (
            TARGET - timedelta(days=10),
            TARGET - timedelta(days=3),
            TARGET - timedelta(days=1),
            TARGET + timedelta(days=1),
        )
        days = baseline_days(TARGET, observed)
        assert all(day < TARGET for day in days)
        assert TARGET + timedelta(days=1) not in days

    def test_returns_days_in_ascending_order(self) -> None:
        observed = (TARGET - timedelta(days=1), TARGET - timedelta(days=5))
        assert baseline_days(TARGET, observed) == sorted(baseline_days(TARGET, observed))

    def test_empty_when_no_prior_observations(self) -> None:
        assert baseline_days(TARGET, ()) == []
        assert baseline_days(TARGET, (TARGET,)) == []
