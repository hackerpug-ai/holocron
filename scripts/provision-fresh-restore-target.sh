#!/usr/bin/env bash
# D05-03 / CAP-BAK-01 — Provision a genuinely fresh restore target.
#
# Creates an isolated Docker container (network namespace separate from the mini)
# with:
#   - its own Postgres binaries (container image; no mini PGDATA mounts)
#   - empty writable PGDATA + blob dirs (named Docker volumes)
#   - R2 read-only scoped credential env (List/Get only policy template)
#   - prove-isolation.sh run successfully against MINI_HOST
#
# Local stand-in for a separate machine/VM. MUST NOT restore onto the mini host
# scratch dirs that share mini PGDATA.
#
# Usage:
#   ./scripts/provision-fresh-restore-target.sh --host fresh-restore-01
#   ./scripts/provision-fresh-restore-target.sh --host fresh-restore-01 --mini-host 203.0.113.1
#   ./scripts/provision-fresh-restore-target.sh --host fresh-restore-01 --dry-run
#
# Environment (optional):
#   MINI_HOST, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT,
#   R2_ACCOUNT_ID, POSTGRES_IMAGE, RESTORE_PG_PORT, STAGING_ROOT
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# GATE-FIX-S28R3-QA13 shared live provider helpers
# shellcheck source=scripts/lib/r2-ro-live.sh
source "$ROOT/scripts/lib/r2-ro-live.sh"

HOST_NAME=""
MINI_HOST="${MINI_HOST:-203.0.113.1}" # TEST-NET-3 — unroutable by design for local drills
DRY_RUN=0
SKIP_ISOLATION=0
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:18-alpine}"
RESTORE_PG_PORT="${RESTORE_PG_PORT:-55432}"
STAGING_ROOT="${STAGING_ROOT:-$ROOT/.tmp/fresh-restore}"
CONTAINER_PGDATA="/var/lib/postgresql/restore"
CONTAINER_BLOB="/var/lib/holocron/blob-restore"
R2_BUCKET_NAME="${R2_BUCKET_NAME:-holocron-backup}"
R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-}"
R2_ENDPOINT="${R2_ENDPOINT:-}"
# REDHAT-FIX-S28R2-H3: capture ambient RW separately — NEVER silently substitute as RO.
AMBIENT_R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-}"
AMBIENT_R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-}"
AMBIENT_R2_SESSION_TOKEN="${R2_SESSION_TOKEN:-}"
R2_RESTORE_ACCESS_KEY_ID="${R2_RESTORE_ACCESS_KEY_ID:-}"
R2_RESTORE_SECRET_ACCESS_KEY="${R2_RESTORE_SECRET_ACCESS_KEY:-}"
R2_RESTORE_SESSION_TOKEN="${R2_RESTORE_SESSION_TOKEN:-}"
# Resolved RO identity written into restore-target.env (set after arg parse).
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_SESSION_TOKEN=""

usage() {
  cat <<'EOF'
Usage: provision-fresh-restore-target.sh --host <name> [options]

Options:
  --host NAME            Container / target name (required), e.g. fresh-restore-01
  --mini-host HOST       Original mini host for isolation probe (default 203.0.113.1)
  --postgres-image IMG   Postgres image (default postgres:18-alpine)
  --pg-port PORT         Reserved host port for later restore bring-up (default 55432)
  --dry-run              Write compose/env/dirs; do not start Docker; still run probe
  --skip-isolation       Skip prove-isolation.sh (not recommended)
  -h, --help             Show help

R2 read-only credentials (env) — REDHAT-FIX-S28R2-H3:
  R2_RESTORE_ACCESS_KEY_ID / R2_RESTORE_SECRET_ACCESS_KEY  — REQUIRED for live start
  R2_BUCKET_NAME (default holocron-backup)
  R2_ENDPOINT or R2_ACCOUNT_ID
  Placeholders ONLY when ALLOW_PLACEHOLDER_R2_RO=1 or --dry-run (shape drills).
  NEVER silently falls back to ambient backup RW R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.
  REQUIRE_LIVE_R2_RO=1: refuse missing/placeholder restore keys and refuse keys equal to ambient RW.
  AC-2 live proof: REQUIRE_LIVE_R2_RO=1 ./scripts/prove-r2-readonly.sh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST_NAME="${2:-}"; shift 2 ;;
    --mini-host) MINI_HOST="${2:-}"; shift 2 ;;
    --postgres-image) POSTGRES_IMAGE="${2:-}"; shift 2 ;;
    --pg-port) RESTORE_PG_PORT="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --skip-isolation) SKIP_ISOLATION=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$HOST_NAME" ]]; then
  echo "error: --host is required" >&2
  usage >&2
  exit 2
fi

