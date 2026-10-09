from datetime import date
from uuid import UUID

from infrastructure.repositories.pmc import PmcRepo


async def all_sports_pmc_loads(athlete_id: UUID, start: date, end: date) -> list[dict[str, object]]:
    return await PmcRepo().get_daily_load_range(athlete_id, start, end)


async def all_sports_tss_sum(athlete_id: UUID, start: date, end: date) -> float:
    return await PmcRepo().total_tss(athlete_id, start, end)


async def count_all_sports_pmc_days(athlete_id: UUID) -> int:
    return await PmcRepo().count_days(athlete_id)
