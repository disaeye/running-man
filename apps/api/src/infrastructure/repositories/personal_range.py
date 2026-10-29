"""Reading the athlete's own history for the personal-range figures.

Every metric here is a measured value with a date: wellness readings from the
health table, load facts from the PMC series, and activity summaries. The
endpoint that uses this reports where today's value sits inside the athlete's
own recent range — the reference is stated on the figure itself.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from domain.insights.biomechanics import cadence_to_spm
from domain.sports import is_running


async def wellness_series(
    conn: AsyncConnection[DictRow],
    athlete_id: UUID,
    start: date,
    end: date,
) -> list[dict[str, object]]:
    """The athlete's wellness rows in a date window.

    One row per day, with the readings the window holds.
    """
    async with conn.cursor() as cur:
        _ = await cur.execute(
            """
            SELECT day, resting_hr, hrv, sleep_secs, weight, body_fat_pct, vo2max
            FROM health_wellness
            WHERE athlete_id = %s AND day BETWEEN %s AND %s
            ORDER BY day
            """,
            (athlete_id, start, end),
        )
        return [dict(row) for row in await cur.fetchall()]


async def load_series(
    conn: AsyncConnection[DictRow],
    athlete_id: UUID,
    start: date,
    end: date,
) -> list[dict[str, object]]:
    """The athlete's daily load facts in a date window.

    The facts are stored in the long form (one row per metric per day), so the
    rows are pivoted here into one row per day with a column per metric.
    """
    async with conn.cursor() as cur:
        _ = await cur.execute(
            """
            SELECT day, metric_key, value
            FROM current_daily_facts
            WHERE athlete_id = %s AND day BETWEEN %s AND %s
              AND metric_key IN ('ctl', 'atl', 'tsb', 'tss')
            ORDER BY day, metric_key
            """,
            (athlete_id, start, end),
        )
        rows = await cur.fetchall()

    by_day: dict[date, dict[str, object]] = {}
    for row in rows:
        day = row["day"]
        if not isinstance(day, date):
            continue
        entry = by_day.setdefault(day, {"day": day})
        entry[str(row["metric_key"])] = row["value"]
    return [by_day[day] for day in sorted(by_day)]


async def activity_series(
    conn: AsyncConnection[DictRow],
    athlete_id: UUID,
    start: date,
    end: date,
) -> list[dict[str, object]]:
    """The athlete's activity summaries in a date window.

    The summary rows carry the averages the device reported: cadence, pace and
    the like. They are the athlete-level aggregates, so a single row is one
    observation rather than hundreds of samples.
    """
    async with conn.cursor() as cur:
        _ = await cur.execute(
            """
            SELECT a.start_time, a.sport, a.distance_m, a.duration_s, a.avg_cadence,
                   a.avg_speed, a.avg_hr
            FROM activity_compute a
            JOIN athletes athlete ON athlete.id = a.athlete_id
            WHERE a.athlete_id = %s
              AND (a.start_time AT TIME ZONE athlete.timezone)::date BETWEEN %s AND %s
            ORDER BY a.start_time
            """,
            (athlete_id, start, end),
        )
        return [dict(row) for row in await cur.fetchall()]


def running_cadence_values(
    rows: list[dict[str, object]],
) -> list[float]:
    """The running cadences of a set of activities, in steps per minute.

    Only running activities count. A walk's cadence is a different quantity at
    a different rate, and mixing the two would put a walk's 58 spm at the
    bottom of a range whose top is a run's 190 spm — a range that describes
    nothing.

    The stored cadence is the device's own figure. For running it counts one
    foot's revolutions, so the display figure (steps per minute) is twice it.
    """
    values: list[float] = []
    for row in rows:
        value = row.get("avg_cadence")
        if not isinstance(value, int | float):
            continue
        if not is_running(str(row.get("sport") or "")):
            continue
        converted = cadence_to_spm(float(value), is_running=True)
        if converted is not None:
            values.append(converted)
    return values


def latest_running_cadence(rows: list[dict[str, object]]) -> float | None:
    """The most recent running cadence, in steps per minute."""
    for row in reversed(rows):
        value = row.get("avg_cadence")
        if not isinstance(value, int | float):
            continue
        sport = str(row.get("sport") or "")
        if not is_running(sport):
            continue
        converted = cadence_to_spm(float(value), is_running=True)
        return converted
    return None


def numeric_values(
    rows: list[dict[str, object]],
    key: str,
) -> list[float]:
    """The values of one field across the rows, skipping the missing ones.

    A missing measurement is absent from the range: it is not a zero, and
    counting it as one would drag the minimum down to a number the athlete
    never produced.
    """
    values: list[float] = []
    for row in rows:
        value = row.get(key)
        if isinstance(value, int | float):
            values.append(float(value))
    return values


def latest_value(rows: list[dict[str, object]], key: str) -> float | None:
    """The most recent measured value of one field."""
    for row in reversed(rows):
        value = row.get(key)
        if isinstance(value, int | float):
            return float(value)
    return None
