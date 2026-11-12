from pydantic import BaseModel, ConfigDict

MODEL_CONFIG = ConfigDict(extra="ignore", frozen=True)


class SegmentDifferencePayload(BaseModel):
    model_config = MODEL_CONFIG

    order: int
    target_order: int | None = None
    measured_order: int | None = None
    target_role: str
    measured_role: str
    role_match: bool
    overlap_s: float | None = None
    distance_delta_m: float
    duration_delta_s: float
    pace_delta_s_km: float | None = None
    hr_delta_bpm: float | None = None
    target_distance_m: float
    measured_distance_m: float
    paired: bool = True
