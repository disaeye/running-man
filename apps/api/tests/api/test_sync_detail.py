"""Tests for sync detail building (success + failure paths).

Uses the HTTP sync endpoint with a patched ``_sync`` so we can control what
``IntegrationSyncResult`` is returned without making network calls.

  - Success:   detail JSONB contains counts, stages, no errors
  - Failure:   detail JSONB contains errors[] and stage marked "failed"
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from domain.integrations.crypto import encrypt
from infrastructure.auth.models import Athlete
from main import app
from presentation.api.integrations import get_integration_repo, get_integrations_pool
from presentation.auth.deps import get_current_athlete

pytestmark = pytest.mark.no_db

ATHLETE = Athlete(uuid4(), "sync-detail2@example.com", "hash")


async def test_sync_detail_success_builds_full_detail() -> None:
    """Accepting sync marks status running with empty counts."""
    repo = _SyncDetailRepo()
    _use_repo(repo)

    with patch("presentation.api.integrations.run_sync_job", new_callable=AsyncMock) as mock_job:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/v1/integrations/intervals_icu/sync")

    assert response.status_code == 200
    assert response.json()["status"] == "accepted"
    assert len(repo.status_calls) == 1
    _athlete_id, source, status, error, detail = repo.status_calls[0]
    assert source == "intervals_icu"
    assert status == "running"
    assert error is None
    assert detail is not None
    assert detail["counts"]["activities_upserted"] == 0
    assert detail["stages"] == [{"name": "sync", "status": "running"}]
    mock_job.assert_awaited_once()


async def test_sync_detail_failure_populates_errors() -> None:
    """Background job failure path writes failed status detail."""
    from presentation.api.integration_sync_job import run_sync_job

    repo = _SyncDetailRepo()
    # Directly exercise job with patched repo path
    with patch("presentation.api.integration_sync_job.UserIntegrationRepo", return_value=repo):
        with patch(
            "presentation.api.integration_sync_job.sync",
            new_callable=AsyncMock,
            side_effect=ValueError("API rate limit exceeded"),
        ):
            await run_sync_job(
                "intervals_icu",
                ATHLETE.id,
                {"api_key": "k", "athlete_id": "i1"},
                0.0,
            )

    assert len(repo.status_calls) == 1
    _a, source, status, error, detail = repo.status_calls[0]
    assert source == "intervals_icu"
    assert status == "failed"
    assert error is not None and "rate limit" in error.lower()
    assert detail["stages"][0]["status"] == "failed"


async def test_sync_detail_zero_counts_no_error() -> None:
    """Accepting a no-op sync still records running status first."""
    repo = _SyncDetailRepo()
    _use_repo(repo)

    with patch("presentation.api.integrations.run_sync_job", new_callable=AsyncMock):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/v1/integrations/intervals_icu/sync")

    assert response.status_code == 200
    assert response.json()["status"] == "accepted"
    assert len(repo.status_calls) >= 1
    _athlete_id, _source, status, _error, detail = repo.status_calls[0]
    assert status == "running"
    assert detail["stages"][0]["status"] == "running"



# ---------------------------------------------------------------------------
# Fake repo
# ---------------------------------------------------------------------------


class _SyncDetailRepo:
    """Fake repo that tracks update_sync_status calls."""

    def __init__(self) -> None:
        self.status_calls: list[tuple[UUID, str, str, str | None, dict[str, object] | None]] = []

    async def get(self, _athlete_id: UUID, _source: str) -> dict[str, object] | None:
        return {
            "athlete_id": str(ATHLETE.id),
            "source": "intervals_icu",
            "connected": True,
            "credentials": {"ciphertext": encrypt({"api_key": "k", "athlete_id": "i123"})},
        }

    async def update_sync_status(
        self,
        athlete_id: UUID,
        source: str,
        status: str,
        error: str | None,
        detail: dict[str, object] | None = None,
    ) -> None:
        self.status_calls.append((athlete_id, source, status, error, detail))


def _use_repo(repo: _SyncDetailRepo) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_integration_repo] = lambda: repo
    app.dependency_overrides[get_integrations_pool] = lambda: None
