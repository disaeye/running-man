from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.export import get_account_repo as get_export_account_repo
from presentation.api.goals import get_goals_repo
from presentation.auth.deps import get_current_athlete
from presentation.auth.routes import get_account_repo as get_auth_account_repo

ATHLETE = Athlete(uuid4(), "contracts@example.com", "hash")


class _AccountRepo:
    def __init__(self, deleted: bool = True) -> None:
        self.deleted = deleted
        self.deleted_ids: list[UUID] = []

    async def delete(self, athlete_id):
        self.deleted_ids.append(athlete_id)
        return self.deleted

    async def export(self, _athlete_id):
        return (
            {
                "id": str(ATHLETE.id),
                "email": ATHLETE.email,
                "name": "",
                "timezone": "UTC",
                "created_at": datetime(2026, 1, 1, tzinfo=UTC),
            },
            [],
        )


class _GoalsRepo:
    async def update(self, *_args):
        return None


@pytest.fixture(autouse=True)
def _clear_overrides() -> None:
    app.dependency_overrides.clear()


@pytest.mark.no_db
async def test_malformed_update_returns_validation_error() -> None:
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_goals_repo] = _GoalsRepo

    response = await _request(
        "PUT", f"/api/v1/goals/{uuid4()}", json={"title": 12}
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.no_db
async def test_unauthenticated_delete_returns_auth_error() -> None:
    response = await _request("DELETE", "/api/v1/auth/delete-account")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_ERROR"


@pytest.mark.no_db
async def test_authenticated_delete_clears_cookies_after_atomic_repository_delete() -> None:
    repo = _AccountRepo()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_auth_account_repo] = lambda: repo

    response = await _request("DELETE", "/api/v1/auth/delete-account")

    assert response.status_code == 200
    assert response.json() == {"deleted": True}
    assert repo.deleted_ids == [ATHLETE.id]
    assert "access_token=" in "\n".join(response.headers.get_list("set-cookie"))


@pytest.mark.no_db
async def test_unauthenticated_export_returns_auth_error() -> None:
    response = await _request("GET", "/api/v1/export")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_ERROR"


@pytest.mark.no_db
async def test_account_export_manifest_and_download_are_separate_json_contracts() -> None:
    repo = _AccountRepo()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_export_account_repo] = lambda: repo

    manifest = await _request("GET", "/api/v1/export")
    download = await _request("GET", "/api/v1/export/account.json")

    assert manifest.status_code == 200
    assert manifest.json()["format"] == "json"
    assert manifest.json()["download_url"].endswith("/api/v1/export/account.json")
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/json"
    assert download.json()["format"] == "running-man-account-export/v1"


async def _request(method: str, path: str, **kwargs: object) -> Response:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.request(method, path, **kwargs)
