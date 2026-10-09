"""HTTP-level tests for ``/api/calendar/*`` endpoints.

Covers CRUD operations on training-calendar events through the public HTTP
contract (status codes + response shapes), not implementation internals.

  - GET    /calendar              → 200 list happy path
  - POST   /calendar              → 201 create happy path
  - POST   /calendar              → 422 when required field missing
  - PUT    /calendar/{id}         → 200 update happy path
  - PUT    /calendar/{id}         → 404 when event does not exist
  - DELETE /calendar/{id}         → 204 delete happy path
  - DELETE /calendar/{id}         → 404 when event does not exist
  - GET    /calendar              → 401 when not authenticated
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.calendar import get_calendar_repo
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "calendar@example.com", "hash")

_EVENT_TIME = datetime(2026, 6, 22, 6, 0, tzinfo=UTC)


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_list_calendar_events() -> None:
    """GET /calendar returns the events the repo yields for the window."""
    events = [_event("e-1"), _event("e-2")]
    _use_repo(_FakeRepo(list_result=events))

    response = await _get("/api/v1/calendar?from=2026-06-01T00:00:00&to=2026-06-30T00:00:00")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["event_id"] == "e-1"
    assert body[1]["event_id"] == "e-2"


@pytest.mark.no_db
async def test_create_calendar_event() -> None:
    """POST /calendar with a valid event → 201 and the stored event echoed back."""
    repo = _FakeRepo()
    _use_repo(repo)

    payload = {
        "event_id": "e-new",
        "start_time": _EVENT_TIME.isoformat(),
        "category": "workout",
        "sport_type": "Run",
        "name": "Tempo Run",
        "predicted_tss": 65.0,
        "status": "planned",
        "done": False,
    }
    response = await _post_json("/api/v1/calendar", payload)

    assert response.status_code == 201
    body = response.json()
    assert body["event_id"] == "e-new"
    assert body["category"] == "workout"
    assert body["name"] == "Tempo Run"
    assert len(repo.create_calls) == 1
    assert repo.create_calls[0][0] == ATHLETE.id
    assert repo.create_calls[0][1]["event_id"] == "e-new"


@pytest.mark.no_db
async def test_update_calendar_event() -> None:
    """PUT /calendar/{id} returns 200 with the updated event."""
    updated = _event("e-1") | {"name": "Updated Name"}
    repo = _FakeRepo(update_result=updated)
    _use_repo(repo)

    payload: dict[str, object] = {
        "start_time": _EVENT_TIME.isoformat(),
        "category": "workout",
    }
    response = await _put_json("/api/v1/calendar/e-1", payload)

    assert response.status_code == 200
    assert response.json()["name"] == "Updated Name"
    assert len(repo.update_calls) == 1
    assert repo.update_calls[0][0] == "e-1"
    assert repo.update_calls[0][1] == ATHLETE.id


@pytest.mark.no_db
async def test_delete_calendar_event() -> None:
    """DELETE /calendar/{id} on an existing event → 204 No Content."""
    repo = _FakeRepo(delete_result=True)
    _use_repo(repo)

    response = await _delete("/api/v1/calendar/e-1")

    assert response.status_code == 204
    assert response.content == b""
    assert repo.delete_calls == [("e-1", ATHLETE.id)]


# ---------------------------------------------------------------------------
# Error / edge cases
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_create_calendar_event_validation_error() -> None:
    """POST /calendar missing required event_id → 422."""
    _use_repo(_FakeRepo())

    response = await _post_json(
        "/api/v1/calendar",
        {"start_time": _EVENT_TIME.isoformat(), "category": "workout"},
    )

    assert response.status_code == 422


@pytest.mark.no_db
async def test_update_calendar_event_not_found() -> None:
    """PUT /calendar/{id} on a non-existent event → 404."""
    _use_repo(_FakeRepo(update_result=None))

    payload: dict[str, object] = {
        "start_time": _EVENT_TIME.isoformat(),
        "category": "workout",
    }
    response = await _put_json("/api/v1/calendar/missing", payload)

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.no_db
async def test_delete_calendar_event_not_found() -> None:
    """DELETE /calendar/{id} on a non-existent event → 404."""
    _use_repo(_FakeRepo(delete_result=False))

    response = await _delete("/api/v1/calendar/missing")

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.no_db
async def test_list_calendar_requires_auth() -> None:
    """GET /calendar without access_token cookie → 401."""
    app.dependency_overrides.clear()

    response = await _get("/api/v1/calendar?from=2026-06-01T00:00:00&to=2026-06-30T00:00:00")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


class _FakeRepo:
    def __init__(
        self,
        list_result: list[dict[str, object]] | None = None,
        update_result: dict[str, object] | None = None,
        delete_result: bool = True,
    ) -> None:
        self.list_result = list_result if list_result is not None else []
        self.update_result = update_result
        self.delete_result = delete_result
        self.create_calls: list[tuple[UUID, dict[str, object]]] = []
        self.update_calls: list[tuple[str, UUID, dict[str, object]]] = []
        self.delete_calls: list[tuple[str, UUID]] = []

    async def list(
        self, _athlete_id: UUID, _start: datetime, _end: datetime
    ) -> list[dict[str, object]]:
        return self.list_result

    async def create(self, athlete_id: UUID, event: dict[str, object]) -> dict[str, object]:
        self.create_calls.append((athlete_id, event))
        return _materialize(event)

    async def update(
        self, athlete_id: UUID, event_id: str, event: dict[str, object]
    ) -> dict[str, object] | None:
        self.update_calls.append((event_id, athlete_id, event))
        if self.update_result is None:
            return None
        return self.update_result

    async def delete(self, athlete_id: UUID, event_id: str) -> bool:
        self.delete_calls.append((event_id, athlete_id))
        return self.delete_result


def _event(event_id: str) -> dict[str, object]:
    return {
        "event_id": event_id,
        "start_time": _EVENT_TIME,
        "category": "workout",
        "sport_type": "Run",
        "name": "Easy",
        "predicted_tss": 40.0,
        "status": "planned",
        "done": False,
    }


def _materialize(event: dict[str, object]) -> dict[str, object]:
    return event | {"start_time": _EVENT_TIME} if "start_time" not in event else event


def _use_repo(repo: _FakeRepo) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_calendar_repo] = lambda: repo


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def _post_json(path: str, payload: dict[str, object]) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, json=payload)


async def _put_json(path: str, payload: dict[str, object]) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.put(path, json=payload)


async def _delete(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.delete(path)
