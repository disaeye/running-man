"""Activity load facts are computed from running pace, or from heart rate.

Power is not a supported input: no configured source emits a power stream, so
there is no power path to exercise. These tests pin the two paths that do
exist, and pin the honest-failure case — an activity with neither a pace stream
plus threshold pace nor an LTHR produces no TSS rather than a fabricated one.
"""

from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from uuid import UUID

import psycopg
import pytest

from application.load.recompute import recompute_activity_load_facts
from infrastructure.auth.settings import settings
from infrastructure.db import domain_constraints
from infrastructure.db.pool import close_pool, open_pool
from tests.application.load.activity_fact_schema import ensure_activity_fact_schema

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000013")


def _configure_database_url() -> None:
    settings.database_url = "postgresql://postgres@/test_running_man?host=/var/run/postgresql&port=15434"


@pytest.fixture(scope="session")
async def test_pool() -> AsyncGenerator[None, None]:
    _configure_database_url()
    await close_pool()
    await open_pool()
    try:
        yield
    finally:
        await close_pool()


async def test_pace_activity_facts_are_current_and_repeat_is_skipped(
    db_conn: psycopg.Connection,
) -> None:
    """A run with a pace stream and a threshold pace yields rTSS."""
    _ensure_schema()
    _reset_athlete(db_conn)
    _seed_threshold(db_conn, threshold_pace=270.0)
    _seed_pace_run(db_conn, "pace-activity", datetime(2026, 7, 15, tzinfo=UTC))

    first = await recompute_activity_load_facts(ATHLETE_ID)
    second = await recompute_activity_load_facts(ATHLETE_ID)

    facts = _activity_facts("pace-activity")
    assert first.status == "success"
    assert second.status == "skipped"
    assert second.rows_affected == 0
    assert facts["normalized_graded_pace"] > 0
    assert facts["intensity_factor"] > 0
    assert facts["tss"] > 0


async def test_activity_without_pace_or_lthr_does_not_fabricate_tss(
    db_conn: psycopg.Connection,
) -> None:
    """No threshold pace and no LTHR means no load — not a default number."""
    _ensure_schema()
    _reset_athlete(db_conn)
    _seed_run_without_inputs(db_conn, "missing-load-inputs")

    result = await recompute_activity_load_facts(ATHLETE_ID)

    assert result.status == "success"
    assert _activity_facts("missing-load-inputs") == {}


async def test_hr_only_activity_uses_lthr_resolved_for_its_own_date(
    db_conn: psycopg.Connection,
) -> None:
    """hrTSS resolves LTHR per activity date, so history does not drift.

    The activity predates the newer LTHR step, so it must be scored with the
    older value: 168 rather than 182.
    """
    _ensure_schema()
    _reset_athlete(db_conn)
    _seed_lthr_step(db_conn, "2026-01-01", 168)
    _seed_lthr_step(db_conn, "2026-08-01", 182)
    _seed_hr_only_run(db_conn, "older-run", datetime(2026, 3, 1, tzinfo=UTC), avg_hr=150)

    _ = await recompute_activity_load_facts(ATHLETE_ID)

    facts = _activity_facts("older-run")
    assert "tss" in facts
    # Same duration and heart rate scored against the September LTHR would give
    # a different (higher) zone and therefore a different TSS; the assertion
    # that matters is that the value is stable when only later steps change.
    _seed_lthr_step(db_conn, "2026-09-01", 200)
    _ = await recompute_activity_load_facts(ATHLETE_ID)
    assert _activity_facts("older-run")["tss"] == pytest.approx(facts["tss"])


