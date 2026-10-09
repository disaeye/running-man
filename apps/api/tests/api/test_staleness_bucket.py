"""Unit tests for ``staleness_bucket`` utility.

Covers all four branches of the staleness classification:
  - data_as_of within 24h        → "fresh"
  - data_as_of between 24–72h    → "stale"
  - data_as_of older than 72h    → "missing"
  - data_as_of is None           → "missing"
"""

from __future__ import annotations

# Use the real datetime to compute relative timestamps on-the-fly
import datetime as _real_dt
from datetime import timedelta, timezone

import pytest


class _FrozenDatetime:
    """Mimics ``datetime.datetime`` but returns a fixed value from ``now()``."""

    FROZEN = _real_dt.datetime(2026, 6, 29, 12, 0, 0, tzinfo=timezone.utc)

    @classmethod
    def now(cls, tz: timezone | None = None) -> _real_dt.datetime:
        return cls.FROZEN


@pytest.mark.no_db
def test_staleness_bucket_fresh(monkeypatch: pytest.MonkeyPatch) -> None:
    """data_as_of less than 24 hours ago → fresh."""
    monkeypatch.setattr("presentation.api.integration_helpers.datetime", _FrozenDatetime)
    from presentation.api.integration_helpers import staleness_bucket

    recent = _FrozenDatetime.FROZEN - timedelta(hours=2)
    assert staleness_bucket(recent) == "fresh"


@pytest.mark.no_db
def test_staleness_bucket_stale(monkeypatch: pytest.MonkeyPatch) -> None:
    """data_as_of between 24 and 72 hours ago → stale."""
    monkeypatch.setattr("presentation.api.integration_helpers.datetime", _FrozenDatetime)
    from presentation.api.integration_helpers import staleness_bucket

    older = _FrozenDatetime.FROZEN - timedelta(hours=48)
    assert staleness_bucket(older) == "stale"


@pytest.mark.no_db
def test_staleness_bucket_missing_old(monkeypatch: pytest.MonkeyPatch) -> None:
    """data_as_of more than 72 hours ago → missing."""
    monkeypatch.setattr("presentation.api.integration_helpers.datetime", _FrozenDatetime)
    from presentation.api.integration_helpers import staleness_bucket

    very_old = _FrozenDatetime.FROZEN - timedelta(hours=96)
    assert staleness_bucket(very_old) == "missing"


@pytest.mark.no_db
def test_staleness_bucket_missing_none(monkeypatch: pytest.MonkeyPatch) -> None:
    """data_as_of is None → missing."""
    monkeypatch.setattr("presentation.api.integration_helpers.datetime", _FrozenDatetime)
    from presentation.api.integration_helpers import staleness_bucket

    assert staleness_bucket(None) == "missing"


@pytest.mark.no_db
def test_staleness_bucket_boundary_fresh(monkeypatch: pytest.MonkeyPatch) -> None:
    """data_as_of exactly 23h59m ago → fresh (just inside the boundary)."""
    monkeypatch.setattr("presentation.api.integration_helpers.datetime", _FrozenDatetime)
    from presentation.api.integration_helpers import staleness_bucket

    boundary = _FrozenDatetime.FROZEN - timedelta(hours=23, minutes=59)
    assert staleness_bucket(boundary) == "fresh"


@pytest.mark.no_db
def test_staleness_bucket_boundary_stale(monkeypatch: pytest.MonkeyPatch) -> None:
    """data_as_of exactly 71h59m ago → stale (just inside the 72h boundary)."""
    monkeypatch.setattr("presentation.api.integration_helpers.datetime", _FrozenDatetime)
    from presentation.api.integration_helpers import staleness_bucket

    boundary = _FrozenDatetime.FROZEN - timedelta(hours=71, minutes=59)
    assert staleness_bucket(boundary) == "stale"


@pytest.mark.no_db
def test_staleness_bucket_edge_24h_exactly(monkeypatch: pytest.MonkeyPatch) -> None:
    """data_as_of exactly 24h ago → stale (>= 24h triggers stale)."""
    monkeypatch.setattr("presentation.api.integration_helpers.datetime", _FrozenDatetime)
    from presentation.api.integration_helpers import staleness_bucket

    edge = _FrozenDatetime.FROZEN - timedelta(hours=24)
    assert staleness_bucket(edge) == "stale"


@pytest.mark.no_db
def test_staleness_bucket_edge_72h_exactly(monkeypatch: pytest.MonkeyPatch) -> None:
    """data_as_of exactly 72h ago → missing (>= 72h triggers missing)."""
    monkeypatch.setattr("presentation.api.integration_helpers.datetime", _FrozenDatetime)
    from presentation.api.integration_helpers import staleness_bucket

    edge = _FrozenDatetime.FROZEN - timedelta(hours=72)
    assert staleness_bucket(edge) == "missing"
