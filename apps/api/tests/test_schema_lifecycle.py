from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.no_db

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "verify_schema_lifecycle.py"


def run_script(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def test_fixture_clean_schema_lifecycle_reports_ok() -> None:
    result = run_script("--database-url", "fixture://schema-lifecycle-ok", "--json")
    assert result.returncode == 0
    assert json.loads(result.stdout) == {"diagnostics": [], "ok": True}


def test_fixture_corrupt_seed_blocks_lifecycle() -> None:
    result = run_script("--database-url", "fixture://schema-lifecycle-corrupt-seed", "--json")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["diagnostics"] == [
        {
            "actual": "18",
            "code": "seed_count_mismatch",
            "expected": "19",
            "message": "seed count mismatch",
            "path": "tables.metric_definitions",
        }
    ]


def test_fixture_omitted_migration_blocks_lifecycle() -> None:
    result = run_script("--database-url", "fixture://schema-lifecycle-omitted-migration", "--json")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["diagnostics"][0]["code"] == "omitted_migration"
    assert payload["diagnostics"][0]["path"] == "alembic.head"
