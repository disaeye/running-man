from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.share import get_activity_repo, get_share_repo
from presentation.auth.deps import get_current_athlete

ATHLETE_A = Athlete(uuid4(), "a@example.com", "hash")
ATHLETE_B = Athlete(uuid4(), "b@example.com", "hash")
ACTIVITY_ID = "activity-text-id"


@pytest.mark.no_db
async def test_create_share_returns_uuid4_token_and_url() -> None:
    share_repo = FakeShareRepo()
    _wire(FakeActivityRepo(), share_repo, ATHLETE_A)

    response = await _post(f"/api/v1/activities/{ACTIVITY_ID}/share")

    payload = cast(dict[str, object], response.json())
    token_value = payload["token"]
    assert isinstance(token_value, str)
    token = UUID(token_value)
    assert response.status_code == 200
    assert token.version == 4
    assert payload["url"] == f"http://test/api/v1/share/{token}"
    assert share_repo.created == [(ATHLETE_A.id, ACTIVITY_ID, token)]


@pytest.mark.no_db
async def test_create_share_rejects_other_athlete_activity() -> None:
    _wire(FakeActivityRepo(owner=ATHLETE_A, exists=True), FakeShareRepo(), ATHLETE_B)

    response = await _post(f"/api/v1/activities/{ACTIVITY_ID}/share")

    assert response.status_code == 403


@pytest.mark.no_db
async def test_revoke_share_sets_revoked_at_for_owner() -> None:
    share_repo = FakeShareRepo()
    _wire(FakeActivityRepo(), share_repo, ATHLETE_A)

    response = await _delete(f"/api/v1/activities/{ACTIVITY_ID}/share")

    assert response.status_code == 204
    assert share_repo.revoked == [(ATHLETE_A.id, ACTIVITY_ID)]


@pytest.mark.no_db
async def test_public_share_does_not_require_auth_and_redacts_private_fields() -> None:
    token = uuid4()
    _wire_public(FakeShareRepo(activity=_activity()))

    response = await _get(f"/api/v1/share/{token}")

    assert response.status_code == 200
    assert response.json() == {
        "sport": "Run",
        "date": "2026-06-23",
        "duration_s": 3600,
        "distance_m": 10000.0,
        "name": "Morning Run",
    }
    forbidden = {"athlete_id", "email", "start_time", "avg_hr", "avg_power", "raw_data"}
    assert forbidden.isdisjoint(cast(dict[str, object], response.json()))


@pytest.mark.no_db
async def test_revoked_or_missing_share_returns_404_not_401() -> None:
    _wire_public(FakeShareRepo(activity=None))

    response = await _get(f"/api/v1/share/{uuid4()}")

    assert response.status_code == 404


def _wire(activity_repo: "FakeActivityRepo", share_repo: "FakeShareRepo", athlete: Athlete) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: athlete
    app.dependency_overrides[get_activity_repo] = lambda: activity_repo
    app.dependency_overrides[get_share_repo] = lambda: share_repo


def _wire_public(share_repo: "FakeShareRepo") -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = _fail_auth_if_called
    app.dependency_overrides[get_share_repo] = lambda: share_repo


async def _fail_auth_if_called() -> Athlete:
    raise AssertionError("public share must not use auth dependency")


async def _post(path: str) -> Response:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.post(path)


async def _delete(path: str) -> Response:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.delete(path)


async def _get(path: str) -> Response:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(path)


class FakeActivityRepo:
    def __init__(self, owner: Athlete = ATHLETE_A, exists: bool = True) -> None:
        self.owner: Athlete = owner
        self._exists: bool = exists

    async def get_by_id(self, athlete_id: UUID, activity_id: str) -> dict[str, object] | None:
        if athlete_id == self.owner.id and activity_id == ACTIVITY_ID:
            return _activity()
        return None

    async def exists(self, activity_id: str) -> bool:
        return activity_id == ACTIVITY_ID and self._exists


class FakeShareRepo:
    def __init__(self, activity: dict[str, object] | None = None) -> None:
        self.activity: dict[str, object] | None = activity
        self.created: list[tuple[UUID, str, UUID]] = []
        self.revoked: list[tuple[UUID, str]] = []

    async def create(self, athlete_id: UUID, activity_id: str, token: UUID) -> UUID:
        self.created.append((athlete_id, activity_id, token))
        return token

    async def revoke(self, athlete_id: UUID, activity_id: str) -> bool:
        self.revoked.append((athlete_id, activity_id))
        return True

    async def get_activity_for_token(self, _token: UUID) -> dict[str, object] | None:
        return self.activity


def _activity() -> dict[str, object]:
    return {
        "activity_id": ACTIVITY_ID,
        "athlete_id": ATHLETE_A.id,
        "email": ATHLETE_A.email,
        "start_time": datetime(2026, 6, 23, 9, 45, tzinfo=UTC),
        "sport": "Run",
        "distance_m": 10000.0,
        "duration_s": 3600,
        "avg_hr": 150,
        "avg_power": 240,
        "device_name": "private-watch",
        "raw_data": {"name": "Morning Run", "notes": "private"},
    }
