from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from application.run_classification.evidence_values import metrics_from, threshold_at
from application.run_classification.subjective import subjective_rpe
from domain.run_classification.models import ActivityEvidence

METRICS = ("speed", "distance", "heart_rate", "altitude", "cadence")


async def load_evidence(
    conn: AsyncConnection[DictRow],
    athlete_id: UUID,
    activity_id: str | None = None,
    *,
    interval_overrides: dict[str, list[dict[str, object]]] | None = None,
) -> list[ActivityEvidence]:
    zone = await _timezone(conn, athlete_id)
    rows = await _activities(conn, athlete_id, zone, activity_id)
    if not rows:
        return []
    thresholds = await _thresholds(conn, athlete_id)
    ids = [str(row["activity_id"]) for row in rows]
    facts = await _facts(conn, athlete_id)
    streams = await _streams(conn, athlete_id, ids)
    laps = await _laps(conn, athlete_id, ids)
    plans = await _plans(conn, athlete_id)
    persisted = await _intervals(conn, athlete_id, ids)
    result: list[ActivityEvidence] = []
    for row in rows:
        aid = str(row["activity_id"])
        local_day = _date(row["local_day"])
        raw = row["raw_data"] if isinstance(row["raw_data"], dict) else {}
        exact = _exact_intervals(raw)
        if aid in persisted:
            exact = persisted[aid]
        if interval_overrides is not None and aid in interval_overrides:
            exact = interval_overrides[aid]
        result.append(
            ActivityEvidence(
                activity_id=aid,
                local_day=local_day.isoformat(),
                context="completed",
                sport=str(row["sport"]),
                duration_s=int(row["duration_s"] or 0),
                distance_m=float(row["distance_m"] or 0.0),
                raw_data=raw,
                streams=streams.get(aid, {}),
                laps=laps.get(aid, []),
                exact_intervals=exact,
                threshold=threshold_at(thresholds, local_day),
                metrics=metrics_from(facts.get(aid, {}), row),
                linked_activity_id=aid if aid in plans else None,
                is_race=bool(row["is_race"]),
                race_marker_present=bool(raw.get("race")) or bool(row["is_race"]),
                rpe=subjective_rpe(row.get("rpe"), raw),
                direct_metabolic_thresholds=False,
                linked_prescription=plans.get(aid),
            )
        )
    return result


async def _timezone(conn: AsyncConnection[DictRow], athlete_id: UUID) -> str:
    async with conn.cursor() as cur:
        await cur.execute("SELECT timezone FROM athletes WHERE id = %s", (athlete_id,))
        row = await cur.fetchone()
    return str(row["timezone"]) if row and row.get("timezone") else "UTC"


