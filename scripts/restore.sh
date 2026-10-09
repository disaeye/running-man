#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/backup_lib.sh"

TEST_DB_URL=${TEST_DATABASE_URL:?TEST_DATABASE_URL not set}

restore_plain() {
  local backup_file=$1
  psql -v ON_ERROR_STOP=1 "$TEST_DB_URL" <"$backup_file" >/dev/null
  echo "Restore completed"
}

if [[ "${1:-}" != "--encrypted-offsite" ]]; then
  BACKUP_FILE=${1:?Usage: restore.sh [--encrypted-offsite <manifest_remote>] <backup_file>}
  restore_plain "$BACKUP_FILE"
  exit 0
fi

MANIFEST_REMOTE=${2:?Usage: restore.sh --encrypted-offsite <manifest_remote>}
require_command age
require_command rclone
require_command psql
require_private_file "${RCLONE_CONFIG:-}" RCLONE_CONFIG
require_private_file "${BACKUP_AGE_IDENTITY_FILE:-}" BACKUP_AGE_IDENTITY_FILE

TMP_DIR=$(mktemp -d "${RESTORE_TMPDIR:-/tmp}/running-man-restore.XXXXXX")
chmod 700 "$TMP_DIR"
cleanup() { rm -rf "$TMP_DIR"; }
trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

MANIFEST="$TMP_DIR/manifest.json"
CIPHERTEXT="$TMP_DIR/database.sql.age"
PLAIN_DUMP="$TMP_DIR/database.sql"

rclone copyto "$MANIFEST_REMOTE" "$MANIFEST"
readarray -t FIELDS < <("$(python_bin)" "$ROOT_DIR/scripts/restore_manifest.py" "$MANIFEST")
CIPHER_REMOTE=${FIELDS[0]}
EXPECTED_SHA=${FIELDS[1]}
EXPECTED_SIZE=${FIELDS[2]}
EXPECTED_REVISION=${FIELDS[3]}

rclone copyto "$CIPHER_REMOTE" "$CIPHERTEXT"
ACTUAL_SIZE=$(file_size "$CIPHERTEXT")
ACTUAL_SHA=$(file_sha256 "$CIPHERTEXT")
if [[ "$ACTUAL_SIZE" != "$EXPECTED_SIZE" || "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  echo "ciphertext verification failed" >&2
  exit 1
fi

age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" --output "$PLAIN_DUMP" "$CIPHERTEXT"
restore_plain "$PLAIN_DUMP"
rm -f "$PLAIN_DUMP"
uv run --project "$ROOT_DIR/apps/api" python "$ROOT_DIR/scripts/verify_schema_lifecycle.py" \
  --database-url "$TEST_DB_URL" --expected-revision "$EXPECTED_REVISION" --json >/dev/null
