from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

Json = dict[str, "Json"] | list["Json"] | str | int | float | bool | None
Diagnostic = TypeVar("Diagnostic")


def collection_diagnostics(
    schema: dict[str, Json],
    schema_path: str,
    visit: Callable[[Json, str], list[Diagnostic]],
    diagnostic: Callable[[str, str], Diagnostic],
) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    if schema.get("type") == "array":
        diagnostics.extend(_array_diagnostics(schema, schema_path, visit, diagnostic))
    for keyword in ("allOf", "anyOf", "oneOf"):
        diagnostics.extend(_combiner_diagnostics(schema, schema_path, keyword, visit, diagnostic))
    if "enum" in schema:
        enum_values = schema.get("enum")
        if not isinstance(enum_values, list) or not enum_values:
            diagnostics.append(diagnostic("empty_enum_schema", "enum must not be empty"))
    return diagnostics


def _array_diagnostics(
    schema: dict[str, Json],
    schema_path: str,
    visit: Callable[[Json, str], list[Diagnostic]],
    diagnostic: Callable[[str, str], Diagnostic],
) -> list[Diagnostic]:
    if "prefixItems" in schema:
        prefix_items = schema["prefixItems"]
        if not isinstance(prefix_items, list) or not prefix_items:
            return [
                diagnostic("empty_prefix_items_schema", "array prefixItems must not be empty")
            ]
        diagnostics: list[Diagnostic] = []
        for index, item in enumerate(prefix_items):
            diagnostics.extend(visit(item, f"{schema_path}/prefixItems/{index}"))
        return diagnostics
    items = schema.get("items")
    if items is None:
        return [diagnostic("bare_array_items", "array has no items schema")]
    return visit(items, f"{schema_path}/items")


def _combiner_diagnostics(
    schema: dict[str, Json],
    schema_path: str,
    keyword: str,
    visit: Callable[[Json, str], list[Diagnostic]],
    diagnostic: Callable[[str, str], Diagnostic],
) -> list[Diagnostic]:
    if keyword not in schema:
        return []
    variants = schema.get(keyword)
    if not isinstance(variants, list) or not variants:
        return [diagnostic("empty_combiner_schema", f"{keyword} must not be empty")]
    diagnostics: list[Diagnostic] = []
    for index, variant in enumerate(variants):
        diagnostics.extend(visit(variant, f"{schema_path}/{keyword}/{index}"))
    return diagnostics
