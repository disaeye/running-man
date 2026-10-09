"""Helpers shared by single-file and batch activity upload endpoints.

Extracted from ``activities.py`` to keep the router module under the 250 LOC cap
enforced by ``scripts/lint_file_size.py``. These functions are the parsing
pipeline: bytes -> FitSample list -> activity summary dict + stream rows.
"""

from __future__ import annotations

from datetime import datetime
from itertools import pairwise
from statistics import mean
from uuid import NAMESPACE_URL, uuid5

from fastapi import HTTPException, status

from infrastructure.parsing.fit_parser import FitLap, parse_fit
from infrastructure.parsing.gpx_parser import parse_gpx
from infrastructure.parsing.models import FitSample
from infrastructure.parsing.tcx_parser import parse_tcx

MIN_POINTS_FOR_ELEVATION_GAIN = 2
SUPPORTED_FILE_TYPES = frozenset({"fit", "gpx", "tcx"})


def file_type(filename: str | None) -> str:
    """Return the lowercased suffix for an uploaded filename, or 400."""
    suffix = (filename or "").rsplit(".", 1)[-1].lower()
    if suffix not in SUPPORTED_FILE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="unsupported activity file type"
        )
    return suffix


def parse_upload(
    data: bytes, ftype: str
) -> tuple[list[FitSample], dict[str, object], list[dict[str, object]]]:
    """Parse an upload, returning (samples, metadata, laps).

    laps is a list of lap dicts (start_time, duration_s, distance_m, avg_hr,
    max_hr) for FIT/TCX sources that carry device-defined laps; empty for GPX.
    """
    if ftype == "fit":
        result = parse_fit(data)
        return result.samples, result.session or {}, _laps_from_fit(result.laps)
    if ftype == "gpx":
        return parse_gpx(data), {}, []
    return parse_tcx(data), {}, []


def summary_from_samples(
    samples: list[FitSample], ftype: str, filename: str | None, metadata: dict[str, object]
) -> dict[str, object]:
    start = min(sample.timestamp for sample in samples)
    end = max(sample.timestamp for sample in samples)
    distance = _distance(samples, metadata)
    duration = max(0, round((end - start).total_seconds()))
    activity_key = f"{filename or ftype}:{start.isoformat()}:{duration}:{distance}"
    activity_id = str(uuid5(NAMESPACE_URL, activity_key))
    return {
        "activity_id": activity_id,
        "start_time": start,
        "sport": _sport(metadata),
        "distance_m": distance,
        "duration_s": duration,
        "avg_hr": _rounded_mean([s.heart_rate for s in samples]),
        "max_hr": _max_int([s.heart_rate for s in samples]),
        "avg_power": _rounded_mean([s.power for s in samples]),
        "avg_cadence": _mean_float([s.cadence for s in samples]),
        "avg_speed": _mean_float([s.speed for s in samples]),
        "elevation_gain_m": _elevation_gain(samples),
        "calories": _int_or_none(metadata.get("total_calories")),
        "external_id": f"upload:{activity_id}",
        "source": ftype,
        "file_type": ftype,
        "device_name": _device_name(metadata),
        "raw_data": {"filename": filename, "metadata": _jsonable(metadata)},
    }


def streams_from_samples(samples: list[FitSample]) -> list[dict[str, object]]:
    streams: list[dict[str, object]] = []
    for sample in samples:
        for metric_type, value in _sample_metrics(sample):
            streams.append(
                {
                    "sample_time": sample.timestamp,
                    "metric_type": metric_type,
                    "value": value,
                    "lat": sample.lat,
                    "lon": sample.lon,
                    "alt": sample.altitude,
                }
            )
    return streams


def _sample_metrics(sample: FitSample) -> list[tuple[str, float]]:
    values = {
        "heart_rate": sample.heart_rate,
        "power": sample.power,
        "cadence": sample.cadence,
        "speed": sample.speed,
        "distance": sample.distance,
        "vertical_oscillation": sample.vertical_oscillation,
        "ground_contact_time": sample.stance_time,
        "stride_length": sample.stride_length,
        "temperature": sample.temperature,
    }
    return [(metric, float(value)) for metric, value in values.items() if value is not None]


def _distance(samples: list[FitSample], metadata: dict[str, object]) -> float | None:
    total_distance = _float_or_none(metadata.get("total_distance"))
    if total_distance is not None:
        return total_distance
    distances = [s.distance for s in samples if s.distance is not None]
    if distances:
        return max(distances)
    speeds = [s.speed for s in samples if s.speed is not None]
    return mean(speeds) * _duration(samples) if speeds else None


def _duration(samples: list[FitSample]) -> float:
    start = min(s.timestamp for s in samples)
    end = max(s.timestamp for s in samples)
    return max(0.0, (end - start).total_seconds())


def _elevation_gain(samples: list[FitSample]) -> float | None:
    altitudes = [s.altitude for s in samples if s.altitude is not None]
    if len(altitudes) < MIN_POINTS_FOR_ELEVATION_GAIN:
        return None
    return sum(max(0.0, second - first) for first, second in pairwise(altitudes))


def _rounded_mean(values: list[int | None]) -> int | None:
    present = [v for v in values if v is not None]
    return round(mean(present)) if present else None


def _mean_float(values: list[int | float | None]) -> float | None:
    present = [float(v) for v in values if v is not None]
    return mean(present) if present else None


def _max_int(values: list[int | None]) -> int | None:
    present = [v for v in values if v is not None]
    return max(present) if present else None


def _sport(metadata: dict[str, object]) -> str:
    raw = str(metadata.get("sport") or metadata.get("sub_sport") or "Run")
    return "Ride" if "cycling" in raw.lower() or "bike" in raw.lower() else "Run"


def _device_name(metadata: dict[str, object]) -> str | None:
    value = metadata.get("manufacturer_id") or metadata.get("manufacturer")
    return str(value) if value is not None else None


def _int_or_none(value: object) -> int | None:
    return int(value) if isinstance(value, int | float) else None


def _float_or_none(value: object) -> float | None:
    return float(value) if isinstance(value, int | float) else None


def _jsonable(data: dict[str, object]) -> dict[str, object]:
    return {
        key: value.isoformat() if isinstance(value, datetime) else value
        for key, value in data.items()
    }


def _laps_from_fit(laps: list[FitLap]) -> list[dict[str, object]]:
    """Convert FIT device laps to the dict shape stored in activity_laps."""
    return [
        {
            "lap_index": index,
            "start_time": lap.start_time,
            "duration_s": round(lap.total_elapsed_time),
            "distance_m": lap.total_distance,
            "avg_hr": lap.avg_heart_rate,
            "max_hr": lap.max_heart_rate,
        }
        for index, lap in enumerate(laps)
    ]
