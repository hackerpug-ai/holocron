#!/bin/bash
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

# GATE-FIX-S28R3-QA22: shell-native root resolution (no PATH dirname before secrets).
_SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[[ "$_SCRIPT_DIR" == "${BASH_SOURCE[0]}" ]] && _SCRIPT_DIR="."
ROOT="$(cd "$_SCRIPT_DIR/.." && pwd)"
cd "$ROOT"
# GATE-FIX-S28R3-QA13 shared live provider helpers
# shellcheck source=scripts/lib/r2-ro-live.sh
source "$ROOT/scripts/lib/r2-ro-live.sh"

# GATE-FIX-S28R3-QA23: absolute docker/grep only (no PATH lookup while credentials ambient).
# Same trusted candidate list as prove-isolation / gate-plan consumers.
DOCKER_BIN=""
for _d in /usr/bin/docker /usr/local/bin/docker /opt/homebrew/bin/docker; do
  if [[ -x "$_d" ]]; then DOCKER_BIN="$_d"; break; fi
done
GREP_BIN="${GREP_BIN:-/usr/bin/grep}"
[[ -x "$GREP_BIN" ]] || GREP_BIN="/usr/bin/grep"

# GATE-FIX-S28R3-QA14: production refuses test/CLI seams.
if [[ -n "${HOLO_FIRE_DRILL_FAKE_VOLUMES:-}" ]]; then
  echo "error: GATE-FIX-S28R3-QA14 refuses HOLO_FIRE_DRILL_FAKE_VOLUMES in production (harness-only)" >&2
  exit 2
fi
if [[ -n "${HOLO_QA_PROOF_MUTATE:-}" ]]; then
  echo "error: GATE-FIX-S28R3-QA14 refuses HOLO_QA_PROOF_MUTATE in production" >&2
  exit 2
fi

# GATE-FIX-S28R3-QA25: exclusive host fire-drill lock (mkdir). Concurrent agents
# share pgBackRest restore locks and mislabel exit-50 as integrity/WAL failures.
_FIRE_DRILL_LOCKDIR="${HOLO_FIRE_DRILL_LOCKDIR:-$ROOT/.tmp/fire-drill-host.lockdir}"
mkdir -p "${_FIRE_DRILL_LOCKDIR%/*}" 2>/dev/null || true
_fire_drill_lock_deadline=$(( $(/bin/date +%s) + ${HOLO_FIRE_DRILL_LOCK_WAIT_SEC:-600} ))
while ! /bin/mkdir "$_FIRE_DRILL_LOCKDIR" 2>/dev/null; do
  if [[ $(/bin/date +%s) -ge $_fire_drill_lock_deadline ]]; then
    echo "error: GATE-FIX-S28R3-QA25 fire-drill host lock timeout (another fire-drill holds $_FIRE_DRILL_LOCKDIR)" >&2
    exit 2
  fi
  # Stale lock recovery: if holder PID is dead, steal.
  if [[ -f "$_FIRE_DRILL_LOCKDIR/pid" ]]; then
    _holder="$(/bin/cat "$_FIRE_DRILL_LOCKDIR/pid" 2>/dev/null || true)"
    if [[ -n "$_holder" ]] && ! /bin/kill -0 "$_holder" 2>/dev/null; then
      /bin/rm -rf "$_FIRE_DRILL_LOCKDIR" 2>/dev/null || true
      continue
    fi
  fi
  sleep 2
done
printf '%s\n' "$$" >"$_FIRE_DRILL_LOCKDIR/pid"
trap '/bin/rm -rf "$_FIRE_DRILL_LOCKDIR" 2>/dev/null || true' EXIT INT TERM

HOST_NAME=""
TARGET_TIMESTAMP=""
ATTESTATION=""
RESOLVE_ONLY=0
REPORT=""
SOURCE_BLOB_ROOT=""
# GATE-FIX-S28R3-QA17/QA19: refuse ambient BUN_BIN; only root-owned trust-chain Bun may receive restore secrets.
if [[ -n "${BUN_BIN:-}" ]]; then
  echo "error: GATE-FIX-S28R3-QA17 refuses ambient BUN_BIN (fixed absolute runtime only)" >&2
  exit 2
fi
BUN_BIN=""
BUN_TRUSTED=0
# Defer candidate resolution until after r2_ro_init is available; placeholder only.
HOLO_CLI="$ROOT/services/platform/src/cli/holo.ts"

