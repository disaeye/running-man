from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Protocol, cast
from uuid import UUID

import psycopg
from psycopg.rows import DictRow

from application.computation.runs import ComputationRunSpec
from application.computation.service import (
    ComputationExecution,
    PreparedComputation,
    execute_idempotent_computation,
)
from application.physiology.threshold_projection import (
    record_threshold_step,
    stamp_physiology_run,
)
from domain.algorithms import algorithm_contract
from domain.generated.algorithms import Algorithm
from domain.generated.metrics import Metric


@dataclass(frozen=True, slots=True)
class PhysiologyResults:
    hr_max: Mapping[str, object]
    lthr: Mapping[str, object]
    threshold_pace: Mapping[str, object]
    vdot: Mapping[str, object] | None = None


@dataclass(frozen=True, slots=True)
class ComputationWindow:
    start: datetime
    end: datetime


class _CursorLike(Protocol):
    async def execute(self, query: str, params: tuple[object, ...]) -> object: ...


@dataclass(frozen=True, slots=True)
class _FactCandidate:
    metric: Metric
    unit: str
    value: float
    method: str
    confidence: float | None
    metadata: Mapping[str, object]


async def persist_physiology_facts(
    athlete_id: UUID,
    results: PhysiologyResults,
    input_payload: Mapping[str, object],
    window: ComputationWindow,
    effective_from: date,
) -> dict[str, object]:
    """Store the estimates and return the threshold values actually written.

    ``effective_from`` is the athlete's calendar day, not the database host's:
    threshold history is resolved per activity date, so a step stamped on the
    wrong side of midnight applies to the wrong sessions.

    The returned mapping is what remains after the manual-value guard, and the
    caller uses it to widen coverage over earlier activities; an empty mapping
    means the rows were left alone and nothing needs backfilling.

    Runs through the shared idempotent computation, which keys a successful run
    on its input fingerprint: estimating twice from unchanged data must not
    insert a second success for the same inputs, because a partial unique index
    forbids it and the repeat would fail with a unique violation instead of
    returning the same answer.
    """
    contract = algorithm_contract(Algorithm.PHYSIOLOGY)
    candidates = _fact_candidates(results)
    written: dict[str, object] = {}

    async def prepare(
        _conn: psycopg.AsyncConnection[DictRow],
    ) -> PreparedComputation[list[_FactCandidate]]:
        return PreparedComputation(
            spec=ComputationRunSpec(
                athlete_id=athlete_id,
                computation_kind="physiology",
                algorithm_version=contract.version,
                input_fingerprint=_fingerprint(input_payload),
                trigger="manual",
                input_window_start=window.start,
                input_window_end=window.end,
            ),
            payload=candidates,
        )

    async def write(
        conn: psycopg.AsyncConnection[DictRow], run_id: UUID, payload: list[_FactCandidate]
    ) -> int:
        async with conn.cursor() as cur:
            for candidate in payload:
                await _insert_fact(cur, athlete_id, run_id, contract.version, candidate, window.end)
            # Only a run that produced a fact counts as having computed anything.
            # Stamping `physiology_updated_at` on an empty run makes
            # `cached_physiology` report a fresh hit with every value null for the
            # next seven days, so a later estimate would not be recomputed.
            if payload:
                written.update(
                    await record_threshold_step(
                        cur,
                        athlete_id,
                        contract.version,
                        _threshold_values(payload),
                        effective_from,
                    )
                )
                await stamp_physiology_run(cur, athlete_id, contract.version, run_id)
        return len(payload)

    await execute_idempotent_computation(
        ComputationExecution(
            athlete_id=athlete_id,
            computation_kind="physiology",
            prepare=prepare,
            write=write,
        )
    )
    return written


async def _insert_fact(
    cur: _CursorLike,
    athlete_id: UUID,
    run_id: UUID,
    version: str,
    candidate: _FactCandidate,
    effective_at: datetime,
) -> None:
    await cur.execute(
        """
        INSERT INTO derived_metric_facts (
            athlete_id, subject_type, subject_key, metric_key, unit, value,
            effective_at, algorithm_version, computation_run_id, method,
            confidence, metadata
        ) VALUES (%s, 'athlete', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        ON CONFLICT (
            athlete_id, subject_type, subject_key, metric_key, effective_at, algorithm_version
        ) DO UPDATE SET
            value = EXCLUDED.value,
            computation_run_id = EXCLUDED.computation_run_id,
            method = EXCLUDED.method,
            confidence = EXCLUDED.confidence,
            metadata = EXCLUDED.metadata,
            computed_at = now()
        """,
        (
            athlete_id,
            str(athlete_id),
            candidate.metric.value,
            candidate.unit,
            candidate.value,
            effective_at,
            version,
            run_id,
            candidate.method,
            candidate.confidence,
            json.dumps(candidate.metadata, sort_keys=True),
        ),
    )


def _threshold_values(
    candidates: Sequence[_FactCandidate],
) -> dict[str, object]:
    """The threshold columns an estimate can produce, extracted from the facts."""
    values: dict[str, object] = {}
    for column, value in (
        ("hr_max", _value_for(candidates, Metric.HR_MAX)),
        ("lthr", _value_for(candidates, Metric.LTHR)),
        ("threshold_pace", _value_for(candidates, Metric.THRESHOLD_PACE)),
    ):
        if value is not None:
            values[column] = value
    return values


def _fact_candidates(results: PhysiologyResults) -> list[_FactCandidate]:
    candidates: list[_FactCandidate] = []
    _append_candidate(candidates, Metric.HR_MAX, "bpm", "hr_max", results.hr_max)
    _append_candidate(candidates, Metric.LTHR, "bpm", "lthr", results.lthr)
    _append_candidate(
        candidates,
        Metric.THRESHOLD_PACE,
        "s_km",
        "threshold_pace_s_per_km",
        results.threshold_pace,
    )
    if results.vdot is not None:
        _append_candidate(candidates, Metric.VDOT, "score", "vdot", results.vdot)
    return candidates


def _append_candidate(
    candidates: list[_FactCandidate],
    metric: Metric,
    unit: str,
    value_key: str,
    result: Mapping[str, object],
) -> None:
    value = result.get(value_key)
    method = result.get("method")
    if value is None or method is None:
        return
    candidates.append(
        _FactCandidate(
            metric=metric,
            unit=unit,
            value=float(cast(int | float, value)),
            method=str(method),
            confidence=_confidence(result.get("confidence")),
            metadata={"confidence_label": result.get("confidence")},
        )
    )


def _confidence(value: object) -> float | None:
    match value:
        case "high":
            return 0.9
        case "medium":
            return 0.6
        case "low":
            return 0.3
        case int() | float():
            return float(value)
        case None:
            return None
        case _:
            return None


def _value_for(candidates: Sequence[_FactCandidate], metric: Metric) -> float | None:
    for candidate in candidates:
        if candidate.metric == metric:
            return candidate.value
    return None


def _fingerprint(payload: Mapping[str, object]) -> str:
    encoded = json.dumps(payload, default=str, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()
