"""Unit tests for ``compute_data_health`` (application/data_health.py).

Exercises the pure-python aggregation layer with fake DB cursors so we can
cover edge cases (no-data athlete, partial data, known gap patterns) without
a real PostgreSQL connection. The SQL-side gap-detection correctness is covered
separately by integration tests in tests/infrastructure/.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest

from application.data_health import compute_data_health

FROZEN_NOW = datetime(2026, 6, 29, 12, 0, 0, tzinfo=UTC)
ATHLETE_ID = uuid4()


@pytest.mark.no_db
async def test_compute_data_health_all_populated() -> None:
    """All three health queries return rows — every field is present."""
    result = await compute_data_health(
        ATHLETE_ID, _FakePool(_ALL_POPULATED, _GAPS_SOME)
    )

    assert result["activities"]["data_as_of"] == FROZEN_NOW
    assert result["activities"]["total"] == 12
    assert result["activities"]["with_hr"] == 10
    assert result["activities"]["with_power"] == 8
    assert result["wellness"]["data_as_of"] == date(2026, 6, 28)
    assert result["wellness"]["total_days"] == 30
    assert result["wellness"]["latest_day"] == date(2026, 6, 28)
    assert result["training_load"]["data_as_of"] == date(2026, 6, 29)
    assert result["completeness"]["activities"]["with_hr"] == 10
    assert result["completeness"]["activities"]["with_gps"] == 5
    assert result["completeness"]["activities"]["with_power"] == 8
    assert len(result["gaps"]) == 2


@pytest.mark.no_db
async def test_compute_data_health_no_data() -> None:
    """No rows at all — must NOT error and must return safe defaults."""
    result = await compute_data_health(
        ATHLETE_ID, _FakePool(_NO_DATA, _NO_GAPS)
    )

    assert result["activities"]["data_as_of"] is None
    assert result["activities"]["total"] == 0
    assert result["activities"]["with_hr"] == 0
    assert result["activities"]["with_gps"] == 0
    assert result["wellness"]["data_as_of"] is None
    assert result["wellness"]["total_days"] == 0
    assert result["wellness"]["latest_day"] is None
    assert result["training_load"]["data_as_of"] is None
    assert result["completeness"]["activities"]["with_hr"] == 0
    assert result["completeness"]["activities"]["with_gps"] == 0
    assert result["completeness"]["activities"]["with_power"] == 0
    assert result["gaps"] == []


@pytest.mark.no_db
async def test_compute_data_health_new_coverage_blocks() -> None:
    """strength / uploads 覆盖块从新增查询映射到响应。"""
    result = await compute_data_health(
        ATHLETE_ID, _FakePool(_ALL_POPULATED, _NO_GAPS)
    )

    wellness = result["coverage"]["wellness"]
    assert wellness["hrv_days_28d"] == 16
    assert result["coverage"]["strength"] == {"sessions_14d": 3, "sessions_total": 24}
    assert result["coverage"]["uploads"] == {"runs_30d": 2, "failed_30d": 0}


@pytest.mark.no_db
async def test_compute_data_health_partial_no_wellness() -> None:
    """Activities data present, wellness is None — wellness returns safe defaults."""
    result = await compute_data_health(
        ATHLETE_ID, _FakePool(_ACTIVITIES_ONLY, _NO_GAPS)
    )

    assert result["activities"]["total"] == 5
    assert result["activities"]["with_hr"] == 3
    assert result["wellness"]["data_as_of"] is None
    assert result["wellness"]["total_days"] == 0
    assert result["wellness"]["latest_day"] is None
    assert result["training_load"]["data_as_of"] is None
    assert result["gaps"] == []


@pytest.mark.no_db
async def test_compute_data_health_gaps_detected() -> None:
    """Gap rows from DB are mapped to dicts with from/to keys."""
    result = await compute_data_health(
        ATHLETE_ID, _FakePool(_ALL_POPULATED, _GAPS_MULTIPLE)
    )

    assert len(result["gaps"]) == 3
    assert result["gaps"][0] == {"from": date(2026, 6, 1), "to": date(2026, 6, 3)}
    assert result["gaps"][1] == {"from": date(2026, 6, 10), "to": date(2026, 6, 12)}
    assert result["gaps"][2] == {"from": date(2026, 6, 20), "to": date(2026, 6, 25)}


@pytest.mark.no_db
async def test_compute_data_health_activity_fields_none() -> None:
    """Activity row has NULL numerical fields — they coerce to 0."""
    result = await compute_data_health(
        ATHLETE_ID, _FakePool(_ACTIVITY_NULLS, _NO_GAPS)
    )

    assert result["activities"]["total"] == 0
    assert result["activities"]["with_hr"] == 0
    assert result["activities"]["with_power"] == 0
    assert result["activities"]["data_as_of"] is not None
    assert result["completeness"]["activities"]["with_hr"] == 0
    assert result["completeness"]["activities"]["with_power"] == 0


# ---------------------------------------------------------------------------
# Fake pool / connection / cursor
# ---------------------------------------------------------------------------


class _FakePool:
    """Simulates an async connection pool.

    Yields a fake async connection whose cursor serves pre-programmed rows.
    """

    def __init__(
        self,
        health_rows: list[dict[str, object] | None],
        gap_rows: list[dict[str, object]],
    ) -> None:
        self._health_rows = health_rows
        self._gap_rows = gap_rows

    def connection(self) -> "_FakeConn":
        return _FakeConn(self._health_rows, self._gap_rows)


class _FakeConn:
    """Fake async connection returned by pool.connection()."""

    def __init__(
        self,
        health_rows: list[dict[str, object] | None],
        gap_rows: list[dict[str, object]],
    ) -> None:
        self._health_rows = health_rows
        self._gap_rows = gap_rows

    def cursor(self) -> "_FakeCursor":
        return _FakeCursor(self._health_rows, self._gap_rows)

    async def __aenter__(self) -> "_FakeConn":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None


class _FakeCursor:
    """Fake async cursor that returns pre-programmed rows for health queries."""

    def __init__(
        self,
        health_rows: list[dict[str, object] | None],
        gap_rows: list[dict[str, object]],
    ) -> None:
        self._health_rows = health_rows
        self._gap_rows = gap_rows
        self._call_count = 0

    async def __aenter__(self) -> "_FakeCursor":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def execute(self, _query: str, _params: object = None) -> None:
        return None

    async def fetchone(self) -> dict[str, object] | None:
        idx = self._call_count
        self._call_count += 1
        if idx < len(self._health_rows):
            return self._health_rows[idx]
        return None

    async def fetchall(self) -> list[dict[str, object]]:
        return self._gap_rows


# ---------------------------------------------------------------------------
# Pre-programmed row sets
# ---------------------------------------------------------------------------

_ALL_POPULATED: list[dict[str, object] | None] = [
    {
        "data_as_of": FROZEN_NOW,
        "total": 12,
        "with_hr": 10,
        "with_power": 8,
        "with_gps": 5,
    },
    {
        "data_as_of": date(2026, 6, 28),
        "total_days": 30,
        "latest_day": date(2026, 6, 28),
    },
    {"sleep_days_28d": 20, "rhr_days_28d": 18, "hrv_days_28d": 16},
    {"sessions_14d": 3, "sessions_total": 24},
    {"runs_30d": 2, "failed_30d": 0},
    {"data_as_of": date(2026, 6, 29)},
    {"timezone": "UTC"},
]

_NO_DATA: list[dict[str, object] | None] = [None] * 7

_ACTIVITIES_ONLY: list[dict[str, object] | None] = [
    {
        "data_as_of": FROZEN_NOW - timedelta(days=1),
        "total": 5,
        "with_hr": 3,
        "with_power": 2,
        "with_gps": 1,
    },
    None,
    None,
    None,
    None,
    None,
    None,
]

_ACTIVITY_NULLS: list[dict[str, object] | None] = [
    {
        "data_as_of": FROZEN_NOW,
        "total": None,
        "with_hr": None,
        "with_power": None,
        "with_gps": None,
    },
    None,
    None,
    None,
    None,
    None,
    None,
]
_GAPS_SOME: list[dict[str, object]] = [
    {"from": date(2026, 6, 5), "to": date(2026, 6, 7)},
    {"from": date(2026, 6, 15), "to": date(2026, 6, 16)},
]

_NO_GAPS: list[dict[str, object]] = []

_GAPS_MULTIPLE: list[dict[str, object]] = [
    {"from": date(2026, 6, 1), "to": date(2026, 6, 3)},
    {"from": date(2026, 6, 10), "to": date(2026, 6, 12)},
    {"from": date(2026, 6, 20), "to": date(2026, 6, 25)},
]
