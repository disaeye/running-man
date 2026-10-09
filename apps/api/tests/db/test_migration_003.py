"""Sync provenance schema at head.

Migration 003 (sync provenance tables) was neutralized to a no-op marker:
its definitions were superseded by the canonical absorb migration
(``e9f0a1b2c3d4``) plus the completion migration (``e3f4a5b6c7d8``). These
tests verify the *final* head schema the application actually reads and
writes, plus that ``alembic upgrade head`` runs cleanly and idempotently.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import psycopg

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _table_exists(cursor: psycopg.Cursor, table_name: str) -> bool:
    cursor.execute(
        "SELECT EXISTS ("
        "  SELECT 1 FROM information_schema.tables"
        "  WHERE table_name = %s"
        "    AND table_schema = 'public'"
        ")",
        (table_name,),
    )
    return bool(cursor.fetchone()[0])


def _index_exists(cursor: psycopg.Cursor, index_name: str) -> bool:
    cursor.execute(
        "SELECT EXISTS ("
        "  SELECT 1 FROM pg_indexes"
        "  WHERE indexname = %s"
        "    AND schemaname = 'public'"
        ")",
        (index_name,),
    )
    return bool(cursor.fetchone()[0])


def _constraint_exists(cursor: psycopg.Cursor, constraint_name: str) -> bool:
    cursor.execute(
        "SELECT EXISTS ("
        "  SELECT 1 FROM pg_constraint"
        "  WHERE conname = %s AND connamespace = 'public'::regnamespace"
        ")",
        (constraint_name,),
    )
    return bool(cursor.fetchone()[0])


def _alembic(*args: str) -> subprocess.CompletedProcess:
    """Run the project's alembic binary with the given subcommand."""
    api_dir = Path(__file__).resolve().parents[2]
    venv_alembic = api_dir / ".venv" / "bin" / "alembic"
    alembic_bin = str(venv_alembic) if venv_alembic.exists() else shutil.which("alembic") or "alembic"
    env = {**os.environ}
    # Force a clean PYTHONPATH so alembic finds apps/api/src.
    return subprocess.run(
        [alembic_bin, *args],
        cwd=str(api_dir),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestHeadUpgrade:
    """``alembic upgrade head`` applies the full graph cleanly."""

    def test_alembic_upgrade_head_succeeds(self) -> None:
        result = _alembic("upgrade", "head")
        assert result.returncode == 0, (
            f"alembic upgrade head failed:\nstdout={result.stdout}\nstderr={result.stderr}"
        )

    def test_upgrade_head_is_idempotent(self) -> None:
        first = _alembic("upgrade", "head")
        assert first.returncode == 0, (
            f"alembic upgrade head (first) failed:\n"
            f"stdout={first.stdout}\nstderr={first.stderr}"
        )
        second = _alembic("upgrade", "head")
        assert second.returncode == 0, (
            f"alembic upgrade head (second) failed:\n"
            f"stdout={second.stdout}\nstderr={second.stderr}"
        )


class TestSyncProvenanceSchema:
    """The head schema carries the canonical sync provenance definition."""

    def test_sync_tables_exist(self, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            for table in (
                "integration_sync_runs",
                "integration_sync_errors",
                "source_records",
            ):
                assert _table_exists(cur, table), f"{table} should exist at head"

    def test_status_check_constraints(self, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            assert _constraint_exists(cur, "ck_integration_sync_runs_status")
            assert _constraint_exists(cur, "ck_source_records_status")

    def test_source_definition_fks(self, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            for table in (
                "integration_sync_runs",
                "integration_sync_errors",
                "source_records",
            ):
                cur.execute(
                    """
                    SELECT EXISTS (
                        SELECT 1 FROM pg_constraint
                        WHERE conname = %s
                          AND connamespace = 'public'::regnamespace
                          AND confrelid = 'source_definitions'::regclass
                    )
                    """,
                    (f"fk_{table}_source_definition",),
                )
                assert cur.fetchone()[0], f"{table} should reference source_definitions"

    def test_source_records_dedup_key(self, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            assert _index_exists(cur, "uq_source_records_dedup")

    def test_legacy_indexes_present(self, db_conn: psycopg.Connection) -> None:
        with db_conn.cursor() as cur:
            for idx in (
                "idx_isr_athlete_started",
                "idx_ise_sync_run",
                "idx_sr_athlete_entity",
            ):
                assert _index_exists(cur, idx), f"Index {idx} should exist at head"
