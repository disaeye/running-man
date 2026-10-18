"""Connection handling of the sync job executor.

The executor owns the connection now: it opens the sync pool, commits after
every progress step so a long run is visible to other sessions, and rolls back
before recording a failure. These tests pin those three behaviours with a fake
pool, so they need neither a database nor a network.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import uuid4

import pytest
from anyio.to_thread import run_sync as run_sync_in_worker_thread

from application.integrations import sync_job_phases as phases
from application.integrations import sync_jobs as execution
from infrastructure.repositories import sync_jobs as jobs_repo

pytestmark = pytest.mark.no_db

JOB_ID = uuid4()
TODAY = date(2026, 7, 1)


@dataclass
class _FakeCursor:
    query: str = ""

    def __enter__(self) -> _FakeCursor:
        return self

    def __exit__(self, *_exc: object) -> None:
        return None

    def execute(self, query: str, _params: tuple[object, ...] = ()) -> None:
        self.query = query

    def fetchone(self) -> tuple[object, ...]:
        if "integration_sync_jobs" in self.query:
            return _job_values()
        return (TODAY,)

    def fetchall(self) -> list[tuple[object, ...]]:
        return []


@dataclass
class _FakeConn:
    committed: int = 0
    rolled_back: int = 0

    def commit(self) -> None:
        self.committed += 1

    def rollback(self) -> None:
        self.rolled_back += 1

    def cursor(self) -> _FakeCursor:
        return _FakeCursor()


class _PoolConnection:
    def __init__(self, conn: _FakeConn) -> None:
        self.conn = conn
        self.entered = False
        self.exited = False

    def __enter__(self) -> _FakeConn:
        self.entered = True
        return self.conn

    def __exit__(self, *_exc: object) -> None:
        self.exited = True


class _SyncPool:
    def __init__(self, conn: _FakeConn) -> None:
        self.connection_context = _PoolConnection(conn)

    def connection(self) -> _PoolConnection:
        return self.connection_context


class _Client:
    def __init__(self, **_kwargs: object) -> None:
        return None

    async def __aenter__(self) -> _Client:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None


def _job_values(**overrides: object) -> tuple[object, ...]:
    row = _job_row(**overrides)
    return tuple(row[name] for name in jobs_repo._COLUMN_NAMES)


def _job_row(**overrides: object) -> dict[str, object]:
    row: dict[str, object] = {
        "id": JOB_ID,
        "athlete_id": uuid4(),
        "source": "intervals_icu",
        "kind": "incremental",
        "trigger": "manual",
        "phase": "activities",
        "status": "queued",
        "window_start": None,
        "window_end": None,
        "windows_total": 0,
        "windows_done": 0,
        "activities_seen": 0,
        "activities_upserted": 0,
        "activities_deduplicated": 0,
        "streams_inserted": 0,
        "wellness_days": 0,
        "ghosts_deleted": 0,
        "errors_count": 0,
        "errors": [],
        "cancel_requested": False,
        "error": None,
        "started_at": None,
        "finished_at": None,
        "heartbeat_at": None,
        "created_at": None,
    }
    return row | overrides


def _patch_common(monkeypatch: pytest.MonkeyPatch, conn: _FakeConn) -> _SyncPool:
    pool = _SyncPool(conn)
    monkeypatch.setattr(execution, "get_sync_pool", lambda: pool)
    monkeypatch.setattr(execution, "IntervalsClient", _Client)
    monkeypatch.setattr(jobs_repo, "is_cancel_requested", lambda _conn, _job_id: False)
    return pool


async def test_executor_commits_every_progress_step_and_closes_the_pool_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conn = _FakeConn()
    pool = _patch_common(monkeypatch, conn)
    wellness_windows: list[tuple[str, str]] = []

    async def _fake_wellness(
        _athlete: object, _client: object, _conn: object, oldest: str, newest: str
    ) -> int:
        wellness_windows.append((oldest, newest))
        return 5

    monkeypatch.setattr(phases, "incremental_window", lambda _athlete, _conn: None)
    monkeypatch.setattr(phases, "sync_wellness", _fake_wellness)
    monkeypatch.setattr(phases, "last_wellness_day", lambda _conn, _athlete: TODAY)

    outcome = await run_sync_in_worker_thread(
        execution.execute_job, JOB_ID, {"api_key": "k", "athlete_id": "i1"}
    )

    assert outcome.status == "success"
    assert conn.rolled_back == 0
    # One commit per progress step: the empty-window marker plus the two wellness
    # markers, and the terminal write.
    assert conn.committed >= 3
    assert pool.connection_context.entered is True
    assert pool.connection_context.exited is True
    # Wellness resumes from the newest stored day rather than a fixed window.
    assert wellness_windows == [(TODAY.isoformat(), TODAY.isoformat())]


async def test_executor_rolls_back_before_recording_a_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conn = _FakeConn()
    _ = _patch_common(monkeypatch, conn)

    def _boom(_athlete: object, _conn: object) -> tuple[date, date]:
        raise RuntimeError("upstream 503")

    monkeypatch.setattr(phases, "incremental_window", _boom)

    outcome = await run_sync_in_worker_thread(
        execution.execute_job, JOB_ID, {"api_key": "k", "athlete_id": "i1"}
    )

    assert outcome.status == "failed"
    assert outcome.error == "RuntimeError: upstream 503"
    assert conn.rolled_back == 1
    assert conn.committed >= 1


def test_job_row_maps_positional_rows_from_the_sync_pool() -> None:
    """The sync pool has no ``dict_row`` factory, so the mapper is positional."""
    row = _job_row()
    values = tuple(row[name] for name in jobs_repo._COLUMN_NAMES)

    mapped = jobs_repo._job_row(values)

    assert mapped["id"] == JOB_ID
    assert mapped["status"] == "queued"
    assert mapped["errors"] == []


async def test_refetch_reports_a_single_activity_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A failed FIT download has to surface as an error, not a silent zero."""
    from infrastructure.integrations.intervals.sync import StreamSyncError, StreamSyncResult

    class _NullConnection:
        def rollback(self) -> None:
            return None

    monkeypatch.setattr(execution, "get_sync_pool", lambda: _SyncPool(_NullConnection()))
    monkeypatch.setattr(execution, "IntervalsClient", _Client)

    async def _failing_streams(*_args: object, **_kwargs: object) -> StreamSyncResult:
        return StreamSyncResult(
            inserted=0, errors=(StreamSyncError("act-9", "download failed"),)
        )

    monkeypatch.setattr(execution, "sync_activity_streams", _failing_streams)

    with pytest.raises(execution.StreamFetchError):
        await execution.refetch_activity_streams(uuid4(), "act-9", {"api_key": "k", "athlete_id": "i1"})
