"""Unit tests for clear_activities cascade: raw → wellness → derived."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from presentation.api.activity_bulk_delete import bulk_delete_sources, clear_activities

ATHLETE_ID = uuid4()


class _ActivityRepo:
    def __init__(self) -> None:
        self.delete_by_source_calls: list[tuple[object, str]] = []
        self.delete_all_calls: list[object] = []

    async def delete_by_source(self, athlete_id: object, source: str) -> int:
        self.delete_by_source_calls.append((athlete_id, source))
        return 1

    async def delete_all(self, athlete_id: object) -> int:
        self.delete_all_calls.append(athlete_id)
        return 0


class _IntegrationsRepo:
    def __init__(self) -> None:
        self.clear_calls: list[tuple[object, str | None]] = []

    async def clear_sync_state(self, athlete_id: object, source: str | None = None) -> int:
        self.clear_calls.append((athlete_id, source))
        return 1


def _cursor_for_counts(*, remaining: int) -> AsyncMock:
    """Cursor that returns activity remaining count, then accepts DELETEs."""
    cur = AsyncMock()
    cur.rowcount = remaining
    fetch_results: list[dict[str, int] | None] = [{"n": remaining}]

    async def fetchone() -> dict[str, int] | None:
        if fetch_results:
            return fetch_results.pop(0)
        return None

    cur.fetchone = fetchone
    cur.execute = AsyncMock(return_value=None)
    return cur


def _pool_with_cursor(cur: AsyncMock) -> MagicMock:
    conn = MagicMock()
    conn.cursor.return_value.__aenter__ = AsyncMock(return_value=cur)
    conn.cursor.return_value.__aexit__ = AsyncMock(return_value=None)
    pool = MagicMock()
    pool.connection.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.connection.return_value.__aexit__ = AsyncMock(return_value=None)
    return pool


def test_bulk_delete_sources_upload_expands_to_file_types() -> None:
    assert bulk_delete_sources("upload") == ["fit", "gpx", "tcx"]


def test_bulk_delete_sources_intervals_canonical() -> None:
    assert bulk_delete_sources("intervals_icu") == ["intervals_icu"]


@pytest.mark.no_db
async def test_clear_intervals_deletes_wellness_and_drops_day_facts_when_empty() -> None:
    """Clearing Intervals with no survivor activities removes wellness + day load facts."""
    repo = _ActivityRepo()
    integrations = _IntegrationsRepo()
    cur = _cursor_for_counts(remaining=0)
    pool = _pool_with_cursor(cur)

    with (
        patch("presentation.api.activity_bulk_delete.get_pool", return_value=pool),
        patch(
            "application.computation.orchestration.enqueue_activity_recompute",
            new_callable=AsyncMock,
            return_value=7,
        ) as enqueue,
    ):
        generation = await clear_activities(ATHLETE_ID, repo, integrations, "intervals_icu")

    assert generation == 7
    assert repo.delete_by_source_calls == [(ATHLETE_ID, "intervals_icu")]
    assert integrations.clear_calls == [(ATHLETE_ID, "intervals_icu")]
    enqueue.assert_awaited_once_with(ATHLETE_ID, "clear:source")
    sql_blobs = [str(call.args[0]) for call in cur.execute.await_args_list if call.args]
    assert any("health_wellness" in sql for sql in sql_blobs)
    assert not any("derived_metric_facts" in sql for sql in sql_blobs)


@pytest.mark.no_db
async def test_clear_intervals_with_survivors_recomputes() -> None:
    """When other sources still have activities, recompute L1→L2 instead of wiping day facts."""
    repo = _ActivityRepo()
    integrations = _IntegrationsRepo()
    cur = _cursor_for_counts(remaining=3)
    pool = _pool_with_cursor(cur)

    with (
        patch("presentation.api.activity_bulk_delete.get_pool", return_value=pool),
        patch(
            "application.computation.orchestration.enqueue_activity_recompute",
            new_callable=AsyncMock,
            return_value=4,
        ) as enqueue,
    ):
        generation = await clear_activities(ATHLETE_ID, repo, integrations, "intervals_icu")

    assert generation == 4
    enqueue.assert_awaited_once_with(ATHLETE_ID, "clear:source")
    sql_blobs = [str(call.args[0]) for call in cur.execute.await_args_list if call.args]
    assert not any("derived_metric_facts" in sql for sql in sql_blobs)


@pytest.mark.no_db
async def test_clear_upload_does_not_delete_wellness() -> None:
    """Upload clear expands to fit/gpx/tcx and must not treat as Intervals-owned wellness."""
    repo = _ActivityRepo()
    integrations = _IntegrationsRepo()
    cur = _cursor_for_counts(remaining=0)
    pool = _pool_with_cursor(cur)

    with (
        patch("presentation.api.activity_bulk_delete.get_pool", return_value=pool),
        patch(
            "application.computation.orchestration.enqueue_activity_recompute",
            new_callable=AsyncMock,
            return_value=3,
        ) as enqueue,
    ):
        await clear_activities(ATHLETE_ID, repo, integrations, "upload")

    enqueue.assert_awaited_once_with(ATHLETE_ID, "clear:source")

    assert repo.delete_by_source_calls == [
        (ATHLETE_ID, "fit"),
        (ATHLETE_ID, "gpx"),
        (ATHLETE_ID, "tcx"),
    ]
    assert integrations.clear_calls == []
    sql_blobs = [str(call.args[0]) for call in cur.execute.await_args_list if call.args]
    assert not any("health_wellness" in sql for sql in sql_blobs)


@pytest.mark.no_db
async def test_clear_all_wipes_wellness_derived_and_sync_state() -> None:
    repo = _ActivityRepo()
    integrations = _IntegrationsRepo()
    cur = AsyncMock()
    cur.execute = AsyncMock(return_value=None)
    pool = _pool_with_cursor(cur)

    with (
        patch("presentation.api.activity_bulk_delete.get_pool", return_value=pool),
        patch(
            "application.computation.orchestration.enqueue_activity_recompute",
            new_callable=AsyncMock,
            return_value=3,
        ) as enqueue,
    ):
        generation = await clear_activities(ATHLETE_ID, repo, integrations, None)

    assert generation == 3
    enqueue.assert_awaited_once_with(ATHLETE_ID, "clear:all")
    assert repo.delete_all_calls == [ATHLETE_ID]
    assert integrations.clear_calls == [(ATHLETE_ID, None)]
    sql_blobs = [str(call.args[0]) for call in cur.execute.await_args_list if call.args]
    assert any("health_wellness" in sql for sql in sql_blobs)
    assert not any("DELETE FROM derived_metric_facts" in sql for sql in sql_blobs)


@pytest.mark.no_db
async def test_refresh_derived_after_raw_change_with_survivors() -> None:
    """Public helper used by single-activity delete recomputes when survivors remain."""
    from presentation.api.activity_bulk_delete import refresh_derived_after_raw_change

    with patch(
        "application.computation.orchestration.enqueue_activity_recompute",
        new_callable=AsyncMock,
        return_value=5,
    ) as enqueue:
        generation = await refresh_derived_after_raw_change(ATHLETE_ID, "clear:activity")

    assert generation == 5
    enqueue.assert_awaited_once_with(ATHLETE_ID, "clear:activity")
