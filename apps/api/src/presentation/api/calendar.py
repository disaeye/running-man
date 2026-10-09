from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from infrastructure.auth.models import Athlete
from infrastructure.repositories.calendar import CalendarRepo
from presentation.api.schemas import CalendarEvent
from presentation.api.schemas_core import CalendarEventCreate, CalendarEventUpdate
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/calendar", tags=["calendar"])


def get_calendar_repo() -> CalendarRepo:
    return CalendarRepo()


@router.get("", response_model=list[CalendarEvent])
async def list_events(
    start: datetime = Query(alias="from"),
    end: datetime = Query(alias="to"),
    athlete: Athlete = Depends(get_current_athlete),
    repo: CalendarRepo = Depends(get_calendar_repo),
) -> list[CalendarEvent]:
    return [CalendarEvent.model_validate(row) for row in await repo.list(athlete.id, start, end)]


@router.post("", response_model=CalendarEvent, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: CalendarEventCreate,
    athlete: Athlete = Depends(get_current_athlete),
    repo: CalendarRepo = Depends(get_calendar_repo),
) -> CalendarEvent:
    return CalendarEvent.model_validate(await repo.create(athlete.id, payload.model_dump()))


@router.put("/{event_id}", response_model=CalendarEvent)
async def update_event(
    event_id: str,
    payload: CalendarEventUpdate,
    athlete: Athlete = Depends(get_current_athlete),
    repo: CalendarRepo = Depends(get_calendar_repo),
) -> CalendarEvent:
    row = await repo.update(athlete.id, event_id, payload.model_dump(exclude_unset=True))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="event not found")
    return CalendarEvent.model_validate(row)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: str,
    athlete: Athlete = Depends(get_current_athlete),
    repo: CalendarRepo = Depends(get_calendar_repo),
) -> Response:
    if not await repo.delete(athlete.id, event_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="event not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
