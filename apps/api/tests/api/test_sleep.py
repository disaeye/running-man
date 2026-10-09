"""Tests for GET /api/wellness/sleep — dedicated sleep analysis endpoint."""

from datetime import date
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "sleep@test.local", "hash")


@pytest.mark.no_db
async def test_get_sleep_analysis_success(monkeypatch: pytest.MonkeyPatch) -> None:
    """Happy path: 7 nights returned with correct shape and aggregates."""
    _use_athlete(ATHLETE)

    async def fake_fetch(athlete_id: object, start: date, end: date) -> list[dict[str, object]]:
        return [
            {"day": date(2026, 6, 10), "sleep_secs": 25_200, "sleep_score": 80},
            {"day": date(2026, 6, 11), "sleep_secs": 28_800, "sleep_score": 85},
            {"day": date(2026, 6, 12), "sleep_secs": 21_600, "sleep_score": 60},
            {"day": date(2026, 6, 13), "sleep_secs": 27_000, "sleep_score": 75},
            {"day": date(2026, 6, 14), "sleep_secs": 25_200, "sleep_score": 78},
            {"day": date(2026, 6, 15), "sleep_secs": 28_800, "sleep_score": 90},
            {"day": date(2026, 6, 16), "sleep_secs": 25_200, "sleep_score": 82},
        ]

    monkeypatch.setattr("presentation.api.wellness._fetch_sleep_data", fake_fetch)

    response = await _get("/api/v1/wellness/sleep?from=2026-06-10&to=2026-06-16")
    assert response.status_code == 200

    payload = response.json()
    assert len(payload["nights"]) == 7
    assert payload["nights"][0]["date"] == "2026-06-10"
    assert payload["nights"][0]["total_sleep_s"] == 25_200
    assert payload["nights"][0]["sleep_score"] == 80
    # stage-level fields are always null (not yet available)
    assert payload["nights"][0]["sleep_start"] is None
    assert payload["nights"][0]["sleep_end"] is None
    assert payload["nights"][0]["deep_sleep_s"] is None
    assert payload["nights"][0]["rem_sleep_s"] is None
    assert payload["nights"][0]["light_sleep_s"] is None
    assert payload["nights"][0]["awake_count"] is None

    aggs = payload["aggregates"]
    assert aggs["avg_total_sleep_7d"] is not None
    assert aggs["sleep_debt_7d"] is not None
    assert aggs["consistency_score"] is not None


@pytest.mark.no_db
async def test_get_sleep_analysis_no_data(monkeypatch: pytest.MonkeyPatch) -> None:
    """Empty range: zero nights and null aggregates."""
    _use_athlete(ATHLETE)

    async def fake_fetch(_athlete_id: object, _start: date, _end: date) -> list[dict[str, object]]:
        return []

    monkeypatch.setattr("presentation.api.wellness._fetch_sleep_data", fake_fetch)

    response = await _get("/api/v1/wellness/sleep?from=2025-01-01&to=2025-01-07")
    assert response.status_code == 200

    payload = response.json()
    assert payload["nights"] == []
    assert payload["aggregates"]["avg_total_sleep_7d"] is None
    assert payload["aggregates"]["sleep_debt_7d"] is None
    assert payload["aggregates"]["consistency_score"] is None


@pytest.mark.no_db
async def test_get_sleep_analysis_null_sleep_secs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When sleep_secs is null, per-night shows null and aggregates skip it."""
    _use_athlete(ATHLETE)

    async def fake_fetch(_athlete_id: object, _start: date, _end: date) -> list[dict[str, object]]:
        return [
            {"day": date(2026, 6, 10), "sleep_secs": None, "sleep_score": None},
            {"day": date(2026, 6, 11), "sleep_secs": 28_800, "sleep_score": 85},
        ]

    monkeypatch.setattr("presentation.api.wellness._fetch_sleep_data", fake_fetch)

    response = await _get("/api/v1/wellness/sleep?from=2026-06-10&to=2026-06-11")
    assert response.status_code == 200

    payload = response.json()
    assert payload["nights"][0]["total_sleep_s"] is None
    assert payload["nights"][0]["sleep_score"] is None
    # aggregate from the 1 valid entry
    assert payload["aggregates"]["avg_total_sleep_7d"] == 28_800
    assert payload["aggregates"]["consistency_score"] is None  # only 1 value


@pytest.mark.no_db
async def test_get_sleep_analysis_requires_auth() -> None:
    """401 when no athlete is authenticated."""
    app.dependency_overrides.clear()
    response = await _get("/api/v1/wellness/sleep?from=2026-01-01&to=2026-01-07")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


def _use_athlete(athlete: Athlete) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: athlete
