"""单次活动的公里分段与持续时间计算。"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from statistics import mean

LAP_DISTANCE_M = 1000.0
FALLBACK_LAP_SECONDS = 300


@dataclass(frozen=True, slots=True)
class LapSegment:
    """单个分段的距离、时长、配速与遥测均值。"""

    lap_index: int
    distance_m: float
    duration_s: int
    avg_hr: int | None
    avg_power: int | None
    avg_speed: float | None
    pace_s_per_km: float | None
    start_time: datetime | None


def compute_laps(
    streams: dict[str, list[float]],
    *,
    stream_times: Mapping[str, Sequence[float]] | None = None,
) -> list[dict[str, float | int | None]]:
    """按距离分段，并用采样时间计算真实时长。"""
    distances = streams.get("distance", [])
    sample_count = _sample_count(streams)
    if not sample_count:
        return []
    boundaries = _distance_boundaries(distances) or _time_boundaries(sample_count)
    times = (stream_times or {}).get("heart_rate") or (stream_times or {}).get("speed") or []
    laps: list[dict[str, float | int | None]] = []
    start = 0
    for lap_index, end in enumerate(boundaries, start=1):
        if end <= start:
            continue
        laps.append(_lap(lap_index, start, end, streams, times))
        start = end
    return laps


def compute_lap_segments(
    streams: dict[str, list[float]],
    *,
    stream_times: Mapping[str, Sequence[float]] | None = None,
) -> list[LapSegment]:
    """以具名类型返回分段，供分析页面渲染。"""
    distances = streams.get("distance", [])
    sample_count = _sample_count(streams)
    if not sample_count:
        return []
    boundaries = _distance_boundaries(distances) or _time_boundaries(sample_count)
    times = (stream_times or {}).get("heart_rate") or (stream_times or {}).get("speed") or []
    segments: list[LapSegment] = []
    start = 0
    for lap_index, end in enumerate(boundaries, start=1):
        if end <= start:
            continue
        row = _lap(lap_index, start, end, streams, times)
        distance = float(row["distance_m"] or 0.0)
        duration = int(row["duration_s"] or 0)
        speed = row["avg_speed"]
        segments.append(
            LapSegment(
                lap_index=lap_index,
                distance_m=distance,
                duration_s=duration,
                avg_hr=int(row["avg_hr"]) if row["avg_hr"] is not None else None,
                avg_power=int(row["avg_power"]) if row["avg_power"] is not None else None,
                avg_speed=float(speed) if speed is not None else None,
                pace_s_per_km=(duration / (distance / 1000.0)) if distance > 0 else None,
                start_time=None,
            )
        )
        start = end
    return segments


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
    times: Sequence[float],
) -> dict[str, float | int | None]:
    distances = streams.get("distance", [])
    speeds = streams.get("speed", [])
    distance = _distance_delta(distances, speeds, start, end)
    duration = _segment_duration(times, start, end)
    avg_speed = (distance / duration) if duration and distance > 0 else None
    return {
        "lap_index": lap_index,
        "distance_m": round(distance),
        "duration_s": duration,
        "avg_hr": _rounded_mean(streams.get("heart_rate", [])[start:end]),
        "avg_power": _rounded_mean(streams.get("power", [])[start:end]),
        "avg_speed": round(avg_speed, 3) if avg_speed is not None else None,
    }


def _segment_duration(times: Sequence[float], start: int, end: int) -> int | None:
    """缺少时间戳时返回空值，避免从样本数量推造时长。"""
    if len(times) <= end or end <= start:
        return None
    first = times[start]
    last = times[end - 1]
    if last <= first:
        return None
    return round(last - first)


def _distance_delta(
    distances: Sequence[float], speeds: Sequence[float], start: int, end: int
) -> float:
    if len(distances) >= end > start:
        return max(0.0, distances[end - 1] - distances[start])
    return sum(speeds[start:end]) if len(speeds) >= end else float(end - start)


def _rounded_mean(values: Sequence[float]) -> int | None:
    return round(mean(values)) if values else None
