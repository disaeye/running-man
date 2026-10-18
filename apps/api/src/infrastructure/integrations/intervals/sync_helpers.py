from __future__ import annotations

import json
import logging
from collections.abc import Mapping, Sequence
from datetime import date, timedelta
from typing import Any, cast

import psycopg

from domain.ingestion import DistanceUnit, canonical_distance, canonical_sport
from domain.time import local_day_sql, resolve_zone
from infrastructure.parsing.models import FitSample
from infrastructure.polyline_encoder import encode_polyline, extract_gps_from_raw
from infrastructure.repositories.activity import compute_source_hash

_logger = logging.getLogger(__name__)

_DATE_TYPE = date
_DECEMBER = 12


def monthly_windows(start: date, end: date) -> list[tuple[date, date]]:
    windows: list[tuple[date, date]] = []
    cursor = start
    while cursor <= end:
        next_month = first_of_next_month(cursor)
        window_end = min(end, next_month - timedelta(days=1))
        windows.append((cursor, window_end))
        cursor = next_month
    return windows


def first_of_next_month(day: date) -> date:
    if day.month == _DECEMBER:
        return date(day.year + 1, 1, 1)
    return date(day.year, day.month + 1, 1)


def activity_params(athlete_id: int | str, activity: Mapping[str, object]) -> tuple[object, ...]:
    activity_id = str(activity["id"])
    start_time = str(activity.get("start_date") or activity["start_date_local"])
    distance_m = _activity_distance_m(activity)
    return (
        activity_id,
        athlete_id,
        start_time,
        canonical_sport(activity.get("type") or activity.get("sport") or "Unknown"),
        distance_m,
        activity.get("moving_time", activity.get("elapsed_time")),
        activity.get("average_heartrate"),
        activity.get("max_heartrate"),
        activity.get("average_watts"),
        activity.get("weighted_average_watts", activity.get("icu_weighted_avg_watts")),
        activity.get("icu_ctl"),
        activity.get("icu_training_load", activity.get("tss")),
        activity.get("average_cadence"),
        activity.get("average_speed"),
        activity.get("total_elevation_gain"),
        activity.get("calories"),
        activity.get("device_name"),
        f"app:{activity_id}",
        "intervals_icu",
        activity.get("file_type"),
        json.dumps(dict(activity), ensure_ascii=True),
        compute_source_hash(str(athlete_id), start_time, as_float(distance_m)),
        _maybe_encode_polyline(activity),
        # Intervals.icu 活动天气块；无天气数据时全部为 None。
        activity.get("average_weather_temp"),
        activity.get("min_weather_temp"),
        activity.get("max_weather_temp"),
        activity.get("average_feels_like"),
        activity.get("average_wind_speed"),
        activity.get("average_wind_gust"),
        activity.get("prevailing_wind_deg"),
        activity.get("headwind_percent"),
        activity.get("tailwind_percent"),
        activity.get("average_clouds"),
        activity.get("max_rain"),
        activity.get("max_snow"),
    )


def _maybe_encode_polyline(activity: Mapping[str, object], precision: int = 5) -> str | None:
    """Extract GPS coordinates from an activity dict and encode as a Google polyline.

    If the activity already carries an explicit ``summary_polyline`` value, it
    is passed through as-is.  Otherwise the function attempts to extract GPS
    coordinates from ``latlng`` or ``latitude``/``longitude`` arrays.

    Returns ``None`` if no GPS data is found or encoding fails — the caller
    should write NULL to the DB and continue ingestion.
    """
    try:
        existing = activity.get("summary_polyline")
        if existing is not None:
            return str(existing)
        raw = dict(activity)
        points = extract_gps_from_raw(raw)
        if not points:
            return None
        return encode_polyline(points, precision)
    except Exception:
        _logger.warning(
            "Failed to encode polyline for activity %s",
            activity.get("id", "?"),
            exc_info=True,
        )
        return None


def fit_samples_to_stream_rows(samples: Sequence[FitSample]) -> list[dict[str, object]]:
    return [
        {
            "sample_time": sample.timestamp,
            "metric_type": metric_type,
            "value": value,
            "lat": sample.lat,
            "lon": sample.lon,
            "alt": sample.altitude,
        }
        for sample in samples
        for metric_type, value in fit_sample_metrics(sample)
    ]


