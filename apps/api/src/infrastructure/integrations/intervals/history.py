"""History discovery for a whole-account import.

Intervals.icu returns activities newest-first and caps a list call, so the
presence of an activity in a range is the only reliable signal: the last row
of a full page is the newest record, never the oldest. Each probe therefore
asks for one calendar year and only answers "is there anything here".

The earliest year with data is found by walking years backwards. Within that
year, month windows and finally the month's own rows locate the first day.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import NamedTuple

import psycopg

from infrastructure.integrations.intervals.sync_helpers import (
    athlete_today,
    monthly_windows,
)
from infrastructure.integrations.intervals.sync_types import ActivitiesClient

HISTORY_HORIZON_YEAR = 2000


class HistoryWindow(NamedTuple):
    start: date
    end: date


def _activity_day(activity: object) -> date:
    if not isinstance(activity, dict):
        raise TypeError("activity payload must be an object")
    raw = activity.get("start_date_local") or activity.get("start_date")
    if not isinstance(raw, str):
        raise ValueError("activity has no start date")
    return date.fromisoformat(raw[:10])


def incremental_start_or_none(
    conn: psycopg.Connection, athlete_id: str
) -> date | None:
    """The next day an incremental sync requests, or ``None`` for a first import."""
    with conn.cursor() as cur:
        _ = cur.execute(
            "SELECT max((a.start_time AT TIME ZONE ath.timezone)::date) "
            "FROM activity_summary a JOIN athletes ath ON ath.id = a.athlete_id "
            "WHERE a.athlete_id = %s",
            (athlete_id,),
        )
        row = cur.fetchone()
    latest = row[0] if row else None
    if latest is None:
        return None
    if isinstance(latest, date):
        return latest + timedelta(days=1)
    raise TypeError("activity_summary.start_time must be a timestamp")


async def discover_history_window(
    athlete_id: str,
    client: ActivitiesClient,
    today: date,
) -> HistoryWindow:
    """Locate the athlete's earliest activity and return ``[first_day, today]``.

    The year walk stops at the first empty year, which bounds history: any
    earlier year is empty too. Within the earliest year that has data, months
    are listed in order until one returns rows.
    """
    year = today.year
    earliest_year_with_data: int | None = None
    while year >= HISTORY_HORIZON_YEAR:
        rows = await client.get_activities(
            athlete_id, f"{year}-01-01", f"{year}-12-31"
        )
        if rows:
            earliest_year_with_data = year
            year -= 1
            continue
        break
    if earliest_year_with_data is None:
        # No activity anywhere in the searched history; sync just the current day.
        return HistoryWindow(start=today, end=today)

    year = earliest_year_with_data
    earliest: date | None = None
    for start, end in monthly_windows(date(year, 1, 1), date(year, 12, 31)):
        rows = await client.get_activities(
            athlete_id, start.isoformat(), end.isoformat()
        )
        if rows:
            earliest = min(_activity_day(row) for row in rows)
            break
    return HistoryWindow(start=earliest or date(year, 12, 31), end=today)


async def resolve_initial_history_window(
    athlete_id: str,
    client: ActivitiesClient,
    conn: psycopg.Connection,
) -> HistoryWindow:
    return await discover_history_window(athlete_id, client, athlete_today(conn, athlete_id))
