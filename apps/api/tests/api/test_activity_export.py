"""Tests for ``GET /api/activities/{id}/export?format=fit|tcx``.

Covers:
- FIT and TCX return binary payloads with correct Content-Type / Disposition
- Both formats round-trip through their respective parsers (write -> parse)
- 404 when the activity does not exist
- 403 when the activity belongs to another athlete
- 400 for unsupported format query (e.g. gpx)
- 404 when the activity exists but has no stream rows
- Exported filename is derived from the activity id
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from infrastructure.parsing.fit_parser import parse_fit
from infrastructure.parsing.tcx_parser import parse_tcx
from main import app
from presentation.api.activities import get_activity_repo
from presentation.auth.deps import get_current_athlete

ATHLETE_A = Athlete(uuid4(), "a@example.com", "hash")
ATHLETE_B = Athlete(uuid4(), "b@example.com", "hash")

ACTIVITY_ID = "abc-123"
OTHER_ATHLETE_ACTIVITY_ID = "xyz-789"
START_TIME = datetime(2026, 6, 16, 10, 0, 0, tzinfo=UTC)


@dataclass
class _FakeRepo:
    """Single-activity fake with controllable ownership."""

    owner_id: UUID
    activity_id: str = ACTIVITY_ID
    streams: list[dict[str, object]] | None = None
    sport: str = "Run"

    async def get_by_id(self, athlete_id: UUID, activity_id: str) -> dict[str, object] | None:
        if athlete_id != self.owner_id or activity_id != self.activity_id:
            return None
        return {
            "activity_id": self.activity_id,
            "start_time": START_TIME,
            "sport": self.sport,
            "distance_m": 1000.0,
            "duration_s": 300,
        }

    async def exists(self, activity_id: str) -> bool:
        return activity_id in {self.activity_id, OTHER_ATHLETE_ACTIVITY_ID}

    async def get_streams(self, _athlete_id: UUID, activity_id: str) -> list[dict[str, object]]:
        if activity_id != self.activity_id:
            return []
        return list(self.streams or [])


def _sample_streams(n: int = 5) -> list[dict[str, object]]:
    """Build N rows-per-second stream payload mirroring the DB schema.

    Mirrors _upload_helpers.streams_from_samples output: one row per metric
    per timestamp, with lat/lon/alt repeated on every row.
    """
    rows: list[dict[str, object]] = []
    for i in range(n):
        ts = START_TIME + timedelta(seconds=i)
        lat, lon, alt = 25.06 + i * 0.0001, 121.63 + i * 0.0001, 100.0 + i
        for metric, value in (
            ("heart_rate", float(140 + i)),
            ("power", float(200 + i)),
            ("cadence", float(80 + i % 10)),
            ("speed", 4.5),
            ("distance", float(i * 4.5)),
        ):
            rows.append(
                {
                    "sample_time": ts,
                    "metric_type": metric,
                    "value": value,
                    "lat": lat,
                    "lon": lon,
                    "alt": alt,
                }
            )
    return rows


# ---------------------------------------------------------------------------
# success path
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_export_fit_returns_binary_with_correct_headers() -> None:
    _wire(_FakeRepo(owner_id=ATHLETE_A.id, streams=_sample_streams()))

    response = await _get_export(ACTIVITY_ID, "fit")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/vnd.ant.fit"
    assert response.headers["content-disposition"] == f'attachment; filename="{ACTIVITY_ID}.fit"'
    assert len(response.content) > 0
    assert int(response.headers["content-length"]) == len(response.content)


@pytest.mark.no_db
async def test_export_tcx_returns_xml_with_correct_headers() -> None:
    _wire(_FakeRepo(owner_id=ATHLETE_A.id, streams=_sample_streams()))

    response = await _get_export(ACTIVITY_ID, "tcx")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/xml"
    assert response.headers["content-disposition"] == f'attachment; filename="{ACTIVITY_ID}.tcx"'
    assert b"<TrainingCenterDatabase" in response.content


@pytest.mark.no_db
async def test_export_fit_round_trips_through_parser() -> None:
    """Bytes from the endpoint must be re-parseable by parse_fit."""
    _wire(_FakeRepo(owner_id=ATHLETE_A.id, streams=_sample_streams(n=4)))

    response = await _get_export(ACTIVITY_ID, "fit")

    result = parse_fit(response.content)
    assert len(result.samples) == 4
    assert result.samples[0].heart_rate == 140
    assert result.samples[0].power == 200
    assert result.samples[0].cadence == 80


@pytest.mark.no_db
async def test_export_tcx_round_trips_through_parser() -> None:
    _wire(_FakeRepo(owner_id=ATHLETE_A.id, streams=_sample_streams(n=3)))

    response = await _get_export(ACTIVITY_ID, "tcx")

    samples = parse_tcx(response.content)
    assert len(samples) == 3
    assert samples[0].heart_rate == 140
    assert samples[0].power == 200
    assert samples[0].cadence == 80


@pytest.mark.no_db
async def test_export_preserves_sport_in_payload() -> None:
    """Sport should flow from activity.sport into the file."""
    _wire(_FakeRepo(owner_id=ATHLETE_A.id, sport="Ride", streams=_sample_streams()))

    response = await _get_export(ACTIVITY_ID, "tcx")

    assert b'Sport="Biking"' in response.content


@pytest.mark.no_db
async def test_export_sanitizes_filename() -> None:
    weird_id = "act with:weird?chars"
    _wire(_FakeRepo(owner_id=ATHLETE_A.id, activity_id=weird_id, streams=_sample_streams()))

    response = await _get_export(weird_id, "tcx")

    assert response.status_code == 200
    disposition = response.headers["content-disposition"]
    filename = disposition.split('filename="')[1].split('"')[0]
    hostile_chars = {"/", "?", ":"}
    assert not (set(filename) & hostile_chars)
    assert filename.endswith(".tcx")


# ---------------------------------------------------------------------------
# error paths
# ---------------------------------------------------------------------------


@pytest.mark.no_db
async def test_export_unsupported_format_returns_400() -> None:
    _wire(_FakeRepo(owner_id=ATHLETE_A.id, streams=_sample_streams()))

    response = await _get_export(ACTIVITY_ID, "gpx")

    assert response.status_code == 400
    assert "unsupported" in response.json()["detail"]


@pytest.mark.no_db
async def test_export_unknown_activity_returns_404() -> None:
    _wire(_FakeRepo(owner_id=ATHLETE_A.id, activity_id=ACTIVITY_ID))

    response = await _get_export("does-not-exist", "fit")

    assert response.status_code == 404


@pytest.mark.no_db
async def test_export_other_athletes_activity_returns_403() -> None:
    """exists()=True but get_by_id()=None for the requesting athlete → 403."""
    repo = _FakeRepo(owner_id=ATHLETE_A.id, activity_id=ACTIVITY_ID)
    _wire(repo)

    # Request as B; repo.exists(ACTIVITY_ID)=True but get_by_id returns None.
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE_B

    response = await _get_export(ACTIVITY_ID, "fit")

    assert response.status_code == 403


@pytest.mark.no_db
async def test_export_no_streams_returns_404() -> None:
    _wire(_FakeRepo(owner_id=ATHLETE_A.id, streams=[]))

    response = await _get_export(ACTIVITY_ID, "fit")

    assert response.status_code == 404
    assert "no stream" in response.json()["detail"]


@pytest.mark.no_db
async def test_export_format_is_case_insensitive() -> None:
    _wire(_FakeRepo(owner_id=ATHLETE_A.id, streams=_sample_streams()))

    response = await _get_export(ACTIVITY_ID, "TCX")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/xml"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _wire(repo: _FakeRepo) -> None:
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_athlete] = lambda: ATHLETE_A
    app.dependency_overrides[get_activity_repo] = lambda: repo


async def _get_export(activity_id: str, fmt: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        path = f"/api/v1/activities/{quote(activity_id, safe='')}/export"
        return await client.get(path, params={"format": fmt})


_ = (Sequence, UTC, Any)  # silence unused import in strict type checkers
