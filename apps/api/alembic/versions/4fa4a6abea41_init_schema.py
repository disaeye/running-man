"""init schema

Mirrors infra/db/schema/001_init.sql verbatim, with IF NOT EXISTS
guards so it is idempotent against the T5-applied database.

Partition and refresh scheduling is owned by systemd user timers, not pg_cron.

Revision ID: 4fa4a6abea41
Revises:
Create Date: 2026-06-16 17:07:09.708503
"""

from importlib import import_module
from typing import Sequence, Union

op = import_module("alembic.op")

revision: str = "4fa4a6abea41"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Schemas referenced by 001_init.sql
# ---------------------------------------------------------------------------
_EXT_SQL = """
CREATE EXTENSION IF NOT EXISTS pgcrypto;
"""

_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS athletes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL DEFAULT '',
    timezone      TEXT NOT NULL DEFAULT 'UTC',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti        TEXT PRIMARY KEY,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_attempts (
    ip            TEXT PRIMARY KEY,
    failed_count  INTEGER NOT NULL DEFAULT 0,
    last_attempt  TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_until  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS health_wellness (
    day         DATE NOT NULL,
    athlete_id  UUID NOT NULL REFERENCES athletes(id),
    weight      DOUBLE PRECISION,
    resting_hr  SMALLINT,
    hrv         DOUBLE PRECISION,
    sleep_secs  INTEGER,
    sleep_score SMALLINT,
    fatigue     SMALLINT,
    soreness    SMALLINT,
    stress      SMALLINT,
    mood        SMALLINT,
    motivation  SMALLINT,
    readiness   SMALLINT,
    comments    TEXT,
    PRIMARY KEY (day, athlete_id)
) PARTITION BY RANGE (day);

CREATE TABLE IF NOT EXISTS activity_summary (
    activity_id      TEXT NOT NULL,
    athlete_id       UUID NOT NULL REFERENCES athletes(id),
    start_time       TIMESTAMPTZ NOT NULL,
    sport            TEXT NOT NULL,
    distance_m       DOUBLE PRECISION,
    duration_s       INTEGER,
    avg_hr           SMALLINT,
    max_hr           SMALLINT,
    avg_power        SMALLINT,
    source_weighted_power_w DOUBLE PRECISION,
    icu_ctl          DOUBLE PRECISION,
    source_training_load DOUBLE PRECISION,
    avg_cadence      DOUBLE PRECISION,
    avg_speed        DOUBLE PRECISION,
    elevation_gain_m DOUBLE PRECISION,
    calories         INTEGER,
    device_name      TEXT,
    external_id      TEXT,
    source           TEXT,
    file_type        TEXT,
    raw_data         JSONB,
    PRIMARY KEY (activity_id, start_time)
) PARTITION BY RANGE (start_time);

CREATE TABLE IF NOT EXISTS activity_streams (
    sample_time TIMESTAMPTZ NOT NULL,
    activity_id TEXT NOT NULL,
    athlete_id  UUID NOT NULL,
    metric_type TEXT NOT NULL,
    value       DOUBLE PRECISION NOT NULL,
    lat         DOUBLE PRECISION,
    lon         DOUBLE PRECISION,
    alt         DOUBLE PRECISION
) PARTITION BY RANGE (sample_time);

CREATE TABLE IF NOT EXISTS training_calendar (
    event_id      TEXT PRIMARY KEY,
    athlete_id    UUID NOT NULL REFERENCES athletes(id),
    start_time    TIMESTAMPTZ NOT NULL,
    category      TEXT NOT NULL,
    sport_type    TEXT,
    name          TEXT,
    workout_xml   TEXT,
    predicted_tss DOUBLE PRECISION,
    external_id   TEXT,
    status        TEXT NOT NULL DEFAULT 'planned',
    done          BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS ftp_history (
    athlete_id      UUID NOT NULL REFERENCES athletes(id),
    effective_from  DATE NOT NULL,
    ftp             INTEGER NOT NULL,
    lthr            INTEGER,
    PRIMARY KEY (athlete_id, effective_from)
);

CREATE TABLE IF NOT EXISTS daily_load (
    day        DATE NOT NULL,
    athlete_id UUID NOT NULL REFERENCES athletes(id),
    tss        DOUBLE PRECISION NOT NULL DEFAULT 0,
    ctl        DOUBLE PRECISION NOT NULL DEFAULT 0,
    atl        DOUBLE PRECISION NOT NULL DEFAULT 0,
    tsb        DOUBLE PRECISION NOT NULL DEFAULT 0,
    acwr       DOUBLE PRECISION,
    PRIMARY KEY (day, athlete_id)
);

CREATE TABLE IF NOT EXISTS webhook_events (
    event_key   TEXT PRIMARY KEY,
    event_type  TEXT NOT NULL,
    athlete_id  TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

_PARTITIONS_SQL = """
DO $$
DECLARE
    partition_start CONSTANT DATE := DATE '2025-01-01';
    partition_stop  CONSTANT DATE := date_trunc('month', CURRENT_DATE)::DATE + INTERVAL '25 months';
    month_start DATE;
    month_stop  DATE;
    suffix TEXT;
BEGIN
    month_start := partition_start;

    WHILE month_start < partition_stop LOOP
        month_stop := month_start + INTERVAL '1 month';
        suffix := to_char(month_start, 'YYYY_MM');

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS health_wellness_%s PARTITION OF health_wellness FOR VALUES FROM (%L) TO (%L)',
            suffix, month_start, month_stop
        );
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS activity_summary_%s PARTITION OF activity_summary FOR VALUES FROM (%L) TO (%L)',
            suffix, month_start, month_stop
        );
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS activity_streams_%s PARTITION OF activity_streams FOR VALUES FROM (%L) TO (%L)',
            suffix, month_start, month_stop
        );

        month_start := month_stop;
    END LOOP;
END $$;
"""

_INDEXES_SQL = """
CREATE INDEX IF NOT EXISTS idx_hw_athlete_day
    ON health_wellness (athlete_id, day DESC);
CREATE INDEX IF NOT EXISTS idx_as_athlete_time
    ON activity_summary (athlete_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_as_external
    ON activity_summary (external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ast_activity_time
    ON activity_streams (activity_id, sample_time);
CREATE INDEX IF NOT EXISTS idx_ast_athlete_time
    ON activity_streams (athlete_id, sample_time DESC);
CREATE INDEX IF NOT EXISTS idx_tc_athlete_time
    ON training_calendar (athlete_id, start_time);
CREATE INDEX IF NOT EXISTS idx_dl_athlete_day
    ON daily_load (athlete_id, day DESC);
"""

def upgrade() -> None:
    op.execute(_EXT_SQL)
    op.execute(_TABLES_SQL)
    op.execute(_PARTITIONS_SQL)
    op.execute(_INDEXES_SQL)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_dl_athlete_day")
    op.execute("DROP INDEX IF EXISTS idx_tc_athlete_time")
    op.execute("DROP INDEX IF EXISTS idx_ast_athlete_time")
    op.execute("DROP INDEX IF EXISTS idx_ast_activity_time")
    op.execute("DROP INDEX IF EXISTS idx_as_external")
    op.execute("DROP INDEX IF EXISTS idx_as_athlete_time")
    op.execute("DROP INDEX IF EXISTS idx_hw_athlete_day")

    op.execute("DROP TABLE IF EXISTS health_wellness CASCADE")
    op.execute("DROP TABLE IF EXISTS activity_summary CASCADE")
    op.execute("DROP TABLE IF EXISTS activity_streams CASCADE")
    op.execute("DROP TABLE IF EXISTS daily_load CASCADE")
    op.execute("DROP TABLE IF EXISTS ftp_history CASCADE")
    op.execute("DROP TABLE IF EXISTS training_calendar CASCADE")
    op.execute("DROP TABLE IF EXISTS login_attempts CASCADE")
    op.execute("DROP TABLE IF EXISTS revoked_tokens CASCADE")
    op.execute("DROP TABLE IF EXISTS webhook_events CASCADE")
    op.execute("DROP TABLE IF EXISTS athletes CASCADE")
