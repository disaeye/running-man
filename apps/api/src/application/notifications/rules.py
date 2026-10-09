from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Protocol, cast
from uuid import UUID

RECOVERY_RISK_THRESHOLD = 30
PLAN_DEVIATION_THRESHOLD = 0.30
PLAN_DEVIATION_LOOKBACK_DAYS = 7

DEFAULT_NOTIFICATION_PREFS = {
    "today_reminder": True,
    "recovery_risk_alert": True,
    "sync_failure_alert": True,
    "plan_deviation_alert": False,
}

RuleResult = dict[str, object]
RuleChecker = Callable[[UUID, "AsyncDbConnection", date | None], Awaitable[RuleResult | None]]


class AsyncDbCursor(Protocol):
    async def __aenter__(self) -> "AsyncDbCursor": ...
    async def __aexit__(self, *_args: object) -> None: ...
    async def execute(self, query: str, params: tuple[object, ...] = ()) -> object: ...
    async def fetchone(self) -> Mapping[str, object] | None: ...
    async def fetchall(self) -> list[Mapping[str, object]]: ...


class AsyncDbConnection(Protocol):
    def cursor(self) -> AsyncDbCursor: ...


@dataclass(frozen=True)
class NotificationPayload:
    rule_type: str
    title: str
    body: str
    severity: str


async def check_recovery_risk(
    athlete_id: UUID, conn: AsyncDbConnection, target_day: date | None = None
) -> RuleResult | None:
    day = target_day or date.today()
    if not await _pref_enabled(conn, athlete_id, "recovery_risk_alert"):
        return None
    score = await _latest_readiness_score(conn, athlete_id, day)
    if score is None or score >= RECOVERY_RISK_THRESHOLD:
        return None
    payload = NotificationPayload(
        "recovery_risk",
        "恢复风险警告",
        f"今日 readiness {score}，低于 {RECOVERY_RISK_THRESHOLD}，建议优先恢复。",
        "warning",
    )
    return await _fire_once_per_day(conn, athlete_id, payload, day)


async def check_sync_failure(
    athlete_id: UUID, conn: AsyncDbConnection, target_day: date | None = None
) -> RuleResult | None:
    day = target_day or date.today()
    if not await _pref_enabled(conn, athlete_id, "sync_failure_alert"):
        return None
    failed = await _latest_failed_sync(conn, athlete_id)
    if failed is None:
        return None
    source = str(failed.get("source") or "数据源")
    error = failed.get("last_sync_error")
    body = f"{source} 最近一次同步失败。"
    if error:
        body += f"错误：{error}"
    payload = NotificationPayload("sync_failure", "同步失败提醒", body, "warning")
    return await _fire_once_per_day(conn, athlete_id, payload, day)


async def check_plan_deviation(
    athlete_id: UUID, conn: AsyncDbConnection, target_day: date | None = None
) -> RuleResult | None:
    day = target_day or date.today()
    if not await _pref_enabled(conn, athlete_id, "plan_deviation_alert"):
        return None
    start = day - timedelta(days=PLAN_DEVIATION_LOOKBACK_DAYS - 1)
    planned = await _planned_tss(conn, athlete_id, start, day)
    if planned <= 0:
        return None
    actual = await _actual_tss(conn, athlete_id, start, day)
    deviation = abs(actual - planned) / planned
    if deviation <= PLAN_DEVIATION_THRESHOLD:
        return None
    pct = round(deviation * 100)
    payload = NotificationPayload(
        "plan_deviation",
        "计划偏差提醒",
        f"过去7天实际 TSS {actual:.0f}，计划 {planned:.0f}，偏差 {pct}%。",
        "warning",
    )
    return await _fire_once_per_day(conn, athlete_id, payload, day)


async def check_today_reminder(
    athlete_id: UUID, conn: AsyncDbConnection, target_day: date | None = None
) -> RuleResult | None:
    day = target_day or date.today()
    if not await _pref_enabled(conn, athlete_id, "today_reminder"):
        return None
    event = await _today_unfinished_event(conn, athlete_id, day)
    if event is None:
        return None
    name = str(event.get("name") or "今日训练")
    tss = event.get("predicted_tss")
    body = f"今天有计划训练：{name}。"
    if tss is not None:
        body += f"预计 TSS {_float(tss):.0f}。"
    payload = NotificationPayload("today_reminder", "今日训练提醒", body, "info")
    return await _fire_once_per_day(conn, athlete_id, payload, day)


RULE_CHECKS: tuple[RuleChecker, ...] = (
    check_recovery_risk,
    check_sync_failure,
    check_plan_deviation,
    check_today_reminder,
)


async def _pref_enabled(conn: AsyncDbConnection, athlete_id: UUID, key: str) -> bool:
    async with conn.cursor() as cur:
        _ = await cur.execute(
            "SELECT notification_prefs FROM athletes WHERE id = %s", (athlete_id,)
        )
        row = await cur.fetchone()
    prefs = dict(DEFAULT_NOTIFICATION_PREFS)
    if row and row.get("notification_prefs"):
        prefs.update(cast(Mapping[str, bool], row["notification_prefs"]))
    return bool(prefs.get(key, False))


