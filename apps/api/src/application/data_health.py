from __future__ import annotations

from datetime import date, datetime
from typing import Any, cast
from uuid import UUID


async def compute_data_health(athlete_id: UUID, db_pool_or_conn: Any) -> dict[str, object]:
    connection_factory = getattr(db_pool_or_conn, "connection", None)
    if callable(connection_factory):
        async with connection_factory() as conn, conn.cursor() as cur:
            return await _read_health(cur, athlete_id)

    async with db_pool_or_conn.cursor() as cur:
        return await _read_health(cur, athlete_id)


async def _read_health(cur: Any, athlete_id: UUID) -> dict[str, object]:
    _ = await cur.execute(_ACTIVITY_HEALTH_QUERY, (athlete_id,))
    activity_row = await cur.fetchone()
    _ = await cur.execute(_WELLNESS_HEALTH_QUERY, (athlete_id,))
    wellness_row = await cur.fetchone()
    _ = await cur.execute(_WELLNESS_COVERAGE_QUERY, (athlete_id,))
    coverage_row = await cur.fetchone()
    _ = await cur.execute(_STRENGTH_COVERAGE_QUERY, (athlete_id,))
    strength_row = await cur.fetchone()
    _ = await cur.execute(_UPLOAD_COVERAGE_QUERY, (athlete_id,))
    upload_row = await cur.fetchone()
    _ = await cur.execute(_TRAINING_LOAD_HEALTH_QUERY, (athlete_id,))
    training_load_row = await cur.fetchone()
    _ = await cur.execute(_ATHLETE_TIMEZONE_QUERY, (athlete_id,))
    tz_row = await cur.fetchone()
    raw_timezone = tz_row.get("timezone") if tz_row else None
    if isinstance(raw_timezone, (bytes, bytearray)):
        raw_timezone = raw_timezone.decode()
    athlete_timezone = str(raw_timezone) if raw_timezone else "UTC"
    _ = await cur.execute(_GAPS_QUERY, (athlete_timezone, athlete_id, athlete_id))
    gap_rows = await cur.fetchall()

    activities = _activity_health(activity_row)
    return {
        "activities": activities,
        "wellness": _wellness_health(wellness_row),
        "training_load": {"data_as_of": _date_value(training_load_row, "data_as_of")},
        "completeness": {"activities": _activity_completeness(activities)},
        "coverage": {
            "activities": {
                "total_activities": _int_object(activities["total"]),
                "with_hr": _int_object(activities["with_hr"]),
                "with_gps": _int_object(activities["with_gps"]),
                "with_power": _int_object(activities["with_power"]),
                "with_streams": _int_object(activities["with_streams"]),
            },
            "wellness": _wellness_coverage(coverage_row),
            "strength": _strength_coverage(strength_row),
            "uploads": _upload_coverage(upload_row),
        },
        "gaps": [_gap(row) for row in gap_rows],
    }


def _activity_health(row: dict[str, object] | None) -> dict[str, object]:
    return {
        "data_as_of": _datetime_value(row, "data_as_of"),
        "total": _int_value(row, "total"),
        "with_hr": _int_value(row, "with_hr"),
        "with_gps": _int_value(row, "with_gps"),
        "with_power": _int_value(row, "with_power"),
        "with_streams": _int_value(row, "with_streams"),
    }


def _activity_completeness(activities: dict[str, object]) -> dict[str, int]:
    return {
        "with_hr": _int_object(activities["with_hr"]),
        "with_gps": _int_object(activities["with_gps"]),
        "with_power": _int_object(activities["with_power"]),
    }


def _wellness_coverage(row: dict[str, object] | None) -> dict[str, int]:
    return {
        "sleep_days_28d": _int_value(row, "sleep_days_28d"),
        "rhr_days_28d": _int_value(row, "rhr_days_28d"),
        "hrv_days_28d": _int_value(row, "hrv_days_28d"),
    }


def _strength_coverage(row: dict[str, object] | None) -> dict[str, int]:
    return {
        "sessions_14d": _int_value(row, "sessions_14d"),
        "sessions_total": _int_value(row, "sessions_total"),
    }


def _upload_coverage(row: dict[str, object] | None) -> dict[str, int]:
    return {
        "runs_30d": _int_value(row, "runs_30d"),
        "failed_30d": _int_value(row, "failed_30d"),
    }


def _wellness_health(row: dict[str, object] | None) -> dict[str, object]:
    return {
        "data_as_of": _date_value(row, "data_as_of"),
        "total_days": _int_value(row, "total_days"),
        "latest_day": _date_value(row, "latest_day"),
    }


