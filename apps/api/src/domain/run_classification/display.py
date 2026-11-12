import statistics
from dataclasses import dataclass

from domain.run_classification.analysis import StreamFeatures
from domain.run_classification.display_details import (
    complex_expression,
    expression_name,
    progression_expression,
)
from domain.run_classification.models import ActivityEvidence, WorkGroup
from domain.run_classification.schema import STIMULUS_CATALOG
from domain.run_classification.utils import (
    distance,
    duration,
    duration_text,
    number,
    pace,
    pace_text,
)


@dataclass(frozen=True, slots=True)
class CourseExpressionInput:
    evidence: ActivityEvidence
    structure: str
    session_type: str
    groups: list[WorkGroup]
    segments: list[dict[str, object]]
    stimulus: str
    modifiers: list[str]
    features: StreamFeatures
    grade: str
    confidence: float
    quality: dict[str, object]


def display_name(session_type: str, structure: str, stimulus: str, modifiers: list[str]) -> str:
    return expression_name(session_type, structure, stimulus, modifiers)


def course_expression(data: CourseExpressionInput) -> str:
    name = display_name(
        data.session_type,
        data.structure,
        data.stimulus,
        data.modifiers,
    )
    if data.structure == "progression":
        body = progression_expression(data)
    elif data.structure == "complex":
        body = complex_expression(data)
    elif data.structure in {"interval", "fartlek"} or (data.session_type == "interval_unspecified"):
        body = _grouped_expression(data.groups, data.segments)
    else:
        body = _continuous_expression(data.segments)
    parts = [f"{name}：{body}"]
    if data.structure == "interval":
        parts.extend(_interval_theory_lines(data))
    parts.extend(_role_distances(data.segments))
    parts.extend(_quality_lines(data.evidence, data.quality, data.grade, data.confidence))
    return "；".join(parts)


def _interval_theory_lines(data: CourseExpressionInput) -> list[str]:
    """计划/间歇课程的一行表达带权威依据、靶域、训练目标与质量目标。"""
    spec = STIMULUS_CATALOG[data.stimulus]
    target = data.quality.get("time_in_domain_s")
    target_text = (
        f"{float(target) / 60.0:.1f} min 靶域时间"
        if isinstance(target, int | float)
        else "靶域时间待确认"
    )
    return [
        f"靶域 {spec.target_domain} 累计 {_domain_minutes(data.quality):.1f} min",
        "依据 ACSM/ESSA 2025、World Athletics 2022、Daniels VDOT",
        f"训练目标 {spec.target_adaptation}",
        f"质量目标 {target_text}",
    ]


def _domain_minutes(quality: dict[str, object]) -> float:
    residence = quality.get("work_domain_residence_s")
    if not isinstance(residence, dict):
        return 0.0
    seconds = sum(
        float(value)
        for key, value in residence.items()
        if key in {"mt2_wmax", "above_wmax"} and isinstance(value, int | float)
    )
    return seconds / 60.0


def _continuous_expression(segments: list[dict[str, object]]) -> str:
    work = [item for item in segments if item.get("role") == "work"]
    if not work:
        return "连续里程待确认"
    paces = [pace(item) for item in work if pace(item) > 0]
    distance_km = sum(distance(item) for item in work) / 1000.0
    if not paces:
        return f"连续 {distance_km:.2f} km"
    return f"连续 {distance_km:.2f} km；配速 {pace_text(statistics.fmean(paces))}/km"


def _grouped_expression(groups: list[WorkGroup], segments: list[dict[str, object]]) -> str:
    if not groups:
        groups = _groups_from_segments(segments)
    parts = [_group_expression(group) for group in groups]
    if not parts:
        return "轮数与单轮里程待确认"
    recovery = [item for item in segments if item.get("role") == "recovery"]
    if recovery and len(groups) == 1 and groups[0].recovery_duration_s <= 0:
        recovery_s = sum(duration(item) for item in recovery)
        recovery_km = sum(distance(item) for item in recovery) / 1000.0
        parts[0] += f"[{duration_text(recovery_s)} / {recovery_km:.2f} km 恢复]"
    return "；".join(parts)


def _groups_from_segments(segments: list[dict[str, object]]) -> list[WorkGroup]:
    work = [item for item in segments if item.get("role") == "work"]
    if not work:
        return []
    recovery = [item for item in segments if item.get("role") == "recovery"]
    return [
        WorkGroup(
            source_group="work_segments",
            sets=1,
            repetitions=len(work),
            distance_range_m=_range([distance(item) for item in work]),
            duration_range_s=_range([duration(item) for item in work]),
            pace_range_s_km=_range([pace(item) for item in work]),
            recovery_duration_s=sum(duration(item) for item in recovery),
            recovery_distance_m=sum(distance(item) for item in recovery),
            target_pace_s_km=None,
        )
    ]


def _group_expression(group: WorkGroup) -> str:
    count = "轮数待确认" if group.repetitions is None else f"{group.repetitions} 轮"
    distance_value = _distance_range_text(group.distance_range_m)
    target_paces = group.target_pace_s_km or []
    pace_values = target_paces or group.pace_range_s_km
    pace_label = "目标配速" if target_paces else "实测配速"
    pace_value = _pace_range_text(pace_values, pace_label)
    recovery = ""
    if group.recovery_duration_s > 0:
        recovery = (
            f"[{duration_text(group.recovery_duration_s)} / "
            f"{group.recovery_distance_m / 1000:.2f} km 恢复]"
        )
    return f"{group.sets} 组 × {count} × {distance_value}（{pace_value}）{recovery}"


def _distance_range_text(values: list[float]) -> str:
    if not values:
        return "单轮里程待确认"
    low, high = min(values), max(values)
    if low == high:
        return f"{low / 1000:.2f} km"
    return f"{low / 1000:.2f}–{high / 1000:.2f} km"


def _pace_range_text(values: list[float], label: str) -> str:
    if not values:
        return f"{label}待确认"
    low, high = min(values), max(values)
    if low == high:
        return f"{label} {pace_text(low)}/km"
    return f"{label} {pace_text(low)}–{pace_text(high)}/km"


def _range(values: list[float]) -> list[float]:
    positive = [round(value, 1) for value in values if value > 0]
    if not positive:
        return []
    return [min(positive), max(positive)]


def _role_distances(segments: list[dict[str, object]]) -> list[str]:
    warmup = sum(distance(item) for item in segments if item.get("role") == "warmup")
    cooldown = sum(distance(item) for item in segments if item.get("role") == "cooldown")
    work_distance = sum(distance(item) for item in segments if item.get("role") == "work")
    recovery_distance = sum(distance(item) for item in segments if item.get("role") == "recovery")
    result = [
        f"工作里程 {work_distance / 1000:.2f} km",
        f"恢复里程 {recovery_distance / 1000:.2f} km",
    ]
    if warmup or cooldown:
        result.append(f"热身 {warmup / 1000:.2f} km；放松 {cooldown / 1000:.2f} km")
    return result


def _quality_lines(
    evidence: ActivityEvidence,
    quality: dict[str, object],
    grade: str,
    confidence: float,
) -> list[str]:
    lines = [
        f"整场 {evidence.distance_m / 1000:.2f} km（一致性校验）",
        f"工作配速波动 {number(quality.get('work_pace_cv')):.3f}",
        f"恢复/工作时长 {number(quality.get('recovery_ratio')):.3f}",
    ]
    if isinstance(quality.get("work_distance_match"), int | float):
        lines.append(f"工作里程完成度 {number(quality.get('work_distance_match')):.3f}")
    lines.append(f"证据等级 {grade}；置信度 {confidence:.2f}")
    return lines
