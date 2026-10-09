# pyright: reportArgumentType=false, reportMissingTypeStubs=false, reportMissingImports=false, reportAny=false, reportUnknownMemberType=false, reportUnknownVariableType=false, reportOptionalSubscript=false, reportUnusedCallResult=false, reportUnannotatedClassAttribute=false

from datetime import date, datetime
from uuid import UUID

import psycopg
import pytest
from httpx import ASGITransport, AsyncClient

from infrastructure.auth.models import Athlete
from infrastructure.integrations.intervals.sync import backfill_activities
from main import app
from presentation.api.calendar import get_calendar_repo
from presentation.api.pmc import get_pmc_repo
from presentation.auth.deps import get_current_athlete
from presentation.auth.routes import get_auth_service

from .helpers import ensure_tables

pytestmark = pytest.mark.asyncio


async def test_register_sync_pmc_calendar_flow(db_conn: psycopg.Connection) -> None:
    ensure_tables(db_conn)
    _use_db_auth(db_conn)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/register", json={"email": "e2e@example.com", "password": "secret123"}
        )
        assert response.status_code == 201
        athlete_id = UUID(response.json()["athlete_id"])
        assert _scalar(db_conn, "SELECT count(*) FROM athletes WHERE id = %s", athlete_id) == 1
        _use_api_repos(db_conn, athlete_id)

        stats = await backfill_activities(
            athlete_id, FakeClient(), db_conn, date(2026, 3, 8), date(2026, 3, 8)
        )
        assert stats.total_processed == 1
        _insert_streams(db_conn, athlete_id)
        _compute_daily_load(db_conn, athlete_id)

        pmc = await client.get("/api/v1/pmc?from=2026-03-08&to=2026-03-08")
        assert pmc.status_code == 200
        assert set(pmc.json()[0]) >= {"ctl", "atl", "tsb"}

        event = {
            "event_id": "plan-1",
            "start_time": "2026-03-09T10:00:00Z",
            "category": "workout",
            "sport_type": "run",
            "name": "Easy run",
            "predicted_tss": 35,
        }
        created = await client.post("/api/v1/calendar", json=event)
        assert created.status_code == 201
        listed = await client.get("/api/v1/calendar?from=2026-03-09T00:00:00Z&to=2026-03-10T00:00:00Z")
        assert listed.json()[0]["event_id"] == "plan-1"


class FakeClient:
    async def get_activities(
        self, _athlete_id: object, _oldest: str, _newest: str
    ) -> list[dict[str, object]]:
        return [
            {
                "id": "act-e2e",
                "start_date": "2026-03-08T14:00:00Z",
                "type": "Run",
                "distance": 10000,
                "moving_time": 3600,
                "icu_weighted_avg_watts": 220,
                "icu_training_load": 88,
            }
        ]


def _use_db_auth(conn: psycopg.Connection) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_auth_service] = lambda: RegisterService(conn)


class RegisterService:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    async def register(
        self,
        email: str,
        _password: str,
        _name: str | None = None,
        _timezone: str | None = None,
    ) -> Athlete:
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO athletes (email, password_hash) VALUES (%s, 'hash') RETURNING id",
                (email,),
            )
            return Athlete(cur.fetchone()[0], email, "hash")


def _use_api_repos(conn: psycopg.Connection, athlete_id: UUID) -> None:
    app.dependency_overrides[get_current_athlete] = lambda: Athlete(
        athlete_id, "e2e@example.com", "hash"
    )
    app.dependency_overrides[get_pmc_repo] = lambda: DbPmc(conn)
    app.dependency_overrides[get_calendar_repo] = lambda: DbCalendar(conn)


