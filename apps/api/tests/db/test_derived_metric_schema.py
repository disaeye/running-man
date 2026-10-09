from datetime import UTC, datetime
from typing import assert_never
from uuid import UUID, uuid4

import psycopg
import pytest
from psycopg import errors


def test_schema_tables_views_and_seeded_definitions(db_conn: psycopg.Connection) -> None:
    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('computation_runs', 'metric_definitions', 'derived_metric_facts')
            """
        )
        tables = {_text(row[0]) for row in cur.fetchall()}
        assert tables == {"computation_runs", "metric_definitions", "derived_metric_facts"}

        cur.execute(
            """
            SELECT table_name
            FROM information_schema.views
            WHERE table_schema = 'public'
              AND table_name IN ('current_metric_definitions', 'current_derived_metric_facts')
            """
        )
        assert {_text(row[0]) for row in cur.fetchall()} == {
            "current_metric_definitions",
            "current_derived_metric_facts",
        }

        # Seeded by d8e9f0a1b2c3 (canonical domain constraints). Exact count
        # (19) is asserted by verify_schema_lifecycle EXPECTED_COUNTS; this
        # test only requires the seeds to be present so definition-bearing
        # facts can be inserted.
        cur.execute("SELECT count(*) FROM metric_definitions")
        assert cur.fetchone()[0] >= 19

        cur.execute(
            """
            SELECT data_type
            FROM information_schema.columns
            WHERE table_name = 'derived_metric_facts'
              AND column_name = 'value'
            """
        )
        assert _text(cur.fetchone()[0]) == "double precision"


def test_duplicate_fact_rejected(db_conn: psycopg.Connection) -> None:
    athlete_id = uuid4()
    with db_conn.transaction(force_rollback=True):
        with db_conn.cursor() as cur:
            run_id = _seed_run(cur, athlete_id)
            _seed_definition(cur)
            _insert_fact(cur, athlete_id, run_id)
            with pytest.raises(errors.UniqueViolation):
                with db_conn.transaction(force_rollback=True):
                    _insert_fact(cur, athlete_id, run_id)


def test_invalid_status_rejected(db_conn: psycopg.Connection) -> None:
    athlete_id = uuid4()
    with pytest.raises(errors.CheckViolation):
        with db_conn.transaction(force_rollback=True):
            with db_conn.cursor() as cur:
                _seed_athlete(cur, athlete_id)
                cur.execute(
                    """
                    INSERT INTO computation_runs (
                        athlete_id,
                        computation_kind,
                        algorithm_version,
                        input_fingerprint,
                        trigger,
                        status
                    ) VALUES (%s, 'pmc', '1.0.0', %s, 'manual', 'done')
                    """,
                    (athlete_id, "a" * 64),
                )


def test_mismatched_unit_rejected(db_conn: psycopg.Connection) -> None:
    athlete_id = uuid4()
    with pytest.raises(errors.ForeignKeyViolation):
        with db_conn.transaction(force_rollback=True):
            with db_conn.cursor() as cur:
                run_id = _seed_run(cur, athlete_id)
                _seed_definition(cur)
                _insert_fact(cur, athlete_id, run_id, unit="bpm")


def _seed_athlete(cur: psycopg.Cursor, athlete_id: UUID) -> None:
    cur.execute(
        """
        INSERT INTO athletes (id, email, password_hash)
        VALUES (%s, %s, 'hash')
        ON CONFLICT (id) DO NOTHING
        """,
        (athlete_id, f"derived-{athlete_id}@example.test"),
    )


def _text(value: str | bytes) -> str:
    match value:
        case str():
            return value
        case bytes():
            return value.decode()
        case unreachable:
            assert_never(unreachable)


def _seed_definition(cur: psycopg.Cursor) -> None:
    cur.execute(
        """
        INSERT INTO metric_definitions (
            metric_key,
            unit,
            classification,
            materialization,
            null_semantics
        ) VALUES ('ctl', 'points', 'local_computation', 'stored_fact', 'no_load_history')
        ON CONFLICT (metric_key) DO NOTHING
        """
    )


def _seed_run(cur: psycopg.Cursor, athlete_id: UUID) -> UUID:
    _seed_athlete(cur, athlete_id)
    run_id = uuid4()
    cur.execute(
        """
        INSERT INTO computation_runs (
            id,
            athlete_id,
            computation_kind,
            algorithm_version,
            input_fingerprint,
            trigger,
            status,
            finished_at
        ) VALUES (%s, %s, 'pmc', '1.0.0', %s, 'manual', 'success', %s)
        """,
        (run_id, athlete_id, "b" * 64, datetime.now(UTC)),
    )
    return run_id


def _insert_fact(
    cur: psycopg.Cursor,
    athlete_id: UUID,
    run_id: UUID,
    unit: str = "points",
) -> None:
    cur.execute(
        """
        INSERT INTO derived_metric_facts (
            athlete_id,
            subject_type,
            subject_key,
            metric_key,
            unit,
            value,
            effective_at,
            algorithm_version,
            computation_run_id,
            method
        ) VALUES (%s, 'day', '2026-07-15', 'ctl', %s, 42.5, %s, '1.0.0', %s, 'pmc')
        """,
        (athlete_id, unit, datetime(2026, 7, 15, tzinfo=UTC), run_id),
    )
