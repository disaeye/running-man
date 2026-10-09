from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

Json = dict[str, "Json"] | list["Json"] | str | int | float | bool | None
Diagnostic = TypeVar("Diagnostic")
ANNOTATIONS = frozenset({"title", "description", "default"})
FAMILY_KEYS = {
    "object": frozenset(
        {"type", "properties", "required", "additionalProperties", "propertyNames", "enum", "const"}
    ),
    "array": frozenset({"type", "items", "prefixItems", "minItems", "maxItems", "enum", "const"}),
    "string": frozenset({"type", "minLength", "format", "contentMediaType", "enum", "const"}),
    "integer": frozenset({"type", "minimum", "maximum", "exclusiveMinimum", "enum", "const"}),
    "number": frozenset({"type", "minimum", "maximum", "exclusiveMinimum", "enum", "const"}),
    "boolean": frozenset({"type", "enum", "const"}),
    "null": frozenset({"type", "enum", "const"}),
}
COMBINERS = frozenset({"allOf", "anyOf", "oneOf"})


def keyword_diagnostics(
    schema: dict[str, Json], schema_path: str, diagnostic: Callable[[str, str], Diagnostic]
) -> list[Diagnostic]:
    allowed = _allowed_keys(schema)
    diagnostics = [
        diagnostic("unsupported_schema_keyword", f"unsupported schema keyword: {key}")
        for key in sorted(schema)
        if key not in allowed
    ]
    schema_type = schema.get("type")
    present_combiners = COMBINERS.intersection(schema)
    if len(present_combiners) > 1:
        diagnostics.append(
            diagnostic("invalid_schema_value", "schema cannot define multiple combiners")
        )
    if "type" in schema and (not isinstance(schema_type, str) or schema_type not in FAMILY_KEYS):
        diagnostics.append(diagnostic("invalid_schema_type", "schema type is not supported"))
    if isinstance(schema_type, str):
        diagnostics.extend(_value_diagnostics(schema, schema_type, diagnostic))
    return diagnostics


def _allowed_keys(schema: dict[str, Json]) -> frozenset[str]:
    if "$ref" in schema:
        return ANNOTATIONS | {"$ref"}
    present_combiners = COMBINERS.intersection(schema)
    if present_combiners:
        return ANNOTATIONS | {next(iter(present_combiners))}
    schema_type = schema.get("type")
    if isinstance(schema_type, str) and schema_type in FAMILY_KEYS:
        return ANNOTATIONS | FAMILY_KEYS[schema_type]
    return ANNOTATIONS


def _value_diagnostics(
    schema: dict[str, Json], schema_type: str, diagnostic: Callable[[str, str], Diagnostic]
) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    properties = schema.get("properties")
    required = schema.get("required")
    if "properties" in schema and not isinstance(properties, dict):
        diagnostics.append(diagnostic("invalid_schema_value", "properties must be an object"))
    if "required" in schema and not isinstance(required, list):
        diagnostics.append(diagnostic("invalid_schema_value", "required must be an array"))
    for keyword in ("minItems", "maxItems"):
        value = schema.get(keyword)
        if keyword in schema and (not isinstance(value, int) or value < 0):
            diagnostics.append(
                diagnostic("invalid_schema_value", f"{keyword} must be a non-negative integer")
            )
    if schema_type == "array" and "items" in schema and "prefixItems" in schema:
        diagnostics.append(
            diagnostic("invalid_schema_value", "array cannot define items and prefixItems")
        )
    return diagnostics
