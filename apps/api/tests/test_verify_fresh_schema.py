from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.no_db

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "verify_fresh_schema.py"


def run_script(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def test_fixture_clean_schema_reports_ok() -> None:
    result = run_script("--database-url", "fixture://fresh-schema-ok", "--json")
    assert result.returncode == 0
    assert json.loads(result.stdout) == {"diagnostics": [], "ok": True}


def test_fixture_drift_names_omitted_migration_and_manual_column() -> None:
    result = run_script("--database-url", "fixture://schema-drift", "--json")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert {item["code"] for item in payload["diagnostics"]} == {
        "manual_column_drift",
        "omitted_migration",
    }
    assert {item["path"] for item in payload["diagnostics"]} == {
        "alembic.head",
        "tables.activity_summary.columns.manual_debug",
    }


def test_missing_database_url_returns_structured_error() -> None:
    result = run_script("--json")
    payload = json.loads(result.stdout)
    assert result.returncode == 2
    assert payload["diagnostics"][0]["code"] == "database_url_missing"
