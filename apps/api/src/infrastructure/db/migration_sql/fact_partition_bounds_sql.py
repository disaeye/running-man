"""``get_athlete_daily_facts`` for both directions of the partition-bounds migration.

``activity_summary`` is RANGE-partitioned on ``start_time``. The fact function
filters it by the athlete's local calendar day, which is an expression on the
partition key: PostgreSQL cannot prune partitions from that expression and
opens every monthly partition. Adding a wider UTC bound on ``start_time`` lets
the planner keep only the relevant partitions while the local-day filter stays
unchanged, so the result set is identical.

IANA offsets range from UTC-12 to UTC+14. Every instant whose local day lies in
[p_start, p_end] is inside UTC [p_start 00:00 - 14h, p_end+1 00:00 + 12h]. One
day of lower margin and two days of upper margin are safely wider, and the
bounds are built with ``AT TIME ZONE 'UTC'`` so the session timezone cannot
narrow them.

The weekly function only aggregates the daily function, so it needs no change.
"""

_BOUNDS = (
    "          AND a.start_time >= ((p_start - 1)::timestamp AT TIME ZONE 'UTC')\n"
    "          AND a.start_time < ((p_end + 2)::timestamp AT TIME ZONE 'UTC')\n"
)

_HEADER = """CREATE OR REPLACE FUNCTION public.get_athlete_daily_facts(
    p_athlete_id uuid, p_start date, p_end date
)
RETURNS TABLE (
    day date, sport text, metric_key text, unit text,
    value double precision, algorithm_version text, computed_at timestamptz
)
LANGUAGE sql STABLE AS $$
    SELECT
        f.day, f.sport, f.metric_key, f.unit, f.value, f.algorithm_version, f.computed_at
    FROM (
        -- activity_summary metrics, bucketed on the athlete's local day
        SELECT
            (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date AS day,
            a.sport, v.metric_key, v.unit,
            CASE WHEN v.metric_key IN ('distance_m', 'duration_s', 'source_training_load')
                 THEN sum(v.value)::double precision
                 ELSE avg(v.value)::double precision END AS value,
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
{bounds}          AND v.value IS NOT NULL
        GROUP BY 1, 2, 3, 4

        UNION ALL

        -- per-activity computed facts (normalized_power / intensity_factor / tss)
        SELECT
            (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date AS day,
            a.sport, f.metric_key, f.unit,
            CASE WHEN f.metric_key = 'tss' THEN sum(f.value)::double precision
                 ELSE avg(f.value)::double precision END AS value,
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
{bounds}        GROUP BY 1, 2, 3, 4

        UNION ALL

        -- daily PMC facts (already bucketed on the local day upstream)
        SELECT pf.day, pf.sport, pf.metric_key, pf.unit, pf.value,
               pf.algorithm_version, pf.computed_at
        FROM current_daily_facts AS pf
        LEFT JOIN sport_definitions AS s ON s.sport_key = pf.sport
        WHERE pf.athlete_id = p_athlete_id
          AND pf.day BETWEEN p_start AND p_end
          AND (pf.sport IS NULL OR s.sport_key IS NOT NULL)

        UNION ALL

        -- wellness: all health_wellness columns unpivoted into EAV rows.
        SELECT h.day, NULL::text AS sport, v.metric_key, v.unit,
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
"""

DAILY_FACTS_WITH_BOUNDS = _HEADER.format(bounds=_BOUNDS)
DAILY_FACTS_WITHOUT_BOUNDS = _HEADER.format(bounds="")