# GATE-FIX-S28R3-QA2 / M3: allowlist host + optional GATE_RUN_ID before destructive rm.
# Host: alphanumeric, dash, underscore; 2–64 chars; no path separators / shell metachar.
if [[ ! "$HOST_NAME" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,62}[A-Za-z0-9]$|^[A-Za-z0-9]$ ]]; then
  echo "error: refuse invalid host name (allowlist: alphanumeric + _- , length 1-64): $HOST_NAME" >&2
  exit 2
fi
if [[ "$HOST_NAME" == *"/"* || "$HOST_NAME" == *".."* || "$HOST_NAME" == *";"* ]]; then
  echo "error: refuse host name with path/metachar: $HOST_NAME" >&2
  exit 2
fi
if [[ -n "${GATE_RUN_ID:-}" ]]; then
  if [[ ! "$GATE_RUN_ID" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,62}[A-Za-z0-9]$|^[A-Za-z0-9]$ ]]; then
    echo "error: refuse invalid GATE_RUN_ID (allowlist: alphanumeric + _- , length 1-64): ${GATE_RUN_ID}" >&2
    exit 2
  fi
fi

case "$HOST_NAME" in
  *mini*pgdata*|*mini*blob*)
    echo "error: refuse host name that implies mini data reuse: $HOST_NAME" >&2
    exit 2
    ;;
esac

if [[ -z "$R2_ENDPOINT" && -n "$R2_ACCOUNT_ID" ]]; then
  R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
fi
if [[ -z "$R2_ENDPOINT" ]]; then
  R2_ENDPOINT="https://example-accountid.r2.cloudflarestorage.com"
fi

# ── REDHAT-FIX-S28R2-H3: resolve distinct RO restore credentials ─────────────
# Live start requires R2_RESTORE_* unless ALLOW_PLACEHOLDER_R2_RO=1.
# --dry-run may use placeholders for isolation-shape drills without ambient RW.
is_placeholder_key() {
  local v="${1:-}"
  case "$v" in
    # REDHAT-FIX-S28R3: bare ro-test is placeholder (legacy gate default).
    ''|ro-test|ro-test-*|*ro-test*|*placeholder*|*replace-me*|*example*|*not-for-prod*|*test-key*|*test-secret*)
      return 0
      ;;
  esac
  return 1
}

if [[ -n "$R2_RESTORE_ACCESS_KEY_ID" && -n "$R2_RESTORE_SECRET_ACCESS_KEY" ]]; then
  R2_ACCESS_KEY_ID="$R2_RESTORE_ACCESS_KEY_ID"
  R2_SECRET_ACCESS_KEY="$R2_RESTORE_SECRET_ACCESS_KEY"
  R2_SESSION_TOKEN="${R2_RESTORE_SESSION_TOKEN:-}"
elif [[ "${ALLOW_PLACEHOLDER_R2_RO:-0}" == "1" || "$DRY_RUN" -eq 1 ]]; then
  echo "[provision-fresh-restore-target] using placeholder RO keys (ALLOW_PLACEHOLDER_R2_RO=1 or --dry-run); not ambient RW"
  R2_ACCESS_KEY_ID="ro-placeholder-restore-only-not-for-prod"
  R2_SECRET_ACCESS_KEY="ro-placeholder-secret-restore-only-not-for-prod"
  R2_SESSION_TOKEN=""
else
  echo "error: R2_RESTORE_ACCESS_KEY_ID and R2_RESTORE_SECRET_ACCESS_KEY required for live provision" >&2
  echo "  (refuse silent ambient R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY RW fallback)" >&2
  echo "  residual: DEPENDENCY-S28-R2-RO" >&2
  echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
  echo "  shape-only: ALLOW_PLACEHOLDER_R2_RO=1 or --dry-run" >&2
  exit 2
fi

# REQUIRE_LIVE_R2_RO=1: fail closed on placeholders or writer-equivalent credential tuples.
# GATE-FIX-S28R3-QA8/QA9: identity is the full tuple (AK, secret, session token) — not AK alone.
# Same-parent-ID temp sessions require authoritative writer AK+secret present, restore secret
# explicitly unequal, and non-empty session token. Unknown writer secret → refuse (QA9/H1).
# GATE-FIX-S28R3-QA9/M1: live List/Put/Delete proof must be bound to the exact tuple.
r2_tuple_fp16() {
  r2_ro_tuple_fp16 "${1:-}" "${2:-}" "${3:-}"
}

r2_context_fp16() {
  r2_ro_fp16_fields "${1:-}" "${2:-}" "${3:-}" "${4:-}"
}

