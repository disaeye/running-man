#!/usr/bin/env python3
"""Run the repository quality gates locally (no GitHub remote is configured).

The job definitions in .github/workflows/ci.yml are the gate manifest; this
script executes the same checks against the local environment:
  - web:       eslint (zero warnings), tsc, vitest, next build, file-size
  - api:       ruff, mypy, OpenAPI contract checks, pytest (needs test DB)
  - contract:  validate / generate / check registries + generated-file drift

Usage:
  scripts/run_gates.py            # all groups
  scripts/run_gates.py web api    # selected groups
  scripts/run_gates.py --fast     # skip next build (slowest gate)

pytest always runs; it is never skipped. The DSN comes from TEST_DATABASE_URL,
failing that `wind_runner_test` is derived from the app's own DATABASE_URL by
`apps/api/testsupport.py`. Nothing credential-bearing lives in this file.
Override explicitly with:
  export TEST_DATABASE_URL='postgresql://user:pw@host:5432/other_test_db'
Exit code is non-zero when any gate fails.
"""
from __future__ import annotations

import argparse
import glob
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

REPO_ROOT: Final = Path(__file__).resolve().parents[1]

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gate_e2e as _e2e  # noqa: E402
API_DIR: Final = REPO_ROOT / "apps" / "api"
WEB_DIR: Final = REPO_ROOT / "apps" / "web"

# pytest is part of the gate and never skipped; see `api_gates`.
FAIL_OUTPUT_TAIL: Final = 40


@dataclass(slots=True)
class Gate:
    group: str
    name: str
    command: list[str]
    cwd: Path
    timeout: int = 300
    skip_reason: str | None = None
    failure_hint: str = ""
    env: dict[str, str] = field(default_factory=dict)


@dataclass(slots=True)
class Result:
    gate: Gate
    status: str
    seconds: float
    tail: str = field(default="")


def ensure_node_on_path() -> None:
    env_path = os.environ.get("PATH", "")
    if all(shutil_which(tool, env_path) for tool in ("node", "npm")):
        return
    candidates = sorted(
        glob.glob(os.path.expanduser("~/.nvm/versions/node/v22*/bin")), reverse=True
    )
    for candidate in candidates:
        if (Path(candidate) / "npm").exists():
            os.environ["PATH"] = candidate + os.pathsep + env_path
            return


def shutil_which(tool: str, path: str) -> bool:
    from shutil import which

    return which(tool, path=path) is not None


def api_gates() -> list[Gate]:
    python = str(API_DIR / ".venv/bin/python")
    openapi_chk = "../../scripts/check_openapi_compatibility.py"
    openapi_json = "../../contracts/v1/openapi.json"
    gates = [
        Gate("api", "ruff", [str(API_DIR / ".venv/bin/ruff"), "check", "."], API_DIR),
        Gate("api", "mypy", [str(API_DIR / ".venv/bin/mypy"), "src", "tests"], API_DIR, 600),
        Gate("api", "openapi response models", [python, "../../scripts/check_response_models.py", "--app", "main:app", "--json"], API_DIR),
        Gate("api", "openapi contract drift", [python, "../../scripts/export_openapi.py", "--app", "main:app", "--check", openapi_json], API_DIR),
        Gate("api", "openapi compatibility", [python, openapi_chk, openapi_json, openapi_json, "--json"], API_DIR),
    ]
    # pytest always runs. It used to be skipped when the test database was
    # unreachable, which hid every runtime defect that only a real request or a
    # real table can expose: a response model that forbids extra fields being fed
    # one at runtime, a fixture asserting a hardcoded version, a test that only
    # holds for half the day. A missing DSN now fails here, at conftest import,
    # with the reason `testsupport.test_dsn()` raises.
    gates.append(Gate("api", "pytest", [python, "-m", "pytest", "-q"], API_DIR, 900))
    return gates


def contract_gates() -> list[Gate]:
    python = str(API_DIR / ".venv/bin/python")
    hint = "generated files differ from the index — if you just ran generate_data_contract.py or edited generators, commit the output"
    return [
        Gate("contract", "validate v1 contract", [python, "scripts/validate_data_contract.py", "contracts/v1", "--json"], REPO_ROOT),
        Gate("contract", "generate semantic registries", [python, "scripts/generate_data_contract.py", "contracts/v1", "--json"], REPO_ROOT),
        Gate("contract", "check generated registry drift", [python, "scripts/check_generated_data_contract.py", "--json"], REPO_ROOT),
        Gate("contract", "metric semantics (web)", [python, "scripts/check_metric_semantics.py"], REPO_ROOT),
        Gate("contract", "design tokens vs DESIGN.md", [python, "scripts/check_design_tokens.py"], REPO_ROOT),
        Gate("contract", "web tokens (panels, palette, type)", [python, "scripts/check_web_tokens.py"], REPO_ROOT),
        Gate("contract", "token contrast (WCAG AA)", [python, "scripts/check_contrast.py", "--baseline", "scripts/contrast_baseline.json"], REPO_ROOT),
        Gate("contract", "algorithm reference values", [python, "scripts/check_algorithm_references.py"], REPO_ROOT),
        Gate("contract", "generated files checked in", ["git", "diff", "--exit-code", "--", "apps/api/src/domain/generated", "apps/web/shared/config/generated"], REPO_ROOT, failure_hint=hint),
        Gate("contract", "file-size (repo)", ["python3", "scripts/lint_file_size.py"], REPO_ROOT),
    ]


