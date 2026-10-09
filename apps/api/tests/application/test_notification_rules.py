from collections.abc import Mapping
from datetime import UTC, date, datetime, timedelta
from typing import cast
from uuid import UUID, uuid4

import pytest

from application.notifications import rules

pytestmark = pytest.mark.asyncio

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000001")
TARGET_DAY = date(2026, 6, 23)


async def test_recovery_risk_rule_fires_for_low_readiness() -> None:
    conn = FakeConnection(readiness=20)

    result = await rules.check_recovery_risk(ATHLETE_ID, conn, TARGET_DAY)

    assert result is not None
    assert result["type"] == "recovery_risk"
    assert result["severity"] == "warning"
    assert len(conn.notifications) == 1
    assert len(conn.rule_fires) == 1


async def test_recovery_risk_rule_is_idempotent_for_same_day() -> None:
    conn = FakeConnection(readiness=20)
    conn.rule_fires.append((ATHLETE_ID, "recovery_risk", _at_noon(TARGET_DAY)))

    result = await rules.check_recovery_risk(ATHLETE_ID, conn, TARGET_DAY)

    assert result is None
    assert conn.notifications == []


async def test_recovery_risk_rule_respects_disabled_preference() -> None:
    conn = FakeConnection(readiness=20, prefs={"recovery_risk_alert": False})

    result = await rules.check_recovery_risk(ATHLETE_ID, conn, TARGET_DAY)

    assert result is None
    assert conn.notifications == []


async def test_sync_failure_rule_fires_for_failed_latest_sync() -> None:
    conn = FakeConnection(sync_status="failed", sync_error="401")

    result = await rules.check_sync_failure(ATHLETE_ID, conn, TARGET_DAY)

    assert result is not None
    assert result["type"] == "sync_failure"
    assert "401" in str(result["body"])


async def test_plan_deviation_rule_fires_above_threshold() -> None:
    conn = FakeConnection(
        prefs={"plan_deviation_alert": True},
        planned_tss=100.0,
        actual_tss=140.0,
    )

    result = await rules.check_plan_deviation(ATHLETE_ID, conn, TARGET_DAY)

    assert result is not None
    assert result["type"] == "plan_deviation"
    assert "40%" in str(result["body"])


async def test_today_reminder_rule_fires_for_unfinished_event() -> None:
    conn = FakeConnection(today_event={"event_id": "e1", "name": "Easy Run", "predicted_tss": 45.0})

    result = await rules.check_today_reminder(ATHLETE_ID, conn, TARGET_DAY)

    assert result is not None
    assert result["type"] == "today_reminder"
    assert result["severity"] == "info"


class FakeConnection:
    def __init__(
        self,
        readiness: int | None = None,
        prefs: dict[str, bool] | None = None,
        sync_status: str | None = None,
        sync_error: str | None = None,
        planned_tss: float = 0.0,
        actual_tss: float = 0.0,
        today_event: dict[str, object] | None = None,
    ) -> None:
        self.prefs: dict[str, bool] | None = prefs
        self.readiness: int | None = readiness
        self.sync_status: str | None = sync_status
        self.sync_error: str | None = sync_error
        self.planned_tss: float = planned_tss
        self.actual_tss: float = actual_tss
        self.today_event: dict[str, object] | None = today_event
        self.notifications: list[dict[str, object]] = []
        self.rule_fires: list[tuple[UUID, str, datetime]] = []

    def cursor(self) -> "FakeCursor":
        return FakeCursor(self)


class FakeCursor:
    def __init__(self, conn: FakeConnection) -> None:
        self.conn: FakeConnection = conn
        self.row: dict[str, object] | None = None

    async def __aenter__(self) -> "FakeCursor":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def execute(self, query: str, params: tuple[object, ...] = ()) -> object:
        if "SELECT notification_prefs" in query:
            self.row = {"notification_prefs": self.conn.prefs}
        elif "SELECT readiness" in query:
            self.row = (
                {"readiness": self.conn.readiness} if self.conn.readiness is not None else None
            )
        elif "FROM user_integrations" in query:
            self.row = self._integration_row()
        elif "SUM(predicted_tss)" in query:
            self.row = {"tss": self.conn.planned_tss}
        elif "FROM current_daily_facts" in query:
            self.row = {"tss": self.conn.actual_tss}
        elif "SELECT event_id" in query:
            self.row = self.conn.today_event
        elif "SELECT 1 FROM notification_rules" in query:
            athlete_id, rule_type, start, end = params
            self.row = self._matching_fire(athlete_id, rule_type, start, end)
        elif query.startswith("INSERT INTO notifications"):
            self.row = self._insert_notification(params)
        elif query.startswith("INSERT INTO notification_rules"):
            self.conn.rule_fires.append(
                (cast(UUID, params[0]), cast(str, params[1]), _at_noon(TARGET_DAY))
            )
            self.row = None
        return None

    async def fetchone(self) -> Mapping[str, object] | None:
        return self.row

    async def fetchall(self) -> list[Mapping[str, object]]:
        return []

    def _integration_row(self) -> dict[str, object] | None:
        if self.conn.sync_status is None:
            return None
        return {
            "source": "intervals_icu",
            "last_sync_status": self.conn.sync_status,
            "last_sync_error": self.conn.sync_error,
            "last_sync_at": _at_noon(TARGET_DAY),
        }

    def _matching_fire(
        self, athlete_id: object, rule_type: object, start: object, end: object
    ) -> dict[str, object] | None:
        start_dt = cast(datetime, start)
        end_dt = cast(datetime, end)
        for fired_athlete, fired_rule, fired_at in self.conn.rule_fires:
            if (
                fired_athlete == athlete_id
                and fired_rule == rule_type
                and start_dt <= fired_at < end_dt
            ):
                return {"exists": 1}
        return None

    def _insert_notification(self, params: tuple[object, ...]) -> dict[str, object]:
        notification = {
            "id": uuid4(),
            "athlete_id": params[0],
            "type": params[1],
            "title": params[2],
            "body": params[3],
            "severity": params[4],
            "read": False,
            "created_at": _at_noon(TARGET_DAY),
        }
        self.conn.notifications.append(notification)
        return notification


def _at_noon(day: date) -> datetime:
    return datetime.combine(day, datetime.min.time(), tzinfo=UTC) + timedelta(hours=12)
