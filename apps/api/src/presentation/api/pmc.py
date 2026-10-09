from datetime import date
from typing import cast

from fastapi import APIRouter, Depends, Query

from domain.load.pmc import CTL_WARMUP_DAYS, build_pmc_series
from infrastructure.auth.models import Athlete
from infrastructure.repositories.pmc import PmcRepo
from presentation.api.analytics_performance_contracts import PmcPointResponse
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/pmc", tags=["pmc"])


def get_pmc_repo() -> PmcRepo:
    return PmcRepo()


@router.get("", response_model=list[PmcPointResponse])
async def get_pmc(
    start: date = Query(alias="from"),
    end: date = Query(alias="to"),
    sport: str | None = Query(
        default=None,
        description="Analytical sport-filter approximation; all-sports PMC uses stored facts.",
    ),
    athlete: Athlete = Depends(get_current_athlete),
    repo: PmcRepo = Depends(get_pmc_repo),
) -> list[PmcPointResponse]:
    if sport is None:
        rows = await repo.get_daily_load_range(athlete.id, start, end)
        # The stored series does not carry the warm-up flag, so derive it from
        # how much history exists before each day. Without it the client cannot
        # tell a converging CTL from a measured one.
        first_day = _earliest_load_day(rows)
        return [
            PmcPointResponse.model_validate(
                point
                | {
                    "mode": "authoritative_all_sports",
                    "ctl_warming_up": _is_warming_up(first_day, cast(date, point["day"])),
                }
            )
            for point in rows
        ]
    daily_tss = await repo.get_filtered_daily_tss(athlete.id, start, end, sport)
    return [
        PmcPointResponse.model_validate(
            cast(dict[str, object], point) | {"mode": "approximate_sport_filtered"}
        )
        for point in build_pmc_series(daily_tss)
        if start <= cast(date, point["day"]) <= end
    ]


def _earliest_load_day(rows: list[dict[str, object]]) -> date | None:
    days = [cast(date, row["day"]) for row in rows if isinstance(row.get("day"), date)]
    return min(days) if days else None


def _is_warming_up(first_day: date | None, day: date) -> bool:
    """Whether CTL on ``day`` is still converging from its zero seed.

    Counts from the first day present in the *requested range*, so a window that
    starts after the warm-up has elapsed reports no warming. A caller wanting a
    precise answer should ask for the full history.
    """
    if first_day is None:
        return True
    return (day - first_day).days + 1 < CTL_WARMUP_DAYS
