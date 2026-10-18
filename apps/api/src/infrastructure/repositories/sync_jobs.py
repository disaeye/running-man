"""Asynchronous repository for sync jobs (API layer path)."""

from __future__ import annotations

from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool
from infrastructure.repositories.sync_job_records import (
    _COLUMN_NAMES,
    _COLUMNS,
    MAX_STORED_ERRORS,
    _job_row,
    finish_job,
    is_cancel_requested,
    load_job,
    mark_running,
    store_errors,
    update_progress,
)
from infrastructure.repositories.sync_jobs_types import JobProgress

__all__ = [
    "ACTIVE_STATUSES",
    "MAX_STORED_ERRORS",
    "STALE_HEARTBEAT_SECONDS",
    "_COLUMNS",
    "_COLUMN_NAMES",
    "JobProgress",
    "SyncJobRepo",
    "_job_row",
    "finish_job",
    "is_cancel_requested",
    "load_job",
    "mark_running",
    "store_errors",
    "update_progress",
]

STALE_HEARTBEAT_SECONDS = 300
ACTIVE_STATUSES = ("queued", "running")


def _connect() -> ConnectionContext:
    return get_pool().connection()


class SyncJobRepo:
    async def create(
        self,
        athlete_id: UUID,
        source: str,
        kind: str,
        trigger: str,
        window_start: object | None,
        window_end: object | None,
        windows_total: int,
    ) -> dict[str, object]:
        """Insert a queued job. Fails on unique index if active job exists."""
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                f"""
                INSERT INTO integration_sync_jobs (
                    athlete_id, source, kind, trigger, window_start, window_end,
                    windows_total, status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'queued')
                RETURNING {_COLUMNS}
                """,
                (athlete_id, source, kind, trigger, window_start, window_end, windows_total),
            )
            row = await cur.fetchone()
        assert row is not None
        return dict(row)

    async def get_current(self, athlete_id: UUID, source: str) -> dict[str, object] | None:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                f"SELECT {_COLUMNS} FROM integration_sync_jobs "
                "WHERE athlete_id = %s AND source = %s ORDER BY created_at DESC LIMIT 1",
                (athlete_id, source),
            )
            row = await cur.fetchone()
        return dict(row) if row else None

    async def get(self, athlete_id: UUID, job_id: UUID) -> dict[str, object] | None:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                f"SELECT {_COLUMNS} FROM integration_sync_jobs "
                "WHERE athlete_id = %s AND id = %s",
                (athlete_id, job_id),
            )
            row = await cur.fetchone()
        return dict(row) if row else None

    async def active(self, athlete_id: UUID, source: str) -> dict[str, object] | None:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                f"SELECT {_COLUMNS} FROM integration_sync_jobs "
                "WHERE athlete_id = %s AND source = %s AND status = ANY(%s) "
                "ORDER BY created_at DESC LIMIT 1",
                (athlete_id, source, list(ACTIVE_STATUSES)),
            )
            row = await cur.fetchone()
        return dict(row) if row else None

    async def request_cancel(self, athlete_id: UUID, job_id: UUID) -> dict[str, object] | None:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                f"""
                UPDATE integration_sync_jobs
                SET cancel_requested = true, updated_at = now()
                WHERE athlete_id = %s AND id = %s AND status = ANY(%s)
                RETURNING {_COLUMNS}
                """,
                (athlete_id, job_id, list(ACTIVE_STATUSES)),
            )
            row = await cur.fetchone()
        return dict(row) if row else None

    async def sweep_abandoned(self) -> list[dict[str, object]]:
        return await self._fail_active("同步中断：服务重启，任务未完成", "TRUE", ())

    async def sweep_stale(
        self,
        athlete_id: UUID | None = None,
        source: str | None = None,
        stale_after_seconds: int = STALE_HEARTBEAT_SECONDS,
    ) -> list[dict[str, object]]:
        filters = ["COALESCE(heartbeat_at, created_at) < now() - make_interval(secs => %s)"]
        params: list[object] = [stale_after_seconds]
        if athlete_id is not None:
            filters.append("athlete_id = %s")
            params.append(athlete_id)
        if source is not None:
            filters.append("source = %s")
            params.append(source)
        return await self._fail_active(
            "同步中断：长时间无进度", " AND ".join(filters), tuple(params)
        )

    async def _fail_active(
        self, reason: str, condition: str, params: tuple[object, ...]
    ) -> list[dict[str, object]]:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                f"""
                UPDATE integration_sync_jobs
                SET status = 'failed', error = %s, finished_at = now(), updated_at = now()
                WHERE status = ANY(%s) AND {condition}
                RETURNING id, athlete_id, source
                """,
                (reason, list(ACTIVE_STATUSES), *params),
            )
            rows = [dict(row) for row in await cur.fetchall()]
            for row in rows:
                _ = await cur.execute(
                    """
                    UPDATE user_integrations
                    SET last_sync_status = 'failed', last_sync_error = %s, updated_at = now()
                    WHERE athlete_id = %s AND source = %s AND last_sync_status = 'running'
                    """,
                    (reason, row["athlete_id"], row["source"]),
                )
        return rows
