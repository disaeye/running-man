"""Segment rows shared by the plan and execution data definitions.

Both objects use the same ``segments`` field shape: role, order, time window,
distance, pace and intensity domain. The plan side carries ``target`` within its
own boundaries; the completed side carries ``measured`` within the boundaries
that were actually recorded. Keeping both boundary sets intact is what makes
``compare_quality`` an honest per-segment difference.
"""

from __future__ import annotations

from typing import Any, cast

from domain.run_classification.analysis import (
    cumulative_distance,
    distance_between,
    stream_mean,
)
from domain.run_classification.models import ActivityEvidence


def build_plan_segments(
    evidence: ActivityEvidence,
    prescription: dict[str, object],
) -> list[dict[str, object]] | None:
    """Return the plan's own rows with a target and stream measurements."""
    raw = prescription.get("segments")
    if not isinstance(raw, list) or not raw:
        return None
    times, distances = cumulative_distance(evidence)
    heart_rate = evidence.streams.get("heart_rate", [])
    result: list[dict[str, object]] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        segment = dict(cast(dict[str, Any], item))
        start = _number(segment.get("start_s")) or 0.0
        duration = _number(segment.get("duration_s")) or 0.0
        end = _number(segment.get("end_s")) or start + duration
        distance_m = distance_between(times, distances, start, end)
        avg_hr = stream_mean(heart_rate, start, end)
        speed = distance_m / duration if duration > 0 else 0.0
        segment["order"] = index + 1
        segment["target"] = _plan_target(segment)
        _shared_measurement_fields(
            segment, distance_m=distance_m, avg_hr=avg_hr, source="training_calendar"
        )
        segment["measured"] = {
            "distance_m": round(distance_m, 1),
            "duration_s": round(duration, 1),
            "pace_s_km": round(duration / (distance_m / 1000.0), 1) if distance_m > 0 else None,
            "avg_hr": round(avg_hr, 1) if avg_hr is not None else None,
            "speed_m_s": round(speed, 3),
            "rpe": None,
        }
        result.append(segment)
    return result or None


def build_execution_segments(
    measured_segments: list[dict[str, object]],
) -> list[dict[str, object]]:
    """Return the recorded rows, each carrying a measured and a target value."""
    result: list[dict[str, object]] = []
    for item in measured_segments:
        segment = dict(item)
        if not isinstance(segment.get("measured"), dict):
            distance_m = _number(segment.get("distance_m")) or 0.0
            duration = _number(segment.get("duration_s")) or 0.0
            segment["measured"] = {
                "distance_m": round(distance_m, 1),
                "duration_s": round(duration, 1),
                "pace_s_km": segment.get("pace_s_km"),
                "avg_hr": segment.get("avg_hr"),
                "speed_m_s": round(distance_m / duration, 3) if duration > 0 else 0.0,
                "rpe": None,
            }
        segment["target"] = _self_target(segment)
        measured = segment.get("measured")
        _measured_fields(segment, measured)
        segment.setdefault("domain", segment.get("intensity_domain"))
        segment.setdefault("evidence_source", "activity_streams")
        result.append(segment)
    return result


def _measured_fields(segment: dict[str, object], measured: object) -> None:
    values = measured if isinstance(measured, dict) else {}
    segment.setdefault("pace_s_km", values.get("pace_s_km"))
    segment.setdefault("avg_hr", values.get("avg_hr"))


def _shared_measurement_fields(
    segment: dict[str, object],
    *,
    distance_m: float,
    avg_hr: float | None,
    source: str,
) -> None:
    duration_s = _number(segment.get("duration_s")) or 0.0
    pace = round(duration_s / (distance_m / 1000.0), 1) if distance_m > 0 else None
    heart_rate = round(avg_hr, 1) if avg_hr is not None else None
    segment.setdefault("pace_s_km", pace)
    segment.setdefault("avg_hr", heart_rate)
    segment.setdefault("domain", segment.get("intensity_domain"))
    segment.setdefault("evidence_source", source)


def _plan_target(segment: dict[str, Any]) -> dict[str, object]:
    existing = segment.get("target")
    if isinstance(existing, dict):
        return dict(existing)
    return _self_target(segment)


def _self_target(segment: dict[str, object]) -> dict[str, object]:
    return {
        "distance_m": segment.get("distance_m"),
        "duration_s": segment.get("duration_s"),
        "pace_s_km": segment.get("pace_s_km"),
        "hr_bpm": segment.get("avg_hr"),
        "domain": segment.get("domain"),
    }


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)
