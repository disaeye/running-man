from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "recompute@example.com", "hash")


@pytest.mark.no_db
async def test_recompute_success() -> None:
    _override_auth()
    with patch(
        "presentation.api.insights.enqueue_activity_recompute",
        new_callable=AsyncMock,
        return_value=42,
    ) as enqueue:
        resp = await _post("/api/v1/insights/recompute")

    assert resp.status_code == 200
    data = resp.json()
    assert data == {"recompute_status": "queued", "recompute_generation": 42}
    enqueue.assert_awaited_once_with(ATHLETE.id, "manual")


@pytest.mark.no_db
async def test_recompute_with_custom_dates() -> None:
    _override_auth()
    from_date = "2026-01-01"
    to_date = "2026-03-01"

    with patch(
        "presentation.api.insights.enqueue_activity_recompute",
        new_callable=AsyncMock,
        return_value=2,
    ) as enqueue:
        resp = await _post(
            "/api/v1/insights/recompute",
            json={"from_date": from_date, "to_date": to_date},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data == {"recompute_status": "queued", "recompute_generation": 2}
    enqueue.assert_awaited_once_with(ATHLETE.id, "manual")


@pytest.mark.no_db
async def test_recompute_exceeds_max_days_returns_400() -> None:
    _override_auth()
    from_date = "2026-01-01"
    to_date = "2027-01-02"  # 366 days → exceeds 365

    resp = await _post(
        "/api/v1/insights/recompute",
        json={"from_date": from_date, "to_date": to_date},
    )

    assert resp.status_code == 400
    data = resp.json()
    assert "exceed 365 days" in data.get("detail", "")


@pytest.mark.no_db
async def test_recompute_defaults_to_last_90_days() -> None:
    """When no dates are provided, endpoint defaults to 90 days back from today."""
    _override_auth()

    with patch(
        "presentation.api.insights.enqueue_activity_recompute",
        new_callable=AsyncMock,
        return_value=1,
    ):
        resp = await _post("/api/v1/insights/recompute")

    assert resp.status_code == 200
    assert resp.json() == {"recompute_status": "queued", "recompute_generation": 1}


@pytest.mark.no_db
async def test_recompute_with_only_from_date() -> None:
    """Only from_date provided, to_date defaults to today."""
    _override_auth()

    with patch(
        "presentation.api.insights.enqueue_activity_recompute",
        new_callable=AsyncMock,
        return_value=1,
    ):
        resp = await _post(
            "/api/v1/insights/recompute",
            json={"from_date": "2026-06-01"},
        )

    assert resp.status_code == 200
    assert resp.json()["recompute_status"] == "queued"


@pytest.mark.no_db
async def test_recompute_max_range_365_days_allowed() -> None:
    """Exactly 365 days should be accepted."""
    _override_auth()

    with patch(
        "presentation.api.insights.enqueue_activity_recompute",
        new_callable=AsyncMock,
        return_value=1,
    ):
        resp = await _post(
            "/api/v1/insights/recompute",
            json={"from_date": "2026-01-01", "to_date": "2027-01-01"},  # 365 days
        )

    assert resp.status_code == 200


def _override_auth() -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE


async def _post(path: str, json: dict | None = None) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, json=json)
