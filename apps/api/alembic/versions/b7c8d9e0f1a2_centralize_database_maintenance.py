"""centralize database maintenance ownership

Revision ID: b7c8d9e0f1a2
Revises: 6d7e8f9a0b1c
Create Date: 2026-07-15 00:00:00
"""

from importlib import import_module

op = import_module("alembic.op")

revision = "b7c8d9e0f1a2"
down_revision = "6d7e8f9a0b1c"
branch_labels = None
depends_on = None

_ARCHIVE_SQL = """
CREATE TABLE IF NOT EXISTS activity_summary_archive AS
SELECT now()::timestamptz AS archived_at,
       a.*
FROM activity_summary a
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uq_archive_activity
    ON activity_summary_archive (activity_id, start_time);
CREATE INDEX IF NOT EXISTS idx_archive_archived_at
    ON activity_summary_archive (archived_at);
CREATE INDEX IF NOT EXISTS idx_archive_athlete_time
    ON activity_summary_archive (athlete_id, start_time DESC);
"""

_MATVIEWS_SQL = """
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_load AS
SELECT date_trunc('day', activity.start_time AT TIME ZONE 'UTC')::date AS day,
       activity.athlete_id,
       sum(load.value) AS daily_tss,
       count(*) AS activities,
       sum(activity.duration_s) AS duration_s,
       sum(activity.distance_m) AS distance_m
FROM activity_summary AS activity
JOIN current_derived_metric_facts AS load
  ON load.athlete_id = activity.athlete_id
 AND load.subject_type = 'activity'
 AND load.subject_key = activity.activity_id
 AND load.metric_key = 'tss'
GROUP BY 1, 2
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_daily_load_day_athlete
    ON mv_daily_load (day, athlete_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_weekly_distance AS
SELECT date_trunc('week', start_time AT TIME ZONE 'UTC')::date AS week_start,
       athlete_id,
       sport,
       sum(distance_m) AS distance_m,
       sum(duration_s) AS duration_s,
       count(*) AS activities
FROM activity_summary
WHERE distance_m IS NOT NULL
GROUP BY 1, 2, 3
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_weekly_distance_week_athlete_sport
    ON mv_weekly_distance (week_start, athlete_id, sport);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hr_zones AS
SELECT date_trunc('day', start_time AT TIME ZONE 'UTC')::date AS day,
       athlete_id,
       sport,
       (avg_hr / 10) * 10 AS hr_band_floor,
       count(*) AS activities,
       sum(duration_s) AS duration_s
FROM activity_summary
WHERE avg_hr IS NOT NULL
GROUP BY 1, 2, 3, 4
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_hr_zones_day_athlete_sport_band
    ON mv_hr_zones (day, athlete_id, sport, hr_band_floor);
"""

_INITIAL_REFRESH_SQL = """
DO $$
DECLARE
    pop_daily boolean;
    pop_weekly boolean;
    pop_hr boolean;
BEGIN
    SELECT ispopulated INTO pop_daily FROM pg_matviews WHERE matviewname = 'mv_daily_load';
    SELECT ispopulated INTO pop_weekly FROM pg_matviews WHERE matviewname = 'mv_weekly_distance';
    SELECT ispopulated INTO pop_hr FROM pg_matviews WHERE matviewname = 'mv_hr_zones';

    IF pop_daily IS NOT TRUE THEN REFRESH MATERIALIZED VIEW mv_daily_load; END IF;
    IF pop_weekly IS NOT TRUE THEN REFRESH MATERIALIZED VIEW mv_weekly_distance; END IF;
    IF pop_hr IS NOT TRUE THEN REFRESH MATERIALIZED VIEW mv_hr_zones; END IF;
END $$;
"""

_PARTITION_FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION create_future_partitions(months_ahead integer DEFAULT 24)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    month_start date := date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month';
    month_stop date;
    suffix text;
    table_name text;
BEGIN
    FOR month_offset IN 1..months_ahead LOOP
        month_stop := month_start + INTERVAL '1 month';
        suffix := to_char(month_start, 'YYYY_MM');
        FOREACH table_name IN ARRAY ARRAY['health_wellness', 'activity_summary', 'activity_streams'] LOOP
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                table_name || '_' || suffix,
                table_name,
                month_start,
                month_stop
            );
        END LOOP;
        month_start := month_stop;
    END LOOP;
END;
$$;
"""

_PG_CRON_CLEANUP_SQL = """
DO $$
DECLARE
    job text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RETURN;
    END IF;

    FOR job IN
        SELECT jobname
        FROM cron.job
        WHERE jobname = ANY(ARRAY[
            'running-man-create-partitions',
            'create_future_partitions',
            'refresh_daily_load',
            'refresh_weekly_distance',
            'refresh_hr_zones'
        ])
    LOOP
        PERFORM cron.unschedule(jobname := job);
    END LOOP;
END $$;
"""


def upgrade() -> None:
    op.execute(_ARCHIVE_SQL)
    op.execute(_MATVIEWS_SQL)
    op.execute(_INITIAL_REFRESH_SQL)
    op.execute(_PARTITION_FUNCTION_SQL)
    op.execute(_PG_CRON_CLEANUP_SQL)


def downgrade() -> None:
    op.execute(_PG_CRON_CLEANUP_SQL)
    op.execute("DROP FUNCTION IF EXISTS create_future_partitions(integer)")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_hr_zones")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_weekly_distance")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_daily_load")
    op.execute("DROP TABLE IF EXISTS activity_summary_archive")
