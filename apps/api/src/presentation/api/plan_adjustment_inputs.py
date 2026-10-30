"""Measured inputs used to review a planned running session."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Final
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

# 触发条件里用到的窗口：七日基线。
BASELINE_DAYS: Final = 7

# 心率漂移要在长距离的前后两段之间比，所以要看这么长的一节课。
DRIFT_LOOKBACK_DAYS: Final = 14

# 只有超过一小时的课，前段与后段的心率比较才有意义。
MIN_DRIFT_SECONDS: Final = 3600


@dataclass(frozen=True, slots=True)
class DetectionInputs:
    """The measured values the detection reads."""

    hrv_today: float | None
    hrv_baseline: float | None
    hr_drift_bpm: float | None
    long_run_seconds: int | None


async def detection_inputs(
    conn: AsyncConnection[DictRow], athlete_id: UUID, today: date
) -> DetectionInputs:
    """Gather health and running-session measurements."""
    baseline_start = today - timedelta(days=BASELINE_DAYS - 1)
    drift_start = today - timedelta(days=DRIFT_LOOKBACK_DAYS)

    hrv_today: float | None = None
    hrv_baseline: float | None = None
    async with conn.cursor() as cur:
        _ = await cur.execute(
            """
            SELECT hrv FROM health_wellness
            WHERE athlete_id = %s AND day = %s AND hrv IS NOT NULL
            """,
            (athlete_id, today),
        )
        row = await cur.fetchone()
        hrv_today = _number(row, "hrv")
        _ = await cur.execute(
            """
            SELECT AVG(hrv) AS baseline FROM health_wellness
            WHERE athlete_id = %s AND day BETWEEN %s AND %s AND hrv IS NOT NULL
            """,
            (athlete_id, baseline_start, today),
        )
        row = await cur.fetchone()
        hrv_baseline = _number(row, "baseline")

    drift, long_seconds = await hr_drift(conn, athlete_id, drift_start, today)
    return DetectionInputs(
        hrv_today=hrv_today,
        hrv_baseline=hrv_baseline,
        hr_drift_bpm=drift,
        long_run_seconds=long_seconds,
    )


async def hr_drift(
    conn: AsyncConnection[DictRow], athlete_id: UUID, start: date, end: date
) -> tuple[float | None, int | None]:
    """The heart-rate drift of the longest recent session, and its length.

    Drift is the rise in heart rate from the first quarter of a session to its
    last quarter, at comparable pace. The session has to be long enough for
    that comparison to mean anything, so only sessions over an hour count.
    """
    async with conn.cursor() as cur:
        _ = await cur.execute(
            """
            SELECT a.duration_s, a.distance_m,
                   (SELECT AVG(s.value) FROM activity_streams s
                     WHERE s.activity_id = a.activity_id
                       AND s.metric_type = 'heart_rate'
                       AND s.sample_time <= a.start_time
                         + (a.duration_s * 0.25) * interval '1 second')
                     AS first_quarter_hr,
                   (SELECT AVG(s.value) FROM activity_streams s
                     WHERE s.activity_id = a.activity_id
                       AND s.metric_type = 'heart_rate'
                       AND s.sample_time >= a.start_time
                         + (a.duration_s * 0.75) * interval '1 second')
                     AS last_quarter_hr
            FROM activity_compute a
            JOIN athletes athlete ON athlete.id = a.athlete_id
            WHERE a.athlete_id = %s
              AND (a.start_time AT TIME ZONE athlete.timezone)::date BETWEEN %s AND %s
              AND a.duration_s >= %s
            ORDER BY a.duration_s DESC
            LIMIT 1
            """,
            (athlete_id, start, end, MIN_DRIFT_SECONDS),
        )
        row = await cur.fetchone()
    if row is None:
        return None, None
    duration = row.get("duration_s")
    first_quarter = row.get("first_quarter_hr")
    last_quarter = row.get("last_quarter_hr")
    if not isinstance(duration, int):
        return None, None
    if not isinstance(first_quarter, int | float) or not isinstance(last_quarter, int | float):
        return None, None
    return float(last_quarter) - float(first_quarter), duration


async def session_row(
    conn: AsyncConnection[DictRow], athlete_id: UUID, event_id: str
) -> dict[str, object] | None:
    """One planned session, as stored."""
    async with conn.cursor() as cur:
        _ = await cur.execute(
            """
            SELECT event_id, start_time, name, training_type, workout_prescription
            FROM training_calendar
            WHERE athlete_id = %s AND event_id = %s AND status <> 'deleted'
            """,
            (athlete_id, event_id),
        )
        row = await cur.fetchone()
    return dict(row) if row is not None else None


def _number(row: DictRow | None, key: str) -> float | None:
    """One numeric column of a row, or ``None`` when it has no value.

    An aggregate over an empty set is null, not zero: a zero would read as a
    measurement the data never produced.
    """
    if row is None:
        return None
    value = row.get(key)
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)
