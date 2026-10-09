"""Tests for unified error response shape.

Verifies:
- Error subclasses carry correct code / status / message
- Response JSON matches the unified ``{"error": {...}, "detail": "..."}`` shape
- Legacy ``HTTPException`` is adapted to the same shape
- Frontend ``api.ts`` invariant (top-level ``detail`` field) is preserved
"""

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient

from main import app as application
from presentation.errors import (
    AppError,
    AuthError,
    ConflictError,
    NotFoundError,
    ValidationError,
    register_error_handlers,
)

# ── Unit: subclass contract ─────────────────────────────────────────────────


class TestErrorSubclasses:
    def test_not_found_defaults(self) -> None:
        err = NotFoundError()
        assert err.code == "NOT_FOUND"
        assert err.status == 404
        assert err.message == "resource not found"
        assert err.detail is None

    def test_not_found_custom(self) -> None:
        err = NotFoundError("activity not found", {"activity_id": "abc-123"})
        assert err.message == "activity not found"
        assert err.detail == {"activity_id": "abc-123"}

    def test_validation_error(self) -> None:
        err = ValidationError("invalid date format")
        assert err.code == "VALIDATION_ERROR"
        assert err.status == 400
        assert err.message == "invalid date format"

    def test_auth_error(self) -> None:
        err = AuthError("token expired")
        assert err.code == "AUTH_ERROR"
        assert err.status == 401

    def test_conflict_error(self) -> None:
        err = ConflictError("duplicate email")
        assert err.code == "CONFLICT"
        assert err.status == 409

    def test_base_app_error(self) -> None:
        err = AppError("CUSTOM", 418, "custom teapot", {"origin": "RFC 2324"})
        assert err.code == "CUSTOM"
        assert err.status == 418
        assert err.detail == {"origin": "RFC 2324"}


# ── Integration: unified JSON shape via handler registration ────────────────


@pytest.fixture
def error_app() -> FastAPI:
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/not-found")
    async def _not_found() -> None:
        raise NotFoundError("custom 404 message")

    @app.get("/bad-request")
    async def _bad_request() -> None:
        raise ValidationError("invalid input")

    @app.get("/unauthorized")
    async def _unauthorized() -> None:
        raise AuthError("bad token")

    @app.get("/conflict")
    async def _conflict() -> None:
        raise ConflictError("already exists")

    @app.get("/legacy-404")
    async def _legacy_404() -> None:
        raise HTTPException(status_code=404, detail="legacy 404")

    @app.get("/legacy-403")
    async def _legacy_403() -> None:
        raise HTTPException(status_code=403, detail="forbidden")

    return app


@pytest.mark.no_db
class TestUnifiedShape:
    async def test_not_found_shape(self, error_app: FastAPI) -> None:
        body = await _get_json(error_app, "/not-found", 404)
        assert body["error"]["code"] == "NOT_FOUND"
        assert body["error"]["message"] == "custom 404 message"
        assert body["detail"] == "custom 404 message"

    async def test_validation_shape(self, error_app: FastAPI) -> None:
        body = await _get_json(error_app, "/bad-request", 400)
        assert body["error"]["code"] == "VALIDATION_ERROR"
        assert body["error"]["message"] == "invalid input"
        assert body["detail"] == "invalid input"

    async def test_auth_shape(self, error_app: FastAPI) -> None:
        body = await _get_json(error_app, "/unauthorized", 401)
        assert body["error"]["code"] == "AUTH_ERROR"

    async def test_conflict_shape(self, error_app: FastAPI) -> None:
        body = await _get_json(error_app, "/conflict", 409)
        assert body["error"]["code"] == "CONFLICT"

    async def test_legacy_http_exception_404(self, error_app: FastAPI) -> None:
        """Legacy HTTPException(404) is adapted to the unified shape."""
        body = await _get_json(error_app, "/legacy-404", 404)
        assert body["error"]["code"] == "NOT_FOUND"
        assert body["error"]["message"] == "legacy 404"
        assert body["detail"] == "legacy 404"

    async def test_legacy_http_exception_403(self, error_app: FastAPI) -> None:
        """Legacy HTTPException(403) maps to FORBIDDEN."""
        body = await _get_json(error_app, "/legacy-403", 403)
        assert body["error"]["code"] == "FORBIDDEN"
        assert body["detail"] == "forbidden"

    async def test_frontend_backward_compat(self, error_app: FastAPI) -> None:
        """The frontend api.ts reads ``body.detail ?? body.message ?? ...``.

        Our shape MUST provide ``detail`` at the top level so the fallback chain
        in ``apps/web/lib/api.ts:48`` continues to work.
        """
        body = await _get_json(error_app, "/not-found", 404)
        # This is exactly what api.ts does:
        detail = body.get("detail") or body.get("message") or "fallback"
        assert detail == "custom 404 message"

    async def test_unmatched_route_uses_unified_not_found_shape(self) -> None:
        transport = ASGITransport(app=application)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/pmc")

        assert response.status_code == 404
        assert response.headers["X-API-Version"] == "1"
        assert response.json() == {
            "error": {"code": "NOT_FOUND", "message": "Not Found"},
            "detail": "Not Found",
        }


async def _get_json(app: FastAPI, path: str, expected_status: int) -> dict:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(path)
    assert response.status_code == expected_status
    return response.json()
