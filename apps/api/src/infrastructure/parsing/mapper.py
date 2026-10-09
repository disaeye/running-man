from __future__ import annotations

# pyright: reportMissingTypeStubs=false
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime

from infrastructure.parsing.models import FitSample


@dataclass(frozen=True)
class StreamRow:
    sample_time: datetime
    activity_id: str
    athlete_id: str
    metric_type: str
    value: float


def map_samples_to_streams(
    samples: list[FitSample],
    activity_id: str,
    athlete_id: str,
) -> list[StreamRow]:
    rows: list[StreamRow] = []
    for sample in samples:
        for metric_type, value in _sample_metrics(sample):
            if value is None:
                continue
            rows.append(
                StreamRow(
                    sample_time=sample.timestamp,
                    activity_id=activity_id,
                    athlete_id=athlete_id,
                    metric_type=metric_type,
                    value=float(value),
                )
            )
    return rows


def _sample_metrics(sample: FitSample) -> tuple[tuple[str, int | float | None], ...]:
    return (
        ("heart_rate", sample.heart_rate),
        ("power", sample.power),
        ("cadence", sample.cadence),
        ("speed", sample.speed),
        ("latitude", sample.lat),
        ("longitude", sample.lon),
        ("altitude", sample.altitude),
        ("vertical_oscillation", sample.vertical_oscillation),
        ("ground_contact_time", sample.stance_time),
        ("stride_length", sample.stride_length),
        ("temperature", sample.temperature),
    )


def map_to_summary(
    samples: list[FitSample],
    activity_id: str,
    athlete_id: str,
    sport: str,
) -> dict[str, object]:
    powers = [float(sample.power) for sample in samples if sample.power is not None]
    heart_rates = [sample.heart_rate for sample in samples if sample.heart_rate is not None]
    duration_s = _duration_seconds(samples)

    return {
        "activity_id": activity_id,
        "athlete_id": athlete_id,
        "sport": sport,
        "duration_s": duration_s,
        "avg_hr": _average(heart_rates),
        "max_hr": max(heart_rates) if heart_rates else None,
        "avg_power": _average(powers),
    }


def _duration_seconds(samples: list[FitSample]) -> int:
    if not samples:
        return 0
    first = min(sample.timestamp for sample in samples)
    last = max(sample.timestamp for sample in samples)
    return int((last - first).total_seconds()) + 1


def _average(values: Iterable[int | float]) -> float | None:
    values = list(values)
    if not values:
        return None
    return sum(values) / len(values)
