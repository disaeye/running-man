from __future__ import annotations

from uuid import UUID

import psycopg


def ensure_failure_schema(db_conn: psycopg.Connection, athlete_id: UUID) -> None:
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, 'hash') "
            "ON CONFLICT DO NOTHING",
            (athlete_id, "canonical-ingestion@example.com"),
        )
        for table in _DROP_TABLES:
            cur.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
        for statement in _CREATE_TABLES:
            cur.execute(statement)
        cur.execute(
            "INSERT INTO user_integrations (athlete_id, source, settings) "
            "VALUES (%s, 'strava', '{\"primary_activity_source\": \"true\"}'::jsonb)",
            (athlete_id,),
        )
        cur.execute(
            "CREATE INDEX idx_as_source_hash ON activity_summary (athlete_id, source_hash)"
        )


_DROP_TABLES = (
    "integration_sync_errors",
    "source_records",
    "integration_sync_runs",
    "activity_summary",
    "user_integrations",
)

_CREATE_TABLES = (
    """
    CREATE TABLE activity_summary (
        activity_id TEXT NOT NULL,
        athlete_id UUID NOT NULL,
        start_time TIMESTAMPTZ NOT NULL,
        sport TEXT NOT NULL,
        distance_m DOUBLE PRECISION,
        duration_s INTEGER,
        avg_hr SMALLINT,
        max_hr SMALLINT,
        avg_power SMALLINT,
        source_weighted_power_w DOUBLE PRECISION,
        icu_ctl DOUBLE PRECISION,
        source_training_load DOUBLE PRECISION,
        avg_cadence DOUBLE PRECISION,
        avg_speed DOUBLE PRECISION,
        elevation_gain_m DOUBLE PRECISION,
        calories INTEGER,
        device_name TEXT,
        external_id TEXT,
        source TEXT,
        file_type TEXT,
        raw_data JSONB,
        source_hash VARCHAR(64),
        has_gps BOOLEAN DEFAULT FALSE,
        has_hr BOOLEAN DEFAULT FALSE,
        has_power BOOLEAN DEFAULT FALSE,
        has_cadence BOOLEAN DEFAULT FALSE,
        summary_polyline TEXT,
        PRIMARY KEY (activity_id, start_time)
    )
    """,
    """
    CREATE TABLE user_integrations (
        athlete_id UUID NOT NULL,
        source TEXT NOT NULL,
        connected BOOLEAN NOT NULL DEFAULT TRUE,
        settings JSONB NOT NULL DEFAULT '{}'::jsonb
    )
    """,
    """
    CREATE TABLE integration_sync_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        athlete_id UUID NOT NULL,
        source TEXT NOT NULL,
        trigger TEXT NOT NULL DEFAULT 'manual',
        window_start DATE,
        window_end DATE,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'running',
        activities_seen INTEGER DEFAULT 0,
        activities_upserted INTEGER DEFAULT 0,
        activities_deduplicated INTEGER DEFAULT 0,
        errors_count INTEGER DEFAULT 0
    )
    """,
    """
    CREATE TABLE source_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        athlete_id UUID NOT NULL,
        source TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        raw_payload JSONB NOT NULL,
        payload_hash TEXT NOT NULL,
        sync_run_id UUID,
        status TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE integration_sync_errors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sync_run_id UUID NOT NULL,
        athlete_id UUID NOT NULL,
        source TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        source_record_id TEXT,
        activity_id TEXT,
        error_code TEXT,
        message TEXT NOT NULL,
        retryable BOOLEAN DEFAULT TRUE
    )
    """,
)
