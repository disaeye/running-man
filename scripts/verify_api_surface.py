#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Final

import anyio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

API_PREFIX: Final = "/api/v1/"
HEALTH_PATH: Final = "/health"
WEBHOOK_PREFIX: Final = "/webhooks/v1/"
API_VERSION: Final = "1"
NOT_FOUND_STATUS: Final = 404
DEFAULT_NEGATIVE_PATHS: Final = (
    "/api/pmc",
    "/auth/login",
    "/webhooks/v2/intervals",
)


@dataclass(frozen=True, slots=True)
class RouteRecord:
    methods: tuple[str, ...]
    operation_ids: tuple[str, ...]
    path: str


@dataclass(frozen=True, slots=True)
class NegativePathResult:
    path: str
    status_code: int
    version: str | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify the version-one FastAPI public surface.")
    parser.add_argument("--app", required=True, help="ASGI application in module:attribute form")
    parser.add_argument("--json", action="store_true", dest="json_output")
    parser.add_argument("--negative-path", action="append", dest="negative_paths")
    return parser.parse_args()


def load_app(import_path: str) -> FastAPI:
    module_name, separator, attribute_name = import_path.partition(":")
    if not separator or not module_name or not attribute_name:
        raise ValueError("--app must use module:attribute form")
    working_directory = str(Path.cwd())
    if working_directory not in sys.path:
        sys.path.insert(0, working_directory)
    application = getattr(importlib.import_module(module_name), attribute_name)
    if not isinstance(application, FastAPI):
        raise TypeError("--app must reference a FastAPI application")
    return application


def route_records(app: FastAPI) -> tuple[RouteRecord, ...]:
    schema = app.openapi()
    records = [
        RouteRecord(
            path=path,
            methods=tuple(sorted(method.upper() for method in operations)),
            operation_ids=tuple(
                operations[method]["operationId"] for method in sorted(operations)
            ),
        )
        for path, operations in schema["paths"].items()
    ]
    return tuple(sorted(records, key=lambda record: record.path))


def surface_diagnostics(app: FastAPI, routes: tuple[RouteRecord, ...]) -> list[str]:
    diagnostics: list[str] = []
    if app.version != "1.0.0":
        diagnostics.append(f"app version is {app.version}, expected 1.0.0")
    operation_ids = [operation_id for route in routes for operation_id in route.operation_ids]
    if len(operation_ids) != len(set(operation_ids)):
        diagnostics.append("OpenAPI operation IDs are not unique")
    for route in routes:
        is_versioned_path = route.path.startswith(API_PREFIX) or route.path.startswith(
            WEBHOOK_PREFIX
        )
        if route.path == HEALTH_PATH or is_versioned_path:
            continue
        diagnostics.append(f"unexpected public path: {route.path}")
    return diagnostics


async def negative_path_results(
    app: FastAPI, paths: tuple[str, ...]
) -> tuple[NegativePathResult, ...]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        results = [
            NegativePathResult(
                path=path,
                status_code=(response := await client.get(path)).status_code,
                version=response.headers.get("X-API-Version"),
            )
            for path in paths
        ]
    return tuple(results)


async def verify(app: FastAPI, paths: tuple[str, ...]) -> dict[str, object]:
    routes = route_records(app)
    diagnostics = surface_diagnostics(app, routes)
    negative_results = await negative_path_results(app, paths)
    for result in negative_results:
        if result.status_code != NOT_FOUND_STATUS:
            diagnostics.append(
                f"negative path {result.path} returned {result.status_code}, "
                f"expected {NOT_FOUND_STATUS}"
            )
        if result.version != API_VERSION:
            diagnostics.append(
                f"negative path {result.path} returned X-API-Version {result.version}, "
                f"expected {API_VERSION}"
            )
    return {
        "api_version": app.version,
        "diagnostics": diagnostics,
        "negative_paths": [asdict(result) for result in negative_results],
        "ok": not diagnostics,
        "paths": [asdict(route) for route in routes],
    }


def main() -> int:
    arguments = parse_args()
    app = load_app(arguments.app)
    negative_paths = tuple(arguments.negative_paths or DEFAULT_NEGATIVE_PATHS)
    report = anyio.run(verify, app, negative_paths)
    if arguments.json_output:
        print(json.dumps(report, ensure_ascii=True, sort_keys=True))
    else:
        print("ok" if report["ok"] else "failed")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
