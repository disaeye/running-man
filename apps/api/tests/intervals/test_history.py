from __future__ import annotations

from datetime import date

import pytest

from infrastructure.integrations.intervals.history import (
    discover_history_window,
)

pytestmark = pytest.mark.no_db

TODAY = date(2026, 11, 3)


class FakeActivitiesClient:
    """Serves activities from an in-memory list, honouring oldest/newest."""

    def __init__(self, activities: list[dict[str, str]]) -> None:
        self._activities = activities
        self.calls: list[tuple[str, str]] = []

    async def get_activities(
        self, _athlete_id: int | str, oldest: str, newest: str
    ) -> list[dict[str, str]]:
        self.calls.append((oldest, newest))
        return [
            activity
            for activity in self._activities
            if oldest <= activity["start_date_local"][:10] <= newest
        ]


@pytest.mark.asyncio
async def test_discovers_the_earliest_activity_year_and_month() -> None:
    client = FakeActivitiesClient([
        {"start_date_local": "2025-04-13T07:32:59"},
        {"start_date_local": "2026-11-03T11:53:16"},
        {"start_date_local": "2025-08-01T06:00:00"},
    ])
    window = await discover_history_window("i1", client, TODAY)
    assert window.start == date(2025, 4, 13)
    assert window.end == TODAY


@pytest.mark.asyncio
async def test_an_empty_account_imports_only_today() -> None:
    client = FakeActivitiesClient([])
    window = await discover_history_window("i1", client, TODAY)
    assert window.start == TODAY
    assert window.end == TODAY


@pytest.mark.asyncio
async def test_history_before_the_horizon_is_not_searched_forever() -> None:
    client = FakeActivitiesClient([])
    window = await discover_history_window("i1", client, date(2001, 5, 1))
    assert window.start == date(2001, 5, 1)
    # An empty account stops at the first empty year.
    assert len(client.calls) == 1


@pytest.mark.asyncio
async def test_a_year_with_activity_in_december_skips_earlier_months() -> None:
    client = FakeActivitiesClient([{"start_date_local": "2025-12-20T08:00:00"}])
    window = await discover_history_window("i1", client, date(2025, 12, 31))
    assert window.start == date(2025, 12, 20)
    # Every month is probed in order until December returns the activity.
    assert ("2025-12-01", "2025-12-31") in client.calls
    assert client.calls[-1] == ("2025-12-01", "2025-12-31")
