#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Final

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
SCRIPT_DIR: Final = Path(__file__).resolve().parent
API_DIR: Final = REPO_ROOT / "apps" / "api"

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

try:
    from metadata_parity import DEFAULT_METADATA_MODULE, check_metadata_parity, diagnostic_json
except ModuleNotFoundError as exc:
    if exc.name != "sqlalchemy" or os.environ.get("METADATA_PARITY_UV_BOOTSTRAPPED") == "1":
        raise
    os.environ["METADATA_PARITY_UV_BOOTSTRAPPED"] = "1"
    script_path = Path(__file__).resolve()
    os.execvp(
        "uv",
        ["uv", "run", "--project", str(API_DIR), "python", str(script_path), *sys.argv[1:]],
    )


class ParsedArgs(argparse.Namespace):
    database_url: str
    json_output: bool
    metadata_module: str

    def __init__(self) -> None:
        super().__init__()
        self.database_url = ""
        self.json_output = False
        self.metadata_module = DEFAULT_METADATA_MODULE


def parse_args() -> ParsedArgs:
    parser = argparse.ArgumentParser(
        description="Compare live public application tables against SQLAlchemy metadata."
    )
    _ = parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    _ = parser.add_argument("--metadata-module", default=DEFAULT_METADATA_MODULE)
    _ = parser.add_argument("--json", action="store_true", dest="json_output")
    args = ParsedArgs()
    return parser.parse_args(namespace=args)


def main() -> int:
    args = parse_args()
    diagnostics = check_metadata_parity(args.database_url, args.metadata_module)
    payload = {
        "ok": not diagnostics,
        "diagnostics": [diagnostic_json(diagnostic) for diagnostic in diagnostics],
    }
    if args.json_output:
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    elif diagnostics:
        for diagnostic in diagnostics:
            print(f"{diagnostic.code}: {diagnostic.path}: {diagnostic.message}")
    else:
        print("metadata parity ok")
    return 0 if not diagnostics else 1


if __name__ == "__main__":
    sys.exit(main())
