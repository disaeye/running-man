from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

import psycopg
import pytest

from conftest import TEST_DSN
from infrastructure.auth.models import Athlete
from infrastructure.auth.settings import settings
from infrastructure.db.pool import close_pool, open_pool
from infrastructure.repositories.activity_reads import ActivityReadRepo
from tests.integration.helpers import ensure_tables

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000071")


@pytest.fixture(scope="session")
async def activity_pool() -> AsyncGenerator[None, None]:
    settings.database_url = TEST_DSN
    await close_pool()
    await open_pool()
    yield
    await close_pool()


async def test_activity_range_uses_athlete_local_day_and_preserves_timestamp(
    db_conn: psycopg.Connection, activity_pool: None
) -> None:
    timezone = ZoneInfo("America/Los_Angeles")
    athlete = Athlete(ATHLETE_ID, "local-days@example.test", "hash", timezone=str(timezone))
    ensure_tables(db_conn)
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO athletes (id, email, password_hash, timezone) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (id) DO UPDATE SET timezone = EXCLUDED.timezone",
            (athlete.id, athlete.email, athlete.password_hash, athlete.timezone),
        )
        cur.execute("DELETE FROM activity_summary WHERE athlete_id = %s", (athlete.id,))
        cur.executemany(
            "INSERT INTO activity_summary "
            "(activity_id, athlete_id, start_time, sport, duration_s, source, file_type) "
            "VALUES (%s, %s, %s, 'run', 3600, 'manual', 'manual')",
            [
                ("local-last-day", athlete.id, datetime(2026, 7, 1, 6, 30, tzinfo=UTC)),
                ("local-target-day", athlete.id, datetime(2026, 7, 2, 6, 30, tzinfo=UTC)),
                ("local-next-day", athlete.id, datetime(2026, 7, 3, 6, 30, tzinfo=UTC)),
            ],
        )
    db_conn.commit()

    rows = await ActivityReadRepo().list_by_range(athlete.id, date(2026, 7, 1), date(2026, 7, 1))

    assert [row["activity_id"] for row in rows] == ["local-target-day"]
    assert rows[0]["start_time"] == datetime(2026, 7, 2, 6, 30, tzinfo=UTC)

    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM activity_summary WHERE athlete_id = %s", (athlete.id,))
        cur.execute("DELETE FROM athletes WHERE id = %s", (athlete.id,))
    db_conn.commit()
