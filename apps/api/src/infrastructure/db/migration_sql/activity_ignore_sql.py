"""Definition of ``get_athlete_daily_facts`` for both directions of the migration.

The function reads the activity table directly, so it has to be redefined to read the
``activity_compute`` view; otherwise ignored and soft-deleted activities would still
contribute to the daily metric stream. Kept out of the migration module to stay within
the repository file-size limit.
"""

DAILY_FACTS_SQL_BASE = """
CREATE OR REPLACE FUNCTION public.get_athlete_daily_facts(p_athlete_id uuid, p_start date, p_end date)
 RETURNS TABLE(day date, sport text, metric_key text, unit text, value double precision, algorithm_version text, computed_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$
"""

DAILY_FACTS_SQL_COMPUTE = """
CREATE OR REPLACE FUNCTION public.get_athlete_daily_facts(p_athlete_id uuid, p_start date, p_end date)
 RETURNS TABLE(day date, sport text, metric_key text, unit text, value double precision, algorithm_version text, computed_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$
"""
