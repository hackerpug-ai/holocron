#!/usr/bin/env bash
# REDHAT-FIX-S28R2-C1 / GATE-FIX-S28R3-QA1 — Run CAP-BAK-01 fire drill against
# provisioned fresh-target volumes via a host-accessible execution path.
#
# Resolves host-writable destinations for:
#   <host>-pgdata  and  <host>-blobs
# Prefer (in order):
#   1) Docker Mountpoint when host-writable (Linux native Docker)
#   2) volume Options.device bind path when host-writable (Colima/Desktop bind-backed)
#   3) paths.txt host_staging_pgdata / host_staging_blob when volumes exist
#
# NEVER falls back to unbound .tmp/REDHAT-FIX-H2/step3-* .
# NEVER passes inaccessible /var/lib/docker/volumes/... paths to host Bun.
#
# Usage:
#   ./scripts/run-fire-drill-on-fresh-target.sh --host fresh-restore-01 --resolve-only
#   ./scripts/run-fire-drill-on-fresh-target.sh --host fresh-restore-01 \
#       --target-timestamp 2026-07-28T12:00:00Z --attestation /tmp/att.json
#
# Environment:
#   BUN_BIN, HOLO_SECRETS_PATH (secrets file + env; env overrides file per key)
#   STAGING_ROOT (optional hint for paths.txt lookup)
#   R2_RESTORE_ACCESS_KEY_ID / R2_RESTORE_SECRET_ACCESS_KEY — REQUIRED for full fire-drill
#     (mapped to R2_ACCESS_* in a minimal child env; ambient writer keys stripped).
#     Missing/equal-to-writer/placeholder → DEPENDENCY-S28-R2-RO
#     Writer + restore identities resolved from the SAME secrets source before compare
#     (file-only equal writer/restore still refused when env lacks writer keys).
#   DATABASE_URL / PG* — NEVER forwarded to the fire-drill child (fresh-target: baseline only)
#   HOLO_FIRE_DRILL_ENV_DUMP — optional path; writes redacted key inventory (no raw secrets)
#   HOLO_CLI — override CLI path (ts via bun, or injectable recorder script)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# GATE-FIX-S28R3-QA13 shared live provider helpers
# shellcheck source=scripts/lib/r2-ro-live.sh
source "$ROOT/scripts/lib/r2-ro-live.sh"
# GATE-FIX-S28R3-QA14: production refuses test/CLI seams.
if [[ -n "${HOLO_FIRE_DRILL_FAKE_VOLUMES:-}" ]]; then
  echo "error: GATE-FIX-S28R3-QA14 refuses HOLO_FIRE_DRILL_FAKE_VOLUMES in production (harness-only)" >&2
  exit 2
fi
if [[ -n "${HOLO_QA_PROOF_MUTATE:-}" ]]; then
  echo "error: GATE-FIX-S28R3-QA14 refuses HOLO_QA_PROOF_MUTATE in production" >&2
  exit 2
fi

HOST_NAME=""
TARGET_TIMESTAMP=""
ATTESTATION=""
RESOLVE_ONLY=0
REPORT=""
SOURCE_BLOB_ROOT=""
# GATE-FIX-S28R3-QA17: refuse ambient BUN_BIN; fixed absolute candidates only.
if [[ -n "${BUN_BIN:-}" ]]; then
  echo "error: GATE-FIX-S28R3-QA17 refuses ambient BUN_BIN (fixed absolute runtime only)" >&2
  exit 2
fi
BUN_BIN=""
for _cand in /opt/homebrew/bin/bun /usr/local/bin/bun; do
  if [[ -x "$_cand" ]]; then BUN_BIN="$_cand"; break; fi
done
# Bun resolved above; hard-fail only when invoking TypeScript CLI (below).
HOLO_CLI="$ROOT/services/platform/src/cli/holo.ts"

usage() {
  cat <<'EOF'
Usage: run-fire-drill-on-fresh-target.sh --host <name> [options]

Options:
  --host NAME                 Provisioned fresh-restore target / container name (required)
  --target-timestamp ISO      PITR target for holo restore:fire-drill
  --attestation PATH          Write attestation JSON (volumes + mountpoints + host_execution)
  --report PATH               parity-report.json output path
  --source-blob-root PATH     REFUSED on fresh-target (baseline-only; GATE-FIX-S28R3-QA4/C-1)
  --resolve-only              Resolve volumes + write attestation; do not run fire-drill
  -h, --help                  Show help

Resolves Docker volumes <host>-pgdata and <host>-blobs to a host-accessible path
(Mountpoint if writable, else Options.device bind, else paths.txt host_staging).
Refuses when volumes are missing/unresolvable or only daemon-inaccessible paths exist.
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

# GATE-FIX-S28R3-QA4 / C-1: fresh-target runner is baseline-only — refuse live pre-failure roots early.
if [[ -n "$SOURCE_BLOB_ROOT" ]]; then
  err "fresh-target refuses --source-blob-root (baseline-only blob parity; GATE-FIX-S28R3-QA4/C-1): $SOURCE_BLOB_ROOT"
  exit 2
fi

if [[ -z "$HOST_NAME" ]]; then
  err "--host is required"
  usage >&2
  exit 2
fi

VOLUME_PGDATA="${HOST_NAME}-pgdata"
VOLUME_BLOB="${HOST_NAME}-blobs"
CONTAINER_PGDATA="/var/lib/postgresql/restore"
CONTAINER_BLOB="/var/lib/holocron/blob-restore"

# ── Identity helpers (also used early for non-resolve-only — GATE-FIX-S28R3-QA9/M2) ──
is_placeholder_restore_key() {
  local v="${1:-}"
  case "$v" in
    ''|ro-test|ro-test-*|*ro-test*|*placeholder*|*replace-me*|*example*|*not-for-prod*|*test-key*|*test-secret*)
      return 0
      ;;
  esac
  return 1
}

