from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import TypedDict


class SegmentWorkFacts(TypedDict):
    work_bouts: int
    work_distance_m: float
    work_duration_s: float
    domain_seconds: dict[str, float]


DOMAIN_KEYS = (
    "below_mt1",
    "mt1_mt2",
    "mt2_wmax",
    "above_wmax",
    "low_unspecified",
)


def empty_plan_facts() -> dict[str, float]:
    return {
        "work_bouts": 0.0,
        "work_distance_m": 0.0,
        "work_duration_s": 0.0,
        **{key: 0.0 for key in DOMAIN_KEYS},
    }


def work_from_segments(segments: object) -> SegmentWorkFacts:
    """Read one expanded plan or execution segment list with the same shape."""
    result: SegmentWorkFacts = {
        "work_bouts": 0,
        "work_distance_m": 0.0,
        "work_duration_s": 0.0,
        "domain_seconds": {key: 0.0 for key in DOMAIN_KEYS},
    }
    if not isinstance(segments, list):
        return result
    for row in segments:
        if not isinstance(row, Mapping) or row.get("role") != "work":
            continue
        distance_m = 0.0
        duration_s = 0.0
        for values in (row.get("measured"), row.get("target"), row):
            if not isinstance(values, Mapping):
                continue
            distance_m = _number(values.get("distance_m"))
            duration_s = _number(values.get("duration_s"))
            if distance_m > 0 and duration_s > 0:
                break
        if distance_m <= 0 or duration_s <= 0:
            continue
        result["work_bouts"] += 1
        result["work_distance_m"] += distance_m
        result["work_duration_s"] += duration_s
        domain = str(row.get("domain") or row.get("intensity_domain") or "low_unspecified")
        key = domain if domain in DOMAIN_KEYS else "low_unspecified"
        result["domain_seconds"][key] += duration_s
    result["work_distance_m"] = round(result["work_distance_m"], 1)
    result["work_duration_s"] = round(result["work_duration_s"], 1)
    result["domain_seconds"] = {
        key: round(value, 1) for key, value in result["domain_seconds"].items()
    }
    return result


def aggregate_plan_segment_facts(
    events: Sequence[Mapping[str, object]],
) -> dict[str, float]:
    """Weekly planned work from workout_prescription.segments only."""
    result = empty_plan_facts()
    for event in events:
        prescription = event.get("workout_prescription")
        if not isinstance(prescription, Mapping):
            continue
        facts = work_from_segments(prescription.get("segments"))
        result["work_bouts"] += facts["work_bouts"]
        result["work_distance_m"] += facts["work_distance_m"]
        result["work_duration_s"] += facts["work_duration_s"]
        for key in DOMAIN_KEYS:
            result[key] += facts["domain_seconds"][key]
    return {key: round(value, 1) for key, value in result.items()}


def aggregate_execution_segment_facts(
    classifications: Sequence[Mapping[str, object]],
) -> dict[str, float]:
    """Weekly completed work from execution.segments only."""
    result = empty_plan_facts()
    for row in classifications:
        execution = row.get("execution")
        if not isinstance(execution, Mapping):
            continue
        facts = work_from_segments(execution.get("segments"))
        result["work_bouts"] += facts["work_bouts"]
        result["work_distance_m"] += facts["work_distance_m"]
        result["work_duration_s"] += facts["work_duration_s"]
        for key in DOMAIN_KEYS:
            result[key] += facts["domain_seconds"][key]
    return {key: round(value, 1) for key, value in result.items()}


def _number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return 0.0
    return float(value)
