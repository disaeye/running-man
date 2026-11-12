from datetime import date
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.wellness import get_wellness_repo
from presentation.auth.deps import get_current_athlete


@pytest.mark.no_db
async def test_wellness_rating_saves_soreness() -> None:
    athlete = Athlete(uuid4(), "rating@example.com", "hash")
    calls: list[tuple[object, date, int | None]] = []

    class Repo:
        async def update_soreness(self, athlete_id: object, day: date, soreness: int | None) -> dict[str, object]:
            calls.append((athlete_id, day, soreness))
            return {
                "day": day,
                "soreness": soreness,
                "resting_hr": None,
                "weight": None,
                "sleep_secs": None,
                "sleep_score": None,
                "fatigue": None,
                "hrv": None,
                "vo2max": None,
                "steps": None,
                "stress": None,
                "mood": None,
                "motivation": None,
                "source_readiness": None,
                "comments": None,
            }

    app.dependency_overrides[get_current_athlete] = lambda: athlete
    app.dependency_overrides[get_wellness_repo] = lambda: Repo()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.put(
                "/api/v1/wellness/ratings",
                json={"day": "2026-10-29", "soreness": 3},
            )
        assert response.status_code == 200
        assert response.json()["soreness"] == 3
        assert calls == [(athlete.id, date(2026, 10, 29), 3)]

        bad_high = await AsyncClient(transport=ASGITransport(app=app), base_url="http://test").put(
            "/api/v1/wellness/ratings",
            json={"day": "2026-10-29", "soreness": 5},
        )
        assert bad_high.status_code == 422
        bad_low = await AsyncClient(transport=ASGITransport(app=app), base_url="http://test").put(
            "/api/v1/wellness/ratings",
            json={"day": "2026-10-29", "soreness": 0},
        )
        assert bad_low.status_code == 422
    finally:
        app.dependency_overrides.clear()
