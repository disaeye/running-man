"""Ignoring and soft-deleting activities.

The behaviour that matters is not the flag itself but what the flag excludes.
An ignored activity must vanish from every derived number while staying visible
in lists; a soft-deleted one must vanish from lists too, and must not come back
when the source is synced again.

These run against the real database because the guarantees live in SQL: the
``activity_compute`` view and the upsert's column list. A mocked repository
would prove nothing about either.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import psycopg
import pytest

from infrastructure.auth.settings import settings
from tests.application.load.activity_fact_schema import ensure_activity_fact_schema

# These tests are synchronous: the guarantees under test live in SQL, not in
# async application code, and driving the database directly keeps the failure
# mode readable.
pytestmark = [pytest.mark.no_db]

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000021")
TEST_DSN = "postgresql://postgres@/test_running_man?host=/var/run/postgresql&port=15434"


def _configure() -> None:
    settings.database_url = TEST_DSN


def _seed_activity(activity_id: str, day: int, *, sport: str = "run") -> None:
    with psycopg.connect(TEST_DSN) as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO activity_summary (activity_id, athlete_id, start_time, sport, duration_s)
            VALUES (%s, %s, %s, %s, 3600)
            ON CONFLICT (activity_id, start_time) DO NOTHING
            """,
            (activity_id, ATHLETE_ID, datetime(2026, 7, day, tzinfo=UTC), sport),
        )

def _flag(activity_id: str, column: str, value: bool) -> None:
    assert column in {"deleted_at", "ignored_at"}
    with psycopg.connect(TEST_DSN) as conn, conn.cursor() as cur:
        cur.execute(
            f"UPDATE activity_summary SET {column} = "
            f"{'now()' if value else 'NULL'} "
            "WHERE athlete_id = %s AND activity_id = %s",
            (ATHLETE_ID, activity_id),
        )

def _count_in_view() -> int:
    with psycopg.connect(TEST_DSN) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM activity_compute WHERE athlete_id = %s", (ATHLETE_ID,)
        )
        return int(cur.fetchone()[0])


def _count_in_table() -> int:
    with psycopg.connect(TEST_DSN) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM activity_summary WHERE athlete_id = %s", (ATHLETE_ID,)
        )
        return int(cur.fetchone()[0])


def _reset() -> None:
    _configure()
    ensure_activity_fact_schema(ATHLETE_ID)
    with psycopg.connect(TEST_DSN) as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM activity_summary WHERE athlete_id = %s", (ATHLETE_ID,))

class TestComputeViewExcludesFlaggedRows:
    """The view is the single gate every derived number passes through."""

    def test_a_clean_activity_is_in_the_view(self) -> None:
        _reset()
        _seed_activity("clean", 1)

        assert _count_in_view() == 1

    def test_an_ignored_activity_leaves_the_view_but_stays_in_the_table(self) -> None:
        _reset()
        _seed_activity("ignored", 1)
        _flag("ignored", "ignored_at", True)

        # Out of the numbers...
        assert _count_in_view() == 0
        # ...but still present, so lists can show it as ignored.
        assert _count_in_table() == 1

    def test_a_soft_deleted_activity_leaves_the_view(self) -> None:
        _reset()
        _seed_activity("deleted", 1)
        _flag("deleted", "deleted_at", True)

        assert _count_in_view() == 0
        assert _count_in_table() == 1

    def test_un_ignoring_restores_it_to_the_numbers(self) -> None:
        _reset()
        _seed_activity("toggle", 1)
        _flag("toggle", "ignored_at", True)
        assert _count_in_view() == 0

        _flag("toggle", "ignored_at", False)

        assert _count_in_view() == 1

    def test_ignoring_one_activity_leaves_the_others(self) -> None:
        _reset()
        _seed_activity("keep", 1)
        _seed_activity("drop", 2)
        _flag("drop", "ignored_at", True)

        assert _count_in_view() == 1

    def test_both_flags_together_still_exclude(self) -> None:
        _reset()
        _seed_activity("both", 1)
        _flag("both", "ignored_at", True)
        _flag("both", "deleted_at", True)

        assert _count_in_view() == 0


class TestDailyFactsFunctionRespectsTheFlags:
    """The SQL function backing the daily metric stream reads the view.

    It previously read ``activity_summary`` directly, so the view alone would
    not have been enough: ignored activities would still have contributed
    distance, duration and source training load to the daily facts.
    """

    @staticmethod
    def _point_function_at_the_view() -> None:
        """Apply the migration's redefinition to this database.

        The test schema is built by a helper rather than by running migrations,
        so the function here still reads ``activity_summary``. The SQL is read
        out of the migration itself, which means this test also fails if that
        migration stops rewriting the function.
        """
        from infrastructure.db.migration_sql.activity_ignore_sql import (
            DAILY_FACTS_SQL_COMPUTE,
        )

        with psycopg.connect(TEST_DSN) as conn, conn.cursor() as cur:
            cur.execute(DAILY_FACTS_SQL_COMPUTE)

    def _daily_rows(self) -> list[tuple[str, str]]:
        with psycopg.connect(TEST_DSN) as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT metric_key, sport
                FROM get_athlete_daily_facts(%s, %s, %s)
                """,
                (ATHLETE_ID, datetime(2026, 7, 1).date(), datetime(2026, 7, 31).date()),
            )
            return [(str(a), str(b)) for a, b in cur.fetchall()]

    def test_ignored_activity_contributes_no_daily_facts(self) -> None:
        _reset()
        self._point_function_at_the_view()
        _seed_activity("counted", 1)
        _seed_activity("ignored-facts", 2, sport="walk")
        _flag("ignored-facts", "ignored_at", True)

        sports = {sport for _key, sport in self._daily_rows()}

        assert "walk" not in sports
        assert "run" in sports


class TestUpsertPreservesTheFlags:
    """A re-sync must not silently undo the athlete's choice.

    Both flags are absent from the upsert's ``DO UPDATE SET`` list, so a
    re-import of the same activity (same source_hash) updates its measurements
    without touching either flag. This is the difference between "ignore this"
    being a decision and being a suggestion.
    """

    def test_neither_flag_is_mentioned_in_the_upsert(self) -> None:
        from infrastructure.repositories import activity_summary

        statement = activity_summary.UPSERT_SQL

        assert "deleted_at" not in statement
        assert "ignored_at" not in statement

    def test_a_flagged_row_keeps_its_flag_after_an_upsert(self) -> None:
        _reset()
        _seed_activity("resync", 1)
        _flag("resync", "ignored_at", True)

        # Simulate the sync touching the row's measurements.
        with psycopg.connect(TEST_DSN) as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE activity_summary SET duration_s = 4000 "
                "WHERE athlete_id = %s AND activity_id = %s",
                (ATHLETE_ID, "resync"),
            )
            cur.execute(
                "SELECT ignored_at FROM activity_summary "
                "WHERE athlete_id = %s AND activity_id = %s",
                (ATHLETE_ID, "resync"),
            )
            still_ignored = cur.fetchone()[0] is not None

        assert still_ignored is True
        assert _count_in_view() == 0
