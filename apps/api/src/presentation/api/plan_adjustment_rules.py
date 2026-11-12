"""训练安排干预建议的状态查询、处方缩减与 JSON 编码。"""

from __future__ import annotations

import json
from uuid import UUID

from domain.workout.plan_evidence import work_quality_target
from domain.workout.prescription import session_distance_m
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
    """按比例缩减课表时长与距离，保留配速目标。

    时长（顶层与分段）按比例缩减；分段的距离与秒数同步重算，整课距离与
    quality_target 由重算后的分段重建，保证采纳后各字段口径一致。
    """
    if prescription is None:
        return None
    factor = max(0.0, 1.0 - reduction_pct / 100.0)
    scaled = dict(prescription)
    duration = scaled.get("duration_min")
    if isinstance(duration, int | float) and not isinstance(duration, bool):
        scaled["duration_min"] = max(1.0, round(float(duration) * factor, 2))
    pace_min = _number(scaled.get("pace_min_s_km"))
    pace_max = _number(scaled.get("pace_max_s_km"))
    raw_segments = scaled.get("segments")
    scaled_segments: list[dict[str, object]] = []
    if isinstance(raw_segments, list):
        reloaded: list[object] = [_scaled_segment(segment, factor) for segment in raw_segments]
        scaled["segments"] = reloaded
        scaled_segments = [entry for entry in reloaded if isinstance(entry, dict)]
    scaled["predicted_distance_m"] = session_distance_m(
        scaled_segments,
        int(pace_min) if pace_min else None,
        int(pace_max) if pace_max else None,
    )
    scaled["quality_target"] = work_quality_target(scaled_segments)
    return scaled


def _scaled_segment(segment: object, factor: float) -> object:
    if not isinstance(segment, dict):
        return segment
    entry = dict(segment)
    step_duration = entry.get("duration_min")
    if isinstance(step_duration, int | float) and not isinstance(step_duration, bool):
        new_duration = max(1.0, round(float(step_duration) * factor, 2))
        entry["duration_min"] = new_duration
        entry["duration_s"] = round(new_duration * 60.0, 1)
    distance = entry.get("distance_m")
    if isinstance(distance, int | float) and not isinstance(distance, bool) and distance > 0:
        entry["distance_m"] = round(float(distance) * factor, 1)
    quality = entry.get("quality_target")
    if isinstance(quality, dict):
        reloaded = dict(quality)
        for key in ("work_distance_m", "work_duration_s"):
            value = reloaded.get(key)
            if isinstance(value, int | float) and not isinstance(value, bool) and value > 0:
                reloaded[key] = round(float(value) * factor, 1)
        entry["quality_target"] = reloaded
    return entry


def _number(value: object) -> float | None:
    if isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)
    return None


def encode_prescription(value: dict[str, object]) -> str:
    """将处方编码为 JSON 文本。"""
    return json.dumps(value, ensure_ascii=True)