assert_bound_r2_ro_proof() {
  if ! r2_ro_init_trusted_helpers; then
    echo "error: GATE-FIX-S28R3-QA14 trusted helper chain failed" >&2
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi

  # GATE-FIX-S28R3-QA13: fixed prover + trusted AWS independent of PATH;
  # canonical context; exclusive private proof; consumer-level validation.
  local rak="$1" rsk="$2" rst="$3"
  local expected_fp expected_ctx proof prove_cmd established
  local ep bucket prefix kind policy
  if [[ -n "${HOLO_QA_PROOF_MUTATE:-}" ]]; then
    echo "error: GATE-FIX-S28R3-QA14 refuses HOLO_QA_PROOF_MUTATE in production" >&2
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
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
  ep="$(r2_ro_field 1 "${established}")"
  bucket="$(r2_ro_field 2 "${established}")"
  prefix="$(r2_ro_field 3 "${established}")"
  kind="$(r2_ro_field 4 "${established}")"
  policy="$(r2_ro_field 5 "${established}")"
  expected_ctx="$(r2_ro_field 6 "${established}")"
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
  # GATE-FIX-S28R3-QA17 sanitize: always env -i via r2_ro_exec_isolated; never bare env (env-dump).
  # Capture prove logs to a temp file and emit only allowlisted lines on failure.
  local _prove_log
  _prove_log="$(mktemp "${TMPDIR:-/tmp}/holo-prove.log.XXXXXX")"
  set +e
  r2_ro_exec_isolated     "PATH=/usr/bin:/bin"     "HOME=${HOME:-/tmp}"     "LC_ALL=C"     "REQUIRE_LIVE_R2_RO=1"     "HOLO_R2_RO_PROOF_OUT=$proof"     "HOLO_R2_CONTEXT_FP16=$expected_ctx"     "R2_RESTORE_ACCESS_KEY_ID=$rak"     "R2_RESTORE_SECRET_ACCESS_KEY=$rsk"     "R2_RESTORE_SESSION_TOKEN=$rst"     "R2_ACCESS_KEY_ID=${AMBIENT_R2_ACCESS_KEY_ID:-${WRITER_AK:-${R2_ACCESS_KEY_ID:-}}}"     "R2_SECRET_ACCESS_KEY=${AMBIENT_R2_SECRET_ACCESS_KEY:-${WRITER_SK:-${R2_SECRET_ACCESS_KEY:-}}}"     "R2_ENDPOINT=$ep"     "R2_ACCOUNT_ID=${R2_ACCOUNT_ID:-}"     "R2_BUCKET_NAME=$bucket"     "R2_PGBACKREST_PREFIX=$prefix"     "R2_RESTORE_OBJECT_PREFIX=$prefix"     "R2_CREDENTIAL_KIND=$kind"     "R2_CREDENTIAL_POLICY=$policy"     "R2_SCOPE_PROBE_IN_KEY=${R2_SCOPE_PROBE_IN_KEY:-}"     "R2_SCOPE_PROBE_OUT_KEY=${R2_SCOPE_PROBE_OUT_KEY:-}"     "HOLOCRON_SECRETS_PATH=${HOLOCRON_SECRETS_PATH:-}"     "HOLO_SECRETS_PATH=${HOLO_SECRETS_PATH:-}"     "BACKUP_R2_ACCESS_KEY_ID=${BACKUP_R2_ACCESS_KEY_ID:-${WRITER_AK:-${AMBIENT_R2_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}}}"     "BACKUP_R2_SECRET_ACCESS_KEY=${BACKUP_R2_SECRET_ACCESS_KEY:-${WRITER_SK:-${AMBIENT_R2_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}}}"     "R2_PARENT_ACCESS_KEY_ID=${R2_PARENT_ACCESS_KEY_ID:-}"     "R2_PARENT_SECRET_ACCESS_KEY=${R2_PARENT_SECRET_ACCESS_KEY:-}"     --     /bin/bash "$prove_cmd" >"$_prove_log" 2>&1
  local _prove_rc=$?
  set -e
  if [[ $_prove_rc -ne 0 ]]; then
    echo "error: GATE-FIX-S28R3-QA17 fresh live RO proof failed (class=prove_nonzero exit=${_prove_rc})" >&2
    # Allowlisted log only — never ambient env dump or secret values.
    r2_ro_filter_safe_log <"$_prove_log" >&2 || true
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    rm -f "$proof" "$_prove_log" 2>/dev/null || true
    exit 2
  fi
  # Success path: still never echo raw prove log (may contain class lines only if needed).
  r2_ro_filter_safe_log <"$_prove_log" || true
  rm -f "$_prove_log" 2>/dev/null || true
  if ! r2_ro_validate_proof "$proof" "$expected_fp" "$expected_ctx"; then
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
}

# Exact bucket + object-prefix List/Get only (no Put/Delete). REDHAT-FIX-H5 / GATE-FIX-S28R3-QA2 H2.
# Built before live proof so context_fp16 binds policy (GATE-FIX-S28R3-QA11 / M1).
# GATE-FIX-S28R3-QA13: empty explicit prefix is refused (do not silently default under live).
if [[ -n "${R2_RESTORE_OBJECT_PREFIX+x}" && -z "${R2_RESTORE_OBJECT_PREFIX}" && -n "${R2_PGBACKREST_PREFIX+x}" && -z "${R2_PGBACKREST_PREFIX}" ]]; then
  echo "error: GATE-FIX-S28R3-QA13 empty restore prefix refused" >&2
  echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
  exit 2
