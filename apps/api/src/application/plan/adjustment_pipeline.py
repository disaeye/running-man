"""课表调整建议的自动检测：活动与健康数据变化后，为未来 48 小时的跑步课生成待确认建议。

建议只是提案：日历上的处方保持原样，直到运动员在目标页确认。
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Final
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from domain.insights.load_adjustment import detect_adjustment
from domain.time import today_in_zone
from infrastructure.db.pool import get_pool, open_pool
from infrastructure.repositories.plan_adjustments import PlanAdjustmentRepo
from presentation.api.plan_adjustment_inputs import detection_inputs
from presentation.api.plan_adjustment_rules import scaled_prescription

# 只看未来两天内的课：更远的课离执行还远，等更近的读数更可靠。
LOOKAHEAD: Final = timedelta(hours=48)
# 单次检测最多处理的课数，保证查询有界。
MAX_EVENTS: Final = 7

_FUTURE_EVENTS_SQL = """
SELECT event_id, workout_prescription
FROM training_calendar
WHERE athlete_id = %s
  AND status = 'planned'
  AND done = false
  AND training_type IN ('easy', 'recovery', 'long', 'tempo', 'intervals')
  AND start_time BETWEEN %s AND %s
ORDER BY start_time
LIMIT %s
"""

_ATHLETE_TIMEZONE_SQL = "SELECT timezone FROM athletes WHERE id = %s"


async def maybe_detect_adjustments(athlete_id: UUID) -> int:
    """为符合条件的未来课生成调整建议，返回新建的建议数。

    挂在活动计算链末尾：同步、手动录入与补算完成后都会经过这里。
    """
    await open_pool()
    async with get_pool().connection() as conn:
        timezone = await _athlete_timezone(conn, athlete_id)
        inputs = await detection_inputs(conn, athlete_id, today_in_zone(timezone))
        if inputs.hrv_today is None and inputs.hr_drift_bpm is None:
            return 0
        rows = await _future_events(conn, athlete_id)
        if not rows:
            return 0
        repo = PlanAdjustmentRepo()
        created = 0
        for row in rows:
            event_id = str(row["event_id"])
            if await repo.latest_pending_for_event(athlete_id, event_id) is not None:
                continue
            adjustment = detect_adjustment(
                event_id=event_id,
                hrv_today=inputs.hrv_today,
                hrv_baseline=inputs.hrv_baseline,
                hr_drift_bpm=inputs.hr_drift_bpm,
                long_run_seconds=inputs.long_run_seconds,
            )
            if adjustment is None:
                continue
            original = row.get("workout_prescription")
            original_dict = original if isinstance(original, dict) else None
            adjusted = scaled_prescription(original_dict, adjustment.reduction_pct)
            summary = "；".join(trigger.detail for trigger in adjustment.triggers)
            await repo.insert(
                athlete_id,
                event_id,
                ",".join(trigger.key for trigger in adjustment.triggers),
                summary,
                original_dict,
                adjusted,
                -adjustment.reduction_pct,
            )
            created += 1
    return created


async def _athlete_timezone(conn: AsyncConnection[DictRow], athlete_id: UUID) -> str | None:
    async with conn.cursor() as cur:
        _ = await cur.execute(_ATHLETE_TIMEZONE_SQL, (athlete_id,))
        row = await cur.fetchone()
    if row is None:
        return None
    timezone = row.get("timezone")
    return timezone if isinstance(timezone, str) else None


async def _future_events(
    conn: AsyncConnection[DictRow], athlete_id: UUID
) -> list[dict[str, object]]:
    now = datetime.now(UTC)
    async with conn.cursor() as cur:
        _ = await cur.execute(_FUTURE_EVENTS_SQL, (athlete_id, now, now + LOOKAHEAD, MAX_EVENTS))
        rows = await cur.fetchall()
    return [dict(row) for row in rows]
