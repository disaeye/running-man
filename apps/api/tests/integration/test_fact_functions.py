import ast
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import UUID, uuid4

import psycopg
import pytest

from conftest import TEST_DSN
from infrastructure.auth.settings import settings
from tests.application.load.activity_fact_schema import ensure_activity_fact_schema

ATHLETE_ID = uuid4()
RUN_ID = "fact-run"
pytestmark = pytest.mark.no_db
FACT_FUNCTIONS_SQL = ast.literal_eval(
    next(
        node.value
        for node in ast.parse(
            (Path(__file__).parents[2] / "alembic/versions/b1c2d3e4f5a6_rewrite_fact_functions.py").read_text()
        ).body
        if isinstance(node, ast.Assign)
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id == "_FACT_FUNCTIONS_SQL"
    )
)


def test_daily_facts_join_current_activity_pmc_canonical_sports_and_wellness(
    db_conn: psycopg.Connection,
) -> None:
    _ensure_schema(db_conn, ATHLETE_ID)
    _seed_daily_fixture(db_conn, ATHLETE_ID)

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT day, sport, metric_key, unit, value
            FROM get_athlete_daily_facts(%s, %s, %s)
            """,
            (ATHLETE_ID, date(2026, 1, 1), date(2026, 1, 7)),
        )
        rows = _dict_rows(cur)

    keyed = {(row["day"], row["sport"], row["metric_key"]): row for row in rows}
    assert keyed[(date(2026, 1, 1), None, "daily_tss")]["value"] == 30.0
    assert keyed[(date(2026, 1, 1), None, "source_readiness")]["value"] == 88.0
    assert keyed[(date(2026, 1, 1), "run", "distance_m")]["value"] == 5000.0
    assert keyed[(date(2026, 1, 1), "run", "normalized_power")]["value"] == 210.0
    assert keyed[(date(2026, 1, 1), "run", "tss")]["value"] == 42.0
    assert all(row["sport"] != "Run" for row in rows)


def test_weekly_facts_count_iso_weeks_intersecting_range(db_conn: psycopg.Connection) -> None:
    _ensure_schema(db_conn, ATHLETE_ID)
    _seed_week_boundary_fixture(db_conn, ATHLETE_ID)

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT week_start, sport, metric_key, value, points
            FROM get_athlete_weekly_facts(%s, %s, %s)
            WHERE metric_key = 'distance_m'
            ORDER BY week_start
            """,
            (ATHLETE_ID, date(2026, 1, 4), date(2026, 1, 5)),
        )
        rows = _dict_rows(cur)

    assert rows == [
        {
            "week_start": date(2025, 12, 29),
            "sport": "run",
            "metric_key": "distance_m",
            "value": 4000.0,
            "points": 1,
        },
        {
            "week_start": date(2026, 1, 5),
            "sport": "run",
            "metric_key": "distance_m",
            "value": 5000.0,
            "points": 1,
        },
    ]


def _ensure_schema(db_conn: psycopg.Connection, athlete_id: UUID) -> None:
    settings.database_url = TEST_DSN
    ensure_activity_fact_schema(athlete_id)
    with db_conn.cursor() as cur:
        cur.execute(FACT_FUNCTIONS_SQL)
        cur.executemany(
            """
            INSERT INTO metric_definitions (
                metric_key, unit, display_unit, classification, materialization, null_semantics
            ) VALUES (%s, %s, '', 'local_computation', 'stored_fact', 'test')
            ON CONFLICT DO NOTHING
            """,
            [
                ("daily_tss", "points"),
                ("source_readiness", "score"),
                ("distance_m", "m"),
                ("duration_s", "s"),
                ("avg_hr", "bpm"),
                ("normalized_power", "w"),
                ("intensity_factor", "ratio"),
                ("tss", "points"),
            ],
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS health_wellness (
                day DATE NOT NULL,
                athlete_id UUID NOT NULL REFERENCES athletes(id),
                readiness SMALLINT,
                PRIMARY KEY (day, athlete_id)
            )
            """,
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS health_wellness_2026_01
            PARTITION OF health_wellness FOR VALUES FROM ('2026-01-01') TO ('2026-02-01')
            """,
        )
        cur.execute("DELETE FROM health_wellness WHERE athlete_id = %s", (athlete_id,))
    db_conn.commit()


def _seed_daily_fixture(db_conn: psycopg.Connection, athlete_id: UUID) -> None:
    with db_conn.cursor() as cur:
        _seed_run(cur, athlete_id, RUN_ID, datetime(2026, 1, 1, 8, tzinfo=UTC), 5000.0)
        _seed_success_run(cur, athlete_id)
        _seed_fact(cur, athlete_id, "day", "2026-01-01", "daily_tss", "points", 30.0)
        _seed_fact(cur, athlete_id, "activity", RUN_ID, "normalized_power", "w", 210.0)
        _seed_fact(cur, athlete_id, "activity", RUN_ID, "tss", "points", 42.0)
        cur.execute(
            "INSERT INTO health_wellness (day, athlete_id, readiness) VALUES (%s, %s, %s)",
            (date(2026, 1, 1), athlete_id, 88),
        )
    db_conn.commit()


def _seed_week_boundary_fixture(db_conn: psycopg.Connection, athlete_id: UUID) -> None:
    with db_conn.cursor() as cur:
        _seed_success_run(cur, athlete_id)
        _seed_run(cur, athlete_id, "sun-run", datetime(2026, 1, 4, 8, tzinfo=UTC), 4000.0)
        _seed_run(cur, athlete_id, "mon-run", datetime(2026, 1, 5, 8, tzinfo=UTC), 5000.0)
    db_conn.commit()


def _seed_success_run(cur: psycopg.Cursor, athlete_id: UUID) -> None:
    cur.execute(
        """
        INSERT INTO computation_runs (
            id, athlete_id, computation_kind, algorithm_version, input_fingerprint, trigger, status
        ) VALUES (
            '11111111-1111-1111-1111-111111111111', %s, 'test', '1.0.0', repeat('a', 64), 'test', 'success'
        ) ON CONFLICT DO NOTHING
        """,
        (athlete_id,),
    )


def _seed_run(
    cur: psycopg.Cursor,
    athlete_id: UUID,
    activity_id: str,
    started_at: datetime,
    distance_m: float,
) -> None:
    cur.execute(
        """
        INSERT INTO activity_summary (activity_id, athlete_id, start_time, sport, distance_m, duration_s)
        VALUES (%s, %s, %s, 'run', %s, 1800)
        """,
        (activity_id, athlete_id, started_at, distance_m),
    )


def _seed_fact(
    cur: psycopg.Cursor,
    athlete_id: UUID,
    subject_type: str,
    subject_key: str,
    metric_key: str,
    unit: str,
    value: float,
) -> None:
    cur.execute(
        """
        INSERT INTO derived_metric_facts (
            athlete_id, subject_type, subject_key, metric_key, unit, value, effective_at,
            algorithm_version, computation_run_id, method
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, '1.0.0', '11111111-1111-1111-1111-111111111111', 'test')
        """,
        (athlete_id, subject_type, subject_key, metric_key, unit, value, datetime(2026, 1, 1, tzinfo=UTC)),
    )


def _dict_rows(cur: psycopg.Cursor) -> list[dict[str, object]]:
    columns = [column.name for column in cur.description or ()]
    return [dict(zip(columns, (_decode(value) for value in row), strict=True)) for row in cur.fetchall()]


def _decode(value: object) -> object:
    if isinstance(value, bytes):
        return value.decode()
    return value
