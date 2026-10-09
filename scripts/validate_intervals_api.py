# pyright: reportAny=false, reportExplicitAny=false, reportUnknownVariableType=false, reportUnusedCallResult=false

from __future__ import annotations

import argparse
import json
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx


API_BASE = "https://intervals.icu/api/v1"
STREAM_TYPES = "watts,heartrate,cadence,velocity_smooth,altitude"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def api_client() -> httpx.Client:
    load_dotenv(Path("apps/api/.env"))
    return httpx.Client(auth=("API_KEY", os.environ["INTERVALS_ICU_API_KEY"]), timeout=30)


def get_json(client: httpx.Client, path: str, params: dict[str, str] | None = None) -> Any:
    resp = client.get(f"{API_BASE}{path}", params=params)
    resp.raise_for_status()
    return resp.json()


def recent_activities(client: httpx.Client) -> list[dict[str, Any]]:
    today = date.today()
    return get_json(
        client,
        "/athlete/0/activities",
        {"oldest": (today - timedelta(days=30)).isoformat(), "newest": today.isoformat()},
    )


def print_activities(client: httpx.Client) -> None:
    activities = recent_activities(client)
    print(json.dumps({"count": len(activities), "first": summarize_activity(activities)}, indent=2))


def summarize_activity(activities: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not activities:
        return None
    activity = activities[0]
    return {
        "id": activity.get("id"),
        "start_date_local": activity.get("start_date_local"),
        "type": activity.get("type"),
        "duration_seconds": activity.get("elapsed_time"),
        "stream_types": activity.get("stream_types", []),
        "fields": sorted(activity.keys()),
    }


def print_streams(client: httpx.Client) -> None:
    activities = recent_activities(client)
    if not activities:
        raise RuntimeError("No recent activities available for streams validation")
    activity = activities[0]
    streams = get_json(
        client,
        f"/activity/{activity['id']}/streams",
        {"types": STREAM_TYPES},
    )
    summary = [
        {
            "type": stream.get("type"),
            "points": len(stream.get("data") or []),
            "first_values": (stream.get("data") or [])[:5],
        }
        for stream in streams
    ]
    print(
        json.dumps(
            {
                "activity_id": activity["id"],
                "elapsed_time": activity.get("elapsed_time"),
                "icu_median_time_delta": activity.get("icu_median_time_delta"),
                "streams": summary,
            },
            indent=2,
        )
    )


def print_wellness(client: httpx.Client) -> None:
    today = date.today()
    wellness = get_json(
        client,
        "/athlete/0/wellness",
        {"oldest": (today - timedelta(days=7)).isoformat(), "newest": today.isoformat()},
    )
    non_null = sorted({key for row in wellness for key, value in row.items() if value not in (None, "", [], {})})
    print(json.dumps({"count": len(wellness), "non_null_fields": non_null}, indent=2))


def print_events(client: httpx.Client) -> None:
    today = date.today()
    next_month = today + timedelta(days=31)
    events = get_json(
        client,
        "/athlete/0/events",
        {"oldest": today.strftime("%Y-%m-01"), "newest": next_month.strftime("%Y-%m-28")},
    )
    first = None if not events else {"fields": sorted(events[0].keys()), **events[0]}
    print(json.dumps({"count": len(events), "first": first}, indent=2, default=str))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", choices=["activities", "streams", "wellness", "events"], required=True)
    args = parser.parse_args()

    with api_client() as client:
        handlers = {
            "activities": print_activities,
            "streams": print_streams,
            "wellness": print_wellness,
            "events": print_events,
        }
        handlers[args.endpoint](client)


if __name__ == "__main__":
    main()
