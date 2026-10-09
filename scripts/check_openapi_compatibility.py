#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path

from openapi_operation_compatibility import operation_differences
from openapi_schema_compatibility import Diagnostic, Document, Json, mapping


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reject breaking OpenAPI response changes.")
    parser.add_argument("candidate", type=Path)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("--json", action="store_true", dest="json_output")
    return parser.parse_args()


def load_document(path: Path) -> Document:
    loaded = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(loaded, dict):
        raise ValueError(f"{path} is not an OpenAPI object")
    return loaded


def verify(candidate: Document, baseline: Document) -> dict[str, Json]:
    candidate_paths = mapping(candidate.get("paths"))
    baseline_paths = mapping(baseline.get("paths"))
    if candidate_paths is None or baseline_paths is None:
        raise ValueError("OpenAPI documents require paths")
    diagnostics: list[Diagnostic] = []
    for path, baseline_item in sorted(baseline_paths.items()):
        baseline_item_map = mapping(baseline_item)
        candidate_item = mapping(candidate_paths.get(path))
        if baseline_item_map is None or candidate_item is None:
            diagnostics.append(
                Diagnostic(path, "", "", "", "missing_path", "", "baseline path was removed")
            )
            continue
        for method, baseline_operation in sorted(baseline_item_map.items()):
            baseline_operation_map = mapping(baseline_operation)
            candidate_operation = mapping(candidate_item.get(method))
            if baseline_operation_map is None or candidate_operation is None:
                diagnostics.append(
                    Diagnostic(
                        path,
                        method,
                        "",
                        "",
                        "missing_method",
                        "",
                        "baseline method was removed",
                    )
                )
                continue
            diagnostics.extend(
                operation_differences(
                    path,
                    method,
                    baseline_operation_map,
                    candidate_operation,
                    baseline,
                    candidate,
                )
            )
    diagnostics.sort(
        key=lambda item: (
            item.path,
            item.method,
            item.status,
            item.content_type,
            item.code,
            item.schema_path,
        )
    )
    return {"ok": not diagnostics, "diagnostics": [asdict(item) for item in diagnostics]}


def main() -> int:
    arguments = parse_args()
    report = verify(load_document(arguments.candidate), load_document(arguments.baseline))
    if arguments.json_output:
        print(json.dumps(report, ensure_ascii=True, sort_keys=True))
    else:
        print("ok" if report["ok"] else "failed")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
