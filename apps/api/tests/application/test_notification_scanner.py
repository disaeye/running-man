from collections.abc import Mapping
from datetime import date
from uuid import UUID

import pytest

from application.notifications.scanner import scan_all_athletes

pytestmark = pytest.mark.asyncio

ATHLETE_1 = UUID("00000000-0000-0000-0000-000000000001")
ATHLETE_2 = UUID("00000000-0000-0000-0000-000000000002")


async def test_scan_all_athletes_runs_all_rules(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, UUID]] = []

    async def first_rule(
        athlete_id: UUID, _conn: object, _target_day: date | None
    ) -> dict[str, object]:
        calls.append(("first", athlete_id))
        return {"type": "generated"}

    async def second_rule(athlete_id: UUID, _conn: object, _target_day: date | None) -> None:
        calls.append(("second", athlete_id))

    monkeypatch.setattr("application.notifications.scanner.RULE_CHECKS", (first_rule, second_rule))
    conn = FakeScannerConnection([ATHLETE_1, ATHLETE_2])

    result = await scan_all_athletes(conn, date(2026, 6, 23))

    assert result == {"athletes_scanned": 2, "notifications_generated": 2}
    assert calls == [
        ("first", ATHLETE_1),
        ("second", ATHLETE_1),
        ("first", ATHLETE_2),
        ("second", ATHLETE_2),
    ]


class FakeScannerConnection:
    def __init__(self, athlete_ids: list[UUID]) -> None:
        self.athlete_ids: list[UUID] = athlete_ids

    def cursor(self) -> "FakeScannerCursor":
        return FakeScannerCursor(self.athlete_ids)


class FakeScannerCursor:
    def __init__(self, athlete_ids: list[UUID]) -> None:
        self.athlete_ids: list[UUID] = athlete_ids

    async def __aenter__(self) -> "FakeScannerCursor":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def execute(self, query: str, params: tuple[object, ...] = ()) -> object:
        _ = (query, params)
        return None

    async def fetchall(self) -> list[Mapping[str, object]]:
        return [{"id": athlete_id} for athlete_id in self.athlete_ids]

    async def fetchone(self) -> Mapping[str, object] | None:
        return None
