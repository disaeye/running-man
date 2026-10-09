"""HTTP-level tests for ``/api/plan/*`` endpoints.

Covers:
  - POST /plan/generate            → 200 happy path (generate_plan mocked)
  - POST /plan/generate            → 401 when not authenticated
  - POST /plan/generate            → 422 when goal_id missing
  - POST /plan/generate            → 404 when generate_plan raises ValueError
  - GET  /plan/periodization       → 200 happy path (lists training phases)
  - GET  /plan/periodization       → 404 when goal does not exist
  - GET  /plan/periodization       → 401 when not authenticated
"""

from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.plan import get_goals_repo
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "plan@example.com", "hash")


# ---------------------------------------------------------------------------
# POST /plan/generate
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_generate_plan_success() -> None:
    """POST /plan/generate with a valid goal → 200 with phase/event counts."""
    _use_repo(_FakeRepo())
    goal_id = uuid4()

    with (
        patch("presentation.api.plan.get_pool") as mock_pool,
        patch("presentation.api.plan.generate_plan", new_callable=AsyncMock) as mock_gen,
    ):
        mock_pool.return_value.connection.return_value.__aenter__ = AsyncMock(return_value=None)
        mock_pool.return_value.connection.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_gen.return_value = {"phases_created": 4, "events_created": 84}

        response = await _post_json("/api/v1/plan/generate", {"goal_id": str(goal_id)})

    assert response.status_code == 200
    body = response.json()
    assert body["phases_created"] == 4
    assert body["events_created"] == 84
    mock_gen.assert_awaited_once()
    assert mock_gen.call_args.args[0] == ATHLETE.id
    assert mock_gen.call_args.args[1] == goal_id


@pytest.mark.no_db
async def test_generate_plan_preview_passes_dry_run_and_returns_dates() -> None:
    """POST /plan/generate?dry_run=true previews without selecting the write path."""
    _use_repo(_FakeRepo())
    goal_id = uuid4()

    with (
        patch("presentation.api.plan.get_pool") as mock_pool,
        patch("presentation.api.plan.generate_plan", new_callable=AsyncMock) as mock_gen,
    ):
        mock_pool.return_value.connection.return_value.__aenter__ = AsyncMock(return_value=None)
        mock_pool.return_value.connection.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_gen.return_value = {
            "phases_created": 4,
            "events_created": 84,
            "affected_dates": [date(2026, 8, 1), date(2026, 8, 2)],
        }

        response = await _post_json(
            "/api/v1/plan/generate?dry_run=true",
            {"goal_id": str(goal_id)},
        )

    assert response.status_code == 200
    assert response.json()["affected_dates"] == ["2026-08-01", "2026-08-02"]
    assert mock_gen.call_args.kwargs == {
        "dry_run": True,
        "rest_days": None,
        "preferred_days_off": None,
        "weekly_tss": None,
    }


@pytest.mark.no_db
async def test_generate_plan_goal_not_found() -> None:
    """POST /plan/generate when generate_plan raises ValueError → 404."""
    _use_repo(_FakeRepo())

    with (
        patch("presentation.api.plan.get_pool") as mock_pool,
        patch("presentation.api.plan.generate_plan", new_callable=AsyncMock) as mock_gen,
    ):
        mock_pool.return_value.connection.return_value.__aenter__ = AsyncMock(return_value=None)
        mock_pool.return_value.connection.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_gen.side_effect = ValueError("找不到训练目标")

        response = await _post_json("/api/v1/plan/generate", {"goal_id": str(uuid4())})

    assert response.status_code == 404
    assert response.json()["detail"] == "目标不存在"


@pytest.mark.no_db
async def test_generate_plan_validation_error() -> None:
    """POST /plan/generate with a missing goal_id → 422."""
    _use_repo(_FakeRepo())

    response = await _post_json("/api/v1/plan/generate", {})

    assert response.status_code == 422


