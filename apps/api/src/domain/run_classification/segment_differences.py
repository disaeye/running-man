from __future__ import annotations

from typing import TypedDict

from domain.run_classification.models import SessionSegment


class SegmentDifference(TypedDict):
    order: int
    target_order: int | None
    measured_order: int | None
    target_role: str
    measured_role: str
    role_match: bool
    overlap_s: float | None
    distance_delta_m: float
    duration_delta_s: float
    pace_delta_s_km: float | None
    hr_delta_bpm: float | None
    target_distance_m: float
    measured_distance_m: float
    paired: bool


def build_segment_differences(
    target_segments: list[dict[str, object]],
    actual_segments: list[dict[str, object]],
) -> tuple[list[SegmentDifference], int]:
    """按角色和时间边界对齐分段；角色不同或无时间重叠的行保持未配对。"""
    matches = _matching_pairs(target_segments, actual_segments)
    matches_by_target = {left: right for left, right in matches}
    matched_actual = {right for _, right in matches}
    rows = [
        _segment_difference(
            index + 1,
            target,
            actual_segments[matches_by_target[index]] if index in matches_by_target else None,
            index + 1,
            matches_by_target.get(index, -1) + 1 if index in matches_by_target else None,
        )
        for index, target in enumerate(target_segments)
    ]
    rows.extend(
        _segment_difference(
            len(target_segments) + index + 1,
            None,
            actual,
            None,
            index + 1,
        )
        for index, actual in enumerate(actual_segments)
        if index not in matched_actual
    )
    return rows, len(matches)


def paired_segments(
    target_segments: list[dict[str, object]],
    actual_segments: list[dict[str, object]],
) -> list[tuple[dict[str, object], dict[str, object]]]:
    """按相同角色与时间重叠对齐后的分段对，供逐段质量计算复用。"""
    matches = _matching_pairs(target_segments, actual_segments)
    return [(target_segments[left], actual_segments[right]) for left, right in matches]


def _matching_pairs(
    target_segments: list[dict[str, object]],
    actual_segments: list[dict[str, object]],
) -> list[tuple[int, int]]:
    """同角色分段按时间重叠最大配对，不重复占用完成侧分段。"""
    if _no_boundaries(target_segments) and _no_boundaries(actual_segments):
        return _ordered_role_pairs(target_segments, actual_segments)
    result: list[tuple[int, int]] = []
    used: set[int] = set()
    for left, target in enumerate(target_segments):
        role = str(target.get("role") or "unclear")
        start = _number(target.get("start_s"))
        end = _number(target.get("end_s"))
        candidates = [
            (
                right,
                _overlap(
                    start,
                    end,
                    _number(actual.get("start_s")),
                    _number(actual.get("end_s")),
                ),
            )
            for right, actual in enumerate(actual_segments)
            if str(actual.get("role") or "unclear") == role and right not in used
        ]
        overlapping = [item for item in candidates if item[1] > 0]
        if not overlapping:
            continue
        right, _ = max(overlapping, key=lambda item: (item[1], -item[0]))
        used.add(right)
        result.append((left, right))
    return result


def _no_boundaries(segments: list[dict[str, object]]) -> bool:
    return all(
        not isinstance(item.get("start_s"), int | float)
        and not isinstance(item.get("end_s"), int | float)
        for item in segments
    )


def _ordered_role_pairs(
    target_segments: list[dict[str, object]],
    actual_segments: list[dict[str, object]],
) -> list[tuple[int, int]]:
    """两侧都未记录时间边界时，按同角色出现顺序配对。"""
    result: list[tuple[int, int]] = []
    used: set[int] = set()
    for left, target in enumerate(target_segments):
        role = str(target.get("role") or "unclear")
        right = next(
            (
                index
                for index, actual in enumerate(actual_segments)
                if index not in used and str(actual.get("role") or "unclear") == role
            ),
            None,
        )
        if right is not None:
            used.add(right)
            result.append((left, right))
    return result


def _overlap(left_start: float, left_end: float, right_start: float, right_end: float) -> float:
    return max(0.0, min(left_end, right_end) - max(left_start, right_start))


def _segment_difference(
    order: int,
    target: dict[str, object] | None,
    actual: dict[str, object] | None,
    target_order: int | None,
    measured_order: int | None,
) -> SegmentDifference:
    target_role = str(target.get("role") or "unclear") if target else "unpaired"
    measured_role = str(actual.get("role") or "unclear") if actual else "unpaired"
    paired = target is not None and actual is not None
    target_distance = _target_distance(target) if target else 0.0
    measured_distance = _distance(actual) if actual else 0.0
    target_duration = _target_duration(target) if target else 0.0
    measured_duration = _duration(actual) if actual else 0.0
    target_pace = _target_pace(target) if target else None
    measured_pace = _pace(actual) if actual else None
    target_hr = _target_hr(target) if target else None
    measured_hr = _hr(actual) if actual else None
    overlap_s: float | None = None
    if target is not None and actual is not None:
        overlap_s = _overlap(
            _number(target.get("start_s")),
            _number(target.get("end_s")),
            _number(actual.get("start_s")),
            _number(actual.get("end_s")),
        )
    return SegmentDifference(
        order=order,
        target_order=target_order,
        measured_order=measured_order,
        target_role=target_role,
        measured_role=measured_role,
        role_match=paired and target_role == measured_role,
        overlap_s=round(overlap_s, 1) if overlap_s is not None else None,
        distance_delta_m=round(measured_distance - target_distance, 1) if paired else 0.0,
        duration_delta_s=round(measured_duration - target_duration, 1) if paired else 0.0,
        pace_delta_s_km=_difference(measured_pace, target_pace) if paired else None,
        hr_delta_bpm=_difference(measured_hr, target_hr) if paired else None,
        target_distance_m=round(target_distance, 1),
        measured_distance_m=round(measured_distance, 1),
        paired=paired,
    )


def _difference(measured: float | None, target: float | None) -> float | None:
    if measured is None or target is None:
        return None
    return round(measured - target, 1)


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
    return float(value) if isinstance(value, int | float) else _distance(segment)


def _target_duration(segment: dict[str, object]) -> float:
    value = _target(segment).get("duration_s")
    return float(value) if isinstance(value, int | float) else _duration(segment)


def _target_pace(segment: dict[str, object]) -> float | None:
    target = _target(segment)
    value = target.get("pace_s_km")
    if isinstance(value, int | float) and value > 0:
        return float(value)
    low, high = target.get("pace_min_s_km"), target.get("pace_max_s_km")
    if isinstance(low, int | float) and isinstance(high, int | float):
        return (float(low) + float(high)) / 2.0
    return _pace(segment)


def _target_hr(segment: dict[str, object]) -> float | None:
    target = _target(segment)
    value = target.get("hr_bpm")
    if isinstance(value, int | float) and value > 0:
        return float(value)
    low, high = target.get("hr_min_bpm"), target.get("hr_max_bpm")
    if isinstance(low, int | float) and isinstance(high, int | float):
        return (float(low) + float(high)) / 2.0
    return _hr(segment)


def _number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return 0.0
    return float(value)
