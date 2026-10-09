from __future__ import annotations

from uuid import UUID

import psycopg

from infrastructure.integrations.intervals import sync

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000003")


def test_activity_summary_polyline_roundtrip(
    db_conn: psycopg.Connection,
) -> None:
    """INSERT with summary_polyline, then SELECT — value round-trips correctly."""
    _ensure_schema(db_conn)

    activity: dict[str, object] = {
        "id": "polyline-test-1",
        "start_date": "2026-07-08T10:00:00Z",
        "type": "Run",
        "distance": 5000.0,
        "average_heartrate": 150,
        "summary_polyline": "TEST_POLYLINE_STRING_abc123",
    }
    with db_conn.cursor() as cur:
        cur.execute(sync._UPSERT_SQL, sync._activity_params(str(ATHLETE_ID), activity))
        cur.execute(
            """
            SELECT summary_polyline
            FROM activity_summary
            WHERE athlete_id = %s AND activity_id = %s
            """,
            (ATHLETE_ID, "polyline-test-1"),
        )
        row = cur.fetchone()

    assert row is not None
    assert isinstance(row[0], (str, bytes))
    assert (row[0] if isinstance(row[0], str) else row[0].decode()) == "TEST_POLYLINE_STRING_abc123"


def test_activity_summary_polyline_null_by_default(
    db_conn: psycopg.Connection,
) -> None:
    """Without summary_polyline in input data, column stays NULL."""
    _ensure_schema(db_conn)

    activity: dict[str, object] = {
        "id": "polyline-test-2",
        "start_date": "2026-07-08T11:00:00Z",
        "type": "Ride",
    }
    with db_conn.cursor() as cur:
        cur.execute(sync._UPSERT_SQL, sync._activity_params(str(ATHLETE_ID), activity))
        cur.execute(
            """
            SELECT summary_polyline
            FROM activity_summary
            WHERE athlete_id = %s AND activity_id = %s
            """,
            (ATHLETE_ID, "polyline-test-2"),
        )
        row = cur.fetchone()

    assert row is not None
    assert row[0] is None


def _ensure_schema(db_conn: psycopg.Connection) -> None:
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, 'hash') "
            "ON CONFLICT DO NOTHING",
            (ATHLETE_ID, f"{ATHLETE_ID}@example.com"),
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS activity_summary (
                activity_id TEXT NOT NULL,
                athlete_id UUID NOT NULL REFERENCES athletes(id),
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
            """
        )
        cur.execute(
            "ALTER TABLE activity_summary "
            "ADD COLUMN IF NOT EXISTS has_gps BOOLEAN DEFAULT FALSE"
        )
        cur.execute(
            "ALTER TABLE activity_summary "
            "ADD COLUMN IF NOT EXISTS has_hr BOOLEAN DEFAULT FALSE"
        )
        cur.execute(
            "ALTER TABLE activity_summary "
            "ADD COLUMN IF NOT EXISTS has_power BOOLEAN DEFAULT FALSE"
        )
        cur.execute(
            "ALTER TABLE activity_summary "
            "ADD COLUMN IF NOT EXISTS has_cadence BOOLEAN DEFAULT FALSE"
        )
        cur.execute(
            "ALTER TABLE activity_summary "
            "ADD COLUMN IF NOT EXISTS summary_polyline TEXT"
        )
        cur.execute(
            """
            CREATE OR REPLACE FUNCTION _has_gps(raw_data jsonb)
            RETURNS boolean
            LANGUAGE sql
            IMMUTABLE
            AS $$
                SELECT coalesce(raw_data ? 'latlng'
                    OR raw_data ? 'start_latlng'
                    OR raw_data ? 'end_latlng'
                    OR (raw_data ? 'lat' AND raw_data ? 'lon')
                    OR (raw_data ? 'latitude' AND raw_data ? 'longitude'), false)
            $$
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_as_source_hash "
            "ON activity_summary (athlete_id, source_hash) WHERE source_hash IS NOT NULL"
        )
