# pyright: reportArgumentType=false, reportMissingTypeStubs=false, reportMissingImports=false, reportUnusedCallResult=false, reportUnannotatedClassAttribute=false, reportOptionalSubscript=false, reportUnknownMemberType=false, reportUnknownVariableType=false, reportExplicitAny=false, reportUnknownArgumentType=false, reportCallIssue=false

from datetime import date
from pathlib import Path

import psycopg
import pytest
import vcr

from infrastructure.integrations.intervals import sync
from infrastructure.integrations.intervals.client import IntervalsClient

from .helpers import ensure_tables, seed_athlete

CASSETTE = Path(__file__).parents[1] / "cassettes" / "intervals_api_validation.yaml"
ATHLETE_ID = "00000000-0000-0000-0000-000000000000"
pytestmark = pytest.mark.asyncio


class FixedDate(date):
    @classmethod
    def today(cls) -> date:
        return cls(2026, 6, 16)


@pytest.mark.skip(reason="VCR cassette stale — athlete ID mismatch; re-record needed")
async def test_backfill_activities_replays_vcr(db_conn: psycopg.Connection) -> None:
    ensure_tables(db_conn)
    seed_athlete(db_conn, ATHLETE_ID, "backfill@example.com")
    async with IntervalsClient(api_key="API_KEY_PLACEHOLDER", rate_limiter=NoopLimiter()) as client:
        with _vcr().use_cassette(str(CASSETTE), allow_playback_repeats=True):
            count = await sync.backfill_activities(
                ATHLETE_ID, CassetteClient(client), db_conn, date(2026, 6, 1), date(2026, 6, 16)
            )

    assert count.total_processed > 0
    assert _count(db_conn) == count.total_processed


async def test_incremental_skips_completed_window(
    db_conn: psycopg.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sync, "date", FixedDate)
    ensure_tables(db_conn)
    seed_athlete(db_conn, ATHLETE_ID, "backfill@example.com")
    _insert_latest(db_conn, date(2026, 6, 16))

    count = await sync.sync_activities_incremental(ATHLETE_ID, FailingClient(), db_conn)

    assert count.total_processed == 0
    assert _count(db_conn) == 1


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
