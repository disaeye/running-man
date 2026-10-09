from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.no_db

ROOT = Path(__file__).resolve().parents[3]
CHECKER = ROOT / "scripts" / "check_generated_data_contract.py"
GENERATOR = ROOT / "scripts" / "generate_data_contract.py"


def test_generator_produces_clean_checked_in_registries() -> None:
    result = subprocess.run(
        [sys.executable, str(GENERATOR), "contracts/v1", "--json"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert len(payload["files"]) == 13


def test_checker_accepts_generated_canonical_registries() -> None:
    result = subprocess.run(
        [sys.executable, str(CHECKER), "--json"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload == {"diagnostics": [], "ok": True}


def test_checker_names_generated_unit_mismatch_in_negative_fixture() -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(CHECKER),
            "--fixture",
            "contracts/fixtures/generated-unit-drift",
            "--json",
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["diagnostics"] == [
        {
            "code": "generated_unit_mismatch",
            "message": "generated unit mismatch for distance_m: expected km",
            "path": "metrics.distance_m.storage_unit",
        }
    ]
