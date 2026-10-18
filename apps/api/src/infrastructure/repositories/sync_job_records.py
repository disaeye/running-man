"""Synchronous record operations for sync jobs (worker thread path).

The worker thread operates on a synchronous connection from ``get_sync_pool``.
These functions persist per-window progress, refresh the heartbeat and write
the terminal job state.
"""

from __future__ import annotations

import json
from uuid import UUID

import psycopg

from infrastructure.repositories.sync_jobs_types import JobProgress

MAX_STORED_ERRORS = 200

_COLUMN_NAMES = (
    "id",
    "athlete_id",
    "source",
    "kind",
    "trigger",
    "phase",
    "status",
    "window_start",
    "window_end",
    "windows_total",
    "windows_done",
    "activities_seen",
    "activities_upserted",
    "activities_deduplicated",
    "streams_inserted",
    "wellness_days",
    "ghosts_deleted",
    "errors_count",
    "errors",
    "cancel_requested",
    "error",
    "started_at",
    "finished_at",
    "heartbeat_at",
    "created_at",
)

_COLUMNS = ", ".join(_COLUMN_NAMES)


def _job_row(row: tuple[object, ...]) -> dict[str, object]:
    """Map a positional row from the sync pool (no dict_row factory there)."""
    return dict(zip(_COLUMN_NAMES, row, strict=True))


def load_job(conn: psycopg.Connection, job_id: UUID) -> dict[str, object]:
    with conn.cursor() as cur:
        _ = cur.execute(
            "SELECT " + _COLUMNS + " FROM integration_sync_jobs WHERE id = %s",
            (job_id,),
        )
        row = cur.fetchone()
    if row is None:
        raise LookupError(f"sync job {job_id} not found")
    return _job_row(row)


def mark_running(conn: psycopg.Connection, job_id: UUID) -> None:
    with conn.cursor() as cur:
        _ = cur.execute(
            """
            UPDATE integration_sync_jobs
            SET status = 'running', started_at = COALESCE(started_at, now()),
                heartbeat_at = now(), updated_at = now()
            WHERE id = %s
            """,
            (job_id,),
        )


def update_progress(conn: psycopg.Connection, job_id: UUID, progress: JobProgress) -> None:
    """Persist counters and refresh the heartbeat for one progress step."""
    with conn.cursor() as cur:
        _ = cur.execute(
            """
            UPDATE integration_sync_jobs
            SET phase = COALESCE(%s, phase),
                windows_done = COALESCE(%s, windows_done),
                windows_total = COALESCE(%s, windows_total),
                activities_seen = activities_seen + %s,
                activities_upserted = activities_upserted + %s,
                activities_deduplicated = activities_deduplicated + %s,
                streams_inserted = streams_inserted + %s,
                wellness_days = wellness_days + %s,
                ghosts_deleted = ghosts_deleted + %s,
                errors_count = errors_count + %s,
                heartbeat_at = now(),
                updated_at = now()
            WHERE id = %s
            """,
            (
                progress.phase,
                progress.windows_done,
                progress.windows_total,
                progress.activities_seen,
                progress.activities_upserted,
                progress.activities_deduplicated,
                progress.streams_inserted,
                progress.wellness_days,
                progress.ghosts_deleted,
                progress.errors_count,
                job_id,
            ),
        )


def store_errors(
    conn: psycopg.Connection, job_id: UUID, errors: list[dict[str, object]]
) -> None:
    """Store the per-activity failure list the retry UI renders."""
    payload = json.dumps(errors[:MAX_STORED_ERRORS], ensure_ascii=True, default=str)
    with conn.cursor() as cur:
        _ = cur.execute(
            "UPDATE integration_sync_jobs SET errors = %s::jsonb, updated_at = now() "
            "WHERE id = %s",
            (payload, job_id),
        )


def is_cancel_requested(conn: psycopg.Connection, job_id: UUID) -> bool:
    with conn.cursor() as cur:
        _ = cur.execute(
            "SELECT cancel_requested FROM integration_sync_jobs WHERE id = %s",
            (job_id,),
        )
        row = cur.fetchone()
    if row is None:
        raise LookupError(f"sync job {job_id} not found")
    return bool(row[0])


def finish_job(
    conn: psycopg.Connection,
    job_id: UUID,
    status: str,
    error: str | None = None,
) -> None:
    if status not in {"success", "failed", "cancelled"}:
        raise ValueError(f"invalid terminal status: {status}")
    with conn.cursor() as cur:
        _ = cur.execute(
            """
            UPDATE integration_sync_jobs
            SET status = %s, error = %s, finished_at = now(), heartbeat_at = now(),
                updated_at = now()
            WHERE id = %s
            """,
            (status, error, job_id),
        )
