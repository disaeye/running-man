from fastapi import FastAPI


def _operation(schema: dict[str, object], operation_id: str) -> dict[str, object]:
    return {
        "get": {
            "operationId": operation_id,
            "responses": {"200": {"content": {"application/json": {"schema": schema}}}},
        }
    }


class TopLevelJsonDocumentApp(FastAPI):
    def openapi(self) -> dict[str, object]:
        document = {
            "anyOf": [
                {
                    "type": "object",
                    "additionalProperties": {"$ref": "#/components/schemas/JsonDocument"},
                },
                {"type": "array", "items": {"$ref": "#/components/schemas/JsonDocument"}},
                {"type": "string"},
            ]
        }
        return {
            "paths": {
                "/api/v1/document": _operation(
                    {"$ref": "#/components/schemas/JsonDocument"}, "document"
                ),
                "/api/v1/document-alias": _operation(
                    {"$ref": "#/components/schemas/Alias"}, "document_alias"
                ),
                "/api/v1/unapproved-nested-map": _operation(
                    {
                        "type": "object",
                        "properties": {"payload": {"$ref": "#/components/schemas/JsonDocument"}},
                    },
                    "unapproved_nested_map",
                ),
            },
            "components": {
                "schemas": {
                    "Alias": {"allOf": [{"$ref": "#/components/schemas/JsonDocument"}]},
                    "JsonDocument": document,
                }
            },
        }


top_level_json_document_app = TopLevelJsonDocumentApp()


class InvalidKeywordApp(FastAPI):
    def openapi(self) -> dict[str, object]:
        schemas = {
            "pattern": {"type": "object", "properties": {"known": {"type": "string"}}, "patternProperties": {".*": {"type": "string"}}},
            "items": {"type": "string", "items": {}},
            "prefix": {"type": "string", "prefixItems": []},
            "properties": {"type": "string", "properties": {}},
            "minimum": {"type": "string", "minimum": 0},
            "unsupported": {"type": "object", "unevaluatedProperties": False, "contains": {}, "not": {}, "if": {}, "$defs": {}, "nullable": True, "x-fake": True, "unknown": True},
            "conflict": {"type": "array", "items": {"type": "string"}, "prefixItems": [{"type": "string"}]},
        }
        return {
            "paths": {f"/api/v1/{name}": _operation(schema, name) for name, schema in schemas.items()},
            "components": {"schemas": {}},
        }


invalid_keyword_app = InvalidKeywordApp()


class ReferenceDefaultApp(FastAPI):
    def openapi(self) -> dict[str, object]:
        return {
            "paths": {"/api/v1/ref-default": _operation({"$ref": "#/components/schemas/Text", "default": "ok"}, "ref_default")},
            "components": {"schemas": {"Text": {"type": "string"}}},
        }


reference_default_app = ReferenceDefaultApp()
