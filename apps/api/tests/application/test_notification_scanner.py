from collections.abc import Mapping
from datetime import UTC, date, datetime
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
    def __init__(
        self, athlete_ids: list[UUID], timezones: dict[UUID, str] | None = None
    ) -> None:
        self.athlete_ids: list[UUID] = athlete_ids
        self.timezones: dict[UUID, str] = timezones or {}

    def cursor(self) -> "FakeScannerCursor":
        return FakeScannerCursor(self.athlete_ids, self.timezones)


class FakeScannerCursor:
    def __init__(self, athlete_ids: list[UUID], timezones: dict[UUID, str]) -> None:
        self.athlete_ids: list[UUID] = athlete_ids
        self.timezones: dict[UUID, str] = timezones

    async def __aenter__(self) -> "FakeScannerCursor":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def execute(self, query: str, params: tuple[object, ...] = ()) -> object:
        _ = (query, params)
        return None

    async def fetchall(self) -> list[Mapping[str, object]]:
        return [
            {"id": athlete_id, "timezone": self.timezones.get(athlete_id, "UTC")}
            for athlete_id in self.athlete_ids
        ]

    async def fetchone(self) -> Mapping[str, object] | None:
        return None


async def test_scan_gives_each_athlete_their_own_day(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The scan walks every athlete in one pass, so resolving "today" once for
    the whole loop hands everyone the host's date. Each rule then reads the
    wrong facts for anyone not on UTC, and its once-per-day guard fires on the
    wrong day too."""
    seen: list[tuple[UUID, date | None]] = []

    async def rule(athlete_id: UUID, _conn: object, target_day: date | None) -> None:
        seen.append((athlete_id, target_day))

    monkeypatch.setattr("application.notifications.scanner.RULE_CHECKS", (rule,))
    conn = FakeScannerConnection(
        [ATHLETE_1, ATHLETE_2],
        {ATHLETE_1: "Asia/Shanghai", ATHLETE_2: "America/New_York"},
    )

    await scan_all_athletes(conn, now=datetime(2026, 10, 18, 2, 0, tzinfo=UTC))

    days = {athlete_id: day for athlete_id, day in seen}
    # 02:00 UTC is 10:00 in Shanghai (the 18th) and 22:00 the previous day in New
    # York. Pinning the instant keeps the assertion true at any hour; reading the
    # wall clock here only held between 04:00 and 16:00 UTC, when both zones
    # happen to share a date.
    assert days[ATHLETE_1] == date(2026, 10, 18)
    assert days[ATHLETE_2] == date(2026, 10, 17)


async def test_explicit_target_day_overrides_the_zone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A scheduled scan still pins one day for every athlete — backfills and
    replays depend on that, and it is what makes the override worth keeping."""
    seen: list[tuple[UUID, date | None]] = []

    async def rule(athlete_id: UUID, _conn: object, target_day: date | None) -> None:
        seen.append((athlete_id, target_day))

    monkeypatch.setattr("application.notifications.scanner.RULE_CHECKS", (rule,))
    conn = FakeScannerConnection([ATHLETE_1, ATHLETE_2], {ATHLETE_1: "Asia/Shanghai"})

    await scan_all_athletes(conn, date(2026, 6, 23))

    assert {day for _, day in seen} == {date(2026, 6, 23)}


async def test_missing_timezone_column_does_not_crash_the_scan(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[date | None] = []

    async def rule(_athlete_id: UUID, _conn: object, target_day: date | None) -> None:
        seen.append(target_day)

    monkeypatch.setattr("application.notifications.scanner.RULE_CHECKS", (rule,))

    class NullTimezoneConnection(FakeScannerConnection):
        async def fetchall(self) -> list[Mapping[str, object]]:
            return [{"id": ATHLETE_1}]

    await scan_all_athletes(NullTimezoneConnection([ATHLETE_1]))

    assert len(seen) == 1 and seen[0] is not None
