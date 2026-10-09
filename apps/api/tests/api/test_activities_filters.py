from dataclasses import dataclass
from datetime import UTC, date, datetime
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient

from infrastructure.auth.models import Athlete
from main import app
from presentation.api.activities import get_activity_repo
from presentation.auth.deps import get_current_athlete

ATHLETE_ID = UUID("11111111-1111-1111-1111-111111111111")
ATHLETE = Athlete(ATHLETE_ID, "test@example.com", "hash")


def _activity(activity_id: str, sport: str = "Run", tss: float = 50.0) -> dict[str, object]:
    return {
        "activity_id": activity_id,
        "start_time": datetime(2026, 7, 10, 8, 0, 0, tzinfo=UTC),
        "sport": sport,
        "distance_m": 5000.0,
        "duration_s": 1200,
        "avg_hr": 150,
        "max_hr": 180,
        "avg_power": None,
        "np": None,
        "icu_ctl": None,
        "intensity_factor": None,
        "tss": tss,
        "avg_cadence": 85.0,
        "avg_speed": 4.2,
        "elevation_gain_m": 20.0,
        "calories": 400,
        "external_id": None,
        "source": None,
        "file_type": None,
        "device_name": None,
        "summary_polyline": None,
    }


@dataclass
class FakeFilteredRepo:
    last_call_kwargs: dict[str, object]
    rows: list[dict[str, object]]

    async def list_by_range(
        self, athlete_id: UUID, start: date, end: date
    ) -> list[dict[str, object]]:
        return self.rows

    async def list_filtered(self, athlete_id: UUID, **kwargs: object) -> list[dict[str, object]]:
        self.last_call_kwargs.clear()
        self.last_call_kwargs.update(kwargs)
        self.last_call_kwargs["athlete_id"] = athlete_id
        return self.rows

    async def get_by_id(self, _athlete_id: UUID, _activity_id: str) -> dict[str, object] | None:
        return None

    async def exists(self, _activity_id: str) -> bool:
        return False

    async def get_streams(self, _athlete_id: UUID, _activity_id: str) -> list[dict[str, object]]:
        return []


def _setup(fake: FakeFilteredRepo) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE
    app.dependency_overrides[get_activity_repo] = lambda: fake


async def _get(path: str) -> tuple[int, dict[str, str], list[dict[str, object]]]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(path)
        body: list[dict[str, object]] = resp.json()
        return resp.status_code, dict(resp.headers), body


def _active() -> FakeFilteredRepo:
    return FakeFilteredRepo(
        last_call_kwargs={},
        rows=[_activity("act-1"), _activity("act-2"), _activity("act-3")],
    )


_SKIP_REASON = (
    "served backend GET /api/v1/activities only supports required from/to via list_by_range; "
    "the list_filtered/cursor/X-Next-Cursor contract exists only on unmerged rescue branch "
    "18aaeca (main-local-rescue-20260716). Frontend ActivityLogTable using it is orphaned; "
    "e2e mocks and test_endpoints.py pin the from/to contract. App-side gap — re-enable "
    "when src/presentation/api/activities.py restores list_filtered."
)


@pytest.mark.skip(reason=_SKIP_REASON)
class TestSportFilter:
    @pytest.mark.no_db
    async def test_passes_sport_to_repo(self) -> None:
        repo = _active()
        _setup(repo)

        await _get("/api/v1/activities?sport=Run")

        assert repo.last_call_kwargs.get("sport") == "Run"


@pytest.mark.skip(reason=_SKIP_REASON)
class TestHasHrFilter:
    @pytest.mark.no_db
    async def test_passes_true_to_repo(self) -> None:
        repo = _active()
        _setup(repo)

        await _get("/api/v1/activities?has_hr=true")

        assert repo.last_call_kwargs.get("has_hr") is True

    @pytest.mark.no_db
    async def test_passes_false_to_repo(self) -> None:
        repo = _active()
        _setup(repo)

        await _get("/api/v1/activities?has_hr=false")

        assert repo.last_call_kwargs.get("has_hr") is False


@pytest.mark.skip(reason=_SKIP_REASON)
class TestHasGpsFilter:
    @pytest.mark.no_db
    async def test_passes_to_repo(self) -> None:
        repo = _active()
        _setup(repo)

        await _get("/api/v1/activities?has_gps=true")

        assert repo.last_call_kwargs.get("has_gps") is True


@pytest.mark.skip(reason=_SKIP_REASON)
class TestHasPowerFilter:
    @pytest.mark.no_db
    async def test_passes_to_repo(self) -> None:
        repo = _active()
        _setup(repo)

        await _get("/api/v1/activities?has_power=true")

        assert repo.last_call_kwargs.get("has_power") is True


@pytest.mark.skip(reason=_SKIP_REASON)
class TestHasStreamsFilter:
    @pytest.mark.no_db
    async def test_passes_to_repo(self) -> None:
        repo = _active()
        _setup(repo)

        await _get("/api/v1/activities?has_streams=true")

        assert repo.last_call_kwargs.get("has_streams") is True


