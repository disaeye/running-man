from __future__ import annotations

from datetime import date
from typing import Final, cast

from domain.thresholds import age_from_dob

# 八档年龄组的 min_age：34 岁以下、35-39、40-44、45-49、50-54、55-59、60-64、65 岁以上。
# 每档的上界由下一档的 min_age 减一给出，所以这里只存下界。
AGE_GROUP_MIN_AGES: Final[tuple[int, ...]] = (0, 35, 40, 45, 50, 55, 60, 65)


def age_on(dob: date, on_date: date) -> int:
    """比赛当天的周岁：生日还没过就减一。

    周岁算法与 domain.thresholds 共用一处，免得两边的闰年和生日边界各算各的。
    """
    return cast(int, age_from_dob(dob, on_date))


def age_group_for(age: int) -> int | None:
    """年龄落在哪一档，返回那一档的 min_age；不在任何档内返回 None。"""
    if age < 0:
        return None
    for min_age in reversed(AGE_GROUP_MIN_AGES):
        if age >= min_age:
            return min_age
    return None
