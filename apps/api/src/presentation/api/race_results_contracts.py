from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# 等级评定只认这四个项目，和 contracts/v1/grading.yaml 的 events 一致。
DistanceCategory = Literal["5k", "10k", "half", "marathon"]


class RaceResultCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_name: str = Field(min_length=1)
    distance_category: DistanceCategory
    time_s: int = Field(gt=0)
    race_date: date
    a1_certified: bool = False
    activity_id: str | None = None


class RaceResultResponse(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    id: UUID
    athlete_id: UUID
    event_name: str
    distance_category: DistanceCategory
    time_s: int
    race_date: date
    a1_certified: bool
    activity_id: str | None = None
    created_at: datetime
