from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import pytest

from application.data_quality import (
    _activity_missing_hr_90d,
    _load_stale,
    _physiology_stale,
    _ride_missing_power_90d,
    _run_missing_gps_90d,
    _sync_freshness,
    _wellness_missing_recent,
    compute_data_quality,
)

pytestmark = pytest.mark.asyncio

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000001")
NOW = datetime(2026, 7, 13, 12, 0, 0, tzinfo=UTC)


class FakeCursor:
    def __init__(self, rows: dict[str, dict[str, object] | None] | None = None) -> None:
        self._rows = rows or {}
        self._current: dict[str, object] | None = None

    async def __aenter__(self) -> "FakeCursor":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def execute(self, query: str, _params: tuple[object, ...] = ()) -> None:
        key = _query_key(query, self._rows)
        self._current = self._rows.get(key) if key else None

    async def fetchone(self) -> dict[str, object] | None:
        return self._current

class QueuedCursor:
    def __init__(self, results: list[dict[str, object] | None]) -> None:
        self._results = results

    async def __aenter__(self) -> "QueuedCursor":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def execute(self, _query: str, _params: tuple[object, ...] = ()) -> None:
        return None

    async def fetchone(self) -> dict[str, object] | None:
        return self._results.pop(0) if self._results else None

    async def fetchall(self) -> list[dict[str, object]]:
        return []

class QueuedConnection:
    def __init__(self, results: list[dict[str, object] | None]) -> None:
        self._results = results

    def cursor(self) -> QueuedCursor:
        return QueuedCursor(list(self._results))

async def test_sync_freshness_error_when_no_row() -> None:
    cur = FakeCursor({"user_integrations": None})
    issues = await _sync_freshness(cur, ATHLETE_ID, NOW)
    assert len(issues) == 1
    assert issues[0].key == "sync_freshness"
    assert issues[0].severity == "error"
    assert issues[0].label == "从未同步"


async def test_sync_freshness_error_when_last_sync_null() -> None:
    cur = FakeCursor(_sync_row(None))
    issues = await _sync_freshness(cur, ATHLETE_ID, NOW)
    assert len(issues) == 1
    assert issues[0].severity == "error"


async def test_sync_freshness_error_when_over_72h() -> None:
    old = NOW - timedelta(hours=80)
    cur = FakeCursor(_sync_row(old))
    issues = await _sync_freshness(cur, ATHLETE_ID, NOW)
    assert len(issues) == 1
    assert issues[0].severity == "error"
    assert "72" in issues[0].label


async def test_sync_freshness_warning_when_over_24h() -> None:
    old = NOW - timedelta(hours=30)
    cur = FakeCursor(_sync_row(old))
    issues = await _sync_freshness(cur, ATHLETE_ID, NOW)
    assert len(issues) == 1
    assert issues[0].severity == "warning"
    assert "24" in issues[0].label

@pytest.mark.parametrize(
    ("age", "severity"),
    [
        pytest.param(timedelta(hours=24), "warning", id="exactly_beyond_24h"),
        pytest.param(timedelta(hours=72), "error", id="exactly_beyond_72h"),
    ],
)
async def test_sync_freshness_when_exactly_beyond_boundary(
    age: timedelta, severity: str
) -> None:
    old = NOW - age
    cur = FakeCursor(_sync_row(old))
    issues = await _sync_freshness(cur, ATHLETE_ID, NOW)
    assert len(issues) == 1
    assert issues[0].severity == severity

async def test_sync_freshness_ok_when_recent() -> None:
    recent = NOW - timedelta(hours=2)
    cur = FakeCursor(_sync_row(recent))
    issues = await _sync_freshness(cur, ATHLETE_ID, NOW)
    assert len(issues) == 0


@pytest.mark.parametrize(("count", "expected"), [(5, 1), (0, 0)])
async def test_activity_missing_hr_90d(count: int, expected: int) -> None:
    cur = _count_cursor("activity_compute", count)
    issues = await _activity_missing_hr_90d(cur, ATHLETE_ID)
    assert len(issues) == expected
    if issues:
        assert issues[0].key == "activity_missing_hr_90d"
        assert issues[0].severity == "warning"
        assert issues[0].count == count
        assert str(count) in issues[0].label


async def test_run_missing_gps_90d_info_when_exceeds_threshold() -> None:
    cur = _count_cursor("activity_compute", 4)
    issues = await _run_missing_gps_90d(cur, ATHLETE_ID)
    assert len(issues) == 1
    assert issues[0].severity == "info"
    assert issues[0].count == 4


async def test_run_missing_gps_90d_ok_at_or_below_threshold() -> None:
    cur = _count_cursor("activity_compute", 2)
    issues = await _run_missing_gps_90d(cur, ATHLETE_ID)
    assert len(issues) == 0


async def test_ride_missing_power_90d_warning_when_missing() -> None:
    cur = _count_cursor("activity_compute", 3)
    issues = await _ride_missing_power_90d(cur, ATHLETE_ID)
    assert len(issues) == 1
    assert issues[0].key == "ride_missing_power_90d"
    assert issues[0].severity == "warning"
    assert issues[0].count == 3


async def test_ride_missing_power_90d_ok_when_zero() -> None:
    cur = _count_cursor("activity_compute", 0)
    issues = await _ride_missing_power_90d(cur, ATHLETE_ID)
    assert len(issues) == 0


async def test_wellness_missing_recent_warning_when_under_4() -> None:
    cur = _count_cursor("health_wellness", 2)
    issues = await _wellness_missing_recent(cur, ATHLETE_ID)
    assert len(issues) == 1
    assert issues[0].key == "wellness_missing_recent"
    assert issues[0].severity == "warning"
    assert issues[0].count == 2
    assert "2" in issues[0].label


