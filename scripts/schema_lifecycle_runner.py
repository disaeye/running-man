"""Alembic-backed schema lifecycle runner.

Replaces the previous fake-alembic executor. Migrations are now applied by
the real Alembic binary against a target ``DATABASE_URL`` (passed through the
process environment; ``alembic/env.py`` prefers it over the project ``.env``),
so the executed revision set always matches ``alembic upgrade head`` exactly —
including branches and merges the old single-chain walker silently skipped.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Final

import psycopg
from psycopg import sql as pgsql

ROOT: Final = Path(__file__).resolve().parents[1]
API_DIR: Final = ROOT / "apps" / "api"
DISPOSABLE_RE: Final = re.compile(r"^(rm_|todo12_|test_).*schema.*")

# The head migration is a no-op merge; the previous meaningful revision is the
# one whose reversibility is exercised (the runner used to reverse the head,
# which at that time was the local-day-bucketing rewrite).
REVERSIBILITY_ANCESTOR: Final = "f2a1b2c3d4e5"


def _alembic(database_url: str, *args: str) -> None:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=str(API_DIR),
        env={**os.environ, "DATABASE_URL": database_url},
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(
            f"alembic {' '.join(args)} failed (exit {result.returncode}):\n"
            f"stdout={result.stdout}\nstderr={result.stderr}"
        )


def create_fresh_database(admin_url: str, database_name: str) -> str:
    if not admin_url or not DISPOSABLE_RE.fullmatch(database_name):
        raise SystemExit("fresh lifecycle database name must be disposable")
    database_url = database_url_for_name(admin_url, database_name)
    with psycopg.connect(admin_url, autocommit=True) as connection:
        with connection.cursor() as cur:
            cur.execute(
                pgsql.SQL("DROP DATABASE IF EXISTS {}").format(pgsql.Identifier(database_name))
            )
            cur.execute(
                pgsql.SQL("CREATE DATABASE {}").format(pgsql.Identifier(database_name))
            )
    _alembic(database_url, "upgrade", "head")
    return database_url


def exercise_reversibility(database_url: str) -> None:
    """Exercise the head migration's downgrade and re-apply it.

    Downgrades to the head's parent (reversing the head migration), then runs
    ``upgrade head`` again so the database ends back at head. A missing or
    broken downgrade/upgrade in the head migration fails loudly.
    """
    _alembic(database_url, "downgrade", REVERSIBILITY_ANCESTOR)
    _alembic(database_url, "upgrade", "head")


def database_url_for_name(admin_url: str, database_name: str) -> str:
    from urllib.parse import urlsplit, urlunsplit

    parts = urlsplit(admin_url)
    return urlunsplit((parts.scheme, parts.netloc, f"/{database_name}", parts.query, parts.fragment))
