from pydantic import BaseModel, ConfigDict, Field

MODEL_CONFIG = ConfigDict(extra="ignore", frozen=True)


class EffortDescriptorPayload(BaseModel):
    model_config = MODEL_CONFIG

    term: str
    descriptor: str
    rpe10: str
    rpe20: str
    rir: str
    domain: str


class IntervalProtocolPayload(BaseModel):
    model_config = MODEL_CONFIG

    key: str
    work_duration_s: str
    recovery_duration_s: str
    typical_total: str
    intensity: str


class IaafNotationPayload(BaseModel):
    model_config = MODEL_CONFIG

    pattern: str
    example: str
    pace_unit: str
    distance_unit: str
    recovery_duration: str
    recovery_distance: str


class TheoryPayload(BaseModel):
    model_config = MODEL_CONFIG

    fitt_vp: list[str] = Field(default_factory=list)
    effort_descriptors: list[EffortDescriptorPayload] = Field(default_factory=list)
    physiological_domains: list[str] = Field(default_factory=list)
    fixed_percent_caveat: str = ""
    rpe_caveat: str = ""
    talk_test_caveat: str = ""
    haugen_protocols: list[IntervalProtocolPayload] = Field(default_factory=list)
    world_athletics_examples: list[str] = Field(default_factory=list)
    iaaf_notation: IaafNotationPayload | None = None
