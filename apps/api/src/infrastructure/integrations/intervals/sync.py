from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Protocol, cast, runtime_checkable
from uuid import UUID

import psycopg

from domain.ingestion import IngestionError
from infrastructure.integrations.intervals.reconcile import reconcile_ghosts
from infrastructure.integrations.intervals.sync_helpers import (
    activity_params as _activity_params,
)
from infrastructure.integrations.intervals.sync_helpers import (
    as_date as _as_date,
)
from infrastructure.integrations.intervals.sync_helpers import (
    athlete_today as _athlete_today,
)
from infrastructure.integrations.intervals.sync_helpers import (
    fit_samples_to_stream_rows as _fit_samples_to_stream_rows,
)
from infrastructure.integrations.intervals.sync_helpers import (
    monthly_windows as _monthly_windows,
)
from infrastructure.integrations.intervals.sync_helpers import (
    next_sync_date,
)
from infrastructure.integrations.intervals.sync_laps import (
    activity_ids_in_window,
    upsert_laps_sync,
)
from infrastructure.integrations.intervals.sync_rejections import (
    record_activity_rejection,
    record_secondary_duplicate,
)
from infrastructure.parsing.fit_parser import parse_fit
from infrastructure.repositories import activity_summary
from infrastructure.repositories.activity import ActivitySyncStats
from infrastructure.repositories.activity_streams import bulk_insert, has_streams
from infrastructure.repositories.sync_provenance import (
    finish_sync_run,
    secondary_duplicate_exists,
    start_sync_run,
)

_RECONCILE_LOOKBACK_DAYS = 14
# How far back an athlete with no stored activity starts syncing from.
_INITIAL_LOOKBACK_DAYS = 30


@dataclass(frozen=True, slots=True)
class StreamSyncError:
    activity_id: str
    message: str


@dataclass(frozen=True, slots=True)
class StreamSyncResult:
    inserted: int = 0
    errors: tuple[StreamSyncError, ...] = ()


@dataclass(frozen=True, slots=True)
class IncrementalSyncResult:
    activity_stats: ActivitySyncStats
    stream_result: StreamSyncResult = StreamSyncResult()
    ghosts_deleted: int = 0

    @property
    def upserted(self) -> int:
        return self.activity_stats.upserted

    @property
    def deduplicated(self) -> int:
        return self.activity_stats.deduplicated

    @property
    def total_processed(self) -> int:
        return self.activity_stats.total_processed


# Called after each activity window with the window bounds and that window's
# stats, so a job can persist progress and commit between windows.
WindowProgress = Callable[[date, date, ActivitySyncStats], None]
# Called after each stream download attempt with the activity id and the number
# of samples inserted for it.
StreamProgress = Callable[[str, int], None]


class ActivitiesClient(Protocol):
    async def get_activities(
        self, athlete_id: int | str, oldest: str, newest: str
    ) -> Sequence[Mapping[str, object]]: ...


@runtime_checkable
class ActivityFitClient(Protocol):
    async def download_fit(self, activity_id: str) -> bytes: ...


def incremental_window(
    athlete_id: int | str, db_conn: psycopg.Connection
) -> tuple[date, date] | None:
    """The single activity window an incremental sync has to request.

    ``None`` means the stored activities already reach the athlete's current
    day, so there is nothing to fetch. The window is widened backwards by the
    reconcile lookback so late edits and deletions upstream are picked up.
    """
    newest = _athlete_today(db_conn, athlete_id)
    oldest = _next_sync_date(athlete_id, db_conn)
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
    return await sync_incremental_window(
        athlete_id,
        client,
        db_conn,
        window[0],
        window[1],
        job_id,
        on_stream_progress,
    )


async def sync_activity_streams(
    athlete_id: int | str,
    client: ActivityFitClient,
    conn: psycopg.Connection,
    activity_ids: Sequence[str],
    force: bool = False,
    on_progress: StreamProgress | None = None,
) -> StreamSyncResult:
    inserted = 0
    errors: list[StreamSyncError] = []
    for activity_id in activity_ids:
        if not force and has_streams(conn, activity_id):
            if on_progress is not None:
                on_progress(activity_id, 0)
            continue
        try:
            fit_bytes = await client.download_fit(activity_id)
            result = parse_fit(fit_bytes)
            if not result.samples:
                continue
            rows = _fit_samples_to_stream_rows(result.samples)
            activity_inserted = bulk_insert(conn, athlete_id, activity_id, rows)
            inserted += activity_inserted
            upsert_laps_sync(conn, athlete_id, activity_id, result.laps)
            if on_progress is not None:
                on_progress(activity_id, activity_inserted)
        except Exception as error:
            errors.append(StreamSyncError(activity_id=activity_id, message=str(error)))
            continue
    return StreamSyncResult(inserted=inserted, errors=tuple(errors))


async def backfill_activities(
    athlete_id: int | str,
    client: ActivitiesClient,
    db_conn: psycopg.Connection,
    from_date: date | str,
    to_date: date | str,
    job_id: UUID | None = None,
    on_window: WindowProgress | None = None,
) -> ActivitySyncStats:
    start = _as_date(from_date)
    end = _as_date(to_date)
    if start > end:
        return ActivitySyncStats()

    stats = ActivitySyncStats()
    for oldest, newest in _monthly_windows(start, end):
        window_stats, _remote_activities = await sync_activity_window(
            athlete_id, client, db_conn, oldest, newest, job_id
        )
        stats += window_stats
        if on_window is not None:
            on_window(oldest, newest, window_stats)
    return stats


_UPSERT_SQL = activity_summary.UPSERT_SQL


def _next_sync_date(athlete_id: int | str, db_conn: psycopg.Connection) -> date:
    today = _athlete_today(db_conn, athlete_id)
    return next_sync_date(athlete_id, db_conn, today, _INITIAL_LOOKBACK_DAYS)


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

    sync_run_id = start_sync_run(
        db_conn, athlete_id, "intervals_icu", oldest, newest, job_id
    )
    activities = await client.get_activities(athlete_id, oldest.isoformat(), newest.isoformat())
    if not activities:
        finish_sync_run(
            db_conn, sync_run_id, status="success", activities_seen=0,
            activities_upserted=0, activities_deduplicated=0, errors_count=0,
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
            _ = cur.execute(activity_summary.UPSERT_SQL, params)
            row = cur.fetchone()
            if row and row[0]:
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