r2_tuple_fp16() {
  r2_ro_tuple_fp16 "${1:-}" "${2:-}" "${3:-}"
}

# Resolve writer + restore (+ shared R2 config) from secrets file then env override.
# Sets: WRITER_AK, WRITER_SK, RESTORE_AK, RESTORE_SK, RESTORE_ST
resolve_r2_identities_from_secrets_and_env() {
  local secrets="${HOLOCRON_SECRETS_PATH:-${HOLO_SECRETS_PATH:-$ROOT/services/platform/config/secrets.yaml}}"
  local file_writer_ak="" file_writer_sk=""
  local file_restore_ak="" file_restore_sk="" file_restore_st=""
  local line k v

  if [[ -f "$secrets" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ "$line" =~ ^[[:space:]]*# ]] && continue
      [[ "$line" =~ ^([A-Za-z0-9_]+):[[:space:]]*(.*)$ ]] || continue
      k="${BASH_REMATCH[1]}"
      v="${BASH_REMATCH[2]}"
      v="${v%\"}"; v="${v#\"}"
      v="${v%\'}"; v="${v#\'}"
      case "$k" in
        R2_ACCESS_KEY_ID) file_writer_ak="$v" ;;
        R2_SECRET_ACCESS_KEY) file_writer_sk="$v" ;;
        R2_RESTORE_ACCESS_KEY_ID) file_restore_ak="$v" ;;
        R2_RESTORE_SECRET_ACCESS_KEY) file_restore_sk="$v" ;;
        R2_RESTORE_SESSION_TOKEN) file_restore_st="$v" ;;
        # GATE-FIX-S28R3-QA10 / M1: never auto-export writer R2_SESSION_TOKEN into restore path.
        R2_ENDPOINT|R2_ACCOUNT_ID|R2_BUCKET_NAME|R2_PGBACKREST_PREFIX|R2_RESTORE_OBJECT_PREFIX|R2_RESTIC_PREFIX)
          if [[ -z "${!k:-}" && -n "$v" ]]; then export "$k=$v"; fi
          ;;
      esac
    done <"$secrets"
  fi

  if [[ -n "${R2_ACCESS_KEY_ID:-}" ]]; then
    WRITER_AK="$R2_ACCESS_KEY_ID"
  else
    WRITER_AK="$file_writer_ak"
  fi
  if [[ -n "${R2_SECRET_ACCESS_KEY:-}" ]]; then
    WRITER_SK="$R2_SECRET_ACCESS_KEY"
  else
    WRITER_SK="$file_writer_sk"
  fi
  if [[ -n "${R2_RESTORE_ACCESS_KEY_ID:-}" ]]; then
    RESTORE_AK="$R2_RESTORE_ACCESS_KEY_ID"
  else
    RESTORE_AK="$file_restore_ak"
  fi
  if [[ -n "${R2_RESTORE_SECRET_ACCESS_KEY:-}" ]]; then
    RESTORE_SK="$R2_RESTORE_SECRET_ACCESS_KEY"
  else
    RESTORE_SK="$file_restore_sk"
  fi
  # GATE-FIX-S28R3-QA10 / M1: restore session token precedence —
  #   1) explicit env R2_RESTORE_SESSION_TOKEN
  #   2) canonical-file R2_RESTORE_SESSION_TOKEN
  # Never substitute writer/generic R2_SESSION_TOKEN (env or file).
  if [[ -n "${R2_RESTORE_SESSION_TOKEN:-}" ]]; then
    RESTORE_ST="$R2_RESTORE_SESSION_TOKEN"
  else
    RESTORE_ST="$file_restore_st"
  fi
  if [[ -n "$RESTORE_AK" ]]; then
    export R2_RESTORE_ACCESS_KEY_ID="$RESTORE_AK"
  fi
  if [[ -n "$RESTORE_SK" ]]; then
    export R2_RESTORE_SECRET_ACCESS_KEY="$RESTORE_SK"
  fi
  if [[ -n "$RESTORE_ST" ]]; then
    export R2_RESTORE_SESSION_TOKEN="$RESTORE_ST"
  fi
  # Ensure generic writer session is not left as the restore session.
  unset R2_SESSION_TOKEN 2>/dev/null || true
}

