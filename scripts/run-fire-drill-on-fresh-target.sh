#!/usr/bin/env bash
# REDHAT-FIX-S28R2-C1 — Run CAP-BAK-01 fire drill against provisioned fresh-target volumes.
#
# Binds --scratch / --blob-dir to the Docker named-volume Mountpoints for
#   <host>-pgdata  and  <host>-blobs
# (created by provision-fresh-restore-target.sh). Refuses host-only unbound .tmp paths
# when volumes cannot be resolved.
#
# Usage:
#   ./scripts/run-fire-drill-on-fresh-target.sh --host fresh-restore-01 --resolve-only
#   ./scripts/run-fire-drill-on-fresh-target.sh --host fresh-restore-01 \
#       --target-timestamp 2026-07-28T12:00:00Z --attestation /tmp/att.json
#
# Environment:
#   BUN_BIN, HOLO_SECRETS_PATH, DATABASE_URL (passed through to holo restore:fire-drill)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HOST_NAME=""
TARGET_TIMESTAMP=""
ATTESTATION=""
RESOLVE_ONLY=0
REPORT=""
SOURCE_BLOB_ROOT=""
BUN_BIN="${BUN_BIN:-bun}"
HOLO_CLI="${HOLO_CLI:-$ROOT/services/platform/src/cli/holo.ts}"

usage() {
  cat <<'EOF'
Usage: run-fire-drill-on-fresh-target.sh --host <name> [options]

Options:
  --host NAME                 Provisioned fresh-restore target / container name (required)
  --target-timestamp ISO      PITR target for holo restore:fire-drill
  --attestation PATH          Write attestation JSON (volumes + mountpoints)
  --report PATH               parity-report.json output path
  --source-blob-root PATH     Optional pre-failure blob root for fire-drill
  --resolve-only              Resolve volumes + write attestation; do not run fire-drill
  -h, --help                  Show help

Resolves Docker volumes <host>-pgdata and <host>-blobs via `docker volume inspect`
Mountpoint fields. Refuses when volumes are missing/unresolvable.
EOF
}

log() { echo "[run-fire-drill-on-fresh-target] $*"; }
err() { echo "error: $*" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST_NAME="${2:-}"; shift 2 ;;
    --host=*) HOST_NAME="${1#--host=}"; shift ;;
    --target-timestamp) TARGET_TIMESTAMP="${2:-}"; shift 2 ;;
    --target-timestamp=*) TARGET_TIMESTAMP="${1#--target-timestamp=}"; shift ;;
    --attestation) ATTESTATION="${2:-}"; shift 2 ;;
    --attestation=*) ATTESTATION="${1#--attestation=}"; shift ;;
    --report) REPORT="${2:-}"; shift 2 ;;
    --report=*) REPORT="${1#--report=}"; shift ;;
    --source-blob-root) SOURCE_BLOB_ROOT="${2:-}"; shift 2 ;;
    --source-blob-root=*) SOURCE_BLOB_ROOT="${1#--source-blob-root=}"; shift ;;
    --resolve-only) RESOLVE_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      err "unknown argument: $1"
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$HOST_NAME" ]]; then
  err "--host is required"
  usage >&2
  exit 2
fi

VOLUME_PGDATA="${HOST_NAME}-pgdata"
VOLUME_BLOB="${HOST_NAME}-blobs"

if ! command -v docker >/dev/null 2>&1; then
  err "docker binary missing — refuse fresh-target volume resolve"
  exit 2
fi

volume_mountpoint() {
  local vol="$1"
  # Prefer docker volume inspect Mountpoint (host path for local driver).
  local mp
  mp="$(docker volume inspect -f '{{ .Mountpoint }}' "$vol" 2>/dev/null || true)"
  if [[ -n "$mp" && "$mp" != "<no value>" ]]; then
    printf '%s' "$mp"
    return 0
  fi
  return 1
}

container_running() {
  docker inspect -f '{{ .State.Running }}' "$HOST_NAME" 2>/dev/null | grep -qi true
}

# Resolve mountpoints — fail closed when either volume is missing.
SCRATCH_MP=""
BLOB_MP=""
if ! SCRATCH_MP="$(volume_mountpoint "$VOLUME_PGDATA")"; then
  err "volume unresolvable/missing: ${VOLUME_PGDATA} (provision fresh target first)"
  exit 2
