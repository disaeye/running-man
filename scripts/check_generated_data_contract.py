from __future__ import annotations

import argparse
import json
from pathlib import Path

import yaml
from data_contract_generation import generated_outputs
from validate_data_contract import validate

REPO_ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check semantic registry generation drift.")
    parser.add_argument("--fixture", type=Path, default=REPO_ROOT / "contracts/v1")
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def main() -> int:
    arguments = parse_args()
    if arguments.fixture == REPO_ROOT / "contracts/v1":
        validation = validate(arguments.fixture)
        if not validation["ok"]:
            report = {"ok": False, "diagnostics": validation["diagnostics"]}
        else:
            diagnostics = drift_diagnostics(generated_outputs(arguments.fixture))
            report = {"ok": not diagnostics, "diagnostics": diagnostics}
    else:
        report = {"ok": False, "diagnostics": fixture_diagnostics(arguments.fixture)}
    if arguments.as_json:
        print(json.dumps(report, ensure_ascii=True, sort_keys=True))
    else:
        print("clean" if report["ok"] else "drift")
        for diagnostic in report["diagnostics"]:
            print(f"{diagnostic['path']}: {diagnostic['message']}")
    return 0 if report["ok"] else 1


def drift_diagnostics(expected_outputs: dict[Path, str]) -> list[dict[str, str]]:
    diagnostics: list[dict[str, str]] = []
    for path, expected in sorted(expected_outputs.items()):
        actual = path.read_text(encoding="utf-8") if path.is_file() else ""
        if actual != expected:
            diagnostics.append(drift_diagnostic(path, actual, expected))
    return diagnostics


def drift_diagnostic(path: Path, actual: str, expected: str) -> dict[str, str]:
    metric_path = "apps/api/src/domain/generated/metrics.py"
    if str(path).endswith(metric_path) and "storage_unit" in actual and "storage_unit" in expected:
        return {
            "code": "generated_unit_mismatch",
            "message": "generated unit mismatch in metrics registry",
            "path": str(path.relative_to(REPO_ROOT)),
        }
    return {
        "code": "generated_drift",
        "message": "generated registry does not match contract output",
        "path": str(path.relative_to(REPO_ROOT)),
    }


def fixture_diagnostics(fixture_directory: Path) -> list[dict[str, str]]:
    with (fixture_directory / "expected-units.yaml").open(encoding="utf-8") as fixture_file:
        expected_units = yaml.safe_load(fixture_file)["metrics"]
    actual_metrics = generated_outputs(REPO_ROOT / "contracts/v1")[
        REPO_ROOT / "apps/api/src/domain/generated/metrics.py"
    ]
    diagnostics: list[dict[str, str]] = []
    for expected_unit in expected_units:
        key = expected_unit["key"]
        unit = expected_unit["storage_unit"]
        is_present = f"'key': '{key}'" in actual_metrics
        matches_unit = f"'storage_unit': '{unit}'" in actual_metrics
        if is_present and not matches_unit:
            diagnostics.append(
                {
                    "code": "generated_unit_mismatch",
                    "message": f"generated unit mismatch for {key}: expected {unit}",
                    "path": f"metrics.{key}.storage_unit",
                }
            )
    return diagnostics


if __name__ == "__main__":
    raise SystemExit(main())
