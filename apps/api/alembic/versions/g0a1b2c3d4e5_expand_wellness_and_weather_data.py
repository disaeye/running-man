"""expand wellness columns, activity weather columns, and wellness fact metrics

Revision ID: g0a1b2c3d4e5
Revises: b1c2d3e4f5b7
Create Date: 2026-09-02 00:01:00

Three coordinated changes:

1. ``health_wellness`` gains the remaining Intervals.icu wellness fields the
   sync previously discarded: HRV SDNN, sleep quality / sleeping HR, SpO2,
   respiration rate, blood pressure, nutrition (kcal / carbs / protein / fat),
   hydration rating, body fat, menstrual phase (actual + predicted) and injury
   status.
2. ``activity_summary`` gains the per-activity weather block Intervals.icu
   already returns (temperature, feels-like, wind, clouds, rain, snow).
3. ``get_athlete_daily_facts`` / ``get_athlete_weekly_facts`` unpivot the new
   wellness columns into the EAV stream (weekly totals for steps and the
   nutrition columns), and ``metric_definitions`` is re-synced from the
   regenerated contract registry so the EAV gate lets them surface.

Function signatures are unchanged; the change is a pure superset.
"""

import sqlalchemy as sa

from alembic import op
from infrastructure.db.domain_constraints import metric_rows

revision = "g0a1b2c3d4e5"
down_revision = "b1c2d3e4f5b7"
branch_labels = None
depends_on = None

_WELLNESS_COLUMNS = [
    ("hrv_sdnn", sa.Double()),
    ("sleep_quality", sa.SmallInteger()),
    ("avg_sleeping_hr", sa.SmallInteger()),
    ("spo2", sa.SmallInteger()),
    ("respiration_rate", sa.Double()),
    ("systolic_bp", sa.SmallInteger()),
    ("diastolic_bp", sa.SmallInteger()),
    ("kcal_consumed", sa.Integer()),
    ("carbs_g", sa.Double()),
    ("protein_g", sa.Double()),
    ("fat_g", sa.Double()),
    ("hydration", sa.SmallInteger()),
    ("body_fat_pct", sa.Double()),
    ("menstrual_phase", sa.SmallInteger()),
    ("menstrual_phase_predicted", sa.SmallInteger()),
    ("injury_status", sa.SmallInteger()),
]

_WEATHER_COLUMNS = [
    ("weather_avg_temp", sa.Double()),
    ("weather_min_temp", sa.Double()),
    ("weather_max_temp", sa.Double()),
    ("weather_feels_like", sa.Double()),
    ("weather_wind_speed", sa.Double()),
    ("weather_wind_gust", sa.Double()),
    ("weather_wind_deg", sa.Double()),
    ("weather_headwind_pct", sa.Double()),
    ("weather_tailwind_pct", sa.Double()),
    ("weather_clouds_pct", sa.Double()),
    ("weather_max_rain", sa.Double()),
    ("weather_max_snow", sa.Double()),
]

_DAILY_FACTS_SQL = r"""
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
        FROM activity_compute AS a
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
        FROM activity_compute AS a
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
            ('source_readiness'::text,          'score'::text,       h.readiness::double precision),
            ('resting_hr'::text,                'bpm'::text,         h.resting_hr::double precision),
            ('hrv'::text,                       'ms'::text,          h.hrv),
            ('sleep_secs'::text,                's'::text,           h.sleep_secs::double precision),
            ('weight'::text,                    'kg'::text,          h.weight),
            ('sleep_score'::text,               'score'::text,       h.sleep_score::double precision),
            ('sleep_quality'::text,             'rating'::text,      h.sleep_quality::double precision),
            ('avg_sleeping_hr'::text,           'bpm'::text,         h.avg_sleeping_hr::double precision),
            ('hrv_sdnn'::text,                  'ms'::text,          h.hrv_sdnn),
            ('spo2'::text,                      'percent'::text,     h.spo2::double precision),
            ('respiration_rate'::text,          'brpm'::text,        h.respiration_rate),
            ('systolic_bp'::text,               'mmhg'::text,        h.systolic_bp::double precision),
            ('diastolic_bp'::text,              'mmhg'::text,        h.diastolic_bp::double precision),
            ('vo2max'::text,                    'ml_kg_min'::text,   h.vo2max),
            ('steps'::text,                     'count'::text,       h.steps::double precision),
            ('kcal_consumed'::text,             'kcal'::text,        h.kcal_consumed::double precision),
            ('carbs_g'::text,                   'g'::text,           h.carbs_g),
            ('protein_g'::text,                 'g'::text,           h.protein_g),
            ('fat_g'::text,                     'g'::text,           h.fat_g),
            ('hydration'::text,                 'rating'::text,      h.hydration::double precision),
            ('body_fat_pct'::text,              'percent'::text,     h.body_fat_pct),
            ('menstrual_phase'::text,           'phase_code'::text,  h.menstrual_phase::double precision),
            ('menstrual_phase_predicted'::text, 'phase_code'::text,  h.menstrual_phase_predicted::double precision),
            ('fatigue'::text,                   'rating'::text,      h.fatigue::double precision),
            ('soreness'::text,                  'rating'::text,      h.soreness::double precision),
            ('stress'::text,                    'rating'::text,      h.stress::double precision),
            ('mood'::text,                      'rating'::text,      h.mood::double precision),
            ('motivation'::text,                'rating'::text,      h.motivation::double precision),
            ('injury_status'::text,             'rating'::text,      h.injury_status::double precision)
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
                                  'tss', 'daily_tss', 'sleep_secs',
                                  'steps', 'kcal_consumed', 'carbs_g', 'protein_g', 'fat_g')
                THEN sum(f.value)::double precision
            ELSE avg(f.value)::double precision
        END AS value,
        count(*)::integer AS points
    FROM get_athlete_daily_facts(p_athlete_id, p_start, p_end) AS f
    GROUP BY 1, 2, 3, 4
    ORDER BY 1, 2 NULLS FIRST, 3
$$;
"""

