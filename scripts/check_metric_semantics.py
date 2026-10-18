"""Reject hand-written metric semantics in the web app.

Every banded metric — TSB, ACWR, CTL, ATL, the wellness ratings, blood pressure
— has its boundaries, labels and explanation in `contracts/v1/metrics.yaml`,
which `generate_data_contract.py` turns into `METRIC_REGISTRY`. Before this gate
existed the repository held four different TSB band tables with three different
sets of boundaries, so the same number carried a different meaning on the Today
page, the PMC chart and the analysis diagnosis. The contract was correct and
unread.

Two rules keep that from coming back:

  A. A band label defined in the contract may not appear as a literal in web
     source. Two-character labels (偏高, 正常, 中等 …) are ordinary adjectives
     and are skipped; three characters and up are compound phrases that only
     come from the contract.
  B. A banded metric may not be compared against a numeric literal. Zero is
     exempt: `tsb > 0` is a sign test for formatting, not a band boundary.

Both rules accept a `metric-semantics-allow` comment on the same line for the
rare case that is genuinely not a band.

Usage:
  scripts/check_metric_semantics.py [--json]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Final

import yaml

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
CONTRACT: Final = REPO_ROOT / "contracts" / "v1" / "metrics.yaml"

SCAN_ROOTS: Final = (
    REPO_ROOT / "apps" / "web" / "app",
    REPO_ROOT / "apps" / "web" / "features",
    REPO_ROOT / "apps" / "web" / "shared",
)

# The resolver itself and the generated registry are where these strings belong.
EXCLUDED: Final = (
    "shared/config/generated/",
    "shared/lib/metric-zone.ts",
    "shared/config/terms-",
)

SUFFIXES: Final = (".ts", ".tsx")

ALLOW_MARKER: Final = "metric-semantics-allow"

# Metrics whose bands drive decisions. Comparing any of these against a number
# in application code means a second copy of the contract.
BANDED_KEYS: Final = ("tsb", "acwr", "ctl", "atl")

# A band label shorter than this is an ordinary adjective (偏高, 正常, 中等).
MIN_LABEL_LENGTH: Final = 3


@dataclass(frozen=True, slots=True)
class Finding:
    rule: str
    path: str
    line: int
    detail: str


def band_labels(contract: Path) -> dict[str, str]:
    """Every band label in the contract, mapped to the metric that owns it."""
    document = yaml.safe_load(contract.read_text(encoding="utf-8"))
    labels: dict[str, str] = {}
    for metric in document.get("metrics", []):
        for zone in metric.get("zones") or []:
            label = str(zone.get("label", ""))
            if len(label) >= MIN_LABEL_LENGTH:
                labels.setdefault(label, str(metric.get("key", "")))
    return labels


def source_files() -> list[Path]:
    files: list[Path] = []
    for root in SCAN_ROOTS:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.suffix not in SUFFIXES:
                continue
            relative = path.relative_to(REPO_ROOT / "apps" / "web").as_posix()
            if any(relative.startswith(prefix) for prefix in EXCLUDED):
                continue
            files.append(path)
    return files


def comparison_pattern() -> re.Pattern[str]:
    keys = "|".join(BANDED_KEYS)
    # `tsb`, `point.tsb`, `latest.tsb` — the identifier however it is reached.
    return re.compile(
        rf"(?<![\w.])(?:\w+\.)*(?P<key>{keys})\b\s*(?:>=|<=|===|!==|==|>|<)\s*"
        rf"(?P<value>-?\d+(?:\.\d+)?)\b",
        re.IGNORECASE,
    )


def label_pattern(label: str) -> re.Pattern[str]:
    """The label as a whole string literal, or as an object key.

    Substring matching would flag ordinary prose ("高负荷风险", "连续高负荷");
    a band table always names its bands as complete literals or keys.
    """
    quoted = rf"[\"'`]{re.escape(label)}[\"'`]"
    key = rf"(?:^|[{{,(\s]){re.escape(label)}\s*:"
    return re.compile(f"(?:{quoted}|{key})")


def scan(
    path: Path,
    labels: dict[str, tuple[str, re.Pattern[str]]],
    comparison: re.Pattern[str],
) -> list[Finding]:
    findings: list[Finding] = []
    relative = path.relative_to(REPO_ROOT).as_posix()
    for number, text in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if ALLOW_MARKER in text:
            continue
        for label, (metric, pattern) in labels.items():
            if pattern.search(text):
                findings.append(
                    Finding(
                        "band-label",
                        relative,
                        number,
                        f'"{label}" is the {metric} band label from contracts/v1/metrics.yaml; resolve it through zoneFor()',
                    )
                )
        for match in comparison.finditer(text):
            if float(match.group("value")) == 0.0:
                continue
            findings.append(
                Finding(
                    "band-threshold",
                    relative,
                    number,
                    f"{match.group('key')} compared against {match.group('value')}; the boundary belongs in contracts/v1/metrics.yaml",
                )
            )
    return findings


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv[1:])

    labels = {
        label: (metric, label_pattern(label)) for label, metric in band_labels(CONTRACT).items()
    }
    comparison = comparison_pattern()
    findings: list[Finding] = []
    for path in source_files():
        findings.extend(scan(path, labels, comparison))

    if args.json:
        print(json.dumps({"findings": [asdict(f) for f in findings]}, ensure_ascii=False, indent=2))
    else:
        for finding in findings:
            print(f"{finding.path}:{finding.line}: [{finding.rule}] {finding.detail}")
        print(
            f"\n{len(findings)} finding(s) across {len(source_files())} files; "
            f"{len(labels)} band labels in the contract"
        )
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
