"""Lap persistence and window activity lookups for intervals.icu sync."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date
from typing import cast

import psycopg

from domain.time import local_day_sql
from infrastructure.integrations.intervals.sync_helpers import (
    athlete_timezone as _athlete_timezone,
)
from infrastructure.parsing.fit_parser import FitLap


def activity_ids_in_window(
    athlete_id: int | str, db_conn: psycopg.Connection, oldest: date, newest: date
) -> list[str]:
    zone = _athlete_timezone(db_conn, athlete_id)
    day = local_day_sql("%s")
    with db_conn.cursor() as cur:
        _ = cur.execute(
            f"""
            SELECT activity_id FROM activity_summary
            WHERE athlete_id = %s AND {day} BETWEEN %s AND %s
            ORDER BY start_time DESC
            """,
            (athlete_id, zone, oldest, newest),
        )
        rows = cast(Sequence[Sequence[object]], cur.fetchall())
        return [str(row[0]) for row in rows]


def upsert_laps_sync(
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
