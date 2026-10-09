"""Tests for GetResponseCacheMiddleware and helpers (_cache_key, _cache_subject, _has_dependency_overrides)."""

from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request
from starlette.responses import JSONResponse

from domain.auth.tokens import create_access_token
from infrastructure.auth.settings import settings
from main import app as global_app
from presentation.middleware import (
    GetResponseCacheMiddleware,
    _cache_key,
    _cache_subject,
    _has_dependency_overrides,
)

pytestmark = [pytest.mark.no_db]


@pytest.fixture(autouse=True)
def _clean_overrides() -> None:
    global_app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


class _Counter:
    """Mutable counter — track how many times a route handler is called."""

    def __init__(self) -> None:
        self.n = 0


def _make_app() -> FastAPI:
    """Return a fresh FastAPI app that has GetResponseCacheMiddleware installed."""
    app = FastAPI()
    app.add_middleware(GetResponseCacheMiddleware)
    return app


# ---------------------------------------------------------------------------
# pure-helper tests
# ---------------------------------------------------------------------------


class TestCacheSubject:
    def test_empty_token_returns_empty(self) -> None:
        assert _cache_subject("") == ""

    def test_invalid_token_returns_raw(self) -> None:
        assert _cache_subject("not-a-jwt") == "not-a-jwt"

    def test_wrong_secret_returns_raw(self) -> None:
        token = create_access_token(uuid4(), "different-secret")
        result = _cache_subject(token)
        assert result == token

    def test_valid_token_returns_sub(self) -> None:
        athlete_id = uuid4()
        token = create_access_token(athlete_id, settings.jwt_secret)
        assert _cache_subject(token) == str(athlete_id)


class TestHasDependencyOverrides:
    def test_empty_overrides(self) -> None:
        app = FastAPI()
        request = Request(
            scope={
                "type": "http",
                "path": "/test",
                "headers": [],
                "http_version": "1.1",
                "scheme": "http",
                "server": ("test", 80),
                "app": app,
            }
        )
        assert not _has_dependency_overrides(request)

    def test_non_empty_overrides(self) -> None:
        app = FastAPI()
        app.dependency_overrides[str] = str
        request = Request(
            scope={
                "type": "http",
                "path": "/test",
                "headers": [],
                "http_version": "1.1",
                "scheme": "http",
                "server": ("test", 80),
                "app": app,
            }
        )
        assert _has_dependency_overrides(request)
        app.dependency_overrides.clear()


class TestCacheKey:
    """Subject isolation via _cache_key."""

    def test_different_subjects_produce_different_keys(self) -> None:
        token_a = create_access_token(uuid4(), settings.jwt_secret)
        token_b = create_access_token(uuid4(), settings.jwt_secret)

        def _req(token: str) -> Request:
            return Request(
                scope={
                    "type": "http",
                    "method": "GET",
                    "path": "/api/v1/test",
                    "query_string": b"",
                    "headers": [(b"cookie", f"access_token={token}".encode())],
                    "http_version": "1.1",
                    "scheme": "http",
                    "server": ("test", 80),
                }
            )

        assert _cache_key(_req(token_a)) != _cache_key(_req(token_b))

    def test_same_subject_produces_same_key(self) -> None:
        athlete_id = uuid4()
        token = create_access_token(athlete_id, settings.jwt_secret)

        def _req(path: str = "/api/v1/test", qs: str = "") -> Request:
            return Request(
                scope={
                    "type": "http",
                    "method": "GET",
                    "path": path,
                    "query_string": qs.encode(),
                    "headers": [(b"cookie", f"access_token={token}".encode())],
                    "http_version": "1.1",
                    "scheme": "http",
                    "server": ("test", 80),
                }
            )

        assert _cache_key(_req()) == _cache_key(_req())
        # Different path → different key
        assert _cache_key(_req(path="/api/v1/other")) != _cache_key(_req())
        # Different query → different key
        assert _cache_key(_req(qs="x=1")) != _cache_key(_req())


# ---------------------------------------------------------------------------
# end-to-end middleware behavior tests
# ---------------------------------------------------------------------------


