from datetime import UTC, datetime
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.sync_runs import get_sync_run_repo
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "sync@example.com", "hash")


class _SyncRunRepo:
    """Stand-in for SyncRunRepo; mirrors its ``list`` signature.

    The endpoint passes ``source``, ``status`` and ``limit`` through, so a
    stub that accepts only ``athlete_id`` raises TypeError and the test fails
    for a reason unrelated to what it is checking.
    """

    async def list(
        self,
        athlete_id,
        source=None,
        status=None,
        limit=50,
    ):
        assert athlete_id == ATHLETE.id
        return [
            {
                "id": uuid4(),
                "source": source or "intervals_icu",
                "trigger": "manual",
                "started_at": datetime(2026, 1, 1, tzinfo=UTC),
                "status": "success",
            }
        ]


@pytest.mark.no_db
async def test_lists_only_authenticated_athlete_sync_runs() -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_sync_run_repo] = _SyncRunRepo

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/integrations/sync-runs")

    assert response.status_code == 200
    assert response.json()[0]["source"] == "intervals_icu"


@pytest.mark.no_db
async def test_sync_runs_forwards_filters_to_the_repository() -> None:
    """Filter and limit query params must reach the repository.

    They are declared as plain parameters rather than Query(...) aliases, so a
    silent drop would be invisible without asserting the pass-through.
    """
    seen: dict[str, object] = {}

    class _RecordingRepo:
        async def list(self, athlete_id, source=None, status=None, limit=50):
            seen.update(source=source, status=status, limit=limit)
            return []

    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_sync_run_repo] = _RecordingRepo

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/integrations/sync-runs",
            params={"source": "intervals_icu", "status": "failed", "limit": 5},
        )

    assert response.status_code == 200
    assert seen == {"source": "intervals_icu", "status": "failed", "limit": 5}
