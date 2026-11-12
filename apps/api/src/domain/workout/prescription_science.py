from domain.run_classification.schema import DOMAIN_MAPPING, SOURCE_REFS, STIMULUS_CATALOG

WORKOUT_SPEC: dict[str, tuple[str, str, str]] = {
    "easy": ("aerobic_base", "below_mt1", "增加有氧基础以及骨骼肌肉耐受"),
    "recovery": ("recovery", "below_mt1", "维持低负荷活动并且促进恢复"),
    "long": ("aerobic_endurance", "below_mt1", "提高长时间持续跑能力"),
    "tempo": ("lactate_threshold", "mt1_mt2", "提高乳酸清除以及持续配速能力"),
    "intervals": ("vo2max", "mt2_wmax", "提高最大摄氧量以及摄氧动力学"),
}


def science_fields(workout_type: str, role: str) -> dict[str, object]:
    """Attach the target adaptation, strength domain and sources to one segment."""
    stimulus, domain, adaptation = WORKOUT_SPEC[workout_type]
    if role != "work":
        stimulus = "recovery"
        domain = "below_mt1"
        adaptation = str(STIMULUS_CATALOG["recovery"].target_adaptation)
    spec = STIMULUS_CATALOG[stimulus]
    refs = list(dict.fromkeys((*spec.source_refs, *SOURCE_REFS)))
    descriptor = DOMAIN_MAPPING[domain]["descriptor"]
    rationale = (
        f"{adaptation}；ACSM/ESSA 强度域为 {domain}，"
        f"对应 {DOMAIN_MAPPING[domain]['acsm_essa']} 与 {descriptor}。"
    )
    return {
        "intensity_domain": domain,
        "source_refs": refs,
        "rationale": rationale,
        "target_adaptation": adaptation,
        "quality_target": {
            "work_distance_m": 0.0,
            "work_duration_s": 0.0,
            "time_in_domain_s": 0.0 if role != "work" else None,
            "target_repetitions": 1,
        },
    }
