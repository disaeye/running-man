from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, cast
from uuid import UUID

from application.physiology.algorithm_contract import algorithm_contract
from domain.generated.algorithms import Algorithm
from domain.generated.metrics import Metric
from infrastructure.db.pool import get_pool


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
    async def execute(self, query: str, params: tuple[object, ...]) -> None: ...

    async def fetchone(self) -> Mapping[str, object] | None: ...


class _TransactionLike(Protocol):
    async def __aenter__(self) -> object: ...

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None: ...


class _ConnectionLike(Protocol):
    def cursor(self) -> _CursorLike: ...

    def transaction(self) -> _TransactionLike: ...


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
) -> None:
    contract = algorithm_contract(Algorithm.PHYSIOLOGY)
    candidates = _fact_candidates(results)
    async with get_pool().connection() as conn:
        async with cast(_ConnectionLike, conn).transaction():
            cur = cast(_ConnectionLike, conn).cursor()
            run_id = await _insert_run(
                cur,
                athlete_id,
                contract.version,
                _fingerprint(input_payload),
                window,
            )
            for candidate in candidates:
                await _insert_fact(cur, athlete_id, run_id, contract.version, candidate, window.end)
            await _update_run(cur, run_id, len(candidates))
            if candidates:
                await _project_athlete_cache(cur, athlete_id, contract.version, run_id, candidates)


async def _insert_run(
    cur: _CursorLike,
    athlete_id: UUID,
    version: str,
    fingerprint: str,
    window: ComputationWindow,
) -> UUID:
    await cur.execute(
        """
        INSERT INTO computation_runs (
            athlete_id, computation_kind, algorithm_version, input_fingerprint,
            trigger, input_window_start, input_window_end, status
        ) VALUES (%s, 'physiology', %s, %s, 'manual', %s, %s, 'running')
        RETURNING id
        """,
        (athlete_id, version, fingerprint, window.start, window.end),
    )
    row = await cur.fetchone()
    assert row is not None
    return cast(UUID, row["id"])


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


async def _update_run(cur: _CursorLike, run_id: UUID, rows_affected: int) -> None:
    await cur.execute(
        """
        UPDATE computation_runs
        SET status = 'success', rows_affected = %s, finished_at = now(), updated_at = now()
        WHERE id = %s
        """,
        (rows_affected, run_id),
    )


async def _project_athlete_cache(
    cur: _CursorLike,
    athlete_id: UUID,
    version: str,
    run_id: UUID,
    candidates: Sequence[_FactCandidate],
) -> None:
    """Record estimated thresholds as a dated step, and stamp the run.

    The estimates go to ``athlete_thresholds`` rather than to columns on
    ``athletes``: thresholds became time-versioned so a re-estimate cannot
    retroactively rescore past sessions, and the single-valued columns were
    removed with that change. Writing them here was left behind, which made
    every auto-calculation fail with an undefined column.

    Only keys with a value are written, so an estimate that could not produce
    (say) a threshold pace does not overwrite one the athlete entered by hand.
    """
    values: dict[str, object] = {}
    for candidate in (
        ("hr_max", _value_for(candidates, Metric.HR_MAX)),
        ("lthr", _value_for(candidates, Metric.LTHR)),
        ("threshold_pace", _value_for(candidates, Metric.THRESHOLD_PACE)),
    ):
        column, value = candidate
        if value is not None:
            values[column] = value

    if values:
        columns = ", ".join(values)
        placeholders = ", ".join(["%s"] * len(values))
        updates = ", ".join(f"{column} = EXCLUDED.{column}" for column in values)
        await cur.execute(
            f"""
            INSERT INTO athlete_thresholds (
                athlete_id, effective_from, {columns}, source, algorithm_version
            )
            VALUES (%s, CURRENT_DATE, {placeholders}, 'estimated', %s)
            ON CONFLICT (athlete_id, effective_from) DO UPDATE SET {updates},
                source = 'estimated', algorithm_version = EXCLUDED.algorithm_version
            """,
            (athlete_id, *values.values(), version),
        )

    await cur.execute(
        """
        UPDATE athletes
        SET physiology_updated_at = now(),
            physiology_computation_run_id = %s,
            physiology_algorithm_version = %s
        WHERE id = %s
        """,
        (run_id, version, athlete_id),
    )


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
