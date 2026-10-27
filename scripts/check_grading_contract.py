from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Final, cast

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
CONTRACT: Final = REPO_ROOT / "contracts" / "v1" / "grading.yaml"

# 仓库根目录的 python3 没装 PyYAML，门槛表的解析借 apps/api 的虚拟环境；
# 和 prune_empty_accounts.py 一个做法，免得调用方还得记着用哪个解释器。
_API_SITE_PACKAGES: Final = sorted(
    (REPO_ROOT / "apps" / "api" / ".venv" / "lib").glob("python*/site-packages")
)
for _path in _API_SITE_PACKAGES:
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

import yaml  # noqa: E402

EVENTS: Final = ("5k", "10k", "half", "marathon")
TIERS: Final = ("elite", "tier1", "tier2")
SEXES: Final = ("male", "female")
AGE_GROUP_COUNT: Final = 8
TOP_LEVEL: Final = ("source", "status", "caa", "wma")


@dataclass(frozen=True, slots=True)
class Finding:
    key: str
    detail: str


def positive_int(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return value


def enum_list(
    raw: object, allowed: tuple[str, ...], key: str, findings: list[Finding]
) -> tuple[str, ...]:
    if not isinstance(raw, list):
        findings.append(Finding(key, f"必须是列表，元素取自 {list(allowed)}"))
        return ()
    accepted: list[str] = []
    for index, value in enumerate(raw):
        if not isinstance(value, str) or value not in allowed:
            findings.append(
                Finding(f"{key}[{index}]", f"必须是 {list(allowed)} 之一，现在是 {value!r}")
            )
            continue
        if value in accepted:
            findings.append(Finding(f"{key}[{index}]", f"{value} 重复"))
            continue
        accepted.append(value)
    return tuple(accepted)


def age_groups(raw: object, findings: list[Finding]) -> list[tuple[int, int | None]]:
    """八档年龄组：返回 (min_age, max_age)，并检查连续且不重叠。"""
    if not isinstance(raw, list):
        findings.append(Finding("caa.age_groups", "必须是列表"))
        return []
    if len(raw) != AGE_GROUP_COUNT:
        findings.append(
            Finding("caa.age_groups", f"必须正好 {AGE_GROUP_COUNT} 档，现在是 {len(raw)}")
        )
    groups: list[tuple[int, int | None]] = []
    for index, group in enumerate(raw):
        key = f"caa.age_groups[{index}]"
        if not isinstance(group, dict):
            findings.append(Finding(key, "必须是 mapping，写 min_age 与 max_age"))
            continue
        min_age = group.get("min_age")
        max_age = group.get("max_age")
        if isinstance(min_age, bool) or not isinstance(min_age, int):
            findings.append(Finding(f"{key}.min_age", "必须是整数"))
            continue
        if max_age is not None and (isinstance(max_age, bool) or not isinstance(max_age, int)):
            findings.append(Finding(f"{key}.max_age", "必须是整数，或 65 岁以上那档的 null"))
            continue
        if max_age is not None and max_age < min_age:
            findings.append(Finding(f"{key}.max_age", f"max_age {max_age} 小于 min_age {min_age}"))
            continue
        groups.append((min_age, max_age))
    findings.extend(contiguity(groups))
    return groups


def contiguity(groups: list[tuple[int, int | None]]) -> list[Finding]:
    """区间从 0 岁起首尾相接，只有最后一档开区间。"""
    findings: list[Finding] = []
    if len(groups) != AGE_GROUP_COUNT:
        return findings  # 档数已经报过了，续断定界没有意义
    if groups[0][0] != 0:
        findings.append(
            Finding("caa.age_groups[0].min_age", f"第一档从 0 岁开始，现在是 {groups[0][0]}")
        )
    for index, (min_age, max_age) in enumerate(groups):
        last = index == len(groups) - 1
        key = f"caa.age_groups[{index}].max_age"
        if last:
            if max_age is not None:
                findings.append(Finding(key, "最后一档必须开区间，写 max_age: null"))
            continue
        if max_age is None:
            findings.append(Finding(key, "只有最后一档可以开区间"))
            continue
        following = groups[index + 1][0]
        if following != max_age + 1:
            findings.append(
                Finding(
                    f"caa.age_groups[{index + 1}].min_age",
                    f"必须紧接上一档的 max_age {max_age} 再加一，现在是 {following}",
                )
            )
    return findings


def check_caa(caa: dict[str, object], findings: list[Finding]) -> None:
    groups = age_groups(caa.get("age_groups"), findings)
    tiers = enum_list(caa.get("tiers"), TIERS, "caa.tiers", findings)
    events = enum_list(caa.get("events"), EVENTS, "caa.events", findings)
    min_ages = {group[0] for group in groups}
    entries = caa.get("entries")
    if not isinstance(entries, list):
        findings.append(Finding("caa.entries", "必须是列表；数字还没拿到时写 []"))
        return
    seen: set[tuple[str, str, int, str]] = set()
    for index, entry in enumerate(entries):
        key = f"caa.entries[{index}]"
        if not isinstance(entry, dict):
            findings.append(Finding(key, "必须是 mapping"))
            continue
        event = entry.get("event")
        sex = entry.get("sex")
        tier = entry.get("tier")
        min_age = entry.get("min_age")
        max_time_s = positive_int(entry.get("max_time_s"))
        intact = True
        if not isinstance(event, str) or event not in events:
            findings.append(Finding(f"{key}.event", f"必须是 {list(EVENTS)} 之一且在 caa.events 内"))
            intact = False
        if not isinstance(sex, str) or sex not in SEXES:
            findings.append(Finding(f"{key}.sex", f"必须是 {list(SEXES)} 之一"))
            intact = False
        if not isinstance(tier, str) or tier not in tiers:
            findings.append(Finding(f"{key}.tier", f"必须是 {list(TIERS)} 之一且在 caa.tiers 内"))
            intact = False
        if isinstance(min_age, bool) or not isinstance(min_age, int) or min_age not in min_ages:
            findings.append(Finding(f"{key}.min_age", "必须是 caa.age_groups 里的某个 min_age"))
            intact = False
        if max_time_s is None:
            findings.append(Finding(f"{key}.max_time_s", "必须是正整数秒"))
            intact = False
        if not intact:
            continue
        combo = (cast(str, event), cast(str, sex), cast(int, min_age), cast(str, tier))
        if combo in seen:
            joined = f"{combo[0]}/{combo[1]}/{combo[2]}/{combo[3]}"
            findings.append(Finding(key, f"(event, sex, min_age, tier) 重复：{joined}"))
            continue
        seen.add(combo)


def check_wma(wma: dict[str, object], findings: list[Finding]) -> None:
    events = enum_list(wma.get("events"), EVENTS, "wma.events", findings)
    sexes = enum_list(wma.get("sexes"), SEXES, "wma.sexes", findings)
    ages = wma.get("ages")
    age_range: tuple[int, int] | None = None
    if (
        not isinstance(ages, list)
        or len(ages) != 2
        or any(isinstance(age, bool) or not isinstance(age, int) for age in ages)
    ):
        findings.append(Finding("wma.ages", "必须是两个整数 [最小年龄, 最大年龄]"))
    else:
        low, high = cast(list[int], ages)
        if low >= high:
            findings.append(Finding("wma.ages", f"下界 {low} 必须小于上界 {high}"))
        else:
            age_range = (low, high)
    entries = wma.get("entries")
    if not isinstance(entries, list):
        findings.append(Finding("wma.entries", "必须是列表；系数还没拿到时写 []"))
        return
    for index, entry in enumerate(entries):
        key = f"wma.entries[{index}]"
        if not isinstance(entry, dict):
            findings.append(Finding(key, "必须是 mapping"))
            continue
        event = entry.get("event")
        sex = entry.get("sex")
        age = entry.get("age")
        factor = entry.get("factor")
        if not isinstance(event, str) or event not in events:
            findings.append(Finding(f"{key}.event", f"必须是 {list(EVENTS)} 之一且在 wma.events 内"))
        if not isinstance(sex, str) or sex not in sexes:
            findings.append(Finding(f"{key}.sex", f"必须是 {list(SEXES)} 之一且在 wma.sexes 内"))
        if isinstance(age, bool) or not isinstance(age, int):
            findings.append(Finding(f"{key}.age", "必须是整岁"))
        elif age_range is not None and not age_range[0] <= age <= age_range[1]:
            findings.append(
                Finding(f"{key}.age", f"{age} 落在 wma.ages {list(age_range)} 之外")
            )
        if isinstance(factor, bool) or not isinstance(factor, int | float):
            findings.append(Finding(f"{key}.factor", "必须是数字"))
        elif not 0 < factor <= 1:
            findings.append(Finding(f"{key}.factor", f"必须在 (0, 1] 之间，现在是 {factor}"))


def check(document: dict[str, object]) -> list[Finding]:
    findings: list[Finding] = []
    for key in TOP_LEVEL:
        if key not in document:
            findings.append(Finding(key, "缺少必填键"))
    source = document.get("source")
    if not isinstance(source, dict):
        findings.append(Finding("source", "必须是 mapping，写 caa 与 wma 两个出处"))
    else:
        for key in ("caa", "wma"):
            value = source.get(key)
            if not isinstance(value, str) or not value.strip():
                findings.append(Finding(f"source.{key}", "必须是非空字符串"))
    status = document.get("status")
    if not isinstance(status, str) or not status.strip():
        findings.append(Finding("status", "必须是非空字符串；数字还没填时是 pending_source"))
    caa = document.get("caa")
    if isinstance(caa, dict):
        check_caa(caa, findings)
    else:
        findings.append(Finding("caa", "必须是 mapping"))
    wma = document.get("wma")
    if isinstance(wma, dict):
        check_wma(wma, findings)
    else:
        findings.append(Finding("wma", "必须是 mapping"))
    return findings


def load(path: Path) -> dict[str, object] | None:
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as handle:
        parsed = yaml.safe_load(handle)
    if not isinstance(parsed, dict):
        return None
    return cast(dict[str, object], parsed)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="校验 contracts/v1/grading.yaml 的结构与枚举；具体数字不在这里判断"
    )
    _ = parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv[1:])

    document = load(CONTRACT)
    findings = [Finding("grading.yaml", f"{CONTRACT} 不存在或不是 mapping")] if document is None else check(document)

    if args.json:
        print(json.dumps({"findings": [asdict(finding) for finding in findings]}, ensure_ascii=False, indent=2))
    else:
        for finding in findings:
            print(f"grading.yaml:{finding.key}: {finding.detail}")
        print(f"\n{len(findings)} finding(s) in contracts/v1/grading.yaml")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
