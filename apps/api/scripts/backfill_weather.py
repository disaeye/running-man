#!/usr/bin/env python3
"""Backfill activity weather from each activity's own GPS position.

Intervals.icu returns a weather block with an activity when its own weather
service has data for that place and time. This deployment's activities carry
none, so the weather tag on the activity pages would never appear.

This script asks a reanalysis service (ERA5, via Open-Meteo's archive
endpoint) for the conditions at each activity's start position and time, and
stores the answer on the activity row together with its source, so the page
can say where the figures came from.

Only activities that carry a GPS position are asked about: a run on a
treadmill has no place on Earth, and the weather of the athlete's home city
would be a fiction. Activities that already have a weather figure are left
alone.

Usage::

    python apps/api/scripts/backfill_weather.py          # update all
    python apps/api/scripts/backfill_weather.py --dry-run  # preview only
    python apps/api/scripts/backfill_weather.py --limit=50
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx
import psycopg

# Make the API source tree importable when this script is run from the
# repository root, so the weather module is reused instead of duplicated here.
_api_src = Path(__file__).resolve().parents[1] / "src"
if str(_api_src) not in sys.path:
    sys.path.insert(0, str(_api_src))

from infrastructure.weather.service import (  # noqa: E402
    activities_without_weather,
    fetch_for_activity,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    parser.add_argument("--dry-run", action="store_true", help="preview without writing")
    parser.add_argument("--limit", type=int, default=0, help="cap the number of activities")
    return parser.parse_args()


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip()
    raise SystemExit("DATABASE_URL is not set")


def main() -> None:
    args = parse_args()
    dsn = args.database_url or database_url()
    written = 0
    skipped = 0
    failed = 0
    with httpx.Client() as client, psycopg.connect(dsn) as conn:
        rows = activities_without_weather(conn, None)
        if args.limit:
            rows = rows[: args.limit]
        for row in rows:
            if args.dry_run:
                print(json.dumps({k: str(v) for k, v in row.items()}, ensure_ascii=False))
                continue
            result = fetch_for_activity(conn, row, client)
            if result.error is not None:
                failed += 1
                print(f"! {result.activity_id}: {result.error}", file=sys.stderr)
            elif result.written:
                written += 1
            else:
                skipped += 1
        if not args.dry_run:
            conn.commit()
    print(f"weather written={written} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
