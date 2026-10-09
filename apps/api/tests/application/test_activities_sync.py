"""Tests for application.activities.sync.

All I/O boundaries (integration repo, psycopg connection, IntervalsClient
construction, underlying window-sync) are monkeypatched so the tests run
without a database or network. Marked ``no_db`` to opt out of the session
PostgreSQL fixture.
"""

from __future__ import annotations

from typing import ClassVar
from uuid import UUID

import pytest

from application.activities import sync as activities_sync
from application.webhooks.handler import WebhookHandler, _load_sync_fn
from domain.integrations.crypto import decrypt, encrypt
from presentation.webhooks.schemas import WebhookPayload

pytestmark = pytest.mark.no_db

ATHLETE_UUID = UUID("00000000-0000-0000-0000-000000000001")
ATHLETE_STR = str(ATHLETE_UUID)
PLAINTEXT_CREDS: dict[str, object] = {"athlete_id": "i999", "api_key": "secret-key"}


class _FakeRepo:
    def __init__(self, row: dict[str, object] | None) -> None:
        self._row: dict[str, object] | None = row
        self.get_calls: list[tuple[UUID, str]] = []
        self.status_calls: list[tuple[UUID, str, str, str | None]] = []

    async def get(self, athlete_id: UUID, source: str) -> dict[str, object] | None:
        self.get_calls.append((athlete_id, source))
        return self._row

    async def update_sync_status(
        self, athlete_id: UUID, source: str, status: str, error: str | None
    ) -> dict[str, object] | None:
        self.status_calls.append((athlete_id, source, status, error))
        return self._row


class _FakeConn:
    def __init__(self) -> None:
        self.commited: bool = False
        self.rolled_back: bool = False
        self.closed: bool = False

    def commit(self) -> None:
        self.commited = True

    def rollback(self) -> None:
        self.rolled_back = True

    def close(self) -> None:
        self.closed = True


class _FakePoolConnection:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn
        self.entered: bool = False
        self.exited: bool = False

    def __enter__(self) -> _FakeConn:
        self.entered = True
        return self._conn

    def __exit__(self, *_exc: object) -> None:
        self.exited = True


class _FakeSyncPool:
    def __init__(self, conn: _FakeConn) -> None:
        self.connection_context = _FakePoolConnection(conn)

    def connection(self) -> _FakePoolConnection:
        return self.connection_context


class _FakeClient:
    instances: ClassVar[list["_FakeClient"]] = []

    def __init__(self, **kwargs: object) -> None:
        self.kwargs: dict[str, object] = kwargs
        type(self).instances.append(self)

    async def __aenter__(self) -> "_FakeClient":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None


def _patch_io(
    monkeypatch: pytest.MonkeyPatch,
    *,
    repo_row: dict[str, object] | None,
    sync_raises: BaseException | None = None,
) -> tuple[_FakeRepo, _FakeConn, _FakeSyncPool, list[tuple[object, object, object]], type[_FakeClient]]:
    fake_repo = _FakeRepo(repo_row)
    fake_conn = _FakeConn()
    fake_pool = _FakeSyncPool(fake_conn)
    sync_calls: list[tuple[object, object, object]] = []

    monkeypatch.setattr(activities_sync, "UserIntegrationRepo", lambda: fake_repo)
    monkeypatch.setattr(activities_sync, "get_sync_pool", lambda: fake_pool)

    class _StubClient(_FakeClient):
        instances: ClassVar[list["_FakeClient"]] = []

    _StubClient.instances = []
    monkeypatch.setattr(activities_sync, "IntervalsClient", _StubClient)

    async def _fake_window_sync(athlete_id: object, client: object, conn: object) -> None:
        sync_calls.append((athlete_id, client, conn))
        if sync_raises is not None:
            raise sync_raises

    monkeypatch.setattr(activities_sync, "_run_window_sync", _fake_window_sync)
    return fake_repo, fake_conn, fake_pool, sync_calls, _StubClient


def _connected_row(connected: bool = True) -> dict[str, object]:
    return {
        "id": "row-1",
        "athlete_id": ATHLETE_STR,
        "source": "intervals_icu",
        "connected": connected,
        "credentials": {"ciphertext": encrypt(PLAINTEXT_CREDS)},
    }


