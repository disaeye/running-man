from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Protocol, cast, runtime_checkable

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
    fit_samples_to_stream_rows as _fit_samples_to_stream_rows,
)
from infrastructure.integrations.intervals.sync_helpers import (
    monthly_windows as _monthly_windows,
)
from infrastructure.integrations.intervals.sync_rejections import (
    record_activity_rejection,
    record_secondary_duplicate,
)
from infrastructure.parsing.fit_parser import FitLap, parse_fit
from infrastructure.repositories import activity_summary
from infrastructure.repositories.activity import ActivitySyncStats
from infrastructure.repositories.activity_streams import bulk_insert, has_streams
from infrastructure.repositories.sync_provenance import (
    finish_sync_run,
    secondary_duplicate_exists,
    start_sync_run,
)

_RECONCILE_LOOKBACK_DAYS = 14


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

    @property
    def upserted(self) -> int:
        return self.activity_stats.upserted

    @property
    def deduplicated(self) -> int:
        return self.activity_stats.deduplicated

    @property
    def total_processed(self) -> int:
        return self.activity_stats.total_processed


class ActivitiesClient(Protocol):
    async def get_activities(
        self, athlete_id: int | str, oldest: str, newest: str
    ) -> Sequence[Mapping[str, object]]: ...


@runtime_checkable
class ActivityFitClient(Protocol):
    async def download_fit(self, activity_id: str) -> bytes: ...


async def sync_activities_incremental(
    athlete_id: int | str, client: ActivitiesClient, db_conn: psycopg.Connection
) -> IncrementalSyncResult:
    oldest = _next_sync_date(athlete_id, db_conn)
    newest = date.today()
    if oldest > newest:
        return IncrementalSyncResult(activity_stats=ActivitySyncStats())
    reconcile_lookback = oldest - timedelta(days=_RECONCILE_LOOKBACK_DAYS)
    stats, remote_activities = await _sync_window(
        athlete_id, client, db_conn, reconcile_lookback, newest
    )

    _ = reconcile_ghosts(
        db_conn,
        str(athlete_id),
        reconcile_lookback,
        newest,
        list(remote_activities),
    )

    stream_result = StreamSyncResult()
    if isinstance(client, ActivityFitClient):
        activity_ids = _activity_ids_in_window(athlete_id, db_conn, reconcile_lookback, newest)
        stream_result = await sync_activity_streams(athlete_id, client, db_conn, activity_ids)

    return IncrementalSyncResult(activity_stats=stats, stream_result=stream_result)


async def sync_activity_streams(
    athlete_id: int | str,
    client: ActivityFitClient,
    conn: psycopg.Connection,
    activity_ids: Sequence[str],
    force: bool = False,
) -> StreamSyncResult:
    inserted = 0
    errors: list[StreamSyncError] = []
    for activity_id in activity_ids:
        if not force and has_streams(conn, activity_id):
            continue
        try:
            fit_bytes = await client.download_fit(activity_id)
            result = parse_fit(fit_bytes)
            if not result.samples:
                continue
            rows = _fit_samples_to_stream_rows(result.samples)
            inserted += bulk_insert(conn, athlete_id, activity_id, rows)
            _upsert_laps_sync(conn, athlete_id, activity_id, result.laps)
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
) -> ActivitySyncStats:
    start = _as_date(from_date)
    end = _as_date(to_date)
    if start > end:
        return ActivitySyncStats()

    stats = ActivitySyncStats()
    for oldest, newest in _monthly_windows(start, end):
        window_stats, _remote_activities = await _sync_window(
            athlete_id, client, db_conn, oldest, newest
        )
        stats += window_stats
    return stats


def _next_sync_date(athlete_id: int | str, db_conn: psycopg.Connection) -> date:
    with db_conn.cursor() as cur:
        _ = cur.execute(
            "SELECT max(start_time) FROM activity_summary WHERE athlete_id = %s",
            (athlete_id,),
        )
        row = cur.fetchone()

    latest = row[0] if row else None

    if latest is None:
        return date.today() - timedelta(days=30)
    if isinstance(latest, datetime):
        return latest.date() + timedelta(days=1)
    raise TypeError("activity_summary.start_time must be a datetime")


async def _sync_window(
    athlete_id: int | str,
    client: ActivitiesClient,
    db_conn: psycopg.Connection,
    oldest: date,
    newest: date,
) -> tuple[ActivitySyncStats, Sequence[Mapping[str, object]]]:
    if oldest > newest:
        return ActivitySyncStats(), ()

    sync_run_id = start_sync_run(db_conn, athlete_id, "intervals_icu", oldest, newest)
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
            source_hash = cast(str, params[22])
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


def _activity_ids_in_window(
    athlete_id: int | str, db_conn: psycopg.Connection, oldest: date, newest: date
) -> list[str]:
    with db_conn.cursor() as cur:
        _ = cur.execute(
            """
            SELECT activity_id FROM activity_summary
            WHERE athlete_id = %s AND start_time::date BETWEEN %s AND %s
            ORDER BY start_time DESC
            """,
            (athlete_id, oldest, newest),
        )
        rows = cast(Sequence[Sequence[object]], cur.fetchall())
        return [str(row[0]) for row in rows]


_UPSERT_SQL = activity_summary.UPSERT_SQL


def _upsert_laps_sync(
    conn: psycopg.Connection,
    athlete_id: int | str,
    activity_id: str,
    laps: Sequence[FitLap],
) -> int:
    """Persist device FIT laps using the same shape as manual upload."""
    if not laps:
        return 0
    with conn.cursor() as cur:
        _ = cur.execute(
            "DELETE FROM activity_laps WHERE athlete_id = %s AND activity_id = %s",
            (athlete_id, activity_id),
        )
        values = [
            (
                activity_id,
                athlete_id,
                index,
                lap.start_time,
                round(lap.total_elapsed_time),
                lap.total_distance,
                lap.avg_heart_rate,
                lap.max_heart_rate,
            )
            for index, lap in enumerate(laps)
        ]
        cur.executemany(
            """
            INSERT INTO activity_laps
                (activity_id, athlete_id, lap_index, start_time,
                 duration_s, distance_m, avg_hr, max_hr)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            values,
        )
    return len(values)
