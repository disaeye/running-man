from __future__ import annotations

import asyncio
import base64
import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import ClassVar, Protocol, Self, cast, final

import httpx
from pydantic_settings import BaseSettings, SettingsConfigDict

from .rate_limiter import rate_limiter_from_env, retry_delay

Json = None | bool | int | float | str | list["Json"] | dict[str, "Json"]
JsonObject = dict[str, Json]

# Retry budget for rate-limited requests: four attempts, last one gives up.
_MAX_ATTEMPTS = 4
_LAST_ATTEMPT = _MAX_ATTEMPTS - 1
_RATE_LIMIT_STATUS = 429


class RateLimiter(Protocol):
    async def acquire(self) -> None: ...


class IntervalsClientError(RuntimeError):
    pass


class IntervalsSettings(BaseSettings):
    intervals_icu_api_key: str = ""
    intervals_icu_athlete_id: str = ""

    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(env_file=".env", extra="ignore")


@dataclass(slots=True)
class _Token:
    value: str
    expires_at: float

    @property
    def expired(self) -> bool:
        return time.monotonic() >= self.expires_at


@final
class IntervalsClient:
    def __init__(
        self,
        api_key: str | None = None,
        athlete_id: int | str | None = None,
        *,
        base_url: str = "https://intervals.icu/api/v1",
        client: httpx.AsyncClient | None = None,
        rate_limiter: RateLimiter | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        intervals_settings = IntervalsSettings()
        self._api_key: str = api_key or intervals_settings.intervals_icu_api_key
        if not self._api_key:
            msg = "INTERVALS_ICU_API_KEY is required"
            raise IntervalsClientError(msg)
        self.athlete_id: int | str = athlete_id or intervals_settings.intervals_icu_athlete_id
        self._base_url: str = base_url.rstrip("/")
        self._client: httpx.AsyncClient = client or httpx.AsyncClient(timeout=30, trust_env=True)
        self._owns_client: bool = client is None
        self._rate_limiter: RateLimiter = rate_limiter or rate_limiter_from_env()
        self._sleep: Callable[[float], Awaitable[None]] = sleep
        self._token: _Token | None = None

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    @property
    def auth_header(self) -> str:
        if self._token is None or self._token.expired:
            raw = f"API_KEY:{self._api_key}".encode()
            value = "Basic " + base64.b64encode(raw).decode("ascii")
            self._token = _Token(value=value, expires_at=time.monotonic() + 8 * 60 * 60)
        return self._token.value

    async def get_activities(
        self, athlete_id: int | str, oldest: str, newest: str
    ) -> list[JsonObject]:
        params = {"oldest": oldest, "newest": newest}
        external_id = self.athlete_id or athlete_id
        data = await self._request_json("GET", f"/athlete/{external_id}/activities", params)
        return _as_list(data)

    async def get_activity(self, activity_id: str) -> JsonObject:
        data = await self._request_json("GET", f"/activity/{activity_id}")
        return _as_dict(data)

    async def get_streams(self, activity_id: str, types: Sequence[str]) -> list[JsonObject]:
        data = await self._request_json(
            "GET", f"/activity/{activity_id}/streams", {"types": ",".join(types)}
        )
        return _as_list(data)

    async def download_fit(self, activity_id: str) -> bytes:
        response = await self._request("GET", f"/activity/{activity_id}/fit-file")
        return response.content

    async def get_wellness(
        self, athlete_id: int | str, oldest: str, newest: str
    ) -> list[JsonObject]:
        params = {"oldest": oldest, "newest": newest}
        external_id = self.athlete_id or athlete_id
        data = await self._request_json("GET", f"/athlete/{external_id}/wellness", params)
        return _as_list(data)

    async def get_events(self, athlete_id: int | str, oldest: str, newest: str) -> list[JsonObject]:
        params = {"oldest": oldest, "newest": newest}
        external_id = self.athlete_id or athlete_id
        data = await self._request_json("GET", f"/athlete/{external_id}/events", params)
        return _as_list(data)

    async def _request_json(
        self, method: str, path: str, params: Mapping[str, str] | None = None
    ) -> Json:
        return cast(Json, (await self._request(method, path, params)).json())

    async def _request(
        self, method: str, path: str, params: Mapping[str, str] | None = None
    ) -> httpx.Response:
        for attempt in range(_MAX_ATTEMPTS):
            await self._rate_limiter.acquire()
            try:
                response = await self._client.request(
                    method, self._base_url + path, params=params, headers=self._headers()
                )
            except httpx.TransportError as exc:
                if attempt == _LAST_ATTEMPT:
                    msg = f"Intervals.icu connection failed: {exc}"
                    raise IntervalsClientError(msg) from exc
                await self._sleep(retry_delay(attempt, None))
                continue
            if response.status_code != _RATE_LIMIT_STATUS or attempt == _LAST_ATTEMPT:
                return _raise_for_status(response)
            retry_after = cast(str | None, response.headers.get("Retry-After"))
            delay = retry_delay(attempt, retry_after)
            await self._sleep(delay)
        raise AssertionError("unreachable")

    def _headers(self) -> dict[str, str]:
        return {"Authorization": self.auth_header}


def _raise_for_status(response: httpx.Response) -> httpx.Response:
    try:
        _ = response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        msg = f"Intervals.icu request failed: {exc.response.status_code}"
        raise IntervalsClientError(msg) from exc
    return response


def _as_list(data: Json) -> list[JsonObject]:
    if not isinstance(data, list):
        msg = "Expected Intervals.icu list response"
        raise IntervalsClientError(msg)
    return [item for item in data if isinstance(item, dict)]


def _as_dict(data: Json) -> JsonObject:
    if not isinstance(data, dict):
        msg = "Expected Intervals.icu object response"
        raise IntervalsClientError(msg)
    return data
