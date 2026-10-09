"""Training-day clock — local-day semantics for day-keyed state.

Running training is organized around the athlete's local day (sleep one night,
plan one day, readiness one day). All UTC day bucketing in the data layer is a
bug: a 21:00 Asia/Shanghai run lands on the wrong UTC day, silently corrupting
PMC, goal consistency, plan matching, and data-health gap detection.

This module is the single source of truth for converting an instant to the
athlete's local calendar day. Day-keyed computations MUST route through here
rather than `start_time::date` or `AT TIME ZONE 'UTC'`.

Postgres mirror: `(start_time AT TIME ZONE athlete_tz)::date`. For a single
athlete whose timezone is known, ``local_day_sql`` emits that expression bound
to the athlete's IANA zone.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

UTC = "UTC"
DEFAULT_TIMEZONE = UTC

_FROZEN = ZoneInfo("UTC")


def resolve_zone(timezone: str | None) -> ZoneInfo:
    """Return a ZoneInfo for ``timezone``, falling back to UTC on bad input.

    Athlete timezone is free-text from the profile; it must never crash a
    fact computation. An unknown zone is treated as UTC (the historical
    default) rather than raising.
    """
    if not timezone:
        return _FROZEN
    name = timezone.strip()
    if not name:
        return _FROZEN
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return _FROZEN


def local_day(instant: datetime, timezone: str | None = DEFAULT_TIMEZONE) -> date:
    """The athlete's local calendar day for ``instant``.

    ``instant`` must be timezone-aware. Returns the date as observed in the
    athlete's ``timezone`` (IANA name). This is the canonical training-day key.
    """
    if instant.tzinfo is None:
        raise ValueError("local_day requires a timezone-aware datetime")
    return instant.astimezone(resolve_zone(timezone)).date()


def local_day_sql(athlete_tz_param: str = "%s", *, column: str = "start_time") -> str:
    """SQL expression mirroring :func:`local_day` for per-athlete queries.

    Emits ``(start_time AT TIME ZONE %s)::date`` so callers can bind the
    athlete's IANA zone. The matview/SQL-function path needs the literal zone
    name; Python callers should prefer :func:`local_day`.

    Example::

        SELECT local_day_sql() AS day, SUM(tss) ...
        FROM activity_summary a
        JOIN athletes ath ON ath.id = a.athlete_id
        WHERE a.athlete_id = %s
        GROUP BY local_day_sql(ath.timezone)
    """
    return f"({column} AT TIME ZONE {athlete_tz_param})::date"
