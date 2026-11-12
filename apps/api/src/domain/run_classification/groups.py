from collections.abc import Sequence
from itertools import pairwise
from typing import Any

from domain.run_classification.models import SessionSegment, WorkGroup


def build_work_groups(rows: Sequence[Any], segments: list[SessionSegment]) -> list[WorkGroup]:
    if len(rows) != len(segments):
        raise ValueError("segment rows and segments must have equal length")
    group_keys = _assign_group_keys(rows, segments)
    ordered_keys = list(dict.fromkeys(key for key in group_keys if key))
    result: list[WorkGroup] = []
    for key in ordered_keys:
        positions = [index for index, value in enumerate(group_keys) if value == key]
        if not positions:
            continue
        work = [segments[index] for index in positions]
        recovery = _recovery_segments(positions, group_keys, segments)
        result.append(
            WorkGroup(
                source_group=key,
                sets=1,
                repetitions=len(work),
                distance_range_m=_range([_distance(item) for item in work]),
                duration_range_s=_range([_duration(item) for item in work]),
                pace_range_s_km=_range([_pace(item) for item in work]),
                recovery_duration_s=round(sum(_duration(item) for item in recovery), 1),
                recovery_distance_m=round(sum(_distance(item) for item in recovery), 1),
                target_pace_s_km=None,
            )
        )
    return result


def _assign_group_keys(rows: Sequence[Any], segments: list[SessionSegment]) -> list[str]:
    keys: list[str] = []
    run_index = 0
    previous_work = False
    for row, segment in zip(rows, segments):
        work_candidate = bool(getattr(row, "work_candidate", False))
        if work_candidate and not previous_work:
            run_index += 1
        source_group = getattr(row, "source_group", None)
        if work_candidate:
            key = (
                str(source_group)
                if isinstance(source_group, str)
                and source_group
                and source_group.upper() != "RECOVERY"
                else f"work_run:{run_index}"
            )
        else:
            key = ""
        segment["source_group"] = key or None
        keys.append(key)
        previous_work = work_candidate
    return keys


def _recovery_segments(
    positions: list[int], group_keys: list[str], segments: list[SessionSegment]
) -> list[SessionSegment]:
    result: list[SessionSegment] = []
    for left, right in pairwise(positions):
        result.extend(_recovery_between(left, right, segments))
    last = positions[-1]
    next_work = next(
        (
            index
            for index in range(last + 1, len(group_keys))
            if group_keys[index] and group_keys[index] != group_keys[last]
        ),
        len(segments),
    )
    result.extend(_recovery_between(last, next_work, segments))
    return result


def _recovery_between(
    left: int, right: int, segments: list[SessionSegment]
) -> list[SessionSegment]:
    return [item for item in segments[left + 1 : right] if item.get("role") == "recovery"]


def _range(values: list[float]) -> list[float]:
    positive = [round(value, 1) for value in values if value > 0]
    if not positive:
        return []
    return [min(positive), max(positive)]


def _distance(segment: SessionSegment) -> float:
    value = segment.get("distance_m")
    return float(value) if isinstance(value, int | float) else 0.0


def _duration(segment: SessionSegment) -> float:
    value = segment.get("duration_s")
    return float(value) if isinstance(value, int | float) else 0.0


def _pace(segment: SessionSegment) -> float:
    value = segment.get("pace_s_km")
    return float(value) if isinstance(value, int | float) and float(value) > 0 else 0.0
