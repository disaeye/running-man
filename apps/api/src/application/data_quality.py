from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from application.data_quality_models import (
    PHYSIOLOGY_STALE_DAYS,
    RUN_MISSING_GPS_INFO_COUNT,
    SYNC_ERROR_HOURS,
    SYNC_WARNING_HOURS,
    WELLNESS_WARNING_DAYS,
    QualityIssue,
    never_synced_issue,
)
from application.data_quality_rules import (
    _hrv_missing_recent,
    _stream_anomalies,
    _strength_missing_recent,
    _upload_failures,
)


async def compute_data_quality(
    athlete_id: UUID, db_pool_or_conn: Any, *, now: datetime | None = None
) -> dict[str, object]:
    checked_at = now or datetime.now(UTC)
    connection_factory = getattr(db_pool_or_conn, "connection", None)
    if callable(connection_factory):
        async with connection_factory() as conn, conn.cursor() as cur:
            return await _run_rules(cur, athlete_id, checked_at)

    async with db_pool_or_conn.cursor() as cur:
        return await _run_rules(cur, athlete_id, checked_at)


async def _sync_freshness(cur: Any, athlete_id: UUID, now: datetime) -> list[QualityIssue]:
    await cur.execute(
        "SELECT source, last_sync_at FROM user_integrations "
        "WHERE athlete_id = %s AND source = 'intervals_icu'",
        (athlete_id,),
    )
    row = await cur.fetchone()
    if row is None:
        return [never_synced_issue()]
    last_sync_at = row["last_sync_at"]
    if last_sync_at is None:
        return [never_synced_issue()]

    hours = (now - last_sync_at).total_seconds() / 3600
    if hours >= SYNC_ERROR_HOURS:
        return [
            QualityIssue(
                key="sync_freshness",
                severity="error",
                label="超过72小时未同步",
                entity_type="intervals_icu",
            )
        ]
    if hours >= SYNC_WARNING_HOURS:
        return [
            QualityIssue(
                key="sync_freshness",
                severity="warning",
                label="超过24小时未同步",
                entity_type="intervals_icu",
            )
        ]
    return []


async def _activity_missing_hr_90d(cur: Any, athlete_id: UUID) -> list[QualityIssue]:
    await cur.execute(
        "SELECT count(*) AS cnt FROM activity_compute "
        "WHERE athlete_id = %s "
        "AND start_time >= CURRENT_DATE - INTERVAL '90 days' "
        "AND avg_hr IS NULL",
        (athlete_id,),
    )
    row = await cur.fetchone()
    count = int(row["cnt"]) if row else 0
    if count > 0:
        return [
            QualityIssue(
                key="activity_missing_hr_90d",
                severity="warning",
                label=f"{count} 条活动缺少心率数据",
                entity_type="activity",
                count=count,
            )
        ]
    return []


async def _run_missing_gps_90d(cur: Any, athlete_id: UUID) -> list[QualityIssue]:
    await cur.execute(
        "SELECT count(*) AS cnt FROM activity_compute "
        "WHERE athlete_id = %s "
        "AND start_time >= CURRENT_DATE - INTERVAL '90 days' "
        "AND sport = 'Run' AND has_gps = FALSE",
        (athlete_id,),
    )
    row = await cur.fetchone()
    count = int(row["cnt"]) if row else 0
    if count > RUN_MISSING_GPS_INFO_COUNT:
        return [
            QualityIssue(
                key="run_missing_gps_90d",
                severity="info",
                label=f"{count} 条跑步活动缺少GPS轨迹",
                entity_type="activity",
                count=count,
            )
        ]
    return []


async def _ride_missing_power_90d(cur: Any, athlete_id: UUID) -> list[QualityIssue]:
    await cur.execute(
        "SELECT count(*) AS cnt FROM activity_compute "
        "WHERE athlete_id = %s "
        "AND start_time >= CURRENT_DATE - INTERVAL '90 days' "
        "AND (sport = 'Ride' OR sport = 'VirtualRide') "
        "AND avg_power IS NULL",
        (athlete_id,),
    )
    row = await cur.fetchone()
    count = int(row["cnt"]) if row else 0
    if count > 0:
        return [
            QualityIssue(
                key="ride_missing_power_90d",
                severity="warning",
                label=f"{count} 条骑行活动缺少功率数据",
                entity_type="activity",
                count=count,
            )
        ]
    return []


