from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.gear import get_gear_repo
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "gear@example.com", "hash")
SHOE_ID = uuid4()


@pytest.mark.no_db
async def test_create_and_list_shoes_with_mileage_and_retirement_alert() -> None:
    repo = FakeGearRepo(mileage_m=805_000)
    _use_repo(repo)

    create = await _post("/api/v1/gear/shoes", {"name": "Pegasus", "brand": "Nike"})
    listed = await _get("/api/v1/gear/shoes")

    assert create.status_code == 201
    assert create.json()["name"] == "Pegasus"
    assert create.json()["mileage_m"] == 805_000
    assert create.json()["retirement_alert"] is True
    assert listed.status_code == 200
    assert listed.json()[0]["brand"] == "Nike"


@pytest.mark.no_db
async def test_update_and_soft_retire_shoe() -> None:
    repo = FakeGearRepo()
    _use_repo(repo)

    update = await _put(f"/api/v1/gear/shoes/{SHOE_ID}", {"notes": "race only"})
    retire = await _delete(f"/api/v1/gear/shoes/{SHOE_ID}")

    assert update.status_code == 200
    assert update.json()["notes"] == "race only"
    assert retire.status_code == 204
    assert repo.retired is True


@pytest.mark.no_db
async def test_assign_shoe_to_run_activity() -> None:
    repo = FakeGearRepo(activity_sport="TrailRun")
    _use_repo(repo)

    response = await _post(f"/api/v1/gear/shoes/{SHOE_ID}/assign", {"activity_id": "run-1"})

    assert response.status_code == 201
    assert response.json()["activity_id"] == "run-1"
    assert repo.assigned == ["run-1"]


@pytest.mark.no_db
async def test_rejects_non_run_activity_assignment() -> None:
    _use_repo(FakeGearRepo(activity_sport="Ride"))

    response = await _post(f"/api/v1/gear/shoes/{SHOE_ID}/assign", {"activity_id": "ride-1"})

    assert response.status_code == 400
    assert "shoe-assignable" in response.text


@pytest.mark.no_db
async def test_unassign_shoe_activity() -> None:
    repo = FakeGearRepo()
    _use_repo(repo)

    response = await _delete(f"/api/v1/gear/shoes/{SHOE_ID}/assign/run-1")

    assert response.status_code == 204
    assert repo.unassigned == ["run-1"]


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def _post(path: str, payload: dict[str, object]) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, json=payload)


async def _put(path: str, payload: dict[str, object]) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.put(path, json=payload)


async def _delete(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.delete(path)


def _use_repo(repo: "FakeGearRepo") -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_gear_repo] = lambda: repo


def _shoe(
    name: str = "Daily Trainer",
    brand: str | None = "Asics",
    model: str | None = None,
    purchase_date: date | None = None,
    notes: str | None = None,
) -> dict[str, object]:
    return {
        "id": SHOE_ID,
        "athlete_id": ATHLETE.id,
        "name": name,
        "brand": brand,
        "model": model,
        "purchase_date": purchase_date,
        "current_mileage_m": 0.0,
        "retired_at": None,
        "notes": notes,
        "created_at": datetime(2026, 6, 23, tzinfo=UTC),
    }


def _assignment(activity_id: str) -> dict[str, object]:
    return {
        "id": uuid4(),
        "activity_id": activity_id,
        "shoe_id": SHOE_ID,
        "assigned_at": datetime(2026, 6, 23, tzinfo=UTC),
    }


@dataclass
class FakeGearRepo:
    mileage_m: float = 42_000
    activity_sport: str = "Run"
    retired: bool = False
    assigned: list[str] = field(default_factory=list)
    unassigned: list[str] = field(default_factory=list)
    shoe: dict[str, object] = field(default_factory=_shoe)

    async def list_shoes(self, athlete_id: UUID) -> list[dict[str, object]]:
        assert athlete_id == ATHLETE.id
        return [self.shoe]

    async def get_shoe(self, athlete_id: UUID, shoe_id: UUID) -> dict[str, object] | None:
        assert athlete_id == ATHLETE.id
        return self.shoe if shoe_id == SHOE_ID else None

    async def create_shoe(
        self,
        athlete_id: UUID,
        name: str,
        brand: str | None,
        model: str | None,
        purchase_date: date | None,
        notes: str | None,
    ) -> dict[str, object]:
        assert athlete_id == ATHLETE.id
        self.shoe = _shoe(
            name=name, brand=brand, model=model, purchase_date=purchase_date, notes=notes
        )
        return self.shoe

    async def update_shoe(
        self, athlete_id: UUID, shoe_id: UUID, data: dict[str, object]
    ) -> dict[str, object] | None:
        assert athlete_id == ATHLETE.id
        if shoe_id != SHOE_ID:
            return None
        self.shoe.update(data)
        return self.shoe

    async def retire_shoe(self, athlete_id: UUID, shoe_id: UUID) -> bool:
        assert athlete_id == ATHLETE.id
        self.retired = shoe_id == SHOE_ID
        return self.retired

    async def assign_shoe(
        self, athlete_id: UUID, shoe_id: UUID, activity_id: str
    ) -> dict[str, object] | None:
        assert athlete_id == ATHLETE.id
        if shoe_id != SHOE_ID:
            return None
        self.assigned.append(activity_id)
        return _assignment(activity_id)

    async def unassign_shoe(self, athlete_id: UUID, shoe_id: UUID, activity_id: str) -> bool:
        assert athlete_id == ATHLETE.id
        if shoe_id != SHOE_ID:
            return False
        self.unassigned.append(activity_id)
        return True

    async def compute_shoe_mileage(self, shoe_id: UUID) -> float:
        assert shoe_id == SHOE_ID
        return self.mileage_m

    async def get_activity(self, athlete_id: UUID, activity_id: str) -> dict[str, object] | None:
        assert athlete_id == ATHLETE.id
        return {"activity_id": activity_id, "sport": self.activity_sport, "distance_m": 10_000}