r2_context_fp16() {
  r2_ro_fp16_fields "${1:-}" "${2:-}" "${3:-}" "${4:-}"
}

assert_bound_r2_ro_proof() {
  if ! r2_ro_init_trusted_helpers; then
    err "GATE-FIX-S28R3-QA14 trusted helper chain failed"
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi

  # GATE-FIX-S28R3-QA13: fixed prover + trusted AWS independent of PATH;
  # canonical context; exclusive private proof; consumer-level validation.
  local rak="$1" rsk="$2" rst="$3"
  local expected_fp expected_ctx proof prove_cmd established
  local ep bucket prefix kind policy
  if [[ -n "${HOLO_PROVE_R2_READONLY:-}" ]]; then
    echo "error: GATE-FIX-S28R3-QA11/12 refuses HOLO_PROVE_R2_READONLY override in live mode (fixed prover only)" >&2
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
  # Build/establish canonical context (reject empty/alternate policy & bad prefix).
  if ! established="$(r2_ro_establish_canonical_context)"; then
    echo "error: GATE-FIX-S28R3-QA13 canonical context refused before live proof" >&2
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
  ep="$(printf '%s' "$established" | awk -F'\t' '{print $1}')"
  bucket="$(printf '%s' "$established" | awk -F'\t' '{print $2}')"
  prefix="$(printf '%s' "$established" | awk -F'\t' '{print $3}')"
  kind="$(printf '%s' "$established" | awk -F'\t' '{print $4}')"
  policy="$(printf '%s' "$established" | awk -F'\t' '{print $5}')"
  expected_ctx="$(printf '%s' "$established" | awk -F'\t' '{print $6}')"
  expected_fp="$(r2_ro_tuple_fp16 "$rak" "$rsk" "$rst")"
  if [[ -z "$expected_fp" || "${#expected_fp}" -lt 8 || -z "$expected_ctx" || "${#expected_ctx}" -lt 8 ]]; then
    echo "error: GATE-FIX-S28R3-QA13 unable to fingerprint restore tuple/context" >&2
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
  # Private 0700 dir + nonexistent proof name (producer creates exclusively).
  r2_ro_ensure_private_proof_dir >/dev/null || exit 2
  proof="$(r2_ro_new_proof_path)" || exit 2
  prove_cmd="$ROOT/scripts/prove-r2-readonly.sh"
  echo "[assert_bound_r2_ro_proof] GATE-FIX-S28R3-QA13: fresh live RO proof via fixed scripts/prove-r2-readonly.sh + trusted provider (values not logged)"
  if ! "$R2_RO_ENV_BIN" \
    REQUIRE_LIVE_R2_RO=1 \
    HOLO_R2_RO_PROOF_OUT="$proof" \
    HOLO_R2_CONTEXT_FP16="$expected_ctx" \
    R2_RESTORE_ACCESS_KEY_ID="$rak" \
    R2_RESTORE_SECRET_ACCESS_KEY="$rsk" \
    R2_RESTORE_SESSION_TOKEN="$rst" \
    R2_ACCESS_KEY_ID="${AMBIENT_R2_ACCESS_KEY_ID:-${WRITER_AK:-${R2_ACCESS_KEY_ID:-}}}" \
    R2_SECRET_ACCESS_KEY="${AMBIENT_R2_SECRET_ACCESS_KEY:-${WRITER_SK:-${R2_SECRET_ACCESS_KEY:-}}}" \
    R2_ENDPOINT="$ep" \
    R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-}" \
    R2_BUCKET_NAME="$bucket" \
    R2_PGBACKREST_PREFIX="$prefix" \
    R2_RESTORE_OBJECT_PREFIX="$prefix" \
    R2_CREDENTIAL_KIND="$kind" \
    R2_CREDENTIAL_POLICY="$policy" \
    R2_SCOPE_PROBE_IN_KEY="${R2_SCOPE_PROBE_IN_KEY:-}" \
    R2_SCOPE_PROBE_OUT_KEY="${R2_SCOPE_PROBE_OUT_KEY:-}" \
    R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-}" \
    HOLOCRON_SECRETS_PATH="${HOLOCRON_SECRETS_PATH:-}" \
    HOLO_SECRETS_PATH="${HOLO_SECRETS_PATH:-}" \
    HOME="${HOME:-/tmp}" \
    /bin/bash "$prove_cmd"; then
    echo "error: GATE-FIX-S28R3-QA13 fresh live RO proof failed for the exact restore tuple/context" >&2
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    rm -f "$proof" 2>/dev/null || true
    exit 2
  fi
  if ! r2_ro_validate_proof "$proof" "$expected_fp" "$expected_ctx"; then
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
}

