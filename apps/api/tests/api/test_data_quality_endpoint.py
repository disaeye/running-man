"""Integration tests for ``GET /api/v1/data/quality``."""

from __future__ import annotations

import pytest

from main import app
from tests.api.data_quality_endpoint_helpers import (
    _HEALTH_FETCHALL_EMPTY,
    _HEALTH_FETCHALL_SOME,
    _HEALTH_FETCHONE_ALL,
    _HEALTH_FETCHONE_EMPTY,
    _QUALITY_CLEAN,
    _QUALITY_ISSUE_KEYS,
    _QUALITY_SYNC_ERROR,
    _QUALITY_WARNINGS,
    _fetch_quality,
)


@pytest.fixture(autouse=True)
def _clean_overrides() -> None:
    app.dependency_overrides.clear()


@pytest.mark.no_db
async def test_get_data_quality_returns_200_with_shape(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = await _fetch_quality(
        monkeypatch, _HEALTH_FETCHONE_ALL, _HEALTH_FETCHALL_SOME, _QUALITY_CLEAN
    )
    assert {"summary", "coverage", "issues"} <= payload.keys()


@pytest.mark.no_db
async def test_get_data_quality_summary_clean(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = await _fetch_quality(
        monkeypatch, _HEALTH_FETCHONE_ALL, _HEALTH_FETCHALL_SOME, _QUALITY_CLEAN
    )
    assert payload["summary"]["status"] == "ok"
    assert payload["summary"]["issue_count"] == 0
    assert "last_checked_at" in payload["summary"]
    assert payload["issues"] == []


@pytest.mark.no_db
async def test_get_data_quality_coverage_activities(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = await _fetch_quality(
        monkeypatch, _HEALTH_FETCHONE_ALL, _HEALTH_FETCHALL_SOME, _QUALITY_CLEAN
    )
    activities = payload["coverage"]["activities"]
    assert activities["with_hr"] == 30
    assert activities["with_gps"] == 15
    assert activities["with_power"] == 20
    assert activities["with_streams"] == 38


@pytest.mark.no_db
async def test_get_data_quality_coverage_wellness(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = await _fetch_quality(
        monkeypatch, _HEALTH_FETCHONE_ALL, _HEALTH_FETCHALL_SOME, _QUALITY_CLEAN
    )
    wellness = payload["coverage"]["wellness"]
    assert wellness["sleep_days_28d"] == 22
    assert wellness["rhr_days_28d"] == 20
    assert wellness["hrv_days_28d"] == 18


@pytest.mark.no_db
async def test_get_data_quality_coverage_no_wellness_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = await _fetch_quality(
        monkeypatch, _HEALTH_FETCHONE_EMPTY, _HEALTH_FETCHALL_EMPTY, _QUALITY_CLEAN
    )
    wellness = payload["coverage"]["wellness"]
    assert wellness["sleep_days_28d"] == 0
    assert wellness["rhr_days_28d"] == 0
    assert wellness["hrv_days_28d"] == 0


@pytest.mark.no_db
async def test_get_data_quality_issues_with_error(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = await _fetch_quality(
        monkeypatch, _HEALTH_FETCHONE_EMPTY, _HEALTH_FETCHALL_EMPTY, _QUALITY_SYNC_ERROR
    )
    assert payload["summary"]["status"] == "error"
    assert payload["summary"]["issue_count"] >= 1


@pytest.mark.no_db
async def test_get_data_quality_issues_with_warnings(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = await _fetch_quality(
        monkeypatch, _HEALTH_FETCHONE_EMPTY, _HEALTH_FETCHALL_EMPTY, _QUALITY_WARNINGS
    )
    assert payload["summary"]["status"] == "warning"
    assert payload["summary"]["issue_count"] == 8
    keys = {issue["key"] for issue in payload["issues"]}
    assert keys == {
        "activity_missing_hr_90d",
        "ride_missing_power_90d",
        "wellness_missing_recent",
        "hrv_missing_recent",
        "strength_missing_recent",
        "stream_speed_outlier_30d",
        "upload_failures_30d",
        "load_stale",
    }


@pytest.mark.no_db
async def test_get_data_quality_issue_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = await _fetch_quality(
        monkeypatch, _HEALTH_FETCHONE_EMPTY, _HEALTH_FETCHALL_EMPTY, _QUALITY_ISSUE_KEYS
    )
    assert payload["summary"]["status"] == "warning"
    assert payload["summary"]["issue_count"] == 2
    assert all(
        {"key", "severity", "label", "entity_type"} <= issue.keys()
        for issue in payload["issues"]
    )
    keys = {issue["key"] for issue in payload["issues"]}
    assert "sync_freshness" in keys
    assert "physiology_stale" in keys
