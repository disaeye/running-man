#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/backup_lib.sh"

ENCRYPTED_OFFSITE=0
if [[ "${1:-}" == "--encrypted-offsite" ]]; then
  ENCRYPTED_OFFSITE=1
  shift
elif [[ $# -gt 0 ]]; then
  echo "Usage: scripts/backup.sh [--encrypted-offsite]" >&2
  exit 2
fi

cd "$ROOT_DIR"
load_database_url

TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [[ "$ENCRYPTED_OFFSITE" -eq 0 ]]; then
  BACKUP_DIR="backups"
  BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql"
  mkdir -p "$BACKUP_DIR"
  pg_dump "$DATABASE_URL" >"$BACKUP_FILE"
  echo "Backup saved to $BACKUP_FILE"
  exit 0
fi

require_command pg_dump
require_command age
require_command rclone
require_private_file "${RCLONE_CONFIG:-}" RCLONE_CONFIG
require_private_file "${BACKUP_AGE_RECIPIENTS_FILE:-}" BACKUP_AGE_RECIPIENTS_FILE
if [[ -z "${RCLONE_REMOTE:-}" ]]; then
  echo "RCLONE_REMOTE is required" >&2
  exit 2
fi

TMP_DIR=$(mktemp -d "${BACKUP_TMPDIR:-/tmp}/running-man-backup.XXXXXX")
chmod 700 "$TMP_DIR"
cleanup() { rm -rf "$TMP_DIR"; }
trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

PLAIN_DUMP="$TMP_DIR/database.sql"
CIPHERTEXT="$TMP_DIR/database.sql.age"
MANIFEST="$TMP_DIR/manifest.json"
BASE_NAME="running-man_${TIMESTAMP}.sql.age"
REMOTE_CIPHER=$(remote_join "$RCLONE_REMOTE" "$BASE_NAME")
REMOTE_MANIFEST=$(remote_join "$RCLONE_REMOTE" "${BASE_NAME}.manifest.json")

pg_dump "$DATABASE_URL" >"$PLAIN_DUMP"
age --encrypt --recipients-file "$BACKUP_AGE_RECIPIENTS_FILE" --output "$CIPHERTEXT" "$PLAIN_DUMP"
rm -f "$PLAIN_DUMP"

CIPHER_SIZE=$(file_size "$CIPHERTEXT")
CIPHER_SHA=$(file_sha256 "$CIPHERTEXT")
REVISION=$(schema_revision)
write_manifest "$MANIFEST" "$REMOTE_CIPHER" "$CIPHER_SHA" "$CIPHER_SIZE" "$REVISION" "$CREATED_AT"

rclone copyto "$CIPHERTEXT" "$REMOTE_CIPHER"
verify_remote_object "$REMOTE_CIPHER" "$CIPHER_SIZE" "$CIPHER_SHA"
rclone copyto "$MANIFEST" "$REMOTE_MANIFEST"
echo "Encrypted offsite backup manifest: $REMOTE_MANIFEST"
