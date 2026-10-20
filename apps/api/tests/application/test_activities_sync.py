"""Tests for application.activities.sync (the webhook-triggered sync).

The webhook no longer calls the window sync directly: it queues the same durable
job the manual button and the timer use, so a burst of upload events cannot stack
concurrent syncs. All I/O boundaries (integration repo, job creation, job
execution) are monkeypatched, so these tests need neither a database nor a
network.
"""

from __future__ import annotations

from uuid import UUID, uuid4

import psycopg
import pytest

from application.activities import sync as activities_sync
from application.webhooks.handler import WebhookHandler, _load_sync_fn
from domain.integrations.crypto import decrypt, encrypt
from presentation.webhooks.schemas import WebhookPayload

pytestmark = pytest.mark.no_db

ATHLETE_UUID = UUID("00000000-0000-0000-0000-000000000001")
ATHLETE_STR = str(ATHLETE_UUID)
JOB_ID = uuid4()
PLAINTEXT_CREDS: dict[str, object] = {"athlete_id": "i999", "api_key": "secret-key"}


class _FakeRepo:
    def __init__(self, row: dict[str, object] | None) -> None:
        self._row = row
        self.get_calls: list[tuple[UUID, str]] = []

    async def get(self, athlete_id: UUID, source: str) -> dict[str, object] | None:
        self.get_calls.append((athlete_id, source))
        return self._row


class _Recorder:
    def __init__(self) -> None:
        self.created: list[tuple[UUID, str, str, str]] = []
        self.ran: list[tuple[UUID, UUID, str, dict[str, object]]] = []

    async def create_job(
        self, athlete_id: UUID, source: str, kind: str, trigger: str
    ) -> dict[str, object]:
        self.created.append((athlete_id, source, kind, trigger))
        return {"id": JOB_ID}

    async def run_job(
        self, job_id: UUID, athlete_id: UUID, source: str, credentials: dict[str, object]
    ) -> None:
        self.ran.append((job_id, athlete_id, source, credentials))


def _patch_io(
    monkeypatch: pytest.MonkeyPatch,
    *,
    repo_row: dict[str, object] | None,
    create_error: BaseException | None = None,
) -> tuple[_FakeRepo, _Recorder]:
    repo = _FakeRepo(repo_row)
    recorder = _Recorder()
    monkeypatch.setattr(activities_sync, "UserIntegrationRepo", lambda: repo)

    async def _create(
        athlete_id: UUID, source: str, kind: str, trigger: str
    ) -> dict[str, object]:
        if create_error is not None:
            raise create_error
        return await recorder.create_job(athlete_id, source, kind, trigger)

    monkeypatch.setattr(activities_sync, "create_sync_job", _create)
    monkeypatch.setattr(activities_sync, "run_sync_job", recorder.run_job)
    return repo, recorder


def _connected_row(connected: bool = True) -> dict[str, object]:
    return {
        "id": "row-1",
        "athlete_id": ATHLETE_STR,
        "source": "intervals_icu",
        "connected": connected,
        "credentials": {"ciphertext": encrypt(PLAINTEXT_CREDS)},
    }


async def test_webhook_queues_and_runs_a_job_with_decrypted_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo, recorder = _patch_io(monkeypatch, repo_row=_connected_row())

    await activities_sync.sync_activities_incremental(ATHLETE_STR, "act-7")

    assert repo.get_calls == [(ATHLETE_UUID, "intervals_icu")]
    assert recorder.created == [(ATHLETE_UUID, "intervals_icu", "incremental", "webhook")]
    assert recorder.ran == [(JOB_ID, ATHLETE_UUID, "intervals_icu", PLAINTEXT_CREDS)]


async def test_missing_athlete_id_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    repo, recorder = _patch_io(monkeypatch, repo_row=_connected_row())

    await activities_sync.sync_activities_incremental(None, "act-7")
    await activities_sync.sync_activities_incremental("", "act-7")

    assert repo.get_calls == []
    assert recorder.created == []


async def test_invalid_uuid_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    repo, recorder = _patch_io(monkeypatch, repo_row=_connected_row())

    await activities_sync.sync_activities_incremental("athlete-1", "act-7")

    assert repo.get_calls == []
    assert recorder.created == []


async def test_no_integration_row_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    repo, recorder = _patch_io(monkeypatch, repo_row=None)

    await activities_sync.sync_activities_incremental(ATHLETE_STR, "act-7")

    assert repo.get_calls == [(ATHLETE_UUID, "intervals_icu")]
    assert recorder.created == []


async def test_disconnected_integration_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    _repo, recorder = _patch_io(monkeypatch, repo_row=_connected_row(connected=False))

    await activities_sync.sync_activities_incremental(ATHLETE_STR, "act-7")

    assert recorder.created == []


async def test_missing_ciphertext_is_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    bad_row: dict[str, object] = {
        "athlete_id": ATHLETE_STR,
        "source": "intervals_icu",
        "connected": True,
        "credentials": {},
    }
    _repo, recorder = _patch_io(monkeypatch, repo_row=bad_row)

    await activities_sync.sync_activities_incremental(ATHLETE_STR, "act-7")

    assert recorder.created == []


async def test_a_running_job_makes_the_webhook_delivery_a_noop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A second upload event must not stack a concurrent sync.

    The partial unique index rejects the insert; the delivery is then a
    deliberate no-op because the running job already covers the activity.
    """
    _repo, recorder = _patch_io(
        monkeypatch,
        repo_row=_connected_row(),
        create_error=psycopg.errors.UniqueViolation("one active job per source"),
    )

    await activities_sync.sync_activities_incremental(ATHLETE_STR, "act-7")

    assert recorder.ran == []


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

    await handler.handle(payload, ATHLETE_UUID)

    assert invoked == [(ATHLETE_STR, "act-7")]


def test_decrypt_round_trips_encrypt_output() -> None:
    blob = encrypt(PLAINTEXT_CREDS)

    assert decrypt(blob) == PLAINTEXT_CREDS
