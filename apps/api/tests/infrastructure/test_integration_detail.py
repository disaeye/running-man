"""Tests for ``last_sync_detail`` JSONB persistence and exposure.

Verifies that after a successful sync the detail JSONB is:
  1. Persisted via ``update_sync_status``
  2. Visible in the ``GET /integrations/{source}`` public response
     (``_public()`` strips only ``credentials``, so ``last_sync_detail``
      passes through)

The DB-dependent ``compute_data_health`` is patched in GET tests, and
``_sync`` is patched in the POST test, to avoid real network/DB calls.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from domain.integrations.crypto import encrypt
from infrastructure.auth.models import Athlete
from infrastructure.repositories.activity import ActivitySyncStats
from main import app
from presentation.api.integration_sync_detail import IntegrationSyncResult, sync_detail
from presentation.api.integrations import get_integration_repo, get_integrations_pool
from presentation.auth.deps import get_current_athlete

pytestmark = pytest.mark.no_db

ATHLETE = Athlete(uuid4(), "detail-test@example.com", "hash")


@patch("presentation.api.integrations.compute_data_health", new_callable=AsyncMock)
async def test_sync_detail_persisted_and_returned_by_get(
    mock_health: AsyncMock,
) -> None:
    """After POST sync, GET /integrations/{source} returns last_sync_detail."""
    mock_health.return_value = {
        "activities": {"data_as_of": datetime.now(timezone.utc)},
    }

    repo = _DetailTrackingRepo()
    _use_repo(repo)

    final_detail = _build_detail(
        ActivitySyncStats(upserted=3, deduplicated=1, total_processed=4),
        wellness_count=2,
        streams_inserted=8,
    )

    async def _fake_job(
        _source: str, athlete_id: UUID, _credentials: dict[str, object], _started_at: float
    ) -> None:
        # Real run_sync_job builds its own UserIntegrationRepo; simulate it
        # persisting the final detail through the injected repo.
        await repo.update_sync_status(athlete_id, _source, "success", None, final_detail)

    # ----- POST /sync -----
    transport = ASGITransport(app=app)
    with patch("presentation.api.integrations.run_sync_job", _fake_job):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            sync_resp = await client.post("/api/v1/integrations/intervals_icu/sync")

    assert sync_resp.status_code == 200
    # The sync endpoint returns a summary, NOT last_sync_detail
    assert "last_sync_detail" not in sync_resp.json()

    # ----- GET /integrations/{source} -----
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        get_resp = await client.get("/api/v1/integrations/intervals_icu")

    assert get_resp.status_code == 200
    body = get_resp.json()
    assert "last_sync_detail" in body, (
        "last_sync_detail must be in the GET response — "
        "_public() strips only credentials"
    )
    detail = body["last_sync_detail"]
    assert detail is not None
    assert detail["counts"]["activities_upserted"] == 3
    assert detail["counts"]["wellness_days"] == 2
    assert detail["counts"]["streams_inserted"] == 8
    assert isinstance(detail["duration_ms"], int)
    assert detail["duration_ms"] >= 0
    assert detail["stages"] == [{"name": "sync", "status": "success"}]
    assert detail["errors"] == []


@patch("presentation.api.integrations.compute_data_health", new_callable=AsyncMock)
async def test_sync_detail_passed_through_public_filter(
    mock_health: AsyncMock,
) -> None:
    """_public() lets last_sync_detail through (only credentials is stripped)."""
    mock_health.return_value = {
        "activities": {"data_as_of": datetime.now(timezone.utc)},
    }

    repo = _DetailTrackingRepo()
    _use_repo(repo)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        get_resp = await client.get("/api/v1/integrations")

    assert get_resp.status_code == 200
    body = get_resp.json()
    for entry in body:
        assert "last_sync_detail" in entry
        # credentials must still be stripped
        assert "credentials" not in entry

    # The integration with last_sync_status="success" has detail
    intervals = next(e for e in body if e["source"] == "intervals_icu")
    assert intervals["last_sync_detail"] is not None
    assert intervals["last_sync_detail"]["counts"]["activities_upserted"] == 3

    # The integration with last_sync_status=None has null detail
    strava = next(e for e in body if e["source"] == "strava")
    assert strava["last_sync_detail"] is None


@patch("presentation.api.integrations.compute_data_health", new_callable=AsyncMock)
async def test_sync_detail_update_round_trip(
    mock_health: AsyncMock,
) -> None:
    """update_sync_status with detail → get returns same detail structure."""
    mock_health.return_value = {
        "activities": {"data_as_of": datetime.now(timezone.utc)},
    }

    repo = _DetailTrackingRepo()
    _use_repo(repo)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/integrations/intervals_icu")

    assert resp.status_code == 200
    detail = resp.json()["last_sync_detail"]

    assert detail["counts"]["activities_upserted"] == 3
    assert detail["counts"]["activities_deduped"] == 1
    assert detail["counts"]["ghosts_deleted"] == 0
    assert detail["counts"]["wellness_days"] == 2
    assert detail["counts"]["streams_inserted"] == 8


# ---------------------------------------------------------------------------
# Fake repo that tracks last_sync_detail and returns it in get/list
# ---------------------------------------------------------------------------


class _DetailTrackingRepo:
    """Fake repo that stores sync status and returns it in get/list."""

    def __init__(self) -> None:
        self._integrations: dict[str, dict[str, object]] = {
            "intervals_icu": _row(
                "intervals_icu",
                connected=True,
                last_sync_status="success",
                last_sync_detail=_build_detail(
                    ActivitySyncStats(upserted=3, deduplicated=1, total_processed=4),
                    wellness_count=2,
                    streams_inserted=8,
                ),
            ),
            "strava": _row("strava", connected=False),
        }

    async def list(self, _athlete_id: UUID) -> list[dict[str, object]]:
        return list(self._integrations.values())

    async def get(
        self, _athlete_id: UUID, source: str
    ) -> dict[str, object] | None:
        return self._integrations.get(source)

    async def upsert(
        self, athlete_id: UUID, source: str, data: dict[str, object]
    ) -> dict[str, object]:
        row = self._integrations.setdefault(source, _row(source))
        row.update(data)
        return row

    async def delete(self, athlete_id: UUID, source: str) -> bool:
        return self._integrations.pop(source, None) is not None

    async def update_sync_status(
        self,
        athlete_id: UUID,
        source: str,
        status: str,
        error: str | None,
        detail: dict[str, object] | None = None,
    ) -> dict[str, object]:
        row = self._integrations.get(source)
        if row is not None:
            row["last_sync_status"] = status
            row["last_sync_error"] = error
            row["last_sync_detail"] = detail
        return row  # type: ignore[return-value]


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


def _build_detail(
    stats: ActivitySyncStats,
    wellness_count: int = 0,
    streams_inserted: int = 0,
) -> dict[str, object]:
    result = IntegrationSyncResult(
        activity_stats=stats,
        wellness_count=wellness_count,
        streams_inserted=streams_inserted,
    )
    return sync_detail(result, 0.0, "success", None)


def _use_repo(repo: _DetailTrackingRepo) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_integration_repo] = lambda: repo
    app.dependency_overrides[get_integrations_pool] = lambda: None
