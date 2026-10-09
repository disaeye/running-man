from __future__ import annotations

from dataclasses import dataclass

SYNC_WARNING_HOURS = 24
SYNC_ERROR_HOURS = 72
RUN_MISSING_GPS_INFO_COUNT = 2
WELLNESS_WARNING_DAYS = 4
PHYSIOLOGY_STALE_DAYS = 7


@dataclass(frozen=True, slots=True)
class QualityIssue:
    key: str
    severity: str
    label: str
    entity_type: str
    count: int | None = None


def never_synced_issue() -> QualityIssue:
    return QualityIssue(
        key="sync_freshness",
        severity="error",
        label="从未同步",
        entity_type="intervals_icu",
    )
