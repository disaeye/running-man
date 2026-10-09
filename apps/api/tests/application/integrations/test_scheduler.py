"""Scheduling rules for automatic sync.

The settings screen has always offered ``auto_sync`` and ``sync_frequency``, and
nothing ever read them — so an athlete could choose "hourly" and the app would
still only update when they pressed the button. These tests pin the decision
that the timer now makes: who is due, and who is deliberately skipped.

The reason a given athlete was skipped matters as much as the sync itself,
because "why is my dashboard stale" is answered by that list.
"""

from datetime import UTC, datetime, timedelta

from application.integrations.scheduler import (
    DUE_TOLERANCE,
    FREQUENCY_INTERVALS,
    is_due,
)

NOW = datetime(2026, 9, 11, 12, 0, tzinfo=UTC)


class TestIsDue:
    def test_an_athlete_who_never_synced_is_due_immediately(self) -> None:
        # Waiting a full interval after connecting would leave the app empty
        # for a day, which reads as "broken" rather than "new".
        assert is_due("daily", None, NOW) is True
        assert is_due("hourly", None, NOW) is True

    def test_hourly_becomes_due_after_an_hour(self) -> None:
        assert is_due("hourly", NOW - timedelta(hours=1), NOW) is True
        assert is_due("hourly", NOW - timedelta(hours=3), NOW) is True

    def test_hourly_is_not_due_before_the_interval(self) -> None:
        assert is_due("hourly", NOW - timedelta(minutes=20), NOW) is False

    def test_daily_becomes_due_after_a_day(self) -> None:
        assert is_due("daily", NOW - timedelta(days=1), NOW) is True
        assert is_due("daily", NOW - timedelta(hours=6), NOW) is False

    def test_tolerance_absorbs_a_timer_firing_slightly_early(self) -> None:
        # A 30-minute timer that fires at :55 would otherwise skip a whole
        # hourly cycle for that athlete.
        just_short = NOW - (FREQUENCY_INTERVALS["hourly"] - DUE_TOLERANCE / 2)
        assert is_due("hourly", just_short, NOW) is True

    def test_tolerance_does_not_swallow_a_meaningful_gap(self) -> None:
        clearly_short = NOW - (FREQUENCY_INTERVALS["hourly"] - DUE_TOLERANCE * 3)
        assert is_due("hourly", clearly_short, NOW) is False

    def test_manual_never_becomes_due(self) -> None:
        """``manual`` means "only when I ask", which is the setting's point."""
        assert is_due("manual", NOW - timedelta(days=30), NOW) is False
        assert is_due("manual", None, NOW) is False

    def test_an_unknown_frequency_never_becomes_due(self) -> None:
        # Rather than guessing an interval, refuse: a typo in a stored setting
        # must not turn into unexpected background traffic.
        assert is_due("fortnightly", NOW - timedelta(days=30), NOW) is False

    def test_a_future_last_sync_does_not_block_forever(self) -> None:
        # Clock skew or bad data must not disable an athlete's sync permanently.
        assert is_due("daily", NOW + timedelta(days=2), NOW) is True

    def test_a_naive_timestamp_is_treated_as_utc(self) -> None:
        # Stored values are timestamptz, but a naive one must not raise.
        naive = datetime(2026, 9, 9, 12, 0)
        assert is_due("daily", naive, NOW) is True


class TestFrequencyIntervals:
    def test_manual_is_absent_by_design(self) -> None:
        assert "manual" not in FREQUENCY_INTERVALS

    def test_the_ui_offers_only_defined_frequencies(self) -> None:
        # The frontend's SyncFrequency union lists hourly/daily/manual; every
        # value it can send must map to a defined interval or be manual.
        for frequency in ("hourly", "daily"):
            assert frequency in FREQUENCY_INTERVALS
