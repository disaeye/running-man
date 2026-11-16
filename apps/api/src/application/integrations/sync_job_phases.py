"""Phase execution for durable sync jobs.

Runs the phases of a job in order:
  1. Activity windows (incremental or monthly backfill)
  2. Streams (downloads missing FIT samples, throttled progress)
  3. Precise intervals (?intervals=true, when the client supports it)
  4. Wellness (incremental from last stored day, or backfill window)
  5. Weather (fills the weather of activities that carry a position)

Each phase writes progress through ``sync_jobs.update_progress``, commits its
step, and honours cancellation at phase and window boundaries.
"""

from __future__ import annotations

from datetime import date, timedelta

from psycopg import Connection

from application.integrations.sync_job_support import (
    StreamReporter,
    SyncCancelledError,
    progress,
    run_weather_phase,
    set_job_window,
)
from infrastructure.integrations.intervals.client import IntervalsClient
from infrastructure.integrations.intervals.history import resolve_initial_history_window
from infrastructure.integrations.intervals.sync import (
    ActivityFitClient,
    backfill_activities,
    incremental_window,
    sync_activity_streams,
    sync_incremental_window,
)
from infrastructure.integrations.intervals.sync_helpers import athlete_today, monthly_windows
from infrastructure.integrations.intervals.sync_intervals import sync_activity_intervals
from infrastructure.integrations.intervals.sync_laps import activity_ids_in_window
from infrastructure.integrations.intervals.sync_types import ActivityIntervalsClient
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

INCREMENTAL_WELLNESS_DAYS = 90

__all__ = ["SyncCancelledError", "run_phases"]


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
        # 初次导入分支返回补上窗口的任务行，后续阶段需要它。
        job = await _run_incremental(conn, job, client, errors) or job
    await _run_intervals_phase(conn, job, client, errors)
    await _run_wellness_phase(conn, job, client)
    await run_weather_phase(conn, job, errors)


async def _run_incremental(
    conn: Connection,
    job: dict[str, object],
    client: IntervalsClient,
    errors: list[dict[str, object]],
) -> dict[str, object] | None:
    job_id = job_id_of(job)
    athlete_id = athlete_id_of(job)
    window = incremental_window(athlete_id, conn)
    if window is not None and window[0] > window[1]:
        history = await resolve_initial_history_window(athlete_id, client, conn)
        set_job_window(conn, job_id, history.start, history.end)
        backfill_job = {**job, "window_start": history.start, "window_end": history.end}
        await _run_backfill(conn, backfill_job, client)
        await _run_streams_phase(conn, backfill_job, client, errors)
        return backfill_job
    if window is None:
        progress(conn, job_id, JobProgress(phase="activities", windows_total=0, windows_done=0))
        return None
    progress(conn, job_id, JobProgress(phase="activities", windows_total=1, windows_done=0))
    result = await sync_incremental_window(
        athlete_id,
        client,
        conn,
        window[0],
        window[1],
        job_id,
        StreamReporter(conn, job_id),
    )
    errors.extend(
        {"activity_id": error.activity_id, "message": error.message}
        for error in result.stream_result.errors
    )
    if errors:
        sync_jobs.store_errors(conn, job_id, errors)
    progress(
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
    set_job_window(conn, job_id, window[0], window[1])
    return {**job, "window_start": window[0], "window_end": window[1]}


async def _run_backfill(conn: Connection, job: dict[str, object], client: IntervalsClient) -> None:
    job_id = job_id_of(job)
    athlete_id = athlete_id_of(job)
    start = job_window_start(job)
    end = job_window_end(job)
    windows = monthly_windows(start, end)
    progress(
        conn,
        job_id,
        JobProgress(phase="activities", windows_total=len(windows), windows_done=0),
    )
    done = 0

    def on_window(_oldest: date, _newest: date, stats: ActivitySyncStats) -> None:
        nonlocal done
        done += 1
        progress(
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
    progress(conn, job_id, JobProgress(phase="streams"))
    result = await sync_activity_streams(
        athlete_id,
        client,
        conn,
        activity_ids,
        on_progress=StreamReporter(conn, job_id),
    )
    errors.extend(
        {"activity_id": error.activity_id, "message": error.message} for error in result.errors
    )
    if errors:
        sync_jobs.store_errors(conn, job_id, errors)
    progress(conn, job_id, JobProgress(phase="streams", errors_count=len(result.errors)))


async def _run_intervals_phase(
    conn: Connection,
    job: dict[str, object],
    client: IntervalsClient,
    errors: list[dict[str, object]],
) -> None:
    if not isinstance(client, ActivityIntervalsClient):
        return
    if job.get("window_start") is None or job.get("window_end") is None:
        return
    job_id = job_id_of(job)
    athlete_id = athlete_id_of(job)
    activity_ids = activity_ids_in_window(
        athlete_id, conn, job_window_start(job), job_window_end(job)
    )
    # 活动区间属于流数据范畴：相位契约里没有独立的 intervals 值
    # （数据库 CHECK 与前端 PHASES 均只有四档），进度归入 streams。
    progress(conn, job_id, JobProgress(phase="streams"))
    result = await sync_activity_intervals(athlete_id, client, conn, activity_ids)
    errors.extend(
        {"activity_id": error.activity_id, "message": error.message} for error in result.errors
    )
    if errors:
        sync_jobs.store_errors(conn, job_id, errors)
    progress(conn, job_id, JobProgress(phase="streams", errors_count=len(errors)))


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
        oldest = stored if stored is not None else today - timedelta(days=INCREMENTAL_WELLNESS_DAYS)
        if job.get("window_start") is not None:
            oldest = min(oldest, job_window_start(job))
        newest = today
    if oldest > newest:
        return
    progress(conn, job_id, JobProgress(phase="wellness"))
    days = await sync_wellness(athlete_id, client, conn, oldest.isoformat(), newest.isoformat())
    progress(conn, job_id, JobProgress(phase="wellness", wellness_days=days))
