from fastapi import FastAPI
from fastapi.responses import Response

typed_map_app = FastAPI()


@typed_map_app.get("/api/v1/typed-map")
async def typed_map() -> dict[str, str]:
    return {"status": "ok"}


download_placeholder_app = FastAPI()


@download_placeholder_app.get(
    "/api/v1/export/activities.csv",
    response_class=Response,
    responses={
        200: {"content": {"application/json": {"schema": {"type": "object", "properties": {}}}}}
    },
)
async def download_placeholder() -> Response:
    return Response(content="{}", media_type="application/json")


empty_array_app = FastAPI()


@empty_array_app.get(
    "/api/v1/empty-array",
    response_class=Response,
    responses={200: {"content": {"application/json": {"schema": {"type": "array"}}}}},
)
async def empty_array() -> Response:
    return Response(content="[]", media_type="application/json")


title_only_app = FastAPI()


@title_only_app.get(
    "/api/v1/title-only",
    response_class=Response,
    responses={200: {"content": {"application/json": {"schema": {"title": "Pretend concrete"}}}}},
)
async def title_only() -> Response:
    return Response(content="{}", media_type="application/json")


title_item_app = FastAPI()


@title_item_app.get(
    "/api/v1/title-items",
    response_class=Response,
    responses={
        200: {
            "content": {
                "application/json": {
                    "schema": {"type": "array", "items": {"title": "Pretend item"}}
                }
            }
        }
    },
)
async def title_items() -> Response:
    return Response(content="[]", media_type="application/json")


empty_download_schema_app = FastAPI()


@empty_download_schema_app.get(
    "/api/v1/export/activities.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {"schema": {}}}}},
)
async def empty_download_schema() -> Response:
    return Response(content="activity_id\n", media_type="text/csv")


class EmptyCompositionApp(FastAPI):
    def openapi(self) -> dict[str, object]:
        return {
            "paths": {
                "/api/v1/empty-any-of": _operation({"anyOf": []}),
                "/api/v1/empty-one-of": _operation({"oneOf": []}),
                "/api/v1/empty-all-of": _operation({"allOf": []}),
                "/api/v1/empty-enum": _operation({"enum": []}),
                "/api/v1/empty-prefix-items": _operation(
                    {"type": "array", "prefixItems": []}
                ),
                "/api/v1/nested-empty-prefix-items": _operation(
                    {
                        "type": "array",
                        "items": {"type": "array", "prefixItems": []},
                    }
                ),
            },
            "components": {"schemas": {}},
        }


empty_composition_app = EmptyCompositionApp()


class RefSiblingApp(FastAPI):
    def openapi(self) -> dict[str, object]:
        reference = {"$ref": "#/components/schemas/Concrete"}
        schemas = {
            "any-of": reference | {"anyOf": []},
            "one-of": reference | {"oneOf": []},
            "all-of": reference | {"allOf": []},
            "enum": reference | {"enum": []},
            "empty-object": reference | {"type": "object", "properties": {}},
            "empty-items": {"type": "array", "items": reference | {"title": "Fake"}},
            "prefix-items": reference | {"type": "array", "prefixItems": []},
        }
        paths = {
            f"/api/v1/{name}": _operation(schema, operation_id=name)
            for name, schema in schemas.items()
        }
        paths["/api/v1/export/activities.csv"] = _operation(
            reference | {"allOf": []}, media_type="text/csv", operation_id="download"
        )
        return {
            "paths": paths,
            "components": {"schemas": {"Concrete": {"type": "string"}}},
        }


class ResetContentApp(FastAPI):
    def openapi(self) -> dict[str, object]:
        return {
            "paths": {
                "/api/v1/reset": {
                    "get": {"operationId": "reset", "responses": {"205": {}}}
                }
            },
            "components": {"schemas": {}},
        }


class UnapprovedNoContentApp(FastAPI):
    def openapi(self) -> dict[str, object]:
        return {
            "paths": {
                "/api/v1/unapproved-no-content": {
                    "get": {
                        "operationId": "unapproved_no_content",
                        "responses": {"204": {"description": "No Content"}},
                    }
                }
            },
            "components": {"schemas": {}},
        }


class UnusedEmptyComponentApp(FastAPI):
    def openapi(self) -> dict[str, object]:
        return {
            "paths": {"/api/v1/concrete": _operation({"type": "string"})},
            "components": {"schemas": {"JsonValue": {}}},
        }


class MapSchemaApp(FastAPI):
    def openapi(self) -> dict[str, object]:
        return {
            "paths": {
                "/api/v1/concrete": _operation(
                    {
                        "type": "object",
                        "properties": {
                            "nested": {
                                "type": "object",
                                "additionalProperties": {"type": "string"},
                            }
                        },
                    }
                )
            },
            "components": {
                "schemas": {
                    "UnusedTypedMap": {
                        "type": "object",
                        "additionalProperties": {"type": "string"},
                    }
                }
            },
        }


class NoContentBodyApp(FastAPI):
    def openapi(self) -> dict[str, object]:
        return {
            "paths": {
                "/api/v1/activities/{activity_id}": {
                    "delete": {
                        "operationId": "delete_activity",
                        "responses": {
                            "204": {"content": {"application/json": {"schema": {"title": "body"}}}}
                        },
                    }
                }
            },
            "components": {"schemas": {}},
        }


class InvalidReferenceApp(FastAPI):
    def openapi(self) -> dict[str, object]:
        return {
            "paths": {
                "/api/v1/cycle": _operation({"$ref": "#/components/schemas/A"}),
                "/api/v1/external": _operation({"$ref": "https://example.test/schema.json"}),
                "/api/v1/missing": _operation({"$ref": "#/components/schemas/Missing"}),
                "/api/v1/non-string": _operation({"$ref": None}),
            },
            "components": {
                "schemas": {
                    "A": {"$ref": "#/components/schemas/B"},
                    "B": {"$ref": "#/components/schemas/A"},
                }
            },
        }


def _operation(
    schema: dict[str, object],
    media_type: str = "application/json",
    operation_id: str = "probe",
) -> dict[str, object]:
    return {
        "get": {
            "operationId": operation_id,
            "responses": {"200": {"content": {media_type: {"schema": schema}}}},
        }
    }


ref_sibling_app = RefSiblingApp()
reset_content_app = ResetContentApp()
unapproved_no_content_app = UnapprovedNoContentApp()
unused_empty_component_app = UnusedEmptyComponentApp()
map_schema_app = MapSchemaApp()
no_content_body_app = NoContentBodyApp()
invalid_reference_app = InvalidReferenceApp()


class EmptyComponentApp(FastAPI):
    def openapi(self) -> dict[str, object]:
        return {
            "paths": {
                "/api/v1/empty-component": {
                    "get": {
                        "operationId": "empty_component",
                        "responses": {
                            "200": {
                                "content": {
                                    "application/json": {
                                        "schema": {"$ref": "#/components/schemas/JsonValue"}
                                    }
                                }
                            }
                        },
                    }
                }
            },
            "components": {"schemas": {"JsonValue": {}}},
        }


empty_component_app = EmptyComponentApp()
