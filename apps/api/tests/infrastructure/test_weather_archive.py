"""Tests for the weather archive request and response parsing."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from infrastructure.weather.archive import (
    ActivityPosition,
    build_archive_url,
    parse_archive_response,
    same_grid_cell,
)

pytestmark = pytest.mark.no_db


def _position(**overrides: object) -> ActivityPosition:
    defaults: dict[str, object] = {
        "latitude": 31.8618,
        "longitude": 118.8409,
        "start_time": datetime(2026, 10, 25, 2, 55, tzinfo=UTC),
        "duration_s": 2560,
    }
    defaults.update(overrides)
    return ActivityPosition(**defaults)  # type: ignore[arg-type]


def test_url_covers_the_activity_day_and_its_neighbours() -> None:
    """The request window is wide enough for a session that crosses midnight."""
    url = build_archive_url(_position())
    assert "start_date=2026-10-24" in url
    assert "end_date=2026-10-26" in url
    assert "latitude=31.8618" in url
    assert "longitude=118.8409" in url
    assert "models=best_match" in url


def test_response_is_read_for_the_hours_the_activity_covers() -> None:
    """Only the hours inside the activity window are counted."""
    payload: dict[str, object] = {
        "hourly": {
            "time": [
                "2026-10-25T02:00",
                "2026-10-25T03:00",
                "2026-10-25T12:00",
            ],
            "temperature_2m": [18.0, 19.0, 30.0],
            "apparent_temperature": [18.5, 19.5, 32.0],
            "precipitation": [0.0, 0.2, 9.9],
            "wind_speed_10m": [6.0, 8.0, 40.0],
            "wind_direction_10m": [10.0, 20.0, 300.0],
            "cloud_cover": [0.0, 50.0, 90.0],
        }
    }
    observation = parse_archive_response(payload, _position())
    assert observation.covered_hours == 2
    assert observation.avg_temp_c == pytest.approx(18.5)
    assert observation.max_rain_mm == pytest.approx(0.2)
    assert observation.wind_speed_kmh == pytest.approx(7.0)
    assert observation.clouds_pct == pytest.approx(25.0)


def test_a_response_without_hours_reports_nothing_measured() -> None:
    """A payload the service could not fill is not turned into zeroes."""
    observation = parse_archive_response({}, _position())
    assert observation.is_empty is True
    assert observation.covered_hours == 0
    assert observation.avg_temp_c is None


def test_null_hours_are_skipped_rather_than_counted_as_zero() -> None:
    """A null value is missing data, not a temperature of zero."""
    payload: dict[str, object] = {
        "hourly": {
            "time": ["2026-10-25T02:00", "2026-10-25T03:00"],
            "temperature_2m": [None, 19.0],
        },
    }
    observation = parse_archive_response(payload, _position())
    assert observation.avg_temp_c == pytest.approx(19.0)


def test_positions_in_one_grid_cell_share_a_request() -> None:
    """Two nearby activities can be covered by one request."""
    first = _position(latitude=31.8618, longitude=118.8409)
    second = _position(latitude=31.8700, longitude=118.8500)
    assert same_grid_cell(first, second) is True


def test_positions_far_apart_do_not_share_a_request() -> None:
    """Two activities in different cities need different requests."""
    first = _position(latitude=31.8618, longitude=118.8409)
    second = _position(latitude=39.9042, longitude=116.4074)
    assert same_grid_cell(first, second) is False
