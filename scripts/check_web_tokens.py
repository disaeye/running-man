"""Reject panel styling that bypasses the design tokens.

Design-system invariants checked mechanically:

  A. `glass-surface` / `backdrop-blur-*` outside `shared/layout/`. Glass is
     chrome only — navigation bar / tab dock.
  B. A panel surface with the wrong radius, or arbitrary `rounded-[...]`
     overrides. Panel radius is 16px (`rounded-2xl`); `rounded-xl` is the
     legacy panel radius and `rounded-3xl` belongs to dialogs and sheets.
  C. A raw Tailwind palette colour (`bg-emerald-500`, `text-sky-400`).
  D. A colour token declared in `:root` but omitted from `@theme inline`.
  E. `text-caption2` carrying CJK content (at 11px Chinese glyphs smear; CJK
     starts at `text-caption1`), including multi-line / interpolated labels.
  F. Missing measurement concatenated directly with a unit string (`未记录 bpm`).

Usage:
  scripts/check_web_tokens.py [--json]
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
WEB_DIR: Final = REPO_ROOT / "apps" / "web"
SCAN_ROOTS: Final = (WEB_DIR / "app", WEB_DIR / "features", WEB_DIR / "shared")
SUFFIXES: Final = (".ts", ".tsx")

# Chrome owns the glass treatment.
GLASS_ALLOWED_PREFIX: Final = "shared/layout/"

# The standalone marketing surface uses display-scale type and accent-coloured
# headings on purpose.
FILL_AS_TEXT_EXEMPT_PREFIX: Final = "app/(public)/landing/"

FILL_AS_TEXT: Final = re.compile(r"(?<![\w-])text-(?:primary)(?![\w-])")

GLASS: Final = re.compile(r"\bglass-surface(-strong)?\b")
BACKDROP_BLUR: Final = re.compile(r"\bbackdrop-blur(?:-[a-z0-9]+|-\[[^\]]+\])?\b")
PANEL_SURFACE: Final = re.compile(r"\b(?:bg-surface-card|bg-card)\b")
LEGACY_PANEL_RADIUS: Final = re.compile(r"\brounded-(?:xl|3xl)\b")
ARBITRARY_RADIUS: Final = re.compile(r"\brounded(?:-[trblxy]{1,2})?-\[[^\]]+\]")

PALETTE: Final = re.compile(
    r"\b(?:bg|text|border|ring|from|to|via)-"
    r"(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald"
    r"|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-"
    r"(?:50|[1-9]00|950)\b"
)

# `text-caption2` whose text node (single or multi-line up to 3 lines) carries CJK.
CAPTION2_CJK: Final = re.compile(r"text-caption2[^>]*>\s*([^<{]{1,60})")
CAPTION2_INTERPOLATED_CJK: Final = re.compile(
    r"\{\s*(?:[a-zA-Z_]\w*\.)?(?:label|hint|note|display_line|formatWindow|formatRelativeTime|TRIGGER_LABEL|STATUS_LABEL)\b"
)
CJK: Final = re.compile(r"[\u4e00-\u9fff]")

# Empty-value placeholders other than NO_VALUE.
EMPTY_PLACEHOLDER: Final = re.compile(r"\"—\"|'—'|>—<|\"——\"|'——'|>——<")
NO_VALUE_WITH_UNIT: Final = re.compile(
    r"(?:\$\{NO_VALUE\}|NO_VALUE\s*\+\s*[\"']|[\"']未记录)\s*(?:bpm|km|min|/km|kcal|spm|rpm|ms|kg|cm|W|h|m)\b"
)


@dataclass(frozen=True, slots=True)
class Finding:
    rule: str
    path: str
    line: int
    detail: str


def source_files() -> list[Path]:
    files: list[Path] = []
    for root in SCAN_ROOTS:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if path.is_file() and path.suffix in SUFFIXES:
                files.append(path)
    return files


def _caption2_segment(lines: list[str], start_idx: int) -> str | None:
    """Extract the JSX text snippet after the opening tag carrying text-caption2."""
    window = "\n".join(lines[start_idx : min(len(lines), start_idx + 4)])
    pos = window.find("text-caption2")
    if pos < 0:
        return None
    gt = window.find(">", pos)
    if gt < 0:
        return None
    tail = window[gt + 1 :]
    close = tail.find("</")
    return tail[:close] if close >= 0 else tail.splitlines()[0]


def scan(path: Path) -> list[Finding]:
    relative = path.relative_to(WEB_DIR).as_posix()
    is_test = ".test." in path.name or ".spec." in path.name
    findings: list[Finding] = []
    lines = path.read_text(encoding="utf-8").splitlines()
    for number, text in enumerate(lines, 1):
        if GLASS.search(text) and not relative.startswith(GLASS_ALLOWED_PREFIX):
            findings.append(
                Finding("panel-glass", relative, number, "glass is chrome-only; panels use bg-surface-card")
            )
        if BACKDROP_BLUR.search(text) and not relative.startswith(GLASS_ALLOWED_PREFIX):
            findings.append(
                Finding(
                    "panel-backdrop-blur",
                    relative,
                    number,
                    "backdrop-blur is chrome-only (shared/layout/); panels and sheets use opaque bg-surface-card",
                )
            )
        if PANEL_SURFACE.search(text) and LEGACY_PANEL_RADIUS.search(text):
            findings.append(
                Finding(
                    "panel-radius",
                    relative,
                    number,
                    "panel surfaces are rounded-2xl (14px); rounded-xl is the legacy "
                    "panel radius and rounded-3xl (24px) belongs to dialogs and sheets",
                )
            )
        if not is_test and ARBITRARY_RADIUS.search(text):
            findings.append(
                Finding(
                    "arbitrary-radius",
                    relative,
                    number,
                    "use tokenized rounded-* classes (e.g. rounded-2xl, rounded-3xl, rounded-full) instead of arbitrary rounded-[...]",
                )
            )
        if FILL_AS_TEXT.search(text) and not relative.startswith(FILL_AS_TEXT_EXEMPT_PREFIX):
            findings.append(
                Finding(
                    "fill-as-text",
                    relative,
                    number,
                    "accent/primary are fills; text uses text-accent-strong",
                )
            )
        for match in PALETTE.finditer(text):
            findings.append(
                Finding("raw-palette", relative, number, f"{match.group(0)} is not a design token")
            )
        if not is_test and "text-caption2" in text:
            seg = _caption2_segment(lines, number - 1)
            inline_hit = any(CJK.search(m.group(1)) for m in CAPTION2_CJK.finditer(text))
            multiline_hit = seg is not None and (
                bool(CJK.search(seg)) or bool(CAPTION2_INTERPOLATED_CJK.search(seg))
            )
            if inline_hit or multiline_hit:
                findings.append(
                    Finding(
                        "caption2-cjk",
                        relative,
                        number,
                        "text-caption2 is 11px and Latin-only; Chinese starts at text-caption1",
                    )
                )
        if EMPTY_PLACEHOLDER.search(text):
            findings.append(
                Finding(
                    "empty-placeholder",
                    relative,
                    number,
                    "use NO_VALUE from @shared/lib/use-data-state for a missing measurement",
                )
            )
        if not is_test and NO_VALUE_WITH_UNIT.search(text):
            findings.append(
                Finding(
                    "no-value-with-unit",
                    relative,
                    number,
                    "do not concatenate NO_VALUE or '未记录' directly with a unit string",
                )
            )
    return findings


def theme_coverage() -> list[Finding]:
    """Colour tokens the utilities cannot see because `@theme inline` omits them."""
    stylesheet = WEB_DIR / "app" / "globals.css"
    css = stylesheet.read_text(encoding="utf-8")
    declared = _tokens_in_block(css, ":root {")
    exposed = _tokens_in_block(css, "@theme inline {")
    return [
        Finding(
            "theme-coverage",
            "app/globals.css",
            0,
            f"--color-{name} is declared but missing from @theme inline, "
            f"so bg-{name}/text-{name}/border-{name} compile to nothing",
        )
        for name in sorted(declared - exposed)
    ]


def _tokens_in_block(css: str, opener: str) -> set[str]:
    if opener not in css:
        return set()
    body = css.split(opener, 1)[1].split("\n}", 1)[0]
    return set(re.findall(r"^\s*--color-([a-z0-9-]+)\s*:", body, re.M))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv[1:])

    files = source_files()
    findings: list[Finding] = []
    for path in files:
        findings.extend(scan(path))
    findings.extend(theme_coverage())

    if args.json:
        print(json.dumps({"findings": [asdict(f) for f in findings]}, ensure_ascii=False, indent=2))
    else:
        for finding in findings:
            print(f"{finding.path}:{finding.line}: [{finding.rule}] {finding.detail}")
        print(f"\n{len(findings)} finding(s) across {len(files)} files")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
