"""The error envelope: what leaves the API when something fails.

Pinned here because the web client reads this shape: a code, a message it can
show, the fields that were wrong, and the request id that finds the traceback.
A 500 used to leave as a bare headerless response, so the client reported a
missing ``X-API-Version`` instead of the failure, and the athlete was told
nothing they could act on.
"""

from __future__ import annotations

import psycopg
import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient

from presentation.errors import register_error_handlers
from presentation.middleware import ApiVersionHeaderMiddleware, ErrorHandlingMiddleware

pytestmark = pytest.mark.no_db

SECRET_DETAIL = 'relation "athletes" does not exist at character 42'


def _build_app() -> FastAPI:
    app = FastAPI()
    register_error_handlers(app)
    app.add_middleware(ApiVersionHeaderMiddleware)
    app.add_middleware(ErrorHandlingMiddleware)

    @app.get("/boom")
    async def boom() -> dict[str, str]:
        raise RuntimeError(SECRET_DETAIL)

    @app.get("/bad-value")
    async def bad_value() -> dict[str, str]:
        raise psycopg.errors.DataError(SECRET_DETAIL)

    @app.get("/duplicate")
    async def duplicate() -> dict[str, str]:
        raise psycopg.errors.UniqueViolation(SECRET_DETAIL)

    @app.get("/missing")
    async def missing() -> dict[str, str]:
        raise HTTPException(status_code=404, detail="goal not found")

    @app.get("/validated")
    async def validated(age: int, sex: str) -> dict[str, int]:
        return {"age": age, "sex": len(sex)}

    @app.get("/fine")
    async def fine() -> dict[str, bool]:
        return {"ok": True}

    return app


async def _get(app: FastAPI, path: str):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def test_an_unhandled_error_answers_json_without_revealing_the_cause() -> None:
    response = await _get(_build_app(), "/boom")

    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["message"] == "服务器处理这个请求时出错，请稍后重试。"
    assert body["error"]["request_id"]
    assert "does not exist" not in response.text
    assert "RuntimeError" not in response.text

    # A 500 has no payload contract, but the client checks the header before it
    # reads the body; without it, it reported a contract error rather than the
    # failure.
    assert response.headers["X-API-Version"] == "1"
    assert response.headers["X-Request-Id"] == body["error"]["request_id"]


async def test_a_value_the_database_cannot_hold_is_a_readable_422() -> None:
    response = await _get(_build_app(), "/bad-value")

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "DATA_ERROR"
    assert body["error"]["message"] == "提交的数据不符合字段要求，请检查后重试。"
    assert SECRET_DETAIL not in response.text


async def test_a_constraint_conflict_is_a_readable_409() -> None:
    response = await _get(_build_app(), "/duplicate")

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "CONFLICT"
    assert body["error"]["message"] == "这次修改与已有数据冲突，请刷新后重试。"
    assert SECRET_DETAIL not in response.text


async def test_a_router_404_keeps_its_code_and_detail() -> None:
    response = await _get(_build_app(), "/missing")

    assert response.status_code == 404
    assert response.json()["error"] == {
        "code": "NOT_FOUND",
        "message": "goal not found",
        "request_id": response.json()["error"]["request_id"],
    }


async def test_invalid_query_values_name_the_field_in_chinese() -> None:
    response = await _get(_build_app(), "/validated?age=abc&sex=female")

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["message"] == "请求参数有误：age"
    assert body["error"]["fields"] == [{"field": "age", "message": "需要是整数"}]


async def test_every_response_carries_a_request_id() -> None:
    response = await _get(_build_app(), "/fine")

    assert response.status_code == 200
    assert len(response.headers["X-Request-Id"]) == 12
