from __future__ import annotations

from typing import TYPE_CHECKING

from domain.run_classification.schema import (
    MODIFIER_LABEL,
    STIMULUS_CATALOG,
    STRUCTURE_LABEL,
)
from domain.run_classification.utils import (
    distance,
    duration,
    pace,
    pace_text,
)

if TYPE_CHECKING:
    from domain.run_classification.display import CourseExpressionInput

PROGRESSION_MODIFIER_LABELS = frozenset({"渐加速", "后段加速"})


def expression_name(
    session_type: str,
    structure: str,
    stimulus: str,
    modifiers: list[str],
) -> str:
    """主标签保持结构、主刺激与必要修饰；复杂课采用确认来源里的联合表达。"""
    _ = session_type
    spec = STIMULUS_CATALOG[stimulus]
    if structure == "complex" and stimulus == "vo2max":
        return "复杂课 · 有氧基础 + 速度动作"
    parts = [STRUCTURE_LABEL.get(structure, "结构待确认"), spec.label]
    seen = set(parts)
    for modifier in modifiers:
        text = MODIFIER_LABEL.get(modifier)
        if text is None or text in seen or text in parts[0]:
            continue
        if structure == "progression" and text in PROGRESSION_MODIFIER_LABELS:
            continue
        seen.add(text)
        parts.append(text)
    return " · ".join(parts)


def progression_expression(data: CourseExpressionInput) -> str:
    work = [item for item in data.segments if item.get("role") == "work"]
    distance_km = sum(distance(item) for item in work) / 1000.0
    paces = [
        pace_text(1000.0 / value) if value > 0 else "—" for value in data.features.third_speeds
    ]
    parts = [f"连续 {distance_km:.2f} km；分段配速 {' → '.join(paces)}/km"]
    low_share = data.quality.get("low_domain_share")
    if isinstance(low_share, int | float):
        parts.append(f"低强度域占比 {low_share * 100.0:.0f}%")
    parts.append(_final_domain_text(data))
    parts.append("刺激有氧耐力与配速控制")
    return "；".join(parts)


def _final_domain_text(data: CourseExpressionInput) -> str:
    gain = data.features.speed_increase_pct
    if data.features.monotonic and gain >= 5.0:
        return "后段进入中等强度域"
    return "后段强度域待确认"


def complex_expression(data: CourseExpressionInput) -> str:
    """复杂课按连续主段、短加速、恢复段与短时段分别表达。"""
    work = [item for item in data.segments if item.get("role") == "work"]
    continuous = [item for item in work if distance(item) >= 3000.0 and duration(item) >= 600.0]
    surges = [item for item in work if 100.0 <= distance(item) <= 300.0 and duration(item) <= 60.0]
    surge_ids = {id(item) for item in surges}
    continuous_ids = {id(item) for item in continuous}
    other = [item for item in work if id(item) not in surge_ids and id(item) not in continuous_ids]
    parts: list[str] = []
    for item in [*continuous, *other]:
        parts.append(f"连续 {distance(item) / 1000.0:.2f} km（{pace_text(pace(item))}/km）")
    if surges:
        low = min(distance(item) for item in surges)
        high = max(distance(item) for item in surges)
        surge_paces = [pace(item) for item in surges if pace(item) > 0]
        pace_value = (
            f"{pace_text(min(surge_paces))}–{pace_text(max(surge_paces))}/km"
            if surge_paces
            else "配速待确认"
        )
        recovery_s = _median_recovery_seconds(data.segments)
        recovery_text = f"[{round(recovery_s / 60.0)} min 恢复]" if recovery_s > 0 else ""
        parts.append(f"{len(surges)} × {low:.0f}–{high:.0f} m（{pace_value}）{recovery_text}")
        parts.append(f"加速段 {sum(distance(item) for item in surges) / 1000.0:.2f} km")
    recovery = [item for item in data.segments if item.get("role") == "recovery"]
    if recovery:
        parts.append(f"恢复段大约 {sum(distance(item) for item in recovery) / 1000.0:.2f} km")
    transitions = [
        item
        for item in data.segments
        if item.get("role") == "transition" and 0 < duration(item) <= 15.0
    ]
    if transitions:
        parts.append(f"另有 {int(sum(duration(item) for item in transitions))} s 短段")
    return "；".join(parts)


def _median_recovery_seconds(segments: list[dict[str, object]]) -> float:
    values = [
        duration(item)
        for item in segments
        if item.get("role") == "recovery" and 60.0 <= duration(item) <= 180.0
    ]
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[len(ordered) // 2]
