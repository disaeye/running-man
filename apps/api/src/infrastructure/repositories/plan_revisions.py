"""计划版本：每次生成的整份快照，以及历史版本的读取。"""

from __future__ import annotations

import json
from datetime import datetime
from typing import cast
from uuid import UUID

from infrastructure.db.pool import ConnectionContext, get_pool

_COLUMNS = "revision_id, goal_id, reason, events, phases, created_at"


def _connect() -> ConnectionContext:
    return get_pool().connection()


class PlanRevisionRepo:
    async def insert(
        self,
        athlete_id: UUID,
        goal_id: UUID,
        reason: str,
        events: list[dict[str, object]],
        phases: list[dict[str, object]],
    ) -> UUID:
        """写入一次生成的快照，返回版本号。"""
        async with _connect() as conn, conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO plan_revisions (athlete_id, goal_id, reason, events, phases) "
                "VALUES (%s, %s, %s, %s::jsonb, %s::jsonb) RETURNING revision_id",
                (
                    athlete_id,
                    goal_id,
                    reason,
                    json.dumps(events, ensure_ascii=True),
                    json.dumps(phases, ensure_ascii=True),
                ),
            )
            row = await cur.fetchone()
        assert row is not None
        return cast(UUID, row["revision_id"])

    async def list_for_goal(self, athlete_id: UUID, goal_id: UUID) -> list[dict[str, object]]:
        """一个目标的全部版本，最新在前。"""
        async with _connect() as conn, conn.cursor() as cur:
            await cur.execute(
                f"SELECT {_COLUMNS} FROM plan_revisions "
                "WHERE athlete_id = %s AND goal_id = %s ORDER BY created_at DESC",
                (athlete_id, goal_id),
            )
            rows = await cur.fetchall()
        return [_summary(row) for row in rows]

    async def get(self, athlete_id: UUID, revision_id: UUID) -> dict[str, object] | None:
        """单个版本的完整快照。"""
        async with _connect() as conn, conn.cursor() as cur:
            await cur.execute(
                f"SELECT {_COLUMNS} FROM plan_revisions WHERE athlete_id = %s AND revision_id = %s",
                (athlete_id, revision_id),
            )
            row = await cur.fetchone()
        return _detail(row) if row else None


def _summary(row: object) -> dict[str, object]:
    values = dict(cast(dict[str, object], row))
    events = values.get("events")
    phases = values.get("phases")
    return {
        "revision_id": str(values["revision_id"]),
        "reason": str(values["reason"]),
        "created_at": values["created_at"],
        "events_created": len(events) if isinstance(events, list) else 0,
        "phases_created": len(phases) if isinstance(phases, list) else 0,
    }


def _detail(row: object) -> dict[str, object]:
    values = dict(cast(dict[str, object], row))
    summary = _summary(row)
    created = values.get("created_at")
    summary["created_at"] = created if isinstance(created, datetime) else None
    summary["events"] = values.get("events") if isinstance(values.get("events"), list) else []
    summary["phases"] = values.get("phases") if isinstance(values.get("phases"), list) else []
    return summary
