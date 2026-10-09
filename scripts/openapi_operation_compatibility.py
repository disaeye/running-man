from __future__ import annotations

from openapi_schema_compatibility import Diagnostic, Document, Schema, mapping, schema_differences


def operation_differences(
    path: str,
    method: str,
    baseline: Schema,
    candidate: Schema,
    baseline_document: Document,
    candidate_document: Document,
) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    if baseline.get("operationId") != candidate.get("operationId"):
        diagnostics.append(
            Diagnostic(path, method, "", "", "changed_operation_id", "", "operationId changed")
        )
    baseline_responses = mapping(baseline.get("responses"))
    candidate_responses = mapping(candidate.get("responses"))
    if baseline_responses is None or candidate_responses is None:
        return diagnostics
    for status, baseline_response in sorted(baseline_responses.items()):
        if not status.startswith("2"):
            continue
        candidate_response = mapping(candidate_responses.get(status))
        baseline_response_map = mapping(baseline_response)
        if baseline_response_map is None or candidate_response is None:
            diagnostics.append(
                Diagnostic(
                    path,
                    method,
                    status,
                    "",
                    "missing_success_status",
                    "",
                    "baseline success response was removed",
                )
            )
            continue
        diagnostics.extend(
            response_differences(
                path,
                method,
                status,
                baseline_response_map,
                candidate_response,
                baseline_document,
                candidate_document,
            )
        )
    return diagnostics


def response_differences(
    path: str,
    method: str,
    status: str,
    baseline: Schema,
    candidate: Schema,
    baseline_document: Document,
    candidate_document: Document,
) -> list[Diagnostic]:
    baseline_content = mapping(baseline.get("content"))
    candidate_content = mapping(candidate.get("content"))
    if baseline_content is None or candidate_content is None:
        return []
    diagnostics: list[Diagnostic] = []
    for content_type, baseline_media in sorted(baseline_content.items()):
        candidate_media = mapping(candidate_content.get(content_type))
        baseline_media_map = mapping(baseline_media)
        if baseline_media_map is None or candidate_media is None:
            diagnostics.append(
                Diagnostic(
                    path,
                    method,
                    status,
                    content_type,
                    "missing_content_type",
                    "",
                    "baseline content type was removed",
                )
            )
            continue
        diagnostics.extend(
            schema_differences(
                baseline_media_map.get("schema"),
                candidate_media.get("schema"),
                baseline_document,
                candidate_document,
                Diagnostic(path, method, status, content_type, "", "/schema", ""),
            )
        )
    return diagnostics