assert_restore_credential_tuple() {
  # GATE-FIX-S28R3-QA8/QA9 identity + M1 proof bind. Fail closed.
  WRITER_AK=""
  WRITER_SK=""
  RESTORE_AK=""
  RESTORE_SK=""
  RESTORE_ST=""
  resolve_r2_identities_from_secrets_and_env

  if [[ -z "$RESTORE_AK" || -z "$RESTORE_SK" ]]; then
    err "DEPENDENCY-S28-R2-RO — distinct live R2_RESTORE_* required for fire-drill child env (refuse ambient writer fallback)"
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
  if is_placeholder_restore_key "$RESTORE_AK" || is_placeholder_restore_key "$RESTORE_SK"; then
    err "DEPENDENCY-S28-R2-RO — placeholder R2_RESTORE_* refused for fire-drill child env"
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
  if [[ -n "$WRITER_SK" && "$RESTORE_SK" == "$WRITER_SK" ]]; then
    err "DEPENDENCY-S28-R2-RO — writer-equivalent credential tuple (restore secret equals writer secret after secrets+env resolve)"
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
  if [[ -n "$WRITER_AK" && "$RESTORE_AK" == "$WRITER_AK" ]]; then
    # GATE-FIX-S28R3-QA9 / H1: require writer secret to establish distinctness.
    if [[ -z "$WRITER_SK" ]]; then
      err "DEPENDENCY-S28-R2-RO — GATE-FIX-S28R3-QA9 same parent Access Key ID without authoritative writer secret (cannot establish distinct restore secret)"
      echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
      exit 2
    fi
    if [[ -z "$RESTORE_ST" ]]; then
      err "DEPENDENCY-S28-R2-RO — same parent Access Key ID as writer without non-empty restore session token (incomplete Cloudflare temporary credential tuple)"
      echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
      exit 2
    fi
    log "GATE-FIX-S28R3-QA8/QA9: Cloudflare temporary credential tuple shape accepted (same parent AK; writer secret present; session token present; secret not logged)"
  fi
  # GATE-FIX-S28R3-QA13: establish canonical prefix/policy before live proof.
  local _prefix _bucket
  _prefix="pgbackrest"
  _prefix="${_prefix#/}"; _prefix="${_prefix%/}"
  _bucket="holocron-backup"
  export R2_BUCKET_NAME="$_bucket"
  export R2_RESTORE_OBJECT_PREFIX="$_prefix"
  export R2_PGBACKREST_PREFIX="$_prefix"
  export R2_CREDENTIAL_KIND="object-read-only"
  export R2_CREDENTIAL_POLICY="$(r2_ro_build_canonical_policy_json "$_bucket" "$_prefix")"
  # Bind live denial oracle to exact tuple+context before child consumes it.
  assert_bound_r2_ro_proof "$RESTORE_AK" "$RESTORE_SK" "$RESTORE_ST"
}

# Full fire-drill (not resolve-only): fail-closed credential tuple + proof binding
# BEFORE volume resolve so unit tests can exercise identity without Docker (QA9/M2).
if [[ "$RESOLVE_ONLY" -eq 0 ]]; then
  assert_restore_credential_tuple
fi

# GATE-FIX-S28R3-QA17: fake-volume implementation removed from production (harness-only).
if [[ -n "${HOLO_FIRE_DRILL_FAKE_VOLUMES:-}" ]]; then
  err "GATE-FIX-S28R3-QA17 refuses HOLO_FIRE_DRILL_FAKE_VOLUMES in production (harness-only)"
  exit 2
fi
SKIP_DOCKER_VOLUME_RESOLVE=0

if [[ "$SKIP_DOCKER_VOLUME_RESOLVE" -eq 0 ]] && ! command -v docker >/dev/null 2>&1; then
  err "docker binary missing — refuse fresh-target volume resolve"
  exit 2
fi

volume_exists() {
  local vol="$1"
  docker volume inspect "$vol" >/dev/null 2>&1
}

volume_mountpoint() {
  local vol="$1"
  local mp
  mp="$(docker volume inspect -f '{{ .Mountpoint }}' "$vol" 2>/dev/null || true)"
  if [[ -n "$mp" && "$mp" != "<no value>" ]]; then
    printf '%s' "$mp"
    return 0
  fi
  return 1
}

volume_bind_device() {
  local vol="$1"
  local device
  # docker volume inspect template for Options.device (bind-backed local volumes)
  device="$(docker volume inspect -f '{{ if .Options }}{{ index .Options "device" }}{{ end }}' "$vol" 2>/dev/null || true)"
  if [[ -n "$device" && "$device" != "<no value>" ]]; then
    printf '%s' "$device"
    return 0
  fi
  return 1
}

# True when path exists (or can be created) and host can create a file there.
host_writable() {
  local p="${1:-}"
  [[ -n "$p" && "$p" != "<no value>" && "$p" != "<nil>" ]] || return 1
  # Refuse known unbound H2 step3 destinations even if writable.
  case "$p" in
    */.tmp/REDHAT-FIX-H2/step3-*|.tmp/REDHAT-FIX-H2/step3-*)
      return 1
      ;;
  esac
  if [[ ! -d "$p" ]]; then
    mkdir -p "$p" 2>/dev/null || return 1
  fi
  local probe="${p}/.holo-write-probe-$$"
  if touch "$probe" 2>/dev/null; then
    rm -f "$probe" 2>/dev/null || true
    return 0
  fi
  return 1
}

