"""Shared support for durable sync job phases.

Progress reporting, cancellation checks, the weather backfill and the stream
progress reporter live here so the phase orchestrator stays small. The
cancellation error is raised at phase boundaries and caught by the executor.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

import httpx
from psycopg import Connection

from infrastructure.repositories import sync_jobs
from infrastructure.repositories.sync_jobs_types import (
    JobProgress,
    athlete_id_of,
    job_id_of,
)
from infrastructure.weather.service import activities_without_weather, fetch_for_activity

STREAM_PROGRESS_EVERY = 5


class SyncCancelledError(Exception):
    """Raised at a phase boundary after the athlete asked to stop the job."""


def progress(conn: Connection, job_id: UUID, value: JobProgress) -> None:
    sync_jobs.update_progress(conn, job_id, value)
    conn.commit()
    if sync_jobs.is_cancel_requested(conn, job_id):
        raise SyncCancelledError()


def set_job_window(conn: Connection, job_id: UUID, start: date, end: date) -> None:
    """Persist a window discovered at runtime so later phases cover the same range."""
    with conn.cursor() as cur:
        _ = cur.execute(
            "UPDATE integration_sync_jobs SET window_start = %s, window_end = %s WHERE id = %s",
            (start, end, job_id),
        )
    conn.commit()


class StreamReporter:
    def __init__(self, conn: Connection, job_id: UUID) -> None:
        self._conn = conn
        self._job_id = job_id
        self._seen = 0
        self._pending = 0

    def __call__(self, activity_id: str, inserted: int) -> None:
        _ = activity_id
        self._seen += 1
        self._pending += inserted
        if inserted == 0 and self._seen % STREAM_PROGRESS_EVERY != 0:
            return
        progress(
            self._conn,
            self._job_id,
            JobProgress(phase="streams", streams_inserted=self._pending),
        )
        self._pending = 0


async def run_weather_phase(
    conn: Connection, job: dict[str, object], errors: list[dict[str, object]]
) -> None:
    """Fill the weather of activities that carry a position.

    Intervals.icu supplies a weather block when its own service has data for
    that place; this deployment's activities carry none. Conditions are fetched
    from a reanalysis service using the activity's own GPS position and time.
    """
    job_id = job_id_of(job)
    athlete_id = athlete_id_of(job)
    rows = activities_without_weather(conn, athlete_id)
    if not rows:
        return
    written = 0
    failed = 0
    with httpx.Client() as client:
        for row in rows:
            result = fetch_for_activity(conn, row, client)
            if result.error is not None:
                failed += 1
                errors.append({"activity_id": result.activity_id, "message": result.error})
            elif result.written:
                written += 1
    conn.commit()
    progress(conn, job_id, JobProgress(phase="weather", errors_count=failed))
    _ = written
