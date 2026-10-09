from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = API_ROOT.parents[1]
CHECKER = REPO_ROOT / "scripts" / "check_response_models.py"
EXPORTER = REPO_ROOT / "scripts" / "export_openapi.py"
COMPATIBILITY_CHECKER = REPO_ROOT / "scripts" / "check_openapi_compatibility.py"
BASELINE = REPO_ROOT / "contracts" / "v1" / "openapi.json"
REMOVAL_FIXTURE = REPO_ROOT / "contracts" / "fixtures" / "openapi-field-removal.json"

pytestmark = pytest.mark.no_db


def test_response_model_gate_accepts_version_one_app() -> None:
    completed = _run(CHECKER, "--app", "main:app", "--json")

    report = json.loads(completed.stdout)

    assert completed.returncode == 0
    assert report["ok"] is True
    assert report["diagnostics"] == []
    assert report["summary"]["operations"] > 0


def test_response_model_gate_rejects_incomplete_fixture() -> None:
    completed = _run(CHECKER, "--app", "tests.fixtures.incomplete_openapi:app", "--json")

    report = json.loads(completed.stdout)
    codes = {diagnostic["code"] for diagnostic in report["diagnostics"]}

    assert completed.returncode == 1
    assert {"draft_path", "duplicate_operation_id", "missing_success_content"} <= codes


@pytest.mark.parametrize(
    ("app_path", "expected_codes"),
    [
        ("tests.fixtures.adversarial_openapi:typed_map_app", {"generic_map_schema"}),
        (
            "tests.fixtures.adversarial_openapi:download_placeholder_app",
            {"empty_object_schema", "unapproved_json_download"},
        ),
        ("tests.fixtures.adversarial_openapi:empty_array_app", {"bare_array_items"}),
        ("tests.fixtures.adversarial_openapi:empty_component_app", {"empty_schema"}),
        ("tests.fixtures.adversarial_openapi:title_only_app", {"non_concrete_schema"}),
        ("tests.fixtures.adversarial_openapi:title_item_app", {"non_concrete_schema"}),
        (
            "tests.fixtures.adversarial_openapi:empty_download_schema_app",
            {"empty_schema"},
        ),
        (
            "tests.fixtures.adversarial_openapi:empty_composition_app",
            {"empty_combiner_schema", "empty_enum_schema", "empty_prefix_items_schema"},
        ),
        (
            "tests.fixtures.adversarial_openapi:ref_sibling_app",
            {
                "empty_combiner_schema",
                "empty_enum_schema",
                "empty_object_schema",
                "empty_prefix_items_schema",
            },
        ),
        ("tests.fixtures.adversarial_openapi:reset_content_app", {"missing_success_content"}),
        (
            "tests.fixtures.adversarial_openapi:unapproved_no_content_app",
            {"unapproved_no_content"},
        ),
        (
            "tests.fixtures.adversarial_openapi:unused_empty_component_app",
            {"empty_schema"},
        ),
        ("tests.fixtures.adversarial_openapi:map_schema_app", {"generic_map_schema"}),
        ("tests.fixtures.adversarial_openapi:no_content_body_app", {"no_content_body"}),
        (
            "tests.fixtures.adversarial_openapi:invalid_reference_app",
            {"invalid_ref", "unresolved_ref", "recursive_ref"},
        ),
        (
            "tests.fixtures.top_level_json_document_openapi:top_level_json_document_app",
            {"generic_map_schema"},
        ),
        (
            "tests.fixtures.top_level_json_document_openapi:invalid_keyword_app",
            {"unsupported_schema_keyword", "invalid_schema_value"},
        ),
    ],
)
def test_response_model_gate_rejects_adversarial_success_schemas(
    app_path: str, expected_codes: set[str]
) -> None:
    completed = _run(CHECKER, "--app", app_path, "--json")

    report = json.loads(completed.stdout)
    codes = {diagnostic["code"] for diagnostic in report["diagnostics"]}

    assert completed.returncode == 1
    assert expected_codes <= codes


def test_baseline_uses_concrete_recursive_json_schema() -> None:
    document = json.loads(BASELINE.read_text(encoding="utf-8"))
    schemas = document["components"]["schemas"]

    assert "JsonValue" not in schemas
    assert schemas["JsonDocument"] != {}


def test_reference_with_default_annotation_is_valid() -> None:
    completed = _run(
        CHECKER,
        "--app",
        "tests.fixtures.top_level_json_document_openapi:reference_default_app",
        "--json",
    )

    assert completed.returncode == 0


def test_exporter_is_deterministic_and_checks_existing_output(tmp_path: Path) -> None:
    output = tmp_path / "openapi.json"

    first = _run(EXPORTER, "--app", "main:app", "--output", str(output))
    first_contents = output.read_bytes()
    second = _run(EXPORTER, "--app", "main:app", "--output", str(output))
    checked = _run(EXPORTER, "--app", "main:app", "--check", str(output))

    assert first.returncode == 0
    assert second.returncode == 0
    assert checked.returncode == 0
    assert output.read_bytes() == first_contents
    assert first_contents.endswith(b"\n")


def test_compatibility_checker_rejects_removed_response_property() -> None:
    completed = _run(COMPATIBILITY_CHECKER, str(REMOVAL_FIXTURE), str(BASELINE), "--json")

    report = json.loads(completed.stdout)

    assert completed.returncode == 1
    assert "removed_property" in {diagnostic["code"] for diagnostic in report["diagnostics"]}


def _run(script: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(script), *arguments],
        cwd=API_ROOT,
        check=False,
        text=True,
        capture_output=True,
    )
