"""Heart rate and pace zones for the athlete's current thresholds.

The HR table returned here is the single place zone boundaries are produced.
Previously this endpoint applied the LTHR percentage table to the athlete's
HRmax, while the load kernel applied the same table to LTHR — so "Z4" denoted
two different heart rates. Boundaries now come from the selected
``ZoneScheme``, which names its own reference, and the resolved inputs are
returned alongside so the client can show what the percentages were taken of.

Threshold resolution goes through ``application.thresholds.effective`` so this
endpoint and ``/athletes/me`` can never disagree about the athlete's HRmax.
"""


from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, model_validator

from application.thresholds.effective import (
    EffectiveThresholds,
    resolve_effective_thresholds,
)
from domain.insights.pace_zones import pace_zones as derive_pace_zones
from domain.insights.zone_schemes import (
    HR_SCHEMES,
    hr_zones_for_scheme,
    scheme_for,
    unavailable_requirements,
)
from domain.insights.zones import apply_overrides
from infrastructure.auth.models import Athlete
from infrastructure.repositories.zone_overrides import (
    delete_overrides,
    list_overrides,
    upsert_override,
)
from infrastructure.repositories.zone_scheme import get_hr_scheme, set_hr_scheme
from presentation.api.analytics_insight_contracts import (
    ZoneOverrideRowResponse,
    ZoneOverrideUpdateResponse,
    ZoneResponse,
    ZoneSchemeResponse,
    ZonesResponse,
)
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/insights/zones", tags=["insights"])

# Z1 pace windows are capped at this value by the domain; anything at or above
# it is an open-ended zone (no max_value in responses).
OPEN_ENDED_PACE_CAP_S_KM = 1e6


class ZoneOverride(BaseModel):
    zone: int = Field(ge=1)
    min_pct: float = Field(ge=0)
    max_pct: float = Field(gt=0)

    @model_validator(mode="after")
    def validate_bounds(self) -> "ZoneOverride":
        if self.min_pct >= self.max_pct:
            raise ValueError("min_pct must be less than max_pct")
        return self


class ZoneOverrideUpdate(BaseModel):
    metric: Literal["hr"]
    overrides: list[ZoneOverride] = Field(min_length=1)


class HrSchemeUpdate(BaseModel):
    hr_scheme: Literal["hrmax", "lthr", "karvonen"]


