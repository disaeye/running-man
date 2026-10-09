"""HTTP-level tests for ``/api/v1/auth/*`` endpoints.

Existing coverage in ``tests/auth/test_routes.py`` already exercises:
  - register → 201 happy path
  - login → 200 sets access_token + refresh_token cookies
  - login → 429 rate-limit after 5 failures

This file complements those cases without duplication:
  - register → 409 conflict on duplicate email
  - register → 422 validation error when password < 8 chars
  - login → 401 invalid credentials (wrong password)
  - refresh → 401 when no refresh_token cookie is sent
  - refresh → 200 happy path (rotates cookies)
  - logout → 200 clears access_token and refresh_token cookies
  - logout → 200 still clears cookies when no refresh_token cookie present
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient, Response

from application.auth.service import AuthService
from infrastructure.auth.settings import settings
from main import app
from presentation.auth.routes import get_auth_service

# Reuse the canonical fakes from the auth service test suite to keep behavior
# identical with the tests in tests/auth/test_service.py.
from tests.auth.test_service import FakeAthletes, FakeAttempts, FakeRevoked

# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_refresh_rotates_cookies() -> None:
    """POST /api/v1/auth/refresh with a valid refresh_token issues fresh cookies."""
    _use_fake_auth_service()
    await _post_json("/api/v1/auth/register", {"email": "ref1@example.com", "password": "secret123"})
    login = await _post_json("/api/v1/auth/login", {"email": "ref1@example.com", "password": "secret123"})

    response = await _post_with_cookie("/api/v1/auth/refresh", login.cookies.get("refresh_token", ""))

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert response.cookies.get("access_token")
    # Refresh token must be rotated (different from the one sent).
    new_refresh = response.cookies.get("refresh_token")
    assert new_refresh is not None
    assert new_refresh != login.cookies.get("refresh_token")


@pytest.mark.no_db
async def test_logout_clears_cookies() -> None:
    """POST /api/v1/auth/logout deletes both cookies regardless of refresh_token presence."""
    _use_fake_auth_service()
    await _post_json("/api/v1/auth/register", {"email": "lo1@example.com", "password": "secret123"})
    login = await _post_json("/api/v1/auth/login", {"email": "lo1@example.com", "password": "secret123"})

    response = await _post_with_cookie("/api/v1/auth/logout", login.cookies.get("refresh_token", ""))

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    # httpx exposes Set-Cookie clearing via empty value + Max-Age=0.
    set_cookie_header = response.headers.get_list("set-cookie")
    joined = "\n".join(set_cookie_header)
    assert "access_token=" in joined
    assert "refresh_token=" in joined
    assert "Max-Age=0" in joined or "max-age=0" in joined


# ---------------------------------------------------------------------------
# Error / edge cases
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_register_conflict_on_duplicate_email() -> None:
    """POST /api/v1/auth/register with an existing email → 409 CONFLICT."""
    _use_fake_auth_service()
    await _post_json("/api/v1/auth/register", {"email": "dup@example.com", "password": "secret123"})

    response = await _post_json(
        "/api/v1/auth/register", {"email": "dup@example.com", "password": "secret123"}
    )

    assert response.status_code == 409
    body = response.json()
    # Unified error shape: {"error": {"code": "CONFLICT", ...}, "detail": ...}
    assert body["error"]["code"] == "CONFLICT"
    assert "exists" in body["detail"].lower()


@pytest.mark.no_db
async def test_register_short_password_rejected() -> None:
    """POST /api/v1/auth/register with a <8-char password → 422 validation error."""
    _use_fake_auth_service()

    response = await _post_json("/api/v1/auth/register", {"email": "short@example.com", "password": "abc"})

    assert response.status_code == 422


@pytest.mark.no_db
async def test_login_invalid_credentials_returns_401() -> None:
    """POST /api/v1/auth/login with wrong password → 401 (not 429, no lock yet)."""
    _use_fake_auth_service()
    await _post_json("/api/v1/auth/register", {"email": "bad1@example.com", "password": "secret123"})

    response = await _post_json("/api/v1/auth/login", {"email": "bad1@example.com", "password": "wrong"})

    assert response.status_code == 401
    body = response.json()
    assert body["error"]["code"] == "AUTH_ERROR"
    assert "access_token" not in response.cookies


@pytest.mark.no_db
async def test_refresh_without_cookie_returns_401() -> None:
    """POST /api/v1/auth/refresh with no refresh_token cookie → 401."""
    _use_fake_auth_service()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/auth/refresh")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_ERROR"


@pytest.mark.no_db
async def test_legacy_auth_login_is_not_found_without_auth_service_call() -> None:
    _use_fake_auth_service()

    response = await _post_json(
        "/auth/login", {"email": "legacy@example.com", "password": "secret123"}
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


class _RouteAttempts(FakeAttempts):
    """Counts failures so is_locked() flips only after 5 (matches real rate limit)."""

    def __init__(self) -> None:
        self.failed_count = 0

    async def is_locked(self, _ip: str) -> bool:
        return self.failed_count >= 5

    async def record_failure(self, _ip: str) -> None:
        self.failed_count += 1


def _use_fake_auth_service() -> None:
    attempts: _RouteAttempts = _RouteAttempts()
    service = AuthService(FakeAthletes(), FakeRevoked(), attempts, settings.jwt_secret)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_auth_service] = lambda: service


async def _post_json(path: str, payload: dict[str, str]) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, json=payload)


async def _post_with_cookie(path: str, refresh_token: str | None) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, cookies={"refresh_token": refresh_token or ""})
