from datetime import datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from application.run_classification.link import link_plan_to_activity
from domain.time import resolve_zone
from infrastructure.auth.models import Athlete
from infrastructure.repositories.calendar import CalendarRepo
from presentation.api.schemas import CalendarEvent
from presentation.api.schemas_core import CalendarEventCreate, CalendarEventUpdate
from presentation.auth.deps import get_current_athlete

router = APIRouter(prefix="/calendar", tags=["calendar"])


def get_calendar_repo() -> CalendarRepo:
    return CalendarRepo()


def _localize_range(
    start: datetime, end: datetime, timezone: str | None
) -> tuple[datetime, datetime]:
    zone = resolve_zone(timezone)
    local_start = start.replace(tzinfo=zone) if start.tzinfo is None else start
    if end.tzinfo is None:
        end_time = time.max if end.time() == time.min else end.time()
        local_end = datetime.combine(end.date(), end_time, tzinfo=zone)
    else:
        local_end = end
    return local_start, local_end


@router.get("", response_model=list[CalendarEvent])
async def list_events(
    start: datetime = Query(alias="from"),
    end: datetime = Query(alias="to"),
    athlete: Athlete = Depends(get_current_athlete),
    repo: CalendarRepo = Depends(get_calendar_repo),
) -> list[CalendarEvent]:
    local_start, local_end = _localize_range(start, end, athlete.timezone)
    return [
        CalendarEvent.model_validate(row)
        for row in await repo.list(athlete.id, local_start, local_end)
    ]


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


@router.post("/{event_id}/link", response_model=CalendarEvent)
async def link_event(
    event_id: str,
    activity_id: str = Query(alias="activity_id"),
    athlete: Athlete = Depends(get_current_athlete),
    repo: CalendarRepo = Depends(get_calendar_repo),
) -> CalendarEvent:
    linked = await link_plan_to_activity(athlete.id, event_id, activity_id)
    if not linked:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="event not found")
    row = await repo.get_by_id(athlete.id, event_id)
    assert row is not None
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
