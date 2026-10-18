"""Colour maths and token extraction for `scripts/check_contrast.py`.

Split out to keep the gate within the repository's 250-line limit.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Final

HEX: Final = re.compile(r"^#(?P<rgb>[0-9a-fA-F]{6})$")
RGBA: Final = re.compile(
    r"^rgba?\(\s*(?P<r>\d+)\s*,\s*(?P<g>\d+)\s*,\s*(?P<b>\d+)\s*(?:,\s*(?P<a>[\d.]+)\s*)?\)$"
)
DECLARATION: Final = re.compile(r"^\s*--color-(?P<name>[a-z0-9-]+)\s*:\s*(?P<value>[^;]+);")


@dataclass(frozen=True, slots=True)
class Rgba:
    r: int
    g: int
    b: int
    a: float = 1.0


def parse_colour(value: str) -> Rgba | None:
    text = value.strip()
    hex_match = HEX.match(text)
    if hex_match:
        digits = hex_match.group("rgb")
        return Rgba(int(digits[0:2], 16), int(digits[2:4], 16), int(digits[4:6], 16))
    rgba_match = RGBA.match(text)
    if rgba_match:
        return Rgba(
            int(rgba_match.group("r")),
            int(rgba_match.group("g")),
            int(rgba_match.group("b")),
            float(rgba_match.group("a") or 1.0),
        )
    return None


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


def tokens(css: str, selector: str) -> dict[str, Rgba]:
    """Direct `--color-<name>: <colour>` declarations in one block.

    `var(...)` indirection and `@theme inline` are skipped: those re-export a
    value declared here, so reading them would compare a token to itself.
    """
    found: dict[str, Rgba] = {}
    for line in block(css, selector).splitlines():
        match = DECLARATION.match(line)
        if match is None:
            continue
        colour = parse_colour(match.group("value"))
        if colour is not None:
            found[f"color-{match.group('name')}"] = colour
    return found


def _linear(value: int) -> float:
    channel = value / 255.0
    return channel / 12.92 if channel <= 0.03928 else ((channel + 0.055) / 1.055) ** 2.4


def luminance(colour: Rgba) -> float:
    return 0.2126 * _linear(colour.r) + 0.7152 * _linear(colour.g) + 0.0722 * _linear(colour.b)


def contrast(first: Rgba, second: Rgba) -> float:
    high, low = sorted((luminance(first), luminance(second)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def over(colour: Rgba, background: Rgba) -> Rgba:
    """Composite a translucent colour onto an opaque one."""
    if colour.a >= 1.0:
        return colour
    return Rgba(
        round(colour.r * colour.a + background.r * (1 - colour.a)),
        round(colour.g * colour.a + background.g * (1 - colour.a)),
        round(colour.b * colour.a + background.b * (1 - colour.a)),
    )


def describe(colour: Rgba) -> str:
    if colour.a >= 1.0:
        return f"#{colour.r:02x}{colour.g:02x}{colour.b:02x}"
    return f"rgba({colour.r}, {colour.g}, {colour.b}, {colour.a:g})"


def class_literals(path: Path) -> list[tuple[int, str]]:
    """String literals that carry class names, one entry per literal.

    A line usually holds several elements, so joining everything on it pairs a
    text class with a background that belongs to a sibling. Each complete literal
    is one element's class list, which is the only pairing worth measuring.
    """
    text = path.read_text(encoding="utf-8")
    results: list[tuple[int, str]] = []
    index = 0
    line = 1
    length = len(text)
    while index < length:
        char = text[index]
        if char == "\n":
            line += 1
            index += 1
            continue
        if char not in "\"'`":
            index += 1
            continue
        quote = char
        start_line = line
        buffer: list[str] = []
        cursor = index + 1
        while cursor < length:
            current = text[cursor]
            if current == "\\":
                buffer.append(text[cursor : cursor + 2])
                cursor += 2
                continue
            if current == quote:
                break
            if current == "\n":
                line += 1
                if quote != "`":
                    break
            buffer.append(current)
            cursor += 1
        prefix = text[max(0, index - 40) : index]
        if "className" in prefix or "cn(" in prefix or "clsx(" in prefix:
            results.append((start_line, "".join(buffer)))
        index = cursor + 1
    return results


@dataclass(frozen=True, slots=True)
class Finding:
    key: str
    rule: str
    theme: str
    where: str
    detail: str
