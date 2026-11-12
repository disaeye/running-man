from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from domain.run_classification.models import ThresholdSnapshot
from domain.thresholds.resolver import ThresholdStep, resolve_all, threshold_from_row


def threshold_at(rows: list[dict[str, Any]], local_day: date) -> ThresholdSnapshot:
    """按活动日期解析阈值；早于首条记录时明确标记回填来源。"""
    history = [threshold_from_row(row) for row in rows]
    resolved = resolve_all(history, local_day, backfill_earlier=True)
    effective = effective_date(history, local_day)
    backfilled = bool(history) and all(step.effective_from > local_day for step in history)
    source_step = min(history, key=lambda step: step.effective_from) if backfilled else None
    backfill_day = source_step.effective_from.isoformat() if source_step else None
    effective_day = (
        local_day.isoformat() if backfilled else effective.isoformat() if effective else ""
    )
    anchor = (
        "athlete_thresholds:earliest_backfill"
        if backfilled
        else "athlete_thresholds:threshold_pace"
    )
    limitations = (
        [f"活动日期 {local_day.isoformat()} 早于首条阈值记录，回填 {backfill_day} 的阈值"]
        if backfill_day
        else []
    )
    return ThresholdSnapshot(
        effective_from=effective_day,
        hr_max=number(resolved["hr_max"]),
        resting_hr=number(resolved["resting_hr"]),
        lthr=number(resolved["lthr"]),
        threshold_pace_s_km=number(resolved["threshold_pace"]),
        intensity_anchor=anchor,
        source_refs=["ACSM-ESSA-2025-intensity-terminology", "Daniels-VDOT"],
        backfill_from=backfill_day,
        limitations=limitations,
    )


def metrics_from(facts: dict[str, float], row: dict[str, Any]) -> dict[str, float]:
    """派生指标与活动摘要里的 TRIMP 一起进入五对象质量字段。"""
    result = {
        key: value
        for key, value in facts.items()
        if key in {"tss", "trimp", "aerobic_decoupling_pct", "intensity_factor"}
    }
    trimp = number(row.get("trimp"))
    if trimp is not None and trimp > 0:
        result["trimp"] = trimp
    return result


def effective_date(history: list[ThresholdStep], local_day: date) -> date | None:
    eligible = [step.effective_from for step in history if step.effective_from <= local_day]
    return max(eligible) if eligible else None


def number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float | Decimal):
        return float(value)
    return None
