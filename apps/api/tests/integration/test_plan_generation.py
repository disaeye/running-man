from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import psycopg
import pytest
from httpx import ASGITransport, AsyncClient

from infrastructure.auth.models import Athlete
from main import app
from presentation.auth.deps import get_current_athlete
from tests.integration.plan_generation_helpers import (
    active_generated_count,
    calendar_row,
    calendar_status,
    count,
    count_future_phases,
    delete_athlete,
    phase_name_count,
    phase_row,
    race_row,
    seed_athlete,
    seed_existing_events,
    seed_existing_phases,
    seed_goal,
    seed_phase,
)

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]


async def test_plan_preview_generation_and_regeneration_preserve_athlete_data(
    db_conn: psycopg.Connection,
) -> None:
    athlete_id = uuid4()
    goal_id = uuid4()
    today = datetime.now(UTC).date()
    race_date = today + timedelta(days=56)
    athlete = Athlete(athlete_id, f"plan-{athlete_id}@example.com", "hash", timezone="UTC")
    other_athlete_id = uuid4()
    other_goal_id = uuid4()
    other_athlete_goal_id = uuid4()
    seed_athlete(db_conn, athlete)
    seed_athlete(
        db_conn,
        Athlete(other_athlete_id, f"other-{other_athlete_id}@example.com", "hash", timezone="UTC"),
    )
    seed_goal(db_conn, athlete_id, goal_id, race_date)
    seed_goal(db_conn, athlete_id, other_goal_id, race_date)
    seed_goal(db_conn, other_athlete_id, other_athlete_goal_id, race_date)
    seed_phase(db_conn, athlete_id, other_goal_id, "other-goal", today - timedelta(days=2))
    seed_phase(db_conn, other_athlete_id, other_athlete_goal_id, "other-athlete", today + timedelta(days=2))
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: athlete

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            preview = await _preview_plan(client, goal_id)
            race_events = [event for event in preview["events"] if event["training_type"] == "race"]
            assert len(race_events) == 1
            assert race_events[0]["date"] == race_date.isoformat()
            seed_existing_events(db_conn, athlete_id, goal_id, today, preview["events"])
            seed_existing_phases(db_conn, athlete_id, goal_id, today)

            generated = await _generate_plan(client, goal_id)
            _assert_replacement_state(db_conn, athlete_id, goal_id, other_athlete_id, other_goal_id, today, preview, generated)
            race_event_id = str(race_events[0]["event_id"])
            assert race_row(db_conn, athlete_id, race_event_id) == (
                "workout",
                "race",
                "比赛日 · 目标比赛",
                race_date,
            )
            calendar = await client.get(
                "/api/v1/calendar",
                params={
                    "from": f"{race_date.isoformat()}T00:00:00+00:00",
                    "to": f"{race_date.isoformat()}T23:59:59+00:00",
                },
            )
            assert calendar.status_code == 200
            race_calendar_events = [
                event for event in calendar.json() if event["event_id"] == race_event_id
            ]
            assert len(race_calendar_events) == 1
            assert race_calendar_events[0]["category"] == "workout"
            assert race_calendar_events[0]["training_type"] == "race"
            assert race_calendar_events[0]["name"] == "比赛日 · 目标比赛"
            assert race_calendar_events[0]["predicted_tss"] == 0.0
            active_count = active_generated_count(db_conn, athlete_id, goal_id)

            regenerated = await _generate_plan(client, goal_id)
            assert regenerated["events_created"] == len(preview["events"]) - 2
            assert active_generated_count(db_conn, athlete_id, goal_id) == active_count
            assert calendar_status(db_conn, athlete_id, "stale-plan") == "deleted"
            assert calendar_row(db_conn, athlete_id, str(preview["events"][1]["event_id"]))[2:] == (
                "manual", True, "运动员调整的训练"
            )
            assert calendar_row(db_conn, athlete_id, str(preview["events"][2]["event_id"]))[0:3] == (
                "completed", True, "generator"
            )
            assert count_future_phases(db_conn, athlete_id, goal_id, today) == len(preview["phases"])
    finally:
        app.dependency_overrides.pop(get_current_athlete, None)
        delete_athlete(db_conn, athlete_id)
        delete_athlete(db_conn, other_athlete_id)

async def _preview_plan(client: AsyncClient, goal_id: object) -> dict[str, object]:
    response = await client.post(
        "/api/v1/plan/generate?dry_run=true",
        json={"goal_id": str(goal_id), "weekly_tss": 280},
    )
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["events"]
    assert any(event["pace_min_s_km"] is not None for event in preview["events"])
    return preview


async def _generate_plan(client: AsyncClient, goal_id: object) -> dict[str, object]:
    response = await client.post(
        "/api/v1/plan/generate", json={"goal_id": str(goal_id), "weekly_tss": 280}
    )
    assert response.status_code == 200, response.text
    return response.json()


def _assert_replacement_state(
    conn: psycopg.Connection,
    athlete_id: object,
    goal_id: object,
    other_athlete_id: object,
    other_goal_id: object,
    today: date,
    preview: dict[str, object],
    generated: dict[str, object],
) -> None:
    events = preview["events"]
    assert generated["events_created"] == len(events) - 2
    assert calendar_status(conn, athlete_id, "stale-plan") == "deleted"
    assert calendar_status(conn, athlete_id, "past-generated") == "planned"
    assert count(conn, "training_calendar", athlete_id) == len(events) + 2
    assert calendar_row(conn, athlete_id, str(events[0]["event_id"]))[0:3] == (
        "planned", False, "generator"
    )
    assert calendar_row(conn, athlete_id, str(events[1]["event_id"])) == (
        "planned", False, "manual", True, "运动员调整的训练"
    )
    assert calendar_row(conn, athlete_id, str(events[2]["event_id"]))[0:3] == (
        "completed", True, "generator"
    )
    assert phase_row(conn, athlete_id, goal_id, "past-phase") == (
        today - timedelta(days=30), today - timedelta(days=10)
    )
    assert phase_row(conn, athlete_id, goal_id, "current-phase") == (
        today - timedelta(days=7), today - timedelta(days=1)
    )
    assert phase_row(conn, athlete_id, goal_id, "future-phase") is None
    assert phase_row(conn, athlete_id, other_goal_id, "other-goal") == (
        today - timedelta(days=2), today + timedelta(days=12)
    )
    assert phase_name_count(conn, other_athlete_id, "other-athlete") == 1
    assert count_future_phases(conn, athlete_id, goal_id, today) == len(preview["phases"])
