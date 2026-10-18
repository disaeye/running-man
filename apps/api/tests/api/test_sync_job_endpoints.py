"""HTTP contracts for the durable sync job endpoints.

Covers the shapes and status codes the data page depends on:

  - POST /integrations/{source}/sync              → 200 queued job
  - POST /integrations/{source}/sync              → 409 while a job is active
  - POST /integrations/{source}/sync              → 404 when not connected
  - POST /integrations/{source}/backfill          → 200 with the requested range
  - POST /integrations/{source}/backfill          → 422 when the start is in the future
  - GET  /integrations/{source}/jobs/current      → 200 latest job, null when never run
  - POST /integrations/{source}/jobs/{id}/cancel  → 200, or 404 when nothing is active
  - GET  /integrations/{source}/coverage          → 200 imported range
  - DELETE /integrations/{source}/disconnect      → clears data when asked
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from domain.integrations.crypto import encrypt
from domain.time import today_in_zone
from infrastructure.auth.models import Athlete
from main import app
from presentation.api.integrations import (
    get_activity_repo,
    get_integration_repo,
    get_sync_job_repo,
)
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "jobs@example.com", "hash", timezone="Asia/Shanghai")
JOB_ID = uuid4()


class _JobRepo:
    def __init__(
        self,
        current: dict[str, object] | None = None,
        active: dict[str, object] | None = None,
        cancel_result: dict[str, object] | None = None,
    ) -> None:
        self.current = current
        self.active_row = active
        self.cancel_result = cancel_result
        self.cancel_calls: list[tuple[UUID, UUID]] = []

    async def active(self, athlete_id: UUID, source: str) -> dict[str, object] | None:
        assert athlete_id == ATHLETE.id
        return self.active_row

    async def get_current(self, athlete_id: UUID, source: str) -> dict[str, object] | None:
        assert athlete_id == ATHLETE.id
        return self.current

    async def request_cancel(self, athlete_id: UUID, job_id: UUID) -> dict[str, object] | None:
        self.cancel_calls.append((athlete_id, job_id))
        return self.cancel_result

    async def sweep_stale(
        self,
        athlete_id: UUID | None = None,
        source: str | None = None,
        stale_after_seconds: int = 300,
    ) -> list[dict[str, object]]:
        _ = (athlete_id, source, stale_after_seconds)
        return []


class _IntegrationRepo:
    def __init__(self, row: dict[str, object] | None = None, delete_result: bool = True) -> None:
        self.row = row
        self.delete_result = delete_result
        self.delete_calls: list[tuple[UUID, str]] = []

    async def get(self, athlete_id: UUID, source: str) -> dict[str, object] | None:
        return self.row

    async def delete(self, athlete_id: UUID, source: str) -> bool:
        self.delete_calls.append((athlete_id, source))
        return self.delete_result


class _ActivityRepo:
    def __init__(self, range_row: dict[str, object] | None = None) -> None:
        self.range_row = range_row or {"first_day": None, "last_day": None, "total": 0}

    async def data_range(self, athlete_id: UUID, source: str | None) -> dict[str, object]:
        return self.range_row


def _connected_row() -> dict[str, object]:
    return {
        "athlete_id": ATHLETE.id,
        "source": "intervals_icu",
        "connected": True,
        "settings": {},
        "credentials": {"ciphertext": encrypt({"api_key": "k", "athlete_id": "i1"})},
    }


def _job(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "id": JOB_ID, "athlete_id": ATHLETE.id, "source": "intervals_icu",
        "kind": "incremental", "trigger": "manual", "phase": "activities",
        "status": "queued", "window_start": None, "window_end": None,
        "windows_total": 0, "windows_done": 0, "activities_seen": 0,
        "activities_upserted": 0, "activities_deduplicated": 0,
        "streams_inserted": 0, "wellness_days": 0, "ghosts_deleted": 0,
        "errors_count": 0, "errors": [], "cancel_requested": False,
        "error": None, "started_at": None, "finished_at": None,
        "heartbeat_at": None, "created_at": datetime(2026, 10, 13, tzinfo=UTC),
    }
    return base | overrides


def _use(
    job_repo: _JobRepo | None = None,
    integration: _IntegrationRepo | None = None,
    activity: _ActivityRepo | None = None,
) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_sync_job_repo] = lambda: job_repo or _JobRepo()
    app.dependency_overrides[get_integration_repo] = lambda: integration or _IntegrationRepo()
    app.dependency_overrides[get_activity_repo] = lambda: activity or _ActivityRepo()


async def _request(method: str, url: str, json_body: object | None = None) -> Response:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.request(method, url, json=json_body)


@pytest.mark.no_db
async def test_sync_queues_a_job_and_runs_it_in_the_background() -> None:
    _use(integration=_IntegrationRepo(_connected_row()))

    with patch(
        "presentation.api.integrations.run_sync_job", new_callable=AsyncMock
    ) as runner, patch(
        "presentation.api.integrations.create_sync_job",
        new_callable=AsyncMock,
        return_value=_job(),
    ):
        response = await _request("POST", "/api/v1/integrations/intervals_icu/sync")

    assert response.status_code == 200
    assert response.json()["status"] == "queued"
    runner.assert_awaited_once()
    assert runner.await_args is not None
    assert runner.await_args.args[0] == JOB_ID


@pytest.mark.no_db
async def test_sync_refuses_a_second_job_while_one_is_active() -> None:
    _use(
        job_repo=_JobRepo(active=_job(status="running")),
        integration=_IntegrationRepo(_connected_row()),
    )

    response = await _request("POST", "/api/v1/integrations/intervals_icu/sync")

    assert response.status_code == 409
    assert "正在运行" in response.json()["detail"]


@pytest.mark.no_db
async def test_sync_requires_a_connected_integration() -> None:
    _use(integration=_IntegrationRepo(None))

    response = await _request("POST", "/api/v1/integrations/intervals_icu/sync")

    assert response.status_code == 404


@pytest.mark.no_db
async def test_backfill_queues_the_range_the_athlete_asked_for() -> None:
    _use(integration=_IntegrationRepo(_connected_row()))
    requested = date(2024, 3, 1)

    with patch(
        "presentation.api.integrations.run_sync_job", new_callable=AsyncMock
    ), patch(
        "presentation.api.integrations.create_sync_job",
        new_callable=AsyncMock,
        return_value=_job(kind="backfill", window_start=requested),
    ) as create:
        response = await _request(
            "POST",
            "/api/v1/integrations/intervals_icu/backfill",
            {"from_date": requested.isoformat()},
        )

    assert response.status_code == 200
    assert create.await_args is not None
    assert create.await_args.args[4] == requested
    # The window ends on the athlete's local today, not the host's.
    assert create.await_args.args[5] == today_in_zone(ATHLETE.timezone)


@pytest.mark.no_db
async def test_backfill_rejects_a_start_after_today() -> None:
    _use(integration=_IntegrationRepo(_connected_row()))
    tomorrow = today_in_zone(ATHLETE.timezone) + timedelta(days=1)

    response = await _request(
        "POST",
        "/api/v1/integrations/intervals_icu/backfill",
        {"from_date": tomorrow.isoformat()},
    )

    assert response.status_code == 422


@pytest.mark.no_db
async def test_current_job_returns_the_latest_row() -> None:
    _use(job_repo=_JobRepo(current=_job(status="running", windows_done=2, windows_total=5)))

    response = await _request("GET", "/api/v1/integrations/intervals_icu/jobs/current")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "running"
    assert (body["windows_done"], body["windows_total"]) == (2, 5)


@pytest.mark.no_db
async def test_current_job_is_null_before_the_first_sync() -> None:
    _use(job_repo=_JobRepo(current=None))

    response = await _request("GET", "/api/v1/integrations/intervals_icu/jobs/current")

    assert response.status_code == 200
    assert response.json() is None


@pytest.mark.no_db
async def test_cancel_marks_the_running_job() -> None:
    repo = _JobRepo(cancel_result=_job(status="running", cancel_requested=True))
    _use(job_repo=repo)

    response = await _request(
        "POST", f"/api/v1/integrations/intervals_icu/jobs/{JOB_ID}/cancel"
    )

    assert response.status_code == 200
    assert response.json()["cancel_requested"] is True
    assert repo.cancel_calls == [(ATHLETE.id, JOB_ID)]


@pytest.mark.no_db
async def test_cancel_without_an_active_job_is_404() -> None:
    _use(job_repo=_JobRepo(cancel_result=None))

    response = await _request(
        "POST", f"/api/v1/integrations/intervals_icu/jobs/{JOB_ID}/cancel"
    )

    assert response.status_code == 404


@pytest.mark.no_db
async def test_coverage_reports_the_imported_range() -> None:
    _use(
        activity=_ActivityRepo(
            {
                "first_day": date(2024, 3, 1),
                "last_day": date(2026, 10, 12),
                "total": 412,
            }
        )
    )

    response = await _request("GET", "/api/v1/integrations/intervals_icu/coverage")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "source": "intervals_icu",
        "first_activity_date": "2024-03-01",
        "last_activity_date": "2026-10-12",
        "activity_count": 412,
    }


@pytest.mark.no_db
async def test_disconnect_can_clear_imported_data() -> None:
    integration = _IntegrationRepo(_connected_row())
    _use(integration=integration)

    with patch(
        "presentation.api.integrations.clear_activities", new_callable=AsyncMock
    ) as clear:
        response = await _request(
            "DELETE", "/api/v1/integrations/intervals_icu/disconnect?clear_data=true"
        )

    assert response.status_code == 204
    clear.assert_awaited_once()
    assert integration.delete_calls == [(ATHLETE.id, "intervals_icu")]


@pytest.mark.no_db
async def test_disconnect_keeps_data_by_default() -> None:
    _use(integration=_IntegrationRepo(_connected_row()))

    with patch(
        "presentation.api.integrations.clear_activities", new_callable=AsyncMock
    ) as clear:
        response = await _request("DELETE", "/api/v1/integrations/intervals_icu/disconnect")

    assert response.status_code == 204
    clear.assert_not_awaited()
