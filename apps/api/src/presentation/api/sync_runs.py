from typing import Annotated

from fastapi import APIRouter, Depends

from infrastructure.auth.models import Athlete
from infrastructure.repositories.sync_runs import SyncRunRepo
from presentation.api.integration_contracts import SyncRunResponse
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/sync-runs", tags=["integrations"])


def get_sync_run_repo() -> SyncRunRepo:
    return SyncRunRepo()


@router.get("", response_model=list[SyncRunResponse])
async def list_sync_runs(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    repo: Annotated[SyncRunRepo, Depends(get_sync_run_repo)],
    source: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[SyncRunResponse]:
    return [
        SyncRunResponse.model_validate(row)
        for row in await repo.list(athlete.id, source=source, status=status, limit=limit)
    ]
