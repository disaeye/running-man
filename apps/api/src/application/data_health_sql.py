"""SQL constants for the data-health reports.

Kept out of ``data_health.py`` so that module holds only the read and shaping
logic and stays within the repository file-size limit.
"""

_ACTIVITY_HEALTH_QUERY = """
SELECT
    max(start_time) AS data_as_of,
    min(start_time) AS first_at,
    count(*) AS total,
    count(*) FILTER (WHERE avg_hr IS NOT NULL) AS with_hr,
    count(*) FILTER (WHERE avg_power IS NOT NULL) AS with_power,
    count(*) FILTER (WHERE has_gps IS TRUE) AS with_gps,
    count(*) FILTER (WHERE has_streams IS TRUE) AS with_streams
FROM activity_compute
WHERE athlete_id = %s
"""

_FRESHNESS_QUERY = """
SELECT
    (SELECT max(start_time) FROM activity_compute WHERE athlete_id = %s)
        AS activity_data_as_of,
    (SELECT max(day) FROM health_wellness WHERE athlete_id = %s)
        AS wellness_data_as_of
"""

_ACTIVITY_DATA_AS_OF_QUERY = """
SELECT max(start_time) AS data_as_of FROM activity_compute WHERE athlete_id = %s
"""

_WELLNESS_HEALTH_QUERY = """
SELECT
    max(day) AS data_as_of,
    min(day) AS first_day,
    count(*) AS total_days,
    max(day) AS latest_day
FROM health_wellness
WHERE athlete_id = %s
"""

_UNASSIGNED_RUN_QUERY = """
SELECT count(*)::int AS unassigned
FROM activity_compute ac
WHERE ac.athlete_id = %s
  AND ac.sport = ANY(%s)
  AND ac.start_time >= now() - interval '30 days'
  AND NOT EXISTS (
      SELECT 1 FROM gear_assignments ga WHERE ga.activity_id = ac.activity_id
  )
"""

_SYNC_STATUS_QUERY = """
SELECT last_sync_at, last_sync_status
FROM user_integrations
WHERE athlete_id = %s AND source = 'intervals_icu'
"""

_TRAINING_LOAD_HEALTH_QUERY = """
SELECT max(day) AS data_as_of
FROM current_daily_facts
WHERE athlete_id = %s AND sport IS NULL AND metric_key = 'daily_tss'
"""

_WELLNESS_COVERAGE_QUERY = """
SELECT
    count(*) FILTER (WHERE sleep_secs IS NOT NULL AND sleep_secs > 0) AS sleep_days_28d,
    count(*) FILTER (WHERE resting_hr IS NOT NULL) AS rhr_days_28d,
    count(*) FILTER (WHERE hrv IS NOT NULL) AS hrv_days_28d
FROM health_wellness
WHERE athlete_id = %s AND day >= CURRENT_DATE - INTERVAL '27 days'
"""

_STRENGTH_COVERAGE_QUERY = """
SELECT
    count(*) FILTER (WHERE start_time >= now() - interval '14 days') AS sessions_14d,
    count(*) AS sessions_total
FROM activity_compute
WHERE athlete_id = %s AND sport = 'Workout'
"""

_UPLOAD_COVERAGE_QUERY = """
SELECT
    count(*) AS runs_30d,
    count(*) FILTER (WHERE status = 'failed' OR errors_count > 0) AS failed_30d
FROM integration_sync_runs
WHERE athlete_id = %s AND source = 'manual'
  AND started_at >= now() - interval '30 days'
"""

_ATHLETE_TIMEZONE_QUERY = "SELECT timezone FROM athletes WHERE id = %s"

_GAPS_QUERY = """
WITH local_today AS (
    SELECT (now() AT TIME ZONE %s)::date AS today
), days AS (
    SELECT generate_series(
        (SELECT today FROM local_today) - INTERVAL '89 days',
        (SELECT today FROM local_today),
        INTERVAL '1 day'
    )::date AS day
), observed AS (
    SELECT DISTINCT (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date AS day
    FROM activity_compute a
    JOIN athletes ath ON ath.id = a.athlete_id
    WHERE a.athlete_id = %s
      AND (a.start_time AT TIME ZONE COALESCE(ath.timezone, 'UTC'))::date
          BETWEEN (SELECT today FROM local_today) - INTERVAL '89 days'
          AND (SELECT today FROM local_today)
    UNION
    SELECT day
    FROM health_wellness
    WHERE athlete_id = %s
      AND day BETWEEN (SELECT today FROM local_today) - INTERVAL '89 days'
          AND (SELECT today FROM local_today)
), missing AS (
    SELECT days.day
    FROM days
    LEFT JOIN observed USING (day)
    WHERE observed.day IS NULL
), grouped AS (
    SELECT day, day - (row_number() OVER (ORDER BY day)::int) AS island
    FROM missing
)
SELECT min(day) AS "from", max(day) AS "to"
FROM grouped
GROUP BY island
ORDER BY min(day)
"""
