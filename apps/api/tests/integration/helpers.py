from __future__ import annotations

from uuid import UUID

import psycopg


def ensure_tables(conn: psycopg.Connection) -> None:
    """Idempotent schema compatibility for integration tests.

    The test database is migrated to alembic head, so all canonical tables
    already exist. This only re-applies idempotent column additions for
    canonical columns (safe to ensure, no-op when already present).

    The deprecated ``daily_load`` table and the legacy table shapes are
    deliberately NOT created here — tests that need load facts seed
    ``derived_metric_facts`` instead (see recompute_verifier_helpers.py and
    test_e2e_flow.py's ``_compute_daily_load``).
    """
    with conn.cursor() as cur:
        for ddl in _COLUMN_ADDITIONS:
            _ = cur.execute(ddl)


# Canonical activity capability/provenance columns (a9b8c7d6e5f4, e2f3a4b5c6d7)
# and athlete physiology columns used by the running-load (rTSS) path.
_COLUMN_ADDITIONS = (
    "ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS has_gps BOOLEAN DEFAULT FALSE",
    "ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS has_hr BOOLEAN DEFAULT FALSE",
    "ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS has_power BOOLEAN DEFAULT FALSE",
    "ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS has_cadence BOOLEAN DEFAULT FALSE",
    "ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS summary_polyline TEXT",
    "ALTER TABLE athletes ADD COLUMN IF NOT EXISTS threshold_pace DOUBLE PRECISION",
)


def seed_athlete(conn: psycopg.Connection, athlete_id: UUID | str, email: str) -> None:
    with conn.cursor() as cur:
        _ = cur.execute(
            "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, 'hash') ON CONFLICT DO NOTHING",
            (athlete_id, email),
        )
