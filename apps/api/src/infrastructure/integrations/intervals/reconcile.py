"""Ghost-activity reconciliation for intervals.icu sync.

When intervals.icu replaces an activity (same time/distance, different
``activity_id`` — e.g. HUAWEI Health → Health Sync re-upload), the old ID
becomes a ghost: it still exists locally but the source has discarded it.
This module compares local IDs against the remote ID set from the same list
call already issued by incremental sync, and physically deletes ghosts.

Zero additional API calls — it reuses the list result already in hand.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping, Sequence

import psycopg

logger = logging.getLogger(__name__)

_GHOST_SOURCE_PREFIX = "intervals.icu"


def reconcile_ghosts(
    conn: psycopg.Connection,
    athlete_id: str,
    window_start: object,
    window_end: object,
    remote_activities: Sequence[Mapping[str, object]],
) -> int:
    """Delete local intervals.icu activities absent from the remote set.

    Only activities whose ``start_time`` falls inside ``[window_start,
    window_end]`` and whose ``source`` is intervals.icu are candidates, so a
    transient list failure in one window cannot nuke unrelated history.
    Returns the number of ghost rows deleted.
    """
    remote_ids = {_remote_id(activity) for activity in remote_activities}
    if not remote_ids:
        return 0

    local_ids = _local_interval_ids(conn, athlete_id, window_start, window_end)
    ghosts = local_ids - remote_ids
    if not ghosts:
        return 0

    deleted = 0
    with conn.cursor() as cur:
        for ghost_id in ghosts:
            _ = cur.execute(
                "DELETE FROM activity_streams WHERE athlete_id = %s AND activity_id = %s",
                (athlete_id, ghost_id),
            )
            _ = cur.execute(
                "DELETE FROM activity_laps WHERE athlete_id = %s AND activity_id = %s",
                (athlete_id, ghost_id),
            )
            _ = cur.execute(
                "DELETE FROM activity_summary WHERE athlete_id = %s AND activity_id = %s",
                (athlete_id, ghost_id),
            )
            deleted += cur.rowcount
        logger.info(
            "reconcile_ghosts: athlete=%s deleted=%d ghosts=%s",
            athlete_id,
            deleted,
            sorted(ghosts),
        )
    return deleted


def _local_interval_ids(
    conn: psycopg.Connection,
    athlete_id: str,
    window_start: object,
    window_end: object,
) -> set[str]:
    with conn.cursor() as cur:
        _ = cur.execute(
            """
            SELECT activity_id FROM activity_summary
            WHERE athlete_id = %s
              AND source = %s
              AND start_time::date BETWEEN %s AND %s
            """,
            (athlete_id, _GHOST_SOURCE_PREFIX, window_start, window_end),
        )
        return {_decode_id(row[0]) for row in cur.fetchall()}


def _decode_id(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode()
    return str(value)


def _remote_id(activity: Mapping[str, object]) -> str:
    return str(activity["id"])