def _gap(row: dict[str, date]) -> dict[str, date]:
    return {"from": row["from"], "to": row["to"]}


def _datetime_value(row: dict[str, object] | None, key: str) -> datetime | None:
    if row is None:
        return None
    value = row.get(key)
    return cast(datetime, value) if value is not None else None


def _date_value(row: dict[str, object] | None, key: str) -> date | None:
    if row is None:
        return None
    value = row.get(key)
    return cast(date, value) if value is not None else None


def _int_value(row: dict[str, object] | None, key: str) -> int:
    return _int_object(row.get(key)) if row else 0


def _int_object(value: object) -> int:
    return int(value) if isinstance(value, int | float | str) else 0


_ACTIVITY_HEALTH_QUERY = """
SELECT
    max(start_time) AS data_as_of,
    count(*) AS total,
    count(*) FILTER (WHERE avg_hr IS NOT NULL) AS with_hr,
    count(*) FILTER (WHERE avg_power IS NOT NULL) AS with_power,
    count(*) FILTER (
        WHERE EXISTS (
            SELECT 1 FROM activity_streams s
            WHERE s.athlete_id = activity_compute.athlete_id
              AND s.activity_id = activity_compute.activity_id
              AND s.lat IS NOT NULL AND s.lon IS NOT NULL LIMIT 1
        )
    ) AS with_gps,
    count(*) FILTER (
        WHERE EXISTS (
            SELECT 1 FROM activity_streams s
            WHERE s.athlete_id = activity_compute.athlete_id
              AND s.activity_id = activity_compute.activity_id LIMIT 1
        )
    ) AS with_streams
FROM activity_compute
WHERE athlete_id = %s
"""

_WELLNESS_HEALTH_QUERY = """
SELECT max(day) AS data_as_of, count(*) AS total_days, max(day) AS latest_day
FROM health_wellness
WHERE athlete_id = %s
"""

_TRAINING_LOAD_HEALTH_QUERY = """
SELECT max(day) AS data_as_of
FROM current_daily_facts
WHERE athlete_id = %s AND sport IS NULL AND metric_key = 'daily_tss'
"""

_WELLNESS_COVERAGE_QUERY = """
SELECT
    count(*) FILTER (WHERE sleep_secs IS NOT NULL AND sleep_secs > 0) AS sleep_days_28d,
    count(*) FILTER (WHERE resting_hr IS NOT NULL) AS rhr_days_28d,
    count(*) FILTER (WHERE hrv IS NOT NULL) AS hrv_days_28d
FROM health_wellness
WHERE athlete_id = %s AND day >= CURRENT_DATE - INTERVAL '27 days'
"""

_STRENGTH_COVERAGE_QUERY = """
SELECT
    count(*) FILTER (WHERE start_time >= now() - interval '14 days') AS sessions_14d,
    count(*) AS sessions_total
FROM activity_compute
WHERE athlete_id = %s AND sport = 'Workout'
"""

_UPLOAD_COVERAGE_QUERY = """
SELECT
    count(*) AS runs_30d,
    count(*) FILTER (WHERE status = 'failed' OR errors_count > 0) AS failed_30d
FROM integration_sync_runs
WHERE athlete_id = %s AND source = 'manual'
  AND started_at >= now() - interval '30 days'
"""

_ATHLETE_TIMEZONE_QUERY = "SELECT timezone FROM athletes WHERE id = %s"

_GAPS_QUERY = """
WITH local_today AS (
    SELECT (now() AT TIME ZONE %s)::date AS today
), days AS (
    SELECT generate_series(
        (SELECT today FROM local_today) - INTERVAL '89 days',
        (SELECT today FROM local_today),
        INTERVAL '1 day'
    )::date AS day
), observed AS (
    SELECT DISTINCT (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date AS day
    FROM activity_compute a
    JOIN athletes ath ON ath.id = a.athlete_id
    WHERE a.athlete_id = %s
      AND (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date
          BETWEEN (SELECT today FROM local_today) - INTERVAL '89 days'
          AND (SELECT today FROM local_today)
    UNION
    SELECT day
    FROM health_wellness
    WHERE athlete_id = %s
      AND day BETWEEN (SELECT today FROM local_today) - INTERVAL '89 days'
          AND (SELECT today FROM local_today)
), missing AS (
    SELECT days.day
    FROM days
    LEFT JOIN observed USING (day)
    WHERE observed.day IS NULL
), grouped AS (
    SELECT day, day - (row_number() OVER (ORDER BY day)::int) AS island
    FROM missing
)
SELECT min(day) AS "from", max(day) AS "to"
FROM grouped
GROUP BY island
ORDER BY min(day)
"""
