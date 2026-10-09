#!/usr/bin/env python3
# pyright: reportMissingImports=false, reportUnknownVariableType=false, reportUnusedCallResult=false, reportUnknownParameterType=false, reportUnknownMemberType=false, reportExplicitAny=false, reportAny=false, reportUnknownArgumentType=false
from __future__ import annotations

import argparse
import json
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Any, cast

import httpx
import psycopg
from psycopg.rows import dict_row
API_BASE = "https://intervals.icu/api/v1"
METRICS = ("ctl", "atl", "tsb")

def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key, value = stripped.split("=", 1)
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def database_url() -> str:
    load_dotenv(Path("apps/api/.env"))
    return os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://", 1)


def row_day(row: dict[str, Any]) -> date | None:
    raw_day = row.get("date") or row.get("day")
    return None if raw_day is None else date.fromisoformat(str(raw_day)[:10])


def metric(row: dict[str, Any], *keys: str) -> float:
    for key in keys:
        raw_value = row.get(key)
        if raw_value is not None:
            return float(raw_value)
    return 0.0


def fetch_fitness(icu_athlete_id: str, start: date, end: date) -> dict[date, dict[str, float]]:
    params = {"oldest": start.isoformat(), "newest": end.isoformat()}
    auth = ("API_KEY", os.environ["INTERVALS_ICU_API_KEY"])
    with httpx.Client(auth=auth, timeout=30) as client:
        response = client.get(f"{API_BASE}/athlete/{icu_athlete_id}/fitness", params=params)
        response.raise_for_status()
        rows = cast(list[dict[str, Any]], response.json())
    fitness_rows: dict[date, dict[str, float]] = {}
    for row in rows:
        day = row_day(row)
        if day is not None:
            fitness_rows[day] = {
                "ctl": metric(row, "ctl", "fitness"),
                "atl": metric(row, "atl", "fatigue"),
                "tsb": metric(row, "tsb", "form"),
            }
    return fitness_rows


def local_load(athlete_id: str, start: date, end: date) -> dict[date, dict[str, float]]:
    query = """
    SELECT day, ctl, atl, tsb FROM daily_load
    WHERE athlete_id = %s AND day BETWEEN %s AND %s ORDER BY day
    """
    with psycopg.connect(database_url(), row_factory=dict_row) as conn, conn.cursor() as cur:
        cur.execute(query, (athlete_id, start, end))
        rows = cur.fetchall()
    return {cast(date, row["day"]): {name: float(row[name]) for name in METRICS} for row in rows}


def max_deltas(local_rows: dict[date, dict[str, float]], icu_rows: dict[date, dict[str, float]]) -> dict[str, float]:
    days = sorted(set(local_rows) & set(icu_rows))
    if not days:
        raise RuntimeError("No overlapping daily_load and Intervals.icu fitness days")
    return {name: round(max(abs(local_rows[day][name] - icu_rows[day][name]) for day in days), 3) for name in METRICS}


def main() -> int:
    load_dotenv(Path("apps/api/.env"))
    parser = argparse.ArgumentParser()
    _ = parser.add_argument("--athlete-id", required=True, help="local athletes.id UUID")
    _ = parser.add_argument("--icu-athlete-id", default=os.environ.get("INTERVALS_ICU_ATHLETE_ID", "0"))
    _ = parser.add_argument("--days", type=int, default=90)
    args = parser.parse_args()
    end = date.today()
    start = end - timedelta(days=args.days - 1)
    local_rows = local_load(str(args.athlete_id), start, end)
    icu_rows = fetch_fitness(str(args.icu_athlete_id), start, end)
    summary = {"range": [start.isoformat(), end.isoformat()], "max_abs_delta": max_deltas(local_rows, icu_rows)}
    print(json.dumps(summary, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