find_paths_txt() {
  local host="$1"
  local candidates=()
  if [[ -n "${STAGING_ROOT:-}" ]]; then
    candidates+=("${STAGING_ROOT}/${host}/paths.txt")
    case "${STAGING_ROOT}" in
      /*) ;;
      *) candidates+=("${ROOT}/${STAGING_ROOT}/${host}/paths.txt") ;;
    esac
  fi
  candidates+=(
    "${ROOT}/.tmp/fresh-restore/${host}/paths.txt"
    "${ROOT}/.tmp/REDHAT-FIX-S28R3/fresh-restore/${host}/paths.txt"
    "${ROOT}/.tmp/GATE-FIX-S28R3-QA1/fresh-restore/${host}/paths.txt"
    "${ROOT}/.tmp/REDHAT-FIX-S28R2/C1/staging/${host}/paths.txt"
  )
  local c
  for c in "${candidates[@]}"; do
    if [[ -f "$c" ]]; then
      printf '%s' "$c"
      return 0
    fi
  done
  # Last-resort: scan shallow .tmp/*/fresh-restore/<host>/paths.txt
  local found
  found="$(find "${ROOT}/.tmp" -maxdepth 4 -type f -path "*/fresh-restore/${host}/paths.txt" 2>/dev/null | head -1 || true)"
  if [[ -n "$found" && -f "$found" ]]; then
    printf '%s' "$found"
    return 0
  fi
  return 1
}

read_paths_txt_field() {
  local file="$1"
  local key="$2"
  local line val
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | head -1 || true)"
  val="${line#${key}=}"
  if [[ -n "$val" ]]; then
    printf '%s' "$val"
    return 0
  fi
  return 1
}

# Resolve host-accessible execution path for a volume.
# Prints: <exec_path>\t<mode>\t<daemon_mountpoint>
# mode: host-mountpoint | host-bind-device | host-staging-bind
resolve_host_exec() {
  local vol="$1"
  local role="$2" # pgdata|blob
  local daemon_mp="" device="" staging="" paths_file="" mode="" exec_path=""

  if ! volume_exists "$vol"; then
    err "volume unresolvable/missing: ${vol} (provision fresh target first)"
    return 1
  fi

  daemon_mp="$(volume_mountpoint "$vol" || true)"
  device="$(volume_bind_device "$vol" || true)"

  # 1) Mountpoint when host-writable
  if [[ -n "$daemon_mp" ]] && host_writable "$daemon_mp"; then
    exec_path="$daemon_mp"
    mode="host-mountpoint"
    printf '%s\t%s\t%s' "$exec_path" "$mode" "$daemon_mp"
    return 0
  fi

  # 2) Options.device (bind-backed) when host-writable
  if [[ -n "$device" ]] && host_writable "$device"; then
    exec_path="$device"
    mode="host-bind-device"
    printf '%s\t%s\t%s' "$exec_path" "$mode" "${daemon_mp:-}"
    return 0
  fi

  # 3) paths.txt host_staging_* when volumes exist
  if paths_file="$(find_paths_txt "$HOST_NAME")"; then
    if [[ "$role" == "pgdata" ]]; then
      staging="$(read_paths_txt_field "$paths_file" "host_staging_pgdata" || true)"
    else
      staging="$(read_paths_txt_field "$paths_file" "host_staging_blob" || true)"
    fi
    if [[ -n "$staging" ]] && host_writable "$staging"; then
      # Prefer absolute
      case "$staging" in
        /*) ;;
        *) staging="$(cd "$ROOT" && mkdir -p "$staging" && cd "$staging" && pwd)" ;;
      esac
      exec_path="$staging"
      mode="host-staging-bind"
      printf '%s\t%s\t%s' "$exec_path" "$mode" "${daemon_mp:-}"
      return 0
    fi
  fi

  err "no host-accessible execution path for volume ${vol}"
  err "  daemon_mountpoint=${daemon_mp:-none} (not host-writable)"
  err "  bind_device=${device:-none}"
  err "  refuse unbound host-only .tmp/REDHAT-FIX-H2/step3-* fallback"
  err "  refuse passing inaccessible /var/lib/docker paths to host Bun"
  return 1
}

container_running() {
  docker inspect -f '{{ .State.Running }}' "$HOST_NAME" 2>/dev/null | grep -qi true
}

# Resolve both volumes — fail closed when either cannot be host-bound.
# Skipped when HOLO_FIRE_DRILL_FAKE_VOLUMES=1 (GATE-FIX-S28R3-QA10 recorder unit path).
if [[ "${SKIP_DOCKER_VOLUME_RESOLVE:-0}" -eq 0 ]]; then
if ! volume_exists "$VOLUME_PGDATA"; then
  err "volume unresolvable/missing: ${VOLUME_PGDATA} (provision fresh target first)"
  exit 2
fi
if ! volume_exists "$VOLUME_BLOB"; then
  err "volume unresolvable/missing: ${VOLUME_BLOB} (provision fresh target first)"
  exit 2
fi

SCRATCH_LINE=""
BLOB_LINE=""
if ! SCRATCH_LINE="$(resolve_host_exec "$VOLUME_PGDATA" "pgdata")"; then
  exit 2
fi
if ! BLOB_LINE="$(resolve_host_exec "$VOLUME_BLOB" "blob")"; then
  exit 2
fi

IFS=$'\t' read -r SCRATCH_MP EXEC_MODE_SCRATCH DAEMON_SCRATCH_MP <<<"$SCRATCH_LINE"
IFS=$'\t' read -r BLOB_MP EXEC_MODE_BLOB DAEMON_BLOB_MP <<<"$BLOB_LINE"

# Prefer a single execution_mode label (blob should match scratch in normal provision).
EXECUTION_MODE="$EXEC_MODE_SCRATCH"
if [[ "$EXEC_MODE_BLOB" != "$EXEC_MODE_SCRATCH" ]]; then
  EXECUTION_MODE="${EXEC_MODE_SCRATCH}+${EXEC_MODE_BLOB}"
fi

if [[ -z "$SCRATCH_MP" || -z "$BLOB_MP" ]]; then
  err "empty host execution path for provisioned volumes — refuse unbound host-only paths"
  exit 2
fi

# Refuse known mini live paths even if mis-named volumes somehow point there.
case "$SCRATCH_MP" in
  /opt/homebrew/var/postgresql@18*|/var/lib/postgresql/data|/mnt/mini-pgdata*)
    err "refusing scratch path that collides with mini PGDATA: $SCRATCH_MP"
    exit 2
    ;;
  */.tmp/REDHAT-FIX-H2/step3-*|.tmp/REDHAT-FIX-H2/step3-*)
    err "refuse unbound host-only REDHAT-FIX-H2/step3 path as volume destination: $SCRATCH_MP"
    exit 2
    ;;
  /var/lib/docker/*)
    # Only allowed when host_writable already proved (Linux native Docker).
    if ! host_writable "$SCRATCH_MP"; then
      err "refusing non-writable daemon path for host Bun: $SCRATCH_MP"
      exit 2
    fi
    ;;
esac
case "$BLOB_MP" in
  /mnt/mini-blobs*)
    err "refusing blob path that collides with mini blobs: $BLOB_MP"
    exit 2
    ;;
  */.tmp/REDHAT-FIX-H2/step3-*|.tmp/REDHAT-FIX-H2/step3-*)
    err "refuse unbound host-only REDHAT-FIX-H2/step3 path as volume destination: $BLOB_MP"
    exit 2
    ;;
