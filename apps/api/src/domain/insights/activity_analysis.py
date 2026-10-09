from __future__ import annotations

from collections.abc import Mapping, Sequence
from statistics import mean

from domain.insights.prs import max_sustained_power
from domain.insights.zones import Zone
from domain.load.decoupling import aerobic_decoupling
from domain.load.normalized_power import normalized_power
from domain.load.tss import estimate_tss, intensity_factor

STANDARD_POWER_DURATIONS: list[int] = [60, 300, 600, 1200, 3600]
LAP_DISTANCE_M = 1000.0
FALLBACK_LAP_SECONDS = 300
HR_ZONE_COUNT = 5


def compute_laps(streams: dict[str, list[float]]) -> list[dict[str, float | int | None]]:
    distances = streams.get("distance", [])
    sample_count = _sample_count(streams)
    if not sample_count:
        return []
    boundaries = _distance_boundaries(distances) or _time_boundaries(sample_count)
    laps: list[dict[str, float | int | None]] = []
    start = 0
    for lap_index, end in enumerate(boundaries, start=1):
        if end <= start:
            continue
        laps.append(_lap(lap_index, start, end, streams))
        start = end
    return laps


def compute_hr_zone_times(
    hr_samples: list[float], duration_s: int, hr_zones: list[Zone]
) -> dict[str, int]:
    totals = {f"z{zone}": 0 for zone in range(1, HR_ZONE_COUNT + 1)}
    if not hr_samples or duration_s <= 0 or not hr_zones:
        return totals
    seconds_per_sample = duration_s / len(hr_samples)
    for value in hr_samples:
        zone = _zone_for_value(value, hr_zones)
        if zone is not None and 1 <= zone <= HR_ZONE_COUNT:
            totals[f"z{zone}"] += round(seconds_per_sample)
    return totals


def compute_power_curve(
    power_samples: list[float], durations: list[int] = STANDARD_POWER_DURATIONS
) -> list[dict[str, int]]:
    curve: list[dict[str, int]] = []
    for duration_s in durations:
        avg_w = max_sustained_power(power_samples, duration_s)
        if avg_w is not None:
            curve.append({"duration_s": duration_s, "avg_w": round(avg_w)})
    return curve


def compute_summary(
    streams: dict[str, list[float]], duration_s: int, ftp: int | None
) -> dict[str, float | int | None]:
    powers = streams.get("power", [])
    heart_rates = streams.get("heart_rate", [])
    speeds = streams.get("speed", [])
    np_value = normalized_power(powers) if powers else None
    if_value = intensity_factor(np_value, ftp) if np_value and ftp else None
    tss_value = estimate_tss(duration_s=duration_s, np=np_value, ftp=ftp) if ftp else None
    effort = powers or speeds
    cardio = heart_rates[: len(effort)] if effort else []
    decoupling = aerobic_decoupling(effort[: len(cardio)], cardio) if cardio else None
    return {
        "np": round(np_value) if np_value is not None else None,
        "if": round(if_value, 2) if if_value is not None else None,
        "tss": round(tss_value) if tss_value is not None else None,
        "decoupling_pct": round(decoupling, 1) if decoupling is not None else None,
    }


def streams_by_metric(rows: Sequence[Mapping[str, object]]) -> dict[str, list[float]]:
    grouped: dict[str, list[float]] = {}
    for row in rows:
        metric = row.get("metric_type")
        value = row.get("value")
        if isinstance(metric, str) and isinstance(value, int | float):
            grouped.setdefault(metric, []).append(float(value))
    return grouped


def _sample_count(streams: Mapping[str, Sequence[float]]) -> int:
    return max((len(values) for values in streams.values()), default=0)


def _distance_boundaries(distances: Sequence[float]) -> list[int]:
    if not distances:
        return []
    boundaries: list[int] = []
    next_distance = (distances[0] // LAP_DISTANCE_M + 1) * LAP_DISTANCE_M
    for index, distance in enumerate(distances, start=1):
        if distance >= next_distance:
            boundaries.append(index)
            next_distance += LAP_DISTANCE_M
    if boundaries[-1:] != [len(distances)]:
        boundaries.append(len(distances))
    return boundaries


def _time_boundaries(sample_count: int) -> list[int]:
    return [*range(FALLBACK_LAP_SECONDS, sample_count, FALLBACK_LAP_SECONDS), sample_count]


def _lap(
    lap_index: int,
    start: int,
    end: int,
    streams: Mapping[str, Sequence[float]],
) -> dict[str, float | int | None]:
    distances = streams.get("distance", [])
    speeds = streams.get("speed", [])
    distance = _distance_delta(distances, speeds, start, end)
    return {
        "lap_index": lap_index,
        "distance_m": round(distance),
        "duration_s": end - start,
        "avg_hr": _rounded_mean(streams.get("heart_rate", [])[start:end]),
        "avg_power": _rounded_mean(streams.get("power", [])[start:end]),
    }


def _distance_delta(
    distances: Sequence[float], speeds: Sequence[float], start: int, end: int
) -> float:
    if len(distances) >= end > start:
        return max(0.0, distances[end - 1] - distances[start])
    return sum(speeds[start:end]) if len(speeds) >= end else float(end - start)


def _rounded_mean(values: Sequence[float]) -> int | None:
    return round(mean(values)) if values else None


def _zone_for_value(value: float, zones: Sequence[Zone]) -> int | None:
    for zone in zones:
        min_value = zone["min_value"]
        max_value = zone["max_value"]
        if value >= min_value and (max_value is None or value <= max_value):
            return zone["zone"]
    return None
