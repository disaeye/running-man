from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from domain.integrations.crypto import encrypt
from infrastructure.auth.models import Athlete
from infrastructure.repositories.activity import ActivitySyncStats
from main import app
from presentation.api.integration_sync_detail import IntegrationSyncResult, sync_detail
from presentation.api.integrations import get_integration_repo
from presentation.auth.deps import get_current_athlete

pytestmark = pytest.mark.no_db

ATHLETE = Athlete(uuid4(), "sync-detail@example.com", "hash")


async def test_sync_persists_detail_without_public_response_leak(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = _FakeRepo()
    _use_repo(repo)

    def _final_detail() -> dict[str, object]:
        return sync_detail(
            IntegrationSyncResult(
                activity_stats=ActivitySyncStats(
                    upserted=3, deduplicated=1, total_processed=4
                ),
                wellness_count=2,
                streams_inserted=8,
            ),
            0.0,
            "success",
            None,
        )

    async def _fake_job(
        _source: str, athlete_id: UUID, _credentials: dict[str, object], _started_at: float
    ) -> None:
        # The real run_sync_job builds its own UserIntegrationRepo; simulate it
        # writing the final detail through the injected repo instead.
        await repo.update_sync_status(athlete_id, _source, "success", None, _final_detail())

    monkeypatch.setattr("presentation.api.integrations.run_sync_job", _fake_job)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/integrations/intervals_icu/sync")

    assert response.status_code == 200
    body = response.json()
    assert "last_sync_detail" not in body

    # The endpoint persists a "running" marker first (guards concurrent syncs
    # via last_sync_status), then the background job records the final result.
    assert len(repo.sync_status_calls) == 2
    running_call, success_call = repo.sync_status_calls

    assert running_call[:4] == (ATHLETE.id, "intervals_icu", "running", None)
    assert running_call[4]["counts"] == {
        "activities_upserted": 0,
        "activities_deduped": 0,
        "wellness_days": 0,
        "streams_inserted": 0,
        "ghosts_deleted": 0,
    }
    assert isinstance(running_call[4]["duration_ms"], int)
    assert running_call[4]["stages"] == [{"name": "sync", "status": "running"}]
    assert running_call[4]["errors"] == []

    assert success_call[:4] == (ATHLETE.id, "intervals_icu", "success", None)
    assert success_call[4]["counts"] == {
        "activities_upserted": 3,
        "activities_deduped": 1,
        "wellness_days": 2,
        "streams_inserted": 8,
        "ghosts_deleted": 0,
    }
    assert isinstance(success_call[4]["duration_ms"], int)
    assert success_call[4]["stages"] == [{"name": "sync", "status": "success"}]
    assert success_call[4]["errors"] == []


class _FakeRepo:
    def __init__(self) -> None:
        self.sync_status_calls: list[
            tuple[UUID, str, str, str | None, dict[str, object]]
        ] = []

    async def get(self, _athlete_id: UUID, _source: str) -> dict[str, object]:
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
        assert detail is not None
        self.sync_status_calls.append((athlete_id, source, status, error, detail))


def _use_repo(repo: _FakeRepo) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_integration_repo] = lambda: repo