async def test_wellness_missing_recent_ok_when_4_or_more() -> None:
    cur = _count_cursor("health_wellness", 5)
    issues = await _wellness_missing_recent(cur, ATHLETE_ID)
    assert len(issues) == 0


async def test_load_stale_warning_when_load_behind() -> None:
    cur = QueuedCursor([
        {"timezone": "UTC"},
        {"load_day": date(2026, 7, 10)},
        {"activity_day": date(2026, 7, 13)},
    ])
    issues = await _load_stale(cur, ATHLETE_ID)
    assert len(issues) == 1
    assert issues[0].key == "load_stale"
    assert issues[0].severity == "warning"


@pytest.mark.parametrize(
    ("load_day", "activity_day"),
    [
        (date(2026, 7, 13), date(2026, 7, 10)),
        (None, date(2026, 7, 13)),
    ],
)
async def test_load_stale_ok_when_load_is_current_or_missing(
    load_day: date | None, activity_day: date
) -> None:
    cur = QueuedCursor([{"timezone": "UTC"}, {"load_day": load_day}, {"activity_day": activity_day}])
    issues = await _load_stale(cur, ATHLETE_ID)
    assert len(issues) == 0


async def test_physiology_stale_info_when_null() -> None:
    cur = FakeCursor({"athletes": {"physiology_updated_at": None}})
    issues = await _physiology_stale(cur, ATHLETE_ID, NOW)
    assert len(issues) == 1
    assert issues[0].key == "physiology_stale"
    assert issues[0].severity == "info"
    assert "尚未" in issues[0].label


async def test_physiology_stale_info_when_over_7d() -> None:
    old = NOW - timedelta(days=10)
    cur = FakeCursor({"athletes": {"physiology_updated_at": old}})
    issues = await _physiology_stale(cur, ATHLETE_ID, NOW)
    assert len(issues) == 1
    assert issues[0].severity == "info"
    assert "过期" in issues[0].label


async def test_physiology_stale_ok_when_recent() -> None:
    recent = NOW - timedelta(days=3)
    cur = FakeCursor({"athletes": {"physiology_updated_at": recent}})
    issues = await _physiology_stale(cur, ATHLETE_ID, NOW)
    assert len(issues) == 0


async def test_compute_data_quality_all_clean() -> None:
    recent = NOW - timedelta(hours=2)
    results = _build_results(
        sync_row={"source": "intervals_icu", "last_sync_at": recent},
        load_day=date(2026, 7, 13),
        activity_day=date(2026, 7, 13),
        physio_updated_at=recent,
    )
    conn = QueuedConnection(results)
    result = await compute_data_quality(ATHLETE_ID, conn, now=NOW)
    assert set(result) == {"summary", "issues"}
    assert result["summary"]["status"] == "ok"
    assert result["summary"]["issue_count"] == 0
    assert result["summary"]["last_checked_at"] == NOW.isoformat()
    assert result["issues"] == []

async def test_compute_data_quality_with_warnings() -> None:
    recent = NOW - timedelta(hours=1)
    results = _build_results(
        sync_row={"source": "intervals_icu", "last_sync_at": recent},
        wellness_count=2,
        physio_updated_at=recent,
    )
    conn = QueuedConnection(results)
    result = await compute_data_quality(ATHLETE_ID, conn, now=NOW)
    assert result["summary"]["status"] == "warning"
    assert result["summary"]["issue_count"] >= 1
    assert {"key", "severity", "label", "entity_type"} <= set(result["issues"][0])

async def test_compute_data_quality_with_errors() -> None:
    results = _build_results(sync_row=None, physio_updated_at=NOW)
    conn = QueuedConnection(results)
    result = await compute_data_quality(ATHLETE_ID, conn, now=NOW)
    assert result["summary"]["status"] == "error"
    assert result["summary"]["issue_count"] >= 1


def _query_key(query: str, rows: dict[str, dict[str, object] | None]) -> str | None:
    return next((key for key in rows if key in query), None)


def _sync_row(last_sync_at: datetime | None) -> dict[str, dict[str, object]]:
    return {"user_integrations": {"source": "intervals_icu", "last_sync_at": last_sync_at}}


def _count_cursor(table: str, count: int) -> FakeCursor:
    return FakeCursor({table: {"cnt": count}})


def _build_results(
    *,
    sync_row: dict[str, object] | None,
    hr_count: int = 0,
    gps_count: int = 0,
    power_count: int = 0,
    wellness_count: int = 7,
    hrv_row: dict[str, object] | None = None,
    strength_row: dict[str, object] | None = None,
    speed_row: dict[str, object] | None = None,
    upload_row: dict[str, object] | None = None,
    load_day: date | None = None,
    activity_day: date | None = None,
    physio_updated_at: datetime | None = None,
) -> list[dict[str, object] | None]:
    return [
        sync_row,
        {"cnt": hr_count},
        {"cnt": gps_count},
        {"cnt": power_count},
        {"cnt": wellness_count},
        hrv_row if hrv_row is not None else {"wellness_days": 7, "hrv_days": 5},
        strength_row if strength_row is not None else {"recent": 2, "ever": 20},
        speed_row if speed_row is not None else {"activities": 0},
        upload_row if upload_row is not None else {"total": 1, "failed": 0},
        {"timezone": "UTC"},
        {"load_day": load_day},
        {"activity_day": activity_day},
        {"physiology_updated_at": physio_updated_at},
    ]