esac

# Final host-writability gate (never pass unusable paths to Bun).
if ! host_writable "$SCRATCH_MP"; then
  err "scratch execution path not host-writable: $SCRATCH_MP"
  exit 2
fi
if ! host_writable "$BLOB_MP"; then
  err "blob execution path not host-writable: $BLOB_MP"
  exit 2
fi

CONTAINER_STATE="missing"
if docker inspect "$HOST_NAME" >/dev/null 2>&1; then
  if container_running; then
    CONTAINER_STATE="running"
  else
    CONTAINER_STATE="stopped"
  fi
fi

# Enrich container paths from paths.txt when available.
PATHS_FILE=""
if PATHS_FILE="$(find_paths_txt "$HOST_NAME")"; then
  _cpg="$(read_paths_txt_field "$PATHS_FILE" "container_pgdata" || true)"
  _cbl="$(read_paths_txt_field "$PATHS_FILE" "container_blob" || true)"
  [[ -n "$_cpg" ]] && CONTAINER_PGDATA="$_cpg"
  [[ -n "$_cbl" ]] && CONTAINER_BLOB="$_cbl"
fi

# Daemon mountpoints (may be /var/lib/docker/... on Colima — attested, not used as host exec).
DAEMON_SCRATCH_MP="${DAEMON_SCRATCH_MP:-}"
DAEMON_BLOB_MP="${DAEMON_BLOB_MP:-}"
if [[ -z "$DAEMON_SCRATCH_MP" ]]; then
  DAEMON_SCRATCH_MP="$(volume_mountpoint "$VOLUME_PGDATA" || true)"
fi
if [[ -z "$DAEMON_BLOB_MP" ]]; then
  DAEMON_BLOB_MP="$(volume_mountpoint "$VOLUME_BLOB" || true)"
fi
fi # SKIP_DOCKER_VOLUME_RESOLVE

TS_JSON="null"
if [[ -n "$TARGET_TIMESTAMP" ]]; then
  TS_JSON="\"${TARGET_TIMESTAMP}\""
fi

# Escape paths for JSON (minimal: backslash + quotes).
json_escape() {
  /usr/bin/python3 -E -s -c 'import json,sys; print(json.dumps(sys.stdin.read()[:-1] if False else sys.argv[1]))' "$1"
}

