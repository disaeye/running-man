"""GET /athletes/me reads the profile once and skips useless fallback scans.

A recorded HRmax makes the 46-partition ``MAX(max_hr)`` aggregate irrelevant,
and a birth date supplies an age estimate that outranks the observed maximum.
The endpoint used to read the profile twice and always ran that aggregate,
which delayed every page that waits for the athlete's timezone.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from datetime import UTC, date, datetime
from typing import Any
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from infrastructure.db.pool import get_pool
from main import app
from presentation.auth.deps import get_current_athlete

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]

ATHLETE_ID = uuid4()
ATHLETE_EMAIL = f"profile-fast-{ATHLETE_ID}@example.test"


@pytest.fixture(autouse=True)
def _clean_overrides() -> Iterator[None]:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: Athlete(
        ATHLETE_ID, ATHLETE_EMAIL, "hash"
    )
    yield
    app.dependency_overrides.clear()


async def _seed(sql: str, params: tuple[object, ...]) -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(sql, params)


async def _reset() -> None:
    async with get_pool().connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO athletes (id, email, password_hash, name, timezone, dob)
            VALUES (%s, %s, 'hash', 'Fast Profile', 'Asia/Shanghai', %s)
            ON CONFLICT (id) DO UPDATE SET dob = EXCLUDED.dob
            """,
            (ATHLETE_ID, ATHLETE_EMAIL, date(1994, 3, 2)),
        )
        for table in ("activity_summary", "health_wellness", "athlete_thresholds"):
            await cur.execute(f"DELETE FROM {table} WHERE athlete_id = %s", (ATHLETE_ID,))


class RecordingCursor:
    def __init__(self, cursor: Any, queries: list[str]) -> None:
        self.cursor = cursor
        self.queries = queries

    async def __aenter__(self) -> "RecordingCursor":
        await self.cursor.__aenter__()
        return self

    async def __aexit__(self, *args: object) -> object:
        return await self.cursor.__aexit__(*args)

    async def execute(self, query: object, params: object = None) -> object:
        self.queries.append(str(query).strip())
        return await self.cursor.execute(query, params)

    async def fetchone(self) -> object:
        return await self.cursor.fetchone()

    async def fetchall(self) -> object:
        return await self.cursor.fetchall()

    def __getattr__(self, name: str) -> object:
        return getattr(self.cursor, name)


class RecordingConnection:
    def __init__(self, context: Any) -> None:
        self.context = context
        self.queries: list[str] = []
        self.connection: Any = None

    async def __aenter__(self) -> "RecordingConnection":
        self.connection = await self.context.__aenter__()
        return self

    async def __aexit__(self, *args: object) -> object:
        return await self.context.__aexit__(*args)

    def cursor(self) -> RecordingCursor:
        return RecordingCursor(self.connection.cursor(), self.queries)


class RecordingPool:
    def __init__(self, pool: Any) -> None:
        self.pool = pool
        self.connections: list[RecordingConnection] = []

    def connection(self) -> RecordingConnection:
        connection = RecordingConnection(self.pool.connection())
        self.connections.append(connection)
        return connection

    def all_queries(self) -> list[str]:
        return [query for conn in self.connections for query in conn.queries]


async def _get(url: str = "/api/v1/athletes/me") -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(url)


def _summary_count(queries: Sequence[str]) -> int:
    return sum("FROM activity_summary" in query for query in queries)


def _wellness_count(queries: Sequence[str]) -> int:
    return sum("FROM health_wellness" in query for query in queries)


async def _with_recording_pool(monkeypatch: pytest.MonkeyPatch) -> RecordingPool:
    from application.thresholds import effective
    from infrastructure.repositories import athlete_profiles, thresholds

    pool = RecordingPool(get_pool())
    for module in (athlete_profiles, thresholds, effective):
        monkeypatch.setattr(module, "get_pool", lambda: pool)
    return pool


async def test_recorded_thresholds_skip_both_fallback_tables(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _reset()
    await _seed(
        """
        INSERT INTO athlete_thresholds (
            athlete_id, effective_from, hr_max, resting_hr, lthr, threshold_pace
        ) VALUES (%s, %s, 186, 52, 167, 294)
        """,
        (ATHLETE_ID, date(2026, 1, 2)),
    )

    pool = await _with_recording_pool(monkeypatch)
    response = await _get()

    assert response.status_code == 200
    body = response.json()
    assert body["hr_max"] == 186
    assert body["resting_hr"] == 52
    queries = pool.all_queries()
    assert len(queries) == 2, queries
    assert _summary_count(queries) == 0
    assert _wellness_count(queries) == 0


async def test_age_estimate_skips_activity_aggregate_and_reads_wellness_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _reset()
    await _seed(
        "INSERT INTO health_wellness (athlete_id, day, resting_hr, weight) "
        "VALUES (%s, %s, 49, 67.0)",
        (ATHLETE_ID, date(2026, 11, 1)),
    )

    pool = await _with_recording_pool(monkeypatch)
    response = await _get()

    assert response.status_code == 200
    body = response.json()
    assert body["hr_max"] == 186
    assert body["resting_hr"] == 49
    queries = pool.all_queries()
    assert len(queries) == 3, queries
    assert _summary_count(queries) == 0
    assert _wellness_count(queries) == 1


async def test_fallback_reads_each_column_from_its_own_latest_day(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Wellness rows arrive a column at a time.

    The newest row carries no resting HR; the reading was taken a week earlier.
    Reading the newest row and taking every column from it used to report no
    resting HR at all, which then disagreed with the health charts.
    """
    await _reset()
    await _seed(
        "INSERT INTO health_wellness (athlete_id, day, resting_hr, weight) "
        "VALUES (%s, %s, 47, NULL)",
        (ATHLETE_ID, date(2026, 10, 25)),
    )
    await _seed(
        "INSERT INTO health_wellness (athlete_id, day, resting_hr, weight) "
        "VALUES (%s, %s, NULL, 68.9)",
        (ATHLETE_ID, date(2026, 11, 1)),
    )

    pool = await _with_recording_pool(monkeypatch)
    response = await _get()

    assert response.status_code == 200
    body = response.json()
    assert body["resting_hr"] == 47
    queries = pool.all_queries()
    # One wellness statement resolves the resting HR with a scalar subquery.
    assert _wellness_count(queries) == 1, queries


async def test_missing_thresholds_use_each_measured_fallback_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _reset()
    await _seed("UPDATE athletes SET dob = NULL WHERE id = %s", (ATHLETE_ID,))
    await _seed(
        "INSERT INTO health_wellness (athlete_id, day, resting_hr, weight) "
        "VALUES (%s, %s, 51, 66.0)",
        (ATHLETE_ID, date(2026, 11, 1)),
    )
    await _seed(
        """
        INSERT INTO activity_summary (
            athlete_id, activity_id, start_time, sport, max_hr
        ) VALUES (%s, %s, %s, 'Run', 181)
        """,
        (ATHLETE_ID, uuid4(), datetime(2026, 11, 2, 1, tzinfo=UTC)),
    )

    pool = await _with_recording_pool(monkeypatch)
    response = await _get()

    assert response.status_code == 200
    body = response.json()
    assert body["hr_max"] == 181
    assert body["resting_hr"] == 51
    queries = pool.all_queries()
    assert len(queries) == 4, queries
    assert _summary_count(queries) == 1
    assert _wellness_count(queries) == 1
