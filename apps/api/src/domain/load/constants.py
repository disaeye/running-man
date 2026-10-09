from collections.abc import Mapping
from types import MappingProxyType
from typing import Final

NP_WINDOW_SIZE: Final = 30
CTL_DECAY_DAYS: Final = 42
ATL_DECAY_DAYS: Final = 7
SECONDS_PER_HOUR: Final = 3600
FTP_REFERENCE_TSS: Final = 100.0

# ACWR (EWMA-based acute:chronic workload ratio)
ACUTE_WINDOW_DAYS: Final = 7
CHRONIC_WINDOW_DAYS: Final = 28
ACWR_HIGH_RISK_THRESHOLD: Final = 1.5

# Aerobic decoupling
MIN_DURATION_SECONDS: Final = 1200  # 20 min minimum steady-state window
MAX_VIABILITY_INDEX: Final = 1.05  # VI threshold for "steady" effort

HR_TSS_PER_HOUR_BY_ZONE: Final[Mapping[int, float]] = MappingProxyType(
    {
        1: 30.0,
        2: 60.0,
        3: 80.0,
        4: 100.0,
        5: 110.0,
        6: 120.0,
        7: 135.0,
    }
)

READINESS_WEIGHT_SLEEP: Final = 0.25
READINESS_WEIGHT_RHR: Final = 0.20
READINESS_WEIGHT_TSB: Final = 0.25
READINESS_WEIGHT_ATL_VELOCITY: Final = 0.15
READINESS_WEIGHT_HRV: Final = 0.15