J_SCRATCH="$(json_escape "$SCRATCH_MP")"
J_BLOB="$(json_escape "$BLOB_MP")"
J_DAEMON_S="$(json_escape "${DAEMON_SCRATCH_MP:-}")"
J_DAEMON_B="$(json_escape "${DAEMON_BLOB_MP:-}")"
J_CONT_S="$(json_escape "$CONTAINER_PGDATA")"
J_CONT_B="$(json_escape "$CONTAINER_BLOB")"
J_MODE="$(json_escape "$EXECUTION_MODE")"

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
    "scratch": ${J_DAEMON_S},
    "blob": ${J_DAEMON_B}
  },
  "daemon_mountpoint": {
    "scratch": ${J_DAEMON_S},
    "blob": ${J_DAEMON_B}
  },
  "host_execution": {
    "scratch": ${J_SCRATCH},
    "blob": ${J_BLOB}
  },
  "container_paths": {
    "pgdata": ${J_CONT_S},
    "blob": ${J_CONT_B}
  },
  "execution_mode": ${J_MODE},
  "scratch": ${J_SCRATCH},
  "blobDir": ${J_BLOB},
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

log "bound host_execution.scratch=${SCRATCH_MP}"
log "bound host_execution.blob=${BLOB_MP}"
log "daemon_mountpoint.scratch=${DAEMON_SCRATCH_MP:-none}"
log "daemon_mountpoint.blob=${DAEMON_BLOB_MP:-none}"
log "execution_mode=${EXECUTION_MODE}"
log "volumes ${VOLUME_PGDATA}, ${VOLUME_BLOB} (container=${CONTAINER_STATE})"

if [[ "$RESOLVE_ONLY" -eq 1 ]]; then
  printf '%s\n' "$ATTESTATION_BODY"
  exit 0
fi

if [[ -z "$TARGET_TIMESTAMP" ]]; then
  err "--target-timestamp required unless --resolve-only"
  exit 2
fi

REPORT_PATH="${REPORT:-$ROOT/.tmp/REDHAT-FIX-S28R2/C1/parity-report-${HOST_NAME}.json}"
mkdir -p "$(dirname "$REPORT_PATH")"

# Credential tuple already validated + proof-bound early (assert_restore_credential_tuple).
# ── GATE-FIX-S28R3-QA3 / C-1: restore-only minimal child env ─────────────────
# Map verified distinct R2_RESTORE_* → R2_ACCESS_* for loadBackupConfig(); never
# leak backup-writer R2_ACCESS_* into the fire-drill process.

# Optional redacted env dump for tests (keys + presence/length/hash only — never raw secrets).
if [[ -n "${HOLO_FIRE_DRILL_ENV_DUMP:-}" ]]; then
  mkdir -p "$(dirname "$HOLO_FIRE_DRILL_ENV_DUMP")"
  /usr/bin/python3 -E -s - "$HOLO_FIRE_DRILL_ENV_DUMP" "$RESTORE_AK" "$WRITER_AK" <<'PY' || true
import hashlib, json, os, sys
path, restore_ak, writer_ak = sys.argv[1], sys.argv[2], sys.argv[3]
def meta(name: str):
    v = os.environ.get(name)
    if v is None or v == "":
        return {"present": False, "length": 0}
    return {
        "present": True,
        "length": len(v),
        "sha256_16": hashlib.sha256(v.encode()).hexdigest()[:16],
    }
keys = sorted(
    k
    for k in os.environ
    if k.startswith("R2_") or k.startswith("HOLO") or k in ("PATH", "HOME", "RESTIC_PASSWORD")
)
payload = {
    "schema": "holo.fire-drill.child-env-dump.v1",
    "keys": keys,
    "R2_RESTORE_ACCESS_KEY_ID": meta("R2_RESTORE_ACCESS_KEY_ID"),
    "R2_ACCESS_KEY_ID_parent": meta("R2_ACCESS_KEY_ID"),
    "restore_ak_distinct_from_writer": bool(restore_ak) and restore_ak != writer_ak,
    "child_will_map_restore_to_access": True,
    "child_forwards_DATABASE_URL": False,
    "note": "values never included; parent dump only; writer/restore resolved from same secrets+env",
}
with open(path, "w") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
PY
  log "wrote redacted env dump: $HOLO_FIRE_DRILL_ENV_DUMP"
fi

# GATE-FIX-S28R3-QA4 / C-1: never forward live HOLO_BLOB_ROOT as a pre-failure source.
if [[ -n "${HOLO_BLOB_ROOT:-}" ]]; then
  log "ignoring HOLO_BLOB_ROOT on fresh-target (baseline-only; not forwarded as --source-blob-root)"
fi

ARGS=(
  restore:fire-drill
  --target-timestamp "$TARGET_TIMESTAMP"
  --scratch "$SCRATCH_MP"
  --blob-dir "$BLOB_MP"
  --report "$REPORT_PATH"
  --fresh-target "$HOST_NAME"
)

