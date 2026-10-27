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
PG_DUMP_PID=""
# SIGINT must be handled by this script, not by the blocking pg_dump.
# A background job inherits SIGINT as ignored, so the dump keeps running after
# the interrupt and cleanup has to terminate it — together with every
# descendant it spawned. Job control gives the dump its own process group, so
# the group kill also covers descendants forked after the snapshot was taken.
dump_descendants() {
  local parent=$1 child
  for child in $(ps -o pid= --ppid "$parent" 2>/dev/null || true); do
    dump_descendants "$child"
    printf '%s\n' "$child"
  done
}
# Wait for the dump by polling, not by `wait`.
#
# A short `sleep` is interruptible at every step, so the trap fires as soon as
# the signal lands. `wait` blocks inside the kernel until the job ends, which
# delays the trap until the dump finishes.
#
# A signal that was already ignored when this script started cannot be trapped
# or reset: POSIX forbids it for non-interactive shells. A background job in a
# non-interactive shell has SIGINT ignored, and that disposition is inherited
# across exec, so an interrupt never reaches this script in that setting.
# Nothing inside the script can compensate for it.
DUMP_STATUS=0
wait_for_dump() {
  while kill -0 "$PG_DUMP_PID" 2>/dev/null; do
    sleep 0.1
  done
  # The job is gone by now, so this reaps it immediately instead of blocking.
  # Its exit status tells a failed dump from a completed one.
  wait "$PG_DUMP_PID" 2>/dev/null || DUMP_STATUS=$?
  DUMP_STATUS=${DUMP_STATUS:-0}
  PG_DUMP_PID=""
}
cleanup() {
  if [[ -n "${PG_DUMP_PID:-}" ]]; then
    local pid descendants _attempt
    descendants=$(dump_descendants "$PG_DUMP_PID" || true)
    kill -TERM -- "-$PG_DUMP_PID" 2>/dev/null || true
    for pid in $descendants; do
      kill -TERM "$pid" 2>/dev/null || true
    done
    kill -TERM "$PG_DUMP_PID" 2>/dev/null || true
    # Bounded grace period, so a dump that ignores SIGTERM cannot hang the
    # interrupt path.
    for _attempt in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$PG_DUMP_PID" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL -- "-$PG_DUMP_PID" 2>/dev/null || true
    for pid in $descendants; do
      kill -KILL "$pid" 2>/dev/null || true
    done
    kill -KILL "$PG_DUMP_PID" 2>/dev/null || true
    # Reap the dump so no zombie survives the script. The process is dead by
    # now, so this returns at once.
    wait "$PG_DUMP_PID" 2>/dev/null || true
    PG_DUMP_PID=""
  fi
  rm -rf "$TMP_DIR"
}
trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

PLAIN_DUMP="$TMP_DIR/database.sql"
PG_DUMP_ERR="$TMP_DIR/pg_dump.err"
CIPHERTEXT="$TMP_DIR/database.sql.age"
MANIFEST="$TMP_DIR/manifest.json"
BASE_NAME="running-man_${TIMESTAMP}.sql.age"
REMOTE_CIPHER=$(remote_join "$RCLONE_REMOTE" "$BASE_NAME")
REMOTE_MANIFEST=$(remote_join "$RCLONE_REMOTE" "${BASE_NAME}.manifest.json")

# Job control puts the dump in its own process group so cleanup can kill the
# whole tree. The dump's stderr is captured inside $TMP_DIR (and replayed on
# failure) so a surviving descendant can never hold the caller's stderr pipe.
set -m
pg_dump "$DATABASE_URL" >"$PLAIN_DUMP" 2>"$PG_DUMP_ERR" &
PG_DUMP_PID=$!
set +m
wait_for_dump
if [[ "$DUMP_STATUS" -ne 0 ]]; then
  cat "$PG_DUMP_ERR" >&2 || true
  cleanup
  exit 1
fi
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
