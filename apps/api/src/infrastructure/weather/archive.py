"""Historical weather for an activity, fetched from its GPS position.

Intervals.icu returns a weather block with an activity when its own weather
service has data for that location and time. This deployment's activities
carry none: the upstream fields are null for every stored run, so the demo
page's weather tag would never appear.

This module fills that gap from the other direction: the activity's own GPS
position and time are sent to a reanalysis service, which returns the
conditions that were recorded at that place and hour.

What the numbers are: the service's "Best Match" product, which stitches
together ECMWF IFS (9 km) and the ERA5 reanalysis into one gap-free series.
The reanalysis part lags real time by about five days and the IFS part by
about two, so the most recent days come from IFS alone and older days from
ERA5 alone. Every figure is therefore stored with ``weather_source`` and the
page can say where it came from.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from math import atan2, cos, degrees, isnan, radians, sin
from typing import Final

# The archive endpoint serves the gap-free reanalysis series. It needs no API
# key and no account; the request rate limit is generous but not unlimited.
ARCHIVE_ENDPOINT: Final = "https://archive-api.open-meteo.com/v1/archive"
WEATHER_SOURCE: Final = "open_meteo_best_match"

# The reanalysis grid is about 9-11 km wide. Two positions closer than this
# belong to the same grid cell, so one request can cover both.
_GRID_DEGREES: Final = 0.1

# A request wider than this is rejected by the service; a single day is
# always enough because a training session does not span more than a day.
_MAX_RANGE_DAYS: Final = 2

# The hours kept from the response. The service returns whole days; only the
# hours the activity covers are meaningful.
_HOURS: Final = (
    "temperature_2m",
    "apparent_temperature",
    "precipitation",
    "wind_speed_10m",
    "wind_direction_10m",
    "cloud_cover",
)


@dataclass(frozen=True, slots=True)
class WeatherObservation:
    """The conditions during one activity, as the reanalysis reports them.

    A field is ``None`` when the service did not report that channel for the
    covered hours.
    """

    avg_temp_c: float | None
    min_temp_c: float | None
    max_temp_c: float | None
    feels_like_c: float | None
    wind_speed_kmh: float | None
    wind_deg: int | None
    clouds_pct: float | None
    max_rain_mm: float | None
    covered_hours: int
    data_date: date

    @property
    def is_empty(self) -> bool:
        return self.avg_temp_c is None and self.wind_speed_kmh is None


@dataclass(frozen=True, slots=True)
class ActivityPosition:
    """Where and when an activity happened."""

    latitude: float
    longitude: float
    start_time: datetime
    duration_s: int | None

    @property
    def end_time(self) -> datetime:
        if not self.duration_s:
            return self.start_time
        return self.start_time + timedelta(seconds=self.duration_s)

    @property
    def day(self) -> date:
        return self.start_time.date()


def build_archive_url(position: ActivityPosition) -> str:
    """The archive request URL for one activity.

    The window is the activity's own day, widened by one day when the session
    runs past midnight in the athlete's local time so a late-evening run
    still has its own hours. The window never reaches past today: the archive
    service rejects a range that contains a future day with a 400.
    """
    today = datetime.now(timezone.utc).date()
    start = min(position.day - timedelta(days=1), today)
    end = max(start, min(position.day + timedelta(days=1), today))
    span = (end - start).days
    if span > _MAX_RANGE_DAYS:
        end = start + timedelta(days=_MAX_RANGE_DAYS)
    params = [
        ("latitude", f"{position.latitude:.4f}"),
        ("longitude", f"{position.longitude:.4f}"),
        ("start_date", start.isoformat()),
        ("end_date", end.isoformat()),
        ("hourly", ",".join(_HOURS)),
        ("wind_speed_unit", "kmh"),
        ("timezone", "UTC"),
        ("models", "best_match"),
    ]
    query = "&".join(f"{key}={value}" for key, value in params)
    return f"{ARCHIVE_ENDPOINT}?{query}"


def parse_archive_response(
    payload: dict[str, object], position: ActivityPosition
) -> WeatherObservation:
    """Read the archive response into the conditions of the activity's hours.

    The service returns one value per hour in UTC. An hourly value describes
    the hour it is labelled with, so a run that starts at 02:55 and ends at
    03:37 overlaps both the 02:00 and the 03:00 sample: the first half hour
    belongs to the 02:00 hour and the rest to the 03:00 one. A sample counts
    when its hour overlaps the activity, and the extremes are taken from those
    hours rather than from the whole returned day.
    """
    hourly = payload.get("hourly")
    if not isinstance(hourly, dict):
        return WeatherObservation(
            avg_temp_c=None,
            min_temp_c=None,
            max_temp_c=None,
            feels_like_c=None,
            wind_speed_kmh=None,
            wind_deg=None,
            clouds_pct=None,
            max_rain_mm=None,
            covered_hours=0,
            data_date=position.day,
        )
    times = _time_labels(hourly)
    values = {name: _series(hourly, name) for name in _HOURS if name != "time"}
    start = position.start_time.astimezone(timezone.utc)
    end = position.end_time.astimezone(timezone.utc)
    if not position.duration_s:
        end = start + timedelta(hours=1)
    covered: list[int] = []
    for index, stamp in enumerate(times):
        moment = _parse_hour(stamp)
        if moment is None:
            continue
        hour_end = moment + timedelta(hours=1)
        if moment < end and hour_end > start:
            covered.append(index)
    if not covered:
        return WeatherObservation(
            avg_temp_c=None,
            min_temp_c=None,
            max_temp_c=None,
            feels_like_c=None,
            wind_speed_kmh=None,
            wind_deg=None,
            clouds_pct=None,
            max_rain_mm=None,
            covered_hours=0,
            data_date=position.day,
        )
    temps = _pick(values.get("temperature_2m"), covered)
    feels = _pick(values.get("apparent_temperature"), covered)
    wind = _pick(values.get("wind_speed_10m"), covered)
    direction = _pick(values.get("wind_direction_10m"), covered)
    clouds = _pick(values.get("cloud_cover"), covered)
    rain = _pick(values.get("precipitation"), covered)
    return WeatherObservation(
        avg_temp_c=_average(temps),
        min_temp_c=_minimum(temps),
        max_temp_c=_maximum(temps),
        feels_like_c=_average(feels),
        wind_speed_kmh=_average(wind),
        wind_deg=_circular_mean_deg(direction),
        clouds_pct=_average(clouds),
        max_rain_mm=_maximum(rain),
        covered_hours=len(covered),
        data_date=position.day,
    )


def same_grid_cell(first: ActivityPosition, second: ActivityPosition) -> bool:
    """Whether two positions fall in the same reanalysis grid cell.

    Two activities within one cell can share a single request, which is what
    keeps a backfill over hundreds of runs from making hundreds of calls.
    """
    return (
        abs(first.latitude - second.latitude) < _GRID_DEGREES
        and abs(first.longitude - second.longitude) < _GRID_DEGREES
    )


def _time_labels(payload: dict[str, object]) -> list[str]:
    """The hour labels of the response, as written by the service."""
    raw = payload.get("time")
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, str)]


def _series(payload: dict[str, object], key: str) -> list[float]:
    raw = payload.get(key)
    if not isinstance(raw, list):
        return []
    out: list[float] = []
    for item in raw:
        if isinstance(item, int | float):
            out.append(float(item))
        else:
            out.append(float("nan"))
    return out


def _parse_hour(stamp: object) -> datetime | None:
    if not isinstance(stamp, str):
        return None
    try:
        return datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _pick(values: list[float] | None, covered: list[int]) -> list[float]:
    if not values:
        return []
    picked: list[float] = []
    for index in covered:
        if index < len(values):
            value = values[index]
            if not isnan(value):
                picked.append(value)
    return picked


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 1)


def _circular_mean_deg(values: list[float]) -> int | None:
    if not values:
        return None
    sin_sum = sum(sin(radians(deg)) for deg in values)
    cos_sum = sum(cos(radians(deg)) for deg in values)
    angle = round(degrees(atan2(sin_sum, cos_sum))) % 360
    return angle


def _average_int(values: list[float]) -> int | None:
    average = _average(values)
    return round(average) if average is not None else None


def _minimum(values: list[float]) -> float | None:
    if not values:
        return None
    return round(min(values), 1)


def _maximum(values: list[float]) -> float | None:
    if not values:
        return None
    return round(max(values), 1)
