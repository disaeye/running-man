from __future__ import annotations

from datetime import datetime, time, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import psycopg
import pytest
from httpx import ASGITransport, AsyncClient

from application.computation.queue_worker import run_queued_recompute_once
from infrastructure.auth.models import Athlete
from main import app
from presentation.auth.deps import get_current_athlete

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]

TEST_TIMEZONE = ZoneInfo("America/Los_Angeles")


async def test_manual_activity_is_atomic_and_visible_to_activity_analysis(
    db_conn: psycopg.Connection,
) -> None:
    athlete_id = uuid4()
    goal_day = datetime.now(TEST_TIMEZONE).date() - timedelta(days=1)
    activity_time = datetime.combine(goal_day, time(10), tzinfo=TEST_TIMEZONE)
    athlete = Athlete(athlete_id, f"manual-{athlete_id}@example.com", "hash", timezone=str(TEST_TIMEZONE))
    _seed_athlete(db_conn, athlete)
    _seed_threshold(db_conn, athlete_id, goal_day)
    _seed_calendar_event(db_conn, athlete_id, "wrong-day", activity_time - timedelta(days=1))
    _seed_calendar_event(db_conn, athlete_id, "planned-run", activity_time)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: athlete

    payload = {
        "start_time": activity_time.isoformat(),
        "sport": "Run",
        "distance_m": 10000,
        "duration_s": 3600,
        "avg_hr": 155,
        "max_hr": 170,
        "rpe": 6,
        "name": "补录晨跑",
        "event_id": "wrong-day",
    }
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            before = _manual_activity_count(db_conn, athlete_id)
            rejected = await client.post("/api/v1/activities/manual", json=payload)
            after_rejection = _manual_activity_count(db_conn, athlete_id)
            assert rejected.status_code == 404
            assert after_rejection == before

            payload["event_id"] = "planned-run"
            created = await client.post("/api/v1/activities/manual", json=payload)
            assert created.status_code == 201
            result = created.json()
            assert result["source"] == "manual"
            assert result["event_id"] == "planned-run"
            assert result["recompute_status"] == "queued"
            assert result["recompute_generation"] > 0

            completed = _calendar_event(db_conn, athlete_id, "planned-run")
            assert completed == (True, "completed", result["activity_id"], 10000.0, 3600, 155, 6)

            assert await run_queued_recompute_once(athlete_id)
            listed = await client.get(
                f"/api/v1/activities?from={goal_day.isoformat()}&to={goal_day.isoformat()}"
            )
            assert listed.status_code == 200
            matching = [row for row in listed.json() if row["activity_id"] == result["activity_id"]]
            assert len(matching) == 1
            assert matching[0]["source"] == "manual"
            assert matching[0]["file_type"] == "manual"
            assert matching[0]["tss"] > 0
    finally:
        app.dependency_overrides.pop(get_current_athlete, None)
        _delete_athlete(db_conn, athlete_id)


def _seed_athlete(conn: psycopg.Connection, athlete: Athlete) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO athletes (id, email, password_hash, timezone) VALUES (%s, %s, %s, %s)",
            (athlete.id, athlete.email, athlete.password_hash, athlete.timezone),
        )
    conn.commit()


def _seed_threshold(conn: psycopg.Connection, athlete_id: object, effective_from: object) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO athlete_thresholds (athlete_id, effective_from, lthr) VALUES (%s, %s, 170)",
            (athlete_id, effective_from),
        )
    conn.commit()


def _seed_calendar_event(
    conn: psycopg.Connection, athlete_id: object, event_id: str, start_time: datetime
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO training_calendar "
            "(event_id, athlete_id, start_time, category, sport_type, status, done) "
            "VALUES (%s, %s, %s, 'workout', 'run', 'planned', false)",
            (event_id, athlete_id, start_time),
        )
    conn.commit()


def _manual_activity_count(conn: psycopg.Connection, athlete_id: object) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM activity_summary WHERE athlete_id = %s AND source = 'manual'",
            (athlete_id,),
        )
        return int(cur.fetchone()[0])


def _calendar_event(
    conn: psycopg.Connection, athlete_id: object, event_id: str
) -> tuple[object, ...]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT done, status, linked_activity_id, completed_distance_m, "
            "completed_duration_s, completed_avg_hr, completed_rpe "
            "FROM training_calendar WHERE athlete_id = %s AND event_id = %s",
            (athlete_id, event_id),
        )
        return cur.fetchone()


def _delete_athlete(conn: psycopg.Connection, athlete_id: object) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM athletes WHERE id = %s", (athlete_id,))
    conn.commit()
