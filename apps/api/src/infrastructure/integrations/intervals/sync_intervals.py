"""Persist Intervals.icu precise activity intervals."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, cast

import psycopg
from psycopg.types.json import Jsonb

from infrastructure.integrations.intervals.sync_types import (
    ActivityIntervalsClient,
    IntervalProgress,
    IntervalSyncError,
    IntervalSyncResult,
)

KEEP_KEYS = (
    "id",
    "start_index",
    "end_index",
    "start_time",
    "end_time",
    "type",
    "label",
    "group_id",
    "moving_time",
    "elapsed_time",
    "distance",
    "average_watts",
    "intensity",
    "average_speed",
    "average_pace",
    "gap",
    "average_heartrate",
    "max_heartrate",
    "average_cadence",
    "total_elevation_gain",
    "average_stride",
)


async def sync_activity_intervals(
    athlete_id: int | str,
    client: ActivityIntervalsClient,
    conn: psycopg.Connection,
    activity_ids: Sequence[str],
    on_progress: IntervalProgress | None = None,
) -> IntervalSyncResult:
    """Fetch and persist precise segments for each activity, failing per item."""
    fetched = 0
    errors: list[IntervalSyncError] = []
    for activity_id in activity_ids:
        try:
            remote = await client.get_activity(activity_id, intervals=True)
            payload = interval_payload(remote)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO activity_intervals (athlete_id, activity_id, payload)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (athlete_id, activity_id) DO UPDATE SET
                        payload = EXCLUDED.payload,
                        fetched_at = now()
                    """,
                    (athlete_id, activity_id, Jsonb(payload)),
                )
                cur.execute(
                    """
                    UPDATE activity_summary
                    SET raw_data = COALESCE(raw_data, '{}'::jsonb) || %s::jsonb
                    WHERE athlete_id = %s AND activity_id = %s
                    """,
                    (Jsonb(payload), athlete_id, activity_id),
                )
            fetched += 1
            if on_progress is not None:
                intervals = cast(list[dict[str, Any]], payload["icu_intervals"])
                on_progress(activity_id, len(intervals))
        except Exception as error:
            errors.append(IntervalSyncError(activity_id=activity_id, message=str(error)))
            continue
    return IntervalSyncResult(fetched=fetched, errors=tuple(errors))


def interval_payload(remote: object) -> dict[str, object]:
    """Keep only the fields the classifier consumes, with the group metadata."""
    if not isinstance(remote, dict):
        raise ValueError("intervals response must be an object")
    intervals = remote.get("icu_intervals")
    groups = remote.get("icu_groups")
    if intervals is None:
        intervals = []
    if not isinstance(intervals, list):
        raise ValueError("intervals response has no icu_intervals list")
    if not isinstance(groups, list):
        groups = []
    return {
        "icu_intervals": [
            {key: item.get(key) for key in KEEP_KEYS if key in item}
            for item in intervals
            if isinstance(item, dict)
        ],
        "icu_groups": [
            {key: item.get(key) for key in KEEP_KEYS if key in item}
            for item in groups
            if isinstance(item, dict)
        ],
        "interval_summary": remote.get("interval_summary"),
    }
