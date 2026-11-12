import statistics
from dataclasses import dataclass, field
from typing import Final, cast

from domain.run_classification.analysis import (
    cumulative_distance,
    distance_between,
    stream_mean,
)
from domain.run_classification.domains import domain_for_segment
from domain.run_classification.groups import build_work_groups
from domain.run_classification.models import ActivityEvidence, SegmentBuild, SessionSegment
from domain.run_classification.segment_measurements import (
    measured_values,
    single_lap_inconsistent,
)
from domain.run_classification.segment_roles import (
    alternating_recovery_speed,
    role_for_row,
)

MIN_WORK_S: Final = 20.0
MIN_RECOVERY_S: Final = 1.0
MIN_LAP_S: Final = 10.0
MIN_MOVING_SPEED: Final = 0.5


@dataclass(slots=True)
class SegmentRow:
    start_s: float
    end_s: float
    duration_s: float
    distance_m: float
    pace_s_km: float | None
    avg_hr: float | None
    speed: float
    explicit_type: object = None
    explicit_role: str | None = None
    source_group: str | None = None
    work_candidate: bool = False
    explicit_recovery: bool = False
    extras: dict[str, object] = field(default_factory=dict)


def build_segments(evidence: ActivityEvidence) -> SegmentBuild:
    exact = evidence.exact_intervals or _raw_exact_intervals(evidence.raw_data)
    if exact:
        return _exact_build(evidence, exact)
    if evidence.laps:
        return _lap_build(evidence)
    return _continuous_build(evidence)


def _raw_exact_intervals(raw_data: dict[str, object]) -> list[dict[str, object]]:
    value = raw_data.get("icu_intervals")
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _exact_build(evidence: ActivityEvidence, intervals: list[dict[str, object]]) -> SegmentBuild:
    candidates = [_exact_row(evidence, item) for item in intervals]
    rows = [row for row in candidates if row is not None and row.duration_s > 0]
    if not rows:
        return _lap_build(evidence)
    slow_cut = alternating_recovery_speed(rows)
    explicit_roles = {
        "WARMUP": "warmup",
        "COOLDOWN": "cooldown",
        "TRANSITION": "transition",
        "RECOVERY": "recovery",
    }
    for row in rows:
        explicit = str(row.explicit_type or "").upper()
        row.explicit_role = explicit_roles.get(explicit)
        row.explicit_recovery = explicit == "RECOVERY"
        row.work_candidate = (
            row.explicit_role is None
            and explicit in {"", "WORK"}
            and row.duration_s >= MIN_WORK_S
            and row.speed > MIN_MOVING_SPEED
            and (slow_cut is None or row.speed >= slow_cut)
        )
    return _finalize(evidence, rows, "icu_intervals", True)


def _exact_row(evidence: ActivityEvidence, item: dict[str, object]) -> SegmentRow | None:
    start = _number(item.get("start_time"))
    if start is None:
        start = _number(item.get("start_index")) or 0.0
    duration = _number(item.get("moving_time")) or _number(item.get("elapsed_time"))
    end_time = _number(item.get("end_time"))
    if duration is None or duration <= 0:
        duration = max(0.0, (end_time or start) - start)
    distance = _number(item.get("distance"))
    if distance is None:
        times, distances = cumulative_distance(evidence)
        distance = distance_between(times, distances, start, start + duration)
    speed = _number(item.get("average_speed"))
    if speed is None or speed <= 0:
        speed = distance / duration if duration > 0 else 0.0
    return SegmentRow(
        start_s=start,
        end_s=(end_time if end_time is not None and end_time > start else start + duration),
        duration_s=duration,
        distance_m=distance,
        pace_s_km=duration / (distance / 1000.0) if distance > 0 else None,
        avg_hr=_number(item.get("average_heartrate")),
        speed=speed,
        explicit_type=item.get("type"),
        source_group=(
            str(item["group_id"])
            if isinstance(item.get("group_id"), str) and item.get("group_id")
            else None
        ),
    )


def _lap_build(evidence: ActivityEvidence) -> SegmentBuild:
    rows: list[SegmentRow] = []
    cursor = 0.0
    for lap in evidence.laps:
        duration = _number(lap.get("duration_s")) or 0.0
        distance = _number(lap.get("distance_m")) or 0.0
        if duration < MIN_LAP_S or distance <= 0:
            continue
        start = _number(lap.get("start_s")) or cursor
        rows.append(
            SegmentRow(
                start_s=start,
                end_s=start + duration,
                duration_s=duration,
                distance_m=distance,
                pace_s_km=duration / (distance / 1000.0),
                avg_hr=_number(lap.get("avg_hr")),
                speed=distance / duration,
                explicit_type="WORK",
                source_group="activity_laps_work",
            )
        )
        cursor = start + duration
    if not rows or single_lap_inconsistent(rows, evidence.distance_m, evidence.duration_s):
        return _continuous_build(evidence)
    reference = statistics.median([row.speed for row in rows])
    for row in rows:
        row.work_candidate = row.speed >= reference * 0.9
    return _finalize(evidence, rows, "activity_laps", False)


