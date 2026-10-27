"""Unified error envelope and exception handlers for the API.

Every failure — a 404 from a router, a validation error, a database constraint,
or an unhandled bug — leaves as JSON:

    {
      "error": {"code": "NOT_FOUND", "message": "...", "fields": [...],
                "request_id": "3f9c1a2b4d5e"},
      "detail": "..."          # same string, kept for older clients
    }

Three rules hold for every handler here:

- ``message`` is safe to show to the person using the app. It names what went
  wrong in Chinese where the situation has a user-facing explanation, and never
  contains SQL, driver text, stack frames, or another athlete's data.
- A 500 never carries the exception text. The body says the server failed and
  carries the request id; the traceback goes to the log under that same id, so
  an error the athlete reports can be found without guessing.
- The response is JSON and carries ``X-API-Version`` (see
  ``ErrorHandlingMiddleware``), so the web client's contract check reads the
  error body instead of reporting a missing header.
"""

from __future__ import annotations

import logging
from typing import Final, cast

import psycopg
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

INTERNAL_ERROR_MESSAGE: Final = "服务器处理这个请求时出错，请稍后重试。"
DB_DATA_ERROR_MESSAGE: Final = "提交的数据不符合字段要求，请检查后重试。"
DB_CONFLICT_MESSAGE: Final = "这次修改与已有数据冲突，请刷新后重试。"


class AppError(Exception):
    """Base application error with a structured JSON response."""

    code: str
    status: int
    message: str
    detail: dict[str, object] | None

    def __init__(
        self,
        code: str = "ERROR",
        status: int = 400,
        message: str = "",
        detail: dict[str, object] | None = None,
    ) -> None:
        self.code = code
        self.status = status
        self.message = message
        self.detail = detail
        super().__init__(message)


class NotFoundError(AppError):
    """404 — resource does not exist."""

    def __init__(
        self, message: str = "resource not found", detail: dict[str, object] | None = None
    ) -> None:
        super().__init__(code="NOT_FOUND", status=404, message=message, detail=detail)


class ValidationError(AppError):
    """400 — request payload failed validation."""

    def __init__(
        self, message: str = "validation failed", detail: dict[str, object] | None = None
    ) -> None:
        super().__init__(code="VALIDATION_ERROR", status=400, message=message, detail=detail)


class AuthError(AppError):
    """401 — missing or invalid authentication."""

    def __init__(
        self, message: str = "unauthorized", detail: dict[str, object] | None = None
    ) -> None:
        super().__init__(code="AUTH_ERROR", status=401, message=message, detail=detail)


class ConflictError(AppError):
    """409 — resource already exists / state conflict."""

    def __init__(self, message: str = "conflict", detail: dict[str, object] | None = None) -> None:
        super().__init__(code="CONFLICT", status=409, message=message, detail=detail)


_HTTP_TO_CODE: dict[int, str] = {
    400: "VALIDATION_ERROR",
    401: "AUTH_ERROR",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "TOO_MANY_REQUESTS",
}


def request_id_of(request: Request) -> str | None:
    """The id ``ErrorHandlingMiddleware`` stamped on this request, if any."""
    value = getattr(request.state, "request_id", None)
    return value if isinstance(value, str) and value else None


def unified_body(
    code: str,
    message: str,
    *,
    fields: list[dict[str, str]] | None = None,
    request_id: str | None = None,
) -> dict[str, object]:
    """The one envelope every error response uses."""
    error: dict[str, object] = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    if request_id:
        error["request_id"] = request_id
    return {"error": error, "detail": message}


def _response(
    status: int,
    code: str,
    message: str,
    request: Request,
    fields: list[dict[str, str]] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=unified_body(code, message, fields=fields, request_id=request_id_of(request)),
    )


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return _response(exc.status, exc.code, exc.message, request)


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = _HTTP_TO_CODE.get(exc.status_code, "ERROR")
    message = exc.detail if isinstance(exc.detail, str) else str(exc.detail or "")
    return _response(exc.status_code, code, message, request)


_FIELD_HINTS: Final[dict[str, str]] = {
    "missing": "不能为空",
    "literal_error": "取值不在允许范围内",
    "int_parsing": "需要是整数",
    "float_parsing": "需要是数字",
    "date_parsing": "需要是日期",
    "bool_parsing": "需要是布尔值",
    "string_type": "需要是文本",
    "greater_than": "需要大于下限",
    "greater_than_equal": "不能小于下限",
    "less_than": "需要小于上限",
    "less_than_equal": "不能大于上限",
}


def _field_name(location: tuple[object, ...]) -> str:
    """``("body", "sex")`` → ``sex``; indexes render as ``rows[0]``."""
    parts = [str(part) for part in location if part not in ("body", "query", "path", "header")]
    if not parts:
        return "请求体"
    name = parts[0]
    for index in parts[1:]:
        name = f"{name}[{index}]" if index.isdigit() else f"{name}.{index}"
    return name


def _field_hint(error: dict[str, object]) -> str:
    kind = str(error.get("type", ""))
    hint = _FIELD_HINTS.get(kind)
    if hint:
        return hint
    # A pydantic message is English but specific; it never carries request data
    # beyond the offending value's type, so it is safe to pass along.
    message = error.get("msg")
    return str(message) if isinstance(message, str) and message else "取值不符合要求"


async def request_validation_error_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    fields = [
        {
            "field": _field_name(cast(tuple[object, ...], error.get("loc", ()))),
            "message": _field_hint(cast(dict[str, object], error)),
        }
        for error in exc.errors()
    ]
    names = "、".join(sorted({field["field"] for field in fields}))
    message = f"请求参数有误：{names}" if names else "请求参数有误"
    return _response(422, "VALIDATION_ERROR", message, request, fields=fields)


async def data_error_handler(request: Request, exc: psycopg.errors.DataError) -> JSONResponse:
    """A value the column cannot hold — the caller sent something out of range."""
    logger.warning(
        "database rejected a value request_id=%s path=%s error=%s sqlstate=%s",
        request_id_of(request),
        request.url.path,
        type(exc).__name__,
        getattr(exc, "sqlstate", None),
    )
    return _response(422, "DATA_ERROR", DB_DATA_ERROR_MESSAGE, request)


async def integrity_error_handler(
    request: Request, exc: psycopg.errors.IntegrityError
) -> JSONResponse:
    """A constraint the write could not satisfy: duplicate, missing parent, bad enum."""
    logger.warning(
        "database rejected a write request_id=%s path=%s error=%s sqlstate=%s",
        request_id_of(request),
        request.url.path,
        type(exc).__name__,
        getattr(exc, "sqlstate", None),
    )
    return _response(409, "CONFLICT", DB_CONFLICT_MESSAGE, request)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Last resort for handlers Starlette routes here.

    ``ErrorHandlingMiddleware`` normally catches first and owns the response
    headers; this keeps the same envelope if a handler is ever invoked directly.
    """
    logger.exception(
        "unhandled error request_id=%s path=%s error=%s",
        request_id_of(request),
        request.url.path,
        type(exc).__name__,
    )
    return _response(500, "INTERNAL_ERROR", INTERNAL_ERROR_MESSAGE, request)


def register_error_handlers(app: FastAPI) -> None:
    """Register exception handlers on a FastAPI application."""
    # type ignores below: basedpyright overstrict with FastAPI ExceptionHandler
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, request_validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(psycopg.errors.DataError, data_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(psycopg.errors.IntegrityError, integrity_error_handler)  # type: ignore[arg-type]
