"""目标与里程碑的接口模型。"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

GoalDirection = Literal["increase", "decrease"]
GoalTypeKey = Literal["event", "distance", "time", "weight", "consistency"]
GoalStatusKey = Literal["active", "achieved", "abandoned"]


class GoalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    type: GoalTypeKey
    title: str
    target_value: float | None = None
    current_value: float | None = None
    unit: str | None = None
    # 累计起算日；缺省时由仓库层回填创建日。
    start_date: date | None = None
    # 目标运动类别（sport_definitions 的键）；缺省时跑步。
    sport_key: str | None = None
    # 主目标标记：同一运动员同时最多一条 active 的主比赛目标。
    is_primary: bool = False
    baseline_value: float | None = None
    direction: GoalDirection | None = None
    target_date: date | None = None
    race_distance_m: float | None = Field(default=None, ge=1500, le=1_000_000)
    race_target_time_s: int | None = Field(default=None, ge=180, le=172_800)
    status: GoalStatusKey | None = None

    @model_validator(mode="after")
    def _race_fields_require_event(self) -> GoalCreate:
        has_race_data = self.race_distance_m is not None or self.race_target_time_s is not None
        if has_race_data and self.type != "event":
            raise ValueError("比赛距离与目标用时仅适用于比赛目标")
        if self.race_target_time_s is not None and self.race_distance_m is None:
            raise ValueError("设置比赛目标用时前必须填写比赛距离")
        return self

    @model_validator(mode="after")
    def _lifecycle_fields_by_type(self) -> GoalCreate:
        if self.direction == "decrease" and self.type != "weight":
            raise ValueError("向下趋近的方向仅适用于体重目标")
        if self.is_primary and self.type != "event":
            raise ValueError("只有比赛目标可以标记为主目标")
        if self.baseline_value is not None and self.type != "weight":
            raise ValueError("基线值仅适用于体重目标")
        return self


class GoalUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    type: GoalTypeKey | None = None
    title: str | None = None
    target_value: float | None = None
    current_value: float | None = None
    unit: str | None = None
    start_date: date | None = None
    sport_key: str | None = None
    is_primary: bool | None = None
    baseline_value: float | None = None
    direction: GoalDirection | None = None
    target_date: date | None = None
    race_distance_m: float | None = Field(default=None, ge=1500, le=1_000_000)
    race_target_time_s: int | None = Field(default=None, ge=180, le=172_800)
    status: GoalStatusKey | None = None

    @model_validator(mode="after")
    def _validate_race_update(self) -> GoalUpdate:
        if self.type is not None and self.type != "event":
            if self.race_distance_m is not None or self.race_target_time_s is not None:
                raise ValueError("比赛距离与目标用时仅适用于比赛目标")
        if self.race_target_time_s is not None and self.race_distance_m is None:
            raise ValueError("设置比赛目标用时前必须填写比赛距离")
        if self.race_distance_m is None and self.race_target_time_s is not None:
            raise ValueError("设置比赛目标用时前必须填写比赛距离")
        return self

    @model_validator(mode="after")
    def _lifecycle_fields_by_type(self) -> GoalUpdate:
        if self.direction == "decrease" and self.type not in (None, "weight"):
            raise ValueError("向下趋近的方向仅适用于体重目标")
        if self.is_primary and self.type not in (None, "event"):
            raise ValueError("只有比赛目标可以标记为主目标")
        if self.baseline_value is not None and self.type not in (None, "weight"):
            raise ValueError("基线值仅适用于体重目标")
        return self


class GoalResponse(BaseModel):
    goal_id: str
    athlete_id: str
    type: str
    title: str
    target_value: float | None = None
    current_value: float
    unit: str | None = None
    start_date: date | None = None
    sport_key: str | None = None
    is_primary: bool = False
    baseline_value: float | None = None
    direction: str = "increase"
    target_date: date | None = None
    race_distance_m: float | None = None
    race_target_time_s: int | None = None
    race_actual_time_s: int | None = None
    race_activity_id: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    @field_validator("goal_id", "athlete_id", mode="before")
    @classmethod
    def _uuid_as_string(cls, value: object) -> str:
        return str(value)


class MilestoneCreate(BaseModel):
    title: str
    target_date: date | None = None
    target_value: float | None = None
    unit: str | None = None
    result_text: str | None = None
    # 可选绑定：阶段结束后按阶段累计跑量自动核验。
    phase_id: UUID | None = None
    achieved: bool | None = None
    achieved_at: datetime | None = None


class MilestoneResponse(BaseModel):
    milestone_id: str
    goal_id: str
    phase_id: str | None = None
    title: str
    target_date: date | None = None
    target_value: float | None = None
    unit: str | None = None
    result_text: str | None = None
    achieved: bool
    achieved_at: datetime | None = None

    @field_validator("milestone_id", "goal_id", "phase_id", mode="before")
    @classmethod
    def _uuid_as_string(cls, value: object) -> str | None:
        return str(value) if value is not None else None
