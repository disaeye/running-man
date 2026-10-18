"""Durable sync job lifecycle.

The job row replaced an in-process ``running`` flag. These tests pin the
behaviour that flag could not provide: one active job per source, progress and
terminal state persisted as the job runs, a cancel request honoured at a phase
boundary, and a sweep that retires jobs no worker will ever finish.

The sync pool is faked with a real connection to the test database, so the
executor's own commits run for real; each test deletes its athlete (cascading to
the job rows) at the end.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date
from uuid import UUID, uuid4

import psycopg
import pytest
from anyio.to_thread import run_sync as run_sync_in_worker_thread

from application.integrations import sync_job_phases as phases
from application.integrations import sync_jobs as execution
from infrastructure.integrations.intervals.sync import (
    ActivitySyncStats,
    IncrementalSyncResult,
    StreamSyncResult,
)
from infrastructure.repositories.sync_jobs import SyncJobRepo

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]

SOURCE = "intervals_icu"


class _SyncPool:
    """Stands in for ``get_sync_pool`` with a real connection to the test DB."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def connection(self) -> Iterator[psycopg.Connection]:
        return _ConnectionContext(self._conn)


class _ConnectionContext:
    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def __enter__(self) -> psycopg.Connection:
        return self._conn

    def __exit__(self, *exc: object) -> None:
        return None


class _Client:
    def __init__(self, **_kwargs: object) -> None:
        pass

    async def __aenter__(self) -> _Client:
        return self

    async def __aexit__(self, *exc: object) -> bool:
        return False


def _new_athlete(conn: psycopg.Connection) -> UUID:
    athlete_id = uuid4()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, 'hash')",
            (athlete_id, f"{athlete_id}@sync-jobs.test"),
        )
    conn.commit()
    return athlete_id


def _connect_integration(conn: psycopg.Connection, athlete_id: UUID, status: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO user_integrations (athlete_id, source, connected, last_sync_status) "
            "VALUES (%s, %s, true, %s) ON CONFLICT (athlete_id, source) DO UPDATE "
            "SET last_sync_status = EXCLUDED.last_sync_status",
            (athlete_id, SOURCE, status),
        )
    conn.commit()


def _delete_athlete(conn: psycopg.Connection, athlete_id: UUID) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM athletes WHERE id = %s", (athlete_id,))
    conn.commit()


def _job(conn: psycopg.Connection, job_id: UUID) -> dict[str, object]:
    cols = "status, phase, error, windows_total, windows_done, activities_seen, activities_upserted, activities_deduplicated, streams_inserted, wellness_days, ghosts_deleted, errors_count, errors, cancel_requested, started_at, finished_at, heartbeat_at"
    with conn.cursor() as cur:
        cur.execute(f"SELECT {cols} FROM integration_sync_jobs WHERE id = %s", (job_id,))
        row = cur.fetchone()
    assert row is not None
    return dict(zip([c.strip() for c in cols.split(",")], row, strict=True))


async def test_only_one_active_job_per_source(db_conn: psycopg.Connection) -> None:
    athlete_id = _new_athlete(db_conn)
    repo = SyncJobRepo()

    _ = await repo.create(athlete_id, SOURCE, "incremental", "manual", None, None, 0)
    with pytest.raises(psycopg.errors.UniqueViolation):
        _ = await repo.create(athlete_id, SOURCE, "backfill", "manual", None, None, 0)

    _delete_athlete(db_conn, athlete_id)


