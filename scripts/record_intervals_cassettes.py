# pyright: reportAny=false, reportExplicitAny=false, reportMissingImports=false, reportUnknownMemberType=false, reportUnusedCallResult=false

from __future__ import annotations

import base64
import json
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx
import vcr


API_BASE = "https://intervals.icu/api/v1"
CASSETTE_PATH = Path("apps/api/tests/cassettes/intervals_api_validation.yaml")
ATHLETE_PLACEHOLDER = "ATHLETE_PLACEHOLDER"
API_KEY_PLACEHOLDER = "API_KEY_PLACEHOLDER"


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def _assert_response(resp: httpx.Response) -> None:
    resp.raise_for_status()


def _record(api_key: str) -> str:
    today = date.today()
    oldest = today - timedelta(days=30)
    week = today - timedelta(days=7)
    next_month = today + timedelta(days=31)
    auth = ("API_KEY", api_key)

    with vcr.use_cassette(
        str(CASSETTE_PATH),
        record_mode="once",
        decode_compressed_response=True,
        filter_headers=[("authorization", "API_KEY_PLACEHOLDER")],
    ):
        athlete_resp = httpx.get(f"{API_BASE}/athlete/0", auth=auth, timeout=30)
        _assert_response(athlete_resp)
        athlete = athlete_resp.json()
        real_athlete_id = str(athlete["id"])

        activities_resp = httpx.get(
            f"{API_BASE}/athlete/0/activities",
            params={"oldest": oldest.isoformat(), "newest": today.isoformat()},
            auth=auth,
            timeout=30,
        )
        _assert_response(activities_resp)
        activities: list[dict[str, Any]] = activities_resp.json()
        if not activities:
            raise RuntimeError("Cannot record streams/FIT without at least one recent activity")
        activity_id = activities[0]["id"]

        streams_resp = httpx.get(
            f"{API_BASE}/activity/{activity_id}/streams",
            params={"types": "watts,heartrate,cadence,velocity_smooth,altitude"},
            auth=auth,
            timeout=30,
        )
        _assert_response(streams_resp)

        fit_resp = httpx.get(f"{API_BASE}/activity/{activity_id}/fit-file", auth=auth, timeout=30)
        _assert_response(fit_resp)

        wellness_resp = httpx.get(
            f"{API_BASE}/athlete/0/wellness",
            params={"oldest": week.isoformat(), "newest": today.isoformat()},
            auth=auth,
            timeout=30,
        )
        _assert_response(wellness_resp)

        events_resp = httpx.get(
            f"{API_BASE}/athlete/0/events",
            params={"oldest": today.strftime("%Y-%m-01"), "newest": next_month.strftime("%Y-%m-28")},
            auth=auth,
            timeout=30,
        )
        _assert_response(events_resp)

    return real_athlete_id


def _sanitize(api_key: str, athlete_id: str) -> None:
    cassette = CASSETTE_PATH.read_text()
    basic_token = base64.b64encode(f"API_KEY:{api_key}".encode()).decode()
    replacements = {
        api_key: API_KEY_PLACEHOLDER,
        basic_token: base64.b64encode(b"API_KEY:API_KEY_PLACEHOLDER").decode(),
        athlete_id: ATHLETE_PLACEHOLDER,
    }
    for secret, placeholder in replacements.items():
        cassette = cassette.replace(secret, placeholder)
    CASSETTE_PATH.write_text(cassette)

    sanitized = CASSETTE_PATH.read_text()
    leaked = [label for label, value in {"api_key": api_key, "athlete_id": athlete_id}.items() if value in sanitized]
    if leaked:
        raise RuntimeError(f"Sanitization failed, leaked values remain: {json.dumps(leaked)}")


def main() -> None:
    _load_dotenv(Path("apps/api/.env"))
    api_key = os.environ["INTERVALS_ICU_API_KEY"]
    CASSETTE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if CASSETTE_PATH.exists():
        CASSETTE_PATH.unlink()
    athlete_id = _record(api_key)
    _sanitize(api_key, athlete_id)
    print(f"Recorded sanitized cassette: {CASSETTE_PATH}")
    print(f"Sanitized athlete id: {ATHLETE_PLACEHOLDER}")


if __name__ == "__main__":
    main()
