#!/usr/bin/env python3
# ruff: noqa: C901, E501, PLR0912, PLR0915
from __future__ import annotations

import argparse
import importlib
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Final

from fastapi import FastAPI
from openapi_response_exceptions import (
    APPROVED_COMPONENT_MAP_SCHEMA_PATHS,
    APPROVED_EMPTY_SUCCESS_RESPONSES,
    APPROVED_GENERIC_COMPONENT_PATHS,
    APPROVED_RESPONSE_MAP_SCHEMA_PATHS,
)
from openapi_schema_validation import Json, schema_diagnostics

ALLOWED_PREFIXES: Final = ("/api/v1/", "/webhooks/v1/")
ALLOWED_PATHS: Final = {"/health"}
DOWNLOADS: Final = {
    ("/api/v1/activities/{activity_id}/export", "get"): {
        "application/vnd.ant.fit",
        "application/xml",
    },
    ("/api/v1/export/activities.csv", "get"): {"text/csv"},
    ("/api/v1/export/workout.zwo", "get"): {"application/xml"},
}


@dataclass(frozen=True, slots=True)
class Diagnostic:
    path: str
    method: str
    status: str
    code: str
    schema_path: str
    message: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify public OpenAPI response schemas.")
    parser.add_argument("--app", required=True, help="FastAPI application in module:attribute form")
    parser.add_argument("--json", action="store_true", dest="json_output")
    return parser.parse_args()


def load_app(import_path: str) -> FastAPI:
    module_name, separator, attribute_name = import_path.partition(":")
    if not separator or not module_name or not attribute_name:
        raise ValueError("--app must use module:attribute form")
    current_directory = str(Path.cwd())
    if current_directory not in sys.path:
        sys.path.insert(0, current_directory)
    application = getattr(importlib.import_module(module_name), attribute_name)
    if not isinstance(application, FastAPI):
        raise TypeError("--app must reference a FastAPI application")
    return application


def _diagnostic(
    path: str, method: str, status: str, code: str, schema_path: str, message: str
) -> Diagnostic:
    return Diagnostic(path, method, status, code, schema_path, message)


def _component_diagnostics(components: dict[str, Json]) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    for name in sorted(components):
        schema_path = f"/components/schemas/{name}"
        diagnostics.extend(
            diagnostic
            for diagnostic in schema_diagnostics(
                components[name],
                components,
                schema_path,
                False,
                lambda code, nested_path, message: _diagnostic("", "", "", code, nested_path, message),
                APPROVED_COMPONENT_MAP_SCHEMA_PATHS,
            )
            if diagnostic.schema_path not in APPROVED_GENERIC_COMPONENT_PATHS
        )
    return diagnostics


def verify(app: FastAPI) -> dict[str, Json]:
    specification = app.openapi()
    paths = specification.get("paths")
    components_root = specification.get("components")
    components = components_root.get("schemas", {}) if isinstance(components_root, dict) else {}
    if not isinstance(paths, dict) or not isinstance(components, dict):
        raise ValueError("OpenAPI document is missing paths or component schemas")
    diagnostics: list[Diagnostic] = []
    operation_ids: set[str] = set()
    operations = 0
    success_responses = 0
    for path in sorted(paths):
        path_item = paths[path]
        if not path.startswith(ALLOWED_PREFIXES) and path not in ALLOWED_PATHS:
            diagnostics.append(_diagnostic(path, "", "", "draft_path", "", "public path is not version one"))
        if not isinstance(path_item, dict):
            continue
        for method in sorted(path_item):
            operation = path_item[method]
            if method not in {"get", "post", "put", "patch", "delete", "head", "options"} or not isinstance(operation, dict):
                continue
            operations += 1
            operation_id = operation.get("operationId")
            if not isinstance(operation_id, str) or not operation_id:
                diagnostics.append(_diagnostic(path, method, "", "missing_operation_id", "", "operationId is required"))
            elif operation_id in operation_ids:
                diagnostics.append(_diagnostic(path, method, "", "duplicate_operation_id", "", operation_id))
            else:
                operation_ids.add(operation_id)
            responses = operation.get("responses")
            if not isinstance(responses, dict):
                diagnostics.append(_diagnostic(path, method, "", "missing_success_response", "", "responses are required"))
                continue
            for status, response in sorted(responses.items()):
                if not isinstance(status, str) or not status.startswith("2"):
                    continue
                success_responses += 1
                if status == "204":
                    if (path, method, status) not in APPROVED_EMPTY_SUCCESS_RESPONSES:
                        diagnostics.append(_diagnostic(path, method, status, "unapproved_no_content", "", "no-content success response is not approved"))
                    if isinstance(response, dict) and "content" in response:
                        diagnostics.append(_diagnostic(path, method, status, "no_content_body", "", "no-content success response must not define content"))
                    continue
                content = response.get("content") if isinstance(response, dict) else None
                if not isinstance(content, dict) or not content:
                    diagnostics.append(_diagnostic(path, method, status, "missing_success_content", "", "success response requires content"))
                    continue
                approved_download = DOWNLOADS.get((path, method), set())
                for media_type in sorted(content):
                    media = content[media_type]
                    if media_type == "application/json" and approved_download:
                        diagnostics.append(_diagnostic(path, method, status, "unapproved_json_download", f"/content/{media_type}", "download responses must use approved non-JSON media"))
                    if media_type != "application/json" and media_type not in approved_download:
                        diagnostics.append(_diagnostic(path, method, status, "unapproved_non_json", f"/content/{media_type}", "non-JSON success response is not approved"))
                    if media_type == "application/json":
                        if not isinstance(media, dict) or "schema" not in media:
                            diagnostics.append(_diagnostic(path, method, status, "missing_json_schema", "/content/application/json", "JSON success response requires a schema"))
                        else:
                            diagnostics.extend(schema_diagnostics(media["schema"], components, "/content/application/json/schema", True, lambda code, nested_path, message: _diagnostic(path, method, status, code, nested_path, message), APPROVED_RESPONSE_MAP_SCHEMA_PATHS))
                    elif media_type in approved_download:
                        if not isinstance(media, dict) or not isinstance(media.get("schema"), dict):
                            diagnostics.append(_diagnostic(path, method, status, "missing_download_schema", f"/content/{media_type}", "download requires a concrete schema"))
                        else:
                            diagnostics.extend(schema_diagnostics(media["schema"], components, f"/content/{media_type}/schema", True, lambda code, nested_path, message: _diagnostic(path, method, status, code, nested_path, message), APPROVED_RESPONSE_MAP_SCHEMA_PATHS))
    diagnostics.extend(_component_diagnostics(components))
    diagnostics.sort(key=lambda item: (item.path, item.method, item.status, item.code, item.schema_path))
    return {
        "ok": not diagnostics,
        "summary": {"operations": operations, "success_responses": success_responses, "diagnostics": len(diagnostics)},
        "diagnostics": [asdict(diagnostic) for diagnostic in diagnostics],
    }


def main() -> int:
    arguments = parse_args()
    report = verify(load_app(arguments.app))
    if arguments.json_output:
        print(json.dumps(report, ensure_ascii=True, sort_keys=True))
    else:
        print("ok" if report["ok"] else "failed")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