class TestCacheMissThenHit:
    """First GET populates cache; second identical GET is served from cache."""

    async def test_miss_then_hit(self) -> None:
        app = _make_app()
        counter = _Counter()

        @app.get("/api/v1/test")
        async def endpoint() -> dict:
            counter.n += 1
            return {"ok": True, "count": counter.n}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp1 = await client.get("/api/v1/test")
            assert resp1.status_code == 200
            assert resp1.json() == {"ok": True, "count": 1}
            # Cache hit — route NOT called again
            resp2 = await client.get("/api/v1/test")
            assert resp2.status_code == 200
            assert resp2.json() == {"ok": True, "count": 1}


class TestCacheInvalidation:
    """Non-GET clears the whole cache."""

    async def test_post_clears_cache(self) -> None:
        app = _make_app()
        counter = _Counter()

        @app.get("/api/v1/test")
        async def endpoint() -> dict:
            counter.n += 1
            return {"ok": True, "count": counter.n}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Populate cache
            await client.get("/api/v1/test")
            assert counter.n == 1

            # POST to any path clears the cache (405 response is irrelevant)
            await client.post("/api/v1/test")

            # Next GET misses cache → route called again
            resp = await client.get("/api/v1/test")
            assert resp.status_code == 200
            assert resp.json() == {"ok": True, "count": 2}


class TestNonApiPath:
    """Paths outside /api/v1/ are never cached."""

    async def test_non_api_not_cached(self) -> None:
        app = _make_app()
        counter = _Counter()

        @app.get("/health")
        async def health() -> dict:
            counter.n += 1
            return {"ok": True, "count": counter.n}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.get("/health")
            assert counter.n == 1
            # Second request — NOT cached
            await client.get("/health")
            assert counter.n == 2


class TestDependencyOverridesBypass:
    """GET requests are NOT cached when dependency_overrides is non-empty."""

    async def test_bypass_when_overrides_present(self) -> None:
        app = _make_app()
        counter = _Counter()

        @app.get("/api/v1/test")
        async def endpoint() -> dict:
            counter.n += 1
            return {"ok": True, "count": counter.n}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # With overrides → caching bypassed
            app.dependency_overrides[str] = str
            await client.get("/api/v1/test")
            assert counter.n == 1
            await client.get("/api/v1/test")
            assert counter.n == 2  # not cached

            # Overrides cleared → caching works
            app.dependency_overrides.clear()
            await client.get("/api/v1/test")
            assert counter.n == 3
            await client.get("/api/v1/test")
            assert counter.n == 3  # cached


class TestOnly200Cached:
    """Only HTTP 200 responses are stored in the cache."""

    async def test_404_not_cached(self) -> None:
        app = _make_app()
        counter = _Counter()

        @app.get("/api/v1/test")
        async def endpoint() -> JSONResponse:
            counter.n += 1
            return JSONResponse(status_code=404, content={"error": "not found"})

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp1 = await client.get("/api/v1/test")
            assert resp1.status_code == 404
            assert counter.n == 1

            # Second identical GET — not cached (non-200 response)
            resp2 = await client.get("/api/v1/test")
            assert resp2.status_code == 404
            assert counter.n == 2


class TestHeaderStripping:
    """Cached response strips set-cookie and content-length."""

    async def test_set_cookie_stripped_on_cache_hit(self) -> None:
        app = _make_app()

        @app.get("/api/v1/test")
        async def endpoint() -> JSONResponse:
            resp = JSONResponse({"ok": True})
            resp.set_cookie("session", "abc123")
            return resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp1 = await client.get("/api/v1/test")
            assert resp1.status_code == 200
            # Uncached response carries the set-cookie header
            assert "set-cookie" in resp1.headers

            resp2 = await client.get("/api/v1/test")
            assert resp2.status_code == 200
            # Cached response has set-cookie stripped
            assert "set-cookie" not in resp2.headers

    async def test_content_length_stripped_on_cache_hit(self) -> None:
        app = _make_app()
        counter = _Counter()

        @app.get("/api/v1/test")
        async def endpoint() -> dict:
            counter.n += 1
            return {"ok": True, "count": counter.n}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Populate cache
            await client.get("/api/v1/test")
            assert counter.n == 1

            # Cache hit — response must not include content-length
            resp = await client.get("/api/v1/test")
            assert resp.status_code == 200
            assert "content-length" not in resp.headers
