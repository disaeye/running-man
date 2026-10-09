"""Unified error types and exception handlers for FastAPI.

All API errors are returned in a consistent JSON shape:

    {"error": {"code": "NOT_FOUND", "message": "..."}, "detail": "..."}

Backward-compat: every response also includes ``detail`` at the top level so the
frontend error parser in ``apps/web/lib/api.ts`` still works without changes.
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    """Base application error with structured JSON response."""

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


# ── HTTP status → error code mapping for legacy HTTPException compatibility ──

_HTTP_TO_CODE: dict[int, str] = {
    400: "VALIDATION_ERROR",
    401: "AUTH_ERROR",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "TOO_MANY_REQUESTS",
}


def _unified_body(code: str, message: str) -> dict[str, object]:
    return {
        "error": {"code": code, "message": message},
        "detail": message,
    }


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        content=_unified_body(exc.code, exc.message),
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = _HTTP_TO_CODE.get(exc.status_code, "ERROR")
    detail_str = str(exc.detail) if exc.detail is not None else ""
    return JSONResponse(
        status_code=exc.status_code,
        content=_unified_body(code, detail_str),
    )


async def request_validation_error_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=_unified_body("VALIDATION_ERROR", "request validation failed"),
    )


def register_error_handlers(app: FastAPI) -> None:
    """Register exception handlers on a FastAPI application."""
    # type ignores below: basedpyright overstrict with FastAPI ExceptionHandler
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, request_validation_error_handler)  # type: ignore[arg-type]
