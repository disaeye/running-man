"""Large SQL constants and row-param helpers for ActivityRepo.

Split out of activity.py to keep that file under the 250 LOC cap (clean-code.md).
"""

import hashlib
import json
from uuid import UUID

from domain.ingestion import canonical_stream, canonical_summary


def compute_source_hash(athlete_id: str, start_time: str, distance_m: float | None) -> str:
    time_key = str(start_time)[:16]
    dist_key = str(round((distance_m or 0) / 200))
    raw = f"{athlete_id}|{time_key}|{dist_key}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _summary_params(athlete_id: UUID, summary: dict[str, object]) -> tuple[object, ...]:
    canonical = canonical_summary(summary)
    start_time = canonical["start_time"]
    distance_m = canonical.get("distance_m")
    source_hash = compute_source_hash(str(athlete_id), str(start_time), _as_float(distance_m))
    return (
        canonical["activity_id"],
        athlete_id,
        start_time,
        canonical["sport"],
        canonical.get("distance_m"),
        canonical.get("duration_s"),
        canonical.get("avg_hr"),
        canonical.get("max_hr"),
        canonical.get("avg_power"),
        canonical.get("avg_cadence"),
        canonical.get("avg_speed"),
        canonical.get("elevation_gain_m"),
        canonical.get("calories"),
        canonical.get("external_id"),
        canonical.get("source"),
        canonical.get("file_type"),
        canonical.get("device_name"),
        json.dumps(canonical.get("raw_data", {}), ensure_ascii=True),
        source_hash,
        canonical.get("summary_polyline"),
    )


def _as_float(value: object) -> float | None:
    return float(value) if isinstance(value, int | float | str) and value != "" else None


def _stream_params(
    athlete_id: UUID, activity_id: object, stream: dict[str, object]
) -> tuple[object, ...]:
    canonical = canonical_stream(stream)
    return (
        canonical["sample_time"],
        activity_id,
        athlete_id,
        canonical["metric_type"],
        canonical["value"],
        canonical.get("lat"),
        canonical.get("lon"),
        canonical.get("alt"),
    )


_UPSERT_UPLOAD_SQL = """
WITH input AS (
    SELECT %s AS activity_id, %s AS athlete_id, %s::timestamptz AS start_time, %s AS sport,
           %s::double precision AS distance_m, %s::integer AS duration_s,
           %s::smallint AS avg_hr, %s::smallint AS max_hr,
           %s::smallint AS avg_power, %s::double precision AS avg_cadence,
           %s::double precision AS avg_speed, %s::double precision AS elevation_gain_m,
            %s::integer AS calories, %s AS external_id, %s AS source, %s AS file_type,
            %s AS device_name, %s::jsonb AS raw_data, %s AS source_hash, %s AS summary_polyline
), locked AS (
    SELECT pg_advisory_xact_lock(hashtextextended(athlete_id::text || '|' || source_hash::text, 0))
    FROM input
), existing AS (
    SELECT a.activity_id, a.start_time
    FROM activity_summary a, input i, locked
    WHERE a.athlete_id = i.athlete_id
      AND (
          a.source_hash = i.source_hash
          OR (
              a.source_hash IS NULL
              AND to_char(a.start_time, 'YYYY-MM-DD HH24:MI') = replace(left(i.start_time::text, 16), 'T', ' ')
              AND round(coalesce(a.distance_m, 0)::numeric / 200) = round(coalesce(i.distance_m, 0)::numeric / 200)
          )
      )
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
        avg_cadence = i.avg_cadence,
        avg_speed = i.avg_speed,
        elevation_gain_m = i.elevation_gain_m,
        calories = i.calories,
        external_id = i.external_id,
        source = i.source,
        file_type = i.file_type,
        device_name = i.device_name,
        raw_data = i.raw_data,
        source_hash = i.source_hash,
        summary_polyline = i.summary_polyline
    FROM existing, input i
    WHERE a.activity_id = existing.activity_id AND a.start_time = existing.start_time
    RETURNING a.activity_id, a.start_time, a.sport, a.distance_m, a.duration_s,
              a.avg_hr, a.max_hr, a.avg_power, NULL::double precision AS np,
              a.icu_ctl, NULL::double precision AS intensity_factor,
              NULL::double precision AS tss, a.avg_cadence, a.avg_speed,
              a.elevation_gain_m, a.calories, a.external_id, a.source,
              a.file_type, a.device_name, TRUE AS deduplicated
), inserted AS (
    INSERT INTO activity_summary
     (activity_id, athlete_id, start_time, sport, distance_m, duration_s,
      avg_hr, max_hr, avg_power, avg_cadence, avg_speed, elevation_gain_m,
      calories, external_id, source, file_type, device_name, raw_data, source_hash, summary_polyline)
    SELECT activity_id, athlete_id, start_time, sport, distance_m, duration_s,
           avg_hr, max_hr, avg_power, avg_cadence, avg_speed, elevation_gain_m,
           calories, external_id, source, file_type, device_name, raw_data, source_hash, summary_polyline
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
    avg_cadence = EXCLUDED.avg_cadence,
    avg_speed = EXCLUDED.avg_speed,
    elevation_gain_m = EXCLUDED.elevation_gain_m,
    calories = EXCLUDED.calories,
    external_id = EXCLUDED.external_id,
    source = EXCLUDED.source,
    file_type = EXCLUDED.file_type,
    device_name = EXCLUDED.device_name,
    raw_data = EXCLUDED.raw_data,
     source_hash = EXCLUDED.source_hash,
     summary_polyline = EXCLUDED.summary_polyline
RETURNING activity_id, start_time, sport, distance_m, duration_s, avg_hr, max_hr,
          avg_power, NULL::double precision AS np, icu_ctl,
          NULL::double precision AS intensity_factor, NULL::double precision AS tss,
          avg_cadence, avg_speed, elevation_gain_m, calories, external_id, source, file_type, device_name,
          FALSE AS deduplicated
)
SELECT * FROM updated
UNION ALL
SELECT * FROM inserted
"""


_INSERT_STREAM_SQL = """
INSERT INTO activity_streams
    (sample_time, activity_id, athlete_id, metric_type, value, lat, lon, alt)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
"""
