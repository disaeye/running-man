"""The staleness vocabulary every surface reads.

The rule this file pins: `missing` means nothing has ever been synced. Data
that exists but is old is `stale`, however old it is. The integration card used
to report `missing` after 72 hours, which the UI renders as "connect a data
source" — telling an athlete with a five-day-old activity to connect an account
that was already connected.
"""

from datetime import date, datetime, timedelta, timezone

import pytest

from presentation.api.staleness import staleness_bucket

TODAY = date(2026, 6, 29)


@pytest.mark.no_db
def test_data_from_today_is_fresh() -> None:
    assert staleness_bucket(datetime(2026, 6, 29, 6, 0, tzinfo=timezone.utc), TODAY) == "fresh"


@pytest.mark.no_db
def test_data_from_yesterday_is_still_fresh() -> None:
    """One day of lag is normal: the athlete may not have trained yet today."""
    assert staleness_bucket(datetime(2026, 6, 28, 20, 0, tzinfo=timezone.utc), TODAY) == "fresh"


@pytest.mark.no_db
def test_data_from_two_days_ago_is_stale_not_missing() -> None:
    assert staleness_bucket(datetime(2026, 6, 27, 9, 0, tzinfo=timezone.utc), TODAY) == "stale"


@pytest.mark.no_db
def test_data_from_last_month_is_stale_not_missing() -> None:
    """Present data never reads as absent, however old it is."""
    assert staleness_bucket(datetime(2026, 5, 20, 9, 0, tzinfo=timezone.utc), TODAY) == "stale"


@pytest.mark.no_db
def test_never_synced_is_missing() -> None:
    assert staleness_bucket(None, TODAY) == "missing"


@pytest.mark.no_db
def test_plain_date_is_accepted() -> None:
    assert staleness_bucket(TODAY - timedelta(days=5), TODAY) == "stale"


@pytest.mark.no_db
def test_unparseable_value_is_stale_not_missing() -> None:
    """A value we cannot read is not evidence that nothing was synced."""
    assert staleness_bucket("2026-06-29", TODAY) == "stale"
