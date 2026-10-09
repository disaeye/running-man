"""Persistence for time-versioned athlete thresholds.

Single source of truth for HRmax / resting HR / LTHR / threshold pace. Writes
are append-or-update on ``(athlete_id, effective_from)``: re-measuring a
threshold on a new date adds a row, so the value in force for any past activity
is still recoverable. See ``domain.thresholds.resolver`` for the read rules.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from typing import cast
from uuid import UUID

from domain.thresholds.resolver import ThresholdStep, threshold_from_row
from infrastructure.db.pool import ConnectionContext, get_pool

_COLUMNS = ("hr_max", "resting_hr", "lthr", "threshold_pace", "source", "algorithm_version")
_SELECT_COLUMNS = "effective_from, hr_max, resting_hr, lthr, threshold_pace"


def _connect() -> ConnectionContext:
    return get_pool().connection()


def _row(row: object) -> dict[str, object]:
    return dict(cast(Mapping[str, object], row))


class ThresholdRepo:
    async def history(self, athlete_id: UUID) -> list[ThresholdStep]:
        """All threshold steps for an athlete, oldest first."""
        query = f"""
        SELECT {_SELECT_COLUMNS}
        FROM athlete_thresholds
        WHERE athlete_id = %s
        ORDER BY effective_from
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id,))
            return [threshold_from_row(_row(row)) for row in await cur.fetchall()]

    async def current(self, athlete_id: UUID) -> ThresholdStep | None:
        """The most recent threshold step, or ``None`` when nothing is recorded."""
        query = f"""
        SELECT {_SELECT_COLUMNS}
        FROM athlete_thresholds
        WHERE athlete_id = %s
        ORDER BY effective_from DESC
        LIMIT 1
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id,))
            row = await cur.fetchone()
        return threshold_from_row(_row(row)) if row else None

    async def upsert(
        self,
        athlete_id: UUID,
        effective_from: date,
        values: Mapping[str, object],
        *,
        source: str = "manual",
        algorithm_version: str | None = None,
    ) -> ThresholdStep:
        """Record thresholds in force from ``effective_from``.

        Only the keys present in ``values`` are written, so a single-threshold
        edit does not blank out the others already recorded for that date.
        """
        columns = [column for column in _COLUMNS if column in values]
        if not columns:
            raise ValueError("no threshold values supplied")
        insert_columns = ", ".join(("athlete_id", "effective_from", *columns))
        placeholders = ", ".join(["%s"] * (2 + len(columns)))
        updates = ", ".join(f"{column} = EXCLUDED.{column}" for column in columns)
        query = f"""
        INSERT INTO athlete_thresholds ({insert_columns})
        VALUES ({placeholders})
        ON CONFLICT (athlete_id, effective_from) DO UPDATE SET {updates}
        RETURNING {_SELECT_COLUMNS}
        """
        params = (
            athlete_id,
            effective_from,
            *(values[column] for column in columns),
        )
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, params)
            row = await cur.fetchone()
        assert row is not None
        return threshold_from_row(_row(row))

    async def backfill_earlier_gaps(
        self,
        athlete_id: UUID,
        effective_from: date,
        values: Mapping[str, object],
    ) -> int:
        """Fill earlier rows where a threshold has no value yet.

        Resolving thresholds per activity date is what stops a later edit from
        rewriting past load — but it also means a value recorded today is
        invisible to every earlier activity, so a first-ever threshold_pace left
        all history without pace-based TSS. (Measured: 28 of 29 runs fell back
        to hrTSS for exactly this reason.)

        The athlete's earliest recorded value is the best available estimate for
        the period before it, and is applied only where the column is currently
        empty — an existing reading is never overwritten. This is a one-way
        widening of coverage, not a revision of history.
        """
        columns = [column for column in _COLUMNS if column in values]
        if not columns:
            return 0
        assignments = ", ".join(f"{column} = %s" for column in columns)
        query = f"""
        UPDATE athlete_thresholds
        SET {assignments}
        WHERE athlete_id = %s AND effective_from < %s
          AND {" AND ".join(f"{column} IS NULL" for column in columns)}
        """
        params = (*(values[column] for column in columns), athlete_id, effective_from)
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, params)
            # Some drivers expose rowcount as None for UPDATE without RETURNING;
            # the count is informational, so treat unknown as zero.
            return int(cur.rowcount or 0)

    async def earliest(self, athlete_id: UUID) -> ThresholdStep | None:
        """The oldest recorded step, which anchors the backfill decision."""
        query = f"""
        SELECT {_SELECT_COLUMNS}
        FROM athlete_thresholds
        WHERE athlete_id = %s
        ORDER BY effective_from
        LIMIT 1
        """
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id,))
            row = await cur.fetchone()
        return threshold_from_row(_row(row)) if row else None

    async def delete_all(self, athlete_id: UUID) -> None:
        query = "DELETE FROM athlete_thresholds WHERE athlete_id = %s"
        async with _connect() as conn, conn.cursor() as cur:
            _ = await cur.execute(query, (athlete_id,))
