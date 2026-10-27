"""Persisting an estimate: units, provenance, and repeatability.

The failure these tests were written for: pressing 开始估算 twice from unchanged
data inserted a second `success` run with the same input fingerprint, which a
partial unique index forbids, so the second click returned 500 and the UI showed
"估算失败" for a calculation that had already succeeded.
"""

from datetime import UTC, date, datetime
from uuid import UUID

import psycopg
import pytest

from application.physiology.facts import (
    ComputationWindow,
    PhysiologyResults,
    persist_physiology_facts,
)
from domain.algorithms import algorithm_contract
from domain.generated.algorithms import Algorithm
from infrastructure.db.pool import get_pool
from tests.application.load.activity_fact_schema import ensure_activity_fact_schema

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.no_db]

PHYSIOLOGY_VERSION = algorithm_contract(Algorithm.PHYSIOLOGY).version

ATHLETE_ID = UUID("00000000-0000-0000-0000-000000000021")
WINDOW = ComputationWindow(
    start=datetime(2024, 7, 15, tzinfo=UTC),
    end=datetime(2026, 7, 15, tzinfo=UTC),
)
EFFECTIVE_FROM = date(2026, 7, 15)

RESULTS = PhysiologyResults(
    hr_max={"hr_max": 195, "method": "tangent", "confidence": "high"},
    lthr={"lthr": 175, "method": "best_effort_window", "confidence": "medium"},
    threshold_pace={
        "threshold_pace_s_per_km": 270,
        "method": "daniels_vdot_threshold",
        "confidence": "low",
    },
)


async def _rows(query: str, params: tuple[object, ...]) -> list[dict[str, object]]:
    async with get_pool().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            return [dict(row) for row in await cur.fetchall()]


async def _persist(results: PhysiologyResults, payload: dict[str, object]) -> dict[str, object]:
    return await persist_physiology_facts(
        ATHLETE_ID, results, payload, WINDOW, effective_from=EFFECTIVE_FROM
    )


def _seed(db_conn: psycopg.Connection) -> None:
    ensure_activity_fact_schema(ATHLETE_ID)


async def test_estimating_twice_from_unchanged_data_keeps_one_successful_run(
    db_conn: psycopg.Connection,
) -> None:
    _seed(db_conn)

    first = await _persist(RESULTS, {"samples": [1, 2, 3]})
    second = await _persist(RESULTS, {"samples": [1, 2, 3]})

    runs = await _rows(
        "SELECT status FROM computation_runs WHERE athlete_id = %s ORDER BY started_at",
        (ATHLETE_ID,),
    )
    assert [run["status"] for run in runs] == ["success", "skipped"]

    facts = await _rows(
        "SELECT count(*) AS total FROM derived_metric_facts WHERE athlete_id = %s",
        (ATHLETE_ID,),
    )
    assert facts[0]["total"] == 3

    # The estimate is unchanged, so the repeat must not stack a second step on
    # the same day or claim to have written anything for backfill.
    thresholds = await _rows(
        "SELECT source, hr_max, lthr, threshold_pace FROM athlete_thresholds WHERE athlete_id = %s",
        (ATHLETE_ID,),
    )
    assert thresholds == [
        {"source": "estimated", "hr_max": 195, "lthr": 175, "threshold_pace": 270.0}
    ]
    assert first == {"hr_max": 195, "lthr": 175, "threshold_pace": 270}
    assert second == {}


async def test_facts_store_units_methods_confidence_and_run_version(
    db_conn: psycopg.Connection,
) -> None:
    _seed(db_conn)

    await _persist(RESULTS, {"samples": [4]})

    facts = await _rows(
        """
        SELECT metric_key, unit, method, confidence, algorithm_version, value
        FROM derived_metric_facts WHERE athlete_id = %s ORDER BY metric_key
        """,
        (ATHLETE_ID,),
    )
    assert [(row["metric_key"], row["unit"], row["value"]) for row in facts] == [
        ("hr_max", "bpm", 195.0),
        ("lthr", "bpm", 175.0),
        ("threshold_pace", "s_km", 270.0),
    ]
    assert [(row["method"], row["confidence"]) for row in facts] == [
        ("tangent", 0.9),
        ("best_effort_window", 0.6),
        ("daniels_vdot_threshold", 0.3),
    ]
    assert all(row["algorithm_version"] == PHYSIOLOGY_VERSION for row in facts)

    stamps = await _rows(
        """
        SELECT physiology_algorithm_version, physiology_computation_run_id
        FROM athletes WHERE id = %s
        """,
        (ATHLETE_ID,),
    )
    assert stamps[0]["physiology_algorithm_version"] == PHYSIOLOGY_VERSION
    assert stamps[0]["physiology_computation_run_id"] is not None


async def test_a_refused_estimate_writes_no_facts_and_stamps_nothing(
    db_conn: psycopg.Connection,
) -> None:
    _seed(db_conn)

    written = await _persist(
        PhysiologyResults(
            hr_max={"hr_max": None, "method": None, "confidence": None},
            lthr={"lthr": None, "method": None, "confidence": None},
            threshold_pace={
                "threshold_pace_s_per_km": None,
                "method": None,
                "confidence": None,
            },
        ),
        {"empty": True},
    )

    facts = await _rows(
        "SELECT count(*) AS total FROM derived_metric_facts WHERE athlete_id = %s",
        (ATHLETE_ID,),
    )
    thresholds = await _rows(
        "SELECT count(*) AS total FROM athlete_thresholds WHERE athlete_id = %s",
        (ATHLETE_ID,),
    )
    stamps = await _rows(
        "SELECT physiology_updated_at FROM athletes WHERE id = %s", (ATHLETE_ID,)
    )

    assert written == {}
    assert facts[0]["total"] == 0
    assert thresholds[0]["total"] == 0
    # A stamped empty run would make `cached_physiology` serve three nulls as a
    # fresh result for the next seven days.
    assert stamps[0]["physiology_updated_at"] is None
