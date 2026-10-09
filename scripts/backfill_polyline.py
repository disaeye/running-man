#!/usr/bin/env python3
"""Backfill ``summary_polyline`` for activities that have GPS data but no polyline.

Usage::

    python scripts/backfill_polyline.py              # update all
    python scripts/backfill_polyline.py --dry-run    # preview only
    python scripts/backfill_polyline.py --batch-size=50
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import psycopg

# Make the API source tree importable from the project root so we can reuse
# the polyline encoder without duplicating it.
_api_src = Path(__file__).resolve().parents[1] / "apps" / "api" / "src"
if str(_api_src) not in sys.path:
    sys.path.insert(0, str(_api_src))

from infrastructure.polyline_encoder import encode_polyline, extract_gps_from_raw  # noqa: E402

_DEFAULT_BATCH = 100


def main() -> None:
    args = _parse_args()
    db_url = _database_url()
    dry_run: bool = args.dry_run
    batch_size: int = args.batch_size

    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        total = _count_eligible(cur)
        if total == 0:
            print("No activities to backfill.")
            return

        updated = 0
        errors = 0
        offset = 0

        while offset < total:
            cur.execute(
                """
                SELECT activity_id, athlete_id, start_time, raw_data
                FROM activity_summary
                WHERE has_gps = TRUE AND summary_polyline IS NULL
                ORDER BY start_time DESC
                LIMIT %s OFFSET %s
                """,
                (batch_size, offset),
            )
            rows = cur.fetchall()

            for row in rows:
                activity_id, athlete_id, start_time, raw_data = (
                    row[0], row[1], row[2], row[3],
                )
                polyline = _maybe_encode(raw_data)
                if polyline is None:
                    print(f"  SKIP  {activity_id}  ({start_time}) — no extractable GPS")
                    continue

                if dry_run:
                    print(f"  WOULD UPDATE  {activity_id}  polyline={len(polyline)} chars")
                    updated += 1
                    continue

                try:
                    cur.execute(
                        """
                        UPDATE activity_summary
                        SET summary_polyline = %s
                        WHERE activity_id = %s AND start_time = %s
                        """,
                        (polyline, activity_id, start_time),
                    )
                    updated += 1
                    print(f"  OK    {activity_id}  polyline={len(polyline)} chars")
                except Exception:
                    errors += 1
                    print(f"  FAIL  {activity_id} — update error")
                    conn.rollback()

            if not dry_run:
                conn.commit()
            offset += batch_size

        verb = "Would update" if dry_run else "Updated"
        print(f"\n{verb} {updated} activities, {errors} errors (of {total} eligible)")
        if errors:
            sys.exit(1)


# ------------------------------------------------------------------ helpers


def _maybe_encode(raw_data: Any) -> str | None:
    """Extract GPS from ``raw_data`` JSONB and return a polyline string."""
    if not isinstance(raw_data, dict | str):
        return None
    data: dict[str, object] = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
    points = extract_gps_from_raw(data)
    if not points:
        return None
    return encode_polyline(points)


def _count_eligible(cur: psycopg.Cursor) -> int:
    cur.execute(
        "SELECT count(*) FROM activity_summary "
        "WHERE has_gps = TRUE AND summary_polyline IS NULL"
    )
    row = cur.fetchone()
    return int(row[0]) if row else 0


def _database_url() -> str:
    """Resolve the PostgreSQL connection URL from the API's env file."""
    env_path = Path(__file__).resolve().parents[1] / "apps" / "api" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and "=" in stripped:
                key, value = stripped.split("=", 1)
                os.environ.setdefault(key, value.strip().strip('"').strip("'"))

    raw = os.environ.get("DATABASE_URL", "")
    # psycopg 3 requires the postgresql:// scheme (not postgresql+asyncpg://)
    return raw.replace("postgresql+asyncpg://", "postgresql://", 1)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill summary_polyline from raw GPS data")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview which activities would be updated without writing",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=_DEFAULT_BATCH,
        help=f"Rows per batch (default: {_DEFAULT_BATCH})",
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    main()
