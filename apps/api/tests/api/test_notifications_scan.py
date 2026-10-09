"""Tests for POST /api/notifications/scan endpoint."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from infrastructure.auth.models import Athlete
from main import app
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "scan@example.com", "hash")


@pytest.fixture(autouse=True)
def _clean_overrides() -> None:
    app.dependency_overrides.clear()


@pytest.mark.no_db
async def test_scan_requires_auth() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/notifications/scan")
    assert response.status_code == 401


@pytest.mark.no_db
async def test_scan_endpoint_calls_scanner_and_returns_counts(monkeypatch: pytest.MonkeyPatch) -> None:
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE

    # Mock get_pool().connection() -> async context manager yielding a fake conn.
    fake_conn = MagicMock()
    fake_cm = AsyncMock()
    fake_cm.__aenter__.return_value = fake_conn
    fake_pool = MagicMock()
    fake_pool.connection.return_value = fake_cm
    monkeypatch.setattr("presentation.api.notifications.get_pool", lambda: fake_pool)

    # Mock scan_all_athletes
    async def fake_scan(_conn: object, **kwargs: object) -> dict[str, int]:
        return {"athletes_scanned": 2, "notifications_generated": 5}

    monkeypatch.setattr(
        "presentation.api.notifications.scan_all_athletes", fake_scan
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/notifications/scan")
    assert response.status_code == 200
    payload = response.json()
    assert payload["athletes_scanned"] == 2
    assert payload["notifications_generated"] == 5
