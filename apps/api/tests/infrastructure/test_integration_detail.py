"""``last_sync_detail`` round trip through the integration row.

A finished job mirrors its counters onto ``user_integrations`` so the source card
and the staleness badge keep working from the existing response shape. The
public filter strips only ``credentials``, so the detail passes through to the
client.

``compute_data_health`` is patched in the GET tests to keep them off the DB.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from application.integrations import sync_jobs as execution
from application.integrations.sync_jobs import JobOutcome
from domain.integrations.crypto import encrypt
from infrastructure.auth.models import Athlete
from main import app
from presentation.api.integrations import get_integration_repo, get_integrations_pool
from presentation.auth.deps import get_current_athlete

pytestmark = pytest.mark.no_db

ATHLETE = Athlete(uuid4(), "detail-test@example.com", "hash")
JOB_ID = uuid4()


def _detail(**counts: int) -> dict[str, object]:
    return {
        "counts": {
            "activities_upserted": counts.get("upserted", 0),
            "activities_deduped": counts.get("deduplicated", 0),
            "wellness_days": counts.get("wellness", 0),
            "streams_inserted": counts.get("streams", 0),
            "ghosts_deleted": counts.get("ghosts", 0),
        },
        "duration_ms": 1200,
        "stages": [{"name": "sync", "status": counts.get("status", "success")}],
        "errors": [],
        "job_id": str(JOB_ID),
    }


@patch("presentation.api.integrations.compute_data_health", new_callable=AsyncMock)
async def test_finished_job_detail_is_visible_through_get(
    mock_health: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    mock_health.return_value = {"activities": {"data_as_of": datetime.now(UTC)}}
    repo = _DetailTrackingRepo()
    _use_repo(repo)
    monkeypatch.setattr(execution, "UserIntegrationRepo", lambda: repo)
    monkeypatch.setattr(
        execution,
        "execute_job",
        lambda _job_id, _credentials: JobOutcome(
            "success", None, _detail(upserted=3, deduplicated=1, wellness=2, streams=8)
        ),
    )

    await execution.run_sync_job(JOB_ID, ATHLETE.id, "intervals_icu", {"api_key": "k"})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/integrations/intervals_icu")

    assert response.status_code == 200
    body = response.json()
    assert body["last_sync_status"] == "success"
    detail = body["last_sync_detail"]
    assert detail["counts"] == {
        "activities_upserted": 3,
        "activities_deduped": 1,
        "wellness_days": 2,
        "streams_inserted": 8,
        "ghosts_deleted": 0,
    }
    assert isinstance(detail["duration_ms"], int)
    assert detail["stages"] == [{"name": "sync", "status": "success"}]
    assert detail["errors"] == []


@patch("presentation.api.integrations.compute_data_health", new_callable=AsyncMock)
async def test_public_filter_passes_detail_and_strips_credentials(
    mock_health: AsyncMock,
) -> None:
    mock_health.return_value = {"activities": {"data_as_of": datetime.now(UTC)}}
    _use_repo(_DetailTrackingRepo())

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/integrations")

    assert response.status_code == 200
    body = response.json()
    for entry in body:
        assert "last_sync_detail" in entry
        assert "credentials" not in entry

    intervals = next(entry for entry in body if entry["source"] == "intervals_icu")
    assert intervals["last_sync_detail"]["counts"]["activities_upserted"] == 3
    # A source that never synced reports a null detail rather than an empty one.
    other = next(entry for entry in body if entry["source"] == "other_source")
    assert other["last_sync_detail"] is None


class _DetailTrackingRepo:
    """Fake repo that stores sync status and returns it from get/list."""

    def __init__(self) -> None:
        self._integrations: dict[str, dict[str, object]] = {
            "intervals_icu": _row(
                "intervals_icu",
                connected=True,
                last_sync_status="success",
                last_sync_detail=_detail(upserted=3, deduplicated=1, wellness=2, streams=8),
            ),
            "other_source": _row("other_source", connected=False),
        }

    async def list(self, _athlete_id: UUID) -> list[dict[str, object]]:
        return list(self._integrations.values())

    async def get(self, _athlete_id: UUID, source: str) -> dict[str, object] | None:
        return self._integrations.get(source)

    async def update_sync_status(
        self,
        _athlete_id: UUID,
        source: str,
        status: str,
        error: str | None,
        detail: dict[str, object] | None = None,
    ) -> dict[str, object] | None:
        row = self._integrations.get(source)
        if row is not None:
            row["last_sync_status"] = status
            row["last_sync_error"] = error
            row["last_sync_detail"] = detail
        return row


def _row(
    source: str,
    connected: bool = False,
    last_sync_status: str | None = None,
    last_sync_detail: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "athlete_id": str(ATHLETE.id),
        "source": source,
        "connected": connected,
        "credentials": {"ciphertext": encrypt({"api_key": "k", "athlete_id": "i123"})},
        "settings": {},
        "last_sync_at": None,
        "last_sync_status": last_sync_status,
        "last_sync_error": None,
        "last_sync_detail": last_sync_detail,
    }


def _use_repo(repo: _DetailTrackingRepo) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_integration_repo] = lambda: repo
    app.dependency_overrides[get_integrations_pool] = lambda: None
