from datetime import date
from uuid import UUID, uuid4

import pytest

from application.plan.generator_service import generate_plan


@pytest.mark.no_db
async def test_generate_plan_dry_run_does_not_write_to_db() -> None:
    athlete_id = uuid4()
    goal_id = uuid4()
    conn = FakeConnection(athlete_id, goal_id)

    result = await generate_plan(athlete_id, goal_id, conn, dry_run=True)

    assert result["phases_created"] > 0
    assert result["events_created"] > 0
    assert result["affected_dates"]
    assert conn.write_queries == []
    assert conn.commits == 0
    assert result["training_load_available"] is True
    assert result["training_paces_available"] is False
    assert len(result["events"]) == result["events_created"]
    event_dates = [event["date"] for event in result["events"]]
    assert len(event_dates) == len(set(event_dates))
    race_events = [event for event in result["events"] if event["training_type"] == "race"]
    assert len(race_events) == 1
    assert race_events[0]["date"] == "2026-10-18"
    assert race_events[0]["name"] == "比赛日 · 目标比赛"
    assert race_events[0]["category"] == "workout"
    assert race_events[0]["duration_min"] == 0
    assert race_events[0]["predicted_tss"] == 0.0
    assert race_events[0]["segments"] == []


class FakeConnection:
    def __init__(self, athlete_id: UUID, goal_id: UUID) -> None:
        self.athlete_id = athlete_id
        self.goal_id = goal_id
        self.write_queries: list[str] = []
        self.commits = 0

    def cursor(self) -> "FakeCursor":
        return FakeCursor(self)

    async def commit(self) -> None:
        self.commits += 1


class FakeCursor:
    def __init__(self, conn: FakeConnection) -> None:
        self.conn = conn
        self.row: dict[str, object] | None = None
        self.rows: list[dict[str, object]] = []

    async def __aenter__(self) -> "FakeCursor":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def execute(self, query: str, _params: tuple[object, ...]) -> None:
        normalized = query.strip().upper()
        if normalized.startswith(("INSERT", "DELETE", "UPDATE")):
            self.conn.write_queries.append(query)
        if "FROM GOALS" in normalized:
            self.row = {
                "goal_id": self.conn.goal_id,
                "athlete_id": self.conn.athlete_id,
                "type": "event",
                "title": "目标比赛",
                "target_date": date(2026, 10, 18),
            }
        elif "FROM ATHLETES" in normalized:
            self.row = {
                "timezone": "UTC",
                "weekly_training_days": 5,
                "max_session_duration_min": 120,
            }
        elif "FROM CURRENT_DAILY_FACTS" in normalized:
            self.rows = [
                {"day": date(2026, 1, 1), "value": 42.0, "metric_key": "ctl"},
                {"day": date(2026, 1, 1), "value": 50.0, "metric_key": "atl"},
            ]
        elif "FROM ATHLETE_THRESHOLDS" in normalized:
            self.row = None
            self.rows = []
        else:
            self.row = None
            self.rows = []

    async def fetchone(self) -> dict[str, object] | None:
        return self.row

    async def fetchall(self) -> list[dict[str, object]]:
        return self.rows
