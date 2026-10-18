"""R4 and R5: text tokens measured against every page surface."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Final

from contrast_lib import Finding, Rgba, class_literals, contrast, describe

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
WEB_ROOT: Final = REPO_ROOT / "apps" / "web"
DEV_ROOT: Final = WEB_ROOT / "app" / "(dev)"
SURFACE_PREFIX: Final = "color-surface-"

BODY_MIN: Final = 4.5
LARGE_MIN: Final = 3.0

LARGE_SIZE_TOKENS: Final = frozenset(
    {
        "title3",
        "title2",
        "title1",
        "largeTitle",
        "headline",
        "display-sm",
        "display-md",
        "display-lg",
        "display-xl",
    }
)

TEXT_CLASS: Final = re.compile(r"\btext-(?P<name>[a-z0-9-]+)(?:/\d{1,3})?\b")
# A literal carrying a type-scale class describes text; one carrying only an icon
# size describes a graphical object, which WCAG 1.4.11 holds to 3:1 instead of
# the 4.5:1 that body copy needs.
TYPE_SCALE: Final = re.compile(
    r"\btext-(?:caption[12]|footnote|subheadline|body|headline|title[123]|largeTitle)\b"
)
ICON_SIZE: Final = re.compile(r"\b(?:size|[hw])-\d+(?:\.\d+)?\b")
# Any utility whose value is a colour but whose name starts with something else;
# `bg-text-muted/30` contains the substring `text-muted`.
OTHER_UTILITY: Final = re.compile(
    r"\b(?:bg|border|ring|fill|stroke|from|to|via|divide|outline|shadow|placeholder)-"
    r"[a-z0-9-/]+\b"
)

# Tokens that exist only as the text colour *for a fill*. Measuring them against a
# page surface says nothing: `text-on-primary` is white because it sits on
# `bg-primary`, and white-on-white is the rule asking the wrong question. R6 in
# `contrast_variants.py` measures these against the fill the variant declares.
FILL_FOREGROUND_TOKENS: Final = frozenset(
    {
        "on-primary",
        "on-accent",
        "on-dark",
        "on-dark-soft",
        "text-inverse",
        "accent-foreground",
        "primary-foreground",
        "secondary-foreground",
        "card-foreground",
        "popover-foreground",
        "destructive-foreground",
    }
)


def surface_tokens(colours: dict[str, Rgba]) -> dict[str, Rgba]:
    """Page surfaces. The `surface-dark*` family is a fill, not a page tone."""
    return {
        name: colour
        for name, colour in colours.items()
        if name.startswith(SURFACE_PREFIX) and not name.startswith(f"{SURFACE_PREFIX}dark")
    }


def text_findings(colours: dict[str, Rgba], theme: str) -> list[Finding]:
    """Every text token against every page surface.

    Pairing a text class with the `bg-` class beside it cannot be done by reading
    text: one template literal holds both branches of a ternary, so
    `isActive ? "bg-primary text-on-primary" : "text-text-secondary"` reports
    white-on-white and grey-on-indigo that no element ever renders. What is always
    true is that text sits on a page surface, so that is what this measures. A
    token that fails here needs a new value whatever else it is used for.
    """
    surfaces = surface_tokens(colours)
    if not surfaces:
        return []

    usages: dict[str, tuple[float, str]] = {}
    for path in sorted(WEB_ROOT.rglob("*.tsx")):
        if "node_modules" in path.parts or DEV_ROOT in path.parents:
            continue
        for number, chunk in class_literals(path):
            for match in TEXT_CLASS.finditer(OTHER_UTILITY.sub(" ", chunk)):
                name = match.group("name")
                if f"color-{name}" not in colours or name in FILL_FOREGROUND_TOKENS:
                    continue
                limit = LARGE_MIN if name in LARGE_SIZE_TOKENS else BODY_MIN
                if ICON_SIZE.search(chunk) and not TYPE_SCALE.search(chunk):
                    limit = LARGE_MIN
                where = f"{path.relative_to(REPO_ROOT).as_posix()}:{number}"
                usages.setdefault(name, (limit, where))

    findings: list[Finding] = []
    for name, (limit, where) in sorted(usages.items()):
        foreground = colours[f"color-{name}"]
        for surface_name, surface in sorted(surfaces.items()):
            surface_short = surface_name[len(SURFACE_PREFIX) :]
            gap = contrast(foreground, surface)
            if gap >= limit:
                continue
            rule = "R4" if limit == BODY_MIN else "R5"
            findings.append(
                Finding(
                    f"{rule}|{theme}|{where}|text-{name}/{surface_short}",
                    rule,
                    theme,
                    where,
                    f"text-{name} {describe(foreground)} on {surface_short} "
                    f"{describe(surface)} = {gap:.2f}:1 (needs {limit}:1)",
                )
            )
    return findings
