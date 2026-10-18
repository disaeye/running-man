"""The sync response must not echo anything sensitive.

The trigger now answers with the job row the progress UI polls. That payload is
built from the job table, so it can never carry the stored credentials or the
integration's own ``last_sync_detail`` — this test pins that.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from domain.integrations.crypto import encrypt
from infrastructure.auth.models import Athlete
from main import app
from presentation.api.integrations import (
    get_integration_repo,
    get_sync_job_repo,
)
from presentation.auth.deps import get_current_athlete

pytestmark = pytest.mark.no_db

ATHLETE = Athlete(uuid4(), "sync-detail@example.com", "hash", timezone="Asia/Shanghai")
JOB_ID = uuid4()


class _JobRepo:
    async def active(self, _athlete_id: UUID, _source: str) -> None:
        return None

    async def sweep_stale(
        self,
        athlete_id: UUID | None = None,
        source: str | None = None,
        stale_after_seconds: int = 300,
    ) -> list[dict[str, object]]:
        _ = (athlete_id, source, stale_after_seconds)
        return []


class _IntegrationRepo:
    async def get(self, _athlete_id: UUID, _source: str) -> dict[str, object]:
        return {
            "athlete_id": str(ATHLETE.id),
            "source": "intervals_icu",
            "connected": True,
            "credentials": {"ciphertext": encrypt({"api_key": "k", "athlete_id": "i123"})},
            "last_sync_detail": {"counts": {"activities_upserted": 99}},
        }


def _job() -> dict[str, object]:
    return {
        "id": JOB_ID,
        "source": "intervals_icu",
        "kind": "incremental",
        "trigger": "manual",
        "phase": "activities",
        "status": "queued",
        "created_at": datetime(2026, 10, 13, tzinfo=UTC),
    }


async def test_sync_response_is_the_job_and_leaks_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_integration_repo] = lambda: _IntegrationRepo()
    app.dependency_overrides[get_sync_job_repo] = lambda: _JobRepo()

    with patch(
        "presentation.api.integrations.run_sync_job", new_callable=AsyncMock
    ), patch(
        "presentation.api.integrations.create_sync_job",
        new_callable=AsyncMock,
        return_value=_job(),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/v1/integrations/intervals_icu/sync")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(JOB_ID)
    for leaked in ("credentials", "last_sync_detail", "last_sync_error"):
        assert leaked not in body
