from __future__ import annotations

from typing import TYPE_CHECKING, Final

from domain.run_classification.schema import STIMULUS_CATALOG

if TYPE_CHECKING:
    from domain.workout.plan_evidence import PlanScience

_STRUCTURE_LABELS: Final[dict[str, str]] = {
    "continuous": "连续跑",
    "interval": "间歇跑",
    "progression": "渐加速跑",
    "fartlek": "变速跑",
    "complex": "复杂课",
    "unclear": "结构待确认",
}


def format_plan_expression(
    science: PlanScience,
    segments: tuple[dict[str, object], ...] | list[dict[str, object]],
) -> str:
    """按已确认示例输出计划课程：主体、热身/放松、剂量、靶域、依据、目标。"""
    stimulus = STIMULUS_CATALOG[science.primary_stimulus]
    name = f"{_structure_label(science.structure)} · {stimulus.label}"
    if science.structure != "interval":
        return _continuous_expression(name, segments)
    target = work_quality_target(segments)
    body_parts = [_interval_expression(segments), *_context_lines(segments)]
    extras = [
        f"工作里程 {_number(target['work_distance_m']) / 1000.0:.2f} km",
        f"靶域 {science.target_domain} 累计 {_number(target['time_in_domain_s']) / 60.0:.1f} min",
        "依据 ACSM/ESSA 2025、World Athletics 2022、Daniels VDOT",
        f"训练目标 {science.target_adaptation}",
        f"质量目标 {_number(target['target_repetitions']):.0f} 轮 / "
        f"{_number(target['work_distance_m']) / 1000.0:.2f} km",
    ]
    return f"{name}：{'；'.join(body_parts + extras)}"


def _context_lines(
    segments: tuple[dict[str, object], ...] | list[dict[str, object]],
) -> list[str]:
    lines: list[str] = []
    for role, label in (("warmup", "热身"), ("cooldown", "放松")):
        duration_s = sum(
            _number(item.get("duration_s")) for item in segments if item.get("role") == role
        )
        distance_m = sum(_distance(item) for item in segments if item.get("role") == role)
        if duration_s > 0:
            lines.append(f"{label} {duration_s / 60.0:.0f} min / {distance_m / 1000.0:.2f} km")
    return lines


def _segment_midpoint_pace(segment: dict[str, object]) -> float:
    low = _number(segment.get("pace_min_s_km"))
    high = _number(segment.get("pace_max_s_km"))
    if low > 0 and high > 0:
        return (low + high) / 2.0
    return low if low > 0 else high


def _continuous_expression(
    name: str, segments: tuple[dict[str, object], ...] | list[dict[str, object]]
) -> str:
    distance_m = sum(_distance(segment) for segment in segments)
    pace_values = [
        pace for segment in segments if (pace := _segment_midpoint_pace(segment)) > 0
    ]
    if not pace_values:
        return f"{name}：连续 {distance_m / 1000:.2f} km"
    mean_pace = sum(pace_values) / len(pace_values)
    return f"{name}：连续 {distance_m / 1000:.2f} km；配速 {_pace_text(mean_pace)}/km"


def _interval_expression(
    segments: tuple[dict[str, object], ...] | list[dict[str, object]],
) -> str:
    work = [
        segment
        for segment in segments
        if segment.get("role") == "work" or segment.get("type") in {"threshold", "intervals"}
    ]
    if not work:
        return "轮数与单轮里程待确认"
    groups: list[list[dict[str, object]]] = []
    for segment in work:
        if groups and _group_key(groups[-1][0]) == _group_key(segment):
            groups[-1].append(segment)
        else:
            groups.append([segment])
    parts: list[str] = []
    for group in groups:
        first = group[0]
        distance_m = _distance(first)
        pace_min = _number(first.get("pace_min_s_km"))
        pace_max = _number(first.get("pace_max_s_km"))
        pace = ""
        if pace_min > 0:
            pace = (
                f"（{_pace_text(pace_min)}/km）"
                if pace_min == pace_max
                else f"（{_pace_text(pace_min)}–{_pace_text(pace_max)}/km）"
            )
        recovery_s = _number(first.get("recovery_duration_s")) or 0.0
        recovery = f"[{_duration_text(recovery_s)} 恢复]" if recovery_s > 0 else ""
        parts.append(f"1 组 × {len(group)} 轮 × {distance_m / 1000:.2f} km{pace}{recovery}")
    return "；".join(parts)


def _group_key(segment: dict[str, object]) -> tuple[float, float, float, float]:
    return (
        round(_distance(segment), 1),
        _number(segment.get("pace_min_s_km")),
        _number(segment.get("pace_max_s_km")),
        _number(segment.get("recovery_duration_s")),
    )


def work_quality_target(
    segments: tuple[dict[str, object], ...] | list[dict[str, object]],
) -> dict[str, object]:
    """Session-level quality target summed over expanded work bouts."""
    work = [item for item in segments if item.get("role") == "work"]
    distance_m = sum(_distance(item) for item in work)
    duration_s = sum(_number(item.get("duration_s")) for item in work)
    return {
        "work_distance_m": round(distance_m, 1),
        "work_duration_s": round(duration_s, 1),
        "time_in_domain_s": round(duration_s, 1),
        "target_repetitions": len(work),
    }


def _structure_label(structure: str) -> str:
    return _STRUCTURE_LABELS[structure]


def _distance(segment: dict[str, object]) -> float:
    return _number(segment.get("distance_m"))


def _number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return 0.0
    return float(value)


def _pace_text(seconds: float) -> str:
    return f"{int(seconds // 60)}:{int(seconds % 60):02d}"


def _duration_text(seconds: float) -> str:
    if seconds >= 60:
        return f"{int(seconds // 60)} min {int(seconds % 60):02d} s"
    return f"{int(seconds)} s"