async def _wellness_missing_recent(cur: Any, athlete_id: UUID) -> list[QualityIssue]:
    await cur.execute(
        "SELECT count(*) AS cnt FROM health_wellness "
        "WHERE athlete_id = %s "
        "AND day >= CURRENT_DATE - INTERVAL '7 days'",
        (athlete_id,),
    )
    row = await cur.fetchone()
    count = int(row["cnt"]) if row else 0
    if count < WELLNESS_WARNING_DAYS:
        return [
            QualityIssue(
                key="wellness_missing_recent",
                severity="warning",
                label=f"近7天仅有 {count} 天健康数据",
                entity_type="wellness",
                count=count,
            )
        ]
    return []


async def _load_stale(cur: Any, athlete_id: UUID) -> list[QualityIssue]:
    tz = await _athlete_timezone(cur, athlete_id)
    await cur.execute(
        """
        SELECT max(day) AS load_day
        FROM current_daily_facts
        WHERE athlete_id = %s AND sport IS NULL AND metric_key = 'daily_tss'
        """,
        (athlete_id,),
    )
    load_row = await cur.fetchone()
    await cur.execute(
        """
        SELECT max((start_time AT TIME ZONE %s)::date) AS activity_day
        FROM activity_compute WHERE athlete_id = %s
        """,
        (tz, athlete_id),
    )
    activity_row = await cur.fetchone()
    load_day = load_row["load_day"] if load_row else None
    activity_day = activity_row["activity_day"] if activity_row else None
    if load_day is not None and activity_day is not None and load_day < activity_day:
        return [
            QualityIssue(
                key="load_stale",
                severity="warning",
                label=f"训练负荷滞后于最新活动 ({load_day} vs {activity_day})",
                entity_type="training_load",
            )
        ]
    return []


async def _athlete_timezone(cur: Any, athlete_id: UUID) -> str:
    await cur.execute("SELECT timezone FROM athletes WHERE id = %s", (athlete_id,))
    row = await cur.fetchone()
    raw = row["timezone"] if row else None
    if raw is None:
        return "UTC"
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode()
    return str(raw) or "UTC"


async def _physiology_stale(cur: Any, athlete_id: UUID, now: datetime) -> list[QualityIssue]:
    await cur.execute(
        "SELECT physiology_updated_at FROM athletes WHERE id = %s",
        (athlete_id,),
    )
    row = await cur.fetchone()
    if row is None or row["physiology_updated_at"] is None:
        return [
            QualityIssue(
                key="physiology_stale",
                severity="info",
                label="尚未估算生理指标",
                entity_type="physiology",
            )
        ]
    delta = now - row["physiology_updated_at"]
    if delta.days > PHYSIOLOGY_STALE_DAYS:
        return [
            QualityIssue(
                key="physiology_stale",
                severity="info",
                label="生理指标已过期",
                entity_type="physiology",
            )
        ]
    return []


async def _run_rules(cur: Any, athlete_id: UUID, now: datetime) -> dict[str, object]:
    all_issues = [
        *await _sync_freshness(cur, athlete_id, now),
        *await _activity_missing_hr_90d(cur, athlete_id),
        *await _run_missing_gps_90d(cur, athlete_id),
        *await _ride_missing_power_90d(cur, athlete_id),
        *await _wellness_missing_recent(cur, athlete_id),
        *await _hrv_missing_recent(cur, athlete_id),
        *await _strength_missing_recent(cur, athlete_id),
        *await _stream_anomalies(cur, athlete_id),
        *await _upload_failures(cur, athlete_id),
        *await _load_stale(cur, athlete_id),
        *await _physiology_stale(cur, athlete_id, now),
    ]

    status = _summary_status(all_issues)
    return {
        "summary": {
            "status": status,
            "issue_count": len(all_issues),
            "last_checked_at": now.isoformat(),
        },
        "issues": [
            {
                "key": issue.key,
                "severity": issue.severity,
                "label": issue.label,
                "entity_type": issue.entity_type,
                "count": issue.count,
            }
            for issue in all_issues
        ],
    }


def _summary_status(issues: list[QualityIssue]) -> str:
    if any(issue.severity == "error" for issue in issues):
        return "error"
    if any(issue.severity == "warning" for issue in issues):
        return "warning"
    return "ok"
