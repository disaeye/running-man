"""Tests for GET /api/activities/{activity_id}/laps."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.activities import get_activity_repo
from presentation.auth.deps import get_current_athlete

ATHLETE_A = Athlete(uuid4(), "a@example.com", "hash")
ATHLETE_B = Athlete(uuid4(), "b@example.com", "hash")


@pytest.mark.no_db
async def test_get_laps_persisted() -> None:
    """Returns persisted laps with enriched avg_pace."""
    _use_athlete(ATHLETE_A)
    app.dependency_overrides[get_activity_repo] = FakeActivityRepo

    response = await _get("/api/v1/activities/a-1/laps")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["lap_index"] == 1
    assert data[0]["duration_s"] == 150
    assert data[0]["distance_m"] == 500.0
    assert data[0]["avg_hr"] == 140
    assert data[0]["max_hr"] == 155
    assert data[0]["avg_pace"] == 300.0  # 150 / (500/1000)
    assert data[0]["avg_power"] == 200


@pytest.mark.no_db
async def test_get_laps_forbidden() -> None:
    """Returns 403 when accessing another athlete's activity."""
    _use_athlete(ATHLETE_B)
    app.dependency_overrides[get_activity_repo] = FakeActivityRepo

    response = await _get("/api/v1/activities/a-1/laps")

    assert response.status_code == 403


@pytest.mark.no_db
async def test_get_laps_not_found() -> None:
    """Returns 404 for nonexistent activity."""
    _use_athlete(ATHLETE_A)
    app.dependency_overrides[get_activity_repo] = FakeActivityRepo

    response = await _get("/api/v1/activities/nonexistent/laps")

    assert response.status_code == 404


@pytest.mark.no_db
async def test_get_laps_empty() -> None:
    """Returns empty list when activity has no laps or streams."""
    _use_athlete(ATHLETE_B)
    app.dependency_overrides[get_activity_repo] = FakeActivityRepo

    response = await _get("/api/v1/activities/b-1/laps")

    assert response.status_code == 200
    assert response.json() == []


# ── Fakes ─────────────────────────────────────────────────────────────────


class FakeActivityRepo:
    """Minimal fake returning data for a-1 (A's) and b-1 (B's) activities."""

    async def get_by_id(self, athlete_id: UUID, activity_id: str) -> dict[str, object] | None:
        if activity_id == "a-1" and athlete_id == ATHLETE_A.id:
            return _activity("a-1") | {"raw_data": {}}
        if activity_id == "b-1" and athlete_id == ATHLETE_B.id:
            return _activity("b-1") | {"raw_data": {}}
        return None

    async def exists(self, activity_id: str) -> bool:
        return activity_id in {"a-1", "b-1"}

    async def get_laps(self, athlete_id: UUID, activity_id: str) -> list[dict[str, object]]:
        if activity_id == "a-1" and athlete_id == ATHLETE_A.id:
            return [
                {
                    "lap_index": 1,
                    "start_time": datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
                    "duration_s": 150,
                    "distance_m": 500.0,
                    "avg_hr": 140,
                    "max_hr": 155,
                    "avg_power": 200,
                },
                {
                    "lap_index": 2,
                    "start_time": datetime(2026, 1, 1, 0, 2, 30, tzinfo=UTC),
                    "duration_s": 150,
                    "distance_m": 500.0,
                    "avg_hr": 145,
                    "max_hr": 160,
                    "avg_power": 210,
                },
            ]
        return []

    async def get_streams(self, _athlete_id: UUID, _activity_id: str) -> list[dict[str, object]]:
        return []


def _activity(activity_id: str) -> dict[str, object]:
    return {
        "activity_id": activity_id,
        "start_time": datetime(2026, 1, 1, tzinfo=UTC),
        "sport": "Run",
        "distance_m": 1000.0,
        "duration_s": 300,
    }


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


def _use_athlete(athlete: Athlete) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: athlete