fi
if ! BLOB_MP="$(volume_mountpoint "$VOLUME_BLOB")"; then
  err "volume unresolvable/missing: ${VOLUME_BLOB} (provision fresh target first)"
  exit 2
fi

if [[ -z "$SCRATCH_MP" || -z "$BLOB_MP" ]]; then
  err "empty mountpoint for provisioned volumes — refuse unbound host-only paths"
  exit 2
fi

# Refuse known mini live paths even if mis-named volumes somehow point there.
case "$SCRATCH_MP" in
  /opt/homebrew/var/postgresql@18*|/var/lib/postgresql/data|/mnt/mini-pgdata*)
    err "refusing scratch mountpoint that collides with mini PGDATA: $SCRATCH_MP"
    exit 2
    ;;
esac
case "$BLOB_MP" in
  /mnt/mini-blobs*)
    err "refusing blob mountpoint that collides with mini blobs: $BLOB_MP"
    exit 2
    ;;
esac

CONTAINER_STATE="missing"
if docker inspect "$HOST_NAME" >/dev/null 2>&1; then
  if container_running; then
    CONTAINER_STATE="running"
  else
    CONTAINER_STATE="stopped"
  fi
fi

TS_JSON="null"
if [[ -n "$TARGET_TIMESTAMP" ]]; then
  TS_JSON="\"${TARGET_TIMESTAMP}\""
fi
ATTESTATION_BODY="$(cat <<EOF
{
  "ok": true,
  "schema": "holo.fresh-target.fire-drill-attestation.v1",
  "host": "${HOST_NAME}",
  "container": "${HOST_NAME}",
  "container_state": "${CONTAINER_STATE}",
  "volumes": {
    "pgdata": "${VOLUME_PGDATA}",
    "blob": "${VOLUME_BLOB}"
  },
  "mountpoints": {
    "scratch": "${SCRATCH_MP}",
    "blob": "${BLOB_MP}"
  },
  "scratch": "${SCRATCH_MP}",
  "blobDir": "${BLOB_MP}",
  "target_timestamp": ${TS_JSON},
  "resolved_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
)"

if [[ -n "$ATTESTATION" ]]; then
  mkdir -p "$(dirname "$ATTESTATION")"
  printf '%s\n' "$ATTESTATION_BODY" >"$ATTESTATION"
  log "wrote attestation: $ATTESTATION"
fi

log "bound scratch=${SCRATCH_MP}"
log "bound blobDir=${BLOB_MP}"
log "volumes ${VOLUME_PGDATA}, ${VOLUME_BLOB} (container=${CONTAINER_STATE})"

if [[ "$RESOLVE_ONLY" -eq 1 ]]; then
  printf '%s\n' "$ATTESTATION_BODY"
  exit 0
fi

if [[ -z "$TARGET_TIMESTAMP" ]]; then
  err "--target-timestamp required unless --resolve-only"
  exit 2
fi

if [[ ! -f "$HOLO_CLI" ]]; then
  err "holo CLI missing: $HOLO_CLI"
  exit 2
fi

REPORT_PATH="${REPORT:-$ROOT/.tmp/REDHAT-FIX-S28R2/C1/parity-report-${HOST_NAME}.json}"
mkdir -p "$(dirname "$REPORT_PATH")"

ARGS=(
  "$HOLO_CLI"
  restore:fire-drill
  --target-timestamp "$TARGET_TIMESTAMP"
  --scratch "$SCRATCH_MP"
  --blob-dir "$BLOB_MP"
  --report "$REPORT_PATH"
  --fresh-target "$HOST_NAME"
)
if [[ -n "$SOURCE_BLOB_ROOT" ]]; then
  ARGS+=(--source-blob-root "$SOURCE_BLOB_ROOT")
fi

log "running: $BUN_BIN ${ARGS[*]}"
set +e
"$BUN_BIN" "${ARGS[@]}"
STATUS=$?
set -e

# Augment attestation with fire-drill exit.
if [[ -n "$ATTESTATION" ]]; then
  # shellcheck disable=SC2016
  python3 - "$ATTESTATION" "$STATUS" "$REPORT_PATH" <<'PY' 2>/dev/null || true
import json, sys
path, status, report = sys.argv[1], int(sys.argv[2]), sys.argv[3]
try:
    with open(path) as f:
        data = json.load(f)
except Exception:
    data = {}
data["fire_drill_exit"] = status
data["report_path"] = report
data["ok"] = status == 0 and data.get("ok", True)
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
fi

exit "$STATUS"