@pytest.mark.no_db
async def test_generate_plan_accepts_zero_rest_days() -> None:
    _use_repo(_FakeRepo())
    goal_id = uuid4()

    with (
        patch("presentation.api.plan.get_pool") as mock_pool,
        patch("presentation.api.plan.generate_plan", new_callable=AsyncMock) as mock_gen,
    ):
        mock_pool.return_value.connection.return_value.__aenter__ = AsyncMock(return_value=None)
        mock_pool.return_value.connection.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_gen.return_value = {"phases_created": 1, "events_created": 1}

        response = await _post_json(
            "/api/v1/plan/generate",
            {"goal_id": str(goal_id), "rest_days": 0, "preferred_days_off": []},
        )

    assert response.status_code == 200
    assert mock_gen.call_args.kwargs["rest_days"] == 0
    assert mock_gen.call_args.kwargs["preferred_days_off"] == []


@pytest.mark.no_db
async def test_generate_plan_rejects_invalid_schedule_inputs() -> None:
    _use_repo(_FakeRepo())

    response = await _post_json(
        "/api/v1/plan/generate",
        {"goal_id": str(uuid4()), "rest_days": 0, "preferred_days_off": [7]},
    )

    assert response.status_code == 422


@pytest.mark.no_db
async def test_generate_plan_requires_auth() -> None:
    """POST /plan/generate without access_token cookie → 401."""
    app.dependency_overrides.clear()

    response = await _post_json("/api/v1/plan/generate", {"goal_id": str(uuid4())})

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /plan/periodization
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_get_periodization() -> None:
    """GET /plan/periodization?goal_id=... returns 200 with the phases list."""
    goal_id = uuid4()
    phases = [
        _phase(goal_id, "Base", date(2026, 6, 1), date(2026, 6, 28), 300.0),
        _phase(goal_id, "Build", date(2026, 6, 29), date(2026, 7, 19), 350.0),
        _phase(goal_id, "Peak", date(2026, 7, 20), date(2026, 8, 2), 380.0),
    ]
    _use_repo(_FakeRepo(get_result=_goal(goal_id), phases=phases))

    response = await _get(f"/api/v1/plan/periodization?goal_id={goal_id}")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 3
    assert body[0]["name"] == "Base"
    assert body[2]["name"] == "Peak"
    assert body[0]["target_weekly_tss"] == 300.0


@pytest.mark.no_db
async def test_get_periodization_goal_not_found() -> None:
    """GET /plan/periodization when goal does not exist → 404."""
    _use_repo(_FakeRepo(get_result=None))

    response = await _get(f"/api/v1/plan/periodization?goal_id={uuid4()}")

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.no_db
async def test_get_periodization_requires_auth() -> None:
    """GET /plan/periodization without access_token cookie → 401."""
    app.dependency_overrides.clear()

    response = await _get(f"/api/v1/plan/periodization?goal_id={uuid4()}")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


class _FakeRepo:
    def __init__(
        self,
        get_result: dict[str, object] | None = None,
        phases: list[dict[str, object]] | None = None,
    ) -> None:
        self.get_result = get_result
        self.phases = phases if phases is not None else []

    async def get(self, _athlete_id: UUID, _goal_id: UUID) -> dict[str, object] | None:
        return self.get_result

    async def list_training_phases(
        self, _athlete_id: UUID, _goal_id: UUID
    ) -> list[dict[str, object]]:
        return self.phases


def _goal(goal_id: UUID) -> dict[str, object]:
    return {
        "goal_id": str(goal_id),
        "athlete_id": str(ATHLETE.id),
        "type": "event",
        "title": "Marathon",
        "target_value": None,
        "current_value": 0.0,
        "unit": None,
        "target_date": date(2026, 8, 2),
        "status": "active",
        "created_at": date(2026, 6, 1),
        "updated_at": date(2026, 6, 1),
    }


def _phase(
    goal_id: UUID,
    name: str,
    start: date,
    end: date,
    tss: float | None,
) -> dict[str, object]:
    return {
        "phase_id": uuid4(),
        "goal_id": goal_id,
        "name": name,
        "start_date": start,
        "end_date": end,
        "target_weekly_tss": tss,
    }


def _use_repo(repo: _FakeRepo) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_goals_repo] = lambda: repo


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def _post_json(path: str, payload: dict[str, object]) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, json=payload)
