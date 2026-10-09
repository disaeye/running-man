# pyright: reportArgumentType=false, reportMissingTypeStubs=false, reportPrivateImportUsage=false, reportUnknownMemberType=false, reportImplicitOverride=false, reportUnannotatedClassAttribute=false, reportExplicitAny=false, reportUnusedCallResult=false, reportImplicitStringConcatenation=false

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import psycopg
import pytest
import vcr

from infrastructure.integrations.intervals import sync
from infrastructure.integrations.intervals.client import IntervalsClient

CASSETTE = Path(__file__).parents[1] / "cassettes" / "intervals_api_validation.yaml"
TEST_ATHLETE_ID = "00000000-0000-0000-0000-000000000000"


class FixedDate(date):
    @classmethod
    def today(cls) -> date:
        return cls(2026, 6, 16)


class NoopLimiter:
    async def acquire(self) -> None:
        return None


class CassetteActivitiesClient:
    def __init__(self, client: IntervalsClient) -> None:
        self._client = client

    async def get_activities(
        self, _athlete_id: int | str, oldest: str, newest: str
    ) -> list[dict[str, Any]]:
        return await self._client.get_activities(0, oldest, newest)


def validation_vcr() -> vcr.VCR:
    return vcr.VCR(record_mode="none", match_on=["method", "scheme", "host", "path"])


def insert_athlete(db_conn: psycopg.Connection) -> None:
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO athletes (id, email, password_hash) VALUES (%s, %s, %s) "
            "ON CONFLICT DO NOTHING",
            (TEST_ATHLETE_ID, "activity-sync@example.com", "nope"),
        )


def ensure_activity_summary(db_conn: psycopg.Connection) -> None:
    with db_conn.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS activity_summary CASCADE")
        cur.execute(
            """
            CREATE TABLE activity_summary (
                activity_id TEXT NOT NULL,
                athlete_id UUID NOT NULL REFERENCES athletes(id),
                start_time TIMESTAMPTZ NOT NULL,
                sport TEXT NOT NULL,
                distance_m DOUBLE PRECISION,
                duration_s INTEGER,
                avg_hr SMALLINT,
                max_hr SMALLINT,
                avg_power SMALLINT,
                source_weighted_power_w DOUBLE PRECISION,
                icu_ctl DOUBLE PRECISION,
                source_training_load DOUBLE PRECISION,
                avg_cadence DOUBLE PRECISION,
                avg_speed DOUBLE PRECISION,
                elevation_gain_m DOUBLE PRECISION,
                calories INTEGER,
                device_name TEXT,
                external_id TEXT,
                source TEXT,
                file_type TEXT,
                source_hash VARCHAR(64),
                raw_data JSONB,
             has_gps BOOLEAN DEFAULT FALSE,
             has_hr BOOLEAN DEFAULT FALSE,
             has_power BOOLEAN DEFAULT FALSE,
             has_cadence BOOLEAN DEFAULT FALSE,
             summary_polyline TEXT,
             weather_avg_temp DOUBLE PRECISION,
             weather_min_temp DOUBLE PRECISION,
             weather_max_temp DOUBLE PRECISION,
             weather_feels_like DOUBLE PRECISION,
             weather_wind_speed DOUBLE PRECISION,
             weather_wind_gust DOUBLE PRECISION,
             weather_wind_deg DOUBLE PRECISION,
             weather_headwind_pct DOUBLE PRECISION,
             weather_tailwind_pct DOUBLE PRECISION,
             weather_clouds_pct DOUBLE PRECISION,
             weather_max_rain DOUBLE PRECISION,
             weather_max_snow DOUBLE PRECISION,
             PRIMARY KEY (activity_id, start_time)
            )
            """
        )
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_as_source_hash "
            "ON activity_summary (athlete_id, source_hash) WHERE source_hash IS NOT NULL"
        )


@pytest.mark.skip(reason="VCR cassette stale — athlete ID mismatch; re-record needed")
@pytest.mark.asyncio
async def test_incremental_inserts_activities(
    db_conn: psycopg.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sync, "date", FixedDate)
    ensure_activity_summary(db_conn)
    insert_athlete(db_conn)

    async with IntervalsClient(api_key="API_KEY_PLACEHOLDER", rate_limiter=NoopLimiter()) as client:
        with validation_vcr().use_cassette(str(CASSETTE)):
            count = await sync.sync_activities_incremental(
                TEST_ATHLETE_ID, CassetteActivitiesClient(client), db_conn
            )

    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT activity_id, external_id, sport, distance_m, duration_s "
            "FROM activity_summary WHERE athlete_id = %s ORDER BY start_time DESC",
            (TEST_ATHLETE_ID,),
        )
        rows = cur.fetchall()

    assert count.activity_stats.total_processed == 18
    assert count.stream_result.inserted == 0
    assert len(rows) == 18
    assert rows[0][:3] == ("i156878360", "app:i156878360", "Run")
    assert rows[0][3:] == (16010.0, 5601)


@pytest.mark.skip(reason="VCR cassette stale — athlete ID mismatch; re-record needed")
@pytest.mark.asyncio
async def test_dedup_keeps_row_count_stable(
    db_conn: psycopg.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sync, "date", FixedDate)
    ensure_activity_summary(db_conn)
    insert_athlete(db_conn)

    async with IntervalsClient(api_key="API_KEY_PLACEHOLDER", rate_limiter=NoopLimiter()) as client:
        cassette_client = CassetteActivitiesClient(client)
        with validation_vcr().use_cassette(str(CASSETTE)):
            await sync.backfill_activities(
                TEST_ATHLETE_ID, cassette_client, db_conn, date(2026, 5, 17), date(2026, 6, 16)
            )
        with validation_vcr().use_cassette(str(CASSETTE)):
            await sync.backfill_activities(
                TEST_ATHLETE_ID, cassette_client, db_conn, date(2026, 5, 17), date(2026, 6, 16)
            )

    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM activity_summary WHERE athlete_id = %s", (TEST_ATHLETE_ID,)
        )
        row = cur.fetchone()
        assert row is not None
        assert row[0] == 18


@pytest.mark.asyncio
async def test_cross_source_dedup_updates_existing_activity(db_conn: psycopg.Connection) -> None:
    ensure_activity_summary(db_conn)
    insert_athlete(db_conn)
    intervals_activity = {
        "id": "i155951494",
        "start_date": "2026-06-16T10:02:30Z",
        "type": "Run",
        "distance": 10020.0,
    }
    strava_activity = {
        "id": "strava:12345678",
        "start_date": "2026-06-16T10:02:45Z",
        "type": "Run",
        "distance": 10040.0,
    }

    with db_conn.cursor() as cur:
        cur.execute(sync._UPSERT_SQL, sync._activity_params(TEST_ATHLETE_ID, intervals_activity))
        first = cur.fetchone()
        cur.execute(sync._UPSERT_SQL, sync._activity_params(TEST_ATHLETE_ID, strava_activity))
        second = cur.fetchone()
        cur.execute(
            "SELECT count(*), max(activity_id), max(external_id) "
            "FROM activity_summary WHERE athlete_id = %s",
            (TEST_ATHLETE_ID,),
        )
        row = cur.fetchone()

    assert row is not None
    assert first == (False,)
    assert second == (True,)
    assert row[0] == 1
    assert row[1] in ("strava:12345678", b"strava:12345678")
    assert row[2] in ("app:strava:12345678", b"app:strava:12345678")
