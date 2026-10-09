"""HTTP-level tests for ``/api/activities/*`` endpoints.

Complements coverage in test_endpoints / test_activity_export / test_activity_laps /
test_batch_upload / test_edge_cases: upload 201/400/401, streams 403/404,
delete 204/404/403, and bulk delete 200.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from infrastructure.auth.models import Athlete
from main import app
from tests.factories.fit_generator import generate_fit_stream

ATHLETE_A = Athlete(uuid4(), "a@example.com", "hash")
ATHLETE_B = Athlete(uuid4(), "b@example.com", "hash")


class _FakeWellnessDeleteCursor:
    """丢弃 DELETE 语句的空游标，避免 no_db 测试接触真实连接池。"""

    async def __aenter__(self) -> "_FakeWellnessDeleteCursor":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def execute(self, _query: str, _params: object = None) -> None:
        return None


class _FakeWellnessDeleteConnection:
    def cursor(self) -> _FakeWellnessDeleteCursor:
        return _FakeWellnessDeleteCursor()

    async def __aenter__(self) -> "_FakeWellnessDeleteConnection":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None


class _FakeWellnessDeletePool:
    def connection(self) -> _FakeWellnessDeleteConnection:
        return _FakeWellnessDeleteConnection()


# ---------------------------------------------------------------------------
# POST /activities/upload
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_upload_activity_success() -> None:
    """Valid FIT file → 201 with ActivitySummary shape."""
    repo = _RecordingRepo()
    _use_repo(ATHLETE_A, repo)

    files = {
        "file": ("ride.fit", generate_fit_stream(duration_seconds=3), "application/octet-stream")
    }
    with (
        patch(
            "application.computation.orchestration.enqueue_activity_recompute",
            new_callable=AsyncMock,
            return_value=1,
        ),
        patch(
            "presentation.api.activities.start_upload_run",
            new_callable=AsyncMock,
            return_value=None,
        ),
    ):
        response = await _post_files("/api/v1/activities/upload", files)

    assert response.status_code == 201
    body = response.json()
    assert "activity_id" in body
    assert body["source"] == "fit"
    assert body["file_type"] == "fit"
    assert body["recompute_status"] == "queued"
    assert body["recompute_generation"] == 1
    assert len(repo.upload_calls) == 1
    assert repo.upload_calls[0].athlete_id == ATHLETE_A.id


@pytest.mark.no_db
async def test_upload_unsupported_file_type_returns_400() -> None:
    """A .txt file → 400 (unsupported activity file type)."""
    _use_repo(ATHLETE_A, _RecordingRepo())

    files = {"file": ("notes.txt", b"not an activity", "text/plain")}
    response = await _post_files("/api/v1/activities/upload", files)

    assert response.status_code == 400
    assert "unsupported" in response.json()["detail"].lower()


@pytest.mark.no_db
async def test_upload_requires_auth() -> None:
    """No access_token cookie → 401."""
    app.dependency_overrides.clear()

    files = {
        "file": ("ride.fit", generate_fit_stream(duration_seconds=3), "application/octet-stream")
    }
    response = await _post_files("/api/v1/activities/upload", files)

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /activities/{id}/streams — 403 / 404 error cases
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_get_streams_forbidden_when_owned_by_other() -> None:
    """Activity exists but belongs to another athlete → 403."""
    _use_repo(ATHLETE_A, _FakeRepo(owner_id=ATHLETE_B.id))

    response = await _get("/api/v1/activities/b-1/streams")

    assert response.status_code == 403
    assert "another athlete" in response.json()["detail"].lower()


@pytest.mark.no_db
async def test_get_streams_not_found() -> None:
    """Activity does not exist → empty list (200), per endpoint contract."""
    _use_repo(ATHLETE_A, _FakeRepo(owner_id=ATHLETE_A.id, exists_ids=set()))

    response = await _get("/api/v1/activities/never-existed/streams")

    assert response.status_code == 200
    assert response.json() == []


# ---------------------------------------------------------------------------
# DELETE /activities/{id}
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_delete_activity_success() -> None:
    """Owned activity deleted → 204 No Content and derived refresh runs."""
    repo = _FakeRepo(owner_id=ATHLETE_A.id)
    _use_repo(ATHLETE_A, repo)

    with patch(
        "presentation.api.activity_flags.enqueue_activity_recompute",
        new_callable=AsyncMock,
        return_value=1,
    ) as enqueue:
        response = await _delete("/api/v1/activities/a-1")

    assert response.status_code == 204
    assert response.content == b""
    assert repo.soft_delete_calls == [("a-1", ATHLETE_A.id)]
    enqueue.assert_awaited_once_with(ATHLETE_A.id, "delete:activity")


@pytest.mark.no_db
async def test_delete_activity_not_found() -> None:
    """Activity does not exist → 404."""
    _use_repo(ATHLETE_A, _FakeRepo(owner_id=ATHLETE_A.id, exists_ids=set()))

    response = await _delete("/api/v1/activities/never-existed")

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.no_db
async def test_delete_activity_forbidden_when_owned_by_other() -> None:
    """Activity exists but belongs to another athlete → 403."""
    _use_repo(ATHLETE_A, _FakeRepo(owner_id=ATHLETE_B.id))

    response = await _delete("/api/v1/activities/b-1")

    assert response.status_code == 403
    assert "another athlete" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# DELETE /activities (bulk)
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_delete_all_activities_bulk() -> None:
    """DELETE /activities without source filter → 200, calls delete_all."""
    repo = _FakeRepo(owner_id=ATHLETE_A.id)
    integrations = _FakeIntegrations()
    _use_repo(ATHLETE_A, repo, integrations)

    with (
        patch(
            "application.computation.orchestration.enqueue_activity_recompute",
            new_callable=AsyncMock,
            return_value=1,
        ),
        patch(
            "presentation.api.activity_bulk_delete.get_pool",
            return_value=_FakeWellnessDeletePool(),
        ),
    ):
        response = await _delete("/api/v1/activities")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "recompute_status": "queued",
        "recompute_generation": 1,
    }
    assert repo.delete_all_calls == [ATHLETE_A.id]
    assert repo.delete_by_source_calls == []
    assert integrations.clear_calls == [(ATHLETE_A.id, None)]


@pytest.mark.no_db
async def test_delete_activities_by_source_bulk() -> None:
    """DELETE /activities?source=upload → 200, expands to fit/gpx/tcx."""
    repo = _FakeRepo(owner_id=ATHLETE_A.id)
    integrations = _FakeIntegrations()
    _use_repo(ATHLETE_A, repo, integrations)

    with patch(
        "application.computation.orchestration.enqueue_activity_recompute",
        new_callable=AsyncMock,
        return_value=1,
    ):
        response = await _delete("/api/v1/activities?source=upload")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "recompute_status": "queued",
        "recompute_generation": 1,
    }
    assert repo.delete_by_source_calls == [
        (ATHLETE_A.id, "fit"),
        (ATHLETE_A.id, "gpx"),
        (ATHLETE_A.id, "tcx"),
    ]
    assert repo.delete_all_calls == []


# ---------------------------------------------------------------------------
# helpers (test doubles live in activities_endpoint_helpers)
# ---------------------------------------------------------------------------

from tests.api.activities_endpoint_helpers import (  # noqa: E402
    _delete,
    _FakeIntegrations,
    _FakeRepo,
    _get,
    _post_files,
    _RecordingRepo,
    _use_repo,
)