fi
if [[ -z "${R2_RESTORE_OBJECT_PREFIX:-}" && -z "${R2_PGBACKREST_PREFIX:-}" ]]; then
  if [[ "${REQUIRE_LIVE_R2_RO:-0}" == "1" ]]; then
    echo "error: GATE-FIX-S28R3-QA13 empty restore prefix refused under REQUIRE_LIVE_R2_RO" >&2
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
fi
R2_OBJECT_PREFIX="${R2_RESTORE_OBJECT_PREFIX:-${R2_PGBACKREST_PREFIX:-pgbackrest}}"
# GATE-FIX-S28R3-QA13: gate policy requires exact pgbackrest prefix
if [[ "${R2_OBJECT_PREFIX#/}" != "pgbackrest" && "${R2_OBJECT_PREFIX#/}" != "pgbackrest/" ]]; then
  # normalize then check
  _chk="${R2_OBJECT_PREFIX#/}"; _chk="${_chk%/}"
  if [[ "$_chk" != "pgbackrest" ]]; then
    echo "error: GATE-FIX-S28R3-QA13 restore prefix must be exactly pgbackrest" >&2
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
  R2_OBJECT_PREFIX="pgbackrest"
fi
R2_OBJECT_PREFIX="${R2_OBJECT_PREFIX#/}"
R2_OBJECT_PREFIX="${R2_OBJECT_PREFIX%/}"
if [[ -z "$R2_OBJECT_PREFIX" || "$R2_OBJECT_PREFIX" == *"*"* ]]; then
  echo "error: R2_PGBACKREST_PREFIX/R2_RESTORE_OBJECT_PREFIX must be exact non-empty prefix (no *)" >&2
  exit 2
fi
R2_CREDENTIAL_KIND="object-read-only"
R2_CREDENTIAL_POLICY="$(r2_ro_build_canonical_policy_json "${R2_BUCKET_NAME}" "${R2_OBJECT_PREFIX}")"
export R2_CREDENTIAL_KIND R2_CREDENTIAL_POLICY R2_RESTORE_OBJECT_PREFIX="$R2_OBJECT_PREFIX" R2_PGBACKREST_PREFIX="$R2_OBJECT_PREFIX"

if [[ "${REQUIRE_LIVE_R2_RO:-0}" == "1" ]]; then
  if is_placeholder_key "$R2_ACCESS_KEY_ID" || is_placeholder_key "$R2_SECRET_ACCESS_KEY"; then
    echo "error: REQUIRE_LIVE_R2_RO=1 refuses placeholder restore credentials" >&2
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
  if [[ -z "$R2_RESTORE_ACCESS_KEY_ID" || -z "$R2_RESTORE_SECRET_ACCESS_KEY" ]]; then
    echo "error: REQUIRE_LIVE_R2_RO=1 requires distinct R2_RESTORE_* credentials" >&2
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
  if [[ -n "$AMBIENT_R2_SECRET_ACCESS_KEY" && "$R2_RESTORE_SECRET_ACCESS_KEY" == "$AMBIENT_R2_SECRET_ACCESS_KEY" ]]; then
    echo "error: REQUIRE_LIVE_R2_RO=1 refuses writer-equivalent credential tuple (restore secret equals ambient RW secret)" >&2
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
  if [[ -n "$AMBIENT_R2_ACCESS_KEY_ID" && "$R2_RESTORE_ACCESS_KEY_ID" == "$AMBIENT_R2_ACCESS_KEY_ID" ]]; then
    if [[ -z "$AMBIENT_R2_SECRET_ACCESS_KEY" ]]; then
      echo "error: REQUIRE_LIVE_R2_RO=1 refuses same parent Access Key ID without authoritative writer secret (cannot establish distinct restore secret)" >&2
      echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
      exit 2
    fi
    if [[ -z "${R2_RESTORE_SESSION_TOKEN:-}" ]]; then
      echo "error: REQUIRE_LIVE_R2_RO=1 refuses same Access Key ID as ambient RW without non-empty restore session token (incomplete Cloudflare temporary credential tuple)" >&2
      echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
      exit 2
    fi
    if [[ "$R2_RESTORE_SECRET_ACCESS_KEY" == "$AMBIENT_R2_SECRET_ACCESS_KEY" ]]; then
      echo "error: REQUIRE_LIVE_R2_RO=1 refuses writer-equivalent credential tuple (same AK+secret as ambient RW)" >&2
      echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
      exit 2
    fi
    echo "[provision-fresh-restore-target] GATE-FIX-S28R3-QA8/QA9: accepted Cloudflare temporary credential tuple shape (same parent AK; writer secret present and unequal; session token present)"
  fi
  assert_bound_r2_ro_proof \
    "$R2_RESTORE_ACCESS_KEY_ID" \
    "$R2_RESTORE_SECRET_ACCESS_KEY" \
    "${R2_RESTORE_SESSION_TOKEN:-}"
