"""HTTP-level tests for ``/api/goals/*`` endpoints.

Covers:
  - GET    /goals                  → 200 list happy path
  - GET    /goals                  → 401 when not authenticated
  - POST   /goals                  → 201 create happy path
  - POST   /goals                  → 422 when required fields missing
  - GET    /goals/{id}             → 200 happy path
  - GET    /goals/{id}             → 404 when not found (NotFoundError → unified body)
  - DELETE /goals/{id}             → 204 happy path
  - DELETE /goals/{id}             → 404 when not found
  - POST   /goals/{id}/refresh     → 200 happy path (refresh_goal_progress mocked)
  - POST   /goals/{id}/refresh     → 404 when refresh raises ValueError
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.goals import get_goals_repo
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "goals@example.com", "hash")
_NOW = datetime(2026, 6, 22, tzinfo=UTC)


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_list_goals() -> None:
    """GET /goals returns the goals the repo yields for the athlete."""
    _use_repo(_FakeRepo(list_result=[_goal("g-1"), _goal("g-2")]))

    response = await _get("/api/v1/goals")

    assert response.status_code == 200
    body = response.json()
    assert [g["goal_id"] for g in body] == ["g-1", "g-2"]


@pytest.mark.no_db
async def test_list_goals_serializes_database_uuid_fields() -> None:
    goal_id = uuid4()
    _use_repo(_FakeRepo(list_result=[_goal(goal_id)]))

    response = await _get("/api/v1/goals")

    assert response.status_code == 200
    body = response.json()
    assert body[0]["goal_id"] == str(goal_id)
    assert body[0]["athlete_id"] == str(ATHLETE.id)


@pytest.mark.no_db
async def test_create_goal() -> None:
    """POST /goals with a valid payload → 201."""
    repo = _FakeRepo()
    _use_repo(repo)

    payload: dict[str, object] = {
        "type": "event",
        "title": "City Marathon",
        "target_value": 42_195.0,
        "unit": "km",
        "race_distance_m": 42_195,
        "race_target_time_s": 14_400,
    }
    response = await _post_json("/api/v1/goals", payload)

    assert response.status_code == 201
    body = response.json()
    assert body["type"] == "event"
    assert body["title"] == "City Marathon"
    assert body["race_distance_m"] == 42_195
    assert body["race_target_time_s"] == 14_400
    assert len(repo.create_calls) == 1
    assert repo.create_calls[0][0] == ATHLETE.id
    assert repo.create_calls[0][1]["title"] == "City Marathon"
    assert repo.create_calls[0][1]["race_distance_m"] == 42_195
    assert repo.create_calls[0][1]["race_target_time_s"] == 14_400


@pytest.mark.no_db
async def test_get_goal() -> None:
    """GET /goals/{id} returns 200 with the goal."""
    _use_repo(_FakeRepo(get_result=_goal("g-1")))

    response = await _get(f"/api/v1/goals/{uuid4()}")

    assert response.status_code == 200
    assert response.json()["goal_id"] == "g-1"


@pytest.mark.no_db
async def test_delete_goal() -> None:
    """DELETE /goals/{id} on an existing goal → 204."""
    repo = _FakeRepo(delete_result=True)
    _use_repo(repo)

    response = await _delete(f"/api/v1/goals/{uuid4()}")

    assert response.status_code == 204
    assert response.content == b""


@pytest.mark.no_db
async def test_refresh_goal_success() -> None:
    """POST /goals/{id}/refresh with a valid goal → 200 (refresh_goal_progress mocked)."""
    _use_repo(_FakeRepo())
    goal_id = uuid4()
    refreshed = _goal("g-1")

    with (
        patch("presentation.api.goals.get_pool") as mock_pool,
        patch(
            "presentation.api.goals.refresh_goal_progress", new_callable=AsyncMock
        ) as mock_refresh,
    ):
        mock_pool.return_value.connection.return_value.__aenter__ = AsyncMock(return_value=None)
        mock_pool.return_value.connection.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_refresh.return_value = refreshed
        response = await _post_json(f"/api/v1/goals/{goal_id}/refresh", None)

    assert response.status_code == 200
    assert response.json()["goal_id"] == "g-1"
    mock_refresh.assert_awaited_once()
    assert mock_refresh.call_args.args[0] == ATHLETE.id
    assert mock_refresh.call_args.args[1] == goal_id


# ---------------------------------------------------------------------------
# Error / edge cases
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_list_goals_requires_auth() -> None:
    """GET /goals without access_token cookie → 401."""
    app.dependency_overrides.clear()

    response = await _get("/api/v1/goals")

    assert response.status_code == 401


@pytest.mark.no_db
async def test_create_goal_validation_error() -> None:
    """POST /goals missing required `title` → 422."""
    _use_repo(_FakeRepo())

    response = await _post_json("/api/v1/goals", {"type": "distance"})

    assert response.status_code == 422


@pytest.mark.no_db
async def test_get_goal_not_found() -> None:
    """GET /goals/{id} on a non-existent goal → 404 NotFoundError."""
    _use_repo(_FakeRepo(get_result=None))

    response = await _get(f"/api/v1/goals/{uuid4()}")

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "NOT_FOUND"


@pytest.mark.no_db
async def test_delete_goal_not_found() -> None:
    """DELETE /goals/{id} on a non-existent goal → 404."""
    _use_repo(_FakeRepo(delete_result=False))

    response = await _delete(f"/api/v1/goals/{uuid4()}")

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.no_db
async def test_refresh_goal_not_found() -> None:
    """POST /goals/{id}/refresh when refresh_goal_progress raises ValueError → 404."""
    _use_repo(_FakeRepo())

    with (
        patch("presentation.api.goals.get_pool") as mock_pool,
        patch(
            "presentation.api.goals.refresh_goal_progress", new_callable=AsyncMock
        ) as mock_refresh,
    ):
        mock_pool.return_value.connection.return_value.__aenter__ = AsyncMock(return_value=None)
        mock_pool.return_value.connection.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_refresh.side_effect = ValueError("goal not found")

        response = await _post_json(f"/api/v1/goals/{uuid4()}/refresh", None)

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


class _FakeRepo:
    def __init__(
        self,
        list_result: list[dict[str, object]] | None = None,
        get_result: dict[str, object] | None = None,
        delete_result: bool = True,
    ) -> None:
        self.list_result = list_result if list_result is not None else []
        self.get_result = get_result
        self.delete_result = delete_result
        self.create_calls: list[tuple[UUID, dict[str, object]]] = []

    async def list(self, _athlete_id: UUID) -> list[dict[str, object]]:
        return self.list_result

    async def create(self, athlete_id: UUID, data: dict[str, object]) -> dict[str, object]:
        self.create_calls.append((athlete_id, data))
        return _goal("g-new") | {
            "type": data.get("type", "event"),
            "title": data.get("title", "Sample Goal"),
            "race_distance_m": data.get("race_distance_m"),
            "race_target_time_s": data.get("race_target_time_s"),
        }

    async def get(self, _athlete_id: UUID, _goal_id: UUID) -> dict[str, object] | None:
        return self.get_result

    async def delete(self, _athlete_id: UUID, _goal_id: UUID) -> bool:
        return self.delete_result


def _goal(goal_id: str | UUID) -> dict[str, object]:
    return {
        "goal_id": goal_id,
        "athlete_id": ATHLETE.id if isinstance(goal_id, UUID) else str(ATHLETE.id),
        "type": "distance",
        "title": "Sample Goal",
        "target_value": 100_000.0,
        "current_value": 42_000.0,
        "unit": "m",
        "target_date": None,
        "status": "active",
        "created_at": _NOW,
        "updated_at": _NOW,
    }


def _use_repo(repo: _FakeRepo) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_goals_repo] = lambda: repo


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def _post_json(path: str, payload: dict[str, object] | None) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, json=payload)


async def _delete(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.delete(path)
