from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.no_db

ROOT = Path(__file__).resolve().parents[3]
VALIDATOR = ROOT / "scripts" / "validate_data_contract.py"


def _validate(path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(VALIDATOR), str(path), "--json"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )


def test_validate_data_contract_accepts_canonical_v1() -> None:
    result = _validate(ROOT / "contracts" / "v1")
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload["ok"] is True
    # ``detected_ftp`` is gone: power/FTP is not part of this running product,
    # so the FTP-detection algorithm and its 90-day window were removed.
    assert payload["input_window_days"] == {
        "hr_max": 730,
        "lthr": 365,
        "threshold_pace": 365,
    }


def test_validate_data_contract_rejects_invalid_semantics_with_exact_paths() -> None:
    result = _validate(ROOT / "contracts" / "fixtures" / "invalid-semantics")
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    assert payload["ok"] is False
    assert {diagnostic["path"] for diagnostic in payload["diagnostics"]} >= {
        "metrics.distance_m.storage_unit",
        "metrics.missing_display_unit.display_unit",
        "metrics.missing_storage_unit.storage_unit",
        "metrics.missing_range.legal_range",
        "metrics.duplicate_distance.display_name",
        "sources.intervals.icu",
        "algorithms.activity_load.input_window_days",
    }


def test_validate_data_contract_covers_each_documented_omh_stream_key_once() -> None:
    result = _validate(ROOT / "contracts" / "v1")
    payload = json.loads(result.stdout)
    assert result.returncode == 0
    assert payload["omh_stream_coverage"] == {
        "documented": 12,
        "contract_entries": 12,
        "missing": [],
        "duplicates": [],
    }
