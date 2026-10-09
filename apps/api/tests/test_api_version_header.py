"""Tests: every API response includes X-API-Version header."""

import pytest
from httpx import ASGITransport, AsyncClient

from main import app

pytestmark = [pytest.mark.no_db]


@pytest.fixture(autouse=True)
def _clean_overrides() -> None:
    app.dependency_overrides.clear()


class TestApiVersionHeader:
    """X-API-Version must appear on every response."""

    async def test_health_endpoint_has_version_header(self) -> None:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.headers.get("X-API-Version") == "1"

    async def test_api_endpoint_has_version_header(self) -> None:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/athletes/me")
        assert resp.headers.get("X-API-Version") == "1"

    async def test_not_found_has_version_header(self) -> None:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/nonexistent")
        assert resp.status_code == 404
        assert resp.headers.get("X-API-Version") == "1"

    def test_openapi_uses_version_one_and_unique_deterministic_operation_ids(self) -> None:
        first_schema = app.openapi()
        operation_ids = [
            operation["operationId"]
            for methods in first_schema["paths"].values()
            for operation in methods.values()
        ]

        assert app.version == "1.0.0"
        assert len(operation_ids) == len(set(operation_ids))
        assert operation_ids == [
            operation["operationId"]
            for methods in app.openapi()["paths"].values()
            for operation in methods.values()
        ]