def web_gates(fast: bool) -> list[Gate]:
    gates = [
        Gate("web", "eslint", ["npm", "run", "lint", "--", "--max-warnings=0"], WEB_DIR, 600),
        Gate("web", "tsc", ["node", "node_modules/typescript/bin/tsc", "--noEmit"], WEB_DIR),
        Gate("web", "vitest", ["npm", "run", "test"], WEB_DIR),
        Gate("web", "file-size (apps/web)", ["python3", "scripts/lint_file_size.py", "apps/web"], REPO_ROOT),
    ]
    if fast:
        gates.append(Gate("web", "next build", ["true"], WEB_DIR, skip_reason="--fast"))
    else:
        # Build into the gate's own directory. `npm run build` writes to
        # NEXT_DIST_DIR, and the production service is serving `.next`; a build
        # that overwrote it would break the live site without failing anything.
        gates.append(
            Gate(
                "web",
                "next build",
                ["npm", "run", "build"],
                WEB_DIR,
                600,
                env={"NEXT_DIST_DIR": _e2e.GATE_DIST_DIR},
            )
        )
    gates.append(e2e_gate(fast))
    return gates


def e2e_gate(fast: bool) -> Gate:
    """Delegates to scripts/gate_e2e.py; see there for the skip rules."""
    definition = _e2e.e2e_gate(fast)
    return Gate(
        definition.group,
        definition.name,
        definition.command,
        definition.cwd,
        definition.timeout,
        skip_reason=definition.skip_reason,
    )


def run_gate(gate: Gate) -> Result:
    if gate.skip_reason is not None:
        return Result(gate, "SKIP", 0.0, gate.skip_reason)
    env = dict(os.environ)
    if gate.name.startswith("e2e"):
        # Restart here, not when the gate list is built: `next build` runs
        # earlier in this same process and rewrites the gate dist directory, so
        # any restart that happened before it would leave the server on the
        # previous manifest — the exact mismatch that made pages fail to
        # hydrate.
        note = _e2e.prepare_server()
        if note:
            print(f"  ! {note}", flush=True)
        env.update(_e2e.e2e_env())
    env.update(gate.env)
    started = time.monotonic()
    try:
        completed = subprocess.run(
            gate.command,
            cwd=gate.cwd,
            capture_output=True,
            text=True,
            timeout=gate.timeout,
            env=env,
        )
    except subprocess.TimeoutExpired:
        return Result(gate, "FAIL", time.monotonic() - started, f"timeout after {gate.timeout}s")
    except OSError as error:
        return Result(gate, "FAIL", time.monotonic() - started, str(error))
    elapsed = time.monotonic() - started
    status = "PASS" if completed.returncode == 0 else "FAIL"
    tail = ""
    if status == "FAIL":
        output = (completed.stdout + "\n" + completed.stderr).strip().splitlines()
        tail = "\n".join(output[-FAIL_OUTPUT_TAIL:])
        if gate.failure_hint:
            tail = f"{tail}\nhint: {gate.failure_hint}" if tail else f"hint: {gate.failure_hint}"
    return Result(gate, status, elapsed, tail)


def main() -> int:
    summary = (__doc__ or __file__).splitlines()[0]
    parser = argparse.ArgumentParser(description=summary)
    parser.add_argument("groups", nargs="*", metavar="group", default=[],
                        help="web | api | contract | all (default: all)")
    parser.add_argument("--fast", action="store_true", help="skip next build")
    args = parser.parse_args()
    valid_groups = {"web", "api", "contract", "all"}
    unknown = set(args.groups) - valid_groups
    if unknown:
        parser.error(f"unknown group(s): {', '.join(sorted(unknown))}")

    ensure_node_on_path()
    selected = set(args.groups) or {"all"}
    if "all" in selected:
        selected = {"web", "api", "contract"}

    gates: list[Gate] = []
    if "contract" in selected:
        gates += contract_gates()
    if "api" in selected:
        gates += api_gates()
    if "web" in selected:
        gates += web_gates(args.fast)

    results = []
    for gate in gates:
        print(f"▶ {gate.group}/{gate.name} …", flush=True)
        result = run_gate(gate)
        results.append(result)
        suffix = f" ({result.tail.splitlines()[0]})" if result.tail else ""
        print(f"  {result.status}  {result.seconds:.1f}s{suffix}")
        if result.status == "FAIL" and result.tail:
            for line in result.tail.splitlines():
                print(f"    | {line}")

    failed = [r for r in results if r.status == "FAIL"]
    skipped = [r for r in results if r.status == "SKIP"]
    print(
        f"\nSummary: {len(results) - len(failed) - len(skipped)} passed, "
        f"{len(failed)} failed, {len(skipped)} skipped"
    )
    for result in skipped:
        print(f"SKIPPED: {result.gate.group}/{result.gate.name}: {result.tail}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
