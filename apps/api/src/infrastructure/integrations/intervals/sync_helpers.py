from __future__ import annotations

import json
import logging
from collections.abc import Mapping, Sequence
from datetime import date, timedelta
from typing import Any, cast

from domain.ingestion import DistanceUnit, canonical_distance, canonical_sport
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


def _activity_distance_m(activity: Mapping[str, object]) -> float | None:
    distance_km = activity.get("distance_km")
    if distance_km is not None:
        return canonical_distance(distance_km, DistanceUnit.KM)
    raw_distance = activity.get("icu_distance", activity.get("distance"))
    return canonical_distance(raw_distance, DistanceUnit.M)
