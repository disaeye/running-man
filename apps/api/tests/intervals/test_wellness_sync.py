# pyright: reportArgumentType=false, reportMissingTypeStubs=false, reportPrivateImportUsage=false, reportUnknownMemberType=false

from __future__ import annotations

from datetime import date
from pathlib import Path

import psycopg
import pytest
import vcr

from infrastructure.integrations.intervals.client import IntervalsClient
from infrastructure.integrations.intervals.wellness_sync import sync_wellness

CASSETTE = Path(__file__).parents[1] / "cassettes" / "wellness_sync.yaml"
TEST_ATHLETE_ID = "00000000-0000-0000-0000-000000000000"


class NoopLimiter:
    async def acquire(self) -> None:
        return None


def wellness_vcr() -> vcr.VCR:
    return vcr.VCR(
        record_mode="none",
        match_on=["method", "scheme", "host", "path"],
    )


def _insert_athlete(db: psycopg.Connection) -> None:
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
            (TEST_ATHLETE_ID, "wellness-test@example.com", "nope"),
        )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="VCR cassette stale — athlete ID mismatch; re-record needed")
@pytest.mark.asyncio
async def test_sync_wellness_inserts_records(db_conn: psycopg.Connection) -> None:
    _insert_athlete(db_conn)

    async with IntervalsClient(api_key="API_KEY_PLACEHOLDER", rate_limiter=NoopLimiter()) as client:
        with wellness_vcr().use_cassette(str(CASSETTE)):
            count = await sync_wellness(
                athlete_id=TEST_ATHLETE_ID,
                client=client,
                db=db_conn,
                oldest="2026-06-09",
                newest="2026-06-16",
            )

    assert count == 8  # 8 days in the cassette

    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT day, weight, resting_hr, hrv, sleep_secs, sleep_score, "
            "fatigue, soreness FROM health_wellness "
            "WHERE athlete_id = %s ORDER BY day",
            (TEST_ATHLETE_ID,),
        )
        rows = cur.fetchall()

    assert len(rows) == 8

    # Day 2026-06-09 — weight, restingHR, sleepSecs; hrv/sleepScore NULL
    assert rows[0][0] == date(2026, 6, 9)
    assert rows[0][1] == 70.25  # weight
    assert rows[0][2] == 54  # resting_hr
    assert rows[0][3] is None  # hrv
    assert rows[0][4] == 1320  # sleep_secs
    assert rows[0][5] is None  # sleep_score
    assert rows[0][6] is None  # fatigue
    assert rows[0][7] is None  # soreness

    # Day 2026-06-10 — all relevant fields present
    assert rows[1][0] == date(2026, 6, 10)
    assert rows[1][1] == 69.6
    assert rows[1][2] == 47
    assert rows[1][4] == 17280
    assert rows[1][5] == 63  # sleep_score as float → stored as SMALLINT


@pytest.mark.skip(reason="VCR cassette stale — athlete ID mismatch; re-record needed")
@pytest.mark.asyncio
async def test_sync_wellness_dedup(db_conn: psycopg.Connection) -> None:
    """Calling sync_wellness twice with the same window upserts but does
    NOT create duplicate rows (ON CONFLICT DO UPDATE)."""
    _insert_athlete(db_conn)

    async with IntervalsClient(api_key="API_KEY_PLACEHOLDER", rate_limiter=NoopLimiter()) as client:
        with wellness_vcr().use_cassette(str(CASSETTE)):
            count1 = await sync_wellness(
                athlete_id=TEST_ATHLETE_ID,
                client=client,
                db=db_conn,
                oldest="2026-06-09",
                newest="2026-06-16",
            )

        with wellness_vcr().use_cassette(str(CASSETTE)):
            count2 = await sync_wellness(
                athlete_id=TEST_ATHLETE_ID,
                client=client,
                db=db_conn,
                oldest="2026-06-09",
                newest="2026-06-16",
            )

    # Both calls report 8 rows processed (first = insert, second = update)
    assert count1 == 8
    assert count2 == 8

    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM health_wellness WHERE athlete_id = %s",
            (TEST_ATHLETE_ID,),
        )
        assert cur.fetchone()[0] == 8  # no duplicates
