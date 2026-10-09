"""HTTP-level tests for ``/api/wellness`` (the main wellness-list endpoint).

Existing coverage in ``tests/api/test_sleep.py`` covers ``GET /api/wellness/sleep``
(the dedicated sleep-analysis endpoint with per-night breakdown + 7d aggregates).
That is NOT duplicated here.

This file covers the *main* wellness endpoint ``GET /api/wellness``:
  - GET /wellness → 200 happy path with multiple days
  - GET /wellness → 200 empty range (no rows)
  - GET /wellness → 422 when date query params missing
  - GET /wellness → 401 when not authenticated
"""

from __future__ import annotations

from datetime import date
from unittest.mock import patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "wellness@example.com", "hash")


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_list_wellness_entries() -> None:
    """GET /wellness returns 200 with the rows the DB yields for the window."""
    rows = [
        _row(date(2026, 6, 20), resting_hr=48, sleep_secs=28_800, sleep_score=85),
        _row(date(2026, 6, 21), resting_hr=50, sleep_secs=25_200, sleep_score=72),
        _row(date(2026, 6, 22), resting_hr=49, sleep_secs=27_000, sleep_score=80),
    ]
    _use_athlete(ATHLETE)

    with patch(
        "infrastructure.repositories.wellness.get_pool",
        return_value=_FakePool(_FakeConn(_FakeCursor(rows))),
    ):
        response = await _get("/api/v1/wellness?from=2026-06-20&to=2026-06-22")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 3
    assert body[0]["day"] == "2026-06-20"
    assert body[0]["resting_hr"] == 48
    assert body[2]["sleep_score"] == 80


@pytest.mark.no_db
async def test_list_wellness_empty() -> None:
    """GET /wellness on a range with no data → 200 with empty array."""
    _use_athlete(ATHLETE)

    with patch(
        "infrastructure.repositories.wellness.get_pool",
        return_value=_FakePool(_FakeConn(_FakeCursor([]))),
    ):
        response = await _get("/api/v1/wellness?from=2025-01-01&to=2025-01-07")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.no_db
async def test_list_wellness_single_day() -> None:
    """GET /wellness with a one-day window returns 200 with that single row."""
    _use_athlete(ATHLETE)
    rows = [_row(date(2026, 6, 22), resting_hr=46, hrv=58.5, source_readiness=82)]
    with patch(
        "infrastructure.repositories.wellness.get_pool",
        return_value=_FakePool(_FakeConn(_FakeCursor(rows))),
    ):
        response = await _get("/api/v1/wellness?from=2026-06-22&to=2026-06-22")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["hrv"] == 58.5
    assert body[0]["source_readiness"] == 82


# ---------------------------------------------------------------------------
# Error / edge cases
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_list_wellness_missing_date_params() -> None:
    """GET /wellness without required `from`/`to` query params → 422."""
    _use_athlete(ATHLETE)

    with patch(
        "infrastructure.repositories.wellness.get_pool",
        return_value=_FakePool(_FakeConn(_FakeCursor([]))),
    ):
        response = await _get("/api/v1/wellness")

    assert response.status_code == 422


@pytest.mark.no_db
async def test_list_wellness_requires_auth() -> None:
    """GET /wellness without access_token cookie → 401."""
    app.dependency_overrides.clear()

    response = await _get("/api/v1/wellness?from=2026-01-01&to=2026-01-07")

    assert response.status_code == 401


@pytest.mark.no_db
async def test_list_wellness_invalid_date_format() -> None:
    """GET /wellness with a malformed date → 422 (Pydantic datetime parsing)."""
    _use_athlete(ATHLETE)

    with patch(
        "infrastructure.repositories.wellness.get_pool",
        return_value=_FakePool(_FakeConn(_FakeCursor([]))),
    ):
        response = await _get("/api/v1/wellness?from=not-a-date&to=2026-01-07")

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _row(day: date, **overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "day": day,
        "resting_hr": None,
        "weight": None,
        "sleep_secs": None,
        "sleep_score": None,
        "fatigue": None,
        "soreness": None,
        "hrv": None,
        "vo2max": None,
        "steps": None,
        "stress": None,
        "mood": None,
        "motivation": None,
        "source_readiness": None,
        "comments": None,
    }
    return base | overrides


class _FakePool:
    def __init__(self, conn: "_FakeConn") -> None:
        self._conn = conn

    def connection(self) -> "_FakeConn":
        return self._conn


class _FakeConn:
    def __init__(self, cursor: "_FakeCursor") -> None:
        self._cursor = cursor

    def cursor(self) -> "_FakeCursor":
        return self._cursor

    async def __aenter__(self) -> "_FakeConn":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None


class _FakeCursor:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self._rows = rows

    async def execute(self, _query: object, _params: object) -> None:
        return None

    async def fetchall(self) -> list[dict[str, object]]:
        return self._rows


def _use_athlete(athlete: Athlete) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: athlete


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)
