"""rewrite day-keyed fact functions for athlete local-day bucketing

Revision ID: 0a1b2c3d4e5f
Revises: b1c2d3e4f5a6
Create Date: 2026-07-29 00:00:00

Day-keyed state (PMC, activity daily facts, weekly roll-ups) was bucketed on
``start_time::date`` (UTC). A 21:00 Asia/Shanghai run lands on the wrong UTC
calendar day, corrupting CTL/ATL/TSB, weekly volume, and gap detection for any
non-UTC athlete. The training day is the athlete's local day.

These functions now join ``athletes`` to read its ``timezone`` column and bucket
on ``(start_time AT TIME ZONE athletes.timezone)::date``. ``health_wellness.day``
is a DATE already entered by the athlete in their local day, so it is left
untouched. ``current_daily_facts`` (the PMC projection of
``derived_metric_facts``) is itself now timezone-aware upstream —
``pmc_facts.recompute_pmc_facts`` buckets on the athlete zone before writing
``derived_metric_facts`` — so the ``pmc_facts`` CTE here only needs to pass the
stored day through.

The python ``local_day`` helper (``domain/time``) and the PMC recomputer
(``application/load/pmc_facts``) are the upstream sources of truth; this
function must agree with them.
"""

from importlib import import_module

op = import_module("alembic.op")

revision = "0a1b2c3d4e5f"
down_revision = "b1c2d3e4f5a6"
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
    SELECT
        f.day, f.sport, f.metric_key, f.unit, f.value, f.algorithm_version, f.computed_at
    FROM (
        -- activity_summary metrics, bucketed on the athlete's local day
        SELECT
            (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date AS day,
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
        JOIN athletes AS ath ON ath.id = a.athlete_id
        JOIN sport_definitions AS s ON s.sport_key = a.sport
        CROSS JOIN LATERAL (VALUES
            ('distance_m'::text, 'm'::text, a.distance_m),
            ('duration_s'::text, 's'::text, a.duration_s::double precision),
            ('avg_hr'::text, 'bpm'::text, a.avg_hr::double precision),
            ('source_training_load'::text, 'points'::text, a.source_training_load),
            ('source_weighted_power_w'::text, 'w'::text, a.source_weighted_power_w)
        ) AS v(metric_key, unit, value)
        WHERE a.athlete_id = p_athlete_id
          AND (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date
              BETWEEN p_start AND p_end
          AND v.value IS NOT NULL
        GROUP BY 1, 2, 3, 4

        UNION ALL

        -- per-activity computed facts (normalized_power / intensity_factor / tss)
        SELECT
            (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date AS day,
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
        JOIN athletes AS ath ON ath.id = a.athlete_id
        JOIN sport_definitions AS s ON s.sport_key = a.sport
        JOIN current_activity_facts AS f
          ON f.athlete_id = a.athlete_id
         AND f.subject_key = a.activity_id
         AND f.metric_key IN ('normalized_power', 'intensity_factor', 'tss')
        WHERE a.athlete_id = p_athlete_id
          AND (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date
              BETWEEN p_start AND p_end
        GROUP BY 1, 2, 3, 4

        UNION ALL

        -- daily PMC facts (already bucketed on the local day upstream)
        SELECT
            pf.day,
            pf.sport,
            pf.metric_key,
            pf.unit,
            pf.value,
            pf.algorithm_version,
            pf.computed_at
        FROM current_daily_facts AS pf
        LEFT JOIN sport_definitions AS s ON s.sport_key = pf.sport
        WHERE pf.athlete_id = p_athlete_id
          AND pf.day BETWEEN p_start AND p_end
          AND (pf.sport IS NULL OR s.sport_key IS NOT NULL)

        UNION ALL

        -- wellness: day is a DATE already in the athlete's local calendar
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
    ) AS f
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
    # Restore the previous UTC-day versions. Kept for reversibility parity.
    op.execute(
        r"""
        CREATE OR REPLACE FUNCTION get_athlete_daily_facts(
            p_athlete_id uuid, p_start date, p_end date
        ) RETURNS TABLE (
            day date, sport text, metric_key text, unit text,
            value double precision, algorithm_version text, computed_at timestamptz
        ) LANGUAGE sql STABLE AS $$
            SELECT a.start_time::date AS day, a.sport, v.metric_key, v.unit,
                   avg(v.value)::double precision AS value, 'source_input'::text, max(a.start_time)
            FROM activity_summary a JOIN sport_definitions s ON s.sport_key = a.sport
            CROSS JOIN LATERAL (VALUES
                ('distance_m','m',a.distance_m),('duration_s','s',a.duration_s::double precision),
                ('avg_hr','bpm',a.avg_hr::double precision),
                ('source_training_load','points',a.source_training_load),
                ('source_weighted_power_w','w',a.source_weighted_power_w)
            ) AS v(metric_key,unit,value)
            WHERE a.athlete_id = p_athlete_id AND a.start_time::date BETWEEN p_start AND p_end
              AND v.value IS NOT NULL
            GROUP BY a.start_time::date, a.sport, v.metric_key, v.unit
        $$;
        """
    )
