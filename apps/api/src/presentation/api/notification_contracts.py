from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class NotificationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    id: UUID
    athlete_id: UUID
    type: str
    title: str
    body: str | None = None
    severity: str = "info"
    read: bool = False
    created_at: datetime


class NotificationReadResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    ok: bool


class NotificationReadAllResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    updated: int


class NotificationScanResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    athletes_scanned: int
    notifications_generated: int
