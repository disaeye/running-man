from dataclasses import dataclass
from typing import Final, Literal

from domain.algorithms import algorithm_contract
from domain.generated.algorithms import Algorithm
from domain.run_classification.sources import (
    DOMAIN_MAPPING,
    DOMAIN_NAMES,
    QUALITY_KEYS,
    SOURCE_DETAILS,
    SOURCE_REFS,
    SourceDetail,
)

SCHEMA_VERSION: Final = "1.0.0"
ALGORITHM_VERSION: Final = algorithm_contract(Algorithm.RUN_CLASSIFICATION).version

SegmentRole = Literal["warmup", "work", "recovery", "cooldown", "transition"]
SessionStructure = Literal[
    "continuous",
    "interval",
    "progression",
    "fartlek",
    "complex",
    "unclear",
]
SessionType = Literal[
    "continuous",
    "interval",
    "interval_unspecified",
    "repetition",
    "progression",
    "fartlek",
    "complex",
    "unclear",
]
PrimaryStimulus = Literal[
    "aerobic_base",
    "aerobic_endurance",
    "lactate_threshold",
    "vo2max",
    "speed_economy",
    "neuromuscular",
    "pacing_skill",
    "race_specific",
    "recovery",
    "unclear",
]
IntensityDomain = Literal["below_mt1", "mt1_mt2", "mt2_wmax", "above_wmax"]
PacingPattern = Literal[
    "steady",
    "progressive",
    "negative_split",
    "variable",
    "intermittent",
    "mixed",
    "unclear",
]
EvidenceGrade = Literal["A", "B", "C", "D"]


@dataclass(frozen=True, slots=True)
class StimulusSpec:
    label: str
    target_adaptation: str
    target_domain: str
    source_refs: tuple[str, ...]
    quality_metrics: tuple[str, ...]


STIMULUS_CATALOG: Final[dict[str, StimulusSpec]] = {
    "aerobic_base": StimulusSpec(
        "有氧基础",
        "增加有氧基础以及骨骼肌肉耐受",
        "below_mt1",
        (
            "ACSM-ESSA-2025-intensity-terminology",
            "World-Athletics-2021-aerobic-fitness",
        ),
        ("low_domain_share", "work_duration_match", "domain_residence_s"),
    ),
    "aerobic_endurance": StimulusSpec(
        "有氧耐力",
        "提高长时间持续跑能力",
        "below_mt1",
        (
            "World-Athletics-2021-aerobic-fitness",
            "Haugen-2021-middle-distance-training",
        ),
        ("work_duration_match", "work_distance_match", "aerobic_decoupling_pct"),
    ),
    "lactate_threshold": StimulusSpec(
        "乳酸阈值",
        "提高乳酸清除以及持续配速能力",
        "mt1_mt2",
        (
            "ACSM-ESSA-2025-intensity-terminology",
            "Haugen-2021-middle-distance-training",
            "Daniels-VDOT",
        ),
        ("pace_attainment", "work_duration_match", "work_distance_match"),
    ),
    "vo2max": StimulusSpec(
        "VO₂max",
        "提高最大摄氧量以及摄氧动力学",
        "mt2_wmax",
        (
            "ACSM-ESSA-2025-intensity-terminology",
            "Haugen-2021-middle-distance-training",
            "Daniels-VDOT",
        ),
        ("time_in_domain_s", "work_pace_cv", "fade_pct", "recovery_ratio"),
    ),
    "speed_economy": StimulusSpec(
        "跑步经济",
        "提高跑步经济以及动作协调",
        "above_wmax",
        ("World-Athletics-2022-speed-training", "Daniels-VDOT"),
        ("peak_speed_attainment", "stride_consistency", "recovery_ratio"),
    ),
    "neuromuscular": StimulusSpec(
        "神经肌肉",
        "提高短时爆发以及快肌募集",
        "above_wmax",
        (
            "World-Athletics-2022-speed-training",
            "Haugen-2021-middle-distance-training",
        ),
        ("peak_speed_attainment", "repetition_match", "fade_pct"),
    ),
    "pacing_skill": StimulusSpec(
        "配速控制",
        "提高分段配速控制以及疲劳下的动作稳定",
        "mt1_mt2",
        (
            "IAAF-1997-running-training-notation",
            "World-Athletics-2022-speed-training",
        ),
        ("monotonicity", "speed_increase_pct", "last_domain_match"),
    ),
    "race_specific": StimulusSpec(
        "比赛专项",
        "适应目标比赛配速以及比赛节奏",
        "mt2_wmax",
        ("World-Athletics-2022-speed-training", "Daniels-VDOT"),
        ("pace_attainment", "work_distance_match", "fade_pct"),
    ),
    "recovery": StimulusSpec(
        "恢复",
        "维持低负荷活动并且促进恢复",
        "below_mt1",
        (
            "ACSM-ESSA-2025-intensity-terminology",
            "World-Athletics-2021-aerobic-fitness",
        ),
        ("low_domain_share", "work_duration_match", "hr_attainment"),
    ),
    "unclear": StimulusSpec(
        "刺激待确认",
        "证据不足以判定训练目标",
        "low_unspecified",
        ("ACSM-ESSA-2025-intensity-terminology",),
        ("confidence", "evidence_grade"),
    ),
}

STRUCTURE_LABEL: Final[dict[str, str]] = {
    "continuous": "连续跑",
    "interval": "间歇跑",
    "progression": "渐加速跑",
    "fartlek": "变速跑",
    "complex": "复杂课",
    "unclear": "结构待确认",
}

SESSION_TYPE_LABEL: Final[dict[str, str]] = {
    "continuous": "连续跑",
    "interval": "间歇跑",
    "interval_unspecified": "轮数待确认",
    "repetition": "重复跑",
    "progression": "渐加速跑",
    "fartlek": "变速跑",
    "complex": "复杂课",
    "unclear": "结构待确认",
}

PACING_PATTERN_LABEL: Final[dict[str, str]] = {
    "steady": "稳态",
    "progressive": "渐加速",
    "negative_split": "后段加速",
    "variable": "变速",
    "intermittent": "间歇",
    "mixed": "混合",
    "unclear": "配速模式待确认",
}

MODIFIER_LABEL: Final[dict[str, str]] = {
    "long": "长距离",
    "progression": "渐加速",
    "fast_finish": "后段加速",
    "negative_split": "后段加速",
    "hill": "坡跑",
    "treadmill": "室内",
    "race": "比赛",
    "linked_plan": "关联计划",
}

__all__ = [
    "ALGORITHM_VERSION",
    "DOMAIN_MAPPING",
    "DOMAIN_NAMES",
    "MODIFIER_LABEL",
    "PACING_PATTERN_LABEL",
    "QUALITY_KEYS",
    "SCHEMA_VERSION",
    "SESSION_TYPE_LABEL",
    "SOURCE_DETAILS",
    "SOURCE_REFS",
    "STIMULUS_CATALOG",
    "STRUCTURE_LABEL",
    "EvidenceGrade",
    "IntensityDomain",
    "PacingPattern",
    "PrimaryStimulus",
    "SegmentRole",
    "SessionStructure",
    "SessionType",
    "SourceDetail",
    "StimulusSpec",
]
