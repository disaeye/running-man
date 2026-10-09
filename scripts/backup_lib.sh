#!/usr/bin/env bash

# Interpreter used for the small JSON/revision helpers below.
#
# Resolved rather than hard-coded to `python`: this host provides python3 only,
# and a bare `python` made every backup fail with "command not found" — the
# error surfaced as an assertion in the script tests rather than as a missing
# prerequisite. Honours PYTHON if the caller sets it.
python_bin() {
  if [[ -n "${PYTHON:-}" ]]; then
    printf '%s' "$PYTHON"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    printf 'python3'
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    printf 'python'
    return 0
  fi
  echo "no python interpreter found (set PYTHON)" >&2
  return 1
}

load_database_url() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    return 0
  fi
  if [[ -f apps/api/.env ]]; then
    set -a
    # shellcheck disable=SC1091
    source apps/api/.env
    set +a
  fi
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL is required" >&2
    return 2
  fi
}

require_private_file() {
  local path=$1
  local label=$2
  if [[ -z "$path" || ! -f "$path" ]]; then
    echo "$label file is required" >&2
    return 2
  fi
  local mode
  mode=$(stat -c '%a' "$path")
  if [[ "$mode" != "600" ]]; then
    echo "$label must have 0600 permissions" >&2
    return 2
  fi
}

require_command() {
  local name=$1
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "$name is required" >&2
    return 2
  fi
}

schema_revision() {
  "$(python_bin)" - <<'PY'
from pathlib import Path
import sys

sys.path.insert(0, str(Path("scripts").resolve()))
from fresh_schema_catalog import HEAD_REVISION

print(HEAD_REVISION)
PY
}

json_escape() {
  "$(python_bin)" -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"
}

file_size() {
  stat -c '%s' "$1"
}

file_sha256() {
  sha256sum "$1" | cut -d' ' -f1
}

remote_join() {
  local remote=$1
  local name=$2
  if [[ "$remote" == */ ]]; then
    printf '%s%s' "$remote" "$name"
  else
    printf '%s/%s' "$remote" "$name"
  fi
}

verify_remote_object() {
  local remote_path=$1
  local expected_size=$2
  local expected_sha=$3
  local size_json actual_size actual_sha
  size_json=$(rclone size --json "$remote_path")
  actual_size=$("$(python_bin)" -c 'import json,sys; print(json.load(sys.stdin)["bytes"])' <<<"$size_json")
  if [[ "$actual_size" != "$expected_size" ]]; then
    echo "remote size verification failed" >&2
    return 1
  fi
  actual_sha=$(rclone hashsum SHA-256 "$remote_path" | awk '{print $1}')
  if [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "remote hash verification failed" >&2
    return 1
  fi
}

write_manifest() {
  local path=$1
  local ciphertext_remote=$2
  local ciphertext_sha=$3
  local ciphertext_size=$4
  local revision=$5
  local created_at=$6
  cat >"$path" <<JSON
{
  "ciphertext_remote": $(json_escape "$ciphertext_remote"),
  "ciphertext_sha256": "$ciphertext_sha",
  "ciphertext_size_bytes": $ciphertext_size,
  "created_at": "$created_at",
  "format": "running-man-age-v1",
  "schema_revision": "$revision"
}
JSON
}
