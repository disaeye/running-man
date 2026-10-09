#!/usr/bin/env python3
"""Restore archived activity_summary rows back to the hot table.

Each call restores one or more activities by ``activity_id``. The restore is
atomic per activity: rows are inserted into ``activity_summary`` then deleted
from ``activity_summary_archive`` inside one transaction. ``--dry-run`` lists
what would move without writing.

Rows that already exist on the hot table are skipped (no overwrite) to keep
the restore idempotent and avoid clobbering re-imported data.
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any

import psycopg

ARCHIVE_TABLE = "activity_summary_archive"
SOURCE_TABLE = "activity_summary"

COLUMNS = (
    "activity_id, athlete_id, start_time, sport, "
    "distance_m, duration_s, avg_hr, max_hr, avg_power, np, "
    "intensity_factor, tss, external_id, source, file_type, raw_data"
)


def env_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.stderr.write("DATABASE_URL is not set\n")
        sys.exit(2)
    return url


def archived_ids(cur: psycopg.Cursor[Any], activity_ids: tuple[str, ...]) -> list[str]:
    cur.execute(
        f"""
        SELECT DISTINCT activity_id
        FROM   {ARCHIVE_TABLE}
        WHERE  activity_id = ANY(%s)
        """,
        (list(activity_ids),),
    )
    return [r[0] for r in cur.fetchall()]


def hot_ids(cur: psycopg.Cursor[Any], activity_ids: tuple[str, ...]) -> set[str]:
    cur.execute(
        f"""
        SELECT DISTINCT activity_id
        FROM   {SOURCE_TABLE}
        WHERE  activity_id = ANY(%s)
        """,
        (list(activity_ids),),
    )
    return {r[0] for r in cur.fetchall()}


def restore_one(cur: psycopg.Cursor[Any], activity_id: str) -> int:
    cur.execute(
        f"""
        WITH moved AS (
            DELETE FROM {ARCHIVE_TABLE}
            WHERE  activity_id = %s
            RETURNING {COLUMNS}
        )
        INSERT INTO {SOURCE_TABLE} ({COLUMNS})
        SELECT {COLUMNS} FROM moved
        ON CONFLICT (activity_id, start_time) DO NOTHING
        """,
        (activity_id,),
    )
    return int(cur.rowcount)


def run(activity_ids: tuple[str, ...], dry_run: bool) -> int:
    if not activity_ids:
        sys.stderr.write("nothing to restore: pass one or more --activity-id\n")
        return 2

    conn = psycopg.connect(env_database_url())
    try:
        with conn.transaction():
            with conn.cursor() as cur:
                ids = set(activity_ids)
                already_hot = hot_ids(cur, tuple(ids))
                if already_hot:
                    print(
                        f"[skip] already on hot table: {sorted(already_hot)}"
                    )
                candidates = sorted(set(activity_ids) - already_hot)
                in_archive = set(archived_ids(cur, tuple(candidates)))
                missing = sorted(set(candidates) - in_archive)
                if missing:
                    print(f"[skip] not in archive: {missing}")

                targets = sorted(set(candidates) & in_archive)
                if not targets:
                    print("[done] nothing to restore")
                    return 0

                print(f"[plan] restore {len(targets)} activity(ies): {targets}")
                if dry_run:
                    print("[dry-run] no writes performed")
                    return 0

                total = 0
                for aid in targets:
                    total += restore_one(cur, aid)
                print(f"[restored] {total} row(s) back to {SOURCE_TABLE}")
                return 0
    finally:
        conn.close()


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--activity-id",
        action="append",
        required=True,
        help="activity_id to restore (repeatable)",
    )
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    return run(tuple(args.activity_id or ()), dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
