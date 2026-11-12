from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date, timedelta
from typing import cast
from uuid import UUID

import psycopg

from domain.ingestion import IngestionError
from infrastructure.integrations.intervals.history import (
    incremental_start_or_none,
    resolve_initial_history_window,
)
from infrastructure.integrations.intervals.reconcile import reconcile_ghosts
from infrastructure.integrations.intervals.sync_helpers import (
    activity_params,
    as_date,
    athlete_today,
    monthly_windows,
)
from infrastructure.integrations.intervals.sync_laps import (
    activity_ids_in_window,
    upsert_laps_sync,
)
from infrastructure.integrations.intervals.sync_rejections import (
    record_activity_rejection,
    record_secondary_duplicate,
)
from infrastructure.integrations.intervals.sync_streams import sync_activity_streams
from infrastructure.integrations.intervals.sync_types import (
    ActivitiesClient,
    ActivityFitClient,
    IncrementalSyncResult,
    StreamProgress,
    StreamSyncError,
    StreamSyncResult,
    WindowProgress,
)
from infrastructure.repositories import activity_summary
from infrastructure.repositories.activity import ActivitySyncStats
from infrastructure.repositories.sync_provenance import (
    finish_sync_run,
    secondary_duplicate_exists,
    start_sync_run,
)

__all__ = [
    "ActivitiesClient",
    "ActivityFitClient",
    "IncrementalSyncResult",
    "StreamProgress",
    "StreamSyncError",
    "StreamSyncResult",
    "WindowProgress",
    "_activity_params",
    "_athlete_today",
    "activity_ids_in_window",
    "activity_params",
    "athlete_today",
    "backfill_activities",
    "incremental_window",
    "sync_activities_incremental",
    "sync_activity_streams",
    "sync_activity_window",
    "sync_incremental_window",
    "upsert_laps_sync",
]

_activity_params = activity_params
_athlete_today = athlete_today

_RECONCILE_LOOKBACK_DAYS = 14


def incremental_window(
    athlete_id: int | str, db_conn: psycopg.Connection
) -> tuple[date, date] | None:
    """The activity window an incremental sync has to request.

    ``None`` means the stored activities already reach the athlete's current
    day, so there is nothing to fetch. A first import (or a cleared account)
    returns ``(today + 1, today)``: the caller recognizes that marker and
    takes the full-history path instead of a fixed lookback.
    """
    newest = _athlete_today(db_conn, athlete_id)
    oldest = incremental_start_or_none(db_conn, str(athlete_id))
    if oldest is None:
        return newest + timedelta(days=1), newest
    if oldest > newest:
        return None
    return oldest - timedelta(days=_RECONCILE_LOOKBACK_DAYS), newest


async def sync_incremental_window(
    athlete_id: int | str,
    client: ActivitiesClient,
    db_conn: psycopg.Connection,
    oldest: date,
    newest: date,
    job_id: UUID | None = None,
    on_stream_progress: StreamProgress | None = None,
) -> IncrementalSyncResult:
    """Fetch one incremental window, reconcile ghosts, then backfill streams."""
    stats, remote_activities = await sync_activity_window(
        athlete_id, client, db_conn, oldest, newest, job_id
    )

    ghosts_deleted = reconcile_ghosts(
        db_conn,
        str(athlete_id),
        oldest,
        newest,
        list(remote_activities),
    )

    stream_result = StreamSyncResult()
    if isinstance(client, ActivityFitClient):
        activity_ids = activity_ids_in_window(athlete_id, db_conn, oldest, newest)
        stream_result = await sync_activity_streams(
            athlete_id, client, db_conn, activity_ids, on_progress=on_stream_progress
        )

    return IncrementalSyncResult(
        activity_stats=stats,
        stream_result=stream_result,
        ghosts_deleted=ghosts_deleted,
    )


async def sync_activities_incremental(
    athlete_id: int | str,
    client: ActivitiesClient,
    db_conn: psycopg.Connection,
    job_id: UUID | None = None,
    on_stream_progress: StreamProgress | None = None,
) -> IncrementalSyncResult:
    window = incremental_window(athlete_id, db_conn)
    if window is None:
        return IncrementalSyncResult(activity_stats=ActivitySyncStats())
    if window[0] > window[1]:
        # First import: discover the athlete's whole history rather than
        # assuming a fixed lookback covers it.
        history = await resolve_initial_history_window(str(athlete_id), client, db_conn)
        stats = await backfill_activities(
            athlete_id, client, db_conn, history.start, history.end, job_id
        )
        return IncrementalSyncResult(activity_stats=stats)
    return await sync_incremental_window(
        athlete_id,
        client,
        db_conn,
        window[0],
        window[1],
        job_id,
        on_stream_progress,
    )


async def backfill_activities(
    athlete_id: int | str,
    client: ActivitiesClient,
    db_conn: psycopg.Connection,
    from_date: date | str,
    to_date: date | str,
    job_id: UUID | None = None,
    on_window: WindowProgress | None = None,
) -> ActivitySyncStats:
    start = as_date(from_date)
    end = as_date(to_date)
    if start > end:
        return ActivitySyncStats()

    stats = ActivitySyncStats()
    for oldest, newest in monthly_windows(start, end):
        window_stats, remote_activities = await sync_activity_window(
            athlete_id, client, db_conn, oldest, newest, job_id
        )
        stats += window_stats
        # Reconcile against the window just listed so edits and deletions
        # upstream are picked up by a full-history re-import as well.
        reconcile_ghosts(db_conn, str(athlete_id), oldest, newest, remote_activities)
        if on_window is not None:
            on_window(oldest, newest, window_stats)
    return stats


async def sync_activity_window(
    athlete_id: int | str,
    client: ActivitiesClient,
    db_conn: psycopg.Connection,
    oldest: date,
    newest: date,
    job_id: UUID | None = None,
) -> tuple[ActivitySyncStats, Sequence[Mapping[str, object]]]:
    if oldest > newest:
        return ActivitySyncStats(), ()

    sync_run_id = start_sync_run(db_conn, athlete_id, "intervals_icu", oldest, newest, job_id)
    activities = await client.get_activities(athlete_id, oldest.isoformat(), newest.isoformat())
    if not activities:
        finish_sync_run(
            db_conn,
            sync_run_id,
            status="success",
            activities_seen=0,
            activities_upserted=0,
            activities_deduplicated=0,
            errors_count=0,
        )
        return ActivitySyncStats(), activities

    upserted = 0
    deduplicated = 0
    errors_count = 0
    with db_conn.cursor() as cur:
        for activity in activities:
            try:
                params = _activity_params(athlete_id, activity)
            except IngestionError as error:
                errors_count += record_activity_rejection(
                    db_conn, athlete_id, sync_run_id, activity, error
                )
                continue
            source_hash = cast(str, params[21])
            if secondary_duplicate_exists(db_conn, athlete_id, "intervals_icu", source_hash):
                errors_count += record_secondary_duplicate(
                    db_conn, athlete_id, sync_run_id, activity, cast(str, params[0])
                )
                continue
            if activity_summary.execute_upsert(cur, params):
                deduplicated += 1
            else:
                upserted += 1
    finish_sync_run(
        db_conn,
        sync_run_id,
        status="failed" if errors_count else "success",
        activities_seen=len(activities),
        activities_upserted=upserted,
        activities_deduplicated=deduplicated,
        errors_count=errors_count,
    )
    return ActivitySyncStats(upserted, deduplicated, len(activities)), activities
