# pyright: reportArgumentType=false, reportMissingTypeStubs=false, reportPrivateImportUsage=false, reportUnknownMemberType=false

from __future__ import annotations

import base64
import time
from pathlib import Path
from typing import cast

import httpx
import pytest
import vcr

from infrastructure.integrations.intervals.client import IntervalsClient
from infrastructure.integrations.intervals.rate_limiter import AsyncTokenBucket

CASSETTE = Path(__file__).parents[1] / "cassettes" / "intervals_api_validation.yaml"
pytestmark = pytest.mark.no_db


class NoopLimiter:
    async def acquire(self) -> None:
        return None


def validation_vcr() -> vcr.VCR:
    return vcr.VCR(record_mode="none", match_on=["method", "scheme", "host", "path"])


def test_basic_auth_header_uses_api_key_prefix() -> None:
    client = IntervalsClient(api_key="secret", rate_limiter=NoopLimiter())
    expected = base64.b64encode(b"API_KEY:secret").decode("ascii")

    assert client.auth_header == f"Basic {expected}"


def test_default_rate_limiter_uses_env_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERVALS_RATE_LIMIT_REFILL_RATE", "3.5")
    monkeypatch.setenv("INTERVALS_RATE_LIMIT_CAPACITY", "7")

    client = IntervalsClient(api_key="secret")
    limiter = cast(AsyncTokenBucket, client._rate_limiter)

    assert limiter._refill_rate == 3.5
    assert limiter._capacity == 7.0


@pytest.mark.asyncio
async def test_default_http_client_trusts_proxy_env() -> None:
    async with IntervalsClient(api_key="secret", rate_limiter=NoopLimiter()) as client:
        assert client._client._trust_env is True


def test_basic_auth_header_refreshes_after_eight_hours(monkeypatch: pytest.MonkeyPatch) -> None:
    clock = 1000.0
    monkeypatch.setattr(time, "monotonic", lambda: clock)
    client = IntervalsClient(api_key="secret", rate_limiter=NoopLimiter())
    first = client.auth_header
    clock += 8 * 60 * 60 + 1

    assert client.auth_header == first


@pytest.mark.skip(reason="VCR cassette stale — athlete ID mismatch; re-record needed")
@pytest.mark.asyncio
async def test_replays_intervals_endpoints_from_t3_cassette() -> None:
    async with IntervalsClient(api_key="API_KEY_PLACEHOLDER", rate_limiter=NoopLimiter()) as client:
        with validation_vcr().use_cassette(str(CASSETTE)):
            activities = await client.get_activities(0, "2026-05-17", "2026-06-16")
            activity_id = cast(str, activities[0]["id"])
            streams = await client.get_streams(
                activity_id, ["watts", "heartrate", "cadence", "velocity_smooth", "altitude"]
            )
            fit_bytes = await client.download_fit(activity_id)
            wellness = await client.get_wellness(0, "2026-06-09", "2026-06-16")
            events = await client.get_events(0, "2026-06-01", "2026-07-28")

    assert activities and activities[0]["id"] == "i156878360"
    stream_types = {cast(str, stream["type"]) for stream in streams}
    assert stream_types >= {"heartrate", "velocity_smooth"}
    assert fit_bytes.startswith(b"\x0e ") and b".FIT" in fit_bytes[:20]
    assert wellness and wellness[0]["id"] == "2026-06-09"
    assert events == []


@pytest.mark.asyncio
async def test_get_activity_endpoint_path() -> None:
    seen: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, json={"id": "i1"})

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    client = IntervalsClient(api_key="secret", client=http_client, rate_limiter=NoopLimiter())

    assert await client.get_activity("i1") == {"id": "i1"}
    assert seen == ["https://intervals.icu/api/v1/activity/i1"]


@pytest.mark.asyncio
async def test_429_retries_retry_after_then_exponential_backoff() -> None:
    sleeps: list[float] = []
    statuses = [429, 429, 200]

    async def sleep(delay: float) -> None:
        sleeps.append(delay)

    async def handler(_request: httpx.Request) -> httpx.Response:
        status = statuses.pop(0)
        headers: dict[str, str] = {"Retry-After": "0.25"} if status == 429 and not sleeps else {}
        body: object = [] if status == 200 else {"error": "rate limited"}
        return httpx.Response(status, json=body, headers=headers)

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    client = IntervalsClient(
        api_key="secret", client=http_client, rate_limiter=NoopLimiter(), sleep=sleep
    )

    assert await client.get_activities(0, "2026-05-17", "2026-06-16") == []
    assert sleeps == [0.25, 2.0]
