"""Weight tracking repository — uses health_wellness table, weight column only.

body_fat_pct is accepted by the API but not persisted (column TBD).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from uuid import UUID

from infrastructure.db.pool import get_pool

MIN_FOR_TREND = 2


class WeightRepo:
    """Repository for weight entries backed by the health_wellness table."""

    async def list_entries(
        self,
        athlete_id: UUID,
        start: date,
        end: date,
    ) -> list[dict[str, Any]]:
        query = """
            SELECT day, weight
            FROM health_wellness
            WHERE athlete_id = %s AND day BETWEEN %s AND %s
              AND weight IS NOT NULL
            ORDER BY day
        """
        async with get_pool().connection() as conn:
            cur = conn.cursor()
            await cur.execute(query, (athlete_id, start, end))
            rows = await cur.fetchall()
        return [
            {"date": str(r["day"]), "weight_kg": float(r["weight"]), "body_fat_pct": None}
            for r in rows
        ]

    async def upsert_entry(
        self,
        athlete_id: UUID,
        day: date,
        weight_kg: float,
    ) -> dict[str, Any]:
        """Insert or update weight for a given athlete + day. Returns the saved entry."""
        query = """
            INSERT INTO health_wellness (day, athlete_id, weight)
            VALUES (%s, %s, %s)
            ON CONFLICT (day, athlete_id)
            DO UPDATE SET weight = EXCLUDED.weight
            RETURNING day, weight
        """
        async with get_pool().connection() as conn:
            cur = conn.cursor()
            await cur.execute(query, (day, athlete_id, weight_kg))
            r = await cur.fetchone()
        if r is None:
            # fallback — shouldn't happen with RETURNING
            return {"date": str(day), "weight_kg": weight_kg, "body_fat_pct": None}
        return {"date": str(r["day"]), "weight_kg": float(r["weight"]), "body_fat_pct": None}

    async def delete_entry(self, athlete_id: UUID, day: date) -> bool:
        """Set weight to NULL for the given athlete + day. Returns True if a row was affected."""
        query = """
            UPDATE health_wellness
            SET weight = NULL
            WHERE athlete_id = %s AND day = %s
        """
        async with get_pool().connection() as conn:
            cur = conn.cursor()
            await cur.execute(query, (athlete_id, day))
            return cur.rowcount > 0

    async def get_trend_stats(self, athlete_id: UUID) -> dict[str, Any]:
        """30-day trend: current, avg, min, max, and net change.

        Returns None for all fields when no data exists in the window.
        """
        today = date.today()
        thirty_days_ago = today - timedelta(days=30)
        query = """
            SELECT day, weight
            FROM health_wellness
            WHERE athlete_id = %s AND day >= %s AND weight IS NOT NULL
            ORDER BY day DESC
        """
        async with get_pool().connection() as conn:
            cur = conn.cursor()
            await cur.execute(query, (athlete_id, thirty_days_ago))
            rows = await cur.fetchall()

        weights = [float(r["weight"]) for r in rows if r["weight"] is not None]
        if not weights:
            return {
                "current": None,
                "avg_30d": None,
                "trend_30d": None,
                "min_30d": None,
                "max_30d": None,
            }

        current = weights[0]  # most recent
        avg = sum(weights) / len(weights)
        trend = round(current - weights[-1], 1) if len(weights) >= MIN_FOR_TREND else 0.0
        return {
            "current": current,
            "avg_30d": round(avg, 1),
            "trend_30d": trend,
            "min_30d": min(weights),
            "max_30d": max(weights),
        }
