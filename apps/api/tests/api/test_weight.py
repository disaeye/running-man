"""Tests for weight tracking endpoints."""

from dataclasses import dataclass, field
from datetime import date
from typing import Any
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.weight import get_weight_repo
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "weight@example.com", "hash")

TODAY = date.today()


def _entry(day: date, weight_kg: float) -> dict[str, Any]:
    return {"date": str(day), "weight_kg": weight_kg, "body_fat_pct": None}


@pytest.mark.no_db
async def test_list_weight() -> None:
    _use_repo(
        FakeWeightRepo(
            entries=[
                _entry(date(2026, 6, 1), 75.0),
                _entry(date(2026, 6, 8), 74.5),
                _entry(date(2026, 6, 15), 74.2),
            ]
        )
    )

    response = await _get("/api/v1/weight?from=2026-06-01&to=2026-06-30")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["entries"]) == 3
    assert payload["entries"][0]["weight_kg"] == 75.0
    assert payload["entries"][2]["weight_kg"] == 74.2
    assert "stats" in payload


@pytest.mark.no_db
async def test_list_weight_empty() -> None:
    _use_repo(FakeWeightRepo(entries=[]))

    response = await _get("/api/v1/weight?from=2026-01-01&to=2026-12-31")
    assert response.status_code == 200
    payload = response.json()
    assert payload["entries"] == []
    assert payload["stats"]["current"] is None


@pytest.mark.no_db
async def test_upsert_weight() -> None:
    repo = FakeWeightRepo(entries=[])
    _use_repo(repo)

    response = await _post("/api/v1/weight", {"date": "2026-06-22", "weight_kg": 75.5})
    assert response.status_code == 201
    payload = response.json()
    assert payload["date"] == "2026-06-22"
    assert payload["weight_kg"] == 75.5

    # Verify it was stored
    assert len(repo.entries) == 1


@pytest.mark.no_db
async def test_upsert_weight_updates_existing() -> None:
    repo = FakeWeightRepo(entries=[_entry(date(2026, 6, 22), 75.0)])
    _use_repo(repo)

    response = await _post("/api/v1/weight", {"date": "2026-06-22", "weight_kg": 74.0})
    assert response.status_code == 201
    assert response.json()["weight_kg"] == 74.0

    # Should still be only one entry
    assert len(repo.entries) == 1


@pytest.mark.no_db
async def test_delete_weight() -> None:
    repo = FakeWeightRepo(entries=[_entry(date(2026, 6, 22), 75.0)])
    _use_repo(repo)

    response = await _delete("/api/v1/weight/2026-06-22")
    assert response.status_code == 200
    assert response.json() == {"status": "deleted"}


@pytest.mark.no_db
async def test_delete_weight_not_found() -> None:
    _use_repo(FakeWeightRepo(entries=[]))

    response = await _delete("/api/v1/weight/2026-06-22")
    assert response.status_code == 404
    assert "not found" in response.text


@pytest.mark.no_db
async def test_weight_requires_auth() -> None:
    app.dependency_overrides.clear()

    response = await _get("/api/v1/weight?from=2026-01-01&to=2026-12-31")
    assert response.status_code == 401


@pytest.mark.no_db
async def test_weight_trend_stats() -> None:
    _use_repo(
        FakeWeightRepo(
            entries=[
                _entry(date(2026, 5, 15), 76.0),
                _entry(date(2026, 5, 22), 75.5),
                _entry(date(2026, 5, 29), 75.0),
            ]
        )
    )

    response = await _get("/api/v1/weight?from=2026-05-01&to=2026-06-01")
    assert response.status_code == 200
    stats = response.json()["stats"]
    assert stats["current"] == 75.0
    assert stats["avg_30d"] is not None
    assert stats["trend_30d"] is not None
    assert stats["min_30d"] == 75.0
    assert stats["max_30d"] == 76.0


# ---- helpers ----


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def _post(path: str, payload: dict[str, object]) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, json=payload)


async def _delete(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.delete(path)


def _use_repo(repo: "FakeWeightRepo") -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_weight_repo] = lambda: repo


@dataclass
class FakeWeightRepo:
    entries: list[dict[str, Any]] = field(default_factory=list)

    async def list_entries(
        self,
        athlete_id: UUID,
        start: date,
        end: date,
    ) -> list[dict[str, Any]]:
        _ = athlete_id
        result = []
        for e in self.entries:
            d = date.fromisoformat(e["date"])
            if start <= d <= end:
                result.append(e)
        return result

    async def upsert_entry(
        self,
        athlete_id: UUID,
        day: date,
        weight_kg: float,
    ) -> dict[str, Any]:
        _ = athlete_id
        # upsert: replace existing entry for same date, else append
        for i, e in enumerate(self.entries):
            if e["date"] == str(day):
                self.entries[i] = _entry(day, weight_kg)
                return self.entries[i]
        entry = _entry(day, weight_kg)
        self.entries.append(entry)
        return entry

    async def delete_entry(self, athlete_id: UUID, day: date) -> bool:
        _ = athlete_id
        for i, e in enumerate(self.entries):
            if e["date"] == str(day) and e["weight_kg"] is not None:
                self.entries[i] = _entry(day, 0.0)  # mark deleted
                return True
        return False

    async def get_trend_stats(self, athlete_id: UUID) -> dict[str, Any]:
        _ = athlete_id
        weights = [e["weight_kg"] for e in self.entries if e["weight_kg"] is not None]
        if not weights:
            return {
                "current": None,
                "avg_30d": None,
                "trend_30d": None,
                "min_30d": None,
                "max_30d": None,
            }
        return {
            "current": weights[-1],
            "avg_30d": round(sum(weights) / len(weights), 1),
            "trend_30d": round(weights[-1] - weights[0], 1) if len(weights) >= 2 else 0.0,
            "min_30d": min(weights),
            "max_30d": max(weights),
        }
