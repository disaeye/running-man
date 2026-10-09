#!/usr/bin/env python3
"""Cold-archive activity_summary rows older than a cutoff (default 1 year).

Despite the historical filename, this script operates on the *summary* level
(not 1Hz activity_streams) — raw streams are too large to ship off the hot
table and are managed via partition DETACH instead.

Two-phase workflow (copy-verify-delete):
  * default run : INSERT rows older than cutoff into the archive.
                  Idempotent (ON CONFLICT DO NOTHING). Source rows stay.
  * --commit    : DELETE the now-archived rows from the source. Only rows
                  confirmed present in BOTH the archive and the source are
                  deleted, so the delete is provably safe.

--dry-run prints the plan without writing.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
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


def candidate_count(cur: psycopg.Cursor[Any], cutoff: datetime) -> int:
    cur.execute(
        f"SELECT count(*) FROM {SOURCE_TABLE} WHERE start_time < %s",
        (cutoff,),
    )
    row = cur.fetchone()
    return int(row[0]) if row else 0


def archive_copy(cur: psycopg.Cursor[Any], cutoff: datetime) -> int:
    cur.execute(
        f"""
        INSERT INTO {ARCHIVE_TABLE} (archived_at, {COLUMNS})
        SELECT now(), {COLUMNS}
        FROM   {SOURCE_TABLE}
        WHERE  start_time < %s
        ON CONFLICT (activity_id, start_time) DO NOTHING
        """,
        (cutoff,),
    )
    return int(cur.rowcount)


def count_unsafe_to_delete(cur: psycopg.Cursor[Any], cutoff: datetime) -> int:
    """Rows old enough to archive but NOT yet present in the archive."""
    cur.execute(
        f"""
        SELECT count(*)
        FROM   {SOURCE_TABLE} s
        WHERE  s.start_time < %s
          AND NOT EXISTS (
              SELECT 1 FROM {ARCHIVE_TABLE} a
              WHERE  a.activity_id = s.activity_id
                AND  a.start_time  = s.start_time
          )
        """,
        (cutoff,),
    )
    row = cur.fetchone()
    return int(row[0]) if row else 0


def archive_count(cur: psycopg.Cursor[Any], cutoff: datetime) -> int:
    cur.execute(
        f"SELECT count(*) FROM {ARCHIVE_TABLE} WHERE start_time < %s",
        (cutoff,),
    )
    row = cur.fetchone()
    return int(row[0]) if row else 0


def delete_archived(cur: psycopg.Cursor[Any], cutoff: datetime) -> int:
    cur.execute(
        f"""
        DELETE FROM {SOURCE_TABLE} s
        WHERE  s.start_time < %s
          AND EXISTS (
              SELECT 1 FROM {ARCHIVE_TABLE} a
              WHERE  a.activity_id = s.activity_id
                AND  a.start_time  = s.start_time
          )
        """,
        (cutoff,),
    )
    return int(cur.rowcount)


def run(dry_run: bool, commit: bool, cutoff: datetime) -> int:
    conn = psycopg.connect(env_database_url())
    try:
        with conn.transaction():
            with conn.cursor() as cur:
                candidates = candidate_count(cur, cutoff)
                unsafe = count_unsafe_to_delete(cur, cutoff)

                print(
                    f"[plan] {candidates} rows older than {cutoff.date()} (UTC); "
                    f"{unsafe} not yet in archive"
                )
                if dry_run:
                    print("[dry-run] no writes performed")
                    return 0

                if commit:
                    if unsafe > 0:
                        raise RuntimeError(
                            f"refusing --commit: {unsafe} source row(s) are not "
                            "yet in archive — run without --commit first"
                        )
                    deleted = delete_archived(cur, cutoff)
                    print(f"[deleted] {deleted} archived rows from {SOURCE_TABLE}")
                    return 0

                copied = archive_copy(cur, cutoff)
                print(
                    f"[copied] {copied} new row(s) -> {ARCHIVE_TABLE} "
                    "(source NOT deleted; rerun with --commit to delete)"
                )
                return 0
    finally:
        conn.close()


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--cutoff-days",
        type=int,
        default=365,
        help="Archive rows older than N days (default: 365)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the plan without writing or deleting anything",
    )
    p.add_argument(
        "--commit",
        action="store_true",
        help=(
            "Atomic copy+delete in one transaction. Without this flag the "
            "script copies into the archive but does NOT delete the source "
            "rows — re-run with --commit once the archive looks correct."
        ),
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    cutoff = datetime.now(timezone.utc) - timedelta(days=args.cutoff_days)
    return run(
        dry_run=args.dry_run,
        commit=args.commit,
        cutoff=cutoff,
    )


if __name__ == "__main__":
    sys.exit(main())
