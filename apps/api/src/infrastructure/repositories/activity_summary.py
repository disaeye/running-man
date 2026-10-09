UPSERT_SQL = """
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
           %s::double precision AS weather_max_rain, %s::double precision AS weather_max_snow
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
        has_gps = coalesce((i.raw_data ? 'latlng'), false),
        has_hr = i.avg_hr IS NOT NULL,
        has_power = i.avg_power IS NOT NULL,
        has_cadence = i.avg_cadence IS NOT NULL,
        summary_polyline = i.summary_polyline,
        weather_avg_temp = i.weather_avg_temp,
        weather_min_temp = i.weather_min_temp,
        weather_max_temp = i.weather_max_temp,
        weather_feels_like = i.weather_feels_like,
        weather_wind_speed = i.weather_wind_speed,
        weather_wind_gust = i.weather_wind_gust,
        weather_wind_deg = i.weather_wind_deg,
        weather_headwind_pct = i.weather_headwind_pct,
        weather_tailwind_pct = i.weather_tailwind_pct,
        weather_clouds_pct = i.weather_clouds_pct,
        weather_max_rain = i.weather_max_rain,
        weather_max_snow = i.weather_max_snow
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
      weather_tailwind_pct, weather_clouds_pct, weather_max_rain, weather_max_snow)
    SELECT activity_id, athlete_id, start_time, sport, distance_m, duration_s,
           avg_hr, max_hr, avg_power, source_weighted_power_w, icu_ctl, source_training_load,
           avg_cadence, avg_speed, elevation_gain_m, calories, device_name,
             external_id, source, file_type, raw_data, source_hash,
               coalesce((raw_data ? 'latlng'), false), avg_hr IS NOT NULL,
             avg_power IS NOT NULL, avg_cadence IS NOT NULL, summary_polyline,
             weather_avg_temp, weather_min_temp, weather_max_temp, weather_feels_like,
             weather_wind_speed, weather_wind_gust, weather_wind_deg, weather_headwind_pct,
             weather_tailwind_pct, weather_clouds_pct, weather_max_rain, weather_max_snow
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
     weather_avg_temp = EXCLUDED.weather_avg_temp,
     weather_min_temp = EXCLUDED.weather_min_temp,
     weather_max_temp = EXCLUDED.weather_max_temp,
     weather_feels_like = EXCLUDED.weather_feels_like,
     weather_wind_speed = EXCLUDED.weather_wind_speed,
     weather_wind_gust = EXCLUDED.weather_wind_gust,
     weather_wind_deg = EXCLUDED.weather_wind_deg,
     weather_headwind_pct = EXCLUDED.weather_headwind_pct,
     weather_tailwind_pct = EXCLUDED.weather_tailwind_pct,
     weather_clouds_pct = EXCLUDED.weather_clouds_pct,
     weather_max_rain = EXCLUDED.weather_max_rain,
     weather_max_snow = EXCLUDED.weather_max_snow
     RETURNING FALSE AS deduplicated
)
SELECT deduplicated FROM updated
UNION ALL
SELECT deduplicated FROM inserted
"""