async def test_happy_path_decrypts_credentials_and_invokes_window_sync(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo, conn, fake_pool, sync_calls, stub_cls = _patch_io(monkeypatch, repo_row=_connected_row())

    await activities_sync.sync_activities_incremental(ATHLETE_STR, "act-7")

    assert repo.get_calls == [(ATHLETE_UUID, "intervals_icu")]
    assert len(stub_cls.instances) == 1
    assert stub_cls.instances[0].kwargs == {
        "api_key": "secret-key",
        "athlete_id": "i999",
    }
    assert len(sync_calls) == 1
    athlete_arg, client_arg, conn_arg = sync_calls[0]
    assert athlete_arg == ATHLETE_STR
    assert client_arg is stub_cls.instances[0]
    assert conn_arg is conn
    assert conn.commited is True
    assert conn.rolled_back is False
    assert conn.closed is False
    assert fake_pool.connection_context.entered is True
    assert fake_pool.connection_context.exited is True
    assert repo.status_calls == [(ATHLETE_UUID, "intervals_icu", "success", None)]


async def test_missing_athlete_id_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    repo, conn, _pool, sync_calls, _ = _patch_io(monkeypatch, repo_row=_connected_row())

    await activities_sync.sync_activities_incremental(None, "act-7")
    await activities_sync.sync_activities_incremental("", "act-7")

    assert repo.get_calls == []
    assert sync_calls == []
    assert conn.closed is False


async def test_invalid_uuid_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    repo, _conn, _pool, sync_calls, _ = _patch_io(monkeypatch, repo_row=_connected_row())

    await activities_sync.sync_activities_incremental("athlete-1", "act-7")

    assert repo.get_calls == []
    assert sync_calls == []


async def test_no_integration_row_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    repo, _conn, _pool, sync_calls, _ = _patch_io(monkeypatch, repo_row=None)

    await activities_sync.sync_activities_incremental(ATHLETE_STR, "act-7")

    assert repo.get_calls == [(ATHLETE_UUID, "intervals_icu")]
    assert sync_calls == []


async def test_disconnected_integration_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    repo, _conn, _pool, sync_calls, _ = _patch_io(monkeypatch, repo_row=_connected_row(connected=False))

    await activities_sync.sync_activities_incremental(ATHLETE_STR, "act-7")

    assert repo.get_calls == [(ATHLETE_UUID, "intervals_icu")]
    assert sync_calls == []


async def test_missing_ciphertext_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    bad_row: dict[str, object] = {
        "athlete_id": ATHLETE_STR,
        "source": "intervals_icu",
        "connected": True,
        "credentials": {},
    }
    _repo, _conn, _pool, sync_calls, _ = _patch_io(monkeypatch, repo_row=bad_row)

    await activities_sync.sync_activities_incremental(ATHLETE_STR, "act-7")

    assert sync_calls == []


async def test_duplicate_calls_are_idempotent_at_call_layer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Call-layer idempotency: window-sync is invoked per webhook delivery;
    data-level dedupe is handled by the underlying upsert's source_hash."""
    repo, _conn, _pool, sync_calls, _ = _patch_io(monkeypatch, repo_row=_connected_row())

    for _ in range(2):
        await activities_sync.sync_activities_incremental(ATHLETE_STR, "act-7")

    assert len(sync_calls) == 2
    assert repo.status_calls == [
        (ATHLETE_UUID, "intervals_icu", "success", None),
        (ATHLETE_UUID, "intervals_icu", "success", None),
    ]


async def test_sync_failure_rolls_back_and_reraises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo, conn, fake_pool, _sync_calls, _ = _patch_io(
        monkeypatch,
        repo_row=_connected_row(),
        sync_raises=RuntimeError("upstream 503"),
    )

    with pytest.raises(RuntimeError, match="upstream 503"):
        await activities_sync.sync_activities_incremental(ATHLETE_STR, "act-7")

    assert conn.commited is False
    assert conn.rolled_back is True
    assert conn.closed is False
    assert fake_pool.connection_context.exited is True
    assert repo.status_calls == [(ATHLETE_UUID, "intervals_icu", "failed", "upstream 503")]


def test_load_sync_fn_resolves_to_real_module_function() -> None:
    """handler._load_sync_fn previously fell back to noop when this module
    was missing; it must now resolve to the real coroutine."""
    fn = _load_sync_fn()

    assert fn is activities_sync.sync_activities_incremental


async def test_handler_activity_uploaded_invokes_injected_sync() -> None:
    invoked: list[tuple[str | None, str | None]] = []

    async def _spy(athlete_id: str | None, activity_id: str | None) -> None:
        invoked.append((athlete_id, activity_id))

    handler = WebhookHandler(sync_fn=_spy)
    payload = WebhookPayload(
        secret="x",
        type="ACTIVITY_UPLOADED",
        timestamp="2026-06-23T00:00:00Z",
        athlete_id=ATHLETE_STR,
        activity_id="act-7",
    )

    await handler.handle(payload)

    assert invoked == [(ATHLETE_STR, "act-7")]


def test_decrypt_round_trips_encrypt_output() -> None:
    blob = encrypt(PLAINTEXT_CREDS)

    assert decrypt(blob) == PLAINTEXT_CREDS