async def _latest_readiness_score(
    conn: AsyncDbConnection, athlete_id: UUID, day: date
) -> int | None:
    async with conn.cursor() as cur:
        query = "SELECT readiness FROM health_wellness WHERE athlete_id = %s AND day <= %s AND readiness IS NOT NULL ORDER BY day DESC LIMIT 1"
        _ = await cur.execute(query, (athlete_id, day))
        row = await cur.fetchone()
    return _int(row.get("readiness")) if row else None


async def _latest_failed_sync(
    conn: AsyncDbConnection, athlete_id: UUID
) -> dict[str, object] | None:
    async with conn.cursor() as cur:
        query = "SELECT source, last_sync_status, last_sync_error, last_sync_at FROM user_integrations WHERE athlete_id = %s AND connected = true ORDER BY last_sync_at DESC NULLS LAST, updated_at DESC NULLS LAST LIMIT 1"
        _ = await cur.execute(query, (athlete_id,))
        row = await cur.fetchone()
    if row and row.get("last_sync_status") == "failed":
        return dict(row)
    return None


async def _planned_tss(conn: AsyncDbConnection, athlete_id: UUID, start: date, end: date) -> float:
    start_dt = datetime.combine(start, time.min, tzinfo=UTC)
    end_dt = datetime.combine(end + timedelta(days=1), time.min, tzinfo=UTC)
    async with conn.cursor() as cur:
        query = "SELECT COALESCE(SUM(predicted_tss), 0) AS tss FROM training_calendar WHERE athlete_id = %s AND start_time >= %s AND start_time < %s AND status <> 'deleted'"
        _ = await cur.execute(query, (athlete_id, start_dt, end_dt))
        row = await cur.fetchone()
    return _float(row.get("tss") if row else None)


async def _actual_tss(conn: AsyncDbConnection, athlete_id: UUID, start: date, end: date) -> float:
    async with conn.cursor() as cur:
        query = """
        SELECT COALESCE(SUM(value), 0) AS tss
        FROM current_daily_facts
        WHERE athlete_id = %s AND day BETWEEN %s AND %s
          AND sport IS NULL AND metric_key = 'daily_tss'
        """
        _ = await cur.execute(query, (athlete_id, start, end))
        row = await cur.fetchone()
    return _float(row.get("tss") if row else None)


async def _today_unfinished_event(
    conn: AsyncDbConnection, athlete_id: UUID, day: date
) -> dict[str, object] | None:
    start_dt = datetime.combine(day, time.min, tzinfo=UTC)
    end_dt = datetime.combine(day + timedelta(days=1), time.min, tzinfo=UTC)
    async with conn.cursor() as cur:
        query = "SELECT event_id, name, predicted_tss FROM training_calendar WHERE athlete_id = %s AND start_time >= %s AND start_time < %s AND status <> 'deleted' AND done = false ORDER BY start_time LIMIT 1"
        _ = await cur.execute(query, (athlete_id, start_dt, end_dt))
        row = await cur.fetchone()
    return dict(row) if row else None


async def _fire_once_per_day(
    conn: AsyncDbConnection, athlete_id: UUID, payload: NotificationPayload, day: date
) -> RuleResult | None:
    if await _already_fired_today(conn, athlete_id, payload.rule_type, day):
        return None
    async with conn.cursor() as cur:
        query = "INSERT INTO notifications (athlete_id, type, title, body, severity) VALUES (%s, %s, %s, %s, %s) RETURNING id, athlete_id, type, title, body, severity, read, created_at"
        _ = await cur.execute(
            query, (athlete_id, payload.rule_type, payload.title, payload.body, payload.severity)
        )
        notification = await cur.fetchone()
        query = "INSERT INTO notification_rules (athlete_id, rule_type, enabled, last_fired_at, config) VALUES (%s, %s, true, now(), '{}'::jsonb)"
        _ = await cur.execute(query, (athlete_id, payload.rule_type))
    return dict(notification) if notification else None


async def _already_fired_today(
    conn: AsyncDbConnection, athlete_id: UUID, rule_type: str, day: date
) -> bool:
    async with conn.cursor() as cur:
        query = "SELECT 1 FROM notification_rules WHERE athlete_id = %s AND rule_type = %s AND last_fired_at >= %s AND last_fired_at < %s LIMIT 1"
        _ = await cur.execute(
            query,
            (
                athlete_id,
                rule_type,
                datetime.combine(day, time.min, tzinfo=UTC),
                datetime.combine(day + timedelta(days=1), time.min, tzinfo=UTC),
            ),
        )
        row = await cur.fetchone()
    return row is not None


def _int(value: object) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, float | Decimal | str):
        return int(value)
    return None


def _float(value: object) -> float:
    return float(value) if isinstance(value, int | float | Decimal | str) else 0.0
