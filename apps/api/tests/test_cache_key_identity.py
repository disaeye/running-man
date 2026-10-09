"""Cache-key identity: two apps must never share a cached response.

Split from `test_get_response_cache.py` to stay under the 250-line file limit,
and because this is a different failure mode from the rest of that file: not
"does the cache work" but "can one app read another's entry".

The key's first component was `id(app)`. CPython recycles freed object
addresses, so a newly created app could inherit the address of a collected one
and read its cached response. Measured on this codebase: 2000 sequential
`FastAPI()` constructions produced the same `id` 1208 times.

In production the app is a singleton, so the leak was invisible. The test suite
creates a fresh app per test, which is why `test_set_cookie_stripped_on_cache_hit`
failed intermittently — it asserted a cache *miss* on a request that hit a
previous app's entry.
"""

from __future__ import annotations

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request

from presentation.middleware import GetResponseCacheMiddleware, _cache_key


def test_id_reuse_is_why_identity_cannot_be_an_address() -> None:
    """Shows the hazard the key design has to survive."""
    seen: set[int] = set()
    reused = 0
    for _ in range(500):
        app = FastAPI()
        if id(app) in seen:
            reused += 1
        seen.add(id(app))
        del app

    assert reused > 0, "expected CPython to recycle at least one address"


class _CollidingApp:
    """Two instances that compare and hash alike, like one address reused."""

    def __eq__(self, other: object) -> bool:
        return isinstance(other, _CollidingApp)

    def __hash__(self) -> int:
        return 1


def _request_for(app: object) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/identity",
            "query_string": b"",
            "headers": [],
            "app": app,
        }
    )


def test_key_distinguishes_apps_even_when_the_address_matches() -> None:
    """The property the key must have, asserted without relying on timing.

    Waiting for CPython to actually recycle an address makes the test
    probabilistic — an earlier version of this passed against the buggy
    implementation because a short run never hit a collision. This forces the
    collision instead: the two apps compare equal and hash alike, which is what a
    recycled address produces, and the key must still tell them apart.
    """
    first_app, second_app = _CollidingApp(), _CollidingApp()
    first = _cache_key(_request_for(first_app))
    second = _cache_key(_request_for(second_app))

    assert first_app == second_app, "the fixture must actually collide"
    assert first[0] is first_app
    assert second[0] is second_app


def _counting_app(calls: list[int]) -> FastAPI:
    app = FastAPI()
    app.add_middleware(GetResponseCacheMiddleware)

    @app.get("/api/v1/identity")
    async def endpoint() -> dict[str, int]:
        calls.append(1)
        return {"n": len(calls)}

    return app


async def _fetch_twice(app: FastAPI) -> tuple[int, int]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = int((await client.get("/api/v1/identity")).json()["n"])
        second = int((await client.get("/api/v1/identity")).json()["n"])
        return first, second


async def test_two_apps_do_not_share_a_cached_response() -> None:
    calls: list[int] = []

    # Within one app the second request is a cache hit: the counter holds still.
    assert await _fetch_twice(_counting_app(calls)) == (1, 1)

    # A different app must not inherit that cached body. If the key reused an
    # address, this would return (1, 1) from the first app's entry instead of
    # reaching the second app's own endpoint.
    assert await _fetch_twice(_counting_app(calls)) == (2, 2)