usage() {
  /bin/cat <<'EOF'
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

# GATE-FIX-S28R3-QA25: resolve absolute readable secrets.yaml for worktree isolation.
# Precedence: HOLOCRON_SECRETS_PATH → HOLO_SECRETS_PATH → $ROOT/.../secrets.yaml →
# primary checkout operator secrets (worktree has no secrets.yaml). Fail closed if none readable.
# Operator secrets source for worktree isolation (never log secret values):
#   /Users/inference1/Projects/holocron/services/platform/config/secrets.yaml
PRIMARY_OPERATOR_SECRETS="/Users/inference1/Projects/holocron/services/platform/config/secrets.yaml"

resolve_absolute_secrets_path() {
  local cand=""
  for cand in \
    "${HOLOCRON_SECRETS_PATH:-}" \
    "${HOLO_SECRETS_PATH:-}" \
    "$ROOT/services/platform/config/secrets.yaml" \
    "$PRIMARY_OPERATOR_SECRETS"; do
    [[ -n "$cand" ]] || continue
    # Absolute only for child FD binding; expand relative against ROOT.
    if [[ "$cand" != /* ]]; then
      cand="$ROOT/$cand"
    fi
    if [[ -f "$cand" && -r "$cand" ]]; then
      # canonicalize when possible
      if command -v /usr/bin/python3 >/dev/null 2>&1; then
        cand="$(/usr/bin/python3 -E -s -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$cand" 2>/dev/null || echo "$cand")"
      fi
      printf '%s' "$cand"
      return 0
    fi
  done
  return 1
}

# Resolve writer + restore (+ shared R2 config + restore secrets) from secrets file then env override.
# Sets: WRITER_AK, WRITER_SK, RESTORE_AK, RESTORE_SK, RESTORE_ST,
#       DATA_RESTORE_AK, DATA_RESTORE_SK, DATA_RESTORE_ST
# Exports (when unset in parent, from secrets file): R2_REPO_CIPHER_PASS, RESTIC_PASSWORD,
# R2_RESTIC_PREFIX, shared R2_* config, and absolute HOLO_SECRETS_PATH / HOLOCRON_SECRETS_PATH.
# NEVER logs secret values — presence only.
resolve_r2_identities_from_secrets_and_env() {
  local secrets=""
  if ! secrets="$(resolve_absolute_secrets_path)"; then
    err "GATE-FIX-S28R3-QA25 secrets.yaml not readable (set HOLOCRON_SECRETS_PATH/HOLO_SECRETS_PATH or provide operator secrets)"
    echo "RESIDUAL: DEPENDENCY-S28-SECRETS" >&2
    exit 2
  fi
  # Force absolute secrets path on parent so child FD + TS resolution both see a real file.
  export HOLO_SECRETS_PATH="$secrets"
  export HOLOCRON_SECRETS_PATH="$secrets"

  local file_writer_ak="" file_writer_sk="" file_writer_st=""
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
        R2_SESSION_TOKEN) file_writer_st="$v" ;;
        R2_RESTORE_ACCESS_KEY_ID) file_restore_ak="$v" ;;
        R2_RESTORE_SECRET_ACCESS_KEY) file_restore_sk="$v" ;;
        R2_RESTORE_SESSION_TOKEN) file_restore_st="$v" ;;
        # GATE-FIX-S28R3-QA10 / M1: never auto-export writer R2_SESSION_TOKEN into restore path.
        # Shared R2 config + restore-required secrets (cipher/restic) when unset in parent.
        # Never auto-export PGBACKREST_CONFIG / PGBACKREST_PG1_PATH from secrets —
        # live mini paths poison fire-drill scratch restore (GATE-FIX-S28R3-QA24/QA25).
        R2_ENDPOINT|R2_ACCOUNT_ID|R2_BUCKET_NAME|R2_PGBACKREST_PREFIX|R2_RESTORE_OBJECT_PREFIX|R2_RESTIC_PREFIX|R2_REPO_CIPHER_PASS|RESTIC_PASSWORD|R2_CREDENTIAL_POLICY|PGBACKREST_STANZA)
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
  # Writer session is captured for fire-drill data-plane fallback only (not RO proof).
  if [[ -n "${R2_SESSION_TOKEN:-}" ]]; then
    WRITER_ST="$R2_SESSION_TOKEN"
  else
    WRITER_ST="$file_writer_st"
  fi
  # Resolve the restore tuple atomically. A complete env keypair may correctly
  # have no session token; never graft the file token onto it. Only when no
  # restore tuple fields are supplied by env do all three fields come from the
  # canonical file. Partial env tuples fail closed.
  if [[ -n "${R2_RESTORE_ACCESS_KEY_ID:-}" && -n "${R2_RESTORE_SECRET_ACCESS_KEY:-}" ]]; then
    RESTORE_AK="$R2_RESTORE_ACCESS_KEY_ID"
    RESTORE_SK="$R2_RESTORE_SECRET_ACCESS_KEY"
    RESTORE_ST="${R2_RESTORE_SESSION_TOKEN:-}"
  elif [[ -n "${R2_RESTORE_ACCESS_KEY_ID:-}" || -n "${R2_RESTORE_SECRET_ACCESS_KEY:-}" || -n "${R2_RESTORE_SESSION_TOKEN:-}" ]]; then
    err "partial R2_RESTORE_* tuple in env; refusing secrets-file field mixing"
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  else
    RESTORE_AK="$file_restore_ak"
    RESTORE_SK="$file_restore_sk"
    RESTORE_ST="$file_restore_st"
  fi
  DATA_RESTORE_AK="${R2_FIRE_DRILL_DATA_ACCESS_KEY_ID:-}"
  DATA_RESTORE_SK="${R2_FIRE_DRILL_DATA_SECRET_ACCESS_KEY:-}"
  DATA_RESTORE_ST="${R2_FIRE_DRILL_DATA_SESSION_TOKEN:-}"
  if [[ -n "$DATA_RESTORE_AK" || -n "$DATA_RESTORE_SK" || -n "$DATA_RESTORE_ST" ]]; then
    if [[ -z "$DATA_RESTORE_AK" || -z "$DATA_RESTORE_SK" ]]; then
      err "partial R2_FIRE_DRILL_DATA_* tuple refused"
      echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
      exit 2
    fi
  fi
  if [[ -n "$RESTORE_AK" ]]; then
    export R2_RESTORE_ACCESS_KEY_ID="$RESTORE_AK"
  fi
  if [[ -n "$RESTORE_SK" ]]; then
    export R2_RESTORE_SECRET_ACCESS_KEY="$RESTORE_SK"
  fi
  if [[ -n "$RESTORE_ST" ]]; then
    export R2_RESTORE_SESSION_TOKEN="$RESTORE_ST"
  else
    unset R2_RESTORE_SESSION_TOKEN 2>/dev/null || true
  fi
  # Ensure generic writer session is not left as the restore session for RO proof.
  unset R2_SESSION_TOKEN 2>/dev/null || true
}

# GATE-FIX-S28R3-QA25: prefix-scoped RO temp credentials often cover only pgbackrest.
# Fire-drill data plane also needs recovery-baselines/ + restic List/Get. Probe via stdlib provider.
# Exit 0 only when BOTH prefixes allow List and sacrificial Put/Delete are
# explicitly AccessDenied. This is the data-plane read-only oracle.
# Credentials sealed from env key names only → FD 3 — NEVER secret values on argv/xtrace.
# Caller must export HOLO_PROBE_AK/SK/ST before calling (no positional secret args).
restore_covers_fire_drill_prefixes() (
  set +e
  local ep bucket prov
  ep="${R2_ENDPOINT:-}"
  bucket="${R2_BUCKET_NAME:-}"
  prov="$ROOT/scripts/lib/r2_s3_provider.py"
  [[ -n "${HOLO_PROBE_AK:-}" && -n "${HOLO_PROBE_SK:-}" && -n "$ep" && -n "$bucket" && -f "$prov" ]] || return 1
  # FD 3: ak\0sk\0st\0 sealed from env key names only.
  if ! r2_ro_open_fd3_from_env_values HOLO_PROBE_AK HOLO_PROBE_SK HOLO_PROBE_ST; then
    return 1
  fi
  local rc
  if /usr/bin/python3 -E -s - "$prov" "$ep" "$bucket" <<'PY' 2>/dev/null; then
import os, subprocess, sys

prov, endpoint, bucket = sys.argv[1], sys.argv[2], sys.argv[3]
raw = os.read(3, 1 << 20)
parts = raw.split(b"\0")
# trailing empty from final NUL
while parts and parts[-1] == b"":
    parts.pop()
if len(parts) < 2:
    sys.exit(2)
ak = parts[0].decode("utf-8", "surrogateescape")
sk = parts[1].decode("utf-8", "surrogateescape")
st = parts[2].decode("utf-8", "surrogateescape") if len(parts) > 2 else ""
env = {
    "PATH": "/usr/bin:/bin",
    "HOME": os.environ.get("HOME", "/tmp"),
    "LC_ALL": "C",
    "AWS_ACCESS_KEY_ID": ak,
    "AWS_SECRET_ACCESS_KEY": sk,
    "AWS_DEFAULT_REGION": "auto",
}
if st:
    env["AWS_SESSION_TOKEN"] = st
for prefix in ("recovery-baselines", "restic"):
    p = subprocess.run(
        [
            "/usr/bin/python3",
            "-E",
            "-s",
            prov,
            "list-prefix",
            "--endpoint",
            endpoint,
            "--bucket",
            bucket,
            "--prefix",
            prefix,
            "--max-keys",
            "3",
        ],
        env=env,
        capture_output=True,
        text=True,
        timeout=45,
    )
    if p.returncode != 0:
        sys.exit(1)
import uuid
probe_key = "drill-neg/fire-drill-data-ro-" + uuid.uuid4().hex
put = subprocess.run(
    ["/usr/bin/python3", "-E", "-s", prov, "put-object", "--endpoint", endpoint,
     "--bucket", bucket, "--key", probe_key],
    env=env, input="SACRIFICIAL_FIRE_DRILL_DATA_RO", capture_output=True, text=True, timeout=45,
)
if put.returncode == 0:
    subprocess.run(
        ["/usr/bin/python3", "-E", "-s", prov, "delete-object", "--endpoint", endpoint,
         "--bucket", bucket, "--key", probe_key],
        env=env, capture_output=True, text=True, timeout=45,
    )
    sys.exit(1)
if put.returncode != 2:
    sys.exit(1)
delete = subprocess.run(
    ["/usr/bin/python3", "-E", "-s", prov, "delete-object", "--endpoint", endpoint,
     "--bucket", bucket, "--key", probe_key],
    env=env, capture_output=True, text=True, timeout=45,
)
if delete.returncode != 2:
    sys.exit(1)
sys.exit(0)
PY
    rc=0
  else
    rc=$?
  fi
  exec 3<&- 2>/dev/null || true
  unset HOLO_PROBE_AK HOLO_PROBE_SK HOLO_PROBE_ST
  return "$rc"
)

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
  local rak="${1:-${RESTORE_AK:-${R2_RESTORE_ACCESS_KEY_ID:-}}}"
  local rsk="${2:-${RESTORE_SK:-${R2_RESTORE_SECRET_ACCESS_KEY:-}}}"
  local rst="${3:-${RESTORE_ST:-${R2_RESTORE_SESSION_TOKEN:-}}}"
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
  ep="$(r2_ro_field 1 "${established}")"
  bucket="$(r2_ro_field 2 "${established}")"
  prefix="$(r2_ro_field 3 "${established}")"
  kind="$(r2_ro_field 4 "${established}")"
  policy="$(r2_ro_field 5 "${established}")"
  expected_ctx="$(r2_ro_field 6 "${established}")"
  # GATE-FIX-S28R3-QA25: fingerprint from env (key names only on sealer argv).
  export R2_RESTORE_ACCESS_KEY_ID="$rak"
  export R2_RESTORE_SECRET_ACCESS_KEY="$rsk"
  export R2_RESTORE_SESSION_TOKEN="${rst:-}"
  expected_fp="$(r2_ro_tuple_fp16_from_env R2_RESTORE_ACCESS_KEY_ID R2_RESTORE_SECRET_ACCESS_KEY R2_RESTORE_SESSION_TOKEN)"
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
  # GATE-FIX-S28R3-QA25: sealed-from-env only — never KEY=secret on intermediate argv.
  local _prove_log _save_path _save_home _save_lc
  _prove_log="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/holo-prove.log.XXXXXX")"
  _save_path="${PATH-}"
  _save_home="${HOME-}"
  _save_lc="${LC_ALL-}"
  # Export prove child env (values in this shell only; sealer reads key names).
  export PATH="/usr/bin:/bin"
  export HOME="${HOME:-/tmp}"
  export LC_ALL=C
  export REQUIRE_LIVE_R2_RO=1
  export HOLO_R2_RO_PROOF_OUT="$proof"
  export HOLO_R2_CONTEXT_FP16="$expected_ctx"
  export R2_ACCESS_KEY_ID="${AMBIENT_R2_ACCESS_KEY_ID:-${WRITER_AK:-${R2_ACCESS_KEY_ID:-}}}"
  export R2_SECRET_ACCESS_KEY="${AMBIENT_R2_SECRET_ACCESS_KEY:-${WRITER_SK:-${R2_SECRET_ACCESS_KEY:-}}}"
  export R2_ENDPOINT="$ep"
  export R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-}"
  export R2_BUCKET_NAME="$bucket"
  export R2_PGBACKREST_PREFIX="$prefix"
  export R2_RESTORE_OBJECT_PREFIX="$prefix"
  export R2_CREDENTIAL_KIND="$kind"
  export R2_CREDENTIAL_POLICY="$policy"
  export BACKUP_R2_ACCESS_KEY_ID="${BACKUP_R2_ACCESS_KEY_ID:-${WRITER_AK:-}}"
  export BACKUP_R2_SECRET_ACCESS_KEY="${BACKUP_R2_SECRET_ACCESS_KEY:-${WRITER_SK:-}}"
  set +e
  r2_ro_exec_isolated_from_env \
    PATH HOME LC_ALL REQUIRE_LIVE_R2_RO HOLO_R2_RO_PROOF_OUT HOLO_R2_CONTEXT_FP16 \
    R2_RESTORE_ACCESS_KEY_ID R2_RESTORE_SECRET_ACCESS_KEY R2_RESTORE_SESSION_TOKEN \
    R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY \
    R2_ENDPOINT R2_ACCOUNT_ID R2_BUCKET_NAME R2_PGBACKREST_PREFIX R2_RESTORE_OBJECT_PREFIX \
    R2_CREDENTIAL_KIND R2_CREDENTIAL_POLICY \
    R2_SCOPE_PROBE_IN_KEY R2_SCOPE_PROBE_OUT_KEY \
    HOLOCRON_SECRETS_PATH HOLO_SECRETS_PATH \
    BACKUP_R2_ACCESS_KEY_ID BACKUP_R2_SECRET_ACCESS_KEY \
    R2_PARENT_ACCESS_KEY_ID R2_PARENT_SECRET_ACCESS_KEY \
    -- \
    /bin/bash "$prove_cmd" >"$_prove_log" 2>&1
  local _prove_rc=$?
  # Restore parent PATH/HOME/LC_ALL so later docker/bun resolution is unchanged.
  export PATH="$_save_path"
  export HOME="$_save_home"
  export LC_ALL="$_save_lc"
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

assert_restore_credential_tuple() {
  # GATE-FIX-S28R3-QA8/QA9 identity + M1 proof bind. Fail closed.
  WRITER_AK=""
  WRITER_SK=""
  WRITER_ST=""
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
if [[ "${REQUIRE_LIVE_R2_RO:-0}" == "1" ]] && {
  [[ "${R2_RESTORE_OBJECT_PREFIX:-}" != "pgbackrest" ]] ||
  [[ "${R2_PGBACKREST_PREFIX:-}" != "pgbackrest" ]]
}; then
  err "DEPENDENCY-S28-R2-RO — REQUIRE_LIVE_R2_RO=1 requires both explicit pgbackrest restore prefixes"
  echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
  exit 2
fi
if [[ "$RESOLVE_ONLY" -eq 0 ]]; then
  assert_restore_credential_tuple
fi

# GATE-FIX-S28R3-QA17: fake-volume implementation removed from production (harness-only).
if [[ -n "${HOLO_FIRE_DRILL_FAKE_VOLUMES:-}" ]]; then
  err "GATE-FIX-S28R3-QA17 refuses HOLO_FIRE_DRILL_FAKE_VOLUMES in production (harness-only)"
  exit 2
fi
SKIP_DOCKER_VOLUME_RESOLVE=0

if [[ "$SKIP_DOCKER_VOLUME_RESOLVE" -eq 0 ]]; then
  if [[ -z "${DOCKER_BIN:-}" || ! -x "$DOCKER_BIN" ]]; then
    err "docker absolute executable missing — refuse fresh-target volume resolve"
    exit 2
  fi
fi

volume_exists() {
  local vol="$1"
  "$DOCKER_BIN" volume inspect "$vol" >/dev/null 2>&1
}

volume_mountpoint() {
  local vol="$1"
  local mp
  mp="$("$DOCKER_BIN" volume inspect -f '{{ .Mountpoint }}' "$vol" 2>/dev/null || true)"
  if [[ -n "$mp" && "$mp" != "<no value>" ]]; then
    printf '%s' "$mp"
    return 0
  fi
  return 1
}

volume_bind_device() {
  local vol="$1"
  local device
  # volume Options.device template (bind-backed local volumes)
  device="$("$DOCKER_BIN" volume inspect -f '{{ if .Options }}{{ index .Options "device" }}{{ end }}' "$vol" 2>/dev/null || true)"
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
  line="$("$GREP_BIN" -E "^${key}=" "$file" 2>/dev/null | /usr/bin/head -1 || true)"
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
  "$DOCKER_BIN" inspect -f '{{ .State.Running }}' "$HOST_NAME" 2>/dev/null | "$GREP_BIN" -qi true
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
if [[ -n "${DOCKER_BIN:-}" ]] && "$DOCKER_BIN" inspect "$HOST_NAME" >/dev/null 2>&1; then
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
  "resolved_at": "$(/bin/date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
)"

if [[ -n "$ATTESTATION" ]]; then
  _att_dir="${ATTESTATION%/*}"
  [[ -n "$_att_dir" && "$_att_dir" != "$ATTESTATION" ]] && mkdir -p "$_att_dir"
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
_report_dir="${REPORT_PATH%/*}"
[[ -n "$_report_dir" && "$_report_dir" != "$REPORT_PATH" ]] && mkdir -p "$_report_dir"

# Credential tuple already validated + proof-bound early (assert_restore_credential_tuple).
# ── GATE-FIX-S28R3-QA3 / C-1: restore-only minimal child env ─────────────────
# Map verified distinct R2_RESTORE_* → R2_ACCESS_* for loadBackupConfig(); never
# leak backup-writer R2_ACCESS_* into the fire-drill process.

# Optional redacted env dump for tests (keys + presence/length/hash only — never raw secrets).
# GATE-FIX-S28R3-QA22: pass ak identity flags over FD 3 — never secrets on argv.
if [[ -n "${HOLO_FIRE_DRILL_ENV_DUMP:-}" ]]; then
  _env_dump_dir="${HOLO_FIRE_DRILL_ENV_DUMP%/*}"
  [[ -n "$_env_dump_dir" && "$_env_dump_dir" != "$HOLO_FIRE_DRILL_ENV_DUMP" ]] && mkdir -p "$_env_dump_dir"
  _restore_eq_writer=0
  [[ -n "$RESTORE_AK" && -n "$WRITER_AK" && "$RESTORE_AK" == "$WRITER_AK" ]] && _restore_eq_writer=1
  _restore_present=0
  [[ -n "$RESTORE_AK" ]] && _restore_present=1
  /usr/bin/python3 -E -s - "$HOLO_FIRE_DRILL_ENV_DUMP" "$_restore_present" "$_restore_eq_writer" <<'PY' || true
import hashlib, json, os, sys
path, restore_present, restore_eq_writer = sys.argv[1], sys.argv[2] == "1", sys.argv[3] == "1"
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
    "restore_ak_distinct_from_writer": bool(restore_present) and not restore_eq_writer,
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
# GATE-FIX-S28R3-QA18/QA21: fixed PATH only — never forward caller PATH or Homebrew.
# Credential-bearing child must NOT discover pgbackrest/restic via PATH/Homebrew.
# Operational prerequisite: root-owned pgBackRest/restic at /usr/local/bin or /usr/bin
# (validated by restore.ts / recovery-baseline.ts before credentials are used).
CHILD_PATH="/usr/bin:/bin"
CHILD_HOME="${HOME:-/tmp}"
CHILD_TMPDIR="${TMPDIR:-/tmp}"
CHILD_USER="${USER:-$(/usr/bin/id -un 2>/dev/null || echo nobody)}"
CHILD_LANG="${LANG:-C.UTF-8}"
CHILD_TERM="${TERM:-dumb}"

# GATE-FIX-S28R3-QA21: resolve trusted restore tools BEFORE credentials enter child env.
# Prefer fixed absolute root-owned candidates only (same trust class as Bun via r2_ro_validate_root_bin).
TRUSTED_PGBACKREST=""
TRUSTED_RESTIC=""
for _cand in "${PGBACKREST_BIN:-}" /usr/local/bin/pgbackrest /usr/bin/pgbackrest; do
  [[ -n "$_cand" && -x "$_cand" ]] || continue
  if _resolved="$(r2_ro_validate_root_bin "$_cand" 2>/dev/null)"; then
    TRUSTED_PGBACKREST="$_resolved"
    break
  fi
done
for _cand in "${RESTIC_BIN:-}" /usr/local/bin/restic /usr/bin/restic; do
  [[ -n "$_cand" && -x "$_cand" ]] || continue
  if _resolved="$(r2_ro_validate_root_bin "$_cand" 2>/dev/null)"; then
    TRUSTED_RESTIC="$_resolved"
    break
  fi
done
# Note: missing tools are fail-closed inside the TypeScript restore/baseline path when invoked.
# Non-TS recorders (harness) do not need them; we only pass validated absolute paths when present.

# Build env -i argument list (KEY=VAL pairs).
# GATE-FIX-S28R3-QA25 data-plane credential selection (after RO proof already closed):
#   - Prefer R2_RESTORE_* when it can List recovery-baselines/ + restic/ (full fire-drill scope).
#   - Else use the durable R2_FIRE_DRILL_DATA_* tuple preserved before the
#     pgbackrest-only proof mint, after independently proving baseline/restic
#     reads plus Put/Delete denial.
#   - Writer credentials are never a data-plane fallback.
CHILD_DATA_AK="$RESTORE_AK"
CHILD_DATA_SK="$RESTORE_SK"
CHILD_DATA_ST="$RESTORE_ST"
CHILD_DATA_SOURCE="restore-ro"
# Probe restore scope via env-sealed FD only (no secret positional args / xtrace).
export HOLO_PROBE_AK="$RESTORE_AK"
export HOLO_PROBE_SK="$RESTORE_SK"
export HOLO_PROBE_ST="${RESTORE_ST:-}"
if ! restore_covers_fire_drill_prefixes; then
  if [[ -z "${DATA_RESTORE_AK:-}" || -z "${DATA_RESTORE_SK:-}" ]]; then
    err "restore proof tuple lacks fire-drill scope and no complete R2_FIRE_DRILL_DATA_* read-only tuple is available"
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
  if [[ -n "${WRITER_SK:-}" && "$DATA_RESTORE_SK" == "$WRITER_SK" ]]; then
    err "R2_FIRE_DRILL_DATA_* is writer-equivalent; refusing writer fallback"
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
  export HOLO_PROBE_AK="$DATA_RESTORE_AK"
  export HOLO_PROBE_SK="$DATA_RESTORE_SK"
  export HOLO_PROBE_ST="${DATA_RESTORE_ST:-}"
  if ! restore_covers_fire_drill_prefixes; then
    err "R2_FIRE_DRILL_DATA_* failed baseline/restic read plus Put/Delete-denial proof"
    echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
    exit 2
  fi
  CHILD_DATA_AK="$DATA_RESTORE_AK"
  CHILD_DATA_SK="$DATA_RESTORE_SK"
  CHILD_DATA_ST="${DATA_RESTORE_ST:-}"
  CHILD_DATA_SOURCE="verified-read-only-data-tuple"
  log "restore proof tuple is pgbackrest-scoped; child data-plane uses separately verified read-only data tuple (values not logged)"
else
  log "restore tuple covers recovery-baselines/restic and denies Put/Delete — child data-plane uses restore identity"
fi

# GATE-FIX-S28R3-QA25: child env is sealed from key NAMES only (values already in this shell).
# Export every bound key into the parent first, then list names for r2_ro_exec_isolated_from_env.
# NEVER build KEY=secret strings for intermediate process argv / process-sub printf.
export PATH="$CHILD_PATH"
export HOME="$CHILD_HOME"
export TMPDIR="$CHILD_TMPDIR"
export USER="$CHILD_USER"
export LANG="$CHILD_LANG"
export TERM="$CHILD_TERM"
export PWD="$ROOT"
export R2_ACCESS_KEY_ID="$CHILD_DATA_AK"
export R2_SECRET_ACCESS_KEY="$CHILD_DATA_SK"
export R2_RESTORE_ACCESS_KEY_ID="$CHILD_DATA_AK"
export R2_RESTORE_SECRET_ACCESS_KEY="$CHILD_DATA_SK"
if [[ -n "$CHILD_DATA_ST" ]]; then
  export R2_SESSION_TOKEN="$CHILD_DATA_ST"
else
  unset R2_SESSION_TOKEN 2>/dev/null || true
fi
if [[ -n "$CHILD_DATA_ST" ]]; then
  export R2_RESTORE_SESSION_TOKEN="$CHILD_DATA_ST"
else
  unset R2_RESTORE_SESSION_TOKEN 2>/dev/null || true
fi
export HOLO_FIRE_DRILL_CHILD_DATA_SOURCE="$CHILD_DATA_SOURCE"
if [[ -n "$TRUSTED_PGBACKREST" ]]; then
  export PGBACKREST_BIN="$TRUSTED_PGBACKREST"
fi
if [[ -n "$TRUSTED_RESTIC" ]]; then
  export RESTIC_BIN="$TRUSTED_RESTIC"
fi
# GATE-FIX-S28R3-QA3 / C-2: NEVER forward DATABASE_URL or PG* (fresh-target is baseline-only).
# GATE-FIX-S28R3-QA24: NEVER forward PGBACKREST_PG1_PATH.
#
# GATE-FIX-S28R3-QA25/QA26: secrets path + R2_REPO_CIPHER_PASS must reach the clean-env
# TypeScript fire-drill child via FD. Non-TS HOLO_CLI recorders (harness unit tests) do not
# load restic/pgbackrest and must not require cipher/secrets presence.
_holo_cli_is_ts=0
case "${HOLO_CLI:-}" in
  *.ts|*.js|*.mjs|*.cjs) _holo_cli_is_ts=1 ;;
esac
if [[ "$_holo_cli_is_ts" -eq 1 ]]; then
  if ! _resolved_secrets="$(resolve_absolute_secrets_path)"; then
    err "GATE-FIX-S28R3-QA25 refuse credentialed TypeScript child: secrets.yaml not readable (HOLOCRON_SECRETS_PATH/HOLO_SECRETS_PATH)"
    echo "RESIDUAL: DEPENDENCY-S28-SECRETS" >&2
    exit 2
  fi
  export HOLO_SECRETS_PATH="$_resolved_secrets"
  export HOLOCRON_SECRETS_PATH="$_resolved_secrets"
  if [[ -z "${R2_REPO_CIPHER_PASS:-}" ]]; then
    err "GATE-FIX-S28R3-QA25 refuse credentialed TypeScript child: R2_REPO_CIPHER_PASS empty after secrets resolve (value not logged)"
    echo "RESIDUAL: DEPENDENCY-S28-CIPHER" >&2
    exit 2
  fi
else
  # Harness/recorder path: forward secrets path when resolvable; never fail closed on cipher.
  if _resolved_secrets="$(resolve_absolute_secrets_path 2>/dev/null)"; then
    export HOLO_SECRETS_PATH="$_resolved_secrets"
    export HOLOCRON_SECRETS_PATH="$_resolved_secrets"
  fi
fi
if [[ -z "${R2_CREDENTIAL_KIND:-}" ]]; then
  export R2_CREDENTIAL_KIND="object-read-only"
fi

# Ordered list of env key names sealed onto FD 3 for the credentialed child.
CHILD_ENV_KEYS=(
  PATH HOME TMPDIR USER LANG TERM PWD
  R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY
  R2_RESTORE_ACCESS_KEY_ID R2_RESTORE_SECRET_ACCESS_KEY
  HOLO_SECRETS_PATH HOLOCRON_SECRETS_PATH R2_REPO_CIPHER_PASS
)
if [[ -n "${R2_SESSION_TOKEN:-}" ]]; then
  CHILD_ENV_KEYS+=(R2_SESSION_TOKEN)
fi
if [[ -n "${R2_RESTORE_SESSION_TOKEN:-}" ]]; then
  CHILD_ENV_KEYS+=(R2_RESTORE_SESSION_TOKEN)
fi
if [[ -n "${PGBACKREST_BIN:-}" ]]; then
  CHILD_ENV_KEYS+=(PGBACKREST_BIN)
fi
if [[ -n "${RESTIC_BIN:-}" ]]; then
  CHILD_ENV_KEYS+=(RESTIC_BIN)
fi
# GATE-FIX-S28R3-QA25: never forward PGBACKREST_CONFIG (live mini conf) into child.
for _k in \
  R2_ENDPOINT R2_ACCOUNT_ID R2_BUCKET_NAME R2_PGBACKREST_PREFIX R2_RESTORE_OBJECT_PREFIX \
  R2_RESTIC_PREFIX R2_CREDENTIAL_KIND R2_CREDENTIAL_POLICY \
  HOLO_FIRE_DRILL_ENV_DUMP HOLO_FIRE_DRILL_CHILD_DATA_SOURCE \
  STAGING_ROOT RESTIC_PASSWORD RESTIC_REPOSITORY \
  PGBACKREST_STANZA \
  CI PLATFORM_IT; do
  if [[ -n "${!_k:-}" ]]; then
    CHILD_ENV_KEYS+=("$_k")
  fi
done
# Explicitly strip live mini conf if ambient.
unset PGBACKREST_CONFIG PGBACKREST_PG1_PATH 2>/dev/null || true
# Optional redacted child-bound key presence inventory (never secret values).
if [[ -n "${HOLO_FIRE_DRILL_ENV_DUMP:-}" ]]; then
  _child_keys_path="${HOLO_FIRE_DRILL_ENV_DUMP%.json}-child-keys.json"
  if [[ "$_child_keys_path" == "$HOLO_FIRE_DRILL_ENV_DUMP" ]]; then
    _child_keys_path="${HOLO_FIRE_DRILL_ENV_DUMP}.child-keys.json"
  fi
  /usr/bin/python3 -E -s - "$_child_keys_path" <<'PY' || true
import json, os, sys
path = sys.argv[1]
secrets = os.environ.get("HOLO_SECRETS_PATH") or os.environ.get("HOLOCRON_SECRETS_PATH") or ""
payload = {
    "schema": "holo.fire-drill.child-bound-keys.v1",
    "R2_REPO_CIPHER_PASS": {"present": bool(os.environ.get("R2_REPO_CIPHER_PASS"))},
    "HOLO_SECRETS_PATH": {
        "present": bool(secrets),
        "basename": os.path.basename(secrets) if secrets else None,
    },
    "HOLOCRON_SECRETS_PATH": {"present": bool(os.environ.get("HOLOCRON_SECRETS_PATH"))},
    "RESTIC_PASSWORD": {"present": bool(os.environ.get("RESTIC_PASSWORD"))},
    "R2_RESTIC_PREFIX": {"present": bool(os.environ.get("R2_RESTIC_PREFIX"))},
    "note": "presence only; secret values never included",
}
with open(path, "w") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
PY
fi

# HOLO_CLI: .ts/.js via Bun only when Bun is root-owned trust-chain validated.
# GATE-FIX-S28R3-QA19: never pass restore credentials to user-owned Homebrew/local Bun.
if [[ "$HOLO_CLI" == *.ts || "$HOLO_CLI" == *.js || "$HOLO_CLI" == *.mjs || "$HOLO_CLI" == *.cjs ]]; then
  if [[ ! -f "$HOLO_CLI" ]]; then
    err "holo CLI missing: $HOLO_CLI"
    exit 2
  fi
  BUN_BIN=""
  BUN_TRUSTED=0
  # Prefer /usr/local/bin then /usr/bin; Homebrew only if root-owned (normally rejected).
  for _cand in /usr/local/bin/bun /usr/bin/bun /opt/homebrew/bin/bun; do
    if [[ -x "$_cand" ]]; then
      if _resolved="$(r2_ro_validate_root_bin "$_cand" 2>/dev/null)"; then
        BUN_BIN="$_resolved"
        BUN_TRUSTED=1
        break
      fi
    fi
  done
  if [[ "$BUN_TRUSTED" -ne 1 || -z "$BUN_BIN" ]]; then
    err "GATE-FIX-S28R3-QA19 refuses restore credentials to untrusted/user-owned Bun (require root-owned trust chain or non-TS HOLO_CLI recorder)"
    exit 2
  fi
  # TS path requires trusted restore tools on the host (operational prerequisite).
  if [[ -z "$TRUSTED_PGBACKREST" ]]; then
    err "GATE-FIX-S28R3-QA21 refuses credential-bearing TypeScript restore without root-owned pgbackrest at /usr/local/bin/pgbackrest or /usr/bin/pgbackrest (Homebrew/PATH discovery forbidden)"
    exit 2
  fi
  # Blob restore credentials (RESTIC_PASSWORD / AWS via resticEnv) require trusted restic too.
  if [[ -z "$TRUSTED_RESTIC" ]]; then
    err "GATE-FIX-S28R3-QA21 refuses credential-bearing TypeScript restore without root-owned restic at /usr/local/bin/restic or /usr/bin/restic (Homebrew/PATH discovery forbidden)"
    exit 2
  fi
  RUN_PREFIX=("$BUN_BIN" "$HOLO_CLI")
else
  if [[ ! -e "$HOLO_CLI" ]]; then
    err "holo CLI missing: $HOLO_CLI"
    exit 2
  fi
  # Absolute non-TS recorder/CLI only (no PATH lookup).
  case "$HOLO_CLI" in
    /*) ;;
    *)
      err "GATE-FIX-S28R3-QA19 HOLO_CLI must be absolute path"
      exit 2
      ;;
  esac
  RUN_PREFIX=("$HOLO_CLI")
fi

# GATE-FIX-S28R3-QA21: capture child stdout/stderr and redact secrets before emission
# (gate-plan tees this stream into durable evidence).
# GATE-FIX-S28R3-QA25: child env + redactor secrets sealed from env key names only —
# never process-sub printf of KEY=secret / raw secret fields onto intermediate argv.
_child_log="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/holo-fire-drill-child.XXXXXX")"
log "running restore-only child env: ${RUN_PREFIX[*]} ${ARGS[*]}"
_EXEC_ENV_FD_PY="${ROOT}/scripts/lib/exec-env-from-fd.py"
if [[ ! -f "$_EXEC_ENV_FD_PY" ]]; then
  err "GATE-FIX-S28R3-QA23 missing $_EXEC_ENV_FD_PY"
  exit 2
fi
set +e
# Seal child env from key names (values already exported above).
r2_ro_exec_isolated_from_env \
  "${CHILD_ENV_KEYS[@]}" \
  -- \
  "${RUN_PREFIX[@]}" "${ARGS[@]}" >"$_child_log" 2>&1
STATUS=$?
set -e
# Redact known secret values from child diagnostics before writing evidence.
# GATE-FIX-S28R3-QA25: fail-closed on FD 3 OSError / decode / shape failure —
# do NOT emit child log, delete child log, exit non-zero (never leak unredacted).
# FD 3: ak\0sk\0st\0 sealed from env key names (RESTORE_* already exported).
export HOLO_REDACT_AK="$RESTORE_AK"
export HOLO_REDACT_SK="$RESTORE_SK"
export HOLO_REDACT_ST="${RESTORE_ST:-}"
# Also redact data-plane identity if it differed from restore RO tuple.
export HOLO_REDACT_DATA_AK="$CHILD_DATA_AK"
export HOLO_REDACT_DATA_SK="$CHILD_DATA_SK"
export HOLO_REDACT_DATA_ST="${CHILD_DATA_ST:-}"
export HOLO_REDACT_CIPHER="${R2_REPO_CIPHER_PASS:-}"
export HOLO_REDACT_RESTIC="${RESTIC_PASSWORD:-}"
if ! r2_ro_open_fd3_from_env_values HOLO_REDACT_AK HOLO_REDACT_SK HOLO_REDACT_ST \
  HOLO_REDACT_DATA_AK HOLO_REDACT_DATA_SK HOLO_REDACT_DATA_ST \
  HOLO_REDACT_CIPHER HOLO_REDACT_RESTIC; then
  rm -f "$_child_log" 2>/dev/null || true
  err "GATE-FIX-S28R3-QA25 redactor seal failed (refusing unredacted child diagnostics)"
  exit 2
fi
set +e
/usr/bin/python3 -E -s - "$_child_log" <<'PY'
import os, re, sys

path = sys.argv[1]

def fail_closed(msg: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass
    print(f"error: GATE-FIX-S28R3-QA25 redactor fail-closed: {msg}", file=sys.stderr)
    sys.exit(2)

try:
    raw = os.read(3, 1 << 20)
except OSError as e:
    fail_closed(f"FD 3 unreadable: {e}")

if not raw:
    fail_closed("FD 3 empty (refuse unredacted child log)")
if not raw.endswith(b"\0"):
    fail_closed("FD 3 missing terminating NUL (truncated secrets tuple)")

parts = raw.split(b"\0")
if parts and parts[-1] == b"":
    parts = parts[:-1]
# GATE-FIX-S28R3-QA25: variable-length scrub list (restore triple + data-plane + cipher/restic).
if len(parts) < 3:
    fail_closed(f"FD 3 secrets tuple shape invalid (got {len(parts)} fields, need >=3)")

try:
    secrets = [p.decode("utf-8") for p in parts]
except UnicodeDecodeError as e:
    fail_closed(f"FD 3 secrets not valid UTF-8: {e}")

try:
    # replace: child tools may emit non-UTF8 progress bytes; still scrub secrets.
    text = open(path, "r", encoding="utf-8", errors="replace").read()
except OSError as e:
    fail_closed(f"child log unreadable: {e}")

# Longest-first replace so substrings of longer secrets don't leave residues.
for secret in sorted((s for s in secrets if s), key=len, reverse=True):
    text = text.replace(secret, "[redacted]")
text = re.sub(
    r"(?i)((?:api[_-]?key|secret|token|password)\s*[=:]\s*)\S+",
    r"\1[redacted]",
    text,
)
sys.stdout.write(text)
try:
    os.unlink(path)
except OSError:
    pass
sys.exit(0)
PY
_redact_rc=$?
exec 3<&- 2>/dev/null || true
unset HOLO_REDACT_AK HOLO_REDACT_SK HOLO_REDACT_ST HOLO_REDACT_DATA_AK HOLO_REDACT_DATA_SK HOLO_REDACT_DATA_ST HOLO_REDACT_CIPHER HOLO_REDACT_RESTIC
set -e
if [[ "$_redact_rc" -ne 0 ]]; then
  rm -f "$_child_log" 2>/dev/null || true
  err "GATE-FIX-S28R3-QA25 redactor fail-closed (refusing unredacted child diagnostics)"
  exit 2
fi
rm -f "$_child_log" 2>/dev/null || true

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
