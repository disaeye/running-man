"""project all wellness metrics into the EAV fact stream

Revision ID: f6a7b8c9d0e1
Revises: f5a6b7c8d9e0
Create Date: 2026-08-10 00:02:00

``get_athlete_daily_facts`` previously projected only ``health_wellness.readiness``
into the EAV stream (as ``source_readiness``). The other four wellness columns —
``resting_hr``, ``hrv``, ``sleep_secs``, ``weight`` — were invisible to any EAV
consumer, forcing the front-end into a parallel wide-table data path
(``useWellness`` + ``/api/v1/wellness``).

This migration extends the wellness CTE to unpivot all five ``health_wellness``
columns into EAV rows via a ``LATERAL VALUES`` clause. The final ``JOIN`` on
``current_metric_definitions`` (``metric_key + unit``) gates which columns
actually surface — so only metrics registered in the contract are emitted.

Daily aggregation for wellness metrics is ``avg`` (matching the existing
``source_readiness`` pattern for multi-entry days). Weekly aggregation adds
``sleep_secs`` to the ``sum`` group (weekly sleep total is meaningful) while
``resting_hr``/``hrv``/``weight``/``source_readiness`` use ``avg``.

Function signatures (parameters, return columns) are unchanged — this is a
pure superset addition. Existing metric queries (PMC, distance, duration, TSS)
are unaffected because the ``WHERE metric_key = ...`` filter in the repository
layer scopes results to the requested metric.
"""

from importlib import import_module

op = import_module("alembic.op")

revision = "f6a7b8c9d0e1"
down_revision = "f5a6b7c8d9e0"
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

        -- wellness: all health_wellness columns unpivoted into EAV rows.
        -- day is a DATE already in the athlete's local calendar.
        -- The LATERAL VALUES lists every wellness column; the final JOIN on
        -- current_metric_definitions gates which ones actually surface.
        SELECT
            h.day,
            NULL::text AS sport,
            v.metric_key,
            v.unit,
            avg(v.value)::double precision AS value,
            'source_input'::text AS algorithm_version,
            h.day::timestamptz AS computed_at
        FROM health_wellness AS h
        CROSS JOIN LATERAL (VALUES
            ('source_readiness'::text, 'score'::text, h.readiness::double precision),
            ('resting_hr'::text,         'bpm'::text,   h.resting_hr::double precision),
            ('hrv'::text,                'ms'::text,    h.hrv),
            ('sleep_secs'::text,         's'::text,     h.sleep_secs::double precision),
            ('weight'::text,             'kg'::text,    h.weight)
        ) AS v(metric_key, unit, value)
        WHERE h.athlete_id = p_athlete_id
          AND h.day BETWEEN p_start AND p_end
          AND v.value IS NOT NULL
        GROUP BY h.day, v.metric_key, v.unit
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
            WHEN f.metric_key IN ('distance_m', 'duration_s', 'source_training_load',
                                  'tss', 'daily_tss', 'sleep_secs')
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
    # Restore the previous version that projected only source_readiness.
    op.execute(
        r"""
        CREATE OR REPLACE FUNCTION get_athlete_daily_facts(
            p_athlete_id uuid,
            p_start date,
            p_end date
        ) RETURNS TABLE (
            day date, sport text, metric_key text, unit text,
            value double precision, algorithm_version text, computed_at timestamptz
        ) LANGUAGE sql STABLE AS $$
            SELECT
                f.day, f.sport, f.metric_key, f.unit, f.value, f.algorithm_version, f.computed_at
            FROM (
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

                SELECT
                    pf.day, pf.sport, pf.metric_key, pf.unit, pf.value,
                    pf.algorithm_version, pf.computed_at
                FROM current_daily_facts AS pf
                LEFT JOIN sport_definitions AS s ON s.sport_key = pf.sport
                WHERE pf.athlete_id = p_athlete_id
                  AND pf.day BETWEEN p_start AND p_end
                  AND (pf.sport IS NULL OR s.sport_key IS NOT NULL)

                UNION ALL

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
            p_athlete_id uuid, p_start date, p_end date
        ) RETURNS TABLE (
            week_start date, sport text, metric_key text, unit text,
            value double precision, points integer
        ) LANGUAGE sql STABLE AS $$
            SELECT
                date_trunc('week', f.day)::date AS week_start,
                f.sport, f.metric_key, f.unit,
                CASE
                    WHEN f.metric_key IN ('distance_m', 'duration_s', 'source_training_load',
                                          'tss', 'daily_tss')
                        THEN sum(f.value)::double precision
                    ELSE avg(f.value)::double precision
                END AS value,
                count(*)::integer AS points
            FROM get_athlete_daily_facts(p_athlete_id, p_start, p_end) AS f
            GROUP BY 1, 2, 3, 4
            ORDER BY 1, 2 NULLS FIRST, 3
        $$;
        """
    )
