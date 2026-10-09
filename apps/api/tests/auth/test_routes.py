import pytest
from httpx import ASGITransport, AsyncClient, Response

from application.auth.service import AttemptStore, AuthService
from infrastructure.auth.settings import settings
from main import app
from presentation.auth.routes import get_auth_service

from .test_service import FakeAthletes, FakeAttempts, FakeRevoked


@pytest.mark.no_db
async def test_register_endpoint() -> None:
    _use_fake_auth_service()
    response = await _post_json(
        "/api/v1/auth/register", {"email": "r1@example.com", "password": "secret123"}
    )

    assert response.status_code == 201
    assert "athlete_id" in response.json()


@pytest.mark.no_db
async def test_login_sets_cookie() -> None:
    _use_fake_auth_service()
    await _post_json("/api/v1/auth/register", {"email": "r2@example.com", "password": "secret123"})

    response = await _post_json("/api/v1/auth/login", {"email": "r2@example.com", "password": "secret123"})

    assert response.status_code == 200
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies


@pytest.mark.no_db
async def test_login_rate_limit_triggers() -> None:
    _use_fake_auth_service()
    await _post_json("/api/v1/auth/register", {"email": "r3@example.com", "password": "secret123"})

    for _ in range(5):
        await _post_json("/api/v1/auth/login", {"email": "r3@example.com", "password": "bad"})
    response = await _post_json("/api/v1/auth/login", {"email": "r3@example.com", "password": "bad"})

    assert response.status_code == 429


async def _post_json(path: str, payload: dict[str, str]) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, json=payload)


class RouteAttempts(FakeAttempts):
    def __init__(self) -> None:
        self.failed_count = 0

    async def is_locked(self, _ip: str) -> bool:
        return self.failed_count >= 5

    async def record_failure(self, _ip: str) -> None:
        self.failed_count += 1


def _use_fake_auth_service() -> None:
    attempts: AttemptStore = RouteAttempts()
    service = AuthService(FakeAthletes(), FakeRevoked(), attempts, settings.jwt_secret)
    app.dependency_overrides[get_auth_service] = lambda: service
