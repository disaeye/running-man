from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from openapi_schema_collections import collection_diagnostics
from openapi_schema_keywords import keyword_diagnostics

Json = dict[str, "Json"] | list["Json"] | str | int | float | bool | None
Diagnostic = TypeVar("Diagnostic")
CONCRETE_SCHEMA_KEYWORDS = frozenset({"$ref", "type", "oneOf", "anyOf", "allOf", "enum", "const"})


def schema_diagnostics(
    schema: Json,
    components: dict[str, Json],
    schema_path: str,
    top_level: bool,
    diagnostic: Callable[[str, str, str], Diagnostic],
    approved_map_paths: frozenset[str],
    active_refs: frozenset[str] = frozenset(),
) -> list[Diagnostic]:
    if not isinstance(schema, dict) or not schema:
        return [diagnostic("empty_schema", schema_path, "schema is empty")]
    diagnostics = keyword_diagnostics(
        schema, schema_path, lambda code, message: diagnostic(code, schema_path, message)
    )
    reference_diagnostics = _reference_diagnostics(
        schema,
        components,
        schema_path,
        top_level,
        diagnostic,
        approved_map_paths,
        active_refs,
    )
    if reference_diagnostics is not None:
        return diagnostics + reference_diagnostics + _sibling_diagnostics(
            schema, components, schema_path, diagnostic, approved_map_paths, active_refs
        )
    if not CONCRETE_SCHEMA_KEYWORDS.intersection(schema):
        return [
            *diagnostics,
            diagnostic("non_concrete_schema", schema_path, "schema has no structural keyword"),
        ]
    return diagnostics + _local_diagnostics(
        schema, components, schema_path, top_level, diagnostic, approved_map_paths, active_refs
    )


def _reference_diagnostics(
    schema: dict[str, Json],
    components: dict[str, Json],
    schema_path: str,
    top_level: bool,
    diagnostic: Callable[[str, str, str], Diagnostic],
    approved_map_paths: frozenset[str],
    active_refs: frozenset[str],
) -> list[Diagnostic] | None:
    if "$ref" not in schema:
        return None
    reference = schema.get("$ref")
    if not isinstance(reference, str) or not reference.startswith("#/components/schemas/"):
        return [diagnostic("invalid_ref", schema_path, "$ref must be a local schema reference")]
    name = reference.removeprefix("#/components/schemas/")
    resolved = components.get(name)
    if not isinstance(resolved, dict):
        return [diagnostic("unresolved_ref", schema_path, reference)]
    if reference in active_refs:
        if _has_concrete_terminal(resolved, components, active_refs):
            return []
        return [
            diagnostic(
                "recursive_ref", schema_path, "reference cycle has no concrete terminal schema"
            )
        ]
    diagnostics: list[Diagnostic] = []
    if top_level and _is_generic_map_document(resolved, components, active_refs):
        diagnostics.append(
            diagnostic("generic_map_schema", schema_path, "top-level map schemas are not approved")
        )
    diagnostics.extend(
        schema_diagnostics(
            resolved,
            components,
            schema_path,
            top_level,
            diagnostic,
            approved_map_paths,
            active_refs | {reference},
        )
    )
    return diagnostics


def _is_generic_map_document(
    schema: Json, components: dict[str, Json], active_refs: frozenset[str]
) -> bool:
    if not isinstance(schema, dict):
        return False
    reference = schema.get("$ref")
    if isinstance(reference, str) and reference.startswith("#/components/schemas/"):
        if reference in active_refs:
            return False
        resolved = components.get(reference.removeprefix("#/components/schemas/"))
        return _is_generic_map_document(resolved, components, active_refs | {reference})
    return any(
        _is_generic_map_variant(variant, components, active_refs)
        for keyword in ("allOf", "anyOf", "oneOf")
        for variant in _variants(schema, keyword)
    )


def _variants(schema: dict[str, Json], keyword: str) -> list[Json]:
    variants = schema.get(keyword)
    return variants if isinstance(variants, list) else []