def fit_sample_metrics(sample: FitSample) -> tuple[tuple[str, float], ...]:
    return tuple(
        (metric_type, float(value))
        for metric_type, value in (
            ("heart_rate", sample.heart_rate),
            ("power", sample.power),
            ("cadence", sample.cadence),
            ("speed", sample.speed),
            ("distance", sample.distance),
            ("altitude", sample.altitude),
            ("vertical_oscillation", sample.vertical_oscillation),
            ("ground_contact_time", sample.stance_time),
            ("stride_length", sample.stride_length),
            ("temperature", sample.temperature),
        )
        if value is not None and _emit_stream_metric(metric_type, value)
    )


def _emit_stream_metric(metric_type: str, value: object) -> bool:
    if value is None:
        return False
    if metric_type == "heart_rate" and float(cast(Any, value)) < 1:
        return False
    return True


def as_float(value: object) -> float | None:
    return float(value) if isinstance(value, int | float | str) and value != "" else None


def as_date(value: date | str) -> date:
    if isinstance(value, _DATE_TYPE):
        return value
    return date.fromisoformat(value)


def athlete_timezone(conn: psycopg.Connection, athlete_id: int | str) -> str:
    """The athlete's IANA zone, read from their profile row.

    Sync bounds are dates handed to an upstream HTTP API and to ``BETWEEN``
    filters on ``timestamptz`` columns. Both only mean "the athlete's day" when
    the zone used to build them is the athlete's rather than the server's.
    """
    with conn.cursor() as cur:
        _ = cur.execute(
            "SELECT timezone FROM athletes WHERE id = %s",
            (athlete_id,),
        )
        row = cur.fetchone()
    value = row[0] if row else None
    if not isinstance(value, str) or not value.strip():
        return "UTC"
    # `resolve_zone` exists so an unusable profile value becomes UTC instead of
    # raising mid-sync; the key it returns is the zone Postgres will use.
    return str(resolve_zone(value))


def athlete_today(conn: psycopg.Connection, athlete_id: int | str) -> date:
    """Today on the athlete's clock.

    ``date.today()`` is the host's calendar day. On a UTC host with an athlete
    east of Greenwich, every upstream sync window is a day behind, so a
    late-evening activity is requested for the wrong day and never arrives.
    """
    with conn.cursor() as cur:
        _ = cur.execute(
            "SELECT (now() AT TIME ZONE %s)::date",
            (athlete_timezone(conn, athlete_id),),
        )
        row = cur.fetchone()
    value = row[0] if row else None
    if isinstance(value, date):
        return value
    raise TypeError("expected a date from the athlete's local today")


def next_sync_date(
    athlete_id: int | str,
    conn: psycopg.Connection,
    today: date,
    lookback_days: int,
) -> date:
    """The first local day an incremental sync still has to request.

    Returns ``today + 1`` when the newest stored activity is already on the
    athlete's current day, which the caller compares against ``today`` to decide
    that there is nothing left to fetch.

    ``start_time`` is timestamptz, so a bare ``::date`` would cast it in the
    session zone (UTC) and move the cursor a whole day for an athlete east of
    Greenwich — the upstream API would then re-request a day it already has,
    forever. The cursor is a date handed to that API, so it is their local day.
    """
    day = local_day_sql("%s")
    with conn.cursor() as cur:
        _ = cur.execute(
            f"SELECT max({day}) FROM activity_summary WHERE athlete_id = %s",
            (athlete_timezone(conn, athlete_id), athlete_id),
        )
        row = cur.fetchone()

    latest = row[0] if row else None
    if latest is None:
        return today - timedelta(days=lookback_days)
    if isinstance(latest, date):
        return latest + timedelta(days=1)
    raise TypeError("activity_summary.start_time must be a timestamp")


def _activity_distance_m(activity: Mapping[str, object]) -> float | None:
    distance_km = activity.get("distance_km")
    if distance_km is not None:
        return canonical_distance(distance_km, DistanceUnit.KM)
    raw_distance = activity.get("icu_distance", activity.get("distance"))
    return canonical_distance(raw_distance, DistanceUnit.M)
