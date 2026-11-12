"""The skip cache must not outlive the rows it guards.

Clearing imported data removes derived rows; re-importing the same activities
leaves the input fingerprint identical. Trusting the stored success run then
skipped the rebuild entirely, so the athlete ended up with no load facts at all
while every run table said "success".
"""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from application.computation.runs import ComputationRunRepository, ComputationRunSpec

pytestmark = pytest.mark.no_db


class _Cursor:
    def __init__(self, row: dict[str, object] | None) -> None:
        self._row = row

    async def __aenter__(self) -> _Cursor:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def execute(self, _query: object, _params: object = None) -> None:
        return None

    async def fetchone(self) -> dict[str, object] | None:
        return self._row


class _Conn:
    """Answers the run lookup, then the product check, in order."""

    def __init__(self, run_row: dict[str, object] | None, product_row: dict[str, object]) -> None:
        self._rows = [run_row, product_row]

    def cursor(self) -> _Cursor:
        return _Cursor(self._rows.pop(0) if self._rows else None)


def _spec() -> ComputationRunSpec:
    return ComputationRunSpec(
        athlete_id=uuid4(),
        computation_kind="activity_load",
        algorithm_version="1",
        input_fingerprint="abc",
        trigger="sync",
    )


@pytest.mark.asyncio
async def test_a_successful_run_with_its_products_still_present_is_reused() -> None:
    run_id = UUID("00000000-0000-0000-0000-0000000000aa")
    conn = _Conn({"id": run_id, "rows_affected": 12}, {"present": True})

    assert await ComputationRunRepository().successful_run_id(conn, _spec()) == run_id  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_a_successful_run_whose_products_are_gone_is_not_reused() -> None:
    run_id = UUID("00000000-0000-0000-0000-0000000000aa")
    conn = _Conn({"id": run_id, "rows_affected": 12}, {"present": False})

    assert await ComputationRunRepository().successful_run_id(conn, _spec()) is None  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_a_run_that_wrote_nothing_is_reused_without_a_product_check() -> None:
    run_id = UUID("00000000-0000-0000-0000-0000000000aa")
    conn = _Conn({"id": run_id, "rows_affected": 0}, {"present": False})

    assert await ComputationRunRepository().successful_run_id(conn, _spec()) == run_id  # type: ignore[arg-type]