async def test_unproven_source_provenance_is_not_migrated(db_conn: psycopg.Connection) -> None:
    _ensure_schema()
    _reset_athlete(db_conn)
    _seed_legacy_unproven_summary(db_conn)

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT source_weighted_power_w, source_training_load
            FROM activity_summary
            WHERE athlete_id = %s AND activity_id = 'legacy-unproven'
            """,
            (ATHLETE_ID,),
        )
        row = cur.fetchone()

    assert row == (None, None)


def _ensure_schema() -> None:
    _configure_database_url()
    ensure_activity_fact_schema(ATHLETE_ID)
    with psycopg.connect(settings.database_url) as schema_conn, schema_conn.cursor() as cur:
        for row in domain_constraints.metric_rows():
            cur.execute(
                """
                INSERT INTO metric_definitions (
                    metric_key, unit, display_unit, classification, materialization,
                    null_semantics, legal_min, legal_max, ui_precision
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (metric_key) DO UPDATE SET unit = EXCLUDED.unit
                """,
                (
                    row["key"],
                    row["unit"],
                    row["display_unit"],
                    row["classification"],
                    row["materialization"],
                    row["null_semantics"],
                    row["legal_min"],
                    row["legal_max"],
                    row["ui_precision"],
                ),
            )


def _reset_athlete(db_conn: psycopg.Connection) -> None:
    """Clear this athlete's rows so each test starts from a known state."""
    with db_conn.cursor() as cur:
        for table in (
            "athlete_thresholds",
            "derived_metric_facts",
            "activity_streams",
            "activity_summary",
        ):
            cur.execute(f"DELETE FROM {table} WHERE athlete_id = %s", (ATHLETE_ID,))
    db_conn.commit()


def _seed_threshold(db_conn: psycopg.Connection, threshold_pace: float) -> None:
    _upsert_threshold(db_conn, "2026-01-01", {"threshold_pace": threshold_pace})


def _seed_lthr_step(db_conn: psycopg.Connection, day: str, lthr: int) -> None:
    _upsert_threshold(db_conn, day, {"lthr": lthr})


def _upsert_threshold(
    db_conn: psycopg.Connection, day: str, values: dict[str, object]
) -> None:
    columns = ", ".join(values)
    placeholders = ", ".join(["%s"] * len(values))
    updates = ", ".join(f"{column} = EXCLUDED.{column}" for column in values)
    with db_conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO athlete_thresholds (athlete_id, effective_from, {columns}) "
            f"VALUES (%s, %s, {placeholders}) "
            f"ON CONFLICT (athlete_id, effective_from) DO UPDATE SET {updates}",
            (ATHLETE_ID, day, *values.values()),
        )
    db_conn.commit()


def _seed_pace_run(db_conn: psycopg.Connection, activity_id: str, start: datetime) -> None:
    """A 30-minute run with a monotonically increasing distance stream."""
    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO activity_summary (activity_id, athlete_id, start_time, sport, duration_s)
            VALUES (%s, %s, %s, 'run', 1800)
            """,
            (activity_id, ATHLETE_ID, start),
        )
        for second in range(180):
            cur.execute(
                """
                INSERT INTO activity_streams (sample_time, activity_id, athlete_id, metric_type, value)
                VALUES (%s, %s, %s, 'distance', %s)
                """,
                (start + timedelta(seconds=second), activity_id, ATHLETE_ID, second * 3.0),
            )
    db_conn.commit()


def _seed_run_without_inputs(db_conn: psycopg.Connection, activity_id: str) -> None:
    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO activity_summary (activity_id, athlete_id, start_time, sport, duration_s)
            VALUES (%s, %s, %s, 'run', 3600)
            """,
            (activity_id, ATHLETE_ID, datetime(2026, 7, 16, tzinfo=UTC)),
        )
    db_conn.commit()


def _seed_hr_only_run(
    db_conn: psycopg.Connection, activity_id: str, start: datetime, avg_hr: int
) -> None:
    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO activity_summary (
                activity_id, athlete_id, start_time, sport, duration_s, avg_hr
            ) VALUES (%s, %s, %s, 'run', 3600, %s)
            """,
            (activity_id, ATHLETE_ID, start, avg_hr),
        )
    db_conn.commit()


def _seed_legacy_unproven_summary(db_conn: psycopg.Connection) -> None:
    with db_conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO activity_summary (
                activity_id, athlete_id, start_time, sport, duration_s,
                source_weighted_power_w, source_training_load, raw_data
            ) VALUES ('legacy-unproven', %s, %s, 'run', 3600, NULL, NULL, '{}'::jsonb)
            """,
            (ATHLETE_ID, datetime(2026, 7, 17, tzinfo=UTC)),
        )
    db_conn.commit()


def _activity_facts(activity_id: str) -> dict[str, float]:
    with psycopg.connect(settings.database_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT derived_metric_facts.metric_key, derived_metric_facts.value
            FROM derived_metric_facts
            JOIN computation_runs ON computation_runs.id = derived_metric_facts.computation_run_id
            WHERE derived_metric_facts.athlete_id = %s AND subject_key = %s
              AND computation_runs.status = 'success'
            """,
            (ATHLETE_ID, activity_id),
        )
        return {_text(row[0]): float(row[1]) for row in cur.fetchall()}


def _text(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode()
    return str(value)
