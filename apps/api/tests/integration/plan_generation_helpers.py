from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

import psycopg

from infrastructure.auth.models import Athlete


def seed_athlete(conn: psycopg.Connection, athlete: Athlete) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO athletes (id, email, password_hash, timezone) VALUES (%s, %s, %s, %s)",
            (athlete.id, athlete.email, athlete.password_hash, athlete.timezone),
        )
    conn.commit()


def seed_goal(conn: psycopg.Connection, athlete_id: UUID, goal_id: UUID, race_date: date) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO goals (goal_id, athlete_id, type, title, target_date, "
            "race_distance_m, race_target_time_s) "
            "VALUES (%s, %s, 'event', '目标比赛', %s, 42195, 14400)",
            (goal_id, athlete_id, race_date),
        )
    conn.commit()


def seed_existing_events(
    conn: psycopg.Connection,
    athlete_id: UUID,
    goal_id: UUID,
    today: date,
    preview_events: list[dict[str, object]],
) -> None:
    training_events = [event for event in preview_events if event["training_type"] != "race"]
    with conn.cursor() as cur:
        for index, event in enumerate(training_events[:3]):
            event_id = str(event["event_id"])
            status = "completed" if index == 2 else "planned"
            done = index == 2
            source = "manual" if index == 1 else "generator"
            edited = index == 1
            name = "运动员调整的训练" if edited else str(event["name"])
            cur.execute(
                "INSERT INTO training_calendar "
                "(event_id, athlete_id, start_time, category, sport_type, name, predicted_tss, "
                "status, done, plan_goal_id, plan_source, athlete_edited) "
                "VALUES (%s, %s, %s, 'workout', 'run', %s, %s, %s, %s, %s, %s, %s)",
                (
                    event_id,
                    athlete_id,
                    datetime.combine(date.fromisoformat(str(event["date"])), time(6), tzinfo=UTC),
                    name,
                    event["predicted_tss"],
                    status,
                    done,
                    goal_id,
                    source,
                    edited,
                ),
            )
        cur.execute(
            "INSERT INTO training_calendar "
            "(event_id, athlete_id, start_time, category, status, done, plan_goal_id, plan_source) "
            "VALUES ('stale-plan', %s, %s, 'workout', 'planned', false, %s, 'generator'), "
            "('past-generated', %s, %s, 'workout', 'planned', false, %s, 'generator')",
            (
                athlete_id,
                datetime.combine(today + timedelta(days=58), time(6), tzinfo=UTC),
                goal_id,
                athlete_id,
                datetime.combine(today - timedelta(days=1), time(6), tzinfo=UTC),
                goal_id,
            ),
        )
    conn.commit()


def seed_phase(
    conn: psycopg.Connection, athlete_id: UUID, goal_id: UUID, name: str, start_date: date
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO training_phases "
            "(athlete_id, goal_id, name, start_date, end_date, target_weekly_tss) "
            "VALUES (%s, %s, %s, %s, %s, 200)",
            (athlete_id, goal_id, name, start_date, start_date + timedelta(days=14)),
        )
    conn.commit()


def seed_existing_phases(
    conn: psycopg.Connection, athlete_id: UUID, goal_id: UUID, today: date
) -> None:
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO training_phases "
            "(athlete_id, goal_id, name, start_date, end_date, target_weekly_tss) "
            "VALUES (%s, %s, %s, %s, %s, 200)",
            [
                (
                    athlete_id,
                    goal_id,
                    "past-phase",
                    today - timedelta(days=30),
                    today - timedelta(days=10),
                ),
                (
                    athlete_id,
                    goal_id,
                    "current-phase",
                    today - timedelta(days=7),
                    today + timedelta(days=7),
                ),
                (
                    athlete_id,
                    goal_id,
                    "future-phase",
                    today + timedelta(days=8),
                    today + timedelta(days=20),
                ),
            ],
        )
    conn.commit()


def count(conn: psycopg.Connection, table: str, record_id: UUID) -> int:
    id_column = "goal_id" if table == "training_phases" else "athlete_id"
    with conn.cursor() as cur:
        cur.execute(f"SELECT count(*) FROM {table} WHERE {id_column} = %s", (record_id,))
        return int(cur.fetchone()[0])


def calendar_status(conn: psycopg.Connection, athlete_id: UUID, event_id: str) -> str | None:
    row = calendar_row(conn, athlete_id, event_id)
    return str(row[0]) if row else None


def calendar_row(
    conn: psycopg.Connection, athlete_id: UUID, event_id: str
) -> tuple[object, ...]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT status, done, plan_source, athlete_edited, name FROM training_calendar "
            "WHERE athlete_id = %s AND event_id = %s",
            (athlete_id, event_id),
        )
        row = cur.fetchone()
        return row if row is not None else ()


def race_row(conn: psycopg.Connection, athlete_id: UUID, event_id: str) -> tuple[object, ...]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT category, training_type, name, (start_time AT TIME ZONE 'UTC')::date "
            "FROM training_calendar WHERE athlete_id = %s AND event_id = %s",
            (athlete_id, event_id),
        )
        row = cur.fetchone()
    return row if row is not None else ()


def phase_row(
    conn: psycopg.Connection, athlete_id: UUID, goal_id: UUID, name: str
) -> tuple[date, date] | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT start_date, end_date FROM training_phases "
            "WHERE athlete_id = %s AND goal_id = %s AND name = %s",
            (athlete_id, goal_id, name),
        )
        return cur.fetchone()


def active_generated_count(conn: psycopg.Connection, athlete_id: UUID, goal_id: UUID) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM training_calendar WHERE athlete_id = %s AND plan_goal_id = %s "
            "AND plan_source = 'generator' AND status = 'planned' AND done = false "
            "AND start_time > now()",
            (athlete_id, goal_id),
        )
        return int(cur.fetchone()[0])


def count_future_phases(
    conn: psycopg.Connection, athlete_id: UUID, goal_id: UUID, today: date
) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM training_phases "
            "WHERE athlete_id = %s AND goal_id = %s AND start_date >= %s",
            (athlete_id, goal_id, today),
        )
        return int(cur.fetchone()[0])


def phase_name_count(conn: psycopg.Connection, athlete_id: UUID, name: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM training_phases WHERE athlete_id = %s AND name = %s",
            (athlete_id, name),
        )
        return int(cur.fetchone()[0])


def delete_athlete(conn: psycopg.Connection, athlete_id: UUID) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM athletes WHERE id = %s", (athlete_id,))
    conn.commit()
