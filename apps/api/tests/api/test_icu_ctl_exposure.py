"""Test that icu_ctl is exposed through the ActivitySummary schema and API.

Covers:
- ActivitySummary schema serializes icu_ctl when present
- ActivitySummary schema defaults icu_ctl to None when absent
- list_activities endpoint includes icu_ctl in response
- get_activity endpoint includes icu_ctl in response
"""

from datetime import UTC, date, datetime
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.activities import get_activity_repo
from presentation.auth.deps import get_current_athlete

ATHLETE_A = Athlete(uuid4(), "a@example.com", "hash")


@pytest.mark.no_db
async def test_activity_summary_schema_icu_ctl_populated() -> None:
    """icu_ctl is present and correct when the DB returns a value."""
    _use_athlete(ATHLETE_A)
    app.dependency_overrides[get_activity_repo] = lambda: _FakeRepo(icu_ctl=42.5)

    response = await _get("/api/v1/activities?from=2026-01-01&to=2026-06-01")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["icu_ctl"] == 42.5


@pytest.mark.no_db
async def test_activity_summary_schema_icu_ctl_null() -> None:
    """icu_ctl is null when the DB returns None."""
    _use_athlete(ATHLETE_A)
    app.dependency_overrides[get_activity_repo] = lambda: _FakeRepo(icu_ctl=None)

    response = await _get("/api/v1/activities?from=2026-01-01&to=2026-06-01")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["icu_ctl"] is None


@pytest.mark.no_db
async def test_get_activity_includes_icu_ctl() -> None:
    """GET /activities/{id} returns icu_ctl in the response."""
    _use_athlete(ATHLETE_A)
    app.dependency_overrides[get_activity_repo] = lambda: _FakeRepo(icu_ctl=38.2)

    response = await _get("/api/v1/activities/a-1")

    assert response.status_code == 200
    assert response.json()["icu_ctl"] == 38.2


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


def _use_athlete(athlete: Athlete) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: athlete


class _FakeRepo:
    """Fake ActivityRepo that returns a single activity with configurable icu_ctl."""

    def __init__(self, icu_ctl: float | None) -> None:
        self._icu_ctl = icu_ctl

    async def list_by_range(
        self, _athlete_id: UUID, _start: date, _end: date
    ) -> list[dict[str, object]]:
        return [_activity("a-1", self._icu_ctl)]

    async def get_by_id(self, athlete_id: UUID, activity_id: str) -> dict[str, object] | None:
        if athlete_id == ATHLETE_A.id and activity_id == "a-1":
            return _activity("a-1", self._icu_ctl) | {"raw_data": {}}
        return None

    async def exists(self, activity_id: str) -> bool:
        return activity_id == "a-1"

    async def get_streams(self, _athlete_id: UUID, _activity_id: str) -> list[dict[str, object]]:
        return []


def _activity(activity_id: str, icu_ctl: float | None) -> dict[str, object]:
    return {
        "activity_id": activity_id,
        "start_time": datetime(2026, 1, 1, tzinfo=UTC),
        "sport": "run",
        "distance_m": 1000.0,
        "duration_s": 300,
        "avg_hr": 145,
        "max_hr": 170,
        "avg_power": 200,
        "np": 210.0,
        "icu_ctl": icu_ctl,
        "intensity_factor": 0.85,
        "tss": 50.0,
        "avg_cadence": 85.0,
        "avg_speed": 3.5,
        "elevation_gain_m": 50.0,
        "calories": 300,
        "device_name": "Test Device",
        "external_id": None,
        "source": "test",
        "file_type": None,
    }
