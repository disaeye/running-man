"""Test doubles and request helpers for the activities endpoint tests.

Split out so both the test module and this helper module stay within the
repository's file-size limit.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.activities import get_activity_repo, get_integration_repo
from presentation.auth.deps import get_current_athlete


@dataclass
class _UploadCall:
    athlete_id: UUID
    summary: dict[str, object]
    streams: list[dict[str, object]]


class _RecordingRepo:
    """Records upsert_upload calls; used by upload happy path."""

    def __init__(self) -> None:
        self.upload_calls: list[_UploadCall] = []

    async def upsert_upload(
        self, athlete_id: UUID, summary: dict[str, object], streams: list[dict[str, object]]
    ) -> dict[str, object]:
        self.upload_calls.append(_UploadCall(athlete_id, summary, streams))
        return {**summary, "deduplicated": False}

    async def upsert_laps(
        self, athlete_id: UUID, activity_id: str, laps: list[dict[str, object]]
    ) -> int:
        return len(laps)


class _FakeRepo:
    """In-memory ActivityRepo with configurable ownership/existence semantics.

    - ``owner_id``: the athlete who owns the canonical activity ids ("a-1", "b-1").
      Tests use this to model both the "owner" and "other athlete" cases.
    - ``exists_ids``: which activity ids exist at all (for delete/streams 404 logic).
      Defaults to {"a-1", "b-1"} so the 403-vs-404 branch can be exercised.
    """

    def __init__(
        self,
        owner_id: UUID,
        exists_ids: set[str] | None = None,
    ) -> None:
        self.owner_id = owner_id
        self.exists_ids = exists_ids if exists_ids is not None else {"a-1", "b-1"}
        self.delete_calls: list[tuple[str, UUID]] = []
        self.soft_delete_calls: list[tuple[str, UUID]] = []
        self.delete_all_calls: list[UUID] = []
        self.delete_by_source_calls: list[tuple[UUID, str]] = []

    async def list_by_range(
        self, _athlete_id: UUID, _start: date, _end: date
    ) -> list[dict[str, object]]:
        return []

    async def get_by_id(self, athlete_id: UUID, activity_id: str) -> dict[str, object] | None:
        if athlete_id == self.owner_id and activity_id in self.exists_ids:
            return _summary(activity_id)
        return None

    async def exists(self, activity_id: str) -> bool:
        return activity_id in self.exists_ids

    async def get_streams(self, _athlete_id: UUID, _activity_id: str) -> list[dict[str, object]]:
        return []

    async def delete(self, athlete_id: UUID, activity_id: str) -> bool:
        """Hard delete, still used by the bulk-clear path."""
        self.delete_calls.append((activity_id, athlete_id))
        if athlete_id == self.owner_id and activity_id in self.exists_ids:
            return True
        return False

    async def soft_delete(self, athlete_id: UUID, activity_id: str) -> bool:
        """Mark deleted — what the single-activity endpoint does now.

        Reports False for an activity the athlete does not own, so the endpoint's
        403-vs-404 branch is exercised the same way as with a hard delete.
        """
        self.soft_delete_calls.append((activity_id, athlete_id))
        return athlete_id == self.owner_id and activity_id in self.exists_ids

    async def delete_by_source(self, athlete_id: UUID, source: str) -> int:
        self.delete_by_source_calls.append((athlete_id, source))
        return 0

    async def delete_all(self, athlete_id: UUID) -> int:
        self.delete_all_calls.append(athlete_id)
        return 0


def _summary(activity_id: str) -> dict[str, object]:
    return {
        "activity_id": activity_id,
        "start_time": datetime(2026, 1, 1, tzinfo=UTC),
        "sport": "Run",
        "raw_data": {},
    }


class _FakeIntegrations:
    def __init__(self) -> None:
        self.clear_calls: list[tuple[UUID, str | None]] = []

    async def clear_sync_state(self, athlete_id: UUID, source: str | None = None) -> int:
        self.clear_calls.append((athlete_id, source))
        return 1


def _empty_pool() -> MagicMock:
    """Pool stub for cascade SQL after bulk delete (no real DB)."""
    cur = AsyncMock()
    cur.fetchone = AsyncMock(return_value={"n": 0})
    cur.execute = AsyncMock(return_value=None)
    conn = MagicMock()
    conn.cursor.return_value.__aenter__ = AsyncMock(return_value=cur)
    conn.cursor.return_value.__aexit__ = AsyncMock(return_value=None)
    pool = MagicMock()
    pool.connection.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.connection.return_value.__aexit__ = AsyncMock(return_value=None)
    return pool


def _use_repo(
    athlete: Athlete,
    repo: _RecordingRepo | _FakeRepo,
    integrations: _FakeIntegrations | None = None,
) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: athlete
    app.dependency_overrides[get_activity_repo] = lambda: repo
    if integrations is not None:
        app.dependency_overrides[get_integration_repo] = lambda: integrations


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def _delete(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.delete(path)


async def _post_files(path: str, files: dict[str, tuple[str, bytes, str]]) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, files=files)