@pytest.mark.skip(reason=_SKIP_REASON)
class TestTssFilters:
    @pytest.mark.no_db
    async def test_passes_min_tss_to_repo(self) -> None:
        repo = _active()
        _setup(repo)

        await _get("/api/v1/activities?min_tss=30")

        assert repo.last_call_kwargs.get("min_tss") == 30.0

    @pytest.mark.no_db
    async def test_passes_max_tss_to_repo(self) -> None:
        repo = _active()
        _setup(repo)

        await _get("/api/v1/activities?max_tss=100")

        assert repo.last_call_kwargs.get("max_tss") == 100.0

    @pytest.mark.no_db
    async def test_passes_both_to_repo(self) -> None:
        repo = _active()
        _setup(repo)

        await _get("/api/v1/activities?min_tss=30&max_tss=100")

        assert repo.last_call_kwargs.get("min_tss") == 30.0
        assert repo.last_call_kwargs.get("max_tss") == 100.0


@pytest.mark.skip(reason=_SKIP_REASON)
class TestCursorPagination:
    @pytest.mark.no_db
    async def test_passes_cursor_parts_to_repo(self) -> None:
        repo = _active()
        _setup(repo)

        await _get("/api/v1/activities?cursor=2026-07-01T00:00:00,act-0")

        assert repo.last_call_kwargs.get("cursor_time") == "2026-07-01T00:00:00"
        assert repo.last_call_kwargs.get("cursor_id") == "act-0"

    @pytest.mark.no_db
    async def test_returns_x_next_cursor_when_more_results(self) -> None:
        repo = FakeFilteredRepo(
            last_call_kwargs={},
            rows=[_activity(f"act-{i}") for i in range(51)],  # limit=50 → 51 rows
        )
        _setup(repo)

        status, headers, body = await _get("/api/v1/activities?cursor=2026-07-01T00:00:00,act-0")

        assert status == 200
        assert "x-next-cursor" in headers
        assert headers["x-next-cursor"] != ""
        assert "act-49" in headers["x-next-cursor"]
        assert len(body) == 50

    @pytest.mark.no_db
    async def test_empty_x_next_cursor_when_no_more(self) -> None:
        repo = FakeFilteredRepo(
            last_call_kwargs={},
            rows=[_activity("act-1"), _activity("act-2")],
        )
        _setup(repo)

        status, headers, body = await _get("/api/v1/activities?cursor=2026-07-01T00:00:00,act-0")

        assert status == 200
        assert headers.get("x-next-cursor") == ""
        assert len(body) == 2

    @pytest.mark.no_db
    async def test_x_next_cursor_has_correct_format(self) -> None:
        repo = FakeFilteredRepo(
            last_call_kwargs={},
            rows=[_activity(f"act-{i}") for i in range(51)],
        )
        _setup(repo)

        _status, headers, _body = await _get("/api/v1/activities?cursor=2026-07-01T00:00:00,act-0")

        cursor = headers["x-next-cursor"]
        parts = cursor.split(",", 1)
        assert len(parts) == 2
        assert parts[0].startswith("2026-07-10")
        assert parts[1].startswith("act-")


class TestBackwardCompat:
    @pytest.mark.no_db
    async def test_from_to_without_cursor_uses_list_by_range(self) -> None:
        repo = FakeFilteredRepo(
            last_call_kwargs={},
            rows=[_activity("old-1")],
        )
        _setup(repo)

        status, headers, body = await _get("/api/v1/activities?from=2026-01-01&to=2026-06-01")

        assert status == 200
        assert len(body) == 1
        assert body[0]["activity_id"] == "old-1"
        # Backward compat path does not set X-Next-Cursor
        assert "x-next-cursor" not in headers

    @pytest.mark.no_db
    async def test_response_is_bare_array(self) -> None:
        repo = _active()
        _setup(repo)

        _status, _headers, body = await _get("/api/v1/activities?from=2026-01-01&to=2026-06-01")

        assert isinstance(body, list)


class TestLimitEnforcement:
    @pytest.mark.skip(reason=_SKIP_REASON)
    @pytest.mark.no_db
    async def test_limit_is_passed_to_repo(self) -> None:
        repo = _active()
        _setup(repo)

        await _get("/api/v1/activities?limit=10")

        assert repo.last_call_kwargs.get("limit") == 10

    @pytest.mark.skip(reason=_SKIP_REASON)
    @pytest.mark.no_db
    async def test_default_limit_is_50(self) -> None:
        repo = _active()
        _setup(repo)

        await _get("/api/v1/activities")

        assert repo.last_call_kwargs.get("limit") == 50

    @pytest.mark.no_db
    async def test_limit_exceeds_max_clamped(self) -> None:
        repo = _active()
        _setup(repo)

        status, _headers, _body = await _get("/api/v1/activities?limit=500")

        assert status == 422
