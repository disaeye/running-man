import pytest
from httpx import ASGITransport, AsyncClient, Response

from main import app
from presentation.webhooks.routes import get_event_store, get_webhook_handler


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


def _payload(event_type: str, timestamp: str = "2026-06-16T00:00:00Z") -> dict[str, object]:
    return {
        "secret": "test-secret",
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


class FakeEventStore:
    def __init__(self) -> None:
        self.events: set[str] = set()

    async def insert_once(self, event_key: str, event_type: str, athlete_id: str | None) -> bool:
        if event_key in self.events:
            return False
        self.events.add(event_key)
        return True


class FakeHandler:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.deleted: list[str] = []

    async def handle(self, payload: object) -> None:
        self.calls.append(payload.type)
        self.deleted.extend(event.id for event in payload.deleted_events)
