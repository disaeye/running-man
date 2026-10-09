from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import psycopg

from infrastructure.auth.settings import settings
from infrastructure.db import domain_constraints
from tests.application.load.activity_fact_schema import ensure_activity_fact_schema

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000016")
ACTIVITY_ID = "verify-pace"


@dataclass(frozen=True, slots=True)
class VerificationHashes:
    fact_hash: str
    failed_runs: int


def configure_database(database_url: str) -> None:
    settings.database_url = database_url


def seed_idempotency_inputs(database_url: str) -> None:
    configure_database(database_url)
    ensure_activity_fact_schema(ATHLETE_ID)
    with psycopg.connect(database_url) as conn:
        _seed_metrics(conn)
        _seed_activity(conn)


def current_fact_hash(database_url: str) -> VerificationHashes:
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT subject_key, metric_key, value, computation_run_id
            FROM current_activity_facts
            WHERE athlete_id = %s
            ORDER BY subject_key, metric_key
            """,
            (ATHLETE_ID,),
        )
        payload = "\n".join("|".join(str(value) for value in row) for row in cur.fetchall())
        cur.execute(
            """
            SELECT count(*)
            FROM computation_runs
            WHERE athlete_id = %s AND computation_kind = 'activity_load' AND status = 'failed'
            """,
            (ATHLETE_ID,),
        )
        failed_runs = int(cur.fetchone()[0])
    return VerificationHashes(hashlib.sha256(payload.encode()).hexdigest(), failed_runs)


def run_status_counts(database_url: str) -> dict[str, int]:
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT status, count(*)
            FROM computation_runs
            WHERE athlete_id = %s AND computation_kind IN ('activity_load', 'pmc')
            GROUP BY status
            """,
            (ATHLETE_ID,),
        )
        return {_text(status): int(count) for status, count in cur.fetchall()}


def _seed_metrics(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
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
    conn.commit()


def _seed_activity(conn: psycopg.Connection) -> None:
    """Seed a run with a pace stream and a threshold pace.

    The scenario is a running one because pace is the only load input this
    product computes from; a power-based seed would produce no facts at all and
    every idempotency assertion below would compare empty hashes.
    """
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM activity_streams WHERE athlete_id = %s OR activity_id = %s",
            (ATHLETE_ID, ACTIVITY_ID),
        )
        cur.execute("DELETE FROM activity_summary WHERE athlete_id = %s", (ATHLETE_ID,))
        cur.execute(
            "DELETE FROM athlete_thresholds WHERE athlete_id = %s", (ATHLETE_ID,)
        )
        cur.execute(
            """
            INSERT INTO athlete_thresholds (athlete_id, effective_from, threshold_pace, lthr)
            VALUES (%s, '2026-01-01', 270, 180)
            ON CONFLICT (athlete_id, effective_from)
            DO UPDATE SET threshold_pace = 270, lthr = 180
            """,
            (ATHLETE_ID,),
        )
        cur.execute(
            """
            INSERT INTO activity_summary (activity_id, athlete_id, start_time, sport, duration_s)
            VALUES (%s, %s, %s, 'run', 1800)
            ON CONFLICT (activity_id, start_time) DO UPDATE SET duration_s = EXCLUDED.duration_s
            """,
            (ACTIVITY_ID, ATHLETE_ID, datetime(2026, 7, 15, tzinfo=UTC)),
        )
        for second in range(180):
            cur.execute(
                """
                INSERT INTO activity_streams (sample_time, activity_id, athlete_id, metric_type, value)
                VALUES (%s, %s, %s, 'distance', %s)
                """,
                (
                    datetime(2026, 7, 15, 0, 0, tzinfo=UTC)
                    + timedelta(seconds=second),
                    ACTIVITY_ID,
                    ATHLETE_ID,
                    second * 3.0,
                ),
            )
    conn.commit()


def _text(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode()
    return str(value)
