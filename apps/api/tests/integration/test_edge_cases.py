# pyright: reportArgumentType=false, reportMissingTypeStubs=false, reportMissingImports=false, reportUnusedCallResult=false, reportUnannotatedClassAttribute=false, reportOptionalSubscript=false, reportAny=false

from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import psycopg
import pytest
from httpx import ASGITransport, AsyncClient

from infrastructure.auth.models import Athlete
from infrastructure.integrations.intervals.sync import backfill_activities
from main import app
from presentation.api.activities import get_activity_repo
from presentation.auth.deps import get_current_athlete

from .helpers import ensure_tables, seed_athlete

pytestmark = pytest.mark.asyncio
ATHLETE_ID = uuid4()


async def test_empty_state() -> None:
    _use_repo(Repo())
    async with _client() as client:
        assert (await client.get("/api/v1/activities?from=2026-01-01&to=2026-01-02")).json() == []
        assert (await client.get("/api/v1/activities/missing/streams")).json() == []


async def test_dst_transition(db_conn: psycopg.Connection) -> None:
    ensure_tables(db_conn)
    _seed_athlete(db_conn)
    start = datetime(2026, 3, 8, 1, 30, tzinfo=ZoneInfo("America/New_York"))
    await backfill_activities(
        ATHLETE_ID,
        OneActivity("dst", start.isoformat()),
        db_conn,
        date(2026, 3, 8),
        date(2026, 3, 8),
    )
    assert _activity_day(db_conn, "dst") == date(2026, 3, 8)


async def test_bad_data_gps_spike() -> None:
    _use_repo(Repo(streams=[_stream(lat=0), _stream(lat=89.9, lon=179.9)]))
    async with _client() as client:
        response = await client.get("/api/v1/activities/a-1/streams")
    assert response.status_code == 200
    assert response.json()[1]["lat"] == 89.9


async def test_power_spike() -> None:
    _use_repo(Repo(streams=[_stream(metric="power", value=2000)]))
    async with _client() as client:
        response = await client.get("/api/v1/activities/a-1/streams")
    assert response.status_code == 200
    assert response.json()[0]["value"] == 2000


async def test_long_activity() -> None:
    streams = [
        _stream(time=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(minutes=i))
        for i in range(12 * 60)
    ]
    _use_repo(Repo(streams=streams))
    async with _client() as client:
        response = await client.get("/api/v1/activities/a-1/streams")
    assert response.status_code == 200
    assert len(response.json()) == 720


async def test_missing_streams() -> None:
    _use_repo(Repo(streams=[]))
    async with _client() as client:
        detail = await client.get("/api/v1/activities/a-1")
        streams = await client.get("/api/v1/activities/a-1/streams")
    assert detail.status_code == 200
    assert detail.json()["activity_id"] == "a-1"
    assert streams.json() == []


class OneActivity:
    def __init__(self, activity_id: str, start: str) -> None:
        self.activity_id = activity_id
        self.start = start

    async def get_activities(
        self, _athlete_id: object, _oldest: str, _newest: str
    ) -> list[dict[str, object]]:
        return [
            {"id": self.activity_id, "start_date": self.start, "type": "Run", "moving_time": 1800}
        ]


class Repo:
    def __init__(self, streams: list[dict[str, object]] | None = None) -> None:
        self.streams = streams or []

    async def list_by_range(
        self, _athlete_id: UUID, _start: date, _end: date
    ) -> list[dict[str, object]]:
        return []

    async def get_by_id(self, _athlete_id: UUID, activity_id: str) -> dict[str, object] | None:
        return _summary(activity_id) if activity_id == "a-1" else None

    async def exists(self, activity_id: str) -> bool:
        return activity_id == "a-1"

    async def get_streams(self, _athlete_id: UUID, _activity_id: str) -> list[dict[str, object]]:
        return self.streams


def _use_repo(repo: Repo) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: Athlete(
        ATHLETE_ID, "edge@example.com", "hash"
    )
    app.dependency_overrides[get_activity_repo] = lambda: repo


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _summary(activity_id: str) -> dict[str, object]:
    return {
        "activity_id": activity_id,
        "start_time": datetime(2026, 1, 1, tzinfo=UTC),
        "sport": "Run",
        "raw_data": {},
    }


def _stream(
    time: datetime | None = None,
    metric: str = "gps",
    value: float = 1,
    lat: float = 1,
    lon: float = 1,
) -> dict[str, object]:
    return {
        "sample_time": time or datetime(2026, 1, 1, tzinfo=UTC),
        "metric_type": metric,
        "value": value,
        "lat": lat,
        "lon": lon,
    }


def _seed_athlete(conn: psycopg.Connection) -> None:
    seed_athlete(conn, ATHLETE_ID, "edge@example.com")


def _activity_day(conn: psycopg.Connection, activity_id: str) -> date:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT start_time::date FROM activity_summary WHERE activity_id = %s", (activity_id,)
        )
        return cur.fetchone()[0]
