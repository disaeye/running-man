from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.no_db

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "maintain_database.py"


def run_script(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def test_partitions_plan_reports_future_months_without_database_writes() -> None:
    result = run_script(
        "partitions",
        "--database-url",
        "postgresql://unused@example.invalid/db",
        "--months-ahead",
        "24",
        "--from-month",
        "2026-07-01",
        "--dry-run",
        "--json",
    )
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload["status"] == "ok"
    assert payload["dry_run"] is True
    assert payload["changes"] == 72
    assert payload["health"]["months_ahead"] == 24


def test_partition_hash_reports_stable_dry_run_catalog_hash() -> None:
    first = run_script(
        "partition-hash",
        "--database-url",
        "postgresql://unused@example.invalid/db",
        "--months-ahead",
        "24",
        "--from-month",
        "2026-07-01",
        "--dry-run",
        "--json",
    )
    second = run_script(
        "partition-hash",
        "--database-url",
        "postgresql://unused@example.invalid/db",
        "--months-ahead",
        "24",
        "--from-month",
        "2026-07-01",
        "--dry-run",
        "--json",
    )
    first_payload = json.loads(first.stdout)
    second_payload = json.loads(second.stdout)
    assert first.returncode == 0
    assert second.returncode == 0
    assert first_payload["catalog_hash"] == second_payload["catalog_hash"]
    assert first_payload["objects"] == second_payload["objects"]


def test_stale_audit_outputs_json_hook_without_writes() -> None:
    result = run_script(
        "stale-audit",
        "--database-url",
        "postgresql://unused@example.invalid/db",
        "--dry-run",
        "--json",
    )
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload == {
        "audits": [],
        "dry_run": True,
        "status": "ok",
        "writes": 0,
    }


def test_stale_recompute_dry_run_reports_json_hook_without_writes() -> None:
    result = run_script(
        "stale-recompute",
        "--database-url",
        "postgresql://unused@example.invalid/db",
        "--dry-run",
        "--json",
    )
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload == {"athlete_ids": [], "dry_run": True, "status": "ok", "writes": 0}


def test_missing_database_url_returns_structured_error() -> None:
    result = run_script("partitions", "--json")
    payload = json.loads(result.stdout)
    assert result.returncode == 2
    assert payload["error"] == "missing_database_url"


def test_pg_cron_cleanup_no_ops_when_extension_is_absent() -> None:
    result = run_script(
        "cleanup-pg-cron",
        "--database-url",
        "postgresql://unused@example.invalid/db",
        "--dry-run",
        "--json",
    )
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload == {
        "dry_run": True,
        "extension_present": False,
        "jobs_removed": 0,
        "status": "ok",
    }
