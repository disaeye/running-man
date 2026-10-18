"""Phase execution for durable sync jobs.

Runs the three phases of a job in order:
  1. Activity windows (incremental or monthly backfill)
  2. Streams (downloads missing FIT samples, throttled progress)
  3. Wellness (incremental from last stored day, or backfill window)

Each phase writes progress through ``sync_jobs.update_progress``, commits its
step, and honours cancellation at phase and window boundaries.
"""

from __future__ import annotations

from datetime import date, timedelta
from time import monotonic
from uuid import UUID

from psycopg import Connection

from infrastructure.integrations.intervals.client import IntervalsClient
from infrastructure.integrations.intervals.sync import (
    ActivityFitClient,
    backfill_activities,
    incremental_window,
    sync_activity_streams,
    sync_incremental_window,
)
from infrastructure.integrations.intervals.sync_helpers import (
    athlete_today,
    monthly_windows,
)
from infrastructure.integrations.intervals.sync_laps import (
    activity_ids_in_window,
)
from infrastructure.integrations.intervals.wellness_sync import sync_wellness
from infrastructure.repositories import sync_jobs
from infrastructure.repositories.activity import ActivitySyncStats
from infrastructure.repositories.sync_jobs_types import (
    JobProgress,
    athlete_id_of,
    job_id_of,
    job_window_end,
    job_window_start,
)
from infrastructure.repositories.wellness import last_wellness_day

STREAM_PROGRESS_EVERY = 5
INCREMENTAL_WELLNESS_DAYS = 90


class SyncCancelledError(Exception):
    """Raised at a phase boundary after the athlete asked to stop the job."""


async def run_phases(
    conn: Connection,
    job: dict[str, object],
    client: IntervalsClient,
    errors: list[dict[str, object]],
) -> None:
    if str(job["kind"]) == "backfill":
        await _run_backfill(conn, job, client)
        await _run_streams_phase(conn, job, client, errors)
    else:
        await _run_incremental(conn, job, client, errors)
    await _run_wellness_phase(conn, job, client)


async def _run_incremental(
    conn: Connection,
    job: dict[str, object],
    client: IntervalsClient,
    errors: list[dict[str, object]],
) -> None:
    job_id = job_id_of(job)
    athlete_id = athlete_id_of(job)
    window = incremental_window(athlete_id, conn)
    if window is None:
        _progress(conn, job_id, JobProgress(phase="activities", windows_total=0, windows_done=0))
        return
    _progress(conn, job_id, JobProgress(phase="activities", windows_total=1, windows_done=0))
    result = await sync_incremental_window(
        athlete_id,
        client,
        conn,
        window[0],
        window[1],
        job_id,
        _StreamReporter(conn, job_id),
    )
    errors.extend(
        {"activity_id": error.activity_id, "message": error.message}
        for error in result.stream_result.errors
    )
    if errors:
        sync_jobs.store_errors(conn, job_id, errors)
    _progress(
        conn,
        job_id,
        JobProgress(
            phase="activities",
            windows_done=1,
            activities_seen=result.activity_stats.total_processed,
            activities_upserted=result.activity_stats.upserted,
            activities_deduplicated=result.activity_stats.deduplicated,
            ghosts_deleted=result.ghosts_deleted,
            errors_count=len(result.stream_result.errors),
        ),
    )


async def _run_backfill(
    conn: Connection, job: dict[str, object], client: IntervalsClient
) -> None:
    job_id = job_id_of(job)
    athlete_id = athlete_id_of(job)
    start = job_window_start(job)
    end = job_window_end(job)
    windows = monthly_windows(start, end)
    _progress(
        conn,
        job_id,
        JobProgress(phase="activities", windows_total=len(windows), windows_done=0),
    )

    done = 0

    def on_window(_oldest: date, _newest: date, stats: ActivitySyncStats) -> None:
        nonlocal done
        done += 1
        _progress(
            conn,
            job_id,
            JobProgress(
                phase="activities",
                windows_done=done,
                activities_seen=stats.total_processed,
                activities_upserted=stats.upserted,
                activities_deduplicated=stats.deduplicated,
            ),
        )

    _ = await backfill_activities(athlete_id, client, conn, start, end, job_id, on_window)


