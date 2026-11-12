"""Machine-checkable training theory behind the run classifier.

Each constant here is the auditable implementation of a claim in the source
registry. Tests pin the values so a coefficient or descriptor cannot drift
silently. The evidence payload exposes these entries through ``theory``.
"""

from __future__ import annotations

from typing import Final, TypedDict

# ACSM/ESSA 2025: FITT(VP) is the prescription framework.
FITT_VP: Final[tuple[str, ...]] = (
    "Frequency",
    "Intensity",
    "Time",
    "Type",
    "Volume",
    "Progression",
)


# ACSM/ESSA 2025 Table 2: five effort descriptors with perceptual anchors.
class EffortDescriptor(TypedDict):
    term: str
    descriptor: str
    rpe10: str
    rpe20: str
    rir: str
    domain: str


EFFORT_DESCRIPTORS: Final[tuple[EffortDescriptor, ...]] = (
    {
        "term": "very low",
        "descriptor": "very easy",
        "rpe10": "<2",
        "rpe20": "<=9",
        "rir": ">8",
        "domain": "low_unspecified",
    },
    {
        "term": "low",
        "descriptor": "easy",
        "rpe10": "2-3",
        "rpe20": "10-11",
        "rir": "7-8",
        "domain": "below_mt1",
    },
    {
        "term": "moderate",
        "descriptor": "somewhat hard",
        "rpe10": "4-5",
        "rpe20": "12-14",
        "rir": "4-6",
        "domain": "mt1_mt2",
    },
    {
        "term": "high",
        "descriptor": "hard",
        "rpe10": "6-7",
        "rpe20": "15-16",
        "rir": "2-3",
        "domain": "mt2_wmax",
    },
    {
        "term": "very high",
        "descriptor": "very hard",
        "rpe10": "8-10",
        "rpe20": ">=17",
        "rir": "<2",
        "domain": "above_wmax",
    },
)

# ACSM/ESSA 2025 declines to recommend fixed %HRmax/%VO2max/METs as intensity
# markers: 40-fold lactate spread at 70% VO2max, half of subjects above MT1 at
# 80% HRmax. The classifier therefore uses measured thresholds and domains.
FIXED_PERCENT_CAVEAT: Final[str] = (
    "固定 %HRmax/%HRR/%VO2max/MET 无法产生一致的生理反应；"
    "70% VO2max 下肌乳酸增幅可差 40 倍，80% HRmax 时约半数受试者已高于 MT1"
)
RPE_CAVEAT: Final[str] = (
    "RPE 与谈话测试只作辅助证据；第一代谢阈的 RPE6-20 个体跨度约 7-14，"
    "训练者的谈话测试可延续到中等强度区间"
)
TALK_TEST_CAVEAT: Final[str] = "谈话测试用于保守地把训练控制在 High 域以下；不能单独判定 MT1/MT2"

# ACSM/ESSA 2025 four physiological domains, bounded by MT1, MT2 and Wmax.
PHYSIOLOGICAL_DOMAINS: Final[tuple[str, ...]] = (
    "below_mt1",
    "mt1_mt2",
    "mt2_wmax",
    "above_wmax",
)


# Haugen 2021 Sports Medicine: work/rest durations and typical total volume.
class IntervalProtocol(TypedDict):
    key: str
    work_duration_s: str
    recovery_duration_s: str
    typical_total: str
    intensity: str


HAUGEN_PROTOCOLS: Final[tuple[IntervalProtocol, ...]] = (
    {
        "key": "threshold_intervals",
        "work_duration_s": "4-20 x 400-2000 m 或 5-20 min 分段",
        "recovery_duration_s": "<=60 s",
        "typical_total": "接近 vLT2 的连续或中长间歇",
        "intensity": "mt1_mt2",
    },
    {
        "key": "vo2max_intervals",
        "work_duration_s": "1-5 min",
        "recovery_duration_s": "与工作段相近或更短的活性恢复",
        "typical_total": "周跑量的 8% 或 10 km 以内",
        "intensity": "mt2_wmax",
    },
    {
        "key": "short_sprint_intervals",
        "work_duration_s": "10-15 s 或 30-60 s",
        "recovery_duration_s": "10-15 s 至 3 min",
        "typical_total": "95-105% vVO2max 或 105-130% vVO2max",
        "intensity": "above_wmax",
    },
)

# World Athletics speed-training guide: concrete session forms.
WORLD_ATHLETICS_EXAMPLES: Final[tuple[str, ...]] = (
    "3-4 × 500 m（1500 m 目标配速）[2-3 min 恢复]",
    "3 × (800 m, 200 m, 200 m)[组内 90 s / 组间 3 min]",
    "8 × 1000 m（10,000 m 目标配速）[2 min 恢复]",
    "1600/1200/800/800/1200/1600 m[2-3 min 恢复]",
)

# IAAF 1997 representation of running training.
IAAF_NOTATION: Final[dict[str, str]] = {
    "pattern": "sets × reps × distance (pace) [recovery]",
    "example": "1 组 × 6 轮 × 1.00 km（4:05/km）[2 min 恢复]",
    "pace_unit": "s/km",
    "distance_unit": "m",
    "recovery_duration": "duration_s",
    "recovery_distance": "distance_m",
}


def theory_payload() -> dict[str, object]:
    """Structured, testable theory entries carried in every evidence object."""
    return {
        "fitt_vp": list(FITT_VP),
        "effort_descriptors": [dict(item) for item in EFFORT_DESCRIPTORS],
        "physiological_domains": list(PHYSIOLOGICAL_DOMAINS),
        "fixed_percent_caveat": FIXED_PERCENT_CAVEAT,
        "rpe_caveat": RPE_CAVEAT,
        "talk_test_caveat": TALK_TEST_CAVEAT,
        "haugen_protocols": [dict(item) for item in HAUGEN_PROTOCOLS],
        "world_athletics_examples": list(WORLD_ATHLETICS_EXAMPLES),
        "iaaf_notation": dict(IAAF_NOTATION),
    }