class DbPmc:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    async def get_daily_load_range(
        self, athlete_id: UUID, start: date, end: date
    ) -> list[dict[str, object]]:
        """Mirror the canonical PmcRepo query over current_daily_facts."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    day,
                    MAX(value) FILTER (WHERE metric_key = 'ctl') AS ctl,
                    MAX(value) FILTER (WHERE metric_key = 'atl') AS atl,
                    MAX(value) FILTER (WHERE metric_key = 'tsb') AS tsb,
                    MAX(value) FILTER (WHERE metric_key = 'daily_tss') AS tss,
                    MAX(value) FILTER (WHERE metric_key = 'acwr') AS acwr
                FROM current_daily_facts
                WHERE athlete_id = %s AND sport IS NULL AND day BETWEEN %s AND %s
                  AND metric_key IN ('daily_tss', 'ctl', 'atl', 'tsb', 'acwr')
                GROUP BY day
                HAVING COUNT(DISTINCT metric_key) = 5
                ORDER BY day
                """,
                (athlete_id, start, end),
            )
            return [_dict(cur.description, row) for row in cur.fetchall()]


class DbCalendar:
    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn

    async def create(self, athlete_id: UUID, event: dict[str, object]) -> dict[str, object]:
        with self.conn.cursor() as cur:
            cur.execute(
                """
            INSERT INTO training_calendar (event_id, athlete_id, start_time, category, sport_type, name, predicted_tss)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING event_id, start_time, category, sport_type, name, workout_xml, predicted_tss, status, done
            """,
                (
                    event["event_id"],
                    athlete_id,
                    event["start_time"],
                    event["category"],
                    event.get("sport_type"),
                    event.get("name"),
                    event.get("predicted_tss"),
                ),
            )
            return _dict(cur.description, cur.fetchone())

    async def list(
        self, athlete_id: UUID, start: datetime, end: datetime
    ) -> list[dict[str, object]]:
        with self.conn.cursor() as cur:
            cur.execute(
                """
            SELECT event_id, start_time, category, sport_type, name, workout_xml, predicted_tss, status, done
            FROM training_calendar WHERE athlete_id = %s AND start_time BETWEEN %s AND %s
            """,
                (athlete_id, start, end),
            )
            return [_dict(cur.description, row) for row in cur.fetchall()]


def _insert_streams(conn: psycopg.Connection, athlete_id: UUID) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
        INSERT INTO activity_streams (sample_time, activity_id, athlete_id, metric_type, value)
        VALUES ('2026-03-08T14:00:00Z', 'act-e2e', %s, 'power', 220)
        """,
            (athlete_id,),
        )


def _compute_daily_load(conn: psycopg.Connection, athlete_id: UUID) -> None:
    """Seed canonical day-level load facts (subject_type='day').

    daily_load was dropped from the schema; PMC reads current_daily_facts, a
    view over derived_metric_facts. Five day facts (daily_tss, ctl, atl, tsb,
    acwr) satisfy the PmcRepo HAVING COUNT(DISTINCT metric_key) = 5 contract.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO computation_runs (
                athlete_id, computation_kind, algorithm_version, input_fingerprint,
                trigger, status, rows_affected, finished_at
            ) VALUES (%s, 'activity_load', '1.0.0', repeat('b', 64), 'test', 'success', 1, now())
            """,
            (athlete_id,),
        )
        cur.execute(
            """
            INSERT INTO derived_metric_facts (
                athlete_id, subject_type, subject_key, metric_key, unit, value,
                effective_at, algorithm_version, computation_run_id, method
            )
            SELECT %s, 'day', '2026-03-08', m.metric_key, m.unit, m.value,
                   '2026-03-08T00:00:00+00:00', '1.0.0', r.id, 'test'
            FROM (VALUES
                ('daily_tss', 'points', 88.0),
                ('ctl', 'points', 88.0 / 42),
                ('atl', 'points', 88.0 / 7),
                ('tsb', 'points', 88.0 / 42 - 88.0 / 7),
                ('acwr', 'ratio', 1.0)
            ) AS m(metric_key, unit, value)
            JOIN computation_runs r
              ON r.athlete_id = %s AND r.computation_kind = 'activity_load'
            WHERE r.status = 'success'
            """,
            (athlete_id, athlete_id),
        )


def _scalar(conn: psycopg.Connection, sql: str, value: object) -> int:
    with conn.cursor() as cur:
        cur.execute(sql, (value,))
        return int(cur.fetchone()[0])


def _dict(description: object, row: tuple[object, ...]) -> dict[str, object]:
    return {column.name: value for column, value in zip(description, row, strict=True)}
