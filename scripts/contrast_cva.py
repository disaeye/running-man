"""Reading `cva` variant tables out of TypeScript source.

A variant table is a fixed set of class strings with no control flow, so a text
scan reads it exactly as the browser receives it — unlike a JSX `className`,
where one template literal holds both branches of a ternary.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Final

CVA_CALL: Final = re.compile(r"\bcva\(")
VARIANTS_KEY: Final = re.compile(r"\bvariants\s*:\s*\{")
GROUP_KEY: Final = re.compile(r"(?P<group>[A-Za-z_][\w]*)\s*:\s*\{")
ENTRY_KEY: Final = re.compile(r"(?P<name>[A-Za-z_][\w-]*|\"[^\"]+\"|'[^']+')\s*:\s*")


@dataclass(frozen=True, slots=True)
class Variant:
    """One named entry of a `cva` variants table."""

    group: str
    name: str
    classes: str
    base: str


def braced(text: str, open_index: int) -> str:
    """Body of the `{...}` that starts at `open_index`."""
    depth = 0
    for index in range(open_index, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                return text[open_index + 1 : index]
    return ""


def literal_at(text: str, start: int) -> tuple[str, int]:
    """The string literal beginning at or after `start`, plus where it ended.

    Handles `"a" + "b"` concatenation, which the surrounding code style uses to
    keep variant tables readable.
    """
    index = start
    while index < len(text) and text[index] in " \t\n":
        index += 1
    pieces: list[str] = []
    while index < len(text) and text[index] in "\"'`":
        quote = text[index]
        cursor = index + 1
        buffer: list[str] = []
        while cursor < len(text):
            char = text[cursor]
            if char == "\\":
                buffer.append(text[cursor : cursor + 2])
                cursor += 2
                continue
            if char == quote:
                break
            buffer.append(char)
            cursor += 1
        pieces.append("".join(buffer))
        index = cursor + 1
        while index < len(text) and text[index] in " \t\n":
            index += 1
        if index < len(text) and text[index] == "+":
            index += 1
            continue
        break
    return " ".join(pieces), index


def cva_variants(text: str) -> list[Variant]:
    """Every variant entry declared by a `cva` table in one file."""
    variants: list[Variant] = []
    for call in CVA_CALL.finditer(text):
        base, _ = literal_at(text, call.end())
        for key in VARIANTS_KEY.finditer(text, call.end()):
            body = braced(text, key.end() - 1)
            for group_match in GROUP_KEY.finditer(body):
                group = group_match.group("group")
                group_body = braced(body, group_match.end() - 1)
                cursor = 0
                while True:
                    entry = ENTRY_KEY.search(group_body, cursor)
                    if entry is None:
                        break
                    classes, cursor = literal_at(group_body, entry.end())
                    name = entry.group("name").strip("\"'")
                    if classes:
                        variants.append(Variant(group, name, classes, base))
            break
    return variants
