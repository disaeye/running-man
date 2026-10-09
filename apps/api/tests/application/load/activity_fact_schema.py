from uuid import UUID

import psycopg

from infrastructure.auth.settings import settings


def ensure_activity_fact_schema(athlete_id: UUID) -> None:
    """Bootstrap canonical fact tables on a dedicated connection.

    Uses its own connection (``settings.database_url``) so the TRUNCATE and
    commits never touch the shared session-scoped ``db_conn`` — calling
    ``db_conn.rollback()`` inside a force_rollback savepoint used to abort
    the shared session for every later test.
    """
    with psycopg.connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(_ATHLETES_SQL)
            for statement in _ATHLETE_COLUMN_SQL:
                cur.execute(statement)
            for statement in _SCHEMA_SQL:
                cur.execute(statement)
            # CASCADE is required: athletes.physiology_computation_run_id
            # references computation_runs, so plain TRUNCATE fails
            # (FeatureNotSupported). CASCADE also wipes athletes and
            # athlete_thresholds, so those rows must be inserted AFTER the
            # truncate.
            cur.execute(
                "TRUNCATE derived_metric_facts, computation_runs, activity_streams, activity_summary CASCADE"
            )
            cur.execute(
                "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, 'hash') "
                "ON CONFLICT DO NOTHING",
                (athlete_id, f"activity-load-{athlete_id}@example.test"),
            )
            cur.execute(
                "DELETE FROM athlete_thresholds WHERE athlete_id = %s", (athlete_id,)
            )
            cur.execute(
                "DELETE FROM activity_recompute_jobs WHERE athlete_id = %s", (athlete_id,)
            )
        conn.commit()


_ATHLETES_SQL = """
CREATE TABLE IF NOT EXISTS athletes (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    physiology_updated_at TIMESTAMPTZ,
    physiology_algorithm_version TEXT,
    physiology_computation_run_id UUID
)
"""

_ATHLETE_COLUMN_SQL = (
    "ALTER TABLE athletes ADD COLUMN IF NOT EXISTS physiology_updated_at TIMESTAMPTZ",
    "ALTER TABLE athletes ADD COLUMN IF NOT EXISTS physiology_algorithm_version TEXT",
    "ALTER TABLE athletes ADD COLUMN IF NOT EXISTS physiology_computation_run_id UUID",
    "ALTER TABLE athletes ADD COLUMN IF NOT EXISTS threshold_pace DOUBLE PRECISION",
)

