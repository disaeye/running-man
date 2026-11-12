from __future__ import annotations

import json
from datetime import date
from typing import Any, cast
from uuid import UUID

from psycopg import AsyncConnection, AsyncCursor
from psycopg.rows import DictRow

from domain.run_classification.models import SessionSegment


async def persist_classifications(
    conn: AsyncConnection[DictRow],
    athlete_id: UUID,
    results: list[dict[str, object]],
    *,
    linked_only: bool = False,
) -> int:
    """Store the five-object result and mirror it onto any linked plan.

    ``linked_only`` writes the plan's execution and quality after a plan link,
    leaving the independently stored activity classification unchanged.
    """
    async with conn.cursor() as cur:
        for item in results:
            summary = cast(dict[str, object], item["session_classification"])
            execution = cast(dict[str, object], item["execution"])
            quality = cast(dict[str, object], item["quality"])
            evidence = cast(dict[str, object], item["evidence"])
            if not linked_only:
                await _upsert_classification(cur, athlete_id, item, summary, evidence)
            await cur.execute(
                """
                UPDATE training_calendar SET
                    execution = %s::jsonb,
                    quality = %s::jsonb,
                    session_classification = %s::jsonb,
                    completed_distance_m = %s,
                    completed_duration_s = %s,
                    completed_avg_hr = %s,
                    completed_rpe = %s,
                    actual_logged_at = COALESCE(actual_logged_at, now())
                WHERE athlete_id = %s AND linked_activity_id = %s AND status <> 'deleted'
                """,
                (
                    json.dumps(execution, ensure_ascii=True),
                    json.dumps(quality, ensure_ascii=True),
                    json.dumps(item, ensure_ascii=True),
                    _completed_distance(execution),
                    _completed_duration(execution),
                    _completed_avg_hr(execution),
                    _completed_rpe(evidence),
                    athlete_id,
                    str(summary["activity_id"]),
                ),
            )
    return len(results)


async def _upsert_classification(
    cur: AsyncCursor[DictRow],
    athlete_id: UUID,
    item: dict[str, object],
    summary: dict[str, object],
    evidence: dict[str, object],
) -> None:
    await cur.execute(
        """
        INSERT INTO session_classifications (
            athlete_id, activity_id, local_day, structure, session_type,
            primary_stimulus, pacing_pattern, display_name, display_line,
            evidence_grade, confidence, classification, algorithm_version
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s
        )
        ON CONFLICT (athlete_id, activity_id) DO UPDATE SET
            local_day = EXCLUDED.local_day,
            structure = EXCLUDED.structure,
            session_type = EXCLUDED.session_type,
            primary_stimulus = EXCLUDED.primary_stimulus,
            pacing_pattern = EXCLUDED.pacing_pattern,
            display_name = EXCLUDED.display_name,
            display_line = EXCLUDED.display_line,
            evidence_grade = EXCLUDED.evidence_grade,
            confidence = EXCLUDED.confidence,
            classification = EXCLUDED.classification,
            algorithm_version = EXCLUDED.algorithm_version,
            computed_at = now()
        """,
        (
            athlete_id,
            str(summary["activity_id"]),
            str(summary["local_day"]),
            str(summary["structure"]),
            str(summary["session_type"]),
            str(summary["primary_stimulus"]),
            str(summary["pacing_pattern"]),
            str(summary["display_name"]),
            str(summary["display_line"]),
            str(summary["evidence_grade"]),
            _number(summary["confidence"]),
            json.dumps(item, ensure_ascii=True),
            str(evidence["algorithm_version"]),
        ),
    )


async def read_classifications(
    conn: AsyncConnection[DictRow],
    athlete_id: UUID,
    start: date | None = None,
    end: date | None = None,
    activity_id: str | None = None,
) -> list[dict[str, object]]:
    """Read persisted results by local day, newest first."""
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT classification FROM session_classifications
            WHERE athlete_id = %s
              AND (%s::date IS NULL OR local_day >= %s::date)
              AND (%s::date IS NULL OR local_day <= %s::date)
              AND (%s::text IS NULL OR activity_id = %s)
            ORDER BY local_day DESC, activity_id
            """,
            (athlete_id, start, start, end, end, activity_id, activity_id),
        )
        rows = await cur.fetchall()
    result: list[dict[str, object]] = []
    for row in rows:
        value = _json_object(row["classification"])
        result.append(cast(dict[str, object], value))
    return result


def _json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        decoded = json.loads(value)
    elif isinstance(value, dict):
        decoded = value
    else:
        raise TypeError("session classification must be a JSON object")
    if not isinstance(decoded, dict):
        raise TypeError("session classification must be a JSON object")
    return decoded


def _segments(execution: dict[str, object]) -> list[SessionSegment]:
    raw = execution.get("segments")
    if not isinstance(raw, list):
        return []
    return [cast(SessionSegment, item) for item in raw if isinstance(item, dict)]


def _sum_number(segments: list[SessionSegment], key: str) -> float | None:
    values = [value for item in segments if (value := _number(item.get(key))) is not None]
    return round(sum(values), 1) if values else None


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _completed_distance(execution: dict[str, object]) -> float | None:
    return _number(execution.get("activity_distance_m"))


def _completed_duration(execution: dict[str, object]) -> float | None:
    return _sum_number(_segments(execution), "duration_s")


def _completed_avg_hr(execution: dict[str, object]) -> float | None:
    values = [
        value
        for item in _segments(execution)
        if (value := _number(item.get("avg_hr"))) is not None and value > 0
    ]
    return round(sum(values) / len(values), 1) if values else None


def _completed_rpe(evidence: dict[str, object]) -> float | None:
    subjective = evidence.get("subjective")
    if not isinstance(subjective, dict):
        return None
    return _number(subjective.get("rpe"))
