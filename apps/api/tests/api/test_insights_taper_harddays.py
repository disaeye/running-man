from datetime import date
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api import insights
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "taper-test@example.com", "hash")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _taper_loads(
    *,
    high_tss: float = 100.0,
    low_tss: float = 70.0,
    tsb: float = 15.0,
    start_day: date = date(2026, 6, 1),
) -> list[dict[str, object]]:
    """14 high-load days + 7 reduced-load days = 21 days."""
    loads: list[dict[str, object]] = []
    for i in range(14):
        loads.append({"day": start_day.replace(day=start_day.day + i), "tss": high_tss, "tsb": tsb})
    for i in range(14, 21):
        loads.append({"day": start_day.replace(day=start_day.day + i), "tss": low_tss, "tsb": tsb})
    return loads


def _no_taper_loads() -> list[dict[str, object]]:
    """Flat TSS, no reduction."""
    return [{"day": date(2026, 6, i), "tss": 100.0, "tsb": 5.0} for i in range(1, 22)]


async def _fake_daily_loads(_athlete_id: UUID, _start: date, _end: date) -> list[dict[str, object]]:
    return _taper_loads()


async def _fake_empty_loads(_athlete_id: UUID, _start: date, _end: date) -> list[dict[str, object]]:
    return []


async def _fake_flat_loads(_athlete_id: UUID, _start: date, _end: date) -> list[dict[str, object]]:
    return _no_taper_loads()


async def _fake_hard_day_loads(
    _athlete_id: UUID, _start: date, _end: date
) -> list[dict[str, object]]:
    return [
        {"day": date(2026, 6, 1), "tss": 50.0, "tsb": 10.0},
        {"day": date(2026, 6, 2), "tss": 120.0, "tsb": 5.0},
        {"day": date(2026, 6, 3), "tss": 130.0, "tsb": 0.0},
        {"day": date(2026, 6, 4), "tss": 90.0, "tsb": 8.0},
        {"day": date(2026, 6, 5), "tss": 110.0, "tsb": 3.0},
        {"day": date(2026, 6, 6), "tss": 110.0, "tsb": 2.0},
        {"day": date(2026, 6, 7), "tss": 80.0, "tsb": 6.0},
    ]


async def _fake_easy_day_loads(
    _athlete_id: UUID, _start: date, _end: date
) -> list[dict[str, object]]:
    return [
        {"day": date(2026, 6, 1), "tss": 50.0, "tsb": 10.0},
        {"day": date(2026, 6, 2), "tss": 60.0, "tsb": 12.0},
        {"day": date(2026, 6, 3), "tss": 70.0, "tsb": 14.0},
    ]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


def _use_athlete(athlete: Athlete | None = None) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: athlete or ATHLETE


# ---------------------------------------------------------------------------
# Taper tests
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_taper_detects_tapering_with_race_date() -> None:
    """When TSS reduces >15% week-over-week and race is 7-21 days away,
    is_tapering should be True and freshness_ok should reflect TSB > 10."""
    _use_athlete()
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(insights, "_daily_loads_for_range", _fake_daily_loads)

    # race_date = last day + 7 → days_to_race = 7 (within taper window)
    response = await _get("/api/v1/insights/taper?from=2026-06-01&to=2026-06-21&race_date=2026-06-28")

    assert response.status_code == 200
    payload = response.json()
    assert payload["is_tapering"] is True
    assert payload["freshness_ok"] is True
    assert payload["days_to_race"] == 7
    assert payload["recommended_reduction_pct"] == 15.0


@pytest.mark.no_db
async def test_taper_no_race_date() -> None:
    """Without a race_date, is_tapering should be False and days_to_race None."""
    _use_athlete()
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(insights, "_daily_loads_for_range", _fake_daily_loads)

    response = await _get("/api/v1/insights/taper?from=2026-06-01&to=2026-06-21")

    assert response.status_code == 200
    payload = response.json()
    assert payload["is_tapering"] is False
    assert payload["days_to_race"] is None


@pytest.mark.no_db
async def test_taper_empty_loads_returns_graceful_response() -> None:
    """Empty daily loads should not error; return status flags."""
    _use_athlete()
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(insights, "_daily_loads_for_range", _fake_empty_loads)

    response = await _get("/api/v1/insights/taper?race_date=2026-06-28")

    assert response.status_code == 200
    payload = response.json()
    assert payload["is_tapering"] is False
    assert payload["freshness_ok"] is False
    assert payload["days_to_race"] is None


@pytest.mark.no_db
async def test_taper_no_reduction_means_not_tapering() -> None:
    """Flat TSS with no reduction should yield is_tapering=False even with race_date."""
    _use_athlete()
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(insights, "_daily_loads_for_range", _fake_flat_loads)

    response = await _get("/api/v1/insights/taper?race_date=2026-06-28")

    assert response.status_code == 200
    payload = response.json()
    assert payload["is_tapering"] is False


# ---------------------------------------------------------------------------
# Hard-days tests
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_hard_days_detects_consecutive_high_tss() -> None:
    """Consecutive days with TSS > 100 should be reported as runs."""
    _use_athlete()
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(insights, "_daily_loads_for_range", _fake_hard_day_loads)

    response = await _get("/api/v1/insights/hard-days?from=2026-06-01&to=2026-06-07")

    assert response.status_code == 200
    payload = response.json()
    # Expected: [120, 130] at indices 1-2, and [110, 110] at indices 4-5
    assert payload == [
        {"start_index": 1, "end_index": 2},
        {"start_index": 4, "end_index": 5},
    ]


@pytest.mark.no_db
async def test_hard_days_no_hard_days_returns_empty_list() -> None:
    """If no TSS exceeds threshold, result should be empty."""
    _use_athlete()
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(insights, "_daily_loads_for_range", _fake_easy_day_loads)

    response = await _get("/api/v1/insights/hard-days?from=2026-06-01&to=2026-06-03")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.no_db
async def test_hard_days_empty_loads_returns_empty_list() -> None:
    """Empty daily loads should yield empty list, not an error."""
    _use_athlete()
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(insights, "_daily_loads_for_range", _fake_empty_loads)

    response = await _get("/api/v1/insights/hard-days?from=2026-06-01&to=2026-06-07")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.no_db
async def test_hard_days_requires_auth() -> None:
    """Without auth, the endpoint should return 401."""
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = _raise_401

    response = await _get("/api/v1/insights/hard-days?from=2026-06-01&to=2026-06-07")

    assert response.status_code == 401


@pytest.mark.no_db
async def test_taper_requires_auth() -> None:
    """Without auth, the endpoint should return 401."""
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = _raise_401

    response = await _get("/api/v1/insights/taper?race_date=2026-06-28")

    assert response.status_code == 401


def _raise_401() -> None:
    from fastapi import HTTPException

    raise HTTPException(status_code=401, detail="unauthorized")
