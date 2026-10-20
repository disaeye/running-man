from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient, Response

from infrastructure.webhooks.settings import settings as webhook_settings
from main import app
from presentation.webhooks.routes import (
    get_athlete_resolver,
    get_event_store,
    get_webhook_handler,
)

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000021")


@pytest.mark.no_db
async def test_secret_valid() -> None:
    store = FakeEventStore()
    handler = FakeHandler()
    _use_fakes(store, handler)

    response = await _post(_payload("ACTIVITY_UPLOADED"))

    assert response.status_code == 200


@pytest.mark.no_db
async def test_secret_invalid() -> None:
    _use_fakes(FakeEventStore(), FakeHandler())

    payload = _payload("ACTIVITY_UPLOADED") | {"secret": "bad"}

    response = await _post(payload)

    assert response.status_code == 401


@pytest.mark.no_db
async def test_idempotent() -> None:
    store = FakeEventStore()
    handler = FakeHandler()
    _use_fakes(store, handler)
    payload = _payload("ACTIVITY_UPLOADED")

    for _ in range(3):
        response = await _post(payload)
        assert response.status_code == 200

    assert len(store.events) == 1
    assert handler.calls == ["ACTIVITY_UPLOADED"]


@pytest.mark.no_db
async def test_tombstone() -> None:
    handler = FakeHandler()
    _use_fakes(FakeEventStore(), handler)
    payload = _payload("CALENDAR_UPDATED") | {"deleted_events": [{"id": "missing-event"}]}

    response = await _post(payload)

    assert response.status_code == 200
    assert handler.deleted == ["missing-event"]


@pytest.mark.no_db
async def test_nonexistent_webhook_version_does_not_store_event() -> None:
    store = FakeEventStore()
    _use_fakes(store, FakeHandler())

    response = await _post_to("/webhooks/v2/intervals", _payload("ACTIVITY_UPLOADED"))

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
    assert store.events == set()


@pytest.mark.no_db
async def test_4_event_types() -> None:
    handler = FakeHandler()
    _use_fakes(FakeEventStore(), handler)

    event_types = [
        "ACTIVITY_UPLOADED",
        "ACTIVITY_ANALYZED",
        "CALENDAR_UPDATED",
        "SPORT_SETTINGS_UPDATED",
    ]

    for event_type in event_types:
        response = await _post(
            _payload(event_type, timestamp=f"2026-06-16T00:00:0{len(handler.calls)}Z")
        )
        assert response.status_code == 200

    assert handler.calls == event_types


async def _post(payload: dict[str, object]) -> Response:
    return await _post_to("/webhooks/v1/intervals", payload)


async def _post_to(path: str, payload: dict[str, object]) -> Response:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, json=payload)


@pytest.mark.no_db
async def test_event_row_stores_the_resolved_athlete() -> None:
    """The column holds this system's athlete, not the upstream account id.

    `event_key` is the primary key of `webhook_events`, and the handler writes
    UUID-keyed tables, so the upstream id was both the wrong value to keep and
    the wrong value to pass on.
    """
    store = FakeEventStore()
    handler = FakeHandler()
    _use_fakes(store, handler)

    response = await _post(_payload("ACTIVITY_UPLOADED"))

    assert response.status_code == 200
    assert store.athlete_ids == [str(ATHLETE_ID)]
    assert handler.athlete_ids == [ATHLETE_ID]


@pytest.mark.no_db
async def test_unknown_athlete_is_acknowledged_without_storing() -> None:
    """A sender retrying an id nobody owns must not poison the event key."""
    store = FakeEventStore()
    handler = FakeHandler()
    _use_fakes(store, handler)

    response = await _post(_payload("ACTIVITY_UPLOADED") | {"athlete_id": "i999999"})

    assert response.status_code == 200
    assert store.events == set()
    assert handler.calls == []


@pytest.mark.no_db
async def test_payload_without_an_athlete_is_still_recorded() -> None:
    """Some event types carry no athlete; those are not unknown, just absent."""
    store = FakeEventStore()
    handler = FakeHandler()
    _use_fakes(store, handler)

    response = await _post(_payload("ACTIVITY_UPLOADED") | {"athlete_id": None})

    assert response.status_code == 200
    assert store.athlete_ids == [None]
    assert handler.calls == ["ACTIVITY_UPLOADED"]


def _payload(event_type: str, timestamp: str = "2026-06-16T00:00:00Z") -> dict[str, object]:
    return {
        "secret": webhook_settings.webhook_secret,
        "type": event_type,
        "athlete_id": "athlete-1",
        "activity_id": "activity-1",
        "timestamp": timestamp,
        "tss": 42.0,
        "np": 210.5,
        "icu_ctl": 55.0,
    }


def _use_fakes(store: "FakeEventStore", handler: "FakeHandler") -> None:
    app.dependency_overrides[get_event_store] = lambda: store
    app.dependency_overrides[get_webhook_handler] = lambda: handler
    app.dependency_overrides[get_athlete_resolver] = lambda: _resolve_known


async def _resolve_known(external_id: str) -> UUID | None:
    return ATHLETE_ID if external_id == "athlete-1" else None


class FakeEventStore:
    def __init__(self) -> None:
        self.events: set[str] = set()
        self.athlete_ids: list[str | None] = []

    async def insert_once(self, event_key: str, event_type: str, athlete_id: str | None) -> bool:
        if event_key in self.events:
            return False
        self.events.add(event_key)
        self.athlete_ids.append(athlete_id)
        return True


class FakeHandler:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.deleted: list[str] = []
        self.athlete_ids: list[UUID | None] = []

    async def handle(self, payload: object, athlete_id: UUID | None = None) -> None:
        self.calls.append(payload.type)
        self.deleted.extend(event.id for event in payload.deleted_events)
        self.athlete_ids.append(athlete_id)
