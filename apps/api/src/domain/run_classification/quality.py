"""Per-segment plan-versus-execution quality.

Both objects carry a ``segments`` field with the same shape. The comparison
keeps their own boundaries: paired rows are compared by order, work bouts are
compared individually, and every stored ratio is accompanied by the per-segment
differences it came from. Counts that differ are reported as counts that differ;
they are not hidden by rewriting one segment list into the other.
"""

from __future__ import annotations

import statistics
from collections.abc import Callable
from typing import cast

from domain.run_classification.models import SessionSegment
from domain.run_classification.segment_differences import (
    build_segment_differences,
    paired_segments,
)

REQUIRED_QUALITY_KEYS: tuple[str, ...] = (
    "repetition_match",
    "work_distance_match",
    "work_duration_match",
    "pace_attainment",
    "hr_attainment",
    "rpe_match",
    "structure_match",
)


def compare_quality(
    quality: dict[str, object],
    prescription: dict[str, object],
    execution: dict[str, object],
) -> dict[str, object]:
    target_segments = _rows(prescription.get("segments"))
    actual_segments = _rows(execution.get("segments"))
    target_work = _target_work(target_segments)
    actual_work = [item for item in actual_segments if item.get("role") == "work"]

    differences, paired_count = build_segment_differences(target_segments, actual_segments)
    work_pairs = paired_segments(target_work, actual_work)

    result = dict(quality)
    result["repetition_match"] = _ratio(len(actual_work), len(target_work))
    result["work_distance_match"] = _ratio(
        sum(_distance(item) for item in actual_work),
        sum(_target_distance(item) for item in target_work),
    )
    result["work_duration_match"] = _ratio(
        sum(_duration(item) for item in actual_work),
        sum(_target_duration(item) for item in target_work),
    )
    result["pace_attainment"] = _paired_mean(work_pairs, _target_pace, _pace, invert=True)
    result["hr_attainment"] = _paired_mean(work_pairs, _target_hr, _hr, invert=False)
    result["structure_match"] = _structure_match(target_segments, actual_segments)
    result["rpe_match"] = _rpe_attainment(actual_work, target_work, result.get("rpe_match"))
    result["per_segment_differences"] = list(differences)
    result["paired_segment_count"] = paired_count
    result["unpaired_segment_count"] = sum(1 for row in differences if not row["paired"])
    return result


def _rows(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []
    return [cast(dict[str, object], item) for item in value if isinstance(item, dict)]


def _target_work(segments: list[dict[str, object]]) -> list[dict[str, object]]:
    """Expand a legacy folded work row into its prescribed repetitions."""
    result: list[dict[str, object]] = []
    for segment in segments:
        if segment.get("role") != "work":
            continue
        repetitions = segment.get("repetitions")
        count = int(repetitions) if isinstance(repetitions, int) and repetitions > 0 else 1
        result.extend([segment] * count)
    return result


def _paired_mean(
    pairs: list[tuple[dict[str, object], dict[str, object]]],
    target_value: Callable[[dict[str, object]], float | None],
    measured_value: Callable[[dict[str, object]], float | None],
    *,
    invert: bool,
) -> float | None:
    """Mean per-work-bout attainment; pairs are compared one by one."""
    values: list[float] = []
    for target, measured in pairs:
        planned = target_value(target)
        actual = measured_value(measured)
        if planned is None or actual is None or actual <= 0:
            continue
        values.append(float(planned) / float(actual) if invert else float(actual) / float(planned))
    return round(statistics.fmean(values), 3) if values else None


def _structure_match(
    target: list[dict[str, object]], actual: list[dict[str, object]]
) -> float | None:
    """Role-count overlap across the two boundary sets.

    A faithfully executed plan retains the same role counts. Extra or missing
    work bouts lower the score, while a one-bout shift does not erase the whole
    structure. Per-row positional details stay in ``per_segment_differences``.
    """
    if not target or not actual:
        return None
    left = _role_counts(target)
    right = _role_counts(actual)
    roles = left.keys() | right.keys()
    total = sum(max(left.get(role, 0), right.get(role, 0)) for role in roles)
    if total <= 0:
        return None
    overlap = sum(min(left.get(role, 0), right.get(role, 0)) for role in roles)
    return round(overlap / total, 3)


def _role_counts(segments: list[dict[str, object]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in segments:
        role = str(item.get("role") or "unclear")
        counts[role] = counts.get(role, 0) + 1
    return counts


def _rpe_attainment(
    actual: list[dict[str, object]],
    target: list[dict[str, object]],
    observed: object,
) -> float | None:
    """Ratio of recorded RPE to the planned RPE band midpoint."""
    _ = actual
    if not isinstance(observed, int | float) or isinstance(observed, bool):
        return None
    lows = [
        float(value)
        for segment in target
        if isinstance(value := _target(segment).get("rpe_min"), int | float)
    ]
    highs = [
        float(value)
        for segment in target
        if isinstance(value := _target(segment).get("rpe_max"), int | float)
    ]
    if not lows:
        return float(observed)
    low_mean = statistics.fmean(lows)
    high_mean = statistics.fmean(highs) if highs else low_mean
    midpoint = (low_mean + high_mean) / 2.0
    return round(float(observed) / midpoint, 3) if midpoint > 0 else None


def _ratio(actual: float, target: float) -> float | None:
    if target <= 0:
        return None
    return round(actual / target, 3)


def _distance(segment: SessionSegment | dict[str, object]) -> float:
    value = segment.get("distance_m")
    return float(value) if isinstance(value, int | float) else 0.0


def _duration(segment: SessionSegment | dict[str, object]) -> float:
    value = segment.get("duration_s")
    return float(value) if isinstance(value, int | float) else 0.0


def _pace(segment: SessionSegment | dict[str, object]) -> float | None:
    value = segment.get("pace_s_km")
    return float(value) if isinstance(value, int | float) and value > 0 else None


def _hr(segment: SessionSegment | dict[str, object]) -> float | None:
    value = segment.get("avg_hr")
    return float(value) if isinstance(value, int | float) and value > 0 else None


def _target(segment: dict[str, object]) -> dict[str, object]:
    value = segment.get("target")
    return value if isinstance(value, dict) else {}


def _target_distance(segment: dict[str, object]) -> float:
    value = _target(segment).get("distance_m")
    if isinstance(value, int | float):
        return float(value)
    return _distance(segment)


def _target_duration(segment: dict[str, object]) -> float:
    value = _target(segment).get("duration_s")
    if isinstance(value, int | float):
        return float(value)
    return _duration(segment)


def _target_pace(segment: dict[str, object]) -> float | None:
    values = [
        value
        for key in ("pace_s_km", "pace_min_s_km", "pace_max_s_km")
        if isinstance(value := _target(segment).get(key), int | float)
    ]
    return statistics.fmean([float(value) for value in values]) if values else None


def _target_hr(segment: dict[str, object]) -> float | None:
    values = [
        value
        for key in ("hr_bpm", "hr_min_bpm", "hr_max_bpm")
        if isinstance(value := _target(segment).get(key), int | float)
    ]
    return statistics.fmean([float(value) for value in values]) if values else None