async def _activities(
    conn: AsyncConnection[DictRow],
    athlete_id: UUID,
    zone: str,
    activity_id: str | None,
) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT ac.activity_id, ac.start_time, ac.sport, ac.distance_m, ac.duration_s,
                   ac.avg_hr, ac.raw_data, ac.is_race,
                   (ac.start_time AT TIME ZONE %s)::date AS local_day,
                   summary.rpe, summary.trimp
            FROM activity_compute ac
            JOIN athletes athlete ON athlete.id = ac.athlete_id
            LEFT JOIN activity_summary summary
              ON summary.athlete_id = ac.athlete_id
             AND summary.activity_id = ac.activity_id
             AND summary.start_time = ac.start_time
            WHERE ac.athlete_id = %s
              AND LOWER(REPLACE(REPLACE(REPLACE(
                  COALESCE(ac.sport, ''), '_', ''), '-', ''), ' ', ''))
                  IN ('run', 'running', 'virtualrun', 'trailrun', 'treadmillrun', 'indoorrun')
              AND (%s::text IS NULL OR ac.activity_id = %s)
              AND ac.duration_s > 0 AND ac.distance_m > 0
            ORDER BY ac.start_time, ac.activity_id
            """,
            (zone, athlete_id, activity_id, activity_id),
        )
        return [dict(row) for row in await cur.fetchall()]


async def _thresholds(conn: AsyncConnection[DictRow], athlete_id: UUID) -> list[dict[str, Any]]:
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT effective_from, hr_max, resting_hr, lthr, threshold_pace "
            "FROM athlete_thresholds WHERE athlete_id = %s ORDER BY effective_from",
            (athlete_id,),
        )
        return [dict(row) for row in await cur.fetchall()]


async def _facts(conn: AsyncConnection[DictRow], athlete_id: UUID) -> dict[str, dict[str, float]]:
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT DISTINCT ON (subject_key, metric_key) subject_key, metric_key, value "
            "FROM derived_metric_facts WHERE athlete_id = %s AND subject_type = 'activity' "
            "ORDER BY subject_key, metric_key, computed_at DESC",
            (athlete_id,),
        )
        rows = [dict(row) for row in await cur.fetchall()]
    result: dict[str, dict[str, float]] = defaultdict(dict)
    for row in rows:
        result[str(row["subject_key"])][str(row["metric_key"])] = float(row["value"])
    return result


async def _streams(
    conn: AsyncConnection[DictRow], athlete_id: UUID, ids: list[str]
) -> dict[str, dict[str, list[tuple[float, float]]]]:
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT s.activity_id, s.metric_type, "
            "EXTRACT(EPOCH FROM (s.sample_time - a.start_time)) AS elapsed_s, s.value "
            "FROM activity_streams s JOIN activity_compute a "
            "  ON a.activity_id = s.activity_id AND a.athlete_id = s.athlete_id "
            "WHERE s.athlete_id = %s AND s.activity_id = ANY(%s) "
            "  AND s.metric_type = ANY(%s) "
            "ORDER BY s.activity_id, s.metric_type, s.sample_time",
            (athlete_id, ids, list(METRICS)),
        )
        rows = [dict(row) for row in await cur.fetchall()]
    result: dict[str, dict[str, list[tuple[float, float]]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        result[str(row["activity_id"])][str(row["metric_type"])].append(
            (float(row["elapsed_s"]), float(row["value"]))
        )
    return {key: dict(value) for key, value in result.items()}


async def _laps(
    conn: AsyncConnection[DictRow], athlete_id: UUID, ids: list[str]
) -> dict[str, list[dict[str, object]]]:
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT l.activity_id, l.lap_index, l.duration_s, l.distance_m, l.avg_hr, "
            "EXTRACT(EPOCH FROM (l.start_time - a.start_time)) AS start_s "
            "FROM activity_laps l JOIN activity_compute a "
            "  ON a.activity_id = l.activity_id AND a.athlete_id = l.athlete_id "
            "WHERE l.athlete_id = %s AND l.activity_id = ANY(%s) "
            "ORDER BY l.activity_id, l.lap_index",
            (athlete_id, ids),
        )
        rows = [dict(row) for row in await cur.fetchall()]
    result: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        result[str(row["activity_id"])].append(row)
    return result


async def _intervals(
    conn: AsyncConnection[DictRow], athlete_id: UUID, ids: list[str]
) -> dict[str, list[dict[str, object]]]:
    async with conn.cursor() as cur:
        await cur.execute("SELECT to_regclass('public.activity_intervals')")
        row = await cur.fetchone()
    if not row or row.get("to_regclass") is None:
        return {}
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT activity_id, payload FROM activity_intervals "
            "WHERE athlete_id = %s AND activity_id = ANY(%s)",
            (athlete_id, ids),
        )
        rows = [dict(row) for row in await cur.fetchall()]
    result: dict[str, list[dict[str, object]]] = {}
    for row in rows:
        payload = row["payload"]
        if not isinstance(payload, dict):
            continue
        intervals = payload.get("icu_intervals")
        if not isinstance(intervals, list):
            result[str(row["activity_id"])] = []
            continue
        result[str(row["activity_id"])] = [item for item in intervals if isinstance(item, dict)]
    return result


async def _plans(conn: AsyncConnection[DictRow], athlete_id: UUID) -> dict[str, dict[str, object]]:
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT linked_activity_id, workout_prescription FROM training_calendar "
            "WHERE athlete_id = %s AND linked_activity_id IS NOT NULL "
            "AND workout_prescription IS NOT NULL",
            (athlete_id,),
        )
        rows = [dict(row) for row in await cur.fetchall()]
    return {
        str(row["linked_activity_id"]): row["workout_prescription"]
        for row in rows
        if isinstance(row["workout_prescription"], dict)
    }


def _exact_intervals(raw: dict[str, object]) -> list[dict[str, object]]:
    value = raw.get("icu_intervals")
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _date(value: object) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])
