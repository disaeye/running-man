from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "quality@example.com", "hash")
_NOW = datetime.now(UTC)


class _FakeCursor:
    def __init__(
        self,
        fetchone_rows: list[dict[str, object] | None],
        fetchall_rows: list[list[dict[str, object]]],
    ) -> None:
        self._fetchone_rows = fetchone_rows
        self._fetchall_rows = fetchall_rows
        self._fetchone_idx = 0
        self._fetchall_idx = 0

    async def __aenter__(self) -> _FakeCursor:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def execute(self, _query: str, _params: object = None) -> None:
        return None

    async def fetchone(self) -> dict[str, object] | None:
        if self._fetchone_idx < len(self._fetchone_rows):
            row = self._fetchone_rows[self._fetchone_idx]
            self._fetchone_idx += 1
            return row
        return None

    async def fetchall(self) -> list[dict[str, object]]:
        if self._fetchall_idx < len(self._fetchall_rows):
            rows = self._fetchall_rows[self._fetchall_idx]
            self._fetchall_idx += 1
            return rows
        return []


class _FakeConnection:
    def __init__(
        self,
        health_fetchone: list[dict[str, object] | None],
        health_fetchall: list[list[dict[str, object]]],
        quality_fetchone: list[dict[str, object] | None],
    ) -> None:
        self._health_fetchone = health_fetchone
        self._health_fetchall = health_fetchall
        self._quality_fetchone = quality_fetchone
        self._cursor_count = 0

    def cursor(self) -> _FakeCursor:
        self._cursor_count += 1
        if self._cursor_count == 1:
            return _FakeCursor(self._health_fetchone, self._health_fetchall)
        return _FakeCursor(self._quality_fetchone, [])


class _ConnectionContext:
    def __init__(self, conn: _FakeConnection) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeConnection:
        return self._conn

    async def __aexit__(self, *_: object) -> None:
        return None


class _FakePool:
    def __init__(
        self,
        health_fetchone: list[dict[str, object] | None],
        health_fetchall: list[list[dict[str, object]]],
        quality_fetchone: list[dict[str, object] | None],
    ) -> None:
        self._health_fetchone = health_fetchone
        self._health_fetchall = health_fetchall
        self._quality_fetchone = quality_fetchone

    def connection(self) -> _ConnectionContext:
        conn = _FakeConnection(
            self._health_fetchone,
            self._health_fetchall,
            self._quality_fetchone,
        )
        return _ConnectionContext(conn)


def _use_athlete_and_pool(
    monkeypatch: pytest.MonkeyPatch,
    health_fetchone: list[dict[str, object] | None],
    health_fetchall: list[list[dict[str, object]]],
    quality_fetchone: list[dict[str, object] | None],
) -> _FakePool:
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    pool = _FakePool(health_fetchone, health_fetchall, quality_fetchone)
    monkeypatch.setattr("presentation.api.data_health.get_pool", lambda: pool)
    return pool


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def _fetch_quality(
    monkeypatch: pytest.MonkeyPatch,
    health_fetchone: list[dict[str, object] | None],
    health_fetchall: list[list[dict[str, object]]],
    quality_fetchone: list[dict[str, object] | None],
) -> dict[str, object]:
    _use_athlete_and_pool(monkeypatch, health_fetchone, health_fetchall, quality_fetchone)
    response = await _get("/api/v1/data/quality")
    assert response.status_code == 200
    return response.json()


_HEALTH_FETCHONE_ALL: list[dict[str, object] | None] = [
    {
        "data_as_of": _NOW - timedelta(days=1),
        "total": 42,
        "with_hr": 30,
        "with_power": 20,
        "with_gps": 15,
        "with_streams": 38,
    },
    {"data_as_of": date(2026, 7, 12), "total_days": 60, "latest_day": date(2026, 7, 12)},
    {"sleep_days_28d": 22, "rhr_days_28d": 20, "hrv_days_28d": 18},
    {"sessions_14d": 4, "sessions_total": 30},
    {"runs_30d": 2, "failed_30d": 0},
    {"data_as_of": date(2026, 7, 13)},
    {"timezone": "UTC"},
]
_HEALTH_FETCHALL_SOME: list[list[dict[str, object]]] = [[
    {"from": date(2026, 7, 1), "to": date(2026, 7, 3)},
    {"from": date(2026, 7, 8), "to": date(2026, 7, 9)},
]]
_HEALTH_FETCHONE_EMPTY: list[dict[str, object] | None] = [None] * 7
_HEALTH_FETCHALL_EMPTY: list[list[dict[str, object]]] = [[]]


def _quality_rows(
    source_row: dict[str, object] | None,
    cnts: tuple[int, int, int, int],
    load_day: date | None,
    activity_day: date | None,
    physiology_updated_at: datetime | None,
    *,
    hrv_row: dict[str, object] | None = None,
    strength_row: dict[str, object] | None = None,
    upload_row: dict[str, object] | None = None,
    speed_row: dict[str, object] | None = None,
) -> list[dict[str, object] | None]:
    return [
        source_row,
        {"cnt": cnts[0]},
        {"cnt": cnts[1]},
        {"cnt": cnts[2]},
        {"cnt": cnts[3]},
        hrv_row if hrv_row is not None else {"wellness_days": 7, "hrv_days": 5},
        strength_row if strength_row is not None else {"recent": 3, "ever": 30},
        speed_row if speed_row is not None else {"activities": 0},
        upload_row if upload_row is not None else {"total": 2, "failed": 0},
        {"timezone": "UTC"},
        {"load_day": load_day},
        {"activity_day": activity_day},
        {"physiology_updated_at": physiology_updated_at},
    ]


_QUALITY_CLEAN = _quality_rows(
    {"source": "intervals_icu", "last_sync_at": _NOW - timedelta(hours=2)},
    (0, 1, 0, 7), date(2026, 7, 13), date(2026, 7, 12), _NOW - timedelta(days=2),
)
_QUALITY_SYNC_ERROR = _quality_rows(
    None, (0, 0, 0, 7), date(2026, 7, 13), date(2026, 7, 12), _NOW - timedelta(days=2),
)
_QUALITY_WARNINGS = _quality_rows(
    {"source": "intervals_icu", "last_sync_at": _NOW - timedelta(hours=2)},
    (3, 0, 2, 2), date(2026, 7, 10), date(2026, 7, 13), _NOW - timedelta(days=2),
    hrv_row={"wellness_days": 7, "hrv_days": 0},
    strength_row={"recent": 0, "ever": 30},
    speed_row={"activities": 2},
    upload_row={"total": 3, "failed": 1},
)
_QUALITY_ISSUE_KEYS = _quality_rows(
    {"source": "intervals_icu", "last_sync_at": _NOW - timedelta(hours=30)},
    (0, 0, 0, 7), date(2026, 7, 13), date(2026, 7, 13), None,
)
