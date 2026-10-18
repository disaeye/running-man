"""Fake database pool and HTTP helpers for the physiology endpoint tests.

Extracted so the test module stays within the 250-line limit, following the
`activities_endpoint_helpers.py` / `data_quality_endpoint_helpers.py` pattern.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.auth.models import Athlete
from main import app
from presentation.auth.deps import get_current_athlete


@dataclass(frozen=True)
class ExecutedQuery:
    query: str
    params: tuple[object, ...]


class FakePool:
    def __init__(self, rows: Sequence[object]) -> None:
        self.rows = list(rows)
        self.executed: list[ExecutedQuery] = []

    def connection(self) -> ConnectionContext:
        return ConnectionContext(FakeConnection(self))


class ConnectionContext:
    def __init__(self, conn: FakeConnection) -> None:
        self.conn = conn

    async def __aenter__(self) -> FakeConnection:
        return self.conn

    async def __aexit__(self, _exc_type: object, _exc: object, _tb: object) -> None:
        return None


class FakeConnection:
    def __init__(self, pool: FakePool) -> None:
        self.pool = pool

    def cursor(self) -> FakeCursor:
        return FakeCursor(self.pool)


class FakeCursor:
    def __init__(self, pool: FakePool) -> None:
        self.pool = pool

    async def execute(self, query: str, params: tuple[object, ...]) -> None:
        self.pool.executed.append(ExecutedQuery(query, params))

    async def fetchone(self) -> Mapping[str, object] | None:
        if not self.pool.rows:
            return None
        row = self.pool.rows.pop(0)
        return row if isinstance(row, Mapping) else None

    async def fetchall(self) -> list[Mapping[str, object]]:
        if not self.pool.rows:
            return []
        row = self.pool.rows.pop(0)
        return list(row) if isinstance(row, list) else []


def use_pool(
    monkeypatch: pytest.MonkeyPatch, pool: FakePool, athlete: Athlete
) -> None:
    app.dependency_overrides[get_current_athlete] = lambda: athlete
    monkeypatch.setattr("infrastructure.repositories.physiology.get_pool", lambda: pool)


async def get(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def post(path: str) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path)
