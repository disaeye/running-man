"""When a planned session should be scaled down, and by how much.

The plan page shows a banner when the athlete's own data says the next
session is too ambitious. The banner is a *suggestion*: the plan on the
calendar is not touched until the athlete accepts it.

Two measured values can trigger the suggestion:

* **HRV below the athlete's own baseline.** A drop of 10% or more against
  the athlete's seven-day mean is one reason to review the next session.

* **Heart-rate drift on a long run.** A rise across a long session is one
  reason to review the next session.

Each measured trigger contributes to the proposed reduction. The suggestion
remains pending until the athlete reviews it.

"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

# 心率变异性相对本人七日均值的下降幅度达到这个比例就构成一个触发条件。
HRV_DROP_RATIO: Final = 0.10

# 长距离后段心率相对前段的上升幅度（次/分）达到这个值时构成触发条件。
HR_DRIFT_BPM: Final = 8.0

# 每个触发条件对应的建议调整比例。
HRV_SHARE: Final = 0.10
DRIFT_SHARE: Final = 0.10

# 一次建议最多削掉的比例。削得更多就不是「调整」而是「取消」了。
MAX_REDUCTION: Final = 0.30

# 心率漂移要用长距离的前后两段来比，所以长距离至少要有这个长度（秒）。
MIN_LONG_RUN_SECONDS: Final = 3600


@dataclass(frozen=True, slots=True)
class AdjustmentTrigger:
    """One measured reason for the proposed session adjustment."""

    key: str
    label: str
    detail: str


@dataclass(frozen=True, slots=True)
class LoadAdjustment:
    """A proposed change to one planned session.

    ``reduction_pct`` scales the session's time and distance targets. The
    prescription is not changed until the athlete accepts the proposal.
    """

    event_id: str
    reduction_pct: float
    triggers: tuple[AdjustmentTrigger, ...]

    @property
    def has_triggers(self) -> bool:
        return len(self.triggers) > 0


def detect_adjustment(
    *,
    event_id: str,
    hrv_today: float | None,
    hrv_baseline: float | None,
    hr_drift_bpm: float | None,
    long_run_seconds: int | None,
) -> LoadAdjustment | None:
    """Propose a session adjustment, or ``None`` when no trigger applies.

    Missing measurements do not count as a trigger.
    """
    triggers: list[AdjustmentTrigger] = []
    reduction = 0.0

    if (
        hrv_today is not None
        and hrv_baseline is not None
        and hrv_baseline > 0
        and hrv_today <= hrv_baseline * (1 - HRV_DROP_RATIO)
    ):
        drop = (hrv_baseline - hrv_today) / hrv_baseline * 100
        triggers.append(
            AdjustmentTrigger(
                key="hrv_drop",
                label="心率变异性下降",
                detail=(
                    f"HRV {hrv_today:.0f} ms，较本人七日均值 {hrv_baseline:.0f} ms 低 {drop:.0f}%"
                ),
            )
        )
        reduction += HRV_SHARE

    if (
        hr_drift_bpm is not None
        and hr_drift_bpm >= HR_DRIFT_BPM
        and long_run_seconds is not None
        and long_run_seconds >= MIN_LONG_RUN_SECONDS
    ):
        triggers.append(
            AdjustmentTrigger(
                key="hr_drift",
                label="长距离心率漂移",
                detail=f"长距离后段心率比前段高 {hr_drift_bpm:.0f} 次/分",
            )
        )
        reduction += DRIFT_SHARE

    if not triggers:
        return None

    capped = min(reduction, MAX_REDUCTION)
    return LoadAdjustment(
        event_id=event_id,
        reduction_pct=round(capped * 100, 1),
        triggers=tuple(triggers),
    )
