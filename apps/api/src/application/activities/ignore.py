"""Ignore / un-ignore activities without deleting them.

An activity the athlete does not want counted — a commute, a warm-up, a walk,
a strength session — still happened, so it must remain visible in lists. What
it must not do is contribute to training load, PMC, personal records, goal
progress, physiology estimation or the heart-rate histograms.

Both are achieved by setting ``ignored_at``: every derived query reads
``activity_compute``, which filters that column out (see migration
``c9d0e1f2a3b4``). Toggling the flag therefore requires re-deriving the stored
facts, which is what ``refresh_derived_after_raw_change`` does.

Deleting is the other operation and lives elsewhere: ``deleted_at`` hides the
row and the sync must not resurrect it.
"""

from __future__ import annotations

from uuid import UUID

from infrastructure.db.pool import get_pool


class ActivityNotFoundError(Exception):
    """Raised when the activity does not belong to the athlete."""


async def set_ignored(athlete_id: UUID, activity_id: str, ignored: bool) -> bool:
    """Set or clear the ignore flag. Returns the flag's new value.

    Raises :class:`ActivityNotFoundError` when no row matches, so the router can
    distinguish "not yours / does not exist" from "already in that state".
    """
    query = """
    UPDATE activity_summary
    SET ignored_at = CASE WHEN %s THEN now() ELSE NULL END
    WHERE athlete_id = %s AND activity_id = %s
    RETURNING ignored_at
    """
    async with get_pool().connection() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, (ignored, athlete_id, activity_id))
        row = await cur.fetchone()
    if row is None:
        raise ActivityNotFoundError(activity_id)
    value = row["ignored_at"] if isinstance(row, dict) else row[0]
    return value is not None


async def set_ignored_bulk(
    athlete_id: UUID, activity_ids: list[str], ignored: bool
) -> list[str]:
    """Set the flag for several activities; returns the ids that were updated."""
    if not activity_ids:
        return []
    query = """
    UPDATE activity_summary
    SET ignored_at = CASE WHEN %s THEN now() ELSE NULL END
    WHERE athlete_id = %s AND activity_id = ANY(%s)
    RETURNING activity_id
    """
    async with get_pool().connection() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, (ignored, athlete_id, activity_ids))
        rows = await cur.fetchall()
    return [str(row["activity_id"] if isinstance(row, dict) else row[0]) for row in rows]


async def restore(athlete_id: UUID, activity_id: str) -> bool:
    """Undo a soft delete. Returns False when the activity is not in the trash."""
    query = """
    UPDATE activity_summary
    SET deleted_at = NULL
    WHERE athlete_id = %s AND activity_id = %s AND deleted_at IS NOT NULL
    RETURNING activity_id
    """
    async with get_pool().connection() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id, activity_id))
        row = await cur.fetchone()
    return row is not None


async def list_ignored(athlete_id: UUID) -> list[dict[str, object]]:
    """Activities currently excluded from the numbers."""
    query = """
    SELECT activity_id, start_time, sport, distance_m, duration_s, ignored_at
    FROM activity_summary
    WHERE athlete_id = %s AND ignored_at IS NOT NULL
    ORDER BY start_time DESC
    """
    async with get_pool().connection() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id,))
        return [dict(row) for row in await cur.fetchall()]


async def list_trashed(athlete_id: UUID) -> list[dict[str, object]]:
    """Soft-deleted activities, newest first."""
    query = """
    SELECT activity_id, start_time, sport, distance_m, duration_s, deleted_at
    FROM activity_summary
    WHERE athlete_id = %s AND deleted_at IS NOT NULL
    ORDER BY start_time DESC
    """
    async with get_pool().connection() as conn, conn.cursor() as cur:
        _ = await cur.execute(query, (athlete_id,))
        return [dict(row) for row in await cur.fetchall()]
