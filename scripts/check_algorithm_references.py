"""Evaluate the numeric reference cases declared in the algorithm contract.

`contracts/v1/algorithms.yaml` records each algorithm's inputs, outputs and
version. That is enough to detect a change in shape and nothing about a change
in value: a VDOT that returned 60 for a 5K in 20:00 (published: 49.8), a Minetti
polynomial missing its quadratic term, and a critical-speed asymptote written
into `threshold_pace` all passed every gate.

Each case in the contract names the algorithm, its inputs and the expected
value; this script runs the shipped code and compares. A case with no evaluator
fails, so the two cannot drift apart.

Usage:
  scripts/check_algorithm_references.py [--json]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Callable, Final

import yaml

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
API_SRC: Final = REPO_ROOT / "apps" / "api" / "src"
CONTRACT: Final = REPO_ROOT / "contracts" / "v1" / "algorithms.yaml"

sys.path.insert(0, str(API_SRC))

# A version declared in the code is a second source of truth. The activity-load
# constant stayed at 1.0.0 after the contract moved to 1.1.0, so facts computed
# with the new maths were stamped with the old version and never superseded.
VERSION_LITERAL: Final = re.compile(r"^\s*ALGORITHM_VERSION\b[^=]*=\s*[\"']")


@dataclass(frozen=True, slots=True)
class Finding:
    algorithm: str
    case: str
    expected: str
    actual: str


def _grade_multiplier(inputs: dict[str, object]) -> dict[str, float]:
    from domain.physiology.graded_pace import grade_cost_multiplier

    return {"grade_cost_multiplier": grade_cost_multiplier(float(inputs["grade"]))}


def _vdot_from_performance(inputs: dict[str, object]) -> dict[str, float]:
    from domain.physiology.vdot import vdot_from_performance

    value = vdot_from_performance(float(inputs["distance_m"]), float(inputs["time_s"]))
    return {"vdot": float(value) if value is not None else float("nan")}


def _daniels_paces(inputs: dict[str, object]) -> dict[str, float]:
    from domain.physiology.vdot import training_paces

    paces = training_paces(float(inputs["vdot"]))
    result: dict[str, float] = {}
    for intensity, bounds in paces.items():
        if "min" in bounds:
            result[f"{intensity}_min_s_per_km"] = float(bounds["min"])
        if "max" in bounds:
            result[f"{intensity}_max_s_per_km"] = float(bounds["max"])
    return result


def _lthr(inputs: dict[str, object]) -> dict[str, float]:
    from domain.physiology.lthr import estimate_lthr

    result = estimate_lthr(
        [float(value) for value in inputs["best_20min_hrs"]],  # type: ignore[union-attr]
        [float(value) for value in inputs["best_60min_hrs"]],  # type: ignore[union-attr]
    )
    lthr = result.get("lthr")
    return {"lthr": float(lthr) if isinstance(lthr, int | float) else float("nan")}


def _threshold_pace_from_vdot(inputs: dict[str, object]) -> dict[str, float]:
    from domain.physiology.vdot import vdot_to_threshold_pace

    return {"threshold_pace_s_per_km": vdot_to_threshold_pace(float(inputs["vdot"]))}


def _streams(inputs: dict[str, object]) -> tuple[list[float], list[float], list[float]]:
    """Build flat-ground distance/altitude/time streams from a compact spec."""
    speeds: list[float] = []
    if "steady_speed_m_s" in inputs:
        speeds = [float(inputs["steady_speed_m_s"])] * int(inputs["samples"])
    else:
        pattern = inputs["pattern"]
        assert isinstance(pattern, list)
        for block in pattern:
            assert isinstance(block, dict)
            speeds.extend([float(block["speed_m_s"])] * int(block["seconds"]))
        speeds *= int(inputs["cycles"])
    distances: list[float] = []
    cumulative = 0.0
    for speed in speeds:
        cumulative += speed
        distances.append(cumulative)
    return distances, [0.0] * len(speeds), [float(index) for index in range(len(speeds))]


def _ngp(inputs: dict[str, object]) -> dict[str, float]:
    from domain.physiology.graded_pace import average_gap, normalized_graded_pace

    distances, altitudes, times = _streams(inputs)
    ngp = normalized_graded_pace(distances=distances, altitudes=altitudes, times=times)
    gap = average_gap(distances=distances, altitudes=altitudes, times=times)
    return {
        "normalized_graded_pace": float(ngp) if ngp is not None else float("nan"),
        "gap_avg": float(gap) if gap is not None else float("nan"),
    }


def _pmc(inputs: dict[str, object]) -> dict[str, float]:
    from datetime import date, timedelta

    from domain.load.pmc import build_pmc_series

    start = date(2026, 1, 1)
    daily = {start + timedelta(days=offset): float(inputs["daily_tss"]) for offset in range(int(inputs["days"]))}
    point = build_pmc_series(daily)[-1]
    return {
        key: float(value)
        for key, value in point.items()
        if key in {"ctl", "atl", "tsb"} and isinstance(value, int | float)
    }


def _hrmax(inputs: dict[str, object]) -> dict[str, float]:
    from domain.physiology.hrmax import estimate_hrmax

    start = float(inputs["start_bpm"])
    end = float(inputs["end_bpm"])
    sessions = int(inputs["sessions"])
    step = (end - start) / (sessions - 1)
    result = estimate_hrmax([start + index * step for index in range(sessions)])
    hr_max = result.get("hr_max")
    near_max = result.get("near_max_count")
    return {
        "hr_max": float(hr_max) if isinstance(hr_max, int | float) else float("nan"),
        "near_max_count": float(near_max) if isinstance(near_max, int | float) else float("nan"),
    }


EVALUATORS: Final[dict[tuple[str, str], Callable[[dict[str, object]], dict[str, float]]]] = {
    ("activity_load", "minetti_cost_at_10_percent_climb"): _grade_multiplier,
    ("activity_load", "minetti_cost_at_20_percent_climb"): _grade_multiplier,
    ("activity_load", "minetti_cost_at_10_percent_descent"): _grade_multiplier,
    ("activity_load", "ngp_steady_3_m_s"): _ngp,
    ("activity_load", "ngp_two_to_one_intervals"): _ngp,
    ("pmc", "ctl_atl_tsb_after_28_days_of_100_tss"): _pmc,
    ("physiology", "hr_max_from_linear_session_ramp"): _hrmax,
    ("vdot", "vdot_from_5k_in_20_minutes"): _vdot_from_performance,
    ("vdot", "vdot_from_10k_in_41_20"): _vdot_from_performance,
    ("vdot", "daniels_easy_pace_for_vdot_50"): _daniels_paces,
    ("vdot", "daniels_threshold_pace_for_vdot_50"): _daniels_paces,
    ("physiology", "lthr_from_best_effort_windows"): _lthr,
    ("physiology", "threshold_pace_from_vdot_50"): _threshold_pace_from_vdot,
}


def evaluate(cases: list[dict[str, object]]) -> list[Finding]:
    findings: list[Finding] = []
    for algorithm, case in cases:
        key = (algorithm, str(case.get("name")))
        if key not in EVALUATORS:
            findings.append(
                Finding(algorithm, key[1], "an evaluator", "none registered in this script")
            )
            continue
        inputs = case.get("inputs") or {}
        expected = case.get("expect") or {}
        tolerance = float(case.get("tolerance") or 0.0)
        actual = EVALUATORS[key](inputs)  # type: ignore[arg-type]
        for name, want in expected.items():
            got = actual.get(str(name))
            if got is None:
                findings.append(Finding(algorithm, str(case.get("name")), str(want), "not produced"))
                continue
            if abs(got - float(want)) > tolerance:
                findings.append(
                    Finding(
                        algorithm,
                        str(case.get("name")),
                        f"{name} = {want} ± {tolerance}",
                        f"{name} = {round(got, 4)}",
                    )
                )
    return findings


def hardcoded_versions() -> list[Finding]:
    """Source rule: an algorithm version must come from the contract."""
    findings: list[Finding] = []
    for path in sorted(API_SRC.rglob("*.py")):
        if "generated" in path.parts:
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if VERSION_LITERAL.search(line):
                relative = path.relative_to(REPO_ROOT).as_posix()
                findings.append(
                    Finding(
                        "source",
                        f"{relative}:{number}",
                        "a version read from contracts/v1/algorithms.yaml",
                        line.strip(),
                    )
                )
    return findings


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv[1:])

    document = yaml.safe_load(CONTRACT.read_text(encoding="utf-8"))
    cases: list[tuple[str, dict[str, object]]] = []
    for algorithm in document.get("algorithms", []):
        for case in algorithm.get("reference_cases") or []:
            cases.append((str(algorithm["key"]), case))

    findings = evaluate(cases) + hardcoded_versions()
    if args.json:
        print(json.dumps({"findings": [asdict(f) for f in findings]}, ensure_ascii=False, indent=2))
    else:
        for finding in findings:
            print(
                f"{finding.algorithm}/{finding.case}: expected {finding.expected}, got {finding.actual}"
            )
        print(f"\n{len(findings)} finding(s) across {len(cases)} reference cases")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
