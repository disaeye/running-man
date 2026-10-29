"""Fetching and storing the weather of an activity.

The archive service answers with ERA5 reanalysis for the position and hours
of a request. This module turns one activity's GPS position into that request,
and stores the answer on the activity row together with the source name, so
the page can say where the numbers came from.

Two rules keep the data honest:

* An activity whose position is unknown is never asked about. A run on a
  treadmill has no place on Earth, and the weather of the athlete's home
  city would be a fiction.
* A failed request never overwrites an existing figure. The activity keeps
  the weather it already had, and the failure is reported.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Final
from uuid import UUID

import httpx
import psycopg

from infrastructure.weather.archive import WEATHER_SOURCE as ARCHIVE_WEATHER_SOURCE
from infrastructure.weather.archive import (
    ActivityPosition,
    WeatherObservation,
    build_archive_url,
    parse_archive_response,
)

_logger = logging.getLogger(__name__)

WEATHER_SOURCE: Final = ARCHIVE_WEATHER_SOURCE

# 经纬度合法范围：纬度 ±90，经度 ±180。
_MAX_LATITUDE: Final = 90.0
_MAX_LONGITUDE: Final = 180.0

# The archive service answers in well under a second for a single day; the
# timeout is generous enough for a slow moment and short enough that a hung
# connection does not hold the sync open.
REQUEST_TIMEOUT_SECONDS: Final = 15.0

# How many activities one weather backfill pass looks at.
WEATHER_BATCH_SIZE: Final = 200


@dataclass(frozen=True, slots=True)
class WeatherFetchResult:
    """The outcome of one weather request."""

    activity_id: str
    written: bool
    observation: WeatherObservation | None = None
    error: str | None = None


def position_from_activity(row: dict[str, object]) -> ActivityPosition | None:
    """The activity's start position, or ``None`` when it has none.

    The position comes from the first GPS sample of the activity, which is
    where the athlete started. The polyline is preferred because it is stored
    for every activity with GPS; the stream coordinates are the fallback.
    """
    latitude = _coordinate(row.get("first_lat"))
    longitude = _coordinate(row.get("first_lon"))
    if latitude is None or longitude is None:
        return None
    start_time = row.get("start_time")
    if not isinstance(start_time, datetime):
        return None
    duration = row.get("duration_s")
    return ActivityPosition(
        latitude=latitude,
        longitude=longitude,
        start_time=start_time,
        duration_s=int(duration) if isinstance(duration, int) else None,
    )


def fetch_observation(
    position: ActivityPosition,
    client: httpx.Client,
) -> WeatherObservation:
    """Ask the archive service for the conditions of one activity."""
    response = client.get(build_archive_url(position), timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        msg = "weather archive returned a non-object payload"
        raise ValueError(msg)
    return parse_archive_response(payload, position)


def store_observation(
    conn: psycopg.Connection,
    activity_id: str,
    observation: WeatherObservation,
) -> bool:
    """Write one observation onto the activity row.

    Returns whether a row was written. An observation without any usable
    figure is not written: the page would show an empty weather tag either
    way, and a row of NULLs would look like a failed fetch.
    """
    if observation.is_empty:
        return False
    with conn.cursor() as cur:
        _ = cur.execute(
            "UPDATE activity_summary SET "
            "weather_avg_temp = %s, weather_min_temp = %s, weather_max_temp = %s, "
            "weather_feels_like = %s, weather_wind_speed = %s, weather_wind_deg = %s, "
            "weather_clouds_pct = %s, weather_max_rain = %s, "
            "weather_source = %s, weather_fetched_at = now() "
            "WHERE activity_id = %s",
            (
                observation.avg_temp_c,
                observation.min_temp_c,
                observation.max_temp_c,
                observation.feels_like_c,
                observation.wind_speed_kmh,
                observation.wind_deg,
                observation.clouds_pct,
                observation.max_rain_mm,
                WEATHER_SOURCE,
                activity_id,
            ),
        )
        return cur.rowcount > 0


def fetch_for_activity(
    conn: psycopg.Connection,
    row: dict[str, object],
    client: httpx.Client,
) -> WeatherFetchResult:
    """Fetch and store the weather of one activity.

    The activity's own error is reported rather than raised: one activity
    without weather does not stop a sync of a hundred.
    """
    activity_id = str(row.get("activity_id") or "")
    position = position_from_activity(row)
    if position is None:
        return WeatherFetchResult(activity_id=activity_id, written=False)
    try:
        observation = fetch_observation(position, client)
    except (httpx.HTTPError, ValueError) as error:
        _logger.warning("weather fetch failed for %s: %s", activity_id, error)
        return WeatherFetchResult(activity_id=activity_id, written=False, error=str(error))
    written = store_observation(conn, activity_id, observation)
    return WeatherFetchResult(activity_id=activity_id, written=written, observation=observation)


def activities_without_weather(
    conn: psycopg.Connection,
    athlete_id: UUID | str | None = None,
) -> list[dict[str, object]]:
    """Activities that carry a position but no weather yet.

    The first GPS sample of the activity gives the position, so the query does
    not need the whole stream. Activities that already have a weather figure
    are skipped, whatever its source.

    ``athlete_id`` of ``None`` means every athlete, which is what the
    maintenance script uses.
    """
    with conn.cursor() as cur:
        _ = cur.execute(
            """
            SELECT a.activity_id, a.start_time, a.duration_s,
                   (SELECT s.lat FROM activity_streams s
                     WHERE s.activity_id = a.activity_id AND s.lat IS NOT NULL
                     ORDER BY s.sample_time LIMIT 1) AS first_lat,
                   (SELECT s.lon FROM activity_streams s
                     WHERE s.activity_id = a.activity_id AND s.lon IS NOT NULL
                     ORDER BY s.sample_time LIMIT 1) AS first_lon
            FROM activity_summary a
            WHERE (%s::uuid IS NULL OR a.athlete_id = %s::uuid)
              AND a.weather_source IS NULL
              AND a.weather_avg_temp IS NULL
              AND EXISTS (SELECT 1 FROM activity_streams s
                           WHERE s.activity_id = a.activity_id AND s.lat IS NOT NULL)
            ORDER BY a.start_time DESC
            LIMIT %s
            """,
            (athlete_id, athlete_id, WEATHER_BATCH_SIZE),
        )
        rows: list[dict[str, object]] = []
        for row in cur.fetchall():
            rows.append(_row_to_dict(row))
    return rows


def _row_to_dict(row: object) -> dict[str, object]:
    """One selected row as a dict.

    The sync pool returns plain tuples while the application pool returns
    dicts, so the row is read by position: the column order of the query
    above is fixed, and both pools return the columns in it.
    """
    if isinstance(row, dict):
        return dict(row)
    if isinstance(row, list | tuple):
        values = list(row)
        return {
            "activity_id": values[0],
            "start_time": values[1],
            "duration_s": values[2],
            "first_lat": values[3],
            "first_lon": values[4],
        }
    raise TypeError("unexpected activity row shape")


def _coordinate(value: object) -> float | None:
    if isinstance(value, int | float):
        number = float(value)
        if -_MAX_LATITUDE <= number <= _MAX_LATITUDE:
            return number
        if -_MAX_LONGITUDE <= number <= _MAX_LONGITUDE:
            return number
    return None
