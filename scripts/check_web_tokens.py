"""Reject panel styling that bypasses the design tokens.

Three classes of divergence made the app read as several products stacked
together, and all three are mechanically detectable:

  A. `glass-surface` on a panel. Glass is chrome — sidebar, header, tab bar.
     A page of six blurred panels hides the dusk atmosphere and costs a
     compositing layer per card on every scroll.
  B. A panel surface with the wrong radius. `Card` is the panel primitive and
     it uses `rounded-xl`; a hand-rolled `rounded-2xl bg-surface-card` is a
     second panel language.
  C. A raw Tailwind palette colour (`bg-emerald-500`, `text-sky-400`). Every
     colour in this app is a token so the dual theme and the data semantics hold.
  D. A colour token declared in `:root` but never exposed through `@theme
     inline`. Tailwind only emits a utility for a colour it knows about, so
     `bg-accent` compiles to nothing and the element renders transparent while
     the text stays white. Two tokens sat in that state — `accent` and
     `surface-raised` — and every primary button was a white label on the page
     background with no fill and no border.

`text-caption2` is additionally checked for CJK content: at 11px Chinese glyphs
smear, so that step is Latin-only.

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

# `--color-accent` and `--color-primary` are fills. As text they measure 3.7:1
# against the dark panel, so accent-coloured text uses `--color-accent-strong`.
FILL_AS_TEXT: Final = re.compile(r"(?<![\w-])text-(?:accent|primary)(?![\w-])")

GLASS: Final = re.compile(r"\bglass-surface(-strong)?\b")
PANEL_SURFACE: Final = re.compile(r"\b(?:bg-surface-card|bg-card)\b")
PANEL_RADIUS: Final = re.compile(r"\brounded-(?:2xl|3xl)\b")

PALETTE: Final = re.compile(
    r"\b(?:bg|text|border|ring|from|to|via)-"
    r"(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald"
    r"|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-"
    r"(?:50|[1-9]00|950)\b"
)

# `text-caption2` whose text node begins with a CJK glyph.
CAPTION2_CJK: Final = re.compile(r"text-caption2[^>]*>\s*([^<{]{1,60})")
CJK: Final = re.compile(r"[\u4e00-\u9fff]")

# Empty-value placeholders other than NO_VALUE. Three glyphs for one meaning read
# as three different degrees of "unknown".
EMPTY_PLACEHOLDER: Final = re.compile(r"\"—\"|'—'|>—<|\"——\"|'——'|>——<")


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


def scan(path: Path) -> list[Finding]:
    relative = path.relative_to(WEB_DIR).as_posix()
    findings: list[Finding] = []
    for number, text in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if GLASS.search(text) and not relative.startswith(GLASS_ALLOWED_PREFIX):
            findings.append(
                Finding("panel-glass", relative, number, "glass is chrome-only; panels use bg-surface-card")
            )
        if PANEL_SURFACE.search(text) and PANEL_RADIUS.search(text):
            findings.append(
                Finding(
                    "panel-radius",
                    relative,
                    number,
                    "panel surfaces use rounded-xl (Card); rounded-2xl/3xl is for overlays",
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
        for match in CAPTION2_CJK.finditer(text):
            if CJK.search(match.group(1)):
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
