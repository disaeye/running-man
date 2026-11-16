#!/usr/bin/env python3
"""Run the repository quality gates locally (no GitHub remote is configured).

The job definitions in .github/workflows/ci.yml are the gate manifest; this
script executes the equivalent checks against the local environment:

  - web:       eslint (zero warnings), tsc, vitest, file-size
  - api:       ruff, mypy, OpenAPI contract checks, pytest (needs test DB)
  - contract:  validate / generate / check registries + generated-file drift
  - e2e:       next build + the @smoke browser subset (one load per route)
  - e2e-full:  next build + every browser test (minutes, run before deploying)

Gates run in parallel (bounded by the core count) and are memoised: a gate whose
inputs hash to the same content as its last pass is reported CACHED and skipped,
so an unchanged tree finishes in seconds. Failures are never cached. The
default selection includes the browser smoke tier, because the browser
assertions accumulate into the quality gate as the stages land; the full
browser suite stays a separate group since it takes minutes. The
registry generator runs first and everything else waits for it, because it
rewrites files the other gates read. pytest's DSN comes from TEST_DATABASE_URL,
failing that `wind_runner_test` is derived by `apps/api/testsupport.py`; the
database is probed before a cached pytest pass is honoured. Exit code is
non-zero when any gate fails or is blocked by a failed dependency.

Usage:
  scripts/run_gates.py            # web + api + contract + browser smoke
  scripts/run_gates.py web api    # selected fast groups
  scripts/run_gates.py e2e-full   # next build + full browser suite
  scripts/run_gates.py --no-cache # re-run every gate and refresh stored passes
"""
from __future__ import annotations

import argparse
import glob
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Final

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gate_e2e as _e2e  # noqa: E402
from gate_execute import Gate, Snapshot, execute, say  # noqa: E402
import gate_scheduler  # noqa: E402

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
API_DIR: Final = REPO_ROOT / "apps" / "api"
WEB_DIR: Final = REPO_ROOT / "apps" / "web"

# Cache input sets. Coarse on purpose: hashing too little risks a stale pass,
# hashing a bit too much only re-runs a gate that would have been skipped.
API_INPUTS: Final = ("apps/api", "scripts", "contracts")
WEB_INPUTS: Final = ("apps/web", "scripts", "contracts")
E2E_INPUTS: Final = WEB_INPUTS + ("apps/api/src", "apps/api/main.py", "apps/api/.env")
SIZE_INPUTS: Final = ("apps", "docs", "scripts", "CLAUDE.md", "README.md", "CONTRIBUTING.md")
CONTRACT_INPUTS: Final = ("contracts", "scripts", "apps/api/src", "apps/web")
GENERATED_OUTPUTS: Final = (
    "apps/api/src/domain/generated",
    "apps/web/shared/config/generated",
)
GENERATE_SLUG: Final = "contract-generate-semantic-registries"
BUILD_SLUG: Final = "web-next-build"
# Admission order for the worker pool: the longest gates claim slots first, so a
# short gate finishing early cannot delay the start of the pole that sets the
# wall time. Gates not listed here admit last, in name order.
LONGEST_FIRST: Final = (
    "web-e2e-(playwright)",
    "api-pytest",
    "web-e2e-(smoke)",
    "web-next-build",
    "web-vitest",
    "web-tsc",
    "web-eslint",
    "web-file-size-(apps/web)",
    "api-mypy",
)


