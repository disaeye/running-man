from __future__ import annotations

from collections.abc import Mapping

WmaTable = dict[tuple[str, str, int], float]


def entry_key(entry: object) -> tuple[tuple[str, str, int], float] | None:
    """一条 wma entry 转成 (event, sex, age) → factor。"""
    if not isinstance(entry, Mapping):
        return None
    event = entry.get("event")
    sex = entry.get("sex")
    age = entry.get("age")
    factor = entry.get("factor")
    if not isinstance(event, str) or not isinstance(sex, str):
        return None
    if isinstance(age, bool) or not isinstance(age, int):
        return None
    if isinstance(factor, bool) or not isinstance(factor, int | float):
        return None
    return (event, sex, age), float(factor)


def load_wma_factors(document: Mapping[str, object]) -> WmaTable:
    """把 grading.yaml 读成按整岁取系数的查找字典；表里没填时是空字典。"""
    section = document.get("wma")
    if not isinstance(section, Mapping):
        return {}
    entries = section.get("entries")
    if not isinstance(entries, list):
        return {}
    table: WmaTable = {}
    for entry in entries:
        parsed = entry_key(entry)
        if parsed is not None:
            table[parsed[0]] = parsed[1]
    return table


def lookup_wma_factor(table: WmaTable, event: str, sex: str, age: int) -> float | None:
    """该性别、该整岁的年龄系数；表里没有这一行返回 None，不外推。"""
    return table.get((event, sex, age))


def age_graded_pct(
    factor: float | None, open_standard_s: int | None, actual_s: int
) -> float | None:
    """年龄分级百分比 = 公开标准 / (实际成绩 × 系数) × 100。

    三样输入缺一样就返回 None：系数没入表、公开标准没有出处、成绩无效，都不该
    拿一个编出来的数字顶上。
    """
    if factor is None or open_standard_s is None:
        return None
    if factor <= 0 or open_standard_s <= 0 or actual_s <= 0:
        return None
    return round(open_standard_s / (actual_s * factor) * 100, 2)
