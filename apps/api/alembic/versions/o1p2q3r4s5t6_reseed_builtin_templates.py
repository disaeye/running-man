"""reseed builtin run templates with VDOT pace anchors and work distances

Revision ID: o1p2q3r4s5t6
Revises: n0a1b2c3d4e5
Create Date: 2026-11-10
"""

from collections.abc import Sequence
from typing import TypedDict

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision: str = "o1p2q3r4s5t6"
down_revision: str | Sequence[str] | None = "n0a1b2c3d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Daniels VDOT 50 的配速中值（秒/公里）。内置模板属于通用处方，具体配速在
# 生成计划时按 activity_date 生效的 athlete_thresholds 重新解析；这里的里程是
# 参考配速下的名义处方里程，用于与 icu_intervals 的 distance 建立对应关系。
REFERENCE_PACE_S_KM: dict[str, float] = {
    "easy": 353.5,
    "threshold": 261.5,
    "interval": 237.0,
    "repetition": 217.0,
}

SOURCE_REFS = [
    "ACSM-ESSA-2025-intensity-terminology",
    "World-Athletics-2022-speed-training",
    "World-Athletics-2021-aerobic-fitness",
    "IAAF-1997-running-training-notation",
    "Haugen-2021-middle-distance-training",
    "Daniels-VDOT",
]

SPEC: dict[str, tuple[str, str, str]] = {
    "recovery": ("recovery", "below_mt1", "维持低负荷活动并且促进恢复"),
    "aerobic-base": ("aerobic_base", "below_mt1", "增加有氧基础以及骨骼肌肉耐受"),
    "tempo": ("lactate_threshold", "mt1_mt2", "提高乳酸清除以及持续配速能力"),
    "threshold": ("lactate_threshold", "mt1_mt2", "提高乳酸清除以及持续配速能力"),
    "vo2max": ("vo2max", "mt2_wmax", "提高最大摄氧量以及摄氧动力学"),
    "long-run": ("aerobic_endurance", "below_mt1", "提高长时间持续跑能力"),
}


class SegmentSpec(TypedDict):
    segment_type: str
    duration_s: int
    pace_key: str
    spec: tuple[str, str, str]
    repetitions: int
    recovery_s: int
    role: str


def _segment(item: SegmentSpec) -> dict[str, object]:
    stimulus, domain, adaptation = item["spec"]
    pace_key = item["pace_key"]
    duration_s = item["duration_s"]
    repetitions = item["repetitions"]
    recovery_s = item["recovery_s"]
    reference = REFERENCE_PACE_S_KM[pace_key]
    distance_m = round(duration_s / reference * 1000.0, 1)
    return {
        "segment_type": item["segment_type"],
        "duration_s": duration_s,
        "distance_m": distance_m,
        "pace_key": pace_key,
        "repetitions": repetitions,
        "recovery_s": recovery_s or None,
        "recovery_distance_m": 0.0 if recovery_s else None,
        "role": item["role"],
        "target_domain": domain,
        "anchor": f"Daniels-VDOT/{pace_key}",
        "source_refs": SOURCE_REFS,
        "rationale": (
            f"{adaptation}；ACSM/ESSA 强度域 {domain}；"
            f"配速锚点 athlete_thresholds 按日期解析的 {pace_key} 配速。"
        ),
        "target_adaptation": adaptation,
        "target": {
            "distance_m": distance_m,
            "duration_s": duration_s,
            "pace_key": pace_key,
            "anchor_model": "Daniels-VDOT",
            "domain": domain,
        },
        "measured": {},
        "quality_target": {
            "work_distance_m": distance_m,
            "work_duration_s": duration_s,
            "target_repetitions": repetitions,
        },
        "primary_stimulus": stimulus,
    }


