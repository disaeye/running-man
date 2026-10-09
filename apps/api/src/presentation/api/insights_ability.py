from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from application.physiology.service import cached_physiology
from domain.physiology.vdot import training_paces
from infrastructure.auth.models import Athlete
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/insights", tags=["insights"])


class TrainingPaceRangeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    min_s_per_km: float
    max_s_per_km: float


class TrainingPacesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    easy: TrainingPaceRangeResponse | None = None
    marathon: TrainingPaceRangeResponse | None = None
    threshold: TrainingPaceRangeResponse | None = None
    interval: TrainingPaceRangeResponse | None = None
    repetition: TrainingPaceRangeResponse | None = None


class AbilitySnapshotResponse(BaseModel):
    """Current ability vector — preferred response for Today/settings."""

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    vdot: float | None = None
    threshold_pace_s_per_km: float | None = None
    training_paces: TrainingPacesResponse | None = Field(default=None, alias="trainingPaces")
    data_available: bool = False


class AbilityPointResponse(BaseModel):
    """Legacy point shape still consumed by PerformanceAbility chart."""

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    date: str
    vo2max: float | None = None
    ftp: float | None = None
    avg_pace: float | None = Field(default=None, alias="avgPace")


@router.get("/ability", response_model=list[AbilityPointResponse])
async def get_ability(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> list[AbilityPointResponse]:
    """Ability for charts + current snapshot.

    Returns a list for backward compatibility with PerformanceAbility, which
    iterates ability points. When physiology is available the first element is
    today's snapshot (vDOT + threshold pace); otherwise empty list.
    """
    cached = await cached_physiology(athlete.id)
    if cached is None or cached.threshold_pace is None:
        return []


    threshold_pace = float(cached.threshold_pace)
    vdot_value = _vdot_proxy_from_threshold(threshold_pace)
    day = date.today().isoformat()
    point = AbilityPointResponse(
        date=day,
        vo2max=round(vdot_value, 1) if vdot_value else None,
        ftp=None,
        avgPace=round(threshold_pace) if threshold_pace else None,
    )
    return [point]


@router.get("/ability/current", response_model=AbilitySnapshotResponse)
async def get_ability_current(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> AbilitySnapshotResponse:
    """Explicit current ability snapshot for Today prescription UI."""
    cached = await cached_physiology(athlete.id)
    if cached is None or cached.threshold_pace is None:
        return AbilitySnapshotResponse()
    threshold_pace = float(cached.threshold_pace)
    vdot_value = _vdot_proxy_from_threshold(threshold_pace)
    paces = training_paces(vdot_value) if vdot_value else {}
    return AbilitySnapshotResponse(
        vdot=round(vdot_value, 1) if vdot_value else None,
        threshold_pace_s_per_km=round(threshold_pace),
        trainingPaces=_paces_response(paces),
        data_available=True,
    )


def _vdot_proxy_from_threshold(threshold_pace_s_km: float) -> float | None:
    if threshold_pace_s_km <= 0:
        return None
    threshold_m_per_min = 60.0 / threshold_pace_s_km * 1000.0
    v_vo2max = threshold_m_per_min / 0.88
    return v_vo2max * 0.2 + 3.5


def _paces_response(paces: dict[str, dict[str, float]]) -> TrainingPacesResponse:
    def _range(key: str) -> TrainingPaceRangeResponse | None:
        row = paces.get(key)
        if not row:
            return None
        return TrainingPaceRangeResponse(min_s_per_km=row["min"], max_s_per_km=row["max"])

    return TrainingPacesResponse(
        easy=_range("easy"),
        marathon=_range("marathon"),
        threshold=_range("threshold"),
        interval=_range("interval"),
        repetition=_range("repetition"),
    )


def _paces_dict(paces: dict[str, dict[str, float]]) -> dict[str, dict[str, float]] | None:
    if not paces:
        return None
    return {
        key: {"min": row["min"], "max": row["max"]}
        for key, row in paces.items()
        if "min" in row and "max" in row
    }
