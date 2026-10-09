from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _module() -> object:
    path = Path(__file__).parents[3] / "scripts" / "check_layer_boundaries.py"
    spec = importlib.util.spec_from_file_location("check_layer_boundaries", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_scan_reports_sql_and_execute_for_violation_fixture() -> None:
    module = _module()
    root = Path(__file__).parents[3] / "scripts" / "fixtures" / "layer-boundary-violation"

    violations = module.scan(root)

    assert [(violation.line, violation.rule_id) for violation in violations] == [
        (2, "presentation-sql"),
        (3, "presentation-execute"),
    ]
