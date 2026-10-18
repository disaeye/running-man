"""Variant-table contrast rules (R6, R7, R8).

A `cva` variant is a fixed class string, so the foreground and the fill it sits
on can be read straight off it — the reason these rules exist is that R4 cannot
see a fill pair: it measures text tokens against page surfaces and deliberately
skips the `on-*` family, which is exactly the family button labels use.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Final

from contrast_cva import Variant
from contrast_lib import Finding, Rgba, contrast, describe, over

BODY_MIN: Final = 4.5
# Disabled text is exempt from WCAG AA. 3:1 is the floor below which the label is
# not there any more, exempt or not.
DISABLED_MIN: Final = 3.0

BACKGROUND: Final = re.compile(r"^bg-(?P<name>[a-z0-9-]+)(?:/(?P<alpha>\d{1,3}))?$")
FOREGROUND: Final = re.compile(r"^text-(?P<name>[a-z0-9-]+)$")
OPACITY: Final = re.compile(r"^opacity-(?P<percent>\d{1,3})$")
NO_FILL: Final = frozenset({"transparent", "current", "inherit", "none"})


@dataclass(frozen=True, slots=True)
class Declared:
    bg: str | None = None
    bg_alpha: float = 1.0
    fg: str | None = None
    disabled_bg: str | None = None
    disabled_fg: str | None = None
    disabled_opacity: float | None = None


def declare(classes: str) -> Declared:
    """Split one variant string into resting and disabled declarations."""
    bg: str | None = None
    fg: str | None = None
    disabled_bg: str | None = None
    disabled_fg: str | None = None
    bg_alpha = 1.0
    disabled_opacity: float | None = None
    for token in classes.split():
        state, _, utility = token.rpartition(":") if ":" in token else ("", "", token)
        if state and state != "disabled":
            continue
        match = BACKGROUND.match(utility)
        if match:
            name = match.group("name")
            alpha_text = match.group("alpha")
            if state == "disabled":
                disabled_bg = name
            else:
                bg = name
                bg_alpha = int(alpha_text) / 100 if alpha_text else 1.0
            continue
        match = FOREGROUND.match(utility)
        if match:
            if state == "disabled":
                disabled_fg = match.group("name")
            else:
                fg = match.group("name")
            continue
        match = OPACITY.match(utility)
        if match and state == "disabled":
            disabled_opacity = int(match.group("percent")) / 100
    return Declared(bg, bg_alpha, fg, disabled_bg, disabled_fg, disabled_opacity)


def _colour(colours: dict[str, Rgba], name: str | None) -> Rgba | None:
    if name is None or name in NO_FILL:
        return None
    return colours.get(f"color-{name}")


def _with_alpha(colour: Rgba, alpha: float) -> Rgba:
    return Rgba(colour.r, colour.g, colour.b, alpha)


def variant_findings(
    colours: dict[str, Rgba],
    containers: dict[str, Rgba],
    theme: str,
    tables: list[tuple[str, Variant]],
) -> list[Finding]:
    findings: list[Finding] = []
    for where, variant in tables:
        declared = declare(f"{variant.base} {variant.classes}")
        findings.extend(_fill_pair(colours, containers, theme, where, variant, declared))
        findings.extend(_container_collision(colours, containers, theme, where, variant, declared))
        findings.extend(_disabled_state(colours, containers, theme, where, variant, declared))
    return findings


def _fill_pair(
    colours: dict[str, Rgba],
    containers: dict[str, Rgba],
    theme: str,
    where: str,
    variant: Variant,
    declared: Declared,
) -> list[Finding]:
    """R6 — a variant's label reaches AA on the fill the variant paints."""
    fill = _colour(colours, declared.bg)
    label = _colour(colours, declared.fg)
    if fill is None or label is None:
        return []
    worst: tuple[float, Rgba] | None = None
    for container in containers.values():
        surface = over(_with_alpha(fill, declared.bg_alpha), container)
        gap = contrast(label, surface)
        if worst is None or gap < worst[0]:
            worst = (gap, surface)
    assert worst is not None
    gap, surface = worst
    if gap >= BODY_MIN:
        return []
    return [
        Finding(
            f"R6|{theme}|{where}|text-{declared.fg}/bg-{declared.bg}",
            "R6",
            theme,
            where,
            f"{variant.group}.{variant.name}: text-{declared.fg} {describe(label)} on "
            f"bg-{declared.bg} {describe(surface)} = {gap:.2f}:1 (needs {BODY_MIN}:1)",
        )
    ]


def _container_collision(
    colours: dict[str, Rgba],
    containers: dict[str, Rgba],
    theme: str,
    where: str,
    variant: Variant,
    declared: Declared,
) -> list[Finding]:
    """R7 — a variant that fills with the container's own colour has no shape."""
    fill = _colour(colours, declared.bg)
    if fill is None or declared.bg_alpha < 1.0:
        return []
    for container_name, container in containers.items():
        if describe(fill) != describe(container):
            continue
        return [
            Finding(
                f"R7|{theme}|{where}|bg-{declared.bg}",
                "R7",
                theme,
                where,
                f"{variant.group}.{variant.name}: bg-{declared.bg} {describe(fill)} equals "
                f"the container {container_name[len('color-surface-') :]} — the button "
                f"is invisible on its own parent",
            )
        ]
    return []


def _disabled_state(
    colours: dict[str, Rgba],
    containers: dict[str, Rgba],
    theme: str,
    where: str,
    variant: Variant,
    declared: Declared,
) -> list[Finding]:
    """R8 — a disabled label stays readable after the opacity is composited."""
    label = _colour(colours, declared.disabled_fg or declared.fg)
    if label is None:
        return []
    fill = _colour(colours, declared.disabled_bg or declared.bg)
    alpha = declared.disabled_opacity
    worst: tuple[float, Rgba, Rgba] | None = None
    for container in containers.values():
        surface = over(fill, container) if fill is not None else container
        text = label
        if alpha is not None:
            surface = over(_with_alpha(surface, alpha), container)
            text = over(_with_alpha(label, alpha), container)
        gap = contrast(text, surface)
        if worst is None or gap < worst[0]:
            worst = (gap, text, surface)
    assert worst is not None
    gap, text, surface = worst
    if gap >= DISABLED_MIN:
        return []
    opacity = " no" if alpha is None else f" at opacity-{int(alpha * 100)}"
    return [
        Finding(
            f"R8|{theme}|{where}|disabled",
            "R8",
            theme,
            where,
            f"{variant.group}.{variant.name}: disabled label {describe(text)} on "
            f"{describe(surface)}{opacity} = {gap:.2f}:1 (needs {DISABLED_MIN}:1)",
        )
    ]
