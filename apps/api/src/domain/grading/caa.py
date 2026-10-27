from __future__ import annotations

from collections.abc import Mapping
from typing import Final

from domain.grading.age_group import age_group_for

# 从最严到最宽：命中前面那档就停手，所以顺序就是档位的严格程度。
TIER_ORDER: Final[tuple[str, ...]] = ("elite", "tier1", "tier2")

CaaTable = dict[tuple[str, str, int, str], int]


def entry_key(entry: object) -> tuple[tuple[str, str, int, str], int] | None:
    """一条 caa entry 转成 (event, sex, min_age, tier) → max_time_s。"""
    if not isinstance(entry, Mapping):
        return None
    event = entry.get("event")
    sex = entry.get("sex")
    tier = entry.get("tier")
    min_age = entry.get("min_age")
    max_time_s = entry.get("max_time_s")
    if isinstance(min_age, bool) or not isinstance(min_age, int):
        return None
    if isinstance(max_time_s, bool) or not isinstance(max_time_s, int):
        return None
    if not isinstance(event, str) or not isinstance(sex, str) or not isinstance(tier, str):
        return None
    return (event, sex, min_age, tier), max_time_s


def load_caa_tiers(document: Mapping[str, object]) -> CaaTable:
    """把 grading.yaml 读成查找字典；表里没填数字时是空字典。"""
    section = document.get("caa")
    if not isinstance(section, Mapping):
        return {}
    entries = section.get("entries")
    if not isinstance(entries, list):
        return {}
    table: CaaTable = {}
    for entry in entries:
        parsed = entry_key(entry)
        if parsed is not None:
            table[parsed[0]] = parsed[1]
    return table


def lookup_caa_tier(table: CaaTable, event: str, sex: str, age: int, time_s: int) -> str | None:
    """达标的最严档位名；一档都不达标返回 None。

    用时严格小于 max_time_s 才算达标，等于门槛不算。
    """
    min_age = age_group_for(age)
    if min_age is None:
        return None
    for tier in TIER_ORDER:
        limit = table.get((event, sex, min_age, tier))
        if limit is not None and time_s < limit:
            return tier
    return None


def has_caa_thresholds(table: CaaTable, event: str, sex: str, age: int) -> bool:
    """这一档有没有录入门槛值——用来区分「未达标」和「表还没填」。"""
    min_age = age_group_for(age)
    if min_age is None:
        return False
    return any(key[0] == event and key[1] == sex and key[2] == min_age for key in table)
