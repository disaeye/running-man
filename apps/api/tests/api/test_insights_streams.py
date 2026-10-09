from __future__ import annotations

from datetime import date, datetime

import pytest

from presentation.api import insights_streams

pytestmark = pytest.mark.no_db


class _FakeCursor:
    def __init__(self) -> None:
        self.query = ""
        self.params: tuple[object, ...] = ()

    async def __aenter__(self) -> "_FakeCursor":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None

    async def execute(self, query: str, params: tuple[object, ...]) -> None:
        self.query = query
        self.params = params

    async def fetchall(self) -> list[dict[str, object]]:
        return [
            {"activity_id": "ride-1", "metric_type": "power", "value": 240},
            {"activity_id": "ride-1", "metric_type": "heart_rate", "value": 150},
        ]


class _FakeConnection:
    def __init__(self, cursor: _FakeCursor) -> None:
        self._cursor = cursor

    async def __aenter__(self) -> "_FakeConnection":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None

    def cursor(self) -> _FakeCursor:
        return self._cursor


class _FakePool:
    def __init__(self, cursor: _FakeCursor) -> None:
        self._cursor = cursor

    def connection(self) -> _FakeConnection:
        return _FakeConnection(self._cursor)


async def test_streams_for_activities_filters_metric_types(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = _FakeCursor()
    monkeypatch.setattr("infrastructure.repositories.analytics.get_pool", lambda: _FakePool(cursor))

    streams = await insights_streams._streams_for_activities(
        "athlete-1", ["ride-1"], ["heart_rate", "power"]
    )

    assert "metric_type = ANY(%s)" in cursor.query
    assert cursor.params == ("athlete-1", ["ride-1"], ["heart_rate", "power"])
    assert list(streams) == ["ride-1"]


async def test_power_streams_only_requests_power_metric(monkeypatch: pytest.MonkeyPatch) -> None:
    cursor = _FakeCursor()
    monkeypatch.setattr("infrastructure.repositories.analytics.get_pool", lambda: _FakePool(cursor))

    powers = await insights_streams._power_streams_for_activities("athlete-1", ["ride-1"])

    assert cursor.params == ("athlete-1", ["ride-1"], ["power"])
    assert powers == {"ride-1": [240.0]}


async def test_streams_for_range_joins_summary_and_filters_metrics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = _FakeCursor()
    monkeypatch.setattr("infrastructure.repositories.analytics.get_pool", lambda: _FakePool(cursor))

    await insights_streams._streams_for_range(
        "athlete-1", date(2026, 6, 1), date(2026, 6, 26), ["heart_rate", "power"]
    )

    # Joins the view rather than the base table: streams for an ignored or
    # soft-deleted activity must not reach the charts either.
    assert "JOIN activity_compute" in cursor.query
    assert "s.metric_type = ANY(%s)" in cursor.query
    assert cursor.params[0] == "athlete-1"
    assert cursor.params[1] == datetime(2026, 6, 1, 0, 0)
    assert cursor.params[2] == datetime(2026, 6, 27, 0, 0)
    assert cursor.params[3] == ["heart_rate", "power"]
