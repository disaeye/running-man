from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Final

import yaml

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
API_COMMANDS: Final = [
    "uv sync --extra dev --locked",
    "uv run alembic upgrade head",
    "uv run ruff check .",
    "uv run mypy src tests",
    "uv run python ../../scripts/check_response_models.py --app main:app --json",
    "uv run python ../../scripts/export_openapi.py --app main:app "
    "--check ../../contracts/v1/openapi.json",
    "uv run python ../../scripts/check_openapi_compatibility.py "
    "../../contracts/v1/openapi.json ../../contracts/v1/openapi.json --json",
    "uv run pytest -q",
]
CONTRACT_COMMANDS: Final = [
    "python scripts/validate_data_contract.py contracts/v1 --json",
    "python scripts/generate_data_contract.py contracts/v1 --json",
    "python scripts/check_generated_data_contract.py --json",
]
WEB_COMMANDS: Final = [
    "npm run lint -- --max-warnings=0",
    "npx tsc --noEmit",
    "npm run test",
    "npm run build",
    "python3 scripts/lint_file_size.py apps/web",
    "npx vitest run scripts/hex-ban.test.ts",
]


@dataclass(frozen=True, slots=True)
class Check:
    name: str
    ok: bool
    detail: str


@dataclass(frozen=True, slots=True)
class Execution:
    name: str
    status: str
    detail: str
    returncode: int | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify the repository CI workflow contract.")
    parser.add_argument("workflow", type=Path)
    parser.add_argument("--execute-local", action="store_true")
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def load_workflow(path: Path) -> dict[str, object]:
    with path.open(encoding="utf-8") as workflow_file:
        loaded = yaml.safe_load(workflow_file)
    if not isinstance(loaded, dict):
        return {}
    return loaded


def job(workflow: dict[str, object], name: str) -> dict[str, object]:
    jobs = workflow.get("jobs")
    if not isinstance(jobs, dict):
        return {}
    selected = jobs.get(name)
    return selected if isinstance(selected, dict) else {}


def run_commands(selected_job: dict[str, object]) -> list[str]:
    steps = selected_job.get("steps")
    if not isinstance(steps, list):
        return []
    commands: list[str] = []
    for step in steps:
        if isinstance(step, dict) and isinstance(step.get("run"), str):
            commands.append(step["run"])
    return commands


def includes_command(commands: list[str], expected: str) -> bool:
    return any(expected in command for command in commands)


def workflow_checks(path: Path, workflow: dict[str, object]) -> list[Check]:
    api_commands = run_commands(job(workflow, "api"))
    contract_commands = run_commands(job(workflow, "contract"))
    web_commands = run_commands(job(workflow, "web"))
    browser_job = job(workflow, "browser")
    workflow_text = path.read_text(encoding="utf-8")
    if path.name == "ci-generated-drift.yml":
        return [
            Check("contract job exists", bool(job(workflow, "contract")), "jobs.contract"),
            Check("contract creates generated drift", includes_command(contract_commands, "Create generated registry drift") or any("storage_unit" in command for command in contract_commands), "generated drift step"),
            Check("contract checks generated registry drift", includes_command(contract_commands, "python scripts/check_generated_data_contract.py --json"), "check generated drift"),
        ]
    checks = [
        Check("api job exists", bool(job(workflow, "api")), "jobs.api"),
        Check("contract job exists", bool(job(workflow, "contract")), "jobs.contract"),
        Check("web job exists", bool(job(workflow, "web")), "jobs.web"),
        Check("api uses PostgreSQL service", "postgres" in json.dumps(job(workflow, "api")), "jobs.api.services.postgres"),
        Check("api installs uv dependencies", includes_command(api_commands, "uv sync --extra dev --locked"), "uv sync --extra dev --locked"),
        Check("api creates disposable database", includes_command(api_commands, "createdb -h 127.0.0.1 -U postgres test_running_man"), "createdb"),
        Check("api bridges pytest socket", includes_command(api_commands, ".s.PGSQL.15434"), "socket bridge for apps/api/conftest.py"),
        *[Check(f"api command: {command}", includes_command(api_commands, command), command) for command in API_COMMANDS[1:]],
        *[Check(f"contract command: {command}", includes_command(contract_commands, command), command) for command in CONTRACT_COMMANDS],
        Check("contract checks generated git drift", includes_command(contract_commands, "git diff --exit-code -- apps/api/src/domain/generated apps/web/shared/config/generated"), "git diff generated paths"),
        *[Check(f"web command: {command}", includes_command(web_commands, command), command) for command in WEB_COMMANDS],
        Check("web lint fails on warnings", includes_command(web_commands, "--max-warnings=0"), "ESLint max warnings zero"),
        Check("browser scaffold exists", bool(browser_job), "jobs.browser"),
        Check("browser scaffold disabled", str(browser_job.get("if")) == "${{ false }}", "if: ${{ false }}"),
        Check("browser comment names Todo 33", "Todo 33" in workflow_text, "Todo 33 comment"),
    ]
    return checks


def execute(command: str, cwd: Path) -> Execution:
    completed = subprocess.run(command, cwd=cwd, shell=True, text=True, capture_output=True, timeout=900)
    detail = (completed.stdout + completed.stderr).strip()
    return Execution(command, "passed" if completed.returncode == 0 else "failed", detail, completed.returncode)


def execute_contract_job(path: Path, workflow: dict[str, object]) -> list[Execution]:
    commands = run_commands(job(workflow, "contract"))
    executions: list[Execution] = []
    with tempfile.TemporaryDirectory(prefix="ci-workflow-") as temporary:
        worktree = Path(temporary) / "repo"
        shutil.copytree(REPO_ROOT, worktree, ignore=shutil.ignore_patterns("node_modules", ".venv"))
        for command in commands:
            if "actions/" in command or command.startswith("python -m pip install"):
                continue
            execution = execute(command, worktree)
            executions.append(execution)
            if execution.status == "failed":
                break
    return executions


def local_skips(workflow: dict[str, object]) -> list[Execution]:
    skips: list[Execution] = []
    if job(workflow, "api"):
        postgres_ready = all(shutil.which(binary) for binary in ("postgres", "pg_ctl", "initdb"))
        if not postgres_ready:
            skips.append(Execution("api job local execution", "skipped", "local PostgreSQL server binaries unavailable; GitHub Actions service covers this prerequisite"))
    if job(workflow, "web") and os.environ.get("VERIFY_CI_WEB") != "1":
        skips.append(Execution("web job local execution", "skipped", "set VERIFY_CI_WEB=1 to run the warning-failing web gates locally"))
    return skips


def main() -> int:
    arguments = parse_args()
    workflow_path = arguments.workflow if arguments.workflow.is_absolute() else REPO_ROOT / arguments.workflow
    workflow = load_workflow(workflow_path)
    checks = workflow_checks(workflow_path, workflow)
    executions = execute_contract_job(workflow_path, workflow) if arguments.execute_local else []
    executions.extend(local_skips(workflow) if arguments.execute_local and workflow_path.name != "ci-generated-drift.yml" else [])
    checks_ok = all(check.ok for check in checks)
    executions_ok = all(execution.status in {"passed", "skipped"} for execution in executions)
    report = {
        "ok": checks_ok and executions_ok,
        "checks": [asdict(check) for check in checks],
        "executions": [asdict(execution) for execution in executions],
    }
    if arguments.as_json:
        print(json.dumps(report, ensure_ascii=True, sort_keys=True))
    else:
        print("ok" if report["ok"] else "failed")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