def _base(
    segment_type: str,
    duration_s: int,
    pace_key: str,
    spec: tuple[str, str, str],
    repetitions: int = 1,
    recovery_s: int = 0,
    role: str = "work",
) -> dict[str, object]:
    segment_spec = spec if role == "work" else SPEC["recovery"]
    actual_pace = pace_key if role == "work" else "easy"
    values: SegmentSpec = {
        "segment_type": segment_type,
        "duration_s": duration_s,
        "pace_key": actual_pace,
        "spec": segment_spec,
        "repetitions": repetitions,
        "recovery_s": recovery_s,
        "role": role,
    }
    return _segment(values)


def _segments(goal_type: str) -> list[dict[str, object]]:
    spec = SPEC[goal_type]
    warm = _base("Warmup", 900, "easy", spec, role="warmup")
    cool = _base("Cooldown", 600, "easy", spec, role="cooldown")
    if goal_type == "recovery":
        return [_base("SteadyState", 1800, "easy", spec)]
    if goal_type == "aerobic-base":
        return [_base("SteadyState", 3600, "easy", spec)]
    if goal_type == "long-run":
        return [_base("SteadyState", 5400, "easy", spec)]
    if goal_type == "tempo":
        return [warm, _base("SteadyState", 1800, "threshold", spec), cool]
    if goal_type == "threshold":
        return [
            warm,
            _base("IntervalsT", 300, "threshold", spec, repetitions=4, recovery_s=60),
            cool,
        ]
    return [
        warm,
        _base("IntervalsT", 180, "interval", spec, repetitions=5, recovery_s=90),
        cool,
    ]


NAMES = {
    "recovery": "恢复跑",
    "aerobic-base": "有氧基础",
    "tempo": "节奏跑",
    "threshold": "阈值间歇",
    "vo2max": "VO₂max 间歇",
    "long-run": "长距离",
}

_TEMPLATE_TABLE = sa.table(
    "workout_templates",
    sa.column("athlete_id", sa.Uuid()),
    sa.column("name", sa.Text()),
    sa.column("sport", sa.String()),
    sa.column("goal_type", sa.String()),
    sa.column("segments", JSONB()),
    sa.column("source", sa.String()),
)


def _write(rows: list[dict[str, object]]) -> None:
    op.execute("DELETE FROM workout_templates WHERE source = 'builtin' AND athlete_id IS NULL")
    op.bulk_insert(_TEMPLATE_TABLE, rows)


def upgrade() -> None:
    _write(
        [
            {
                "athlete_id": None,
                "name": NAMES[goal_type],
                "sport": "Run",
                "goal_type": goal_type,
                "segments": _segments(goal_type),
                "source": "builtin",
            }
            for goal_type in SPEC
        ]
    )


def downgrade() -> None:
    legacy = {
        "recovery": [("SteadyState", 1800, 0.55, 0.65)],
        "aerobic-base": [("SteadyState", 3600, 0.65, 0.78)],
        "tempo": [
            ("Warmup", 900, 0.6, 0.7),
            ("SteadyState", 1800, 0.82, 0.88),
            ("Cooldown", 600, 0.55, 0.65),
        ],
        "threshold": [
            ("Warmup", 900, 0.6, 0.75),
            *(("IntervalsT", 300, 0.97, 1.05),) * 4,
            ("Cooldown", 600, 0.55, 0.65),
        ],
        "vo2max": [
            ("Warmup", 900, 0.6, 0.75),
            *(("IntervalsT", 180, 1.05, 1.15),) * 5,
            ("Cooldown", 600, 0.55, 0.65),
        ],
        "long-run": [("SteadyState", 5400, 0.68, 0.78)],
    }
    _write(
        [
            {
                "athlete_id": None,
                "name": NAMES[goal_type],
                "sport": "Run",
                "goal_type": goal_type,
                "segments": [
                    {
                        "segment_type": kind,
                        "duration_s": seconds,
                        "power_low": low,
                        "power_high": high,
                    }
                    for kind, seconds, low, high in items
                ],
                "source": "builtin",
            }
            for goal_type, items in legacy.items()
        ]
    )
