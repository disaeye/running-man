"""Plan adjustment proposals: what was suggested, and what the athlete decided.

A proposal is a row here before it is anything else. The calendar keeps its
original prescription until the athlete accepts, so this table is the record of
what was suggested, what was accepted, and what was kept.

Three states:

* ``pending`` — suggested, not decided.
* ``applied`` — accepted; the calendar's prescription was rewritten.
* ``reverted`` — kept the original plan.
"""

from __future__ import annotations

import json
from typing import Final, cast
from uuid import UUID

from psycopg.rows import DictRow

from infrastructure.db.pool import ConnectionContext, get_pool

PENDING: Final = "pending"
APPLIED: Final = "applied"
REVERTED: Final = "reverted"

_STATUSES: Final = frozenset({PENDING, APPLIED, REVERTED})

_COLUMNS: Final = """
adjustment_id, event_id, created_at, decided_at, trigger_type,
trigger_summary, original_prescription, adjusted_prescription,
load_delta_pct, status
"""


def _connect() -> ConnectionContext:
    return get_pool().connection()


class PlanAdjustmentRepo:
    """Reads and writes the adjustment proposals."""

    async def list_for_athlete(
        self, athlete_id: UUID, status: str | None = None
    ) -> list[dict[str, object]]:
        """The athlete's proposals, newest first."""
        if status is not None and status not in _STATUSES:
            raise ValueError(f"unknown adjustment status: {status}")
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                f"""
                SELECT {_COLUMNS} FROM plan_adjustments
                WHERE athlete_id = %s
                  AND (%s::text IS NULL OR status = %s::text)
                ORDER BY created_at DESC
                """,
                (athlete_id, status, status),
            )
            rows = await cur.fetchall()
        return [_row(row) for row in rows]

    async def latest_pending_for_event(
        self, athlete_id: UUID, event_id: str
    ) -> dict[str, object] | None:
        """The newest undecided proposal for one session."""
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                f"""
                SELECT {_COLUMNS} FROM plan_adjustments
                WHERE athlete_id = %s AND event_id = %s AND status = 'pending'
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (athlete_id, event_id),
            )
            row = await cur.fetchone()
        return _row(row) if row is not None else None

    async def insert(
        self,
        athlete_id: UUID,
        event_id: str,
        trigger_type: str,
        trigger_summary: str,
        original_prescription: dict[str, object] | None,
        adjusted_prescription: dict[str, object] | None,
        load_delta_pct: float,
    ) -> dict[str, object]:
        """Record a proposal."""
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                f"""
                INSERT INTO plan_adjustments (
                    athlete_id, event_id, trigger_type, trigger_summary,
                    original_prescription, adjusted_prescription, load_delta_pct, status
                ) VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, 'pending')
                RETURNING {_COLUMNS}
                """,
                (
                    athlete_id,
                    event_id,
                    trigger_type,
                    trigger_summary,
                    json.dumps(original_prescription, ensure_ascii=True)
                    if original_prescription is not None
                    else None,
                    json.dumps(adjusted_prescription, ensure_ascii=True)
                    if adjusted_prescription is not None
                    else None,
                    load_delta_pct,
                ),
            )
            row = await cur.fetchone()
        assert row is not None
        return _row(row)

    async def decide(
        self,
        athlete_id: UUID,
        adjustment_id: UUID,
        status: str,
    ) -> dict[str, object] | None:
        """Record the athlete's decision on one proposal.

        Only a proposal that is still pending can be decided: deciding twice
        would leave the record contradicting itself.
        """
        if status not in {APPLIED, REVERTED}:
            raise ValueError(f"unexpected decision status: {status}")
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(
                f"""
                UPDATE plan_adjustments
                SET status = %s, decided_at = now()
                WHERE adjustment_id = %s AND athlete_id = %s AND status = 'pending'
                RETURNING {_COLUMNS}
                """,
                (status, adjustment_id, athlete_id),
            )
            row = await cur.fetchone()
        return _row(row) if row is not None else None


def _row(row: DictRow | object) -> dict[str, object]:
    """One proposal as a dict, with its two prescriptions parsed."""
    values: dict[str, object] = {
        str(key): value for key, value in cast(dict[str, object], row).items()
    }
    for key in ("original_prescription", "adjusted_prescription"):
        raw = values.get(key)
        if isinstance(raw, str):
            values[key] = json.loads(raw)
    return values
