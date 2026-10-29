"""Per-activity analysis: laps, HR zone times, biomechanics and summary metrics.

Heart-rate zone statistics are restricted to running, because the zones are
built from running thresholds. A cycling or strength session recorded on the
same watch has a different threshold heart rate, so bucketing its samples with
running zones would file ordinary work under the wrong intensities and inflate
the totals. Non-running activities therefore report no zone times at all rather
than a misleading breakdown.

Timing is taken from the sample timestamps, never from the sample count. The
older version of this module used ``end - start`` on the sample index as the
lap duration, which is only correct for a 1 Hz device; a watch sampling every
2 s produced laps that were half as long as reality. Every duration here comes
from the real timestamp difference between the first and last sample of the
segment, so the number means the same thing on any device.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from statistics import mean

from domain.insights.activity_laps import (
    LapSegment,
    compute_lap_segments,
    compute_laps,
)
from domain.insights.biomechanics import (
    BiomechanicsSummary,
    summarize_biomechanics,
)
from domain.insights.prs import max_sustained_power
from domain.insights.zones import Zone
from domain.load.decoupling import aerobic_decoupling, pair_by_time
from domain.load.normalized_power import normalized_power
from domain.load.tss import estimate_tss, intensity_factor
from domain.sports import is_running

__all__ = ["LapSegment", "compute_lap_segments", "compute_laps"]

STANDARD_POWER_DURATIONS: list[int] = [60, 300, 600, 1200, 3600]
HR_ZONE_COUNT = 5

# A pace variation figure is only meaningful with enough samples to average
# out; below this the "±N seconds" line is noise.
MIN_PACE_VARIATION_SAMPLES = 20


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


def compute_hr_zone_residence(
    hr_samples: list[float],
    hr_times: Sequence[float],
    hr_zones: list[Zone],
) -> list[dict[str, float | int | None]]:
    """Time in each heart-rate zone, measured between sample timestamps.

    Each sample owns the interval that follows it, so the total of all zones
    equals the span the samples cover. ``min_bpm``/``max_bpm`` are the
    boundaries in force for the activity, and ``pct`` is the share of the
    covered time the zone holds.
    """
    empty = [
        {
            "zone": zone,
            "seconds": 0,
            "pct": 0.0,
            "min_bpm": _zone_min(zone, hr_zones),
            "max_bpm": _zone_max(zone, hr_zones),
        }
        for zone in range(1, HR_ZONE_COUNT + 1)
    ]
    if not hr_samples or not hr_zones:
        return empty
    times = list(hr_times)
    if len(times) != len(hr_samples):
        return empty
    seconds = {f"z{zone}": 0.0 for zone in range(1, HR_ZONE_COUNT + 1)}
    for index in range(len(hr_samples) - 1):
        dt = times[index + 1] - times[index]
        if dt <= 0:
            continue
        zone = _zone_for_value(hr_samples[index], hr_zones)
        if zone is not None and 1 <= zone <= HR_ZONE_COUNT:
            seconds[f"z{zone}"] += dt
    total = sum(seconds.values())
    rows: list[dict[str, float | int | None]] = []
    for zone in range(1, HR_ZONE_COUNT + 1):
        value = seconds[f"z{zone}"]
        rows.append(
            {
                "zone": zone,
                "seconds": round(value),
                "pct": round(value / total * 100, 1) if total > 0 else 0.0,
                "min_bpm": _zone_min(zone, hr_zones),
                "max_bpm": _zone_max(zone, hr_zones),
            }
        )
    return rows


def dominant_zone(rows: Sequence[Mapping[str, object]]) -> int | None:
    """The zone holding the most time, or ``None`` when no zone has any."""
    best: int | None = None
    best_seconds = 0.0
    for row in rows:
        seconds = row.get("seconds")
        if not isinstance(seconds, int | float):
            continue
        if float(seconds) > best_seconds:
            best_seconds = float(seconds)
            zone = row.get("zone")
            best = int(zone) if isinstance(zone, int) else None
    return best


def compute_power_curve(
    power_samples: list[float], durations: list[int] = STANDARD_POWER_DURATIONS
) -> list[dict[str, int]]:
    curve: list[dict[str, int]] = []
    for duration_s in durations:
        avg_w = max_sustained_power(power_samples, duration_s)
        if avg_w is not None:
            curve.append({"duration_s": duration_s, "avg_w": round(avg_w)})
    return curve


def compute_biomechanics(
    streams: dict[str, list[float]],
    *,
    sport: str | None,
    source_avg_cadence: float | None = None,
    source_avg_stride_length_m: float | None = None,
    source_avg_lr_balance_pct: float | None = None,
) -> BiomechanicsSummary:
    """The six-cell biomechanics matrix the demo analysis page shows."""
    return summarize_biomechanics(
        streams,
        is_running=is_running(sport),
        source_avg_cadence=source_avg_cadence,
        source_avg_stride_length_m=source_avg_stride_length_m,
        source_avg_lr_balance_pct=source_avg_lr_balance_pct,
    )


def pace_variation_s(speed_samples: Sequence[float], duration_s: int | None) -> float | None:
    """The "±N seconds" pace stability figure for the recent-activity card.

    The spread of the per-kilometre pace, expressed in seconds per kilometre.
    Computed from the speed stream: each sample's instantaneous pace is
    converted to seconds per kilometre, and the standard deviation of those
    values is the figure. ``None`` when there are too few samples for the
    number to mean anything.
    """
    paces = [
        1000.0 / value for value in speed_samples if isinstance(value, int | float) and value > 0.5
    ]
    if len(paces) < MIN_PACE_VARIATION_SAMPLES:
        return None
    average = mean(paces)
    if average <= 0:
        return None
    variance = mean((pace - average) ** 2 for pace in paces)
    return round(variance**0.5, 1)


def compute_summary(
    streams: dict[str, list[float]],
    duration_s: int,
    ftp: int | None,
    *,
    stream_times: Mapping[str, Sequence[float]] | None = None,
) -> dict[str, float | int | None]:
    powers = streams.get("power", [])
    heart_rates = streams.get("heart_rate", [])
    speeds = streams.get("speed", [])
    np_value = normalized_power(powers) if powers else None
    if_value = intensity_factor(np_value, ftp) if np_value and ftp else None
    tss_value = estimate_tss(duration_s=duration_s, np=np_value, ftp=ftp) if ftp else None
    effort = powers or speeds
    cardio_times = (stream_times or {}).get("heart_rate")
    effort_times = (stream_times or {}).get("power" if powers else "speed")
    effort_values: Sequence[float]
    cardio: Sequence[float]
    if effort and cardio_times and effort_times:
        effort_values, cardio = pair_by_time(effort_times, effort, cardio_times, heart_rates)
    else:
        # Without timestamps the two streams can only be aligned by position,
        # so the shorter one bounds the comparison.
        cardio = heart_rates[: len(effort)] if effort else []
        effort_values = effort[: len(cardio)]
    decoupling = (
        aerobic_decoupling(effort_values, cardio, duration_s=float(duration_s)) if cardio else None
    )
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


def stream_times_by_metric(
    rows: Sequence[Mapping[str, object]],
) -> dict[str, list[float]]:
    """Sample timestamps per metric, in epoch seconds.

    Used to pair streams by time rather than by their index in an array. Both
    streams come from the same activity, so absolute seconds give the right
    alignment and keep the tolerance meaningful.
    """
    grouped: dict[str, list[float]] = {}
    for row in rows:
        metric = row.get("metric_type")
        sample_time = row.get("sample_time")
        if isinstance(metric, str) and isinstance(sample_time, datetime):
            grouped.setdefault(metric, []).append(sample_time.timestamp())
    return grouped


def _zone_for_value(value: float, zones: Sequence[Zone]) -> int | None:
    for zone in zones:
        min_value = zone["min_value"]
        max_value = zone["max_value"]
        if value >= min_value and (max_value is None or value <= max_value):
            return zone["zone"]
    return None


def _zone_min(zone: int, zones: Sequence[Zone]) -> int | None:
    for row in zones:
        if row["zone"] == zone:
            value = row["min_value"]
            return int(value) if isinstance(value, int | float) else None
    return None


def _zone_max(zone: int, zones: Sequence[Zone]) -> int | None:
    for row in zones:
        if row["zone"] == zone:
            value = row["max_value"]
            return int(value) if isinstance(value, int | float) else None
    return None
