from datetime import date
from pathlib import Path
from uuid import uuid4

import pytest

from infrastructure.repositories import pmc as pmc_repo
from infrastructure.repositories.pmc import PmcRepo

pytestmark = pytest.mark.no_db


class _FakeConnectionContext:
    def __init__(self, cursor: "_FakeCursor") -> None:
        self._cursor = cursor

    async def __aenter__(self) -> "_FakeConnection":
        return _FakeConnection(self._cursor)

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        return None


class _FakeConnection:
    def __init__(self, cursor: "_FakeCursor") -> None:
        self._cursor = cursor

    def cursor(self) -> "_FakeCursorContext":
        return _FakeCursorContext(self._cursor)


class _FakeCursorContext:
    def __init__(self, cursor: "_FakeCursor") -> None:
        self._cursor = cursor

    async def __aenter__(self) -> "_FakeCursor":
        return self._cursor

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        return None


class _FakeCursor:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows
        self.queries: list[str] = []
        self.params: tuple[object, ...] = ()

    async def execute(self, query: str, params: tuple[object, ...]) -> None:
        self.queries.append(query)
        self.params = params

    async def fetchall(self) -> list[dict[str, object]]:
        return self.rows


async def test_all_sports_pmc_reads_current_daily_facts_exactly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    athlete_id = uuid4()
    rows = [
        {
            "day": date(2026, 7, 1),
            "ctl": 2.380952380952381,
            "atl": 14.285714285714286,
            "tsb": -11.904761904761905,
            "tss": 100.0,
            "acwr": 1.0,
        }
    ]
    cursor = _FakeCursor(rows)
    monkeypatch.setattr(pmc_repo, "_connect", lambda: _FakeConnectionContext(cursor))

    result = await PmcRepo().get_daily_load_range(athlete_id, date(2026, 7, 1), date(2026, 7, 2))

    assert result == rows
    assert cursor.params == (athlete_id, date(2026, 7, 1), date(2026, 7, 2))
    assert "current_daily_facts" in cursor.queries[0]
    assert "daily_load" not in cursor.queries[0]


async def test_sport_filtered_tss_uses_full_filtered_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    athlete_id = uuid4()
    rows = [
        {"day": date(2026, 1, 1), "tss": 20.0},
        {"day": date(2026, 7, 1), "tss": 50.0},
    ]
    cursor = _FakeCursor(rows)
    monkeypatch.setattr(pmc_repo, "_connect", lambda: _FakeConnectionContext(cursor))

    result = await PmcRepo().get_filtered_daily_tss(
        athlete_id, date(2026, 7, 1), date(2026, 7, 31), "Run"
    )

    assert result == {date(2026, 1, 1): 20.0, date(2026, 7, 1): 50.0}
    assert cursor.params == (athlete_id, "Run", date(2026, 7, 31))
    assert "current_activity_facts" in cursor.queries[0]
    assert "daily_load" not in cursor.queries[0]


def test_runtime_source_has_no_legacy_pmc_authority_reads() -> None:
    source_root = Path(__file__).resolve().parents[2] / "src"
    offenders = [
        path
        for path in source_root.rglob("*.py")
        if _has_legacy_authority_reference(path.read_text(encoding="utf-8"))
    ]

    assert offenders == []


def _has_legacy_authority_reference(source: str) -> bool:
    lowered = source.lower()
    return "mv_daily_load" in lowered or "from daily_load" in lowered
