"""When a planned session should be scaled down, and by how much.

The plan page shows a banner when the athlete's own data says the next
session is too ambitious. The banner is a *suggestion*: the plan on the
calendar is not touched until the athlete accepts it.

Three inputs drive the suggestion, and each of them is a measured value:

* **HRV below the athlete's own baseline.** A drop in heart-rate variability
  against the athlete's own recent days is a signal that the autonomic
  system is carrying more than usual. The threshold is a drop of 10% or more
  against the athlete's seven-day mean.
* **TSB deeply negative.** A training-stress balance below -20 means fatigue
  is well past what the fitness can absorb.
* **Heart-rate drift on the long run.** The heart rate rising across a long
  session relative to its pace is the classic fatigue marker.

The amount of the reduction is derived from the same numbers, not chosen:
each trigger contributes a fixed share of the session's load, and the shares
add up to a cap. The cap matters — the point of the banner is to take the
edge off a bad week, not to cancel a training block.

The thresholds are the ones used in the readiness model
(`domain/insights/readiness.py`), so the banner and the readiness score never
tell the athlete two different stories about the same day.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

# 心率变异性相对本人七日均值的下降幅度达到这个比例就构成一个触发条件。
HRV_DROP_RATIO: Final = 0.10

# 训练压力平衡低于这个值时疲劳明显。
TSB_FLOOR: Final = -20.0

# 长距离后段心率相对前段的上升幅度（次/分）达到这个值时构成触发条件。
HR_DRIFT_BPM: Final = 8.0

# 每个触发条件削掉的比例。
HRV_SHARE: Final = 0.10
TSB_SHARE: Final = 0.15
DRIFT_SHARE: Final = 0.10

# 一次建议最多削掉的比例。削得更多就不是「调整」而是「取消」了。
MAX_REDUCTION: Final = 0.30

# 心率漂移要用长距离的前后两段来比，所以长距离至少要有这个长度（秒）。
MIN_LONG_RUN_SECONDS: Final = 3600


@dataclass(frozen=True, slots=True)
class AdjustmentTrigger:
    """One reason for the suggestion, with the numbers behind it."""

    key: str
    label: str
    detail: str


@dataclass(frozen=True, slots=True)
class LoadAdjustment:
    """A proposed change to one planned session.

    ``reduction_pct`` is the share of the session's load to remove. The
    prescription itself is not rewritten here: the caller applies the
    reduction to the session's duration and pace, so the same rule works for
    a duration-based session and a distance-based one.
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
    tsb: float | None,
    hr_drift_bpm: float | None,
    long_run_seconds: int | None,
) -> LoadAdjustment | None:
    """Propose a reduction for one session, or ``None`` when nothing applies.

    ``None`` means no banner: the athlete's data does not argue against the
    plan, and a banner that appears without a reason is noise.
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

    if tsb is not None and tsb <= TSB_FLOOR:
        triggers.append(
            AdjustmentTrigger(
                key="low_tsb",
                label="训练压力平衡偏低",
                detail=f"TSB {tsb:+.1f}，疲劳已明显超过体能积累",
            )
        )
        reduction += TSB_SHARE

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
