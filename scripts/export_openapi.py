#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from check_response_models import load_app, verify


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export a deterministic OpenAPI document.")
    parser.add_argument("--app", required=True, help="FastAPI application in module:attribute form")
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--output", type=Path)
    output.add_argument("--check", type=Path)
    return parser.parse_args()


def normalized_openapi(app_path: str) -> str:
    app = load_app(app_path)
    report = verify(app)
    if not report["ok"]:
        raise ValueError(json.dumps(report, ensure_ascii=True, sort_keys=True))
    return json.dumps(app.openapi(), ensure_ascii=True, indent=2, sort_keys=True) + "\n"


def main() -> int:
    arguments = parse_args()
    try:
        document = normalized_openapi(arguments.app)
    except ValueError as error:
        print(str(error))
        return 1
    if arguments.check is not None:
        existing = arguments.check.read_text(encoding="utf-8") if arguments.check.exists() else ""
        if existing != document:
            print(f"OpenAPI drift: {arguments.check}")
            return 1
        return 0
    if arguments.output is not None:
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(document, encoding="utf-8")
        return 0
    print(document, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
