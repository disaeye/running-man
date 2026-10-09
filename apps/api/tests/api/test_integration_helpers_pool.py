from __future__ import annotations

from dataclasses import dataclass

import pytest

from infrastructure.repositories.activity import ActivitySyncStats
from presentation.api import integration_helpers

pytestmark = pytest.mark.no_db


@dataclass(frozen=True, slots=True)
class _FakeConn:
    committed: list[bool]
    rolled_back: list[bool]

    def commit(self) -> None:
        self.committed.append(True)

    def rollback(self) -> None:
        self.rolled_back.append(True)


class _FakePoolConnection:
    def __init__(self, conn: _FakeConn) -> None:
        self.conn = conn
        self.exited = False

    def __enter__(self) -> _FakeConn:
        return self.conn

    def __exit__(self, *_exc: object) -> None:
        self.exited = True


class _FakeSyncPool:
    def __init__(self, conn: _FakeConn) -> None:
        self.connection_context = _FakePoolConnection(conn)

    def connection(self) -> _FakePoolConnection:
        return self.connection_context


class _FakeClient:
    def __init__(self, **_kwargs: object) -> None:
        return None

    async def __aenter__(self) -> _FakeClient:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None


@dataclass(frozen=True, slots=True)
class _FakeStreamError:
    activity_id: str
    message: str


@dataclass(frozen=True, slots=True)
class _FakeStreamResult:
    inserted: int
    errors: tuple[_FakeStreamError, ...]


@dataclass(frozen=True, slots=True)
class _FakeSyncResult:
    activity_stats: ActivitySyncStats
    stream_result: _FakeStreamResult


async def test_intervals_helper_uses_sync_pool_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conn = _FakeConn(committed=[], rolled_back=[])
    sync_pool = _FakeSyncPool(conn)
    calls: list[tuple[str, object, object]] = []

    monkeypatch.setattr(integration_helpers, "get_sync_pool", lambda: sync_pool)
    monkeypatch.setattr(integration_helpers, "IntervalsClient", _FakeClient)

    async def _fake_activities(athlete_id: str, client: object, db_conn: object) -> _FakeSyncResult:
        calls.append((athlete_id, client, db_conn))
        return _FakeSyncResult(
            activity_stats=ActivitySyncStats(upserted=1, deduplicated=2, total_processed=3),
            stream_result=_FakeStreamResult(inserted=4, errors=()),
        )

    async def _fake_wellness(
        _athlete_id: str, _client: object, _db_conn: object, _oldest: str, _newest: str
    ) -> int:
        return 5

    monkeypatch.setattr(integration_helpers, "sync_activities_incremental", _fake_activities)
    monkeypatch.setattr(integration_helpers, "sync_wellness", _fake_wellness)

    result = await integration_helpers._sync_intervals_with_client("athlete-1", "key", "i123")

    assert calls == [("athlete-1", calls[0][1], conn)]
    assert result.activity_stats.total_processed == 3
    assert result.wellness_count == 5
    assert result.streams_inserted == 4
    assert conn.committed == [True]
    assert conn.rolled_back == []
    assert sync_pool.connection_context.exited is True


