"""训练安排干预建议的状态查询、处方缩短与 JSON 编码。"""

from __future__ import annotations

import json
from uuid import UUID

from infrastructure.repositories.plan_adjustments import PENDING, PlanAdjustmentRepo


async def pending_adjustment(
    repo: PlanAdjustmentRepo, athlete_id: UUID, adjustment_id: UUID
) -> dict[str, object] | None:
    """读取指定运动员尚未决定的建议。"""
    rows = await repo.list_for_athlete(athlete_id, PENDING)
    for row in rows:
        if str(row.get("adjustment_id")) == str(adjustment_id):
            return row
    return None


def scaled_prescription(
    prescription: dict[str, object] | None, reduction_pct: float
) -> dict[str, object] | None:
    """缩短课表总时长与每个训练步骤时长，保留配速目标。"""
    if prescription is None:
        return None
    factor = max(0.0, 1.0 - reduction_pct / 100.0)
    scaled = dict(prescription)
    duration = scaled.get("duration_min")
    if isinstance(duration, int):
        scaled["duration_min"] = max(1, round(duration * factor))
    segments = scaled.get("segments")
    if isinstance(segments, list):
        new_segments: list[object] = []
        for segment in segments:
            if not isinstance(segment, dict):
                new_segments.append(segment)
                continue
            entry = dict(segment)
            step_duration = entry.get("duration_min")
            if isinstance(step_duration, int):
                entry["duration_min"] = max(1, round(step_duration * factor))
            new_segments.append(entry)
        scaled["segments"] = new_segments
    return scaled


def encode_prescription(value: dict[str, object]) -> str:
    """将处方编码为 JSON 文本。"""
    return json.dumps(value, ensure_ascii=True)
