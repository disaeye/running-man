from datetime import date
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from application.plan.generator_service import PlanRequest, generate_plan


@pytest.mark.no_db
def _positive_number(value: object, ceiling: float = float("inf")) -> bool:
    """值是正数且不超过上限（缺省只验正数）。"""
    if not isinstance(value, int | float) or isinstance(value, bool):
        return False
    return 0 < value <= ceiling


async def test_generate_plan_dry_run_does_not_write_to_db() -> None:
    athlete_id = uuid4()
    goal_id = uuid4()
    conn = FakeConnection(athlete_id, goal_id)

    result = await generate_plan(
        athlete_id,
        goal_id,
        cast(Any, conn),
        PlanRequest(dry_run=True, today=date(2026, 1, 1)),
    )

    phases_created = cast(int, result["phases_created"])
    events_created = cast(int, result["events_created"])
    events = cast(list[dict[str, object]], result["events"])
    assert phases_created > 0
    assert events_created > 0
    assert result["affected_dates"]
    assert conn.write_queries == []
    assert conn.commits == 0
    assert result["running_history_weeks"] == 4
    assert result["training_paces_available"] is True
    assert len(events) == events_created
    event_dates = [event["date"] for event in events]
    assert len(event_dates) == len(set(event_dates))
    race_events = [event for event in events if event["training_type"] == "race"]
    assert len(race_events) == 1
    assert race_events[0]["date"] == "2026-10-18"
    assert race_events[0]["name"] == "比赛日 · 目标比赛"
    assert race_events[0]["category"] == "workout"
    assert race_events[0]["duration_min"] == 0
    assert race_events[0]["predicted_distance_m"] == 42195
    assert race_events[0]["segments"] == []
    training_events = [event for event in events if event["training_type"] != "race"]
    assert all(_positive_number(event.get("predicted_tss")) for event in training_events)
    assert all(
        isinstance(event.get("predicted_distance_m"), int | float) for event in training_events
    )
    assert all(
        _positive_number(cast(dict[str, object], event["preview"]).get("predicted_tss"))
        for event in training_events
    )
    assert all(
        _positive_number(event.get("duration_min"), ceiling=120) for event in training_events
    )


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
                "race_distance_m": 42195,
                "race_target_time_s": 14400,
                "unit": "s",
            }
        elif "FROM ATHLETES" in normalized:
            self.row = {
                "timezone": "UTC",
                "weekly_training_days": 5,
                "max_session_duration_min": 120,
                "preferred_sport": "Run",
            }
        elif "FROM ACTIVITY_COMPUTE" in normalized:
            self.rows = [
                {"local_day": date(2025, 12, 1), "distance_m": 30000.0},
                {"local_day": date(2025, 12, 8), "distance_m": 35000.0},
                {"local_day": date(2025, 12, 15), "distance_m": 40000.0},
                {"local_day": date(2025, 12, 22), "distance_m": 45000.0},
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