_SCHEMA_SQL = (
    """
    CREATE TABLE IF NOT EXISTS sport_definitions (
        sport_key TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        family TEXT NOT NULL,
        aliases JSONB NOT NULL DEFAULT '[]'::jsonb
    )
    """,
    """
    INSERT INTO sport_definitions (sport_key, display_name, family)
    VALUES ('run', 'Run', 'running'), ('ride', 'Ride', 'cycling')
    ON CONFLICT DO NOTHING
    """,
    """
    CREATE TABLE IF NOT EXISTS activity_summary (
        activity_id TEXT NOT NULL,
        athlete_id UUID NOT NULL REFERENCES athletes(id),
        start_time TIMESTAMPTZ NOT NULL,
        sport TEXT NOT NULL,
        duration_s INTEGER,
        avg_hr SMALLINT,
        source_weighted_power_w DOUBLE PRECISION,
        source_training_load DOUBLE PRECISION,
        raw_data JSONB,
        PRIMARY KEY (activity_id, start_time)
    )
    """,
    "ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS distance_m DOUBLE PRECISION",
    "ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS duration_s INTEGER",
    "ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS avg_hr SMALLINT",
    "ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS source_weighted_power_w DOUBLE PRECISION",
    "ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS source_training_load DOUBLE PRECISION",
    "ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS raw_data JSONB",
    # Mirrors the production migration: derived numbers read this view rather
    # than the table, so that ignored and soft-deleted activities are excluded
    # in one place instead of in every query.
    #
    # Dropped and recreated rather than `CREATE OR REPLACE`d. Postgres matches
    # the new column list to the old one *by position*, so an `OR REPLACE`
    # fails with "cannot change name of view column \"icu_ctl\" to
    # \"source_weighted_power_w\"" whenever `SELECT *` expands to a different
    # order than the existing view. That order depends on the table's own
    # history: a database where columns were renamed to reach the current names
    # has `pg.dropped` tombstones and a different physical order than a database
    # built fresh from the migrations. Recreating makes the view match the table
    # either way.
    "ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ",
    "ALTER TABLE activity_summary ADD COLUMN IF NOT EXISTS ignored_at TIMESTAMPTZ",
    "DROP VIEW IF EXISTS activity_compute",
    """
    CREATE VIEW activity_compute AS
    SELECT * FROM activity_summary
    WHERE deleted_at IS NULL AND ignored_at IS NULL
    """,
    """
    CREATE TABLE IF NOT EXISTS activity_streams (
        sample_time TIMESTAMPTZ NOT NULL,
        activity_id TEXT NOT NULL,
        athlete_id UUID NOT NULL,
        metric_type TEXT NOT NULL,
        value DOUBLE PRECISION NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS athlete_thresholds (
        athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
        effective_from DATE NOT NULL,
        hr_max INTEGER,
        resting_hr INTEGER,
        lthr INTEGER,
        threshold_pace DOUBLE PRECISION,
        source TEXT NOT NULL DEFAULT 'manual',
        algorithm_version TEXT,
        computation_run_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (athlete_id, effective_from)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS computation_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        athlete_id UUID NOT NULL REFERENCES athletes(id),
        computation_kind TEXT NOT NULL,
        algorithm_version TEXT NOT NULL,
        input_fingerprint CHAR(64) NOT NULL,
        trigger TEXT NOT NULL,
        input_window_start TIMESTAMPTZ,
        input_window_end TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'running',
        rows_affected INTEGER NOT NULL DEFAULT 0,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at TIMESTAMPTZ,
        detail JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS uq_computation_runs_success_fingerprint
    ON computation_runs (athlete_id, computation_kind, algorithm_version, input_fingerprint)
    WHERE status = 'success'
    """,
    """
    CREATE TABLE IF NOT EXISTS metric_definitions (
        metric_key TEXT PRIMARY KEY,
        unit TEXT NOT NULL,
        display_unit TEXT NOT NULL DEFAULT '',
        classification TEXT NOT NULL,
        materialization TEXT NOT NULL,
        null_semantics TEXT NOT NULL,
        legal_min DOUBLE PRECISION,
        legal_max DOUBLE PRECISION,
        ui_precision SMALLINT NOT NULL DEFAULT 0,
        deprecated_at TIMESTAMPTZ,
        UNIQUE (metric_key, unit)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS derived_metric_facts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        athlete_id UUID NOT NULL REFERENCES athletes(id),
        subject_type TEXT NOT NULL,
        subject_key TEXT NOT NULL,
        metric_key TEXT NOT NULL,
        unit TEXT NOT NULL,
        value DOUBLE PRECISION NOT NULL,
        effective_at TIMESTAMPTZ NOT NULL,
        algorithm_version TEXT NOT NULL,
        computation_run_id UUID NOT NULL REFERENCES computation_runs(id),
        method TEXT NOT NULL,
        confidence DOUBLE PRECISION,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (athlete_id, subject_type, subject_key, metric_key, effective_at, algorithm_version)
    )
    """,
    """
    CREATE OR REPLACE VIEW current_derived_metric_facts AS
    SELECT DISTINCT ON (f.athlete_id, f.subject_type, f.subject_key, f.metric_key) f.*
    FROM derived_metric_facts AS f
    JOIN computation_runs AS r ON r.id = f.computation_run_id
    WHERE r.status = 'success'
    ORDER BY f.athlete_id, f.subject_type, f.subject_key, f.metric_key,
             f.effective_at DESC, f.computed_at DESC, f.id DESC
    """,
    """
    CREATE OR REPLACE VIEW current_activity_facts AS
    SELECT * FROM current_derived_metric_facts WHERE subject_type = 'activity'
    """,
    """
    CREATE OR REPLACE VIEW current_metric_definitions AS
    SELECT * FROM metric_definitions WHERE deprecated_at IS NULL
    """,
    """
    CREATE OR REPLACE VIEW current_daily_facts AS
    SELECT
        athlete_id,
        CASE
            WHEN subject_type = 'day' THEN subject_key::date
            ELSE split_part(subject_key, ':', 2)::date
        END AS day,
        CASE WHEN subject_type = 'sport_day' THEN split_part(subject_key, ':', 1) END AS sport,
        metric_key,
        unit,
        value,
        algorithm_version,
        computation_run_id,
        method,
        confidence,
        metadata,
        computed_at
    FROM current_derived_metric_facts
    WHERE (subject_type = 'day' AND subject_key ~ '^\\d{4}-\\d{2}-\\d{2}$')
       OR (subject_type = 'sport_day' AND subject_key ~ '^[a-z_]+:\\d{4}-\\d{2}-\\d{2}$')
    """,
)
