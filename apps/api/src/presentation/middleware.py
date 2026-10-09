from collections.abc import AsyncIterable, Awaitable, Callable
from time import monotonic
from typing import Final, Protocol, TypeAlias, cast

from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse
from typing_extensions import override

from domain.auth.tokens import JWTError, decode_token
from infrastructure.auth.settings import settings

API_VERSION: Final = "1"
_CACHE_TTL_SECONDS: Final = 5.0
_SUCCESS_STATUS: Final = 200
_STRIPPED_CACHE_HEADERS: Final = {"content-length", "set-cookie"}
_CacheKey: TypeAlias = tuple[object, str, bytes, str]
_RawHeaders: TypeAlias = list[tuple[bytes, bytes]]
_ResponseCacheValue: TypeAlias = tuple[float, bytes, int, _RawHeaders]
_response_cache: dict[_CacheKey, _ResponseCacheValue] = {}


class _StreamingResponseLike(Protocol):
    body_iterator: AsyncIterable[bytes]


class ApiVersionHeaderMiddleware(BaseHTTPMiddleware):
    @override
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        response = await call_next(request)
        headers = MutableHeaders(raw=response.raw_headers)
        headers["X-API-Version"] = API_VERSION
        return response


class GetResponseCacheMiddleware(BaseHTTPMiddleware):
    @override
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if request.method != "GET":
            _response_cache.clear()
            return await call_next(request)
        if not request.url.path.startswith("/api/v1/") or _has_dependency_overrides(request):
            return await call_next(request)

        key = _cache_key(request)
        now = monotonic()
        cached = _response_cache.get(key)
        if cached is not None and now - cached[0] < _CACHE_TTL_SECONDS:
            _, body, status_code, raw_headers = cached
            return StreamingResponse(
                content=_single_chunk(body),
                status_code=status_code,
                headers=_cached_headers(raw_headers),
                media_type=_media_type(raw_headers),
            )

        response = await call_next(request)
        body = await _response_body(response)
        raw_headers = list(response.raw_headers)
        if response.status_code == _SUCCESS_STATUS:
            _response_cache[key] = (now, body, response.status_code, raw_headers)
        return Response(
            content=body,
            status_code=response.status_code,
            headers=MutableHeaders(raw=raw_headers),
            media_type=response.media_type,
            background=response.background,
        )


def _cache_subject(token: str) -> str:
    if token == "":
        return ""
    try:
        claims = decode_token(token, settings.jwt_secret)
    except JWTError:
        return token
    subject = claims.get("sub")
    return subject if isinstance(subject, str) else token


def _cache_key(request: Request) -> _CacheKey:
    """Identity of a cacheable response.

    The first element used to be `id(request.scope["app"])`. That is not an
    identity: CPython reuses freed object addresses, so a new app allocated where
    an old one had been can inherit its `id`. Measured on this codebase, 2000
    sequential `FastAPI()` constructions produced the same `id` 1208 times. The
    cache therefore leaked between app instances — in production the app is a
    singleton so nothing showed, but the test suite builds a fresh app per test,
    and every so often one of them read a previous test's cached body. That was
    `test_set_cookie_stripped_on_cache_hit` failing about one run in three: it
    asserted a *miss* on a request that got a hit.

    The app instance itself is used as the key component. It is hashable, it
    lives as long as it is needed, and two distinct apps can never compare equal
    — no address recycling involved.
    """
    return (
        request.scope.get("app"),
        request.url.path,
        request.scope.get("query_string", b""),
        _cache_subject(request.cookies.get("access_token", "")),
    )


def _has_dependency_overrides(request: Request) -> bool:
    app = request.scope.get("app")
    return bool(getattr(app, "dependency_overrides", None))


def _cached_headers(raw_headers: _RawHeaders) -> MutableHeaders:
    return MutableHeaders(
        raw=[
            (key, value)
            for key, value in raw_headers
            if key.decode().lower() not in _STRIPPED_CACHE_HEADERS
        ]
    )


def _media_type(raw_headers: _RawHeaders) -> str | None:
    headers = MutableHeaders(raw=raw_headers)
    return headers.get("content-type")


async def _response_body(response: Response) -> bytes:
    body_iterator = cast(_StreamingResponseLike, cast(object, response)).body_iterator
    return b"".join([chunk async for chunk in body_iterator])


async def _single_chunk(body: bytes) -> AsyncIterable[bytes]:
    yield body