async def test_progress_and_terminal_state_are_persisted(
    db_conn: psycopg.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    athlete_id = _new_athlete(db_conn)
    job = await SyncJobRepo().create(athlete_id, SOURCE, "incremental", "manual", None, None, 0)
    job_id = UUID(str(job["id"]))
    monkeypatch.setattr(execution, "get_sync_pool", lambda: _SyncPool(db_conn))
    monkeypatch.setattr(execution, "IntervalsClient", _Client)
    monkeypatch.setattr(
        phases, "incremental_window", lambda _athlete, _conn: (date(2026, 10, 1), date(2026, 10, 13))
    )

    async def _fake_window(
        _athlete: object,
        _client: object,
        _conn: object,
        _oldest: date,
        _newest: date,
        _job_id: UUID,
        on_stream_progress: object,
    ) -> IncrementalSyncResult:
        assert callable(on_stream_progress)
        on_stream_progress("act-1", 120)
        on_stream_progress("act-2", 0)
        return IncrementalSyncResult(
            activity_stats=ActivitySyncStats(upserted=2, deduplicated=1, total_processed=3),
            stream_result=StreamSyncResult(inserted=120),
            ghosts_deleted=1,
        )

    async def _fake_wellness(*_args: object) -> int:
        return 7

    monkeypatch.setattr(phases, "sync_incremental_window", _fake_window)
    monkeypatch.setattr(phases, "sync_wellness", _fake_wellness)
    monkeypatch.setattr(phases, "last_wellness_day", lambda _conn, _athlete: None)

    outcome = await run_sync_in_worker_thread(
        execution.execute_job, job_id, {"api_key": "k", "athlete_id": "i1"}
    )

    assert outcome.status == "success"
    assert outcome.error is None
    row = _job(db_conn, job_id)
    assert row["status"] == "success"
    assert row["phase"] == "wellness"
    assert (row["windows_done"], row["windows_total"]) == (1, 1)
    assert (row["activities_seen"], row["activities_upserted"]) == (3, 2)
    assert row["activities_deduplicated"] == 1
    assert row["streams_inserted"] == 120
    assert row["ghosts_deleted"] == 1
    assert row["wellness_days"] == 7
    assert row["errors"] == []
    assert row["started_at"] is not None
    assert row["finished_at"] is not None
    assert row["heartbeat_at"] is not None
    _delete_athlete(db_conn, athlete_id)


async def test_cancel_stops_the_job_at_the_next_boundary(
    db_conn: psycopg.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    athlete_id = _new_athlete(db_conn)
    repo = SyncJobRepo()
    job = await repo.create(athlete_id, SOURCE, "incremental", "manual", None, None, 0)
    job_id = UUID(str(job["id"]))
    _ = await repo.request_cancel(athlete_id, job_id)
    monkeypatch.setattr(execution, "get_sync_pool", lambda: _SyncPool(db_conn))
    monkeypatch.setattr(execution, "IntervalsClient", _Client)

    called: list[str] = []

    async def _fake_window(*_args: object) -> IncrementalSyncResult:
        called.append("window")
        return IncrementalSyncResult(activity_stats=ActivitySyncStats())

    monkeypatch.setattr(phases, "incremental_window", lambda _a, _c: (date(2026, 10, 1), date(2026, 10, 2)))
    monkeypatch.setattr(phases, "sync_incremental_window", _fake_window)

    outcome = await run_sync_in_worker_thread(
        execution.execute_job, job_id, {"api_key": "k", "athlete_id": "i1"}
    )

    assert outcome.status == "cancelled"
    assert called == []
    row = _job(db_conn, job_id)
    assert row["status"] == "cancelled"
    assert row["finished_at"] is not None
    _delete_athlete(db_conn, athlete_id)


async def test_a_failing_phase_marks_the_job_failed_with_the_reason(
    db_conn: psycopg.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    athlete_id = _new_athlete(db_conn)
    job = await SyncJobRepo().create(athlete_id, SOURCE, "incremental", "manual", None, None, 0)
    job_id = UUID(str(job["id"]))
    monkeypatch.setattr(execution, "get_sync_pool", lambda: _SyncPool(db_conn))
    monkeypatch.setattr(execution, "IntervalsClient", _Client)

    def _boom(_athlete: object, _conn: object) -> tuple[date, date]:
        raise RuntimeError("provider rejected the window")

    monkeypatch.setattr(phases, "incremental_window", _boom)

    outcome = await run_sync_in_worker_thread(
        execution.execute_job, job_id, {"api_key": "k", "athlete_id": "i1"}
    )

    assert outcome.status == "failed"
    assert outcome.error == "RuntimeError: provider rejected the window"
    row = _job(db_conn, job_id)
    assert row["status"] == "failed"
    assert row["error"] == "RuntimeError: provider rejected the window"
    _delete_athlete(db_conn, athlete_id)


async def test_startup_sweep_retires_abandoned_jobs(db_conn: psycopg.Connection) -> None:
    athlete_id = _new_athlete(db_conn)
    _connect_integration(db_conn, athlete_id, "running")
    job = await SyncJobRepo().create(athlete_id, SOURCE, "incremental", "manual", None, None, 0)

    swept = await SyncJobRepo().sweep_abandoned()

    # Other athletes' abandoned jobs are swept too; this asserts only that this
    # athlete's job was among them.
    assert UUID(str(job["id"])) in {UUID(str(row["id"])) for row in swept}
    row = _job(db_conn, UUID(str(job["id"])))
    assert row["status"] == "failed"
    assert "服务重启" in str(row["error"])
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT last_sync_status, last_sync_error FROM user_integrations "
            "WHERE athlete_id = %s AND source = %s",
            (athlete_id, SOURCE),
        )
        status_row = cur.fetchone()
    assert status_row is not None
    assert status_row[0] == "failed"
    assert "服务重启" in status_row[1]
    _delete_athlete(db_conn, athlete_id)


async def test_stale_sweep_only_retires_jobs_without_a_heartbeat(
    db_conn: psycopg.Connection,
) -> None:
    stale_athlete = _new_athlete(db_conn)
    fresh_athlete = _new_athlete(db_conn)
    repo = SyncJobRepo()
    stale = await repo.create(stale_athlete, SOURCE, "incremental", "manual", None, None, 0)
    fresh = await repo.create(fresh_athlete, SOURCE, "incremental", "manual", None, None, 0)
    with db_conn.cursor() as cur:
        cur.execute(
            "UPDATE integration_sync_jobs SET status = 'running', heartbeat_at = now() "
            "- interval '10 minutes' WHERE id = %s",
            (stale["id"],),
        )
        cur.execute(
            "UPDATE integration_sync_jobs SET status = 'running', heartbeat_at = now() "
            "WHERE id = %s",
            (fresh["id"],),
        )
    db_conn.commit()

    swept = await repo.sweep_stale()

    assert [UUID(str(row["id"])) for row in swept] == [UUID(str(stale["id"]))]
    assert _job(db_conn, UUID(str(stale["id"])))["status"] == "failed"
    assert _job(db_conn, UUID(str(fresh["id"])))["status"] == "running"
    _delete_athlete(db_conn, stale_athlete)
    _delete_athlete(db_conn, fresh_athlete)


async def test_get_current_returns_the_newest_job(db_conn: psycopg.Connection) -> None:
    athlete_id = _new_athlete(db_conn)
    repo = SyncJobRepo()
    first = await repo.create(athlete_id, SOURCE, "incremental", "manual", None, None, 0)
    with db_conn.cursor() as cur:
        # The first job has to be terminal before a second one is allowed, and
        # its timestamp is pinned because both rows land in the same
        # transaction here (so the clock alone cannot order them).
        cur.execute(
            "UPDATE integration_sync_jobs SET status = 'success', created_at = now() "
            "- interval '1 hour' WHERE id = %s",
            (first["id"],),
        )
    db_conn.commit()
    second = await repo.create(
        athlete_id, SOURCE, "backfill", "manual", date(2024, 1, 1), date(2024, 2, 1), 0
    )

    current = await repo.get_current(athlete_id, SOURCE)

    assert current is not None
    assert UUID(str(current["id"])) == UUID(str(second["id"]))
    _delete_athlete(db_conn, athlete_id)
