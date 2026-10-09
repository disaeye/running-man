from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict

from presentation.api.json_contracts import JsonDocument


class AccountDeleteResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    deleted: Literal[True] = True


class AccountExportResourceName(StrEnum):
    ACTIVITIES = "activities"
    ACTIVITY_LAPS = "activity_laps"
    CALENDAR_EVENTS = "calendar_events"
    DERIVED_METRICS = "derived_metrics"
    FTP_HISTORY = "ftp_history"
    GEAR = "gear"
    GOALS = "goals"
    HEALTH = "health"
    INTEGRATIONS = "integrations"
    NOTIFICATIONS = "notifications"
    SHARES = "shares"
    STRENGTH = "strength"
    SYNC_RUNS = "sync_runs"


class AccountExportResourceManifest(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: AccountExportResourceName
    count: int


class AccountExportManifestResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    format: Literal["json"] = "json"
    generated_at: datetime
    download_url: str
    resources: list[AccountExportResourceManifest]


class AccountExportResource(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: AccountExportResourceName
    records: list[JsonDocument]


class AccountExportDocument(BaseModel):
    model_config = ConfigDict(frozen=True)

    format: Literal["running-man-account-export/v1"] = "running-man-account-export/v1"
    exported_at: datetime
    athlete: JsonDocument
    resources: list[AccountExportResource]
