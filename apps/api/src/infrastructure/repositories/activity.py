from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any, cast
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool
from infrastructure.repositories.activity_manual import create_manual_activity
from infrastructure.repositories.activity_reads import ActivityReadRepo
from infrastructure.repositories.activity_sql import (
    _INSERT_STREAM_SQL,
    _UPSERT_UPLOAD_SQL,
    _stream_params,
    _summary_params,
    compute_source_hash,
)

__all__ = ["ActivityRepo", "ActivitySyncStats", "compute_source_hash"]


def _connect() -> ConnectionContext:
    return get_pool().connection()


@dataclass(frozen=True)
class ActivitySyncStats:
    upserted: int = 0
    deduplicated: int = 0
    total_processed: int = 0

    def __add__(self, other: "ActivitySyncStats") -> "ActivitySyncStats":
        return ActivitySyncStats(
            upserted=self.upserted + other.upserted,
            deduplicated=self.deduplicated + other.deduplicated,
            total_processed=self.total_processed + other.total_processed,
        )


class ActivityRepo:
    async def upsert_upload(
        self,
        athlete_id: UUID,
        summary: dict[str, object],
        streams: Sequence[dict[str, object]],
    ) -> dict[str, object]:
        async with _connect() as conn, conn.cursor() as cur:
            params = _summary_params(athlete_id, summary)
            _ = await cur.execute(_UPSERT_UPLOAD_SQL, params)
            row = await cur.fetchone()
            activity_id = row["activity_id"] if row else summary["activity_id"]
            _ = await cur.execute(
                "DELETE FROM activity_streams WHERE athlete_id = %s AND activity_id = %s",
                (athlete_id, activity_id),
            )
            stream_rows = [_stream_params(athlete_id, activity_id, s) for s in streams]
            if stream_rows:
                await cur.executemany(_INSERT_STREAM_SQL, stream_rows)
        assert row is not None
        return dict(row)

    async def list_by_range(
        self, athlete_id: UUID, start: date, end: date
    ) -> list[dict[str, object]]:
        return await ActivityReadRepo().list_by_range(athlete_id, start, end)

    async def get_by_id(self, athlete_id: UUID, activity_id: str) -> dict[str, object] | None:
        return await ActivityReadRepo().get_by_id(athlete_id, activity_id)

    async def exists(self, activity_id: str) -> bool:
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                "SELECT 1 FROM activity_summary WHERE activity_id = %s LIMIT 1",
                (activity_id,),
            )
            return await cur.fetchone() is not None

    async def get_streams(self, athlete_id: UUID, activity_id: str) -> list[dict[str, object]]:
        # No LIMIT: a silent cap here would truncate long activities' streams
        # (e.g. 10h at 1 Hz × several metrics ≫ 50k rows) and corrupt the
        # downstream charts. A single activity's rows are bounded by its
        # duration, so fetching all of them is safe.
        query = """
        SELECT sample_time, metric_type, value, lat, lon, alt
        FROM activity_streams
        WHERE athlete_id = %s AND activity_id = %s
        ORDER BY sample_time, metric_type
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, activity_id))
            return [dict(row) for row in await cur.fetchall()]

    async def get_laps(self, athlete_id: UUID, activity_id: str) -> list[dict[str, object]]:
        query = """
        SELECT lap_index, start_time, duration_s, distance_m, avg_hr, max_hr, avg_power
        FROM activity_laps
        WHERE athlete_id = %s AND activity_id = %s
        ORDER BY lap_index
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, activity_id))
            return [dict(row) for row in await cur.fetchall()]

    async def create_manual_activity(
        self,
        athlete_id: UUID,
        activity: dict[str, object],
        event_link: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return await create_manual_activity(athlete_id, activity, event_link)

    async def upsert_laps(
        self,
        athlete_id: UUID,
        activity_id: str,
        laps: list[dict[str, object]],
    ) -> int:
        """Replace device-defined laps for an activity.

        Deletes existing laps then inserts the new set, so re-uploading an
        activity refreshes its lap structure rather than duplicating.
        """
        if not laps:
            return 0
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                "DELETE FROM activity_laps WHERE athlete_id = %s AND activity_id = %s",
                (athlete_id, activity_id),
            )
            values = [
                (
                    activity_id,
                    athlete_id,
                    int(cast(Any, lap.get("lap_index", index))),
                    lap.get("start_time"),
                    lap.get("duration_s"),
                    lap.get("distance_m"),
                    lap.get("avg_hr"),
                    lap.get("max_hr"),
                )
                for index, lap in enumerate(laps)
            ]
            await cur.executemany(
                """
                INSERT INTO activity_laps
                    (activity_id, athlete_id, lap_index, start_time,
                     duration_s, distance_m, avg_hr, max_hr)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                values,
            )
            await conn.commit()
        return len(values)

    async def delete(self, athlete_id: UUID, activity_id: str) -> bool:
        """Hard-delete a single activity and its streams. Returns True if a row was deleted.

        Used by the bulk-clear path ("remove everything from this source"), where
        the intent really is to be rid of the rows. The single-activity endpoint
        uses :meth:`soft_delete` so the athlete can undo it.
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                "DELETE FROM activity_streams WHERE athlete_id = %s AND activity_id = %s",
                (athlete_id, activity_id),
            )
            _ = await cur.execute(
                "DELETE FROM activity_summary WHERE athlete_id = %s AND activity_id = %s",
                (athlete_id, activity_id),
            )
            return cur.rowcount > 0

    async def soft_delete(self, athlete_id: UUID, activity_id: str) -> bool:
        """Mark an activity deleted without removing the row (or its streams).

        Re-deleting an already-deleted activity is not an error and reports no
        change, so a repeated request cannot be mistaken for a successful one
        on a different activity.
        """
        query = """
        UPDATE activity_summary SET deleted_at = now()
        WHERE athlete_id = %s AND activity_id = %s AND deleted_at IS NULL
        RETURNING activity_id
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id, activity_id))
            return await cur.fetchone() is not None

    async def delete_by_source(self, athlete_id: UUID, source: str) -> int:
        """Delete all activities from a given source (+ streams/laps). Returns deleted count."""
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                """
                WITH deleted AS (
                    DELETE FROM activity_summary
                    WHERE athlete_id = %s AND source = %s
                    RETURNING activity_id
                ),
                del_streams AS (
                    DELETE FROM activity_streams
                    WHERE athlete_id = %s
                      AND activity_id IN (SELECT activity_id FROM deleted)
                    RETURNING 1
                ),
                del_laps AS (
                    DELETE FROM activity_laps
                    WHERE athlete_id = %s
                      AND activity_id IN (SELECT activity_id FROM deleted)
                    RETURNING 1
                )
                SELECT count(*) AS n FROM deleted
                """,
                (athlete_id, source, athlete_id, athlete_id),
            )
            row = await cur.fetchone()
            if row is None:
                return 0
            return int(row["n"] if isinstance(row, dict) else row[0])

    async def delete_all(self, athlete_id: UUID) -> int:
        """Delete all activities for an athlete (+ streams/laps). Returns 0 remaining."""
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                """
                WITH deleted AS (
                    DELETE FROM activity_summary
                    WHERE athlete_id = %s
                    RETURNING activity_id
                ),
                del_streams AS (
                    DELETE FROM activity_streams
                    WHERE athlete_id = %s
                      AND activity_id IN (SELECT activity_id FROM deleted)
                    RETURNING 1
                )
                DELETE FROM activity_laps
                WHERE athlete_id = %s
                  AND activity_id IN (SELECT activity_id FROM deleted)
                """,
                (athlete_id, athlete_id, athlete_id),
            )
            return 0