fi

# Absolute staging root required for Docker bind-backed local volumes (device=).
# Relative STAGING_ROOT (e.g. .tmp/...) would be daemon-relative and unusable on Colima/Desktop.
case "$STAGING_ROOT" in
  /*) ;;
  *) STAGING_ROOT="$(cd "$ROOT" && mkdir -p "$STAGING_ROOT" && cd "$STAGING_ROOT" && pwd)" ;;
esac

TARGET_DIR="${STAGING_ROOT}/${HOST_NAME}"
HOST_PGDATA_STAGING="${TARGET_DIR}/pgdata"
HOST_BLOB_STAGING="${TARGET_DIR}/blob-restore"
ENV_FILE="${TARGET_DIR}/restore-target.env"
COMPOSE_FILE="${TARGET_DIR}/docker-compose.yml"
PROBE_WRAPPER="${TARGET_DIR}/run-isolation.sh"
NETWORK_NAME="${HOST_NAME}-net"
VOLUME_PGDATA="${HOST_NAME}-pgdata"
VOLUME_BLOB="${HOST_NAME}-blobs"
RESTORE_CONF_DIR="${TARGET_DIR}/pgbackrest"

log() { echo "[provision-fresh-restore-target] $*"; }

assert_not_mini_path() {
  local p="$1"
  case "$p" in
    /mnt/mini-pgdata*|/mnt/mini-blobs*|/opt/homebrew/var/postgresql@18*|/var/lib/postgresql/data)
      echo "error: refusing path that collides with mini/production PGDATA: $p" >&2
      exit 2
      ;;
  esac
}

mkdir -p "$TARGET_DIR" "$HOST_PGDATA_STAGING" "$HOST_BLOB_STAGING" "$RESTORE_CONF_DIR"
assert_not_mini_path "$HOST_PGDATA_STAGING"
assert_not_mini_path "$HOST_BLOB_STAGING"

# AC-3: empty writable dirs (our staging only — never mini paths).
find "$HOST_PGDATA_STAGING" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
find "$HOST_BLOB_STAGING" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
touch "$HOST_PGDATA_STAGING/.write-probe" && rm -f "$HOST_PGDATA_STAGING/.write-probe"
touch "$HOST_BLOB_STAGING/.write-probe" && rm -f "$HOST_BLOB_STAGING/.write-probe"
pg_count="$(find "$HOST_PGDATA_STAGING" -mindepth 1 | wc -l | tr -d ' ')"
blob_count="$(find "$HOST_BLOB_STAGING" -mindepth 1 | wc -l | tr -d ' ')"
if [[ "$pg_count" != "0" || "$blob_count" != "0" ]]; then
  echo "error: staging dirs not empty after reset" >&2
  exit 1
fi
log "empty writable staging: $HOST_PGDATA_STAGING + $HOST_BLOB_STAGING"

# Independently attested identities (REDHAT-FIX-H3 multi-axis identity axis).
# Target identity is read from OS (machine-id / SMBIOS UUID) when not supplied.
# Mini identity must be provided via MINI_ATTESTED_IDENTITY (fail closed in probe if missing).
TARGET_ATTESTED_IDENTITY="${TARGET_ATTESTED_IDENTITY:-}"
if [[ -z "$TARGET_ATTESTED_IDENTITY" ]]; then
  if [[ -r /etc/machine-id ]]; then
    TARGET_ATTESTED_IDENTITY="$(tr -d '[:space:]' </etc/machine-id 2>/dev/null || true)"
  fi
  if [[ -z "$TARGET_ATTESTED_IDENTITY" ]] && command -v ioreg >/dev/null 2>&1; then
    TARGET_ATTESTED_IDENTITY="$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk -F'"' '/IOPlatformUUID/{print $4; exit}' | tr -d '[:space:]')"
  fi
fi
# Prefer an explicit mini identity; when provisioning a local stand-in against TEST-NET,
# synthesize a distinct mini id so the identity axis can PASS without co-location.
MINI_ATTESTED_IDENTITY="${MINI_ATTESTED_IDENTITY:-}"
if [[ -z "$MINI_ATTESTED_IDENTITY" ]]; then
  if [[ -n "$TARGET_ATTESTED_IDENTITY" ]]; then
    MINI_ATTESTED_IDENTITY="mini-distinct-from-${TARGET_ATTESTED_IDENTITY}"
  else
    MINI_ATTESTED_IDENTITY="mini-attested-identity-unset"
  fi
fi
MINI_IPV4="${MINI_IPV4:-}"
MINI_IPV6="${MINI_IPV6:-}"
MINI_TAILNET_IP="${MINI_TAILNET_IP:-}"
MINI_LAN_IP="${MINI_LAN_IP:-}"
MINI_DNS_ALIASES="${MINI_DNS_ALIASES:-}"
MINI_HOSTNAMES="${MINI_HOSTNAMES:-}"

# Env file — restore target only; never R2_PARENT_* or RW keys.
umask 077
{
  echo "# Generated by provision-fresh-restore-target.sh (D05-03 / REDHAT-FIX-H3). Do not commit secrets."
  echo "# R2 credentials MUST be bucket-scoped object-read-only (List/Get). No Put/Delete."
  echo "# Multi-axis isolation: network + IPC + mounts + identity + control-plane + docker_runtime."
  echo "MINI_HOST=${MINI_HOST}"
  echo "MINI_PG_PORT=5432"
  echo "MINI_SSH_PORT=22"
  echo "MINI_IPV4=${MINI_IPV4}"
  echo "MINI_IPV6=${MINI_IPV6}"
  echo "MINI_TAILNET_IP=${MINI_TAILNET_IP}"
  echo "MINI_LAN_IP=${MINI_LAN_IP}"
  echo "MINI_DNS_ALIASES=${MINI_DNS_ALIASES}"
  echo "MINI_HOSTNAMES=${MINI_HOSTNAMES}"
  echo "TARGET_ATTESTED_IDENTITY=${TARGET_ATTESTED_IDENTITY}"
  echo "MINI_ATTESTED_IDENTITY=${MINI_ATTESTED_IDENTITY}"
  echo "REQUIRE_ATTESTED_IDENTITY=1"
  echo "R2_BUCKET_NAME=${R2_BUCKET_NAME}"
  echo "R2_ENDPOINT=${R2_ENDPOINT}"
  echo "R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID}"
  echo "R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY}"
  echo "R2_CREDENTIAL_KIND=${R2_CREDENTIAL_KIND}"
  echo "R2_CREDENTIAL_POLICY=${R2_CREDENTIAL_POLICY}"
  echo "PGBACKREST_PG1_PATH=${CONTAINER_PGDATA}"
  echo "HOLOCRON_BLOB_RESTORE_PATH=${CONTAINER_BLOB}"
  echo "PGDATA=${CONTAINER_PGDATA}"
  if [[ -n "$R2_SESSION_TOKEN" ]]; then
    echo "R2_SESSION_TOKEN=${R2_SESSION_TOKEN}"
  fi
  if [[ -n "$R2_ACCOUNT_ID" ]]; then
    echo "R2_ACCOUNT_ID=${R2_ACCOUNT_ID}"
  fi
} >"$ENV_FILE"
chmod 600 "$ENV_FILE"
log "wrote R2 read-only + multi-axis identity env: $ENV_FILE"
log "TARGET_ATTESTED_IDENTITY=${TARGET_ATTESTED_IDENTITY}"
log "MINI_ATTESTED_IDENTITY=${MINI_ATTESTED_IDENTITY}"

# Independent pgBackRest conf (no symlink to mini).
cat >"${RESTORE_CONF_DIR}/pgbackrest.conf" <<EOF
# Independent restore-target pgBackRest conf (D05-03). NOT a symlink to mini.
# Live S3 keys / cipher pass are injected at restore time from restore-target.env.

[global]
repo1-type=s3
repo1-s3-bucket=${R2_BUCKET_NAME}
repo1-s3-endpoint=${R2_ENDPOINT#https://}
repo1-s3-region=auto
repo1-s3-uri-style=path
repo1-path=/pgbackrest
repo1-cipher-type=aes-256-cbc
log-level-console=info

[main]
pg1-path=${CONTAINER_PGDATA}
pg1-port=5432
EOF
chmod 600 "${RESTORE_CONF_DIR}/pgbackrest.conf"

# Docker Compose: separate bridge network + named volumes (never mini bind-mounts).
# Entrypoint does NOT run image initdb — fire drill needs EMPTY PGDATA for pgBackRest.
cat >"$COMPOSE_FILE" <<EOF
# Generated by provision-fresh-restore-target.sh (D05-03).
# Container ${HOST_NAME}: bridge network ${NETWORK_NAME}, volumes independent of mini.
name: ${HOST_NAME}
services:
  restore-target:
    image: ${POSTGRES_IMAGE}
    container_name: ${HOST_NAME}
    restart: "no"
    env_file:
      - restore-target.env
    environment:
      PGDATA: ${CONTAINER_PGDATA}
      MINI_HOST: ${MINI_HOST}
      R2_CREDENTIAL_KIND: object-read-only
    volumes:
      - ${VOLUME_PGDATA}:${CONTAINER_PGDATA}
      - ${VOLUME_BLOB}:${CONTAINER_BLOB}
      - ${ROOT}/scripts/prove-isolation.sh:/usr/local/bin/prove-isolation.sh:ro
      - ${RESTORE_CONF_DIR}/pgbackrest.conf:/etc/pgbackrest/pgbackrest.conf:ro
    ports:
      # Reserved for D05-04 after restore + postgres start; not auto-listening now.
      - "127.0.0.1:${RESTORE_PG_PORT}:5432"
    networks:
      - restore_net
    # Do NOT use network_mode: host (would share mini host network routes).
    entrypoint: ["/bin/bash", "-c"]
    command:
      - |
        set -euo pipefail
        mkdir -p '${CONTAINER_PGDATA}' '${CONTAINER_BLOB}'
        # Ensure empty (volume may be re-created by provision script).
        find '${CONTAINER_PGDATA}' -mindepth 1 -delete 2>/dev/null || true
        find '${CONTAINER_BLOB}' -mindepth 1 -delete 2>/dev/null || true
        chown -R postgres:postgres '${CONTAINER_PGDATA}' '${CONTAINER_BLOB}' 2>/dev/null || true
        chmod 700 '${CONTAINER_PGDATA}' || true
        chmod 755 '${CONTAINER_BLOB}' || true
        # Prove writable as postgres when possible.
        su-exec postgres touch '${CONTAINER_PGDATA}/.w' 2>/dev/null && su-exec postgres rm -f '${CONTAINER_PGDATA}/.w' || {
          touch '${CONTAINER_PGDATA}/.w' && rm -f '${CONTAINER_PGDATA}/.w'
        }
        touch '${CONTAINER_BLOB}/.w' && rm -f '${CONTAINER_BLOB}/.w'
        echo "[fresh-restore] empty PGDATA+blob ready; postgres binaries present; sleeping for D05-04"
        postgres --version || true
        exec sleep infinity
    healthcheck:
      test: ["CMD-SHELL", "test -d ${CONTAINER_PGDATA} && test -d ${CONTAINER_BLOB} && postgres --version >/dev/null"]
      interval: 3s
      timeout: 3s
      retries: 20

networks:
  restore_net:
    name: ${NETWORK_NAME}
    driver: bridge

# GATE-FIX-S28R3-QA1: bind-backed local volumes so host Bun can write the same
# bytes the container mounts (Colima/Desktop Mountpoints under /var/lib/docker
# are not host-accessible). device= must be absolute host paths.
volumes:
  ${VOLUME_PGDATA}:
    name: ${VOLUME_PGDATA}
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${HOST_PGDATA_STAGING}
  ${VOLUME_BLOB}:
    name: ${VOLUME_BLOB}
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${HOST_BLOB_STAGING}
EOF
log "wrote compose: $COMPOSE_FILE"
log "bind-backed volumes: ${VOLUME_PGDATA} → ${HOST_PGDATA_STAGING}"
log "bind-backed volumes: ${VOLUME_BLOB} → ${HOST_BLOB_STAGING}"

cat >"$PROBE_WRAPPER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
DIR="\$(cd "\$(dirname "\$0")" && pwd)"
# Drop ambient parent/RW secrets so operator shell cannot poison the probe.
unset R2_PARENT_ACCESS_KEY_ID R2_PARENT_SECRET_ACCESS_KEY \\
  R2_READ_WRITE_CREDENTIAL R2_READ_WRITE_ACCESS_KEY_ID R2_READ_WRITE_SECRET_ACCESS_KEY \\
  R2_RW_ACCESS_KEY_ID R2_RW_SECRET_ACCESS_KEY 2>/dev/null || true
set -a
# shellcheck disable=SC1091
source "\${DIR}/restore-target.env"
set +a
exec bash "${ROOT}/scripts/prove-isolation.sh" "\$@"
EOF
chmod +x "$PROBE_WRAPPER"

docker_available() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

CONTAINER_STARTED=0
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "dry-run: skip docker start (compose + env ready under $TARGET_DIR)"
elif docker_available; then
  log "docker available — bringing up ${HOST_NAME}"
  docker rm -f "$HOST_NAME" >/dev/null 2>&1 || true
  docker volume rm -f "$VOLUME_PGDATA" "$VOLUME_BLOB" >/dev/null 2>&1 || true
  (
    cd "$TARGET_DIR"
    docker compose -f docker-compose.yml pull 2>/dev/null || true
    docker compose -f docker-compose.yml up -d
  )
  log "waiting for container health (${HOST_NAME})"
  for _ in $(seq 1 40); do
    if docker exec "$HOST_NAME" postgres --version >/dev/null 2>&1 \
      && docker exec "$HOST_NAME" test -d "$CONTAINER_PGDATA" \
      && docker exec "$HOST_NAME" test -d "$CONTAINER_BLOB"; then
      break
    fi
    sleep 1
  done
  if ! docker exec "$HOST_NAME" postgres --version >/dev/null 2>&1; then
    echo "error: container ${HOST_NAME} did not become ready" >&2
    docker logs "$HOST_NAME" 2>&1 | tail -50 >&2 || true
    exit 1
  fi
  # AC-3 inside container: empty dirs
  in_pg="$(docker exec "$HOST_NAME" sh -c "find '${CONTAINER_PGDATA}' -mindepth 1 | wc -l" | tr -d ' ')"
  in_blob="$(docker exec "$HOST_NAME" sh -c "find '${CONTAINER_BLOB}' -mindepth 1 | wc -l" | tr -d ' ')"
  if [[ "$in_pg" != "0" || "$in_blob" != "0" ]]; then
    echo "error: container PGDATA/blob not empty (pg=${in_pg} blob=${in_blob})" >&2
    exit 1
  fi
  docker exec "$HOST_NAME" postgres --version
  CONTAINER_STARTED=1
  log "container ${HOST_NAME} is up (network=${NETWORK_NAME})"
else
  log "WARNING: Docker daemon not available — wrote compose/env/dirs only"
  log "  start Docker/Colima then re-run, or: (cd $TARGET_DIR && docker compose up -d)"
fi

DOC_PATHS_FILE="${TARGET_DIR}/paths.txt"
cat >"$DOC_PATHS_FILE" <<EOF
host_staging_pgdata=${HOST_PGDATA_STAGING}
host_staging_blob=${HOST_BLOB_STAGING}
container_pgdata=${CONTAINER_PGDATA}
container_blob=${CONTAINER_BLOB}
container_name=${HOST_NAME}
compose_file=${COMPOSE_FILE}
env_file=${ENV_FILE}
mini_host=${MINI_HOST}
network=${NETWORK_NAME}
volumes=${VOLUME_PGDATA},${VOLUME_BLOB}
container_started=${CONTAINER_STARTED}
reserved_pg_port=127.0.0.1:${RESTORE_PG_PORT}
EOF
log "path map: $DOC_PATHS_FILE"

if [[ "$SKIP_ISOLATION" -eq 1 ]]; then
  log "skip isolation probe (--skip-isolation)"
else
  log "running prove-isolation.sh (mini=${MINI_HOST})"
  set +e
  bash "$PROBE_WRAPPER" --mini-host "$MINI_HOST"
  probe_rc=$?
  set -e
  if [[ $probe_rc -ne 0 ]]; then
    echo "error: isolation probe failed (exit $probe_rc)" >&2
    exit "$probe_rc"
  fi
  log "isolation probe PASS"
fi

if [[ "$CONTAINER_STARTED" -eq 1 && "$SKIP_ISOLATION" -eq 0 ]]; then
  log "running prove-isolation inside container ${HOST_NAME}"
  set +e
  # Inject only RO restore credentials; do not invent empty RW var names.
  docker exec \
    -e "MINI_HOST=${MINI_HOST}" \
    -e "R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID}" \
    -e "R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY}" \
    -e "R2_CREDENTIAL_KIND=${R2_CREDENTIAL_KIND}" \
    -e "R2_CREDENTIAL_POLICY=${R2_CREDENTIAL_POLICY}" \
    -e "R2_BUCKET_NAME=${R2_BUCKET_NAME}" \
    -e "R2_ENDPOINT=${R2_ENDPOINT}" \
    "$HOST_NAME" \
    env -u R2_PARENT_ACCESS_KEY_ID -u R2_PARENT_SECRET_ACCESS_KEY \
      -u R2_READ_WRITE_CREDENTIAL -u R2_READ_WRITE_ACCESS_KEY_ID \
      -u R2_READ_WRITE_SECRET_ACCESS_KEY \
      bash /usr/local/bin/prove-isolation.sh --mini-host "$MINI_HOST"
  in_rc=$?
  set -e
  if [[ $in_rc -ne 0 ]]; then
    echo "error: in-container isolation probe failed (exit $in_rc)" >&2
    exit "$in_rc"
  fi
  log "in-container isolation probe PASS"
fi

log "SUCCESS: fresh restore target '${HOST_NAME}' provisioned"
log "  compose: $COMPOSE_FILE"
log "  env:     $ENV_FILE (mode 0600, read-only R2 policy)"
log "  staging: $HOST_PGDATA_STAGING (empty) + $HOST_BLOB_STAGING (empty)"
if [[ "$CONTAINER_STARTED" -eq 1 ]]; then
  log "  docker:  container ${HOST_NAME} network=${NETWORK_NAME}"
else
  log "  docker:  not started (dry-run or daemon down) — compose is ready"
fi
exit 0
