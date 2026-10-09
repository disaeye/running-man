from __future__ import annotations

from dataclasses import dataclass, replace

Json = dict[str, "Json"] | list["Json"] | str | int | float | bool | None
Schema = dict[str, Json]
Document = dict[str, Json]


@dataclass(frozen=True, slots=True)
class Diagnostic:
    path: str
    method: str
    status: str
    content_type: str
    code: str
    schema_path: str
    message: str


def mapping(value: Json | None) -> Schema | None:
    return value if isinstance(value, dict) else None


def schema_differences(
    baseline: Json | None,
    candidate: Json | None,
    baseline_document: Document,
    candidate_document: Document,
    context: Diagnostic,
    active_refs: frozenset[str] = frozenset(),
) -> list[Diagnostic]:
    baseline_schema = _resolved_schema(baseline, baseline_document)
    candidate_schema = _resolved_schema(candidate, candidate_document)
    if baseline_schema is None or candidate_schema is None:
        return [_diagnostic(context, "changed_schema", "schema reference changed or is unresolved")]
    reference = _schema_reference(baseline)
    if reference is not None and reference in active_refs:
        return []
    next_refs = active_refs | ({reference} if reference else frozenset())
    if any(
        baseline_schema.get(key) != candidate_schema.get(key)
        for key in ("type", "format", "const")
    ):
        return [_diagnostic(context, "changed_schema", "primitive type, format, or const changed")]
    diagnostics = _enum_differences(baseline_schema, candidate_schema, context)
    diagnostics.extend(
        _property_differences(
            baseline_schema,
            candidate_schema,
            baseline_document,
            candidate_document,
            context,
            next_refs,
        )
    )
    return diagnostics + _item_differences(
        baseline_schema,
        candidate_schema,
        baseline_document,
        candidate_document,
        context,
        next_refs,
    )


def _resolved_schema(schema: Json | None, document: Document) -> Schema | None:
    resolved = mapping(schema)
    if resolved is None:
        return None
    reference = resolved.get("$ref")
    if not isinstance(reference, str):
        return resolved
    prefix = "#/components/schemas/"
    if not reference.startswith(prefix):
        return None
    components = mapping(document.get("components"))
    schemas = mapping(components.get("schemas") if components else None)
    return mapping(schemas.get(reference.removeprefix(prefix)) if schemas else None)


def _schema_reference(schema: Json | None) -> str | None:
    mapped = mapping(schema)
    reference = mapped.get("$ref") if mapped else None
    return reference if isinstance(reference, str) else None


def _diagnostic(context: Diagnostic, code: str, message: str) -> Diagnostic:
    return replace(context, code=code, message=message)


def _string_values(value: Json | None) -> set[str]:
    return {item for item in value if isinstance(item, str)} if isinstance(value, list) else set()


def _enum_differences(
    baseline: Schema, candidate: Schema, context: Diagnostic
) -> list[Diagnostic]:
    baseline_values = baseline.get("enum")
    candidate_values = candidate.get("enum")
    values_removed = isinstance(baseline_values, list) and (
        not isinstance(candidate_values, list)
        or not set(baseline_values) <= set(candidate_values)
    )
    if values_removed:
        return [_diagnostic(context, "removed_enum_value", "enum values were removed")]
    return []


def _property_differences(
    baseline: Schema,
    candidate: Schema,
    baseline_document: Document,
    candidate_document: Document,
    context: Diagnostic,
    active_refs: frozenset[str],
) -> list[Diagnostic]:
    baseline_properties = mapping(baseline.get("properties"))
    if baseline_properties is None:
        return []
    candidate_properties = mapping(candidate.get("properties")) or {}
    baseline_required = _string_values(baseline.get("required"))
    candidate_required = _string_values(candidate.get("required"))
    diagnostics: list[Diagnostic] = []
    for name, baseline_property in sorted(baseline_properties.items()):
        property_context = replace(context, schema_path=f"{context.schema_path}/properties/{name}")
        candidate_property = candidate_properties.get(name)
        if candidate_property is None:
            diagnostics.append(
                _diagnostic(property_context, "removed_property", "response property was removed")
            )
            continue
        if name in baseline_required and name not in candidate_required:
            diagnostics.append(
                _diagnostic(
                    property_context,
                    "required_property_relaxed",
                    "required response property is no longer required",
                )
            )
        diagnostics.extend(
            schema_differences(
                baseline_property,
                candidate_property,
                baseline_document,
                candidate_document,
                property_context,
                active_refs,
            )
        )
    return diagnostics


def _item_differences(
    baseline: Schema,
    candidate: Schema,
    baseline_document: Document,
    candidate_document: Document,
    context: Diagnostic,
    active_refs: frozenset[str],
) -> list[Diagnostic]:
    baseline_items = mapping(baseline.get("items"))
    if baseline_items is None:
        return []
    return schema_differences(
        baseline_items,
        candidate.get("items"),
        baseline_document,
        candidate_document,
        replace(context, schema_path=f"{context.schema_path}/items"),
        active_refs,
    )
