from dataclasses import dataclass
from datetime import date, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from domain.load.pmc import build_pmc_series
from infrastructure.auth.models import Athlete
from main import app
from presentation.api.pmc import get_pmc_repo
from presentation.auth.deps import get_current_athlete

ATHLETE = Athlete(uuid4(), "pmc-sport@example.com", "hash")


@pytest.mark.no_db
async def test_pmc_without_sport_reads_stored_all_sports_facts() -> None:
    repo = FakePmcRepo(
        stored_range=[
            {
                "day": date(2026, 1, 1),
                "ctl": 50.0,
                "atl": 30.0,
                "tsb": 20.0,
                "tss": 100.0,
                "acwr": None,
            },
        ]
    )
    _use_repo(repo)

    response = await _get("/api/v1/pmc?from=2026-01-01&to=2026-01-31")

    assert response.status_code == 200
    assert response.json() == [
        {
            "day": "2026-01-01",
            "ctl": 50.0,
            "atl": 30.0,
            "tsb": 20.0,
            "tss": 100.0,
            "acwr": None,
            "ctl_warming_up": True,
            "mode": "authoritative_all_sports",
            "algorithm_version": "1.0.0",
        },
    ]
    assert repo.stored_calls == 1
    assert repo.filtered_calls == 0


@pytest.mark.no_db
async def test_pmc_clears_the_warmup_flag_when_history_is_long_enough() -> None:
    """CTL converges over ~two 42-day constants; past that it is quotable.

    A single day of history is inherently "warming up", so the flag must be
    derived from how many days the series actually spans rather than hard-coded
    on or off.
    """
    days = [date(2026, 1, 1) + timedelta(days=offset) for offset in range(200)]
    repo = FakePmcRepo(
        stored_range=[
            {"day": day, "ctl": 50.0, "atl": 30.0, "tsb": 20.0, "tss": 0.0, "acwr": None}
            for day in days
        ]
    )
    _use_repo(repo)

    response = await _get("/api/v1/pmc?from=2026-01-01&to=2026-07-20")

    body = response.json()
    assert body[0]["ctl_warming_up"] is True
    assert body[-1]["ctl_warming_up"] is False


@pytest.mark.no_db
async def test_pmc_with_sport_filter_computes_on_the_fly() -> None:
    """Sport param → calls get_filtered_daily_tss, returns computed PMC series."""
    daily_tss = {date(2026, 1, 1): 100.0, date(2026, 1, 2): 100.0}
    repo = FakePmcRepo(filtered_tss=daily_tss)
    _use_repo(repo)

    response = await _get("/api/v1/pmc?from=2026-01-01&to=2026-01-31&sport=Run")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 2

    expected = build_pmc_series(daily_tss)
    for actual_point, expected_point in zip(payload, expected, strict=True):
        assert actual_point["day"] == expected_point["day"].isoformat()
        assert actual_point["tss"] == pytest.approx(expected_point["tss"])
        assert actual_point["ctl"] == pytest.approx(expected_point["ctl"])
        assert actual_point["atl"] == pytest.approx(expected_point["atl"])
        assert actual_point["tsb"] == pytest.approx(expected_point["tsb"])
        assert actual_point["acwr"] == pytest.approx(expected_point["acwr"])

    assert repo.filtered_calls == 1
    assert repo.stored_calls == 0
    assert repo.last_sport == "Run"


@pytest.mark.no_db
async def test_pmc_sport_filter_with_no_activities_returns_empty() -> None:
    """Sport filter matching no activities → empty list, not error."""
    _use_repo(FakePmcRepo(filtered_tss={}))

    response = await _get("/api/v1/pmc?from=2026-01-01&to=2026-01-31&sport=Swim")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.no_db
async def test_pmc_sport_filter_isolates_by_sport() -> None:
    """Sport filter only sees the requested sport's TSS, not all activities."""
    repo = FakePmcRepo(
        filtered_tss={
            date(2026, 6, 1): 50.0,
            date(2026, 6, 2): 0.0,
            date(2026, 6, 3): 50.0,
        }
    )
    _use_repo(repo)

    response = await _get("/api/v1/pmc?from=2026-06-01&to=2026-06-03&sport=Ride")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 3
    assert payload[0]["tss"] == 50.0
    assert payload[1]["tss"] == 0.0
    assert payload[2]["tss"] == 50.0
    assert payload[1]["ctl"] < payload[0]["ctl"]


@dataclass
class FakePmcRepo:
    stored_range: list[dict[str, object]] | None = None
    filtered_tss: dict[date, float] | None = None

    def __post_init__(self) -> None:
        self.stored_calls = 0
        self.filtered_calls = 0
        self.last_sport: str | None = None
        self.last_range: tuple[date, date] | None = None

    async def get_daily_load_range(
        self, athlete_id: UUID, start: date, end: date
    ) -> list[dict[str, object]]:
        self.stored_calls += 1
        assert athlete_id == ATHLETE.id
        # Echo the requested range rather than asserting a fixed one: the
        # warm-up test asks for a longer window.
        self.last_range = (start, end)
        return self.stored_range or []

    async def get_filtered_daily_tss(
        self, athlete_id: UUID, start: date, end: date, sport: str
    ) -> dict[date, float]:
        self.filtered_calls += 1
        self.last_sport = sport
        assert athlete_id == ATHLETE.id
        return dict(self.filtered_tss or {})


def _use_repo(repo: FakePmcRepo) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_pmc_repo] = lambda: repo


async def _get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)
