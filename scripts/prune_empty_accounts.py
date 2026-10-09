#!/usr/bin/env python3
"""Remove accounts that hold no data, keeping the athletes that matter.

Test and QA runs leave accounts behind: registration flows, visual-check
logins, and per-task fixtures each create one. They are harmless individually
but they clutter the athlete list and make "how many users does this have?"
unanswerable — this database held eleven with zero rows anywhere, against one
real athlete with all the training data.

An account is only removed when it owns nothing at all: no activities, no
wellness, no goals, no integrations, no derived facts. That is deliberately
conservative — a real athlete who registered and never synced looks identical,
so the command is dry-run by default and reports what it would remove.

Usage:
    python3 scripts/prune_empty_accounts.py                # report only
    python3 scripts/prune_empty_accounts.py --apply        # actually delete
    python3 scripts/prune_empty_accounts.py --keep admin@running.man --apply
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]

# The API's virtualenv owns psycopg; this script is run with the system Python
# from the repository root, so make that environment importable rather than
# requiring callers to remember which interpreter to use.
_API_SITE_PACKAGES: Final = sorted(
    (ROOT / "apps" / "api" / ".venv" / "lib").glob("python*/site-packages")
)
for _path in _API_SITE_PACKAGES:
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

# Tables that indicate an account has been used for something. Checked with a
# COUNT per athlete; a single non-zero row keeps the account.
OWNERSHIP_TABLES: Final = (
    "activity_summary",
    "health_wellness",
    "goals",
    "user_integrations",
    "derived_metric_facts",
    "computation_runs",
    "notifications",
    "workout_templates",
    "gear_shoes",
)


@dataclass(frozen=True, slots=True)
class Candidate:
    athlete_id: str
    email: str
    created_at: str


def _database_url(explicit: str | None) -> str:
    if explicit:
        return explicit
    env_file = ROOT / "apps" / "api" / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip("'\"")
    raise SystemExit("DATABASE_URL not found; pass --database-url")


def find_empty_accounts(connection: object, keep: set[str]) -> list[Candidate]:
    import psycopg

    inner = "\n          UNION ALL\n".join(
        f"          SELECT athlete_id FROM {table}" for table in OWNERSHIP_TABLES
    )
    query = f"""
    SELECT a.id::text, a.email, a.created_at::text
    FROM athletes AS a
    WHERE NOT EXISTS (
        SELECT 1 FROM (
{inner}
        ) AS owned
        WHERE owned.athlete_id = a.id
    )
    ORDER BY a.created_at, a.email
    """
    with connection.cursor() as cur:  # type: ignore[attr-defined]
        _ = cur.execute(query)
        rows = cur.fetchall()
    return [
        Candidate(athlete_id=row[0], email=row[1], created_at=row[2])
        for row in rows
        if row[1] not in keep
    ]


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="delete instead of reporting")
    parser.add_argument(
        "--keep",
        action="append",
        default=[],
        metavar="EMAIL",
        help="never remove this email (repeatable)",
    )
    parser.add_argument("--database-url", default=None)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    import psycopg

    args = _parse_args(argv)
    keep = set(args.keep)
    url = _database_url(args.database_url)

    with psycopg.connect(url) as connection:
        candidates = find_empty_accounts(connection, keep)
        if not candidates:
            print("no empty accounts")
            return 0

        print(f"{len(candidates)} account(s) own no data:")
        for candidate in candidates:
            print(f"  {candidate.email}  (created {candidate.created_at})")

        if not args.apply:
            print("\ndry run — re-run with --apply to delete")
            return 0

        ids = [candidate.athlete_id for candidate in candidates]
        with connection.cursor() as cur:
            _ = cur.execute("DELETE FROM athletes WHERE id = ANY(%s::uuid[])", (ids,))
        connection.commit()
        print(f"\ndeleted {len(ids)} account(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
