# pyright: reportAny=false, reportArgumentType=false, reportMissingTypeStubs=false, reportUnknownMemberType=false

from __future__ import annotations

from pathlib import Path

import httpx
import pytest
import vcr

API_BASE = "https://intervals.icu/api/v1"
CASSETTE = Path(__file__).parent / "cassettes" / "intervals_api_validation.yaml"
AUTH = ("API_KEY", "API_KEY_PLACEHOLDER")
pytestmark = pytest.mark.no_db


def validation_vcr() -> vcr.VCR:
    return vcr.VCR(record_mode="none", match_on=["method", "scheme", "host", "path"])


def test_replays_intervals_activities() -> None:
    with validation_vcr().use_cassette(str(CASSETTE)):
        resp = httpx.get(f"{API_BASE}/athlete/0/activities", auth=AUTH, timeout=10)

    assert resp.status_code == 200
    activities = resp.json()
    assert activities
    first = activities[0]
    assert first["id"]
    assert first["start_date_local"]
    assert first["type"]


def test_replays_intervals_streams() -> None:
    with validation_vcr().use_cassette(str(CASSETTE)):
        activities_resp = httpx.get(f"{API_BASE}/athlete/0/activities", auth=AUTH, timeout=10)
        activity_id = activities_resp.json()[0]["id"]
        streams_resp = httpx.get(
            f"{API_BASE}/activity/{activity_id}/streams",
            params={"types": "watts,heartrate,cadence,velocity_smooth,altitude"},
            auth=AUTH,
            timeout=10,
        )

    assert streams_resp.status_code == 200
    streams = streams_resp.json()
    assert streams
    for stream in streams:
        assert stream["type"]
        assert isinstance(stream["data"], list)


def test_replay_cassette_is_sanitized() -> None:
    cassette = Path(__file__).parent / "cassettes" / "intervals_api_validation.yaml"
    text = cassette.read_text()
    assert "ATHLETE_PLACEHOLDER" in text
    assert "Basic" not in text