@router.get("", response_model=ZonesResponse)
async def get_zones(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> ZonesResponse:
    thresholds = await resolve_effective_thresholds(athlete.id)
    hr_max = _positive_int(thresholds.hr_max.value)
    lthr = _positive_int(thresholds.lthr.value)
    resting_hr = _positive_int(thresholds.resting_hr.value)
    threshold_pace = _positive_float(thresholds.threshold_pace.value)

    scheme = scheme_for(await get_hr_scheme(athlete.id))
    missing = list(
        unavailable_requirements(
            scheme, hr_max=hr_max, lthr=lthr, resting_hr=resting_hr
        )
    )
    base = hr_zones_for_scheme(
        scheme, hr_max=hr_max, lthr=lthr, resting_hr=resting_hr
    )
    overrides = await list_overrides(athlete.id)
    hr_rows = (
        apply_overrides(base, None, overrides)[0]  # type: ignore[arg-type]
        if base is not None
        else []
    )
    pace_rows = _pace_zone_rows(threshold_pace)
    return ZonesResponse(
        hr_max=hr_max,
        hr_max_estimated=thresholds.hr_max.is_estimated,
        hr_max_source=thresholds.hr_max.source,
        lthr=lthr,
        resting_hr=resting_hr,
        threshold_pace=threshold_pace,
        hr_scheme=scheme.key,
        hr_scheme_label=scheme.label,
        hr_scheme_citation=scheme.citation,
        unavailable_requirements=missing,
        has_overrides=bool(overrides),
        hr_schemes=[ZoneSchemeResponse.model_validate(row) for row in _scheme_rows(thresholds)],
        hr_zones=[ZoneResponse.model_validate(row) for row in hr_rows],
        pace_zones=[ZoneResponse.model_validate(row) for row in pace_rows]
        if pace_rows
        else None,
    )


@router.put("/scheme", response_model=ZonesResponse)
async def put_hr_scheme(
    payload: HrSchemeUpdate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> ZonesResponse:
    """Switch zone scheme. Rejects a scheme whose inputs are not on file.

    Accepting it would leave the athlete staring at an empty zone table with no
    explanation; rejecting names the missing field instead.
    """
    thresholds = await resolve_effective_thresholds(athlete.id)
    scheme = HR_SCHEMES[payload.hr_scheme]
    missing = unavailable_requirements(
        scheme,
        hr_max=_positive_int(thresholds.hr_max.value),
        lthr=_positive_int(thresholds.lthr.value),
        resting_hr=_positive_int(thresholds.resting_hr.value),
    )
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"missing thresholds for scheme: {', '.join(missing)}",
        )
    _ = await set_hr_scheme(athlete.id, payload.hr_scheme)
    return await get_zones(athlete)


@router.put("", response_model=ZoneOverrideUpdateResponse)
async def put_zones(
    payload: ZoneOverrideUpdate,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> ZoneOverrideUpdateResponse:
    _validate_contiguous(payload.overrides)
    rows = [
        await upsert_override(athlete.id, payload.metric, row.zone, row.min_pct, row.max_pct)
        for row in payload.overrides
    ]
    return ZoneOverrideUpdateResponse(
        metric=payload.metric,
        overrides=[ZoneOverrideRowResponse.model_validate(row) for row in rows],
    )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_zones(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
) -> Response:
    await delete_overrides(athlete.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _scheme_rows(thresholds: EffectiveThresholds) -> list[dict[str, object]]:
    """Every scheme with its availability, so the picker can disable the rest.

    Sending availability with the list keeps the client from having to know
    each scheme's requirements; it only has to render what it is told.
    """
    rows: list[dict[str, object]] = []
    for key, scheme in HR_SCHEMES.items():
        missing = list(
            unavailable_requirements(
                scheme,
                hr_max=_positive_int(thresholds.hr_max.value),
                lthr=_positive_int(thresholds.lthr.value),
                resting_hr=_positive_int(thresholds.resting_hr.value),
            )
        )
        rows.append(
            {
                "key": scheme.key,
                "label": scheme.label,
                "reference": scheme.reference,
                "citation": scheme.citation,
                "available": not missing,
                "missing": missing,
            }
        )
    return rows


def _pace_zone_rows(threshold_pace: float | None) -> list[dict[str, object]]:
    """Project domain PaceZone windows into the shared ZoneResponse shape."""
    if threshold_pace is None or threshold_pace <= 0:
        return []
    names = {
        1: "Recovery",
        2: "Endurance",
        3: "Tempo",
        4: "Threshold",
        5: "VO2max",
    }
    rows: list[dict[str, object]] = []
    for zone in derive_pace_zones(threshold_pace):
        # Domain: min_pace = fastest (small s/km), max_pace = slowest.
        # Z1 has an artificial cap; surface as open-ended max_value.
        open_ended = zone.max_pace_s_km >= OPEN_ENDED_PACE_CAP_S_KM
        min_value = round(zone.min_pace_s_km) if zone.min_pace_s_km > 0 else 0
        max_value = None if open_ended else round(zone.max_pace_s_km)
        min_pct = round(zone.min_pace_s_km / threshold_pace * 100, 1)
        max_pct = (
            None if open_ended else round(zone.max_pace_s_km / threshold_pace * 100, 1)
        )
        rows.append(
            {
                "zone": zone.zone,
                "name": names.get(zone.zone, f"Z{zone.zone}"),
                "min_pct": min_pct,
                "max_pct": max_pct,
                "min_value": min_value,
                "max_value": max_value,
            }
        )
    return rows


def _validate_contiguous(overrides: list[ZoneOverride]) -> None:
    by_zone = {row.zone: row for row in overrides}
    if len(by_zone) != len(overrides):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "duplicate zones")
    if sorted(by_zone) != list(range(1, 6)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "all zones required")
    previous_max: float | None = None
    for zone in range(1, 6):
        row = by_zone[zone]
        if previous_max is not None and row.min_pct != previous_max:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "zone gap or overlap")
        previous_max = row.max_pct


def _positive_int(value: object) -> int | None:
    return int(value) if isinstance(value, int | float) and value > 0 else None


def _positive_float(value: object) -> float | None:
    return float(value) if isinstance(value, int | float) and value > 0 else None
