from collections.abc import Sequence

import psycopg


def execute_upsert(cur: psycopg.Cursor[tuple[bool]], params: Sequence[object]) -> bool:
    _ = cur.execute(
        """
WITH input AS (
    SELECT %s AS activity_id, %s::uuid AS athlete_id, %s::timestamptz AS start_time, %s AS sport,
           %s::double precision AS distance_m, %s::integer AS duration_s,
           %s::smallint AS avg_hr, %s::smallint AS max_hr,
           %s::smallint AS avg_power, %s::double precision AS source_weighted_power_w,
           %s::double precision AS icu_ctl, %s::double precision AS source_training_load,
           %s::double precision AS avg_cadence,
           %s::double precision AS avg_speed, %s::double precision AS elevation_gain_m,
           %s::integer AS calories, %s AS device_name, %s AS external_id, %s AS source,
           %s AS file_type, %s::jsonb AS raw_data, %s AS source_hash, %s AS summary_polyline,
           %s::double precision AS weather_avg_temp, %s::double precision AS weather_min_temp,
           %s::double precision AS weather_max_temp, %s::double precision AS weather_feels_like,
           %s::double precision AS weather_wind_speed, %s::double precision AS weather_wind_gust,
           %s::double precision AS weather_wind_deg, %s::double precision AS weather_headwind_pct,
           %s::double precision AS weather_tailwind_pct, %s::double precision AS weather_clouds_pct,
           %s::double precision AS weather_max_rain, %s::double precision AS weather_max_snow,
           %s AS name, %s::smallint AS rpe, %s::double precision AS trimp,
           %s::double precision AS avg_stride_length_m,
           %s::double precision AS avg_lr_balance_pct,
           %s AS weather_source
), locked AS (
    SELECT pg_advisory_xact_lock(hashtextextended(athlete_id::text || '|' || source_hash::text, 0))
    FROM input
), existing AS (
    SELECT a.activity_id, a.start_time
    FROM activity_summary a, input i, locked
    WHERE a.athlete_id = i.athlete_id AND a.source_hash = i.source_hash
    LIMIT 1
), updated AS (
    UPDATE activity_summary a SET
        activity_id = i.activity_id,
        start_time = i.start_time,
        sport = i.sport,
        distance_m = i.distance_m,
        duration_s = i.duration_s,
        avg_hr = i.avg_hr,
        max_hr = i.max_hr,
        avg_power = i.avg_power,
        source_weighted_power_w = i.source_weighted_power_w,
        icu_ctl = i.icu_ctl,
        source_training_load = i.source_training_load,
        avg_cadence = i.avg_cadence,
        avg_speed = i.avg_speed,
        elevation_gain_m = i.elevation_gain_m,
        calories = i.calories,
        device_name = i.device_name,
        external_id = i.external_id,
        source = i.source,
        file_type = i.file_type,
        raw_data = i.raw_data,
        source_hash = i.source_hash,
        has_gps = coalesce(jsonb_exists(i.raw_data, 'latlng'), false),
        has_hr = i.avg_hr IS NOT NULL,
        has_power = i.avg_power IS NOT NULL,
        has_cadence = i.avg_cadence IS NOT NULL,
        summary_polyline = i.summary_polyline,
        weather_avg_temp = COALESCE(i.weather_avg_temp, a.weather_avg_temp),
        weather_min_temp = COALESCE(i.weather_min_temp, a.weather_min_temp),
        weather_max_temp = COALESCE(i.weather_max_temp, a.weather_max_temp),
        weather_feels_like = COALESCE(i.weather_feels_like, a.weather_feels_like),
        weather_wind_speed = COALESCE(i.weather_wind_speed, a.weather_wind_speed),
        weather_wind_gust = COALESCE(i.weather_wind_gust, a.weather_wind_gust),
        weather_wind_deg = COALESCE(i.weather_wind_deg, a.weather_wind_deg),
        weather_headwind_pct = COALESCE(i.weather_headwind_pct, a.weather_headwind_pct),
        weather_tailwind_pct = COALESCE(i.weather_tailwind_pct, a.weather_tailwind_pct),
        weather_clouds_pct = COALESCE(i.weather_clouds_pct, a.weather_clouds_pct),
        weather_max_rain = COALESCE(i.weather_max_rain, a.weather_max_rain),
        weather_max_snow = COALESCE(i.weather_max_snow, a.weather_max_snow),
        weather_source = COALESCE(i.weather_source, a.weather_source),
        name = COALESCE(i.name, a.name),
        rpe = COALESCE(i.rpe, a.rpe),
        trimp = COALESCE(i.trimp, a.trimp),
        avg_stride_length_m = COALESCE(i.avg_stride_length_m, a.avg_stride_length_m),
        avg_lr_balance_pct = COALESCE(i.avg_lr_balance_pct, a.avg_lr_balance_pct)
    FROM existing, input i
    WHERE a.activity_id = existing.activity_id AND a.start_time = existing.start_time
    RETURNING TRUE AS deduplicated
), inserted AS (
    INSERT INTO activity_summary
     (activity_id, athlete_id, start_time, sport, distance_m, duration_s,
      avg_hr, max_hr, avg_power, source_weighted_power_w, icu_ctl, source_training_load,
      avg_cadence, avg_speed, elevation_gain_m, calories, device_name,
      external_id, source, file_type, raw_data, source_hash,
      has_gps, has_hr, has_power, has_cadence, summary_polyline,
      weather_avg_temp, weather_min_temp, weather_max_temp, weather_feels_like,
      weather_wind_speed, weather_wind_gust, weather_wind_deg, weather_headwind_pct,
      weather_tailwind_pct, weather_clouds_pct, weather_max_rain, weather_max_snow,
      name, rpe, trimp, avg_stride_length_m, avg_lr_balance_pct, weather_source)
    SELECT activity_id, athlete_id, start_time, sport, distance_m, duration_s,
           avg_hr, max_hr, avg_power, source_weighted_power_w, icu_ctl, source_training_load,
           avg_cadence, avg_speed, elevation_gain_m, calories, device_name,
           external_id, source, file_type, raw_data, source_hash,
           coalesce(jsonb_exists(raw_data, 'latlng'), false), avg_hr IS NOT NULL,
           avg_power IS NOT NULL, avg_cadence IS NOT NULL, summary_polyline,
           weather_avg_temp, weather_min_temp, weather_max_temp, weather_feels_like,
           weather_wind_speed, weather_wind_gust, weather_wind_deg, weather_headwind_pct,
           weather_tailwind_pct, weather_clouds_pct, weather_max_rain, weather_max_snow,
           name, rpe, trimp, avg_stride_length_m, avg_lr_balance_pct, weather_source
    FROM input
    WHERE NOT EXISTS (SELECT 1 FROM updated)
    ON CONFLICT (activity_id, start_time) DO UPDATE SET
        athlete_id = EXCLUDED.athlete_id,
        sport = EXCLUDED.sport,
        distance_m = EXCLUDED.distance_m,
        duration_s = EXCLUDED.duration_s,
        avg_hr = EXCLUDED.avg_hr,
        max_hr = EXCLUDED.max_hr,
        avg_power = EXCLUDED.avg_power,
        source_weighted_power_w = EXCLUDED.source_weighted_power_w,
        icu_ctl = EXCLUDED.icu_ctl,
        source_training_load = EXCLUDED.source_training_load,
        avg_cadence = EXCLUDED.avg_cadence,
        avg_speed = EXCLUDED.avg_speed,
        elevation_gain_m = EXCLUDED.elevation_gain_m,
        calories = EXCLUDED.calories,
        device_name = EXCLUDED.device_name,
        external_id = EXCLUDED.external_id,
        source = EXCLUDED.source,
        file_type = EXCLUDED.file_type,
        raw_data = EXCLUDED.raw_data,
        source_hash = EXCLUDED.source_hash,
        has_gps = EXCLUDED.has_gps,
        has_hr = EXCLUDED.has_hr,
        has_power = EXCLUDED.has_power,
        has_cadence = EXCLUDED.has_cadence,
        summary_polyline = EXCLUDED.summary_polyline,
        weather_avg_temp = COALESCE(
            EXCLUDED.weather_avg_temp, activity_summary.weather_avg_temp),
        weather_min_temp = COALESCE(
            EXCLUDED.weather_min_temp, activity_summary.weather_min_temp),
        weather_max_temp = COALESCE(
            EXCLUDED.weather_max_temp, activity_summary.weather_max_temp),
        weather_feels_like = COALESCE(
            EXCLUDED.weather_feels_like, activity_summary.weather_feels_like),
        weather_wind_speed = COALESCE(
            EXCLUDED.weather_wind_speed, activity_summary.weather_wind_speed),
        weather_wind_gust = COALESCE(
            EXCLUDED.weather_wind_gust, activity_summary.weather_wind_gust),
        weather_wind_deg = COALESCE(
            EXCLUDED.weather_wind_deg, activity_summary.weather_wind_deg),
        weather_headwind_pct = COALESCE(
            EXCLUDED.weather_headwind_pct, activity_summary.weather_headwind_pct),
        weather_tailwind_pct = COALESCE(
            EXCLUDED.weather_tailwind_pct, activity_summary.weather_tailwind_pct),
        weather_clouds_pct = COALESCE(
            EXCLUDED.weather_clouds_pct, activity_summary.weather_clouds_pct),
        weather_max_rain = COALESCE(EXCLUDED.weather_max_rain, activity_summary.weather_max_rain),
        weather_max_snow = COALESCE(EXCLUDED.weather_max_snow, activity_summary.weather_max_snow),
        weather_source = COALESCE(EXCLUDED.weather_source, activity_summary.weather_source),
        name = COALESCE(EXCLUDED.name, activity_summary.name),
        rpe = COALESCE(EXCLUDED.rpe, activity_summary.rpe),
        trimp = COALESCE(EXCLUDED.trimp, activity_summary.trimp),
        avg_stride_length_m = COALESCE(
            EXCLUDED.avg_stride_length_m, activity_summary.avg_stride_length_m),
        avg_lr_balance_pct = COALESCE(
            EXCLUDED.avg_lr_balance_pct, activity_summary.avg_lr_balance_pct)
    RETURNING FALSE AS deduplicated
)
SELECT deduplicated FROM updated
UNION ALL
SELECT deduplicated FROM inserted
""",
        params,
    )
    row = cur.fetchone()
    return bool(row and row[0])
