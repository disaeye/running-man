from __future__ import annotations

from typing import Any
from uuid import UUID

from application.data_quality_models import QualityIssue
from application.data_quality_streams import (
    gps_drift_activities,
    hr_jump_activities,
    speed_outlier_activities,
)


async def _hrv_missing_recent(cur: Any, athlete_id: UUID) -> list[QualityIssue]:
    """近 7 天有健康记录但 HRV 全缺失时告警：恢复基线依赖 HRV。"""
    await cur.execute(
        """
        SELECT count(*) AS wellness_days,
               count(*) FILTER (WHERE hrv IS NOT NULL) AS hrv_days
        FROM health_wellness
        WHERE athlete_id = %s AND day >= CURRENT_DATE - INTERVAL '6 days'
        """,
        (athlete_id,),
    )
    row = await cur.fetchone()
    if row is None or int(row["wellness_days"]) == 0:
        return []
    if int(row["hrv_days"]) == 0:
        return [
            QualityIssue(
                key="hrv_missing_recent",
                severity="warning",
                label="近7天无HRV记录，恢复基线无法计算",
                entity_type="wellness",
                count=0,
            )
        ]
    return []


async def _strength_missing_recent(cur: Any, athlete_id: UUID) -> list[QualityIssue]:
    """有过力量训练历史但近 14 天零记录时提示。"""
    await cur.execute(
        """
        SELECT
            count(*) FILTER (WHERE start_time >= now() - interval '14 days') AS recent,
            count(*) AS ever
        FROM activity_compute
        WHERE athlete_id = %s AND sport = 'Workout'
        """,
        (athlete_id,),
    )
    row = await cur.fetchone()
    if row is None or int(row["ever"]) == 0 or int(row["recent"]) > 0:
        return []
    return [
        QualityIssue(
            key="strength_missing_recent",
            severity="info",
            label="近14天无力量训练记录",
            entity_type="strength",
            count=0,
        )
    ]


async def _stream_anomalies(cur: Any, athlete_id: UUID) -> list[QualityIssue]:
    """近 30 天时序流脏数据：心率跳变 / GPS 漂移 / 速度异常。"""
    checks = (
        ("stream_hr_jump_30d", "活动心率流存在异常跳变", hr_jump_activities),
        ("stream_gps_drift_30d", "活动GPS轨迹存在漂移", gps_drift_activities),
        ("stream_speed_outlier_30d", "活动速度流存在异常值", speed_outlier_activities),
    )
    issues = []
    for key, label, check in checks:
        count = await check(cur, athlete_id)
        if count:
            issues.append(
                QualityIssue(
                    key=key,
                    severity="warning",
                    label=f"{count} 条{label}",
                    entity_type="stream",
                    count=count,
                )
            )
    return issues


async def _upload_failures(cur: Any, athlete_id: UUID) -> list[QualityIssue]:
    """近 30 天手动上传批次的失败统计。"""
    await cur.execute(
        """
        SELECT count(*) AS total,
               count(*) FILTER (WHERE status = 'failed' OR errors_count > 0) AS failed
        FROM integration_sync_runs
        WHERE athlete_id = %s AND source = 'manual'
          AND started_at >= now() - interval '30 days'
        """,
        (athlete_id,),
    )
    row = await cur.fetchone()
    if row is None or int(row["total"]) == 0:
        return []
    failed = int(row["failed"])
    if failed == 0:
        return []
    return [
        QualityIssue(
            key="upload_failures_30d",
            severity="warning",
            label=f"近30天 {failed} 个上传批次存在失败文件",
            entity_type="upload",
            count=failed,
        )
    ]