def _is_generic_map_variant(
    variant: Json, components: dict[str, Json], active_refs: frozenset[str]
) -> bool:
    if not isinstance(variant, dict):
        return False
    if (
        variant.get("type") == "object"
        and isinstance(variant.get("additionalProperties"), dict)
        and "properties" not in variant
    ):
        return True
    return _is_generic_map_document(variant, components, active_refs)


def _sibling_diagnostics(
    schema: dict[str, Json],
    components: dict[str, Json],
    schema_path: str,
    diagnostic: Callable[[str, str, str], Diagnostic],
    approved_map_paths: frozenset[str],
    active_refs: frozenset[str],
) -> list[Diagnostic]:
    siblings = {key: value for key, value in schema.items() if key != "$ref"}
    if not siblings:
        return []
    return _local_diagnostics(
        siblings, components, schema_path, False, diagnostic, approved_map_paths, active_refs
    )


def _local_diagnostics(
    schema: dict[str, Json],
    components: dict[str, Json],
    schema_path: str,
    top_level: bool,
    diagnostic: Callable[[str, str, str], Diagnostic],
    approved_map_paths: frozenset[str],
    active_refs: frozenset[str],
) -> list[Diagnostic]:
    diagnostics = _object_diagnostics(
        schema, components, schema_path, top_level, diagnostic, approved_map_paths, active_refs
    )
    diagnostics.extend(
        collection_diagnostics(
            schema,
            schema_path,
            lambda nested, nested_path: schema_diagnostics(
                nested, components, nested_path, False, diagnostic, approved_map_paths, active_refs
            ),
            lambda code, message: diagnostic(code, schema_path, message),
        )
    )
    return diagnostics


def _object_diagnostics(
    schema: dict[str, Json],
    components: dict[str, Json],
    schema_path: str,
    top_level: bool,
    diagnostic: Callable[[str, str, str], Diagnostic],
    approved_map_paths: frozenset[str],
    active_refs: frozenset[str],
) -> list[Diagnostic]:
    if schema.get("type") != "object":
        return []
    diagnostics: list[Diagnostic] = []
    properties = schema.get("properties")
    additional_properties = schema.get("additionalProperties")
    if isinstance(additional_properties, dict):
        if schema_path not in approved_map_paths:
            diagnostics.append(
                diagnostic("generic_map_schema", schema_path, "map schemas are not approved")
            )
        diagnostics.extend(
            schema_diagnostics(
                additional_properties,
                components,
                f"{schema_path}/additionalProperties",
                False,
                diagnostic,
                approved_map_paths,
                active_refs,
            )
        )
    elif additional_properties is True:
        diagnostics.append(
            diagnostic(
                "additional_properties_true",
                schema_path,
                "additionalProperties must be typed",
            )
        )
    if isinstance(properties, dict):
        if not properties:
            diagnostics.append(
                diagnostic("empty_object_schema", schema_path, "object has no properties")
            )
        for name in sorted(properties):
            diagnostics.extend(
                schema_diagnostics(
                    properties[name],
                    components,
                    f"{schema_path}/properties/{name}",
                    False,
                    diagnostic,
                    approved_map_paths,
                    active_refs,
                )
            )
    elif not isinstance(additional_properties, dict):
        code = "generic_success_schema" if top_level else "bare_object"
        diagnostics.append(diagnostic(code, schema_path, "object has no concrete properties"))
    return diagnostics


def _has_concrete_terminal(
    schema: Json, components: dict[str, Json], active_refs: frozenset[str]
) -> bool:
    if not isinstance(schema, dict) or not schema:
        return False
    if (CONCRETE_SCHEMA_KEYWORDS - {"$ref"}).intersection(schema):
        return True
    reference = schema.get("$ref")
    if not isinstance(reference, str) or not reference.startswith("#/components/schemas/"):
        return False
    if reference in active_refs:
        return False
    resolved = components.get(reference.removeprefix("#/components/schemas/"))
    return _has_concrete_terminal(resolved, components, active_refs | {reference})
