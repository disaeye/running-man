"""HTTP-level tests for ``/api/v1/integrations/*`` endpoints.

Covers the public contract (status codes + response shapes) with mocked
external API calls. The real Intervals.icu sync pipeline is exercised
elsewhere; here we patch ``_sync`` to avoid live network calls.

  - GET    /integrations                       → 200 list happy path
  - GET    /integrations                       → 401 when not authenticated
  - GET    /integrations/{source}              → 200 happy path
  - GET    /integrations/{source}              → 404 for unknown source
  - GET    /integrations/{source}              → 404 when not connected
  - PUT    /integrations/{source}/connect      → 200 happy path (intervals_icu)
  - PUT    /integrations/{source}/connect      → 422 missing credentials
  - DELETE /integrations/{source}/disconnect   → 204 happy path
  - DELETE /integrations/{source}/disconnect   → 404 when not connected
  - POST   /integrations/{source}/sync         → 200 happy path (_sync patched)
  - POST   /integrations/{source}/sync         → 404 when integration not connected
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from domain.integrations.crypto import encrypt
from infrastructure.auth.models import Athlete
from main import app
from presentation.api.integrations import get_integration_repo
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "int@example.com", "hash")


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_list_integrations() -> None:
    """GET /integrations returns 200 with the athlete's integrations."""
    rows = [_row("intervals_icu", connected=True)]
    _use_repo(_FakeRepo(list_result=rows))

    response = await _get("/api/v1/integrations")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["source"] == "intervals_icu"
    # ``credentials`` is stripped by the _public() helper
    assert "credentials" not in body[0]


@pytest.mark.no_db
async def test_get_integration() -> None:
    """GET /integrations/{source} returns 200 with the public shape."""
    _use_repo(_FakeRepo(get_result=_row("intervals_icu", connected=True)))

    response = await _get("/api/v1/integrations/intervals_icu")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "intervals_icu"
    assert body["connected"] is True
    assert "credentials" not in body


@pytest.mark.no_db
async def test_connect_integration_intervals_icu() -> None:
    """PUT /integrations/intervals_icu/connect with athlete_id+api_key → 200."""
    repo = _FakeRepo()
    _use_repo(repo)

    payload: dict[str, object] = {"athlete_id": "i12345", "api_key": "secret-key"}
    response = await _put_json("/api/v1/integrations/intervals_icu/connect", payload)

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "intervals_icu"
    assert body["connected"] is True
    assert "credentials" not in body
    assert len(repo.upsert_calls) == 1
    assert repo.upsert_calls[0][0] == ATHLETE.id


@pytest.mark.no_db
async def test_disconnect_integration() -> None:
    """DELETE /integrations/{source}/disconnect on a connected integration → 204."""
    repo = _FakeRepo(delete_result=True)
    _use_repo(repo)

    response = await _delete("/api/v1/integrations/intervals_icu/disconnect")

    assert response.status_code == 204
    assert response.content == b""
    assert repo.delete_calls == [(ATHLETE.id, "intervals_icu")]


@pytest.mark.no_db
async def test_sync_integration_success() -> None:
    """POST /integrations/{source}/sync accepts job immediately."""
    valid_ciphertext = encrypt({"api_key": "k", "athlete_id": "i12345"})
    repo = _FakeRepo(
        get_result=_row("intervals_icu", connected=True)
        | {"credentials": {"ciphertext": valid_ciphertext}}
    )
    _use_repo(repo)

    with patch(
        "presentation.api.integrations.run_sync_job", new_callable=AsyncMock
    ) as mock_job:
        response = await _post_json("/api/v1/integrations/intervals_icu/sync", None)

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "intervals_icu"
    assert body["status"] == "accepted"
    assert body["upserted"] == 0
    assert any(call[2] == "running" for call in repo.sync_status_calls)
    mock_job.assert_awaited_once()



# ---------------------------------------------------------------------------
# Error / edge cases
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_list_integrations_requires_auth() -> None:
    """GET /integrations without access_token cookie → 401."""
    app.dependency_overrides.clear()

    response = await _get("/api/v1/integrations")

    assert response.status_code == 401


@pytest.mark.no_db
async def test_get_integration_unknown_source() -> None:
    """GET /integrations/{source} on a source the API does not support → 404."""
    _use_repo(_FakeRepo())

    response = await _get("/api/v1/integrations/garmin")

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.no_db
async def test_get_integration_not_connected() -> None:
    """An unconnected source reports connected=False rather than 404.

    Uses intervals_icu because it is the only supported source; Strava was
    removed (it had no data here and is no longer wanted).
    """
    _use_repo(_FakeRepo(get_result=None))

    response = await _get("/api/v1/integrations/intervals_icu")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "intervals_icu"
    assert body["connected"] is False


@pytest.mark.no_db
async def test_connect_integration_missing_credentials() -> None:
    """PUT /integrations/intervals_icu/connect without athlete_id+api_key → 422."""
    _use_repo(_FakeRepo())

    response = await _put_json("/api/v1/integrations/intervals_icu/connect", {})

    assert response.status_code == 422
    assert "missing credentials" in response.json()["detail"].lower()


@pytest.mark.no_db
async def test_disconnect_integration_not_found() -> None:
    """DELETE /integrations/{source}/disconnect when no row exists → 404."""
    _use_repo(_FakeRepo(delete_result=False))

    response = await _delete("/api/v1/integrations/intervals_icu/disconnect")

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.no_db
async def test_sync_integration_not_connected() -> None:
    """POST /integrations/{source}/sync when integration row is absent → 404."""
    _use_repo(_FakeRepo(get_result=None))

    response = await _post_json("/api/v1/integrations/intervals_icu/sync", None)

    assert response.status_code == 404
    assert "not connected" in response.json()["detail"].lower()


@pytest.mark.no_db
async def test_legacy_connect_path_is_not_found_without_repository_mutation() -> None:
    """The pre-/api/v1 connect path must 404 and never touch the repo."""
    repo = _FakeRepo()
    _use_repo(repo)

    response = await _put_json(
        "/api/integrations/intervals_icu/connect",
        {"athlete_id": "i12345", "api_key": "secret-key"},
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
    assert repo.upsert_calls == []


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
        self.upsert_calls: list[tuple[UUID, str, dict[str, object]]] = []
        self.delete_calls: list[tuple[UUID, str]] = []
        self.sync_status_calls: list[tuple[UUID, str, str, object]] = []

    async def list(self, _athlete_id: UUID) -> list[dict[str, object]]:
        return self.list_result

    async def get(self, _athlete_id: UUID, _source: str) -> dict[str, object] | None:
        return self.get_result

    async def upsert(
        self, athlete_id: UUID, source: str, data: dict[str, object]
    ) -> dict[str, object]:
        self.upsert_calls.append((athlete_id, source, data))
        return _row(source) | data

    async def delete(self, athlete_id: UUID, source: str) -> bool:
        self.delete_calls.append((athlete_id, source))
        return self.delete_result

    async def update_sync_status(
        self, athlete_id: UUID, source: str, status: str, message: object
    ) -> None:
        self.sync_status_calls.append((athlete_id, source, status, message))


def _row(source: str, connected: bool = False) -> dict[str, object]:
    return {
        "athlete_id": str(ATHLETE.id),
        "source": source,
        "connected": connected,
        "credentials": {"ciphertext": "stub"},
        "settings": {},
        "last_sync_at": None,
        "last_sync_status": None,
    }


def _use_repo(repo: _FakeRepo) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_integration_repo] = lambda: repo


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def _post_json(path: str, payload: dict[str, object] | None) -> Response:
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
