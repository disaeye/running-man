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


def today_in_zone(
    timezone: str | None = DEFAULT_TIMEZONE, now: datetime | None = None
) -> date:
    """Today on the athlete's clock.

    ``date.today()`` is the *host's* calendar day. On a UTC host an athlete east
    of Greenwich is a day ahead for part of every evening, so anything keyed on
    ``date.today()`` — a notification's once-per-day guard, a recommendation's
    target day, the stamp on a chart's last point — silently addresses the wrong
    day for them.

    Callers that already have the athlete's timezone should prefer this over
    asking the database, since it needs no round trip. Callers holding only an
    athlete id must resolve the zone first; ``athletes.timezone`` is the source.
    """
    instant = now if now is not None else datetime.now(ZoneInfo(UTC))
    if instant.tzinfo is None:
        raise ValueError("today_in_zone requires a timezone-aware datetime")
    return instant.astimezone(resolve_zone(timezone)).date()


def local_day_sql(athlete_tz_param: str = "%s", *, column: str = "start_time") -> str:
    """SQL expression mirroring :func:`local_day` for per-athlete queries.

    Emits ``(start_time AT TIME ZONE %s)::date`` so callers can bind the
    athlete's IANA zone. The matview/SQL-function path needs the literal zone
    name; Python callers should prefer :func:`local_day`.

    ``athlete_tz_param`` may also be a subquery (e.g.
    ``"SELECT timezone FROM athletes WHERE id = %s"``), which lets one statement
    resolve both the row filter and the day key from the same profile without a
    second round trip. A subquery is wrapped in parentheses because
    ``AT TIME ZONE`` binds to a value expression and would otherwise swallow it.

    Example::

        SELECT local_day_sql() AS day, SUM(tss) ...
        FROM activity_summary a
        JOIN athletes ath ON ath.id = a.athlete_id
        WHERE a.athlete_id = %s
        GROUP BY local_day_sql(ath.timezone)
    """
    zone = athlete_tz_param.strip()
    # A placeholder, a column reference and a literal zone name are all single
    # tokens and bind directly to AT TIME ZONE. A subquery is several tokens and
    # needs its own parentheses, or Postgres reads `AT TIME ZONE SELECT ...` and
    # raises a syntax error. Whitespace is what separates the two cases.
    if any(character.isspace() for character in zone):
        zone = f"({zone})"
    return f"({column} AT TIME ZONE {zone})::date"
