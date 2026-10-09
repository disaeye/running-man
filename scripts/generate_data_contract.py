from __future__ import annotations

import argparse
import json
from pathlib import Path

from data_contract_generation import generated_outputs
from validate_data_contract import validate


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate semantic registries from a v1 contract.")
    parser.add_argument("contract_directory", type=Path)
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def main() -> int:
    arguments = parse_args()
    report = validate(arguments.contract_directory)
    if not report["ok"]:
        print(json.dumps(report, ensure_ascii=True, sort_keys=True))
        return 1
    outputs = generated_outputs(arguments.contract_directory)
    for path, content in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    if arguments.as_json:
        print(json.dumps({"files": [str(path) for path in sorted(outputs)]}, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
