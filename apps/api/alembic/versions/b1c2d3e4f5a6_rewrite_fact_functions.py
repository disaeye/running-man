"""rewrite fact functions over current projections

Revision ID: b1c2d3e4f5a6
Revises: f0a1b2c3d4e5
Create Date: 2026-07-15 00:00:00
"""

from alembic import op

revision = "b1c2d3e4f5a6"
down_revision = "f0a1b2c3d4e5"
branch_labels = None
depends_on = None

_FACT_FUNCTIONS_SQL = r"""
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
    WITH activity_inputs AS (
        SELECT
            a.start_time::date AS day,
            a.sport,
            v.metric_key,
            v.unit,
            CASE
                WHEN v.metric_key IN ('distance_m', 'duration_s', 'source_training_load')
                    THEN sum(v.value)::double precision
                ELSE avg(v.value)::double precision
            END AS value,
            'source_input'::text AS algorithm_version,
            max(a.start_time) AS computed_at
        FROM activity_summary AS a
        JOIN sport_definitions AS s ON s.sport_key = a.sport
        CROSS JOIN LATERAL (VALUES
            ('distance_m'::text, 'm'::text, a.distance_m),
            ('duration_s'::text, 's'::text, a.duration_s::double precision),
            ('avg_hr'::text, 'bpm'::text, a.avg_hr::double precision),
            ('source_training_load'::text, 'points'::text, a.source_training_load),
            ('source_weighted_power_w'::text, 'w'::text, a.source_weighted_power_w)
        ) AS v(metric_key, unit, value)
        WHERE a.athlete_id = p_athlete_id
          AND a.start_time::date BETWEEN p_start AND p_end
          AND v.value IS NOT NULL
        GROUP BY a.start_time::date, a.sport, v.metric_key, v.unit
    ),
    activity_facts AS (
        SELECT
            a.start_time::date AS day,
            a.sport,
            f.metric_key,
            f.unit,
            CASE
                WHEN f.metric_key = 'tss' THEN sum(f.value)::double precision
                ELSE avg(f.value)::double precision
            END AS value,
            max(f.algorithm_version) AS algorithm_version,
            max(f.computed_at) AS computed_at
        FROM activity_summary AS a
        JOIN sport_definitions AS s ON s.sport_key = a.sport
        JOIN current_activity_facts AS f
          ON f.athlete_id = a.athlete_id
         AND f.subject_key = a.activity_id
         AND f.metric_key IN ('normalized_power', 'intensity_factor', 'tss')
        WHERE a.athlete_id = p_athlete_id
          AND a.start_time::date BETWEEN p_start AND p_end
        GROUP BY a.start_time::date, a.sport, f.metric_key, f.unit
    ),
    pmc_facts AS (
        SELECT f.day, f.sport, f.metric_key, f.unit, f.value, f.algorithm_version, f.computed_at
        FROM current_daily_facts AS f
        LEFT JOIN sport_definitions AS s ON s.sport_key = f.sport
        WHERE f.athlete_id = p_athlete_id
          AND f.day BETWEEN p_start AND p_end
          AND (f.sport IS NULL OR s.sport_key IS NOT NULL)
    ),
    wellness AS (
        SELECT
            h.day,
            NULL::text AS sport,
            'source_readiness'::text AS metric_key,
            'score'::text AS unit,
            avg(h.readiness)::double precision AS value,
            'source_input'::text AS algorithm_version,
            h.day::timestamptz AS computed_at
        FROM health_wellness AS h
        WHERE h.athlete_id = p_athlete_id
          AND h.day BETWEEN p_start AND p_end
          AND h.readiness IS NOT NULL
        GROUP BY h.day
    ),
    facts AS (
        SELECT * FROM pmc_facts
        UNION ALL SELECT * FROM activity_inputs
        UNION ALL SELECT * FROM activity_facts
        UNION ALL SELECT * FROM wellness
    )
    SELECT f.day, f.sport, f.metric_key, f.unit, f.value, f.algorithm_version, f.computed_at
    FROM facts AS f
    JOIN current_metric_definitions AS m
      ON m.metric_key = f.metric_key AND m.unit = f.unit
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
        CASE
            WHEN f.metric_key IN ('distance_m', 'duration_s', 'source_training_load', 'tss', 'daily_tss')
                THEN sum(f.value)::double precision
            ELSE avg(f.value)::double precision
        END AS value,
        count(*)::integer AS points
    FROM get_athlete_daily_facts(p_athlete_id, p_start, p_end) AS f
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2 NULLS FIRST, 3
$$;
"""


def upgrade() -> None:
    op.execute(_FACT_FUNCTIONS_SQL)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS get_athlete_weekly_facts(uuid, date, date)")
    op.execute("DROP FUNCTION IF EXISTS get_athlete_daily_facts(uuid, date, date)")
