"""Fail when DESIGN.md states a token value the stylesheet does not have.

The design document is normative: it says what the canvas colour is, what the
content column is, what each type step is. Before this gate existed it said the
content column was `max-w-5xl` while the stylesheet set 96rem, and its entire
palette table listed hex values that appeared nowhere in the code. The document
was not wrong about intent; it was simply never connected to anything.

Format: a table row whose first cell is a backticked CSS custom property.

    | `--color-surface-base` | `#f4f6f8` | `#080a0f` | Page canvas |

One backticked value after the token means a light-only value; two mean light
and dark. `rem` and `px` are compared numerically, so `15px` matches `0.9375rem`.

Usage:
  scripts/check_design_tokens.py [--json]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Final

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
STYLESHEET: Final = REPO_ROOT / "apps" / "web" / "app" / "globals.css"
DESIGN_DOC: Final = REPO_ROOT / "apps" / "web" / "DESIGN.md"

DECLARATION: Final = re.compile(r"^\s*(--[A-Za-z0-9-]+)\s*:\s*(.+?);\s*$")
BACKTICK: Final = re.compile(r"`([^`]+)`")
REM_OR_PX: Final = re.compile(r"^(-?\d+(?:\.\d+)?)(px|rem)$")


@dataclass(frozen=True, slots=True)
class Finding:
    line: int
    token: str
    detail: str


def block(css: str, selector: str) -> str:
    """The body of a top-level rule, matched by its selector."""
    start = css.find(f"\n{selector} {{")
    if start == -1:
        return ""
    open_brace = css.find("{", start)
    depth = 0
    for index in range(open_brace, len(css)):
        if css[index] == "{":
            depth += 1
        elif css[index] == "}":
            depth -= 1
            if depth == 0:
                return css[open_brace + 1 : index]
    return ""


def declarations(body: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for line in body.splitlines():
        match = DECLARATION.match(line)
        if match:
            found[match.group(1)] = match.group(2).strip()
    return found


def normalize(value: str) -> str:
    """Compare lengths numerically so px and rem forms of one size agree."""
    collapsed = re.sub(r"\s+", " ", value.strip().lower())
    match = REM_OR_PX.match(collapsed)
    if not match:
        return collapsed
    number = float(match.group(1))
    pixels = number * 16 if match.group(2) == "rem" else number
    return f"{round(pixels, 4)}px"


SINGLE_VAR: Final = re.compile(r"^var\((--[A-Za-z0-9-]+)\)$")


def resolve(value: str, table: dict[str, str]) -> str:
    """Follow `var(--x)` indirection one level.

    `@theme inline` re-declares the palette as `var(--color-…)` so Tailwind can
    read it; those entries are aliases, and the value a document states is the
    one in `:root`.
    """
    match = SINGLE_VAR.match(value.strip())
    if match and match.group(1) in table:
        return table[match.group(1)]
    return value


def documented_rows(markdown: str) -> list[tuple[int, str, list[str]]]:
    rows: list[tuple[int, str, list[str]]] = []
    for number, line in enumerate(markdown.splitlines(), 1):
        if not line.lstrip().startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if not cells:
            continue
        token_match = BACKTICK.fullmatch(cells[0])
        if not token_match or not token_match.group(1).startswith("--"):
            continue
        values = [
            match.group(1)
            for cell in cells[1:]
            for match in BACKTICK.finditer(cell)
        ]
        rows.append((number, token_match.group(1), values))
    return rows


def check(markdown: str, light: dict[str, str], dark: dict[str, str]) -> list[Finding]:
    findings: list[Finding] = []
    for number, token, values in documented_rows(markdown):
        if not values:
            continue
        if token not in light and token not in dark:
            findings.append(
                Finding(number, token, "documented here but not declared in globals.css")
            )
            continue
        if normalize(values[0]) != normalize(light.get(token, "")):
            findings.append(
                Finding(
                    number,
                    token,
                    f"document says {values[0]}, stylesheet has {light.get(token, '(none)')}",
                )
            )
        if len(values) >= 2:
            if token not in dark:
                findings.append(
                    Finding(number, token, "document gives a dark value; the .dark block does not declare it")
                )
            elif normalize(values[1]) != normalize(dark[token]):
                findings.append(
                    Finding(
                        number,
                        token,
                        f"document says dark {values[1]}, stylesheet has {dark[token]}",
                    )
                )
    return findings


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv[1:])

    css = STYLESHEET.read_text(encoding="utf-8")
    # `@theme inline` carries the type scale and re-exports the palette as
    # `var()` aliases; `:root` carries the actual colour and layout values.
    root = declarations(block(css, ":root"))
    theme = declarations(block(css, "@theme inline"))
    light = dict(root)
    for name, value in theme.items():
        light[name] = resolve(value, root)
    dark = declarations(block(css, ".dark"))
    markdown = DESIGN_DOC.read_text(encoding="utf-8")

    findings = check(markdown, light, dark)
    checked = len(documented_rows(markdown))

    if args.json:
        print(json.dumps({"findings": [asdict(f) for f in findings]}, ensure_ascii=False, indent=2))
    else:
        for finding in findings:
            print(f"DESIGN.md:{finding.line}: {finding.token}: {finding.detail}")
        print(f"\n{len(findings)} finding(s) across {checked} documented token rows")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
