from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date

from domain.grading.age_group import AGE_GROUP_MIN_AGES, age_group_for, age_on
from domain.grading.caa import has_caa_thresholds, load_caa_tiers, lookup_caa_tier
from domain.grading.wma import age_graded_pct, load_wma_factors, lookup_wma_factor

__all__ = [
    "AGE_GROUP_MIN_AGES",
    "Grade",
    "age_group_for",
    "age_on",
    "compute_grade",
]


@dataclass(frozen=True, slots=True)
class Grade:
    tier: str | None = None
    age_group: int | None = None
    age_graded_pct: float | None = None
    thresholds_known: bool = False


def compute_grade(
    *,
    document: Mapping[str, object],
    dob: date | None,
    sex: str | None,
    event: str,
    time_s: int,
    race_date: date,
    open_standard_s: int | None = None,
) -> Grade:
    """年龄组、田协档位、WMA 系数算成一次评级。

    年龄按比赛当天的周岁取。缺 dob 或 sex 就没有年龄组，返回全 None 的 Grade；
    门槛表那一档没填时 tier 是 None 且 thresholds_known 为 False，调用方据此
    区分「未达标」和「表还没填」。
    """
    if dob is None or not sex:
        return Grade()
    age = age_on(dob, race_date)
    group = age_group_for(age)
    if group is None:
        return Grade()
    caa = load_caa_tiers(document)
    factor = lookup_wma_factor(load_wma_factors(document), event, sex, age)
    return Grade(
        tier=lookup_caa_tier(caa, event, sex, age, time_s),
        age_group=group,
        age_graded_pct=age_graded_pct(factor, open_standard_s, time_s),
        thresholds_known=has_caa_thresholds(caa, event, sex, age),
    )
