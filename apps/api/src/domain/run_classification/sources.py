from typing import Final, TypedDict

SOURCE_REFS: Final[tuple[str, ...]] = (
    "ACSM-ESSA-2025-intensity-terminology",
    "World-Athletics-2022-speed-training",
    "World-Athletics-2021-aerobic-fitness",
    "IAAF-1997-running-training-notation",
    "Intervals.icu-intervals-api",
    "Haugen-2021-middle-distance-training",
    "Daniels-VDOT",
)


class SourceDetail(TypedDict):
    key: str
    title: str
    url: str
    doi: str


SOURCE_DETAILS: Final[dict[str, SourceDetail]] = {
    "ACSM-ESSA-2025-intensity-terminology": {
        "key": "ACSM-ESSA-2025-intensity-terminology",
        "title": "Physical Activity and Exercise Intensity Terminology",
        "doi": "10.1249/mss.0000000000003795",
        "url": "https://www.jsams.org/article/S1440-2440(24)00559-0/fulltext",
    },
    "World-Athletics-2022-speed-training": {
        "key": "World-Athletics-2022-speed-training",
        "title": "The benefits and limits of speed training for endurance runners",
        "doi": "",
        "url": (
            "https://worldathletics.org/personal-best/performance/"
            "speed-training-endurance-runners-benefits-limits"
        ),
    },
    "World-Athletics-2021-aerobic-fitness": {
        "key": "World-Athletics-2021-aerobic-fitness",
        "title": "How to build aerobic fitness",
        "doi": "",
        "url": (
            "https://worldathletics.org/personal-best/performance/"
            "how-build-aerobic-fitness-tips-advice-running"
        ),
    },
    "IAAF-1997-running-training-notation": {
        "key": "IAAF-1997-running-training-notation",
        "title": "Representation of Running Training",
        "doi": "",
        "url": (
            "https://www.chaser.me.uk/wordpress/coaching/2018/01/04/running-interval-notation/"
        ),
    },
    "Intervals.icu-intervals-api": {
        "key": "Intervals.icu-intervals-api",
        "title": "Fetch precise activity intervals with intervals=true",
        "doi": "",
        "url": (
            "https://forum.intervals.icu/t/"
            "solved-how-to-fetch-lap-interval-data-via-api-similar-to-csv-export/126341"
        ),
    },
    "Haugen-2021-middle-distance-training": {
        "key": "Haugen-2021-middle-distance-training",
        "title": "Crossing the Golden Training Divide",
        "doi": "10.1007/s40279-021-01481-2",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC8363530/",
    },
    "Daniels-VDOT": {
        "key": "Daniels-VDOT",
        "title": "Daniels' Running Formula",
        "doi": "",
        "url": "https://vdoto2.com/",
    },
}

DOMAIN_MAPPING: Final[dict[str, dict[str, str]]] = {
    "below_mt1": {"acsm_essa": "low", "descriptor": "easy"},
    "mt1_mt2": {"acsm_essa": "moderate", "descriptor": "somewhat hard"},
    "mt2_wmax": {"acsm_essa": "high", "descriptor": "hard"},
    "above_wmax": {"acsm_essa": "very high", "descriptor": "very hard"},
    "low_unspecified": {
        "acsm_essa": "very low or low",
        "descriptor": "very easy or easy",
    },
}

DOMAIN_NAMES: Final[tuple[str, ...]] = (
    "below_mt1",
    "mt1_mt2",
    "mt2_wmax",
    "above_wmax",
    "low_unspecified",
)

QUALITY_KEYS: Final[tuple[str, ...]] = (
    "repetition_match",
    "work_distance_match",
    "work_duration_match",
    "pace_attainment",
    "hr_attainment",
    "rpe_match",
    "structure_match",
    "domain_residence_s",
    "work_domain_residence_s",
    "work_pace_cv",
    "fade_pct",
    "recovery_ratio",
    "distance_consistency",
    "tss",
    "trimp",
    "aerobic_decoupling_pct",
    "low_domain_share",
    "time_in_domain_s",
    "peak_speed_attainment",
    "stride_consistency",
    "monotonicity",
    "speed_increase_pct",
    "last_domain_match",
    "unpaired_segment_count",
    "confidence",
    "evidence_grade",
)
