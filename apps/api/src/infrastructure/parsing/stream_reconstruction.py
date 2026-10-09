"""Reconstruct ``FitSample`` lists from stored ``activity_streams`` rows.

The export endpoints group stream rows by ``sample_time`` and turn them back
into the per-sample records that ``fit_writer`` / ``tcx_writer`` consume.
"""

from __future__ import annotations

from datetime import datetime

from infrastructure.parsing.models import FitSample

# Metrics stored under their own column in activity_streams vs. those that need
# to be packed into FitSample attributes. The schema (see _upload_helpers._sample_metrics)
# writes: heart_rate, power, cadence, speed, distance — each with its own attribute.
_METRIC_TO_ATTR: dict[str, str] = {
    "heart_rate": "heart_rate",
    "power": "power",
    "cadence": "cadence",
    "speed": "speed",
    "distance": "distance",
}


def samples_from_streams(rows: list[dict[str, object]]) -> list[FitSample]:
    """Group stream rows by ``sample_time`` and rebuild ``FitSample`` objects.

    Lat/lon/alt are repeated on every metric row for the same timestamp (see
    ``_upload_helpers.streams_from_samples``), so we take the first non-null
    value per timestamp.
    """
    by_ts: dict[datetime, FitSample] = {}

    # Preserve insertion order so the output is sorted by sample_time.
    ordered: list[datetime] = []
    lat_lon_alt: dict[datetime, tuple[float | None, float | None, float | None]] = {}

    for row in rows:
        ts = _as_datetime(row["sample_time"])
        if ts not in by_ts:
            by_ts[ts] = FitSample(timestamp=ts)
            ordered.append(ts)
            lat_lon_alt[ts] = (
                _as_float(row.get("lat")),
                _as_float(row.get("lon")),
                _as_float(row.get("alt")),
            )
        sample = by_ts[ts]
        metric_type = str(row["metric_type"])
        attr = _METRIC_TO_ATTR.get(metric_type)
        if attr is None:
            continue
        value = _as_float(row.get("value"))
        if value is None:
            continue
        # heart_rate/power/cadence are integers in FitSample; speed/distance floats.
        if attr in {"heart_rate", "power", "cadence"}:
            setattr(sample, attr, round(value))
        else:
            setattr(sample, attr, value)

    # Apply per-timestamp lat/lon/alt (carried on every metric row).
    for ts, (lat, lon, alt) in lat_lon_alt.items():
        sample = by_ts[ts]
        sample.lat = lat
        sample.lon = lon
        sample.altitude = alt

    return [by_ts[ts] for ts in ordered]


def _as_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value
    raise TypeError(f"sample_time must be datetime, got {type(value).__name__}")


def _as_float(value: object) -> float | None:
    if isinstance(value, int | float):
        return float(value)
    return None
