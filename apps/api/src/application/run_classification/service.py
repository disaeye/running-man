from __future__ import annotations

from statistics import StatisticsError
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow

from application.run_classification.load import load_evidence
from application.run_classification.persistence import persist_classifications
from domain.run_classification.analysis import stream_features
from domain.run_classification.classifier import classify_session
from domain.run_classification.models import ActivityEvidence
from domain.run_classification.segments import build_segments


def classify_evidence(evidence: ActivityEvidence) -> dict[str, object]:
    build = build_segments(evidence)
    features = stream_features(evidence)
    return classify_session(
        evidence,
        build.segments,
        build.work_groups,
        features,
        exact_source=build.exact_source,
        limitations=build.limitations,
        measurement_sources=build.measurement_sources,
    )


async def classify_activities(
    conn: AsyncConnection[DictRow],
    athlete_id: UUID,
    activity_id: str | None = None,
    *,
    interval_overrides: dict[str, list[dict[str, object]]] | None = None,
) -> list[dict[str, object]]:
    evidence_rows = await load_evidence(
        conn, athlete_id, activity_id, interval_overrides=interval_overrides
    )
    results: list[dict[str, object]] = []
    errors: list[dict[str, str]] = []
    for evidence in evidence_rows:
        try:
            results.append(classify_evidence(evidence))
        except (ValueError, ZeroDivisionError, StatisticsError) as error:
            errors.append({"activity_id": evidence.activity_id, "error": str(error)})
    if errors:
        raise ClassificationBatchError(errors)
    return results


async def recompute_session_classifications(
    conn: AsyncConnection[DictRow], athlete_id: UUID
) -> int:
    """Reclassify every running activity and store the reusable result."""
    results = await classify_activities(conn, athlete_id)
    return await persist_classifications(conn, athlete_id, results)


class ClassificationBatchError(RuntimeError):
    def __init__(self, errors: list[dict[str, str]]) -> None:
        self.errors = errors
        super().__init__(f"{len(errors)} activities failed classification")
