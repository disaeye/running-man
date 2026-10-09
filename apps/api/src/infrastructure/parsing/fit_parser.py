from __future__ import annotations

# pyright: reportMissingTypeStubs=false, reportUnknownArgumentType=false, reportUnknownMemberType=false, reportUnknownVariableType=false
from dataclasses import dataclass
from datetime import datetime
from typing import cast

import fitdecode

from infrastructure.parsing.constants import KNOWN_MANUFACTURER_IDS, SEMICIRCLES_TO_DEGREES
from infrastructure.parsing.models import FitSample


@dataclass(frozen=True)
class FitLap:
    start_time: datetime
    total_elapsed_time: float
    total_distance: float
    avg_heart_rate: int | None
    max_heart_rate: int | None
    avg_power: int | None
    avg_cadence: int | None
    total_calories: int | None
    total_ascent: int | None


@dataclass(frozen=True)
class FitResult:
    samples: list[FitSample]
    laps: list[FitLap]
    session: dict[str, object] | None


def parse_fit(data: bytes) -> FitResult:
    samples: list[FitSample] = []
    laps: list[FitLap] = []
    session: dict[str, object] | None = None
    manufacturer_id: int | None = None

    try:
        for frame in fitdecode.FitReader(data):
            if frame.frame_type != fitdecode.FIT_FRAME_DATAMESG:
                continue
            frame_name = getattr(frame, "name", None)
            if frame_name == "file_id":
                manufacturer_id = _manufacturer_id(cast(fitdecode.records.FitDataMessage, frame))
                continue
            if frame_name == "record":
                sample = _record_to_sample(cast(fitdecode.records.FitDataMessage, frame))
                if sample is not None:
                    samples.append(sample)
                continue
            if frame_name == "lap":
                lap = _lap_to_model(cast(fitdecode.records.FitDataMessage, frame))
                if lap is not None:
                    laps.append(lap)
                continue
            if frame_name == "session":
                session = _frame_to_dict(cast(fitdecode.records.FitDataMessage, frame))
    except fitdecode.FitError:
        return FitResult(samples=[], laps=[], session=None)

    if session is not None and manufacturer_id in KNOWN_MANUFACTURER_IDS:
        session["manufacturer_id"] = manufacturer_id
    return FitResult(samples=samples, laps=laps, session=session)


def safe_get(frame: fitdecode.records.FitDataMessage, field_name: str) -> object | None:
    try:
        return frame.get_value(field_name)
    except KeyError:
        return None


def _record_to_sample(frame: fitdecode.records.FitDataMessage) -> FitSample | None:
    timestamp = safe_get(frame, "timestamp")
    if not isinstance(timestamp, datetime):
        return None

    return FitSample(
        timestamp=timestamp,
        heart_rate=_as_int(safe_get(frame, "heart_rate")),
        power=_as_int(safe_get(frame, "power")),
        cadence=_as_int(safe_get(frame, "cadence")),
        speed=_first_float(frame, "enhanced_speed", "speed"),
        lat=_semicircles_to_degrees(safe_get(frame, "position_lat")),
        lon=_semicircles_to_degrees(safe_get(frame, "position_long")),
        altitude=_first_float(frame, "enhanced_altitude", "altitude"),
        vertical_oscillation=_scaled_first_float(frame, 10.0, "vertical_oscillation"),
        stance_time=_first_float(frame, "stance_time"),
        stride_length=_scaled_first_float(frame, 1000.0, "step_length", "stride_length"),
        temperature=_first_float(frame, "temperature"),
    )


def _lap_to_model(frame: fitdecode.records.FitDataMessage) -> FitLap | None:
    start_time = safe_get(frame, "start_time")
    total_elapsed_time = safe_get(frame, "total_elapsed_time")
    total_distance = safe_get(frame, "total_distance")
    if not isinstance(start_time, datetime):
        return None
    elapsed = _as_float(total_elapsed_time)
    distance = _as_float(total_distance)
    if elapsed is None or distance is None:
        return None

    return FitLap(
        start_time=start_time,
        total_elapsed_time=elapsed,
        total_distance=distance,
        avg_heart_rate=_as_int(safe_get(frame, "avg_heart_rate")),
        max_heart_rate=_as_int(safe_get(frame, "max_heart_rate")),
        avg_power=_as_int(safe_get(frame, "avg_power")),
        avg_cadence=_as_int(safe_get(frame, "avg_cadence")),
        total_calories=_as_int(safe_get(frame, "total_calories")),
        total_ascent=_as_int(safe_get(frame, "total_ascent")),
    )


def _frame_to_dict(frame: fitdecode.records.FitDataMessage) -> dict[str, object]:
    return {str(field.name): cast(object, field.value) for field in frame.fields}


def _manufacturer_id(frame: fitdecode.records.FitDataMessage) -> int | None:
    value = safe_get(frame, "manufacturer")
    if isinstance(value, int):
        return value
    return None


def _first_float(frame: fitdecode.records.FitDataMessage, *field_names: str) -> float | None:
    for field_name in field_names:
        value = _as_float(safe_get(frame, field_name))
        if value is not None:
            return value
    return None


def _scaled_first_float(
    frame: fitdecode.records.FitDataMessage, divisor: float, *field_names: str
) -> float | None:
    """FIT 原始单位换算到流指标契约单位（垂直振幅 mm→cm，步幅 mm→m）。"""
    value = _first_float(frame, *field_names)
    return value / divisor if value is not None else None


def _semicircles_to_degrees(value: object | None) -> float | None:
    numeric = _as_float(value)
    if numeric is None:
        return None
    return numeric * SEMICIRCLES_TO_DEGREES


def _as_int(value: object | None) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return None


def _as_float(value: object | None) -> float | None:
    if isinstance(value, int | float):
        return float(value)
    return None
