"""GET /api/activities/stats — aggregate metrics grouped by sport."""

from dataclasses import dataclass, field
from datetime import date
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.activity_stats import get_activity_stats_repo
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "stats@example.com", "hash")


@pytest.mark.no_db
async def test_stats_aggregates_multiple_sports() -> None:
    """Without sport filter → aggregates all sports, breaks down by_sport."""
    _use_repo(
        FakeStatsRepo(
            rows=[
                _row("Run", distance=10_000.0, duration=3600, tss=100.0, count=2),
                _row("Ride", distance=50_000.0, duration=5400, tss=150.0, count=3),
            ]
        )
    )

    response = await _get("/api/v1/activities/stats?from=2026-01-01&to=2026-06-30")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_distance_m"] == 60_000.0
    assert payload["total_duration_s"] == 9000
    assert payload["total_tss"] == 250.0
    assert payload["activity_count"] == 5
    assert payload["avg_tss"] == 50.0

    by_sport = {bucket["sport"]: bucket for bucket in payload["by_sport"]}
    assert by_sport["Run"]["avg_tss"] == 50.0
    assert by_sport["Ride"]["avg_tss"] == pytest.approx(50.0)
    assert by_sport["Run"]["activity_count"] == 2
    assert by_sport["Ride"]["activity_count"] == 3


@pytest.mark.no_db
async def test_stats_filters_by_sport() -> None:
    """Sport filter → only matching sport appears in by_sport and totals."""
    _use_repo(
        FakeStatsRepo(
            rows=[
                _row("Run", distance=10_000.0, duration=3600, tss=100.0, count=2),
            ]
        )
    )

    response = await _get("/api/v1/activities/stats?sport=Run")

    assert response.status_code == 200
    payload = response.json()
    assert payload["activity_count"] == 2
    assert payload["total_distance_m"] == 10_000.0
    assert len(payload["by_sport"]) == 1
    assert payload["by_sport"][0]["sport"] == "Run"


@pytest.mark.no_db
async def test_stats_empty_data_returns_zeros() -> None:
    """No matching activities → zero totals, empty by_sport, no division error."""
    _use_repo(FakeStatsRepo(rows=[]))

    response = await _get("/api/v1/activities/stats?from=2026-01-01&to=2026-06-30")

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "total_distance_m": 0.0,
        "total_duration_s": 0,
        "total_tss": 0.0,
        "activity_count": 0,
        "avg_tss": 0.0,
        "by_sport": [],
    }


@pytest.mark.no_db
async def test_stats_optional_date_params() -> None:
    """Stats endpoint works without from/to — open-ended query."""
    _use_repo(
        FakeStatsRepo(
            rows=[
                _row("Run", distance=5000.0, duration=1800, tss=50.0, count=1),
            ]
        )
    )

    response = await _get("/api/v1/activities/stats")

    assert response.status_code == 200
    assert response.json()["activity_count"] == 1


@pytest.mark.no_db
async def test_stats_does_not_collide_with_activity_id_route() -> None:
    """GET /api/activities/stats must not be swallowed by GET /api/activities/{activity_id}.

    Regression guard: route ordering in main.py must include activity_stats.router
    BEFORE activities.router.
    """
    _use_repo(
        FakeStatsRepo(
            rows=[
                _row("Run", distance=1000.0, duration=300, tss=25.0, count=1),
            ]
        )
    )

    response = await _get("/api/v1/activities/stats")

    assert response.status_code == 200
    assert "by_sport" in response.json()


@dataclass
class FakeStatsRepo:
    rows: list[dict[str, object]] = field(default_factory=list)
    last_sport: str | None = None
    last_start: date | None = None
    last_end: date | None = None

    async def aggregate_by_sport(
        self,
        athlete_id: UUID,
        start: date | None,
        end: date | None,
        sport: str | None,
    ) -> list[dict[str, object]]:
        assert athlete_id == ATHLETE.id
        self.last_sport = sport
        self.last_start = start
        self.last_end = end
        return [dict(row) for row in self.rows]


def _row(
    sport: str,
    *,
    distance: float,
    duration: int,
    tss: float,
    count: int,
) -> dict[str, object]:
    return {
        "sport": sport,
        "total_distance_m": distance,
        "total_duration_s": duration,
        "total_tss": tss,
        "activity_count": count,
    }


def _use_repo(repo: FakeStatsRepo) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_activity_stats_repo] = lambda: repo


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)
