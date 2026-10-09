#!/usr/bin/env python3
# pyright: reportMissingImports=false, reportUnknownVariableType=false, reportUnusedCallResult=false, reportUnknownParameterType=false, reportUnknownMemberType=false, reportExplicitAny=false, reportAny=false, reportUnknownArgumentType=false
from __future__ import annotations

import argparse
import json
import os
import time
from datetime import date
from pathlib import Path
from typing import Any, cast

import psycopg
from psycopg.rows import dict_row
QUERY = """
SELECT day, ctl, atl, tsb, tss
FROM daily_load
WHERE athlete_id = %s AND day BETWEEN %s AND %s
ORDER BY day
"""

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


def percentile(samples: list[float], percent: float) -> float:
    ordered = sorted(samples)
    index = round((len(ordered) - 1) * percent / 100)
    return ordered[index]


def pick_athlete_id(conn: psycopg.Connection[Any], start: date, end: date) -> str:
    query = """
    SELECT athlete_id::text FROM daily_load
    WHERE day BETWEEN %s AND %s
    GROUP BY athlete_id ORDER BY count(*) DESC LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(query, (start, end))
        row = cur.fetchone()
    if row is None:
        raise RuntimeError(f"No daily_load rows between {start} and {end}")
    return cast(str, row["athlete_id"])


def measure(
    conn: psycopg.Connection[Any], athlete_id: str, start: date, end: date, runs: int
) -> list[float]:
    timings_ms: list[float] = []
    with conn.cursor() as cur:
        for _ in range(runs):
            started = time.perf_counter()
            cur.execute(QUERY, (athlete_id, start, end))
            _ = cur.fetchall()
            timings_ms.append((time.perf_counter() - started) * 1000)
    return timings_ms


def main() -> int:
    parser = argparse.ArgumentParser()
    _ = parser.add_argument("--from-date", default="2026-06-01")
    _ = parser.add_argument("--to-date", default="2026-06-30")
    _ = parser.add_argument("--runs", type=int, default=100)
    _ = parser.add_argument("--athlete-id")
    args = parser.parse_args()
    start = date.fromisoformat(args.from_date)
    end = date.fromisoformat(args.to_date)
    with psycopg.connect(database_url(), row_factory=dict_row) as conn:
        athlete_id = args.athlete_id or pick_athlete_id(conn, start, end)
        samples = measure(conn, athlete_id, start, end, args.runs)
    p99_ms = round(percentile(samples, 99), 3)
    stats = {
        "athlete_id": athlete_id,
        "range": [start.isoformat(), end.isoformat()],
        "runs": args.runs,
        "p50_ms": round(percentile(samples, 50), 3),
        "p95_ms": round(percentile(samples, 95), 3),
        "p99_ms": p99_ms,
    }
    print(json.dumps(stats, indent=2))
    if p99_ms >= 2000:
        raise AssertionError(f"PMC P99 too slow: {p99_ms}ms >= 2000ms")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