def db_probe() -> str | None:
    """Confirm the test database answers before honouring a cached pytest pass."""
    code = (
        "import sys; sys.path.insert(0, 'src'); "
        "from testsupport import test_dsn; import psycopg; "
        "conn = psycopg.connect(test_dsn(), connect_timeout=5); "
        "ok = conn.execute(\"select to_regclass('public.athletes')\").fetchone()[0]; "
        "conn.close(); sys.exit(0 if ok else 1)"
    )
    try:
        probe = subprocess.run(
            [str(API_DIR / ".venv/bin/python"), "-c", code],
            cwd=API_DIR,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except (OSError, subprocess.SubprocessError) as error:
        return f"test database probe could not run: {error}"
    if probe.returncode != 0:
        detail = (probe.stdout + probe.stderr).strip().splitlines()[-1:]
        return "test database unreachable or schema missing: " + "".join(detail)
    return None


def api_gates() -> list[Gate]:
    python = str(API_DIR / ".venv/bin/python")
    return [
        Gate("api", "ruff", [str(API_DIR / ".venv/bin/ruff"), "check", "."], API_DIR, inputs=API_INPUTS),
        Gate("api", "mypy", [str(API_DIR / ".venv/bin/mypy"), "src", "tests"], API_DIR, 600, inputs=API_INPUTS),
        Gate("api", "openapi response models", [python, "../../scripts/check_response_models.py", "--app", "main:app", "--json"], API_DIR, inputs=API_INPUTS),
        Gate("api", "openapi contract drift", [python, "../../scripts/export_openapi.py", "--app", "main:app", "--check", "../../contracts/v1/openapi.json"], API_DIR, inputs=API_INPUTS),
        Gate("api", "openapi compatibility", [python, "../../scripts/check_openapi_compatibility.py", "../../contracts/v1/openapi.json", "../../contracts/v1/openapi.json", "--json"], API_DIR, inputs=API_INPUTS),
        # pytest always runs on change. A cached pass requires the database to
        # answer with its schema: `testsupport.test_dsn()` still fails loudly at
        # conftest import when the probe is unhappy.
        Gate(
            "api",
            "pytest",
            [python, "-m", "pytest", "-q", "--basetemp", str(REPO_ROOT / ".pi" / "pytest-temp")],
            API_DIR,
            900,
            inputs=API_INPUTS,
            salt=os.environ.get("TEST_DATABASE_URL", ""),
            verify=db_probe,
        ),
    ]


def contract_gates() -> list[Gate]:
    python = str(API_DIR / ".venv/bin/python")
    hint = "generated files differ from the index — if you just ran generate_data_contract.py or edited generators, commit the output"
    inputs: tuple[str, ...] = CONTRACT_INPUTS
    return [
        Gate("contract", "validate v1 contract", [python, "scripts/validate_data_contract.py", "contracts/v1", "--json"], REPO_ROOT, inputs=inputs),
        Gate("contract", "grading contract (CAA / WMA)", [python, "scripts/check_grading_contract.py", "--json"], REPO_ROOT, inputs=inputs),
        Gate(
            "contract",
            "generate semantic registries",
            [python, "scripts/generate_data_contract.py", "contracts/v1", "--json"],
            REPO_ROOT,
            invalidates_snapshot=True,
            inputs=CONTRACT_INPUTS,
            excludes=GENERATED_OUTPUTS,
        ),
        Gate("contract", "check generated registry drift", [python, "scripts/check_generated_data_contract.py", "--json"], REPO_ROOT, inputs=inputs),
        Gate("contract", "metric semantics (web)", [python, "scripts/check_metric_semantics.py"], REPO_ROOT, inputs=inputs),
        Gate("contract", "confirmed source examples", [python, "scripts/verify_confirmed_source.py"], REPO_ROOT, inputs=("docs", "scripts")),
        Gate("contract", "design tokens vs DESIGN.md", [python, "scripts/check_design_tokens.py"], REPO_ROOT, inputs=inputs),
        Gate("contract", "web tokens (panels, palette, type)", [python, "scripts/check_web_tokens.py"], REPO_ROOT, inputs=inputs),
        Gate("contract", "token contrast (WCAG AA)", [python, "scripts/check_contrast.py", "--baseline", "scripts/contrast_baseline.json"], REPO_ROOT, inputs=inputs),
        Gate("contract", "algorithm reference values", [python, "scripts/check_algorithm_references.py"], REPO_ROOT, inputs=inputs),
        Gate("contract", "generated files checked in", ["git", "diff", "--exit-code", "--", "apps/api/src/domain/generated", "apps/web/shared/config/generated"], REPO_ROOT, failure_hint=hint, inputs=inputs),
        Gate("contract", "file-size (repo)", ["python3", "scripts/lint_file_size.py"], REPO_ROOT, inputs=SIZE_INPUTS),
    ]


def web_gates() -> list[Gate]:
    return [
        Gate("web", "eslint", ["npm", "run", "lint", "--", "--max-warnings=0", "--cache", "--cache-strategy", "content", "--cache-location", "node_modules/.cache/eslint-gate.cache"], WEB_DIR, 600, inputs=WEB_INPUTS),
        Gate("web", "tsc", ["node", "node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "--tsBuildInfoFile", "gate.tsbuildinfo"], WEB_DIR, inputs=WEB_INPUTS),
        Gate("web", "vitest", ["npm", "run", "test"], WEB_DIR, env={"NODE_ENV": "test"}, inputs=WEB_INPUTS),
        Gate("web", "file-size (apps/web)", ["python3", "scripts/lint_file_size.py", "apps/web"], REPO_ROOT, inputs=WEB_INPUTS),
    ]


def build_gate() -> Gate:
    # Build into the gate's own directory; the production service serves
    # `.next` and must never see a half-finished build under it. The e2e specs
    # and the Playwright config do not feed the build, so editing them reuses
    # the last verified build instead of rebuilding.
    return Gate(
        "web",
        "next build",
        ["npm", "run", "build"],
        WEB_DIR,
        600,
        env={"NEXT_DIST_DIR": _e2e.GATE_DIST_DIR},
        inputs=WEB_INPUTS,
        excludes=("apps/web/e2e", "apps/web/playwright.config.ts"),
    )


def api_service_probe() -> str | None:
    """Confirm the API service answers before honouring a cached e2e pass."""
    from urllib.error import URLError
    from urllib.request import urlopen

    try:
        with urlopen("http://127.0.0.1:31001/openapi.json", timeout=3) as response:  # noqa: S310 - fixed local URL
            if response.status >= 500:
                return f"API service answered {response.status}"
    except (URLError, OSError) as error:
        return f"API service unreachable: {error}"
    return None


def e2e_gates(scope: str) -> list[Gate]:
    """The build plus the browser suite; the suite runs against the fresh build."""
    definition = _e2e.e2e_gate(scope)
    suite = Gate(
        definition.group,
        definition.name,
        definition.command,
        definition.cwd,
        definition.timeout,
        skip_reason=definition.skip_reason,
        needs_gate_server=True,
        failure_hint=definition.failure_hint,
        inputs=E2E_INPUTS,
        after=(BUILD_SLUG,),
        verify=api_service_probe,
    )
    return [build_gate(), suite]


def ensure_node_on_path() -> None:
    from shutil import which

    if all(which(tool) for tool in ("node", "npm")):
        return
    for candidate in sorted(
        glob.glob(os.path.expanduser("~/.nvm/versions/node/v22*/bin")), reverse=True
    ):
        if (Path(candidate) / "npm").exists():
            os.environ["PATH"] = candidate + os.pathsep + os.environ.get("PATH", "")
            return


def main() -> int:
    summary = (__doc__ or __file__).splitlines()[0]
    parser = argparse.ArgumentParser(description=summary)
    parser.add_argument("groups", nargs="*", metavar="group", default=[],
                        help="web | api | contract | e2e | e2e-full | all (default: all)")
    parser.add_argument("--no-cache", action="store_true",
                        help="run every gate and refresh stored passes")
    args = parser.parse_args()
    valid_groups = {"web", "api", "contract", "e2e", "e2e-full", "all"}
    unknown = set(args.groups) - valid_groups
    if unknown:
        parser.error(f"unknown group(s): {', '.join(sorted(unknown))}")

    ensure_node_on_path()
    selected = set(args.groups) or {"all"}
    if "all" in selected:
        # 浏览器冒烟层进默认选择：e2e 断言随阶段累加进质量门。
        selected = {"web", "api", "contract", "e2e"}

    gates: list[Gate] = []
    if "contract" in selected:
        gates += contract_gates()
    if "api" in selected:
        gates += api_gates()
    if "web" in selected:
        gates += web_gates()
    if "e2e" in selected:
        gates += e2e_gates("smoke")
    if "e2e-full" in selected:
        gates += e2e_gates("full")

    # The registry generator rewrites files that every other gate reads, so it
    # is a barrier: everything waits for it (a cached generate costs nothing).
    if any(gate.slug == GENERATE_SLUG for gate in gates):
        for gate in gates:
            if gate.slug != GENERATE_SLUG:
                gate.after += (GENERATE_SLUG,)
    gates.sort(
        key=lambda gate: (
            LONGEST_FIRST.index(gate.slug) if gate.slug in LONGEST_FIRST else len(LONGEST_FIRST),
            gate.slug,
        )
    )

    snapshot = Snapshot()
    units = [
        gate_scheduler.Unit(
            gate.slug, gate.after, lambda bound=gate: execute(bound, snapshot, not args.no_cache)
        )
        for gate in gates
    ]
    started = time.monotonic()
    statuses = gate_scheduler.run_all(units, max(2, os.cpu_count() or 2), announce=say)

    failed = [name for name, status in statuses.items() if status == "FAIL"]
    blocked = [name for name, status in statuses.items() if status == "BLOCKED"]
    skipped = [name for name, status in statuses.items() if status == "SKIP"]
    cached = [name for name, status in statuses.items() if status == "CACHED"]
    print(
        f"\nSummary: {len(statuses) - len(failed) - len(blocked) - len(skipped)} passed "
        f"({len(cached)} cached), {len(failed)} failed, {len(blocked)} blocked, "
        f"{len(skipped)} skipped — {time.monotonic() - started:.1f}s wall"
    )
    for name in blocked:
        print(f"BLOCKED: {name}")
    for name in skipped:
        gate = next(g for g in gates if g.slug == name)
        print(f"SKIPPED: {name}: {gate.skip_reason}")
    return 1 if failed or blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