_PREVIOUS_DAILY_FACTS_SQL = r"""
CREATE OR REPLACE FUNCTION get_athlete_daily_facts(
    p_athlete_id uuid,
    p_start date,
    p_end date
)
RETURNS TABLE (
    day date, sport text, metric_key text, unit text,
    value double precision, algorithm_version text, computed_at timestamptz
)
LANGUAGE sql STABLE AS $$
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
        FROM activity_compute AS a
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
        FROM activity_compute AS a
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
            v.metric_key,
            v.unit,
            avg(v.value)::double precision AS value,
            'source_input'::text AS algorithm_version,
            h.day::timestamptz AS computed_at
        FROM health_wellness AS h
        CROSS JOIN LATERAL (VALUES
            ('source_readiness'::text, 'score'::text, h.readiness::double precision),
            ('resting_hr'::text,       'bpm'::text,   h.resting_hr::double precision),
            ('hrv'::text,              'ms'::text,    h.hrv),
            ('sleep_secs'::text,       's'::text,     h.sleep_secs::double precision),
            ('weight'::text,           'kg'::text,    h.weight)
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
    p_athlete_id uuid, p_start date, p_end date
)
RETURNS TABLE (
    week_start date, sport text, metric_key text, unit text,
    value double precision, points integer
)
LANGUAGE sql STABLE AS $$
    SELECT
        date_trunc('week', f.day)::date AS week_start,
        f.sport, f.metric_key, f.unit,
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

_NEW_METRIC_KEYS = (
    "sleep_score",
    "sleep_quality",
    "avg_sleeping_hr",
    "hrv_sdnn",
    "spo2",
    "respiration_rate",
    "systolic_bp",
    "diastolic_bp",
    "vo2max",
    "steps",
    "kcal_consumed",
    "carbs_g",
    "protein_g",
    "fat_g",
    "hydration",
    "body_fat_pct",
    "menstrual_phase",
    "menstrual_phase_predicted",
    "fatigue",
    "soreness",
    "stress",
    "mood",
    "motivation",
    "injury_status",
)

_UPSERT_METRIC = sa.text("""
INSERT INTO metric_definitions (
    metric_key, unit, display_name, display_unit, classification, category,
    materialization, null_semantics, legal_min, legal_max, ui_precision,
    zones, note, source_table, source_column, aggregation
) VALUES (
    :key, :unit, :display_name, :display_unit, :classification, :category,
    :materialization, :null_semantics, :legal_min, :legal_max, :ui_precision,
    CAST(:zones AS jsonb), :note, :source_table, :source_column, :aggregation
)
ON CONFLICT (metric_key) DO UPDATE SET
    unit = EXCLUDED.unit,
    display_name = EXCLUDED.display_name,
    display_unit = EXCLUDED.display_unit,
    classification = EXCLUDED.classification,
    category = EXCLUDED.category,
    materialization = EXCLUDED.materialization,
    null_semantics = EXCLUDED.null_semantics,
    legal_min = EXCLUDED.legal_min,
    legal_max = EXCLUDED.legal_max,
    ui_precision = EXCLUDED.ui_precision,
    zones = EXCLUDED.zones,
    note = EXCLUDED.note,
    source_table = EXCLUDED.source_table,
    source_column = EXCLUDED.source_column,
    aggregation = EXCLUDED.aggregation,
    deprecated_at = NULL
""")


def upgrade() -> None:
    for column_name, column_type in _WELLNESS_COLUMNS:
        op.add_column("health_wellness", sa.Column(column_name, column_type))
    for column_name, column_type in _WEATHER_COLUMNS:
        op.add_column("activity_summary", sa.Column(column_name, column_type))
    op.execute(_DAILY_FACTS_SQL)
    bind = op.get_bind()
    bind.execute(_UPSERT_METRIC, metric_rows())


def downgrade() -> None:
    op.execute(_PREVIOUS_DAILY_FACTS_SQL)
    for column_name, _column_type in reversed(_WEATHER_COLUMNS):
        op.drop_column("activity_summary", column_name)
    for column_name, _column_type in reversed(_WELLNESS_COLUMNS):
        op.drop_column("health_wellness", column_name)
    keys = ", ".join(f"'{key}'" for key in _NEW_METRIC_KEYS)
    op.execute(f"DELETE FROM metric_definitions WHERE metric_key IN ({keys})")
