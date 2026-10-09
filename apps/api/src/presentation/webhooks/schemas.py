from typing import Literal

from pydantic import BaseModel, Field

WebhookEventType = Literal[
    "ACTIVITY_UPLOADED",
    "ACTIVITY_ANALYZED",
    "CALENDAR_UPDATED",
    "SPORT_SETTINGS_UPDATED",
]


class CalendarEvent(BaseModel):
    id: str
    oauth_client_id: str | None = None
    start_time: str | None = None
    category: str = "workout"
    sport_type: str | None = None
    name: str | None = None
    workout_xml: str | None = None
    predicted_tss: float | None = None
    status: str = "planned"


class DeletedEvent(BaseModel):
    id: str
    oauth_client_id: str | None = None


class WebhookPayload(BaseModel):
    secret: str
    type: WebhookEventType
    timestamp: str
    athlete_id: str | None = None
    activity_id: str | None = None
    oauth_client_id: str | None = None
    tss: float | None = None
    np: float | None = None
    icu_ctl: float | None = None
    events: list[CalendarEvent] = Field(default_factory=list)
    deleted_events: list[DeletedEvent] = Field(default_factory=list)
    data: dict[str, object] = Field(default_factory=dict)


class WebhookAckResponse(BaseModel):
    status: Literal["ok"] = "ok"


def event_key(payload: WebhookPayload) -> str:
    return "|".join(
        [payload.athlete_id or "", payload.type, payload.timestamp, payload.activity_id or ""]
    )
