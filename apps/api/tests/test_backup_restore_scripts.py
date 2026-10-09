from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest

pytestmark = pytest.mark.no_db

ROOT = Path(__file__).resolve().parents[3]


def test_encrypted_backup_uploads_ciphertext_manifest_and_verifies_remote(tmp_path: Path) -> None:
    env = fixture_env(tmp_path)
    result = subprocess.run(
        ["bash", "scripts/backup.sh", "--encrypted-offsite"],
        cwd=ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    remote = tmp_path / "remote"
    ciphertext = next(remote.glob("*.sql.age"))
    manifest = Path(f"{ciphertext}.manifest.json")
    payload = json.loads(manifest.read_text(encoding="utf-8"))
    assert set(payload) == {
        "ciphertext_remote",
        "ciphertext_sha256",
        "ciphertext_size_bytes",
        "created_at",
        "format",
        "schema_revision",
    }
    assert payload["schema_revision"] == head_revision()
    assert "DATABASE_URL" not in manifest.read_text(encoding="utf-8")
    assert not list((tmp_path / "tmp").glob("running-man-backup.*"))


def test_upload_failure_exits_nonzero_without_manifest(tmp_path: Path) -> None:
    env = fixture_env(tmp_path)
    env["RCLONE_FAIL_COPYTO"] = "1"
    result = subprocess.run(
        ["bash", "scripts/backup.sh", "--encrypted-offsite"],
        cwd=ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert not list((tmp_path / "remote").glob("*.manifest.json"))
    assert not list((tmp_path / "tmp").glob("running-man-backup.*"))


def test_sigint_cleanup_leaves_no_plaintext_or_remote_mutation(tmp_path: Path) -> None:
    env = fixture_env(tmp_path)
    env["PG_DUMP_BLOCK"] = "1"
    proc = subprocess.Popen(
        ["bash", "scripts/backup.sh", "--encrypted-offsite"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
        text=True,
    )
    ready = tmp_path / "pg_dump.ready"
    deadline = time.monotonic() + 5
    while not ready.exists() and time.monotonic() < deadline:
        time.sleep(0.05)
    assert ready.exists()
    os.killpg(proc.pid, signal.SIGINT)
    stdout, stderr = proc.communicate(timeout=5)
    assert proc.returncode in {130, -signal.SIGINT}, stdout + stderr
    assert not list((tmp_path / "tmp").glob("running-man-backup.*"))
    assert not list((tmp_path / "remote").iterdir())


def test_restore_downloads_verifies_decrypts_and_runs_lifecycle_verifier(tmp_path: Path) -> None:
    env = fixture_env(tmp_path)
    remote = tmp_path / "remote"
    ciphertext = remote / "backup.sql.age"
    ciphertext.write_text("ciphertext", encoding="utf-8")
    manifest = remote / "backup.sql.age.manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "ciphertext_remote": "fixture:backup.sql.age",
                "ciphertext_sha256": sha256(ciphertext),
                "ciphertext_size_bytes": ciphertext.stat().st_size,
                "created_at": "2026-07-15T00:00:00Z",
                "format": "running-man-age-v1",
                "schema_revision": head_revision(),
            }
        ),
        encoding="utf-8",
    )
    result = subprocess.run(
        ["bash", "scripts/restore.sh", "--encrypted-offsite", "fixture:backup.sql.age.manifest.json"],
        cwd=ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert (tmp_path / "psql.stdin").read_text(encoding="utf-8") == "plain dump\n"
    assert f"--expected-revision {head_revision()}" in (tmp_path / "uv.args").read_text(
        encoding="utf-8"
    )
    assert not list((tmp_path / "tmp").glob("running-man-restore.*"))


def fixture_env(tmp_path: Path) -> dict[str, str]:
    bin_dir = tmp_path / "bin"
    remote = tmp_path / "remote"
    temp_root = tmp_path / "tmp"
    for directory in (bin_dir, remote, temp_root):
        directory.mkdir()
    write_fake_commands(bin_dir, tmp_path)
    rclone_config = tmp_path / "rclone.conf"
    recipients = tmp_path / "recipients.txt"
    identity = tmp_path / "identity.txt"
    for file_path, content in ((rclone_config, "config"), (recipients, "age1test"), (identity, "AGE-SECRET-KEY-test")):
        file_path.write_text(content, encoding="utf-8")
        file_path.chmod(0o600)
    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{bin_dir}:{env['PATH']}",
            "DATABASE_URL": "postgresql://user:secret@example.invalid/db",
            "TEST_DATABASE_URL": "postgresql://postgres@example.invalid/test_schema",
            "RCLONE_CONFIG": str(rclone_config),
            "BACKUP_AGE_RECIPIENTS_FILE": str(recipients),
            "BACKUP_AGE_IDENTITY_FILE": str(identity),
            "RCLONE_REMOTE": "fixture:",
            "BACKUP_TMPDIR": str(temp_root),
            "RESTORE_TMPDIR": str(temp_root),
            "FIXTURE_REMOTE_DIR": str(remote),
            "FIXTURE_STATE_DIR": str(tmp_path),
        }
    )
    return env


def write_fake_commands(bin_dir: Path, state: Path) -> None:
    scripts = {
        "pg_dump": f"""#!/usr/bin/env bash
if [[ "${{PG_DUMP_BLOCK:-}}" == "1" ]]; then
  printf plain
  touch "{state}/pg_dump.ready"
  sleep 30
else
  printf 'plain dump\\n'
fi
""",
        "age": """#!/usr/bin/env bash
if [[ "$1" == "--encrypt" ]]; then
  output=""; input=""
  while [[ $# -gt 0 ]]; do
    case "$1" in --output) output=$2; shift 2;; --recipients-file) shift 2;; *) input=$1; shift;; esac
  done
  printf ciphertext >"$output"
else
  output=""
  while [[ $# -gt 0 ]]; do
    case "$1" in --output) output=$2; shift 2;; --identity) shift 2;; *) shift;; esac
  done
  printf 'plain dump\n' >"$output"
fi
""",
        "rclone": """#!/usr/bin/env bash
set -euo pipefail
remote_path() { printf '%s/%s' "$FIXTURE_REMOTE_DIR" "${1#fixture:}"; }
case "$1" in
  copyto)
    if [[ "${RCLONE_FAIL_COPYTO:-}" == "1" ]]; then exit 23; fi
    src=$2; dst=$3
    if [[ "$src" == fixture:* ]]; then cp "$(remote_path "$src")" "$dst"; else cp "$src" "$(remote_path "$dst")"; fi
    ;;
  size)
    target=${@: -1}; bytes=$(stat -c '%s' "$(remote_path "$target")"); printf '{"bytes":%s}\n' "$bytes"
    ;;
  hashsum)
    target=$3; sha256sum "$(remote_path "$target")"
    ;;
esac
""",
        "psql": f"""#!/usr/bin/env bash
cat >"{state}/psql.stdin"
""",
        "uv": f"""#!/usr/bin/env bash
printf '%s ' "$@" >"{state}/uv.args"
""",
    }
    for name, content in scripts.items():
        path = bin_dir / name
        path.write_text(content, encoding="utf-8")
        path.chmod(0o755)


def sha256(path: Path) -> str:
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()


def head_revision() -> str:
    result = subprocess.run(
        [sys.executable, "-c", "import sys; sys.path.insert(0, 'scripts'); from fresh_schema_catalog import HEAD_REVISION; print(HEAD_REVISION)"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()
