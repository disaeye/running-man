from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict


class StrengthAnalyticsModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class MuscleVolumeResponse(StrengthAnalyticsModel):
    muscle_group: str
    volume_kg: float


class E1rmTrendResponse(StrengthAnalyticsModel):
    exercise_id: int
    name_cn: str
    max_estimated_1rm_kg: float
    date: date


class MuscleDistributionResponse(StrengthAnalyticsModel):
    category: str
    set_count: int
    volume_kg: float
