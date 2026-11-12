# pyright: reportArgumentType=false, reportMissingTypeStubs=false, reportMissingImports=false, reportUnusedCallResult=false, reportUnannotatedClassAttribute=false, reportOptionalSubscript=false, reportUnknownMemberType=false, reportUnknownVariableType=false, reportExplicitAny=false, reportUnknownArgumentType=false, reportCallIssue=false

from datetime import date
from pathlib import Path

import psycopg
import pytest
import vcr

from infrastructure.integrations.intervals import sync
from infrastructure.integrations.intervals.client import IntervalsClient
from infrastructure.integrations.intervals.history import incremental_start_or_none

from .helpers import ensure_tables, seed_athlete

CASSETTE = Path(__file__).parents[1] / "cassettes" / "intervals_api_validation.yaml"
ATHLETE_ID = "00000000-0000-0000-0000-000000000000"
pytestmark = pytest.mark.asyncio


class FixedDate(date):
    @classmethod
    def today(cls) -> date:
        return cls(2026, 6, 16)


async def test_backfill_activities_replays_vcr(db_conn: psycopg.Connection) -> None:
    ensure_tables(db_conn)
    seed_athlete(db_conn, ATHLETE_ID, "backfill@example.com")
    async with IntervalsClient(
        api_key="API_KEY_PLACEHOLDER", athlete_id=0, rate_limiter=NoopLimiter()
    ) as client:
        with _vcr().use_cassette(str(CASSETTE), allow_playback_repeats=True):
            count = await sync.backfill_activities(
                ATHLETE_ID, CassetteClient(client), db_conn, date(2026, 6, 1), date(2026, 6, 16)
            )

    assert count.total_processed > 0
    assert _count(db_conn) == count.total_processed


async def test_incremental_skips_completed_window(
    db_conn: psycopg.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    ensure_tables(db_conn)
    seed_athlete(db_conn, ATHLETE_ID, "backfill@example.com")
    _insert_latest(db_conn, date(2026, 6, 16))
    # "Today" is the athlete's local day now, not the host's, so the freeze has
    # to be applied to the helper the sync path actually consults. Patching
    # `sync.date` used to work because the window was built from `date.today()`.
    monkeypatch.setattr(sync, "_athlete_today", lambda _conn, _athlete: FixedDate(2026, 6, 16))

    count = await sync.sync_activities_incremental(ATHLETE_ID, FailingClient(), db_conn)

    assert count.total_processed == 0
    assert _count(db_conn) == 1


async def test_incremental_resume_cursor_follows_the_athlete_timezone(
    db_conn: psycopg.Connection,
) -> None:
    """The resume cursor is a date handed to the upstream API, so it has to be
    the athlete's latest local day. A 21:00Z run is already the next day in
    Shanghai, and resuming from the UTC date would re-request it forever."""
    ensure_tables(db_conn)
    seed_athlete(db_conn, ATHLETE_ID, "backfill-tz@example.com")
    with db_conn.cursor() as cur:
        cur.execute(
            "UPDATE athletes SET timezone = 'Asia/Shanghai' WHERE id = %s",
            (ATHLETE_ID,),
        )
        cur.execute(
            "INSERT INTO activity_summary (activity_id, athlete_id, start_time, sport) "
            "VALUES ('tz-probe', %s, '2026-06-16T21:00:00+00:00', 'run')",
            (ATHLETE_ID,),
        )

    assert incremental_start_or_none(db_conn, ATHLETE_ID) == date(2026, 6, 18)


class NoopLimiter:
    async def acquire(self) -> None:
        return None


class CassetteClient:
    def __init__(self, client: IntervalsClient) -> None:
        self.client = client

    async def get_activities(
        self, _athlete_id: int | str, oldest: str, newest: str
    ) -> list[dict[str, object]]:
        activities = await self.client.get_activities(0, oldest, newest)
        return [_ascii_activity(activity) for activity in activities]


class FailingClient:
    async def get_activities(
        self, _athlete_id: int | str, _oldest: str, _newest: str
    ) -> list[dict[str, object]]:
        raise AssertionError("completed windows must not be fetched")


def _vcr() -> vcr.VCR:
    return vcr.VCR(record_mode="none", match_on=["method", "scheme", "host", "path"])


def _ascii_activity(activity: dict[str, object]) -> dict[str, object]:
    return {
        "id": activity["id"],
        "start_date": activity.get("start_date") or activity["start_date_local"],
        "type": activity["type"],
        "distance": activity.get("distance"),
        "moving_time": activity.get("moving_time"),
        "icu_training_load": activity.get("icu_training_load"),
    }


def _insert_latest(conn: psycopg.Connection, day: date) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO activity_summary (activity_id, athlete_id, start_time, sport) VALUES ('done', %s, %s, 'run')",
            (ATHLETE_ID, day),
        )


def _count(conn: psycopg.Connection) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM activity_summary WHERE athlete_id = %s", (ATHLETE_ID,))
        return int(cur.fetchone()[0])