def _continuous_build(evidence: ActivityEvidence) -> SegmentBuild:
    """Measured from streams; the summary distance is a consistency check only."""
    summary_distance = float(evidence.distance_m)
    duration = float(evidence.duration_s)
    times, distances = cumulative_distance(evidence)
    stream_distance = distance_between(times, distances, 0.0, duration)
    if stream_distance <= 0:
        return SegmentBuild(
            segments=[],
            work_groups=[],
            measurement_sources=["activity_streams", "activity_summary"],
            exact_source=False,
            limitations=[
                "缺少可用 stream 逐点测量，分类结果未确认",
                "activity_summary 仅用于整场里程一致性校验",
                "缺少直接 MT1/MT2/Wmax 测量",
            ],
        )
    distance = stream_distance
    speed = distance / duration if duration > 0 else 0.0
    avg_hr = stream_mean(evidence.streams.get("heart_rate", []), 0.0, duration)
    segment: SessionSegment = {
        "order": 1,
        "role": "work",
        "start_s": 0.0,
        "end_s": duration,
        "duration_s": duration,
        "distance_m": distance,
        "pace_s_km": duration / (distance / 1000.0) if distance > 0 else None,
        "avg_hr": avg_hr,
        "domain": domain_for_segment(
            speed=speed, avg_hr=avg_hr, duration_s=duration, raw_data=evidence.raw_data
        ),
        "evidence_source": "activity_streams",
        "repetitions": 1,
        "sets": 1,
        "measured": measured_values(distance, duration, avg_hr, speed),
    }
    sources = [f"activity_streams:{key}" for key in sorted(evidence.streams)]
    limitations = [
        "缺少 icu_intervals 与有效 activity_laps 边界，使用 stream 逐点测量",
        "activity_summary 仅用于整场里程一致性校验",
        "缺少直接 MT1/MT2/Wmax 测量",
    ]
    consistency = distance / summary_distance if summary_distance > 0 else 0.0
    if abs(consistency - 1.0) > 0.10:
        limitations.append(
            "stream 积分里程与 activity_summary 里程偏差超过 10%，摘要仅作一致性校验"
        )
    return SegmentBuild(
        segments=[segment],
        work_groups=[],
        measurement_sources=["activity_streams", *sources],
        exact_source=False,
        limitations=limitations,
    )


def _finalize(
    evidence: ActivityEvidence,
    rows: list[SegmentRow],
    source: str,
    exact: bool,
) -> SegmentBuild:
    work_indices = [index for index, row in enumerate(rows) if row.work_candidate]
    segments: list[SessionSegment] = []
    for index, row in enumerate(rows):
        avg_hr = row.avg_hr
        if avg_hr is None:
            avg_hr = stream_mean(evidence.streams.get("heart_rate", []), row.start_s, row.end_s)
        role = role_for_row(row, index, work_indices)
        segment: SessionSegment = {
            "order": len(segments) + 1,
            "role": role,
            "start_s": round(row.start_s, 1),
            "end_s": round(row.end_s, 1),
            "duration_s": round(row.duration_s, 1),
            "distance_m": round(row.distance_m, 1),
            "pace_s_km": row.pace_s_km,
            "avg_hr": round(avg_hr, 1) if avg_hr is not None else None,
            "domain": domain_for_segment(
                speed=row.speed,
                avg_hr=avg_hr,
                duration_s=row.duration_s,
                raw_data=evidence.raw_data,
            ),
            "evidence_source": source,
            "repetitions": 1,
            "sets": 1,
            "measured": measured_values(row.distance_m, row.duration_s, avg_hr, row.speed),
        }
        segments.append(segment)
    limitations = ["缺少直接 MT1/MT2/Wmax 测量"]
    if not exact:
        limitations.append("缺少 icu_intervals，使用 activity_laps 作为分段边界")
    if not evidence.streams.get("heart_rate"):
        limitations.append("缺少心率 stream")
    if evidence.linked_prescription is None:
        limitations.append("缺少计划课程关联")
    object_rows: list[object] = [cast(object, row) for row in rows]
    return SegmentBuild(
        segments=segments,
        work_groups=build_work_groups(object_rows, segments),
        measurement_sources=[source, *sorted(evidence.streams)],
        exact_source=exact,
        limitations=limitations,
    )


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)
