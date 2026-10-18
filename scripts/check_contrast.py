"""Token contrast gate for the web design system.

Static check over `apps/web/app/globals.css`, the JSX that consumes it, and the
`cva` variant tables that define the controls:

* **R3** a hairline that composites to within 1.25:1 of the fill behind it is not
  a border, it is a rumour
* **R4** body text reaches WCAG AA 4.5:1 on every page surface
* **R5** text at title3 and above, and graphical objects, reach 3.0:1
* **R6** a variant's label reaches 4.5:1 on the fill that variant paints
* **R7** a variant does not fill with the container's own colour
* **R8** a disabled label stays above 3.0:1 once opacity is composited

Surface-token ordering is deliberately not checked. `surface-base` and
`surface-subtle` are meant to be nearly identical (an inset well inside the
canvas) and `surface-card` equals `surface-raised` on purpose — the raised layer
is chrome floating above everything, and its separation comes from elevation
shadows rather than from a fill. A rule that forced every pair apart would be
rewriting the design, not fixing a defect. R7 is a different question and keeps
its teeth: there the collision is between a control and the surface it is drawn
on, and a control that matches its parent has no shape.

Findings are keyed by rule, theme, location and token pair, so a baseline can be
checked in both directions: a new violation fails, and a baseline entry that no
longer reproduces also fails, which keeps the list shrinking.

Usage:
  scripts/check_contrast.py [--json] [--baseline scripts/contrast_baseline.json]
  scripts/check_contrast.py --write-baseline scripts/contrast_baseline.json
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Final

sys.path.insert(0, str(Path(__file__).resolve().parent))

from contrast_cva import cva_variants  # noqa: E402
from contrast_lib import Finding, Rgba, contrast, describe, over, tokens  # noqa: E402
from contrast_text import BODY_MIN, text_findings  # noqa: E402
from contrast_variants import variant_findings  # noqa: E402

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
STYLESHEET: Final = REPO_ROOT / "apps" / "web" / "app" / "globals.css"
WEB_ROOT: Final = REPO_ROOT / "apps" / "web"
DEFAULT_BASELINE: Final = REPO_ROOT / "scripts" / "contrast_baseline.json"

THEMES: Final = (("light", ":root"), ("dark", ".dark"))
BORDER_VISIBLE_MIN: Final = 1.25

CONTAINER_TOKENS: Final = ("color-surface-card", "color-surface-base")


def border_findings(colours: dict[str, Rgba], theme: str) -> list[Finding]:
    border = colours.get("color-border-subtle")
    card = colours.get("color-surface-card")
    if border is None or card is None:
        return []
    resolved = over(border, card)
    gap = contrast(resolved, card)
    if gap >= BORDER_VISIBLE_MIN:
        return []
    detail = (
        f"border-subtle {describe(border)} over surface-card {describe(card)} "
        f"resolves to {describe(resolved)} = {gap:.2f}:1"
    )
    return [
        Finding(
            f"R3|{theme}|globals.css|border-subtle/surface-card",
            "R3",
            theme,
            "globals.css",
            detail,
        )
    ]
def variant_tables() -> list[tuple[str, object]]:
    """Every `cva` variant entry that carries class names, with its location."""
    tables: list[tuple[str, object]] = []
    for path in sorted(WEB_ROOT.rglob("*.tsx")):
        if "node_modules" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        if "cva(" not in text:
            continue
        relative = path.relative_to(REPO_ROOT).as_posix()
        tables.extend((relative, variant) for variant in cva_variants(text))
    return tables


def collect() -> list[Finding]:
    css = STYLESHEET.read_text(encoding="utf-8")
    tables = variant_tables()
    findings: list[Finding] = []
    for theme, selector in THEMES:
        colours = tokens(css, selector)
        containers = {
            name: colours[name] for name in CONTAINER_TOKENS if name in colours
        }
        findings.extend(border_findings(colours, theme))
        findings.extend(text_findings(colours, theme))
        findings.extend(variant_findings(colours, containers, theme, tables))
    return findings


def load_baseline(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        raise SystemExit(f"{path} does not exist; create it with --write-baseline")
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {entry["key"]: entry for entry in payload.get("findings", [])}


def write_baseline(path: Path, findings: list[Finding]) -> None:
    entries = sorted(
        (asdict(finding) for finding in findings),
        key=lambda entry: entry["key"],
    )
    path.write_text(
        json.dumps({"findings": entries}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--baseline", type=Path, default=None, help="checked-in baseline")
    parser.add_argument("--write-baseline", type=Path, default=None, help="record current findings")
    args = parser.parse_args(argv[1:])

    findings = collect()
    if args.write_baseline is not None:
        write_baseline(args.write_baseline, findings)
        print(f"wrote {len(findings)} finding(s) to {args.write_baseline}")
        return 0

    baseline = load_baseline(args.baseline) if args.baseline is not None else None
    if baseline is None:
        for finding in findings:
            print(f"[{finding.rule}] {finding.theme:5} {finding.where}: {finding.detail}")
        print(f"\n{len(findings)} finding(s) across {len(THEMES)} themes")
        if args.json:
            print(json.dumps({"findings": [asdict(f) for f in findings]}, ensure_ascii=False))
        return 1 if findings else 0

    current = {finding.key: finding for finding in findings}
    new = [current[key] for key in sorted(current.keys() - baseline.keys())]
    stale = [baseline[key] for key in sorted(baseline.keys() - current.keys())]

    for finding in new:
        print(f"[{finding.rule}] {finding.theme:5} {finding.where}: {finding.detail}")
    for entry in stale:
        print(
            f"[stale] {entry['rule']} {entry['theme']:5} {entry['where']}: "
            f"fixed, remove its baseline entry"
        )
    print(
        f"\n{len(new)} new violation(s), {len(stale)} stale baseline entr(ies), "
        f"{len(current)} open of {len(baseline)} recorded"
    )
    return 1 if new or stale else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
