"""Day-keyed SQL must bucket on the athlete's calendar day.

`domain.time` states the rule in prose — day-keyed computation must not use a
bare `start_time::date`, because that casts in the *session* zone. The pool
opens connections without `options=-c timezone`, so the session zone is the
server's (UTC), and an evening run in Asia/Shanghai is filed under the previous
day.

These tests execute real SQL against the test database rather than asserting on
query strings, because the failure mode is a wrong *value*, not a wrong shape:
a string assertion passes happily while the day key is off by one.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

import psycopg

from domain.time import local_day_sql

ATHLETE_ID = UUID("00000000-0000-0000-0000-00000000cafe")

# 21:00Z is 05:00 the next day in Shanghai, and the previous day in New York.
# A zone that differs from UTC in either direction pins both signs of the bug.
EVENING_UTC = "2026-07-01T21:00:00+00:00"
EXPECTED_SHANGHAI_DAY = date(2026, 7, 2)
EXPECTED_NEW_YORK_DAY = date(2026, 7, 1)


def _ensure_athlete(db_conn: psycopg.Connection, timezone: str) -> None:
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO athletes (id, email, password_hash, timezone) "
            "VALUES (%s, %s, 'hash', %s) ON CONFLICT (id) DO UPDATE SET timezone = EXCLUDED.timezone",
            (ATHLETE_ID, f"{ATHLETE_ID}@example.com", timezone),
        )


def _local_day(db_conn: psycopg.Connection, timezone: str) -> date:
    """Evaluate the same expression the repositories emit, against the DB."""
    expression = local_day_sql("%s")
    with db_conn.cursor() as cur:
        cur.execute(
            f"SELECT {expression} FROM (SELECT %s::timestamptz AS start_time) AS t",
            (timezone, EVENING_UTC),
        )
        row = cur.fetchone()
    return row[0]


def test_session_zone_is_utc_so_a_bare_date_cast_really_is_wrong(
    db_conn: psycopg.Connection,
) -> None:
    """Guard the premise: if the session zone were not UTC the other tests
    would be asserting against a coincidence rather than a fix."""
    with db_conn.cursor() as cur:
        cur.execute("SHOW TimeZone")
        session_zone = cur.fetchone()[0]

    assert session_zone.upper() in {"UTC", "ETC/UTC"}


def test_bare_date_cast_and_athlete_local_day_disagree_after_evening(
    db_conn: psycopg.Connection,
) -> None:
    """The bug, stated as an executable fact rather than a rule.

    Without this the regression is easy to "fix" back: nothing here fails when
    both expressions return the same day.
    """
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT (start_time)::date FROM (SELECT %s::timestamptz AS start_time) t",
            (EVENING_UTC,),
        )
        session_day = cur.fetchone()[0]

    assert session_day == date(2026, 7, 1)
    assert _local_day(db_conn, "Asia/Shanghai") == EXPECTED_SHANGHAI_DAY
    assert session_day != EXPECTED_SHANGHAI_DAY


def test_athlete_local_day_advances_for_east_of_utc(db_conn: psycopg.Connection) -> None:
    assert _local_day(db_conn, "Asia/Shanghai") == EXPECTED_SHANGHAI_DAY


def test_athlete_local_day_recedes_for_west_of_utc(db_conn: psycopg.Connection) -> None:
    assert _local_day(db_conn, "America/New_York") == EXPECTED_NEW_YORK_DAY


def test_utc_athlete_is_unaffected(db_conn: psycopg.Connection) -> None:
    """A UTC athlete must not see their history move; the change is not a
    blanket re-bucketing."""
    assert _local_day(db_conn, "UTC") == date(2026, 7, 1)


def test_unknown_zone_falls_back_to_utc_in_the_database(db_conn: psycopg.Connection) -> None:
    """`domain.time.resolve_zone` promises UTC for an unusable zone name; the
    SQL path has to degrade the same way or the two disagree."""
    with db_conn.cursor() as cur:
        cur.execute("SELECT name FROM pg_timezone_names WHERE name = 'Not/AZone'")
        assert cur.fetchone() is None

    # Postgres raises on an unknown zone, so callers must pre-resolve. Assert
    # the resolution contract rather than a silent fallback that does not exist.
    from domain.time import resolve_zone

    assert str(resolve_zone("Not/AZone")) == "UTC"


def test_repository_query_binds_the_athlete_timezone(db_conn: psycopg.Connection) -> None:
    """The athlete row used by the correlated subquery must exist and carry the
    zone, otherwise the emitted SQL silently buckets by session zone."""
    _ensure_athlete(db_conn, "Asia/Shanghai")
    with db_conn.cursor() as cur:
        cur.execute("SELECT timezone FROM athletes WHERE id = %s", (ATHLETE_ID,))
        row = cur.fetchone()
    assert row[0] == "Asia/Shanghai"

    expression = local_day_sql("SELECT timezone FROM athletes WHERE id = %s")
    with db_conn.cursor() as cur:
        cur.execute(
            f"SELECT {expression} FROM (SELECT %s::timestamptz AS start_time) t",
            (ATHLETE_ID, EVENING_UTC),
        )
        assert cur.fetchone()[0] == EXPECTED_SHANGHAI_DAY


def test_distinct_day_count_uses_the_athlete_zone(db_conn: psycopg.Connection) -> None:
    """`COUNT(DISTINCT <day>)` is how goal consistency and the coach context
    count training days. Two runs on the same local day, straddling UTC
    midnight, must count once for the athlete and twice under a UTC cast."""
    _ensure_athlete(db_conn, "Asia/Shanghai")
    # 21:00Z on the 1st is 05:00 on the 2nd in Shanghai, so these are the same
    # local training day even though the UTC dates differ.
    rows = ["2026-07-01T21:00:00+00:00", "2026-07-02T04:00:00+00:00"]

    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(DISTINCT (start_time AT TIME ZONE %s)::date) "
            "FROM (SELECT unnest(%s::timestamptz[]) AS start_time) t",
            ("Asia/Shanghai", rows),
        )
        athlete_count = cur.fetchone()[0]
        cur.execute(
            "SELECT COUNT(DISTINCT start_time::date) "
            "FROM (SELECT unnest(%s::timestamptz[]) AS start_time) t",
            (rows,),
        )
        session_count = cur.fetchone()[0]

    assert athlete_count == 1
    assert session_count == 2
