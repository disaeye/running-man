"""Tests for race prediction endpoints (running only)."""

from typing import cast
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.race import get_running_activities
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "race@example.com", "hash")


def _activity(sport: str, distance_m: int, duration_s: int) -> dict[str, object]:
    return {
        "activity_id": f"{sport}-{distance_m}-{duration_s}",
        "sport": sport,
        "distance_m": distance_m,
        "duration_s": duration_s,
    }


@pytest.mark.no_db
async def test_get_predict_auto_detects_basis_from_prs() -> None:
    _use_activities(
        [
            _activity("Run", 5000, 1200),
            _activity("Run", 10000, 2700),
            _activity("Run", 21097, 6000),
            _activity("Ride", 40000, 3600),  # ignored: not running
        ]
    )

    response = await _get("/api/v1/race/predict")
    assert response.status_code == 200
    payload = cast(dict[str, object], response.json())

    assert payload["data_sufficient"] is True
    assert payload["basis"]["source"] == "personal_record"  # type: ignore[index]
    # Longest standard distance up to half marathon = 21097 (the half activity).
    assert payload["basis"]["recent_distance_m"] == 21097  # type: ignore[index]
    preds = payload["predictions"]
    assert [p["label"] for p in preds] == ["5K", "10K", "half_marathon", "marathon"]


@pytest.mark.no_db
async def test_get_predict_returns_200_with_data_insufficient_when_no_running_activities() -> None:
    _use_activities([_activity("Ride", 40000, 3600)])

    response = await _get("/api/v1/race/predict")
    assert response.status_code == 200
    payload = cast(dict[str, object], response.json())
    assert payload["data_sufficient"] is False
    assert payload["predictions"] == []
    assert payload["basis"] is None
    assert payload["confidence"] is None


@pytest.mark.no_db
async def test_post_predict_explicit_input_without_history() -> None:
    _use_activities([])  # no history → no cross-check

    response = await _post("/api/v1/race/predict", {"recent_time_s": 1200, "recent_distance_m": 5000})
    assert response.status_code == 200
    payload = cast(dict[str, object], response.json())
    assert payload["basis"]["source"] == "manual"  # type: ignore[index]
    assert payload["basis"]["recent_distance_m"] == 5000  # type: ignore[index]
    ten_k = payload["predictions"][1]
    assert ten_k["label"] == "10K"
    assert ten_k["time_s"] == pytest.approx(1200 * 2**1.06, rel=1e-3)
    assert all(p["cross_check"] is None for p in payload["predictions"])


@pytest.mark.no_db
async def test_post_predict_validates_positive_inputs() -> None:
    _use_activities([])
    response = await _post("/api/v1/race/predict", {"recent_time_s": 0, "recent_distance_m": 5000})
    assert response.status_code == 422


@pytest.mark.no_db
async def test_race_endpoints_require_auth() -> None:
    app.dependency_overrides.clear()
    assert (await _get("/api/v1/race/predict")).status_code == 401
    assert (
        await _post("/api/v1/race/predict", {"recent_time_s": 1200, "recent_distance_m": 5000})
    ).status_code == 401


# ---- helpers ----


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def _post(path: str, payload: dict[str, object]) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, json=payload)


def _use_activities(activities: list[dict[str, object]]) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_running_activities] = lambda: activities
