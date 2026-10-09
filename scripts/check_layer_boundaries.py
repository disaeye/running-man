#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Final

SQL_PREFIXES: Final = ("SELECT", "INSERT", "UPDATE", "DELETE", "WITH")
SQL_MARKERS: Final = (" FROM ", " INTO ", " SET ", " JOIN ")


@dataclass(frozen=True)
class Violation:
    file: str
    line: int
    rule_id: str
    message: str


class BoundaryVisitor(ast.NodeVisitor):
    def __init__(self, path: Path) -> None:
        self.path = path
        self.violations: list[Violation] = []

    def visit_Constant(self, node: ast.Constant) -> None:
        if isinstance(node.value, str) and _is_sql(node.value):
            self.violations.append(
                Violation(
                    str(self.path),
                    node.lineno,
                    "presentation-sql",
                    "SQL string belongs in infrastructure repositories",
                )
            )
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        if isinstance(node.func, ast.Attribute) and node.func.attr == "execute":
            self.violations.append(
                Violation(
                    str(self.path),
                    node.lineno,
                    "presentation-execute",
                    "Direct execute call belongs in infrastructure repositories",
                )
            )
        self.generic_visit(node)


def scan(root: Path) -> list[Violation]:
    files = [root] if root.is_file() else sorted(root.rglob("*.py"))
    violations: list[Violation] = []
    for path in files:
        visitor = BoundaryVisitor(path)
        visitor.visit(ast.parse(path.read_text(encoding="utf-8"), filename=str(path)))
        violations.extend(visitor.violations)
    return violations


def _is_sql(value: str) -> bool:
    normalized = f" {value.strip().upper()} "
    return normalized.lstrip().startswith(SQL_PREFIXES) and any(
        marker in normalized for marker in SQL_MARKERS
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    _ = parser.add_argument("roots", nargs="+", type=Path)
    _ = parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    violations = [violation for root in args.roots for violation in scan(root)]
    if args.json:
        print(json.dumps([asdict(violation) for violation in violations]))
    else:
        for violation in violations:
            print(f"{violation.file}:{violation.line}: {violation.rule_id}: {violation.message}")
    return int(bool(violations))


if __name__ == "__main__":
    raise SystemExit(main())