async def _run_streams_phase(
    conn: Connection,
    job: dict[str, object],
    client: IntervalsClient,
    errors: list[dict[str, object]],
) -> None:
    job_id = job_id_of(job)
    athlete_id = athlete_id_of(job)
    if not isinstance(client, ActivityFitClient):
        raise TypeError("intervals client cannot download FIT files")
    activity_ids = activity_ids_in_window(
        athlete_id, conn, job_window_start(job), job_window_end(job)
    )
    _progress(conn, job_id, JobProgress(phase="streams"))
    result = await sync_activity_streams(
        athlete_id,
        client,
        conn,
        activity_ids,
        on_progress=_StreamReporter(conn, job_id),
    )
    errors.extend(
        {"activity_id": error.activity_id, "message": error.message}
        for error in result.errors
    )
    if errors:
        sync_jobs.store_errors(conn, job_id, errors)
    _progress(conn, job_id, JobProgress(phase="streams", errors_count=len(result.errors)))


async def _run_wellness_phase(
    conn: Connection, job: dict[str, object], client: IntervalsClient
) -> None:
    job_id = job_id_of(job)
    athlete_id = athlete_id_of(job)
    today = athlete_today(conn, athlete_id)
    if str(job["kind"]) == "backfill":
        oldest = job_window_start(job)
        newest = min(job_window_end(job), today)
    else:
        stored = last_wellness_day(conn, athlete_id)
        oldest = (
            stored if stored is not None else today - timedelta(days=INCREMENTAL_WELLNESS_DAYS)
        )
        newest = today
    if oldest > newest:
        return
    _progress(conn, job_id, JobProgress(phase="wellness"))
    days = await sync_wellness(
        athlete_id, client, conn, oldest.isoformat(), newest.isoformat()
    )
    _progress(conn, job_id, JobProgress(phase="wellness", wellness_days=days))


class _StreamReporter:
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
        _progress(
            self._conn,
            self._job_id,
            JobProgress(phase="streams", streams_inserted=self._pending),
        )
        self._pending = 0


def _progress(conn: Connection, job_id: UUID, progress: JobProgress) -> None:
    sync_jobs.update_progress(conn, job_id, progress)
    conn.commit()
    if sync_jobs.is_cancel_requested(conn, job_id):
        raise SyncCancelledError()


def finish_job_detail(
    conn: Connection,
    job_id: UUID,
    status: str,
    error: str | None,
    errors: list[dict[str, object]],
    started_at: float,
) -> dict[str, object]:
    if errors:
        sync_jobs.store_errors(conn, job_id, errors)
    sync_jobs.finish_job(conn, job_id, status, error)
    conn.commit()
    row = sync_jobs.load_job(conn, job_id)
    return job_detail(row, started_at, status, error)


def job_detail(
    job: dict[str, object], started_at: float, status: str, error: str | None
) -> dict[str, object]:
    stage: dict[str, object] = {"name": "sync", "status": status}
    if error is not None:
        stage["error"] = error
    errors = job.get("errors")
    counts = {
        "activities_upserted": job["activities_upserted"],
        "activities_deduped": job["activities_deduplicated"],
        "wellness_days": job["wellness_days"],
        "streams_inserted": job["streams_inserted"],
        "ghosts_deleted": job["ghosts_deleted"],
    }
    return {
        "counts": counts,
        "duration_ms": int((monotonic() - started_at) * 1000),
        "stages": [stage],
        "errors": errors if isinstance(errors, list) else [],
        "job_id": str(job["id"]),
    }


_EMPTY_COUNTS = dict.fromkeys(
    (
        "activities_upserted",
        "activities_deduped",
        "wellness_days",
        "streams_inserted",
        "ghosts_deleted",
    ),
    0,
)


def running_detail(started_at: float) -> dict[str, object]:
    return {
        "counts": dict(_EMPTY_COUNTS),
        "duration_ms": int((monotonic() - started_at) * 1000),
        "stages": [{"name": "sync", "status": "running"}],
        "errors": [],
    }
