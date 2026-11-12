from pydantic import BaseModel, ConfigDict

RESPONSE_CONFIG = ConfigDict(extra="forbid", frozen=True)


class PhysiologicalDomains(BaseModel):
    """Work seconds or share in the four ACSM/ESSA intensity domains."""

    model_config = RESPONSE_CONFIG

    below_mt1: float = 0.0
    mt1_mt2: float = 0.0
    mt2_wmax: float = 0.0
    above_wmax: float = 0.0
    low_unspecified: float = 0.0

    @classmethod
    def from_mapping(cls, values: object) -> "PhysiologicalDomains":
        if not isinstance(values, dict):
            return cls()
        return cls(
            below_mt1=_float(values.get("below_mt1")),
            mt1_mt2=_float(values.get("mt1_mt2")),
            mt2_wmax=_float(values.get("mt2_wmax")),
            above_wmax=_float(values.get("above_wmax")),
            low_unspecified=_float(values.get("low_unspecified")),
        )


class QualityMatchesResponse(BaseModel):
    """Shared per-session type, structure and domain agreement."""

    model_config = RESPONSE_CONFIG

    type_match: float | None = None
    structure_match: float | None = None
    domain_match: float | None = None


def _float(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return 0.0
    return float(value)
