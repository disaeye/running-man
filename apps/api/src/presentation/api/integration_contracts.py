from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from presentation.api.json_contracts import JsonDocument


class IntegrationRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ConnectIntegrationRequest(IntegrationRequestModel):
    athlete_id: str | None = None
    api_key: str | None = None
    code: str | None = None
    client_id: str | None = None
    client_secret: str | None = None


class IntegrationSettingsUpdate(IntegrationRequestModel):
    sync_frequency: str | None = None
    auto_sync: bool | None = None
    import_wellness: bool | None = None


class IntegrationSettingsResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    sync_frequency: str | None = None
    auto_sync: bool | None = None
    import_wellness: bool | None = None
    primary_activity_source: bool | None = None


class IntegrationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    source: str
    connected: bool
    settings: IntegrationSettingsResponse = IntegrationSettingsResponse()
    last_sync_at: datetime | None = None
    last_sync_status: str | None = None
    last_sync_error: str | None = None
    last_sync_detail: JsonDocument | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    data_as_of: datetime | None = None
    staleness_bucket: str


class OAuthUrlResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    url: str


class IntegrationSyncResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    source: str
    upserted: int
    deduplicated: int
    total_processed: int
    status: str


class BackfillRequest(IntegrationRequestModel):
    """Start of the history an athlete wants imported; the window runs to today."""

    from_date: date


class SyncJobError(BaseModel):
    """One activity whose streams could not be fetched, for the retry action."""

    model_config = ConfigDict(extra="ignore", frozen=True)

    activity_id: str
    message: str


class SyncJobResponse(BaseModel):
    """One triggered sync, including the counters the progress UI polls."""

    model_config = ConfigDict(extra="ignore", frozen=True)

    id: UUID
    source: str
    kind: str
    trigger: str
    phase: str
    status: str
    window_start: date | None = None
    window_end: date | None = None
    windows_total: int = 0
    windows_done: int = 0
    activities_seen: int = 0
    activities_upserted: int = 0
    activities_deduplicated: int = 0
    streams_inserted: int = 0
    wellness_days: int = 0
    ghosts_deleted: int = 0
    errors_count: int = 0
    errors: list[SyncJobError] = []
    cancel_requested: bool = False
    error: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    heartbeat_at: datetime | None = None
    created_at: datetime


class SourceCoverageResponse(BaseModel):
    """Imported range for one source, so the UI can offer an earlier import."""

    model_config = ConfigDict(frozen=True)

    source: str
    first_activity_date: date | None = None
    last_activity_date: date | None = None
    activity_count: int = 0


class SyncRunResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    id: UUID
    source: str
    trigger: str
    window_start: date | None = None
    window_end: date | None = None
    started_at: datetime
    finished_at: datetime | None = None
    status: str
    activities_seen: int = 0
    activities_upserted: int = 0
    activities_deduplicated: int = 0
    wellness_seen: int = 0
    streams_inserted: int = 0
    errors_count: int = 0
    error_summary: str | None = None
    detail: JsonDocument | None = None
