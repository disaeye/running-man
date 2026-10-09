"""absorb retained schema objects

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
Create Date: 2026-07-15 00:00:00
"""

from alembic import op

revision = "e9f0a1b2c3d4"
down_revision = "d8e9f0a1b2c3"
branch_labels = None
depends_on = None

_SYNC_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS integration_sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NOT NULL REFERENCES athletes(id),
    source TEXT NOT NULL REFERENCES source_definitions(source_key),
    trigger TEXT NOT NULL DEFAULT 'manual',
    window_start DATE,
    window_end DATE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    activities_seen INTEGER DEFAULT 0,
    activities_upserted INTEGER DEFAULT 0,
    activities_deduplicated INTEGER DEFAULT 0,
    wellness_seen INTEGER DEFAULT 0,
    streams_inserted INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    error_summary TEXT,
    detail JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT ck_integration_sync_runs_status
        CHECK (status IN ('running', 'success', 'failed', 'skipped'))
);

CREATE TABLE IF NOT EXISTS integration_sync_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_run_id UUID NOT NULL REFERENCES integration_sync_runs(id),
    athlete_id UUID NOT NULL REFERENCES athletes(id),
    source TEXT NOT NULL REFERENCES source_definitions(source_key),
    entity_type TEXT NOT NULL,
    source_record_id TEXT,
    activity_id TEXT,
    error_code TEXT,
    message TEXT NOT NULL,
    retryable BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id UUID NOT NULL REFERENCES athletes(id),
    source TEXT NOT NULL REFERENCES source_definitions(source_key),
    entity_type TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    source_updated_at TIMESTAMPTZ,
    raw_payload JSONB NOT NULL,
    payload_hash TEXT NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sync_run_id UUID REFERENCES integration_sync_runs(id),
    status TEXT NOT NULL DEFAULT 'active',
    CONSTRAINT ck_source_records_status CHECK (status IN ('active', 'rejected', 'ignored'))
);
"""

_FACT_VIEWS_SQL = """
CREATE OR REPLACE VIEW current_activity_facts AS
SELECT *
FROM current_derived_metric_facts
WHERE subject_type = 'activity';

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
   OR (subject_type = 'sport_day' AND subject_key ~ '^[a-z_]+:\\d{4}-\\d{2}-\\d{2}$');

CREATE OR REPLACE VIEW current_athlete_facts AS
SELECT *
FROM current_derived_metric_facts
WHERE subject_type = 'athlete';
"""

_FACT_FUNCTIONS_SQL = """
DROP FUNCTION IF EXISTS get_athlete_weekly_facts(uuid, date, date);
DROP FUNCTION IF EXISTS get_athlete_daily_facts(uuid, date, date);

CREATE OR REPLACE FUNCTION get_athlete_daily_facts(
    p_athlete_id uuid,
    p_start date,
    p_end date
)
RETURNS TABLE (
    day date,
    sport text,
    metric_key text,
    unit text,
    value double precision,
    algorithm_version text,
    computed_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
    SELECT f.day, f.sport, f.metric_key, f.unit, f.value, f.algorithm_version, f.computed_at
    FROM current_daily_facts AS f
    WHERE f.athlete_id = p_athlete_id
      AND f.day BETWEEN p_start AND p_end
    ORDER BY f.day, f.sport NULLS FIRST, f.metric_key
$$;

CREATE OR REPLACE FUNCTION get_athlete_weekly_facts(
    p_athlete_id uuid,
    p_start date,
    p_end date
)
RETURNS TABLE (
    week_start date,
    sport text,
    metric_key text,
    unit text,
    value double precision,
    points integer
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        date_trunc('week', f.day)::date AS week_start,
        f.sport,
        f.metric_key,
        f.unit,
        sum(f.value)::double precision AS value,
        count(*)::integer AS points
    FROM get_athlete_daily_facts(p_athlete_id, p_start, p_end) AS f
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2 NULLS FIRST, 3
$$;
"""

_DROP_OBSOLETE_SQL = """
DROP MATERIALIZED VIEW IF EXISTS mv_hr_zones;
DROP MATERIALIZED VIEW IF EXISTS mv_weekly_distance;
DROP MATERIALIZED VIEW IF EXISTS mv_daily_load;
DROP TABLE IF EXISTS daily_load CASCADE;
"""


def upgrade() -> None:
    op.execute(_SYNC_TABLES_SQL)
    op.execute(_FACT_VIEWS_SQL)
    op.execute(_FACT_FUNCTIONS_SQL)
    op.execute(_DROP_OBSOLETE_SQL)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS get_athlete_weekly_facts(uuid, date, date)")
    op.execute("DROP FUNCTION IF EXISTS get_athlete_daily_facts(uuid, date, date)")
    op.execute("DROP VIEW IF EXISTS current_athlete_facts")
    op.execute("DROP VIEW IF EXISTS current_daily_facts")
    op.execute("DROP VIEW IF EXISTS current_activity_facts")
    op.execute("DROP TABLE IF EXISTS source_records")
    op.execute("DROP TABLE IF EXISTS integration_sync_errors")
    op.execute("DROP TABLE IF EXISTS integration_sync_runs")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_load (
            day DATE NOT NULL,
            athlete_id UUID NOT NULL REFERENCES athletes(id),
            tss DOUBLE PRECISION NOT NULL DEFAULT 0,
            ctl DOUBLE PRECISION NOT NULL DEFAULT 0,
            atl DOUBLE PRECISION NOT NULL DEFAULT 0,
            tsb DOUBLE PRECISION NOT NULL DEFAULT 0,
            acwr DOUBLE PRECISION,
            PRIMARY KEY (day, athlete_id)
        )
        """
    )