# Minimal child env: map restore → access; strip ambient writer keys.
# Keep endpoint/account/bucket/prefix/session + passthroughs needed by holo.
CHILD_PATH="${PATH:-/usr/bin:/bin:/usr/local/bin}"
CHILD_HOME="${HOME:-/tmp}"
CHILD_TMPDIR="${TMPDIR:-/tmp}"
CHILD_USER="${USER:-$(id -un 2>/dev/null || echo nobody)}"
CHILD_LANG="${LANG:-C.UTF-8}"
CHILD_TERM="${TERM:-dumb}"

# Build env -i argument list (KEY=VAL pairs).
CHILD_ENV_ARGS=(
  "PATH=$CHILD_PATH"
  "HOME=$CHILD_HOME"
  "TMPDIR=$CHILD_TMPDIR"
  "USER=$CHILD_USER"
  "LANG=$CHILD_LANG"
  "TERM=$CHILD_TERM"
  "PWD=$ROOT"
  "R2_ACCESS_KEY_ID=$RESTORE_AK"
  "R2_SECRET_ACCESS_KEY=$RESTORE_SK"
  "R2_RESTORE_ACCESS_KEY_ID=$RESTORE_AK"
  "R2_RESTORE_SECRET_ACCESS_KEY=$RESTORE_SK"
)
if [[ -n "$RESTORE_ST" ]]; then
  CHILD_ENV_ARGS+=("R2_SESSION_TOKEN=$RESTORE_ST" "R2_RESTORE_SESSION_TOKEN=$RESTORE_ST")
fi
# Passthrough non-writer R2 / holo config when present.
# GATE-FIX-S28R3-QA3 / C-2: NEVER forward DATABASE_URL or PG* (fresh-target is baseline-only).
for _k in \
  R2_ENDPOINT R2_ACCOUNT_ID R2_BUCKET_NAME R2_PGBACKREST_PREFIX R2_RESTORE_OBJECT_PREFIX \
  R2_RESTIC_PREFIX R2_CREDENTIAL_KIND R2_CREDENTIAL_POLICY R2_REPO_CIPHER_PASS \
  HOLO_SECRETS_PATH HOLOCRON_SECRETS_PATH HOLO_FIRE_DRILL_ENV_DUMP \
  STAGING_ROOT RESTIC_PASSWORD RESTIC_REPOSITORY \
  PGBACKREST_CONFIG PGBACKREST_STANZA PGBACKREST_PG1_PATH \
  BUN_INSTALL BUN_INSTALL_CACHE_DIR NODE_PATH \
  CI PLATFORM_IT; do
  if [[ -n "${!_k:-}" ]]; then
    CHILD_ENV_ARGS+=("${_k}=${!_k}")
  fi
done
# Explicit object-read-only kind when policy not supplied.
if [[ -z "${R2_CREDENTIAL_KIND:-}" ]]; then
  CHILD_ENV_ARGS+=("R2_CREDENTIAL_KIND=object-read-only")
fi

# HOLO_CLI: .ts/.js via bun; injectable recorder scripts run directly.
if [[ "$HOLO_CLI" == *.ts || "$HOLO_CLI" == *.js || "$HOLO_CLI" == *.mjs || "$HOLO_CLI" == *.cjs ]]; then
  if [[ ! -f "$HOLO_CLI" ]]; then
    err "holo CLI missing: $HOLO_CLI"
    exit 2
  fi
  if [[ -z "$BUN_BIN" ]]; then
    err "GATE-FIX-S28R3-QA17 fixed bun not found (/opt/homebrew/bin/bun or /usr/local/bin/bun)"
    exit 2
  fi
  RUN_PREFIX=("$BUN_BIN" "$HOLO_CLI")
else
  if [[ ! -e "$HOLO_CLI" ]]; then
    err "holo CLI missing: $HOLO_CLI"
    exit 2
  fi
  RUN_PREFIX=("$HOLO_CLI")
fi

log "running restore-only child env: ${RUN_PREFIX[*]} ${ARGS[*]}"
set +e
/usr/bin/env -i "${CHILD_ENV_ARGS[@]}" "${RUN_PREFIX[@]}" "${ARGS[@]}"
STATUS=$?
set -e

# GATE-FIX-S28R3-QA4 / M-1 + QA5: after successful child exit, require contract-shaped parity report
# via extracted scripts/assert-fire-drill-report.sh (no-Docker unit-testable).
if [[ "$STATUS" -eq 0 && -n "${REPORT_PATH:-}" ]]; then
  set +e
  /bin/bash "$ROOT/scripts/assert-fire-drill-report.sh" "$REPORT_PATH"
  report_rc=$?
  set -e
  if [[ $report_rc -ne 0 ]]; then
    err "fire-drill child exited 0 but report contract failed (GATE-FIX-S28R3-QA4/M-1): $REPORT_PATH"
    STATUS=1
  fi
fi

# Augment attestation with fire-drill exit.
if [[ -n "$ATTESTATION" ]]; then
  # shellcheck disable=SC2016
  /usr/bin/python3 -E -s - "$ATTESTATION" "$STATUS" "$REPORT_PATH" <<'PY' 2>/dev/null || true
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
