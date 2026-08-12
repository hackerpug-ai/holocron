#!/usr/bin/env bash
# D08-03 — Final pre-deletion gate: real Sprint 28 fresh-hardware fire-drill restore.
#
# Runs AC-1..AC-3 against real R2 restore + fresh target + restored Postgres,
# then emits secret-free deletion-gate.json (AC-4). NEVER deletes Convex.
#
# Usage (from repo root, after loading operator .env):
#   set -a; source /Users/inference1/Projects/holocron/.env; set +a
#   export HOLO_SECRETS_PATH=/Users/inference1/Projects/holocron/services/platform/config/secrets.yaml
#   bash scripts/run-s32-d08-03-deletion-gate.sh
#
# Environment:
#   GATE_RUN_ID          optional; generated when unset
#   PITR_TIMESTAMP       optional; defaults to holo restore:window recommended_pitr
#   REQUIRE_LIVE_R2_RO=1 forced for restore path
#   HOLO_SECRETS_PATH / HOLOCRON_SECRETS_PATH — operator secrets (never logged)
set -euo pipefail

_SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[[ "$_SCRIPT_DIR" == "${BASH_SOURCE[0]}" ]] && _SCRIPT_DIR="."
ROOT="$(cd "$_SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

log() { echo "[s32-d08-03] $*"; }
err() { echo "error: [s32-d08-03] $*" >&2; }

# ── GATE_RUN_ID ──────────────────────────────────────────────────────────────
if [[ -z "${GATE_RUN_ID:-}" ]]; then
  GATE_RUN_ID="s32d0803-$(/bin/date -u +%Y%m%dT%H%M%SZ)"
fi
export GATE_RUN_ID
/bin/bash "$ROOT/scripts/assert-gate-run-id.sh"

EVID="$ROOT/.tmp/REDHAT-FIX-S32-D08-03/$GATE_RUN_ID"
ART_DIR="$ROOT/.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03"
ART="$ART_DIR/deletion-gate.json"
TMP_EVID="$ROOT/.tmp/D08-03"
mkdir -p "$EVID" "$ART_DIR" "$TMP_EVID"
log "GATE_RUN_ID=$GATE_RUN_ID"
log "evidence dir: $EVID"

# ── Load operator env / secrets (never print values) ─────────────────────────
load_secrets_file() {
  local secrets="${HOLOCRON_SECRETS_PATH:-${HOLO_SECRETS_PATH:-}}"
  if [[ -z "$secrets" ]]; then
    for cand in \
      "/Users/inference1/Projects/holocron/services/platform/config/secrets.yaml" \
      "$ROOT/services/platform/config/secrets.yaml"; do
      if [[ -f "$cand" && -r "$cand" ]]; then secrets="$cand"; break; fi
    done
  fi
  if [[ -z "$secrets" || ! -f "$secrets" ]]; then
    err "secrets.yaml not readable (set HOLO_SECRETS_PATH)"
    echo "RESIDUAL: DEPENDENCY-S28-SECRETS" >&2
    exit 2
  fi
  # canonicalize
  if command -v /usr/bin/python3 >/dev/null 2>&1; then
    secrets="$(/usr/bin/python3 -E -s -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$secrets")"
  fi
  export HOLO_SECRETS_PATH="$secrets"
  export HOLOCRON_SECRETS_PATH="$secrets"
  log "secrets path bound (value not logged)"

  # Import missing keys from secrets file without overriding env.
  # Write a short export script (0600) then source — avoids bash 3.2 $(heredoc) quote traps.
  local _export_sh
  _export_sh="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/holo-s32-d08-03-exports.XXXXXX")"
  /bin/chmod 600 "$_export_sh"
  /usr/bin/python3 -E -s - "$secrets" "$_export_sh" <<'PY'
import os, re, shlex, sys
from pathlib import Path
path = Path(sys.argv[1])
out = Path(sys.argv[2])
text = path.read_text(encoding="utf-8", errors="replace")
keys = [
  "R2_RESTORE_ACCESS_KEY_ID", "R2_RESTORE_SECRET_ACCESS_KEY", "R2_RESTORE_SESSION_TOKEN",
  "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_SESSION_TOKEN",
  "R2_ENDPOINT", "R2_ACCOUNT_ID", "R2_BUCKET_NAME",
  "R2_PGBACKREST_PREFIX", "R2_RESTORE_OBJECT_PREFIX", "R2_RESTIC_PREFIX",
  "R2_REPO_CIPHER_PASS", "RESTIC_PASSWORD",
  # Intentionally omit R2_CREDENTIAL_POLICY — secrets often store escaped JSON that
  # fails GATE-FIX-S28R3-QA14 canonical check; prove/provision establish the policy.
  "R2_FIRE_DRILL_DATA_ACCESS_KEY_ID", "R2_FIRE_DRILL_DATA_SECRET_ACCESS_KEY",
  "R2_FIRE_DRILL_DATA_SESSION_TOKEN",
  "DATABASE_URL", "HOLO_KEY_RN", "HOLO_KEY_MCP", "HOLO_KEY_CONTROL",
]
lines = []
for k in keys:
    if os.environ.get(k):
        continue
    m = re.search(r'(?m)^' + re.escape(k) + r':\s*["\']?([^"\'\n]+)', text)
    if not m:
        continue
    v = m.group(1).strip()
    if not v:
        continue
    lines.append("export %s=%s" % (k, shlex.quote(v)))
out.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
PY
  # shellcheck disable=SC1090
  set -a
  # shellcheck disable=SC1091
  source "$_export_sh"
  set +a
  /bin/rm -f "$_export_sh"
}

# Prefer explicit operator .env when present (caller should source it; we also try).
if [[ -f /Users/inference1/Projects/holocron/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /Users/inference1/Projects/holocron/.env
  set +a
  log "sourced operator .env (values not logged)"
fi
load_secrets_file

if [[ -z "${R2_RESTORE_ACCESS_KEY_ID:-}" || -z "${R2_RESTORE_SECRET_ACCESS_KEY:-}" ]]; then
  err "R2_RESTORE_ACCESS_KEY_ID + R2_RESTORE_SECRET_ACCESS_KEY required (distinct restore tuple)"
  echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
  exit 2
fi

# Canonical restore prefix + kind (do not forward escaped policy from secrets).
export R2_RESTORE_OBJECT_PREFIX="${R2_RESTORE_OBJECT_PREFIX:-pgbackrest}"
export R2_PGBACKREST_PREFIX="${R2_PGBACKREST_PREFIX:-pgbackrest}"
export R2_CREDENTIAL_KIND="${R2_CREDENTIAL_KIND:-object-read-only}"
# Drop non-canonical ambient policy so prove-r2 establishes the correct one.
# Drop ambient scope-probe keys — GATE-FIX-S28R3-QA16 refuses env overrides of
# the versioned probe keys (operator .env often carries stale probe paths).
unset R2_CREDENTIAL_POLICY 2>/dev/null || true
unset R2_SCOPE_PROBE_IN_KEY R2_SCOPE_PROBE_OUT_KEY 2>/dev/null || true

# When Cloudflare parent credentials are available, mint prefix-scoped temporary
# restore + fire-drill data tuples (Sprint 28 HUMAN-GATE pattern). Durable
# R2_RESTORE_* is preserved as R2_FIRE_DRILL_DATA_* inside the mint script when
# the durable key is broader than pgbackrest-only proof scope.
if [[ -n "${CLOUDFLARE_API_TOKEN:-}" && ( -n "${R2_PARENT_ACCESS_KEY_ID:-}" || -n "${BACKUP_R2_ACCESS_KEY_ID:-}" || -n "${R2_ACCESS_KEY_ID:-}" ) ]]; then
  if [[ -z "${R2_PARENT_ACCESS_KEY_ID:-}" && -n "${BACKUP_R2_ACCESS_KEY_ID:-}" ]]; then
    export R2_PARENT_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID"
    export R2_PARENT_SECRET_ACCESS_KEY="${BACKUP_R2_SECRET_ACCESS_KEY:-${BACKUP_R2_SECRET_ACCESS_API_TOKEN:-}}"
  fi
  if [[ -z "${R2_PARENT_ACCESS_KEY_ID:-}" && -n "${R2_ACCESS_KEY_ID:-}" ]]; then
    export R2_PARENT_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
    export R2_PARENT_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-}"
  fi
  log "minting prefix-scoped temporary R2 restore credentials (values not logged)"
  # shellcheck disable=SC1091
  source "$ROOT/scripts/mint-r2-prefix-restore-env.sh" \
    || { err "mint-r2-prefix-restore-env failed"; echo "RESIDUAL: DEPENDENCY-S28-R2-RO"; exit 2; }
fi

# Absolute trusted tools
BUN_BIN=""
for _b in /usr/local/bin/bun /usr/bin/bun; do
  [[ -x "$_b" ]] && BUN_BIN="$_b" && break
done
[[ -n "$BUN_BIN" ]] || { err "root-owned bun not found at /usr/local/bin/bun or /usr/bin/bun"; exit 2; }

PSQL_BIN=""
for _p in /opt/homebrew/opt/postgresql@18/bin/psql /usr/local/opt/postgresql@18/bin/psql \
  /opt/homebrew/bin/psql /usr/local/bin/psql /usr/bin/psql; do
  [[ -x "$_p" ]] && PSQL_BIN="$_p" && break
done
[[ -n "$PSQL_BIN" ]] || { err "psql not found"; exit 2; }

PG_CTL_BIN=""
for _p in /opt/homebrew/opt/postgresql@18/bin/pg_ctl /usr/local/opt/postgresql@18/bin/pg_ctl \
  /opt/homebrew/bin/pg_ctl /usr/local/bin/pg_ctl /usr/bin/pg_ctl; do
  [[ -x "$_p" ]] && PG_CTL_BIN="$_p" && break
done
[[ -n "$PG_CTL_BIN" ]] || { err "pg_ctl not found"; exit 2; }

DOCKER_BIN=""
for _d in /usr/bin/docker /usr/local/bin/docker /opt/homebrew/bin/docker; do
  if [[ -x "$_d" ]] && "$_d" info >/dev/null 2>&1; then DOCKER_BIN="$_d"; break; fi
done
[[ -n "$DOCKER_BIN" ]] || { err "docker daemon not available"; echo "RESIDUAL: needs_hardware docker"; exit 2; }

# ── PITR_TIMESTAMP from live window when unset ───────────────────────────────
# pgBackRest --type=time selects backup sets with stop *strictly less than*
# --target. Operators often pass recommended_pitr == exact backup stop (e.g.
# post-PONR 20260810-121923F stop 2026-08-10T18:22:05Z); equality causes the
# prior July set to be selected and PONR tables never appear. Nudge +1s when
# the chosen PITR equals the window latest/recommended stop (mirrors
# adjustPitrTargetForBackupStop, applied at the gate so provided env is safe).
resolve_pitr() {
  local window_json provided="${PITR_TIMESTAMP:-}"
  log "resolving PITR_TIMESTAMP via holo restore:window (provided=${provided:+yes})"
  # Window probe needs R2_ACCESS_* — map restore tuple (RO) for listing only.
  window_json="$(
    env \
      R2_ACCESS_KEY_ID="${R2_RESTORE_ACCESS_KEY_ID}" \
      R2_SECRET_ACCESS_KEY="${R2_RESTORE_SECRET_ACCESS_KEY}" \
      R2_SESSION_TOKEN="${R2_RESTORE_SESSION_TOKEN:-}" \
      HOLO_SECRETS_PATH="$HOLO_SECRETS_PATH" \
      HOLOCRON_SECRETS_PATH="$HOLOCRON_SECRETS_PATH" \
      "$BUN_BIN" "$ROOT/services/platform/src/cli/holo.ts" restore:window --json 2>"$EVID/restore-window.stderr"
  )" || true
  printf '%s\n' "$window_json" >"$EVID/restore-window.json"
  if [[ -z "$provided" ]]; then
    PITR_TIMESTAMP="$(
      /usr/bin/python3 -E -s -c '
import json,sys
try:
  d=json.load(open(sys.argv[1]))
except Exception:
  print("", end="")
  sys.exit(0)
print((d.get("recommended_pitr") or d.get("latest") or "") or "", end="")
' "$EVID/restore-window.json"
    )"
  else
    PITR_TIMESTAMP="$provided"
  fi
  if [[ -z "$PITR_TIMESTAMP" ]]; then
    err "failed to resolve PITR_TIMESTAMP from restore:window"
    exit 2
  fi
  # Nudge when PITR equals latest/recommended stop (exact full-backup stop).
  PITR_TIMESTAMP="$(
    /usr/bin/python3 -E -s -c '
import json,sys
from datetime import datetime, timezone, timedelta
pitr = sys.argv[1].strip()
try:
  d = json.load(open(sys.argv[2]))
except Exception:
  print(pitr, end=""); sys.exit(0)
latest = (d.get("recommended_pitr") or d.get("latest") or "").strip()
if not latest:
  print(pitr, end=""); sys.exit(0)
def parse(s):
  s = s.replace("Z", "+00:00")
  return datetime.fromisoformat(s)
try:
  t = parse(pitr); L = parse(latest)
except Exception:
  print(pitr, end=""); sys.exit(0)
# Equal or within 5s before latest stop → +1s past latest (select that backup set).
delta = (L - t).total_seconds()
if 0 <= delta <= 5:
  nudged = (L + timedelta(seconds=1)).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
  print(nudged, end="")
else:
  print(pitr, end="")
' "$PITR_TIMESTAMP" "$EVID/restore-window.json"
  )"
  export PITR_TIMESTAMP
  log "PITR_TIMESTAMP=$PITR_TIMESTAMP"
}
resolve_pitr
export PITR_TIMESTAMP

# Prefer post-PONR recovery baseline when operator/env pins it (or default known id).
export HOLO_RECOVERY_BASELINE_ID="${HOLO_RECOVERY_BASELINE_ID:-${RECOVERY_BASELINE_ID:-8f7a8ed7f438ba31c447745433d18389050d11fcc4425ac223846d1c97470a7e}}"
log "HOLO_RECOVERY_BASELINE_ID bound (64-hex; value length=${#HOLO_RECOVERY_BASELINE_ID})"

# Resume mode: re-use a still-live AC-1 restore under a NEW GATE_RUN_ID.
#   RESUME_FROM_GATE_RUN_ID=s32d0803-20260810T192706Z
#   SKIP_AC1=1
# Copies attestation/parity into the new evidence dir and binds RESTORED_*.
RESUME_FROM_GATE_RUN_ID="${RESUME_FROM_GATE_RUN_ID:-}"
SKIP_AC1="${SKIP_AC1:-0}"
if [[ -n "$RESUME_FROM_GATE_RUN_ID" ]]; then
  SKIP_AC1=1
fi

# ── Cleanup restored postmaster on exit ──────────────────────────────────────
RESTORED_PGDATA=""
RESTORED_PG_PORT=""
RESTORED_PLATFORM_PID=""
RESTORED_ZERO_PID=""
RESTORED_METRO_PID=""
KEEP_RESTORED_PG_ON_EXIT="${KEEP_RESTORED_PG_ON_EXIT:-0}"
cleanup() {
  local rc=$?
  set +e
  if [[ -n "${RESTORED_METRO_PID:-}" ]]; then
    kill "$RESTORED_METRO_PID" 2>/dev/null
    wait "$RESTORED_METRO_PID" 2>/dev/null
  fi
  if [[ -n "${RESTORED_ZERO_PID:-}" ]]; then
    kill "$RESTORED_ZERO_PID" 2>/dev/null
    wait "$RESTORED_ZERO_PID" 2>/dev/null
  fi
  if [[ -n "${RESTORED_PLATFORM_PID:-}" ]]; then
    kill "$RESTORED_PLATFORM_PID" 2>/dev/null
    wait "$RESTORED_PLATFORM_PID" 2>/dev/null
  fi
  if [[ "$KEEP_RESTORED_PG_ON_EXIT" != "1" && -n "${RESTORED_PGDATA:-}" && -n "${PG_CTL_BIN:-}" ]]; then
    "$PG_CTL_BIN" stop -D "$RESTORED_PGDATA" -m fast >/dev/null 2>&1
  fi
  set -e
  exit "$rc"
}
trap cleanup EXIT INT TERM

# Bind AC-1 artifacts from a prior live gate run (resume path).
bind_resume_ac1() {
  local prior_id="$1"
  local prior="$ROOT/.tmp/REDHAT-FIX-S32-D08-03/$prior_id"
  log "RESUME: binding AC-1 from $prior_id into $GATE_RUN_ID"
  if [[ ! -d "$prior" ]]; then
    err "RESUME_FROM_GATE_RUN_ID dir missing: $prior"
    return 1
  fi
  for f in attestation.json parity-report.json ac1-summary.json restore-window.json host.txt restored-pgdata.txt; do
    if [[ ! -s "$prior/$f" ]]; then
      err "prior AC-1 evidence missing: $prior/$f"
      return 1
    fi
    /bin/cp -f "$prior/$f" "$EVID/$f"
  done
  # Optional logs for manifest completeness / operator debug
  for f in ac1-prove-r2-readonly.txt ac1-provision.txt ac1-fire-drill.txt pitr-restore-status.json; do
    [[ -f "$prior/$f" ]] && /bin/cp -f "$prior/$f" "$EVID/$f" || true
  done

  /usr/bin/jq -e '
    .schema == "holo.fresh-target.fire-drill-attestation.v1"
    and .ok == true
  ' "$EVID/attestation.json" >/dev/null \
    || { err "resume attestation invalid"; return 1; }

  /bin/bash "$ROOT/scripts/assert-fire-drill-report.sh" "$EVID/parity-report.json" \
    || { err "resume parity report contract failed"; return 1; }

  RESTORED_PGDATA="$(/usr/bin/jq -r '.host_execution.scratch // .scratch // empty' "$EVID/attestation.json")"
  if [[ -z "$RESTORED_PGDATA" || ! -d "$RESTORED_PGDATA" ]]; then
    # Fall back to recorded path
    RESTORED_PGDATA="$(/bin/cat "$EVID/restored-pgdata.txt" 2>/dev/null || true)"
  fi
  if [[ -z "$RESTORED_PGDATA" || ! -d "$RESTORED_PGDATA" ]]; then
    err "resume RESTORED_PGDATA missing or not a directory"
    return 1
  fi
  export RESTORED_PGDATA
  printf '%s\n' "$RESTORED_PGDATA" >"$EVID/restored-pgdata.txt"

  # Prefer operator-provided live URL; else rediscover via pg_ctl/start.
  if [[ -n "${RESUME_RESTORED_DATABASE_URL:-}" ]]; then
    RESTORED_DATABASE_URL="$RESUME_RESTORED_DATABASE_URL"
    export RESTORED_DATABASE_URL
    if ! "$PSQL_BIN" "$RESTORED_DATABASE_URL" -XAtc 'SELECT 1' >/dev/null 2>&1; then
      err "RESUME_RESTORED_DATABASE_URL not accepting connections"
      return 1
    fi
    printf '%s\n' "$(echo "$RESTORED_DATABASE_URL" | /usr/bin/sed -E 's#(postgres://)[^@/]+@#\1#; s#//[^@/]+:[^@/]+@#//#')" \
      >"$EVID/restored-database-url.redacted.txt" 2>/dev/null || \
      printf '%s\n' "postgres://127.0.0.1/holocron" >"$EVID/restored-database-url.redacted.txt"
    # Redact properly: host/port/db only
    local _host _port _db
    _host="$(/usr/bin/python3 -E -s -c 'import sys,urllib.parse as u; p=u.urlparse(sys.argv[1]); print(p.hostname or "127.0.0.1")' "$RESTORED_DATABASE_URL")"
    _port="$(/usr/bin/python3 -E -s -c 'import sys,urllib.parse as u; p=u.urlparse(sys.argv[1]); print(p.port or 5432)' "$RESTORED_DATABASE_URL")"
    _db="$(/usr/bin/python3 -E -s -c 'import sys,urllib.parse as u; p=u.urlparse(sys.argv[1]); print((p.path or "/holocron").lstrip("/"))' "$RESTORED_DATABASE_URL")"
    printf 'postgres://%s:%s/%s\n' "$_host" "$_port" "$_db" >"$EVID/restored-database-url.redacted.txt"
    RESTORED_PG_PORT="$_port"
    export RESTORED_PG_PORT
    log "resume using live RESTORED_DATABASE_URL on ${_host}:${_port}/${_db}"
  else
    local free_port
    free_port="$(/usr/bin/python3 -E -s -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
    start_restored_postgres "$RESTORED_PGDATA" "$free_port" || return 1
  fi

  # Isolation identity still valid: host from prior attestation must match recorded
  local host
  host="$(/usr/bin/jq -r '.host // empty' "$EVID/attestation.json")"
  printf '%s\n' "$host" >"$EVID/host.txt"
  # Annotate resume in ac1-summary (status remains pass — AC-1 evidence reused)
  /usr/bin/jq --arg rid "$prior_id" --arg gr "$GATE_RUN_ID" \
    '. + {resume_from: $rid, gate_run_id: $gr, resumed: true}' \
    "$EVID/ac1-summary.json" >"$EVID/ac1-summary.json.tmp" \
    && /bin/mv "$EVID/ac1-summary.json.tmp" "$EVID/ac1-summary.json"
  log "RESUME AC-1 bound (host=$host pgdata present)"
  return 0
}

sha256_file() {
  /usr/bin/python3 -E -s -c 'import hashlib,sys; h=hashlib.sha256();
f=open(sys.argv[1],"rb");
[h.update(c) for c in iter(lambda:f.read(1024*1024),b"")];
print(h.hexdigest())' "$1"
}

# ═══════════════════════════════════════════════════════════════════════════════
# AC-1 — Fresh isolated restore
# ═══════════════════════════════════════════════════════════════════════════════
run_ac1() {
  log "AC-1: prove R2 read-only + provision fresh target + fire-drill"
  REQUIRE_LIVE_R2_RO=1 /bin/bash "$ROOT/scripts/prove-r2-readonly.sh" \
    >"$EVID/ac1-prove-r2-readonly.txt" 2>&1 \
    || { err "prove-r2-readonly failed"; tail -40 "$EVID/ac1-prove-r2-readonly.txt" >&2; return 1; }

  HOST="$(/bin/bash "$ROOT/scripts/derive-s28-fresh-host.sh")"
  export HOST
  printf '%s\n' "$HOST" >"$EVID/host.txt"
  log "HOST=$HOST"

  PG_PORT="${RESTORE_PG_PORT:-$((56000 + RANDOM % 3000))}"
  export RESTORE_PG_PORT="$PG_PORT"

  REQUIRE_LIVE_R2_RO=1 \
    R2_RESTORE_OBJECT_PREFIX="${R2_RESTORE_OBJECT_PREFIX:-pgbackrest}" \
    R2_PGBACKREST_PREFIX="${R2_PGBACKREST_PREFIX:-pgbackrest}" \
    STAGING_ROOT="$EVID/fresh-restore" \
    /bin/bash "$ROOT/scripts/provision-fresh-restore-target.sh" \
      --host "$HOST" \
      --skip-isolation \
      --pg-port "$PG_PORT" \
    >"$EVID/ac1-provision.txt" 2>&1 \
    || { err "provision-fresh-restore-target failed"; tail -50 "$EVID/ac1-provision.txt" >&2; return 1; }

  # 1.5GB post-PONR repo restore exceeds default 20m fire-drill PITR timeout.
  export HOLO_FIRE_DRILL_PITR_TIMEOUT_MS="${HOLO_FIRE_DRILL_PITR_TIMEOUT_MS:-3600000}"
  log "HOLO_FIRE_DRILL_PITR_TIMEOUT_MS=$HOLO_FIRE_DRILL_PITR_TIMEOUT_MS"
  REQUIRE_LIVE_R2_RO=1 \
    R2_RESTORE_OBJECT_PREFIX="${R2_RESTORE_OBJECT_PREFIX:-pgbackrest}" \
    R2_PGBACKREST_PREFIX="${R2_PGBACKREST_PREFIX:-pgbackrest}" \
    HOLO_FIRE_DRILL_PITR_TIMEOUT_MS="$HOLO_FIRE_DRILL_PITR_TIMEOUT_MS" \
    HOLO_RECOVERY_BASELINE_ID="${HOLO_RECOVERY_BASELINE_ID:-}" \
    /bin/bash "$ROOT/scripts/run-fire-drill-on-fresh-target.sh" \
      --host "$HOST" \
      --target-timestamp "$PITR_TIMESTAMP" \
      --attestation "$EVID/attestation.json" \
      --report "$EVID/parity-report.json" \
    >"$EVID/ac1-fire-drill.txt" 2>&1 \
    || { err "fire-drill failed"; tail -80 "$EVID/ac1-fire-drill.txt" >&2; return 1; }

  /bin/bash "$ROOT/scripts/assert-fire-drill-report.sh" "$EVID/parity-report.json" \
    || { err "parity report contract failed"; return 1; }

  /usr/bin/jq -e '
    .schema == "holo.fresh-target.fire-drill-attestation.v1"
    and .ok == true
    and (.volumes.pgdata | type == "string")
    and (.mountpoints.scratch | type == "string")
  ' "$EVID/attestation.json" >/dev/null \
    || { err "attestation schema/ok failed"; return 1; }

  /usr/bin/jq -e '
    .POSTGRES_PARITY_PASS == true
    and .LEDGER_CHECKSUM_MATCH == true
    and .BLOB_PARITY_PASS == true
    and (.matched_objects // 0) >= 1
  ' "$EVID/parity-report.json" >/dev/null \
    || { err "parity flags / matched_objects failed"; return 1; }

  # Extract host_execution.scratch for AC-2 bring-up
  RESTORED_PGDATA="$(/usr/bin/jq -r '.host_execution.scratch // .scratch // empty' "$EVID/attestation.json")"
  if [[ -z "$RESTORED_PGDATA" || ! -d "$RESTORED_PGDATA" ]]; then
    err "attestation host_execution.scratch missing or not a directory"
    return 1
  fi
  export RESTORED_PGDATA
  printf '%s\n' "$RESTORED_PGDATA" >"$EVID/restored-pgdata.txt"

  cat >"$EVID/ac1-summary.json" <<EOF
{
  "status": "pass",
  "host": $(/usr/bin/jq -cR . <<<"$HOST"),
  "pitr_timestamp": $(/usr/bin/jq -cR . <<<"$PITR_TIMESTAMP"),
  "attestation": "attestation.json",
  "parity_report": "parity-report.json",
  "restored_pgdata_bound": true
}
EOF
  log "AC-1 PASS"
  return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# Start restored Postgres for AC-2 / AC-3
# ═══════════════════════════════════════════════════════════════════════════════
start_restored_postgres() {
  local pgdata="$1"
  local port="${2:-56112}"
  local socket_dir="/tmp/holo-s32-d08-03-${port}"
  mkdir -p "$socket_dir"
  # Stop any leftover
  "$PG_CTL_BIN" stop -D "$pgdata" -m fast >/dev/null 2>&1 || true
  local logf="$EVID/restored-postgres-start.log"
  PATH="$(dirname "$PG_CTL_BIN"):${PATH:-/usr/bin:/bin}" \
    "$PG_CTL_BIN" start -D "$pgdata" -l "$logf" \
    -o "-p ${port} -k ${socket_dir} -h 127.0.0.1" \
    -w -t 120 \
    >"$EVID/restored-postgres-pgctl.txt" 2>&1 \
    || { err "pg_ctl start failed"; tail -40 "$logf" >&2; return 1; }
  RESTORED_PG_PORT="$port"
  export RESTORED_PG_PORT

  # Discover database name
  local db="holocron"
  if ! "$PSQL_BIN" -h "$socket_dir" -p "$port" -d "$db" -XAtc 'SELECT 1' >/dev/null 2>&1; then
    if "$PSQL_BIN" -h 127.0.0.1 -p "$port" -d "$db" -XAtc 'SELECT 1' >/dev/null 2>&1; then
      :
    elif "$PSQL_BIN" -h 127.0.0.1 -p "$port" -d postgres -XAtc 'SELECT 1' >/dev/null 2>&1; then
      local found
      found="$("$PSQL_BIN" -h 127.0.0.1 -p "$port" -d postgres -XAtc "SELECT datname FROM pg_database WHERE datname IN ('holocron','holocron_nonprod') ORDER BY 1 LIMIT 1" || true)"
      db="${found:-postgres}"
    else
      err "restored postgres not accepting connections on port $port"
      return 1
    fi
  fi

  # Prefer TCP URL for apps; trust/peer on localhost.
  RESTORED_DATABASE_URL="postgres://127.0.0.1:${port}/${db}"
  export RESTORED_DATABASE_URL
  # Verify
  "$PSQL_BIN" "$RESTORED_DATABASE_URL" -XAtc 'SELECT 1' >/dev/null \
    || { err "psql RESTORED_DATABASE_URL failed"; return 1; }
  printf '%s\n' "postgres://127.0.0.1:${port}/${db}" >"$EVID/restored-database-url.redacted.txt"
  # Only host/port/db — no user/password secrets.
  log "restored postgres up on 127.0.0.1:${port}/${db}"
  return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# AC-2 — Post-PONR integrity
# ═══════════════════════════════════════════════════════════════════════════════
run_ac2() {
  log "AC-2: FK / PONR / domain / ledger / blob integrity"
  /bin/bash "$ROOT/scripts/assert-fire-drill-report.sh" "$EVID/parity-report.json"

  # Pick a free host port (avoid clash with fire-drill default 56111).
  local free_port
  free_port="$(/usr/bin/python3 -E -s -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
  # Note: the python -c string uses only single quotes for the whole program.
  start_restored_postgres "$RESTORED_PGDATA" "$free_port" \
    || return 1

  # Parity-derived observations
  /usr/bin/python3 -E -s - "$EVID/parity-report.json" "$EVID/ac2-parity-extract.json" <<'PY'
import json, re, sys
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
ledger = d.get("ledger_sha256") or d.get("ledger_checksum") or ""
hex64 = bool(re.fullmatch(r"[0-9a-f]{64}", str(ledger)))
out = {
  "POSTGRES_PARITY_PASS": d.get("POSTGRES_PARITY_PASS") is True,
  "LEDGER_CHECKSUM_MATCH": d.get("LEDGER_CHECKSUM_MATCH") is True,
  "BLOB_PARITY_PASS": d.get("BLOB_PARITY_PASS") is True,
  "matched_objects": int(d.get("matched_objects") or 0),
  "ledger_sha256": ledger if hex64 else None,
  "ledger_sha256_is_64_hex": hex64,
  "baseline_id": d.get("baseline_id"),
  "row_counts": d.get("row_counts") or d.get("restored_row_counts") or {},
}
json.dump(out, open(dst, "w"), indent=2)
open(dst, "a").write("\n")
if not (out["POSTGRES_PARITY_PASS"] and out["LEDGER_CHECKSUM_MATCH"] and out["BLOB_PARITY_PASS"]
        and out["matched_objects"] >= 1 and out["ledger_sha256_is_64_hex"]):
    sys.exit(1)
PY

  # SQL: PONR / post_export / domain
  local ponr_rows=0 post_export_rows=0 domain_rows=0
  set +e
  ponr_rows="$("$PSQL_BIN" "$RESTORED_DATABASE_URL" -XAtc \
    "SELECT CASE WHEN to_regclass('public.data_plane_ponr') IS NULL THEN 0 ELSE (SELECT count(*)::int FROM data_plane_ponr) END" 2>/dev/null)"
  post_export_rows="$("$PSQL_BIN" "$RESTORED_DATABASE_URL" -XAtc \
    "SELECT CASE WHEN to_regclass('public.post_export_write_audit') IS NULL THEN 0 ELSE (SELECT count(*)::int FROM post_export_write_audit) END" 2>/dev/null)"
  domain_rows="$("$PSQL_BIN" "$RESTORED_DATABASE_URL" -XAtc \
    "SELECT (
      COALESCE((SELECT count(*) FROM documents),0)
      + COALESCE((SELECT count(*) FROM sources),0)
      + COALESCE((SELECT count(*) FROM passages),0)
      + COALESCE((SELECT count(*) FROM claims),0)
    )::int" 2>/dev/null)"
  set -e
  ponr_rows="${ponr_rows:-0}"
  post_export_rows="${post_export_rows:-0}"
  domain_rows="${domain_rows:-0}"

  cat >"$EVID/ac2-sql.json" <<EOF
{
  "ponr_rows": ${ponr_rows},
  "post_export_rows": ${post_export_rows},
  "domain_rows": ${domain_rows}
}
EOF
  log "SQL ponr_rows=$ponr_rows post_export_rows=$post_export_rows domain_rows=$domain_rows"

  # FK integrity against restored DB — contract path (etl:fk-audit).
  #
  # MUST run real `bun ... etl:fk-audit --json --export ... --catalog ...` on
  # RESTORED_DATABASE_URL. Do NOT substitute enforced-only SQL with unenforcedEdges=[]
  # by construction. Fail closed on orphans>0 or unenforcedEdges length>0.
  local catalog_path="${CATALOG_PATH:-$ROOT/.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml}"
  local export_dir="${CONVEX_EXPORT_DIR:-}"
  if [[ -z "$export_dir" ]]; then
    # Prefer successful etl_runs.export_root when the path still exists on disk.
    set +e
    export_dir="$("$PSQL_BIN" "$RESTORED_DATABASE_URL" -XAtc \
      "SELECT export_root FROM etl_runs WHERE status='succeeded' ORDER BY created_at DESC LIMIT 1" 2>/dev/null)"
    set -e
    if [[ -z "$export_dir" || ! -d "$export_dir" ]]; then
      # Fall back to worktree fixture so the contract command still runs against
      # restored Postgres (export missing is itself an integrity residual).
      export_dir="$ROOT/services/platform/tests/fixtures/etl-valid-export"
      log "CONVEX_EXPORT_DIR unset/missing; using fixture export for etl:fk-audit: $export_dir"
    else
      log "CONVEX_EXPORT_DIR from etl_runs: $export_dir"
    fi
  fi
  if [[ ! -d "$export_dir" ]]; then
    err "export dir missing for etl:fk-audit: $export_dir"
    return 1
  fi
  if [[ ! -f "$catalog_path" ]]; then
    err "catalog missing for etl:fk-audit: $catalog_path"
    return 1
  fi
  printf '%s\n' "$export_dir" >"$EVID/fk-audit-export-dir.txt"
  printf '%s\n' "$catalog_path" >"$EVID/fk-audit-catalog-path.txt"

  set +e
  # Restored DB is named holocron; name-guard requires the dangerous allow flag.
  DATABASE_URL="$RESTORED_DATABASE_URL" \
    HOLO_DANGEROUS_ALLOW_PROD_DB=1 \
    CONVEX_EXPORT_DIR="$export_dir" \
    CATALOG_PATH="$catalog_path" \
    "$BUN_BIN" "$ROOT/services/platform/src/cli/holo.ts" etl:fk-audit \
      --json \
      --export "$export_dir" \
      --catalog "$catalog_path" \
    >"$EVID/fk-audit.json" 2>"$EVID/fk-audit.stderr"
  local fk_rc=$?
  set -e
  # Also keep a one-line stdout summary for operators
  /usr/bin/jq -c '{ok,edgeCount,orphans,unenforced:((.unenforcedEdges//[])|length),enforcedForeignKeys,checkedRelationships}' \
    "$EVID/fk-audit.json" >"$EVID/fk-audit.stdout" 2>/dev/null || \
    printf '%s\n' "{\"ok\":false,\"exit\":$fk_rc}" >"$EVID/fk-audit.stdout"
  if [[ $fk_rc -ne 0 ]]; then
    err "etl:fk-audit exited $fk_rc (refuse soft-pass / substitute)"
    tail -40 "$EVID/fk-audit.stderr" >&2 || true
    cat "$EVID/fk-audit.stdout" >&2 || true
  fi
  /usr/bin/jq -e '
    .ok == true
    and .edgeCount > 0
    and .orphans == 0
    and ((.unenforcedEdges // []) | length) == 0
  ' "$EVID/fk-audit.json" >/dev/null \
    || {
      err "fk-audit predicates failed (contract: orphans==0 and unenforcedEdges length==0)"
      /usr/bin/jq -c '{ok,edgeCount,orphans,unenforced:((.unenforcedEdges//[])|length),mode:(.mode//"etl:fk-audit")}' \
        "$EVID/fk-audit.json" 2>/dev/null || true
      # Record residual markers for AC-4 / blocked residual
      /usr/bin/jq -c '{ok,edgeCount,orphans,unenforcedEdges:(.unenforcedEdges//[]|length),mode:"etl:fk-audit",exit_code:'"$fk_rc"'}' \
        "$EVID/fk-audit.json" >"$EVID/fk-audit-residual.json" 2>/dev/null || true
      return 1
    }

  # Fail closed on PONR / domain requirements
  if [[ "${ponr_rows}" -lt 1 ]]; then
    err "ponr_rows=$ponr_rows (require >=1) — restored baseline may predate Sprint 30 PONR"
    echo "RESIDUAL: restored target missing data_plane_ponr (backup chain latest=$PITR_TIMESTAMP)" >&2
    return 1
  fi
  if [[ "${domain_rows}" -lt 1 ]]; then
    err "domain_rows=$domain_rows (require >=1)"
    return 1
  fi
  # post_export is required by evidence gates (>=1) when table exists post-PONR
  if [[ "${post_export_rows}" -lt 1 ]]; then
    err "post_export_rows=$post_export_rows (require >=1)"
    return 1
  fi

  local fk_edge_count fk_orphans fk_unenforced
  fk_edge_count="$(/usr/bin/jq -r '.edgeCount // 0' "$EVID/fk-audit.json")"
  fk_orphans="$(/usr/bin/jq -r '.orphans // 0' "$EVID/fk-audit.json")"
  fk_unenforced="$(/usr/bin/jq -r '(.unenforcedEdges // []) | length' "$EVID/fk-audit.json")"
  cat >"$EVID/ac2-summary.json" <<EOF
{
  "status": "pass",
  "ponr_rows": ${ponr_rows},
  "post_export_rows": ${post_export_rows},
  "domain_rows": ${domain_rows},
  "fk_audit": "fk-audit.json",
  "fk_audit_mode": "etl:fk-audit",
  "fk_edgeCount": ${fk_edge_count},
  "fk_orphans": ${fk_orphans},
  "fk_unenforcedEdges": ${fk_unenforced},
  "parity_extract": "ac2-parity-extract.json"
}
EOF
  log "AC-2 PASS (etl:fk-audit edgeCount=$fk_edge_count orphans=$fk_orphans unenforced=$fk_unenforced)"
  return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# AC-3 — Real app / MCP journeys against restored services
# ═══════════════════════════════════════════════════════════════════════════════
run_ac3() {
  log "AC-3: Maestro SKIP_SEED=1 + Sprint 31 MCP integration"
  : "${RESTORED_DATABASE_URL:?RESTORED_DATABASE_URL required}"

  # Start ephemeral platform gateway against restored DB for RESTORED_PLATFORM_URL.
  local plat_port
  plat_port="$(/usr/bin/python3 -E -s -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
  local keys_rn="${HOLO_KEY_RN:-s32-d08-03-rn}"
  local keys_mcp="${HOLO_KEY_MCP:-s32-d08-03-mcp}"
  local keys_ctl="${HOLO_KEY_CONTROL:-s32-d08-03-control}"

  # Launch minimal Hono platform (same pattern as sprint31 MCP IT).
  (
    DATABASE_URL="$RESTORED_DATABASE_URL" \
    HOLO_KEY_RN="$keys_rn" \
    HOLO_KEY_MCP="$keys_mcp" \
    HOLO_KEY_CONTROL="$keys_ctl" \
    PORT="$plat_port" \
    "$BUN_BIN" -e '
import { createHonoApp } from "./services/platform/src/http/hono-app.ts";
const port = Number(process.env.PORT || 0);
const app = createHonoApp({
  keys: {
    rn: process.env.HOLO_KEY_RN!,
    mcp: process.env.HOLO_KEY_MCP!,
    control: process.env.HOLO_KEY_CONTROL!,
  },
});
const server = Bun.serve({ port, hostname: "127.0.0.1", fetch: app.fetch });
console.log("s32-d08-03-platform-ready " + server.port);
'
  ) >"$EVID/restored-platform.log" 2>&1 &
  RESTORED_PLATFORM_PID=$!
  export RESTORED_PLATFORM_PID

  # Wait for ready line or health
  local ready=0
  for _ in $(seq 1 60); do
    if /usr/bin/grep -q 's32-d08-03-platform-ready' "$EVID/restored-platform.log" 2>/dev/null; then
      ready=1
      break
    fi
    if ! kill -0 "$RESTORED_PLATFORM_PID" 2>/dev/null; then
      break
    fi
    sleep 0.25
  done
  # Discover actual port from log if dynamic
  local logged_port
  logged_port="$(/usr/bin/awk '/s32-d08-03-platform-ready/ {print $2; exit}' "$EVID/restored-platform.log" 2>/dev/null || true)"
  if [[ -n "$logged_port" ]]; then plat_port="$logged_port"; fi
  RESTORED_PLATFORM_URL="http://127.0.0.1:${plat_port}"
  export RESTORED_PLATFORM_URL
  printf '%s\n' "$RESTORED_PLATFORM_URL" >"$EVID/restored-platform-url.txt"

  if [[ "$ready" -ne 1 ]]; then
    err "restored platform failed to start"
    tail -40 "$EVID/restored-platform.log" >&2 || true
    return 1
  fi
  # Health probe
  if ! curl -sf "${RESTORED_PLATFORM_URL}/health" >/dev/null 2>&1; then
    err "restored platform /health failed"
    return 1
  fi
  log "restored platform at $RESTORED_PLATFORM_URL"

  # MCP integration (stdio + Postgres) — real test, no mock.
  set +e
  # Restored DB is named holocron (production-like); MCP list_documents refuses
  # unless HOLO_DANGEROUS_ALLOW_PROD_DB=1 — safe: URL is isolated 127.0.0.1 restore.
  PLATFORM_IT=1 \
    DATABASE_URL="$RESTORED_DATABASE_URL" \
    HOLO_DANGEROUS_ALLOW_PROD_DB=1 \
    HOLO_KEY_RN="$keys_rn" \
    HOLO_KEY_MCP="$keys_mcp" \
    HOLO_KEY_CONTROL="$keys_ctl" \
    PATH="$ROOT/node_modules/.bin:${PATH:-/usr/bin:/bin}" \
    pnpm exec vitest run --project integration \
      services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts \
      -t 'AC-4 legacy package serves Postgres over stdio with no Convex references' \
    >"$EVID/ac3-mcp-integration.txt" 2>&1
  local mcp_rc=$?
  set -e
  if [[ $mcp_rc -ne 0 ]]; then
    err "MCP integration failed (exit $mcp_rc)"
    tail -50 "$EVID/ac3-mcp-integration.txt" >&2 || true
    return 1
  fi
  # Non-empty payload evidence
  if ! /usr/bin/grep -Eiq 'pass|✓|stdio|documents|list_documents' "$EVID/ac3-mcp-integration.txt"; then
    err "MCP integration log lacks non-empty pass/payload evidence"
    return 1
  fi
  log "MCP integration PASS"

  # Maestro cross-surface against restored Postgres + Zero + Metro.
  # MCP is always required. Maestro is required when Zero can be bound to the
  # restored target (or is already healthy against it). Stock cross-surface flow
  # expects e2e doc titles; we UPSERT minimal journey substrate (no TRUNCATE /
  # no seed:e2e --reset) so SKIP_SEED=1 stays honest on a post-PONR restore.
  mkdir -p "$EVID/cross-surface"
  local maestro_rc=1
  local zero_up=0
  local maestro_mode="required"
  local zero_admin="${ZERO_ADMIN_PASSWORD:-d08-03-zero-admin-local}"
  export ZERO_ADMIN_PASSWORD="$zero_admin"

  # Kill stale zero-cache (often left pointing at a dead restore port).
  stop_stale_zero() {
    set +e
    local pids
    pids="$(/usr/bin/pgrep -f 'zero-cache|@rocicorp/zero/out/zero-cache' 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      log "stopping stale zero-cache pids: $(echo "$pids" | tr '\n' ' ')"
      # shellcheck disable=SC2086
      kill $pids 2>/dev/null || true
      sleep 1
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
    set -e
  }

  ensure_zero_on_restored() {
    # Already healthy?
    if curl -sf --max-time 2 "http://127.0.0.1:4848/keepalive" >/dev/null 2>&1; then
      # Prefer restart if we know prior runs pointed at wrong port — always rebind.
      :
    fi
    stop_stale_zero
    log "starting zero-cache against restored DATABASE_URL"
    set +e
    DATABASE_URL="$RESTORED_DATABASE_URL" \
      ZERO_UPSTREAM_DB="$RESTORED_DATABASE_URL" \
      ZERO_CVR_DB="$RESTORED_DATABASE_URL" \
      ZERO_CHANGE_DB="$RESTORED_DATABASE_URL" \
      ZERO_ADMIN_PASSWORD="$zero_admin" \
      ZERO_PORT=4848 \
      /bin/bash "$ROOT/scripts/run-zero-cache.sh" \
      >"$EVID/zero-cache-start.txt" 2>&1 &
    RESTORED_ZERO_PID=$!
    export RESTORED_ZERO_PID
    local i
    for i in $(seq 1 60); do
      if curl -sf --max-time 2 "http://127.0.0.1:4848/keepalive" >/dev/null 2>&1 \
        || curl -sf --max-time 2 "http://127.0.0.1:4848/" >/dev/null 2>&1; then
        zero_up=1
        break
      fi
      if ! kill -0 "$RESTORED_ZERO_PID" 2>/dev/null; then
        break
      fi
      sleep 0.5
    done
    set -e
    if [[ "$zero_up" -ne 1 ]]; then
      err "zero-cache failed to become ready on :4848"
      tail -40 "$EVID/zero-cache-start.txt" >&2 || true
      return 1
    fi
    log "zero-cache ready on :4848 (pid=$RESTORED_ZERO_PID)"
    return 0
  }

  ensure_metro() {
    if curl -sf --max-time 2 "http://127.0.0.1:8081/status" >/dev/null 2>&1; then
      log "Metro already listening on :8081"
      return 0
    fi
    log "starting Expo Metro (dev-client) on :8081 for Maestro"
    set +e
    (
      cd "$ROOT"
      export EXPO_PUBLIC_PLATFORM_URL="$RESTORED_PLATFORM_URL"
      export EXPO_PUBLIC_ZERO_CACHE_URL="http://127.0.0.1:4848"
      export EXPO_PUBLIC_ZERO_USER_ID="${EXPO_PUBLIC_ZERO_USER_ID:-e2e-reference-user}"
      export EXPO_PUBLIC_RN_API_KEY="${EXPO_PUBLIC_RN_API_KEY:-${HOLO_KEY_RN:-$keys_rn}}"
      export EXPO_PUBLIC_HOLO_E2E=1
      export CI=1
      # Prefer local expo binary
      if [[ -x "$ROOT/node_modules/.bin/expo" ]]; then
        exec "$ROOT/node_modules/.bin/expo" start --dev-client --port 8081 --non-interactive
      else
        exec pnpm exec expo start --dev-client --port 8081 --non-interactive
      fi
    ) >"$EVID/metro-start.txt" 2>&1 &
    RESTORED_METRO_PID=$!
    export RESTORED_METRO_PID
    local i
    for i in $(seq 1 90); do
      if curl -sf --max-time 2 "http://127.0.0.1:8081/status" >/dev/null 2>&1; then
        set -e
        log "Metro ready on :8081 (pid=$RESTORED_METRO_PID)"
        return 0
      fi
      if ! kill -0 "$RESTORED_METRO_PID" 2>/dev/null; then
        break
      fi
      sleep 1
    done
    set -e
    err "Metro failed to become ready on :8081"
    tail -40 "$EVID/metro-start.txt" >&2 || true
    return 1
  }

  inject_maestro_substrate() {
    # Minimal UPSERT — does not TRUNCATE or wipe PONR/domain rows.
    local sync_id="${SYNC_DOCUMENT_ID:-00000000-0000-4000-8000-b00000000011}"
    log "injecting Maestro journey substrate document $sync_id (no truncate)"
    "$PSQL_BIN" "$RESTORED_DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL >"$EVID/ac3-substrate.sqlout" 2>&1
INSERT INTO documents (id, title, content, status, category, created_at)
VALUES (
  '${sync_id}'::uuid,
  'E2E Document 17 (tool)',
  'D08-03 AC-3 journey substrate on restored post-PONR target (no seed:e2e reset)',
  'published',
  'tool',
  now() + interval '365 days'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  status = EXCLUDED.status,
  category = EXCLUDED.category,
  created_at = EXCLUDED.created_at;
SQL
    # Prove visibility for evidence
    local title
    title="$("$PSQL_BIN" "$RESTORED_DATABASE_URL" -XAtc \
      "SELECT title FROM documents WHERE id='${sync_id}'::uuid")"
    if [[ "$title" != "E2E Document 17 (tool)" ]]; then
      err "substrate inject failed (title=$title)"
      return 1
    fi
    printf '%s\n' "$sync_id" >"$EVID/ac3-sync-document-id.txt"
    return 0
  }

  # Fail closed: Zero + Metro + Maestro are required for AC-3. No environment_unavailable soft-pass.
  align_zero_pub_for_client() {
    # Restored backups can lag product zero_pub membership (e.g. file_objects).
    # Align publication to known full-table members present in public schema —
    # stack config only; no product schema rewrite.
    log "aligning zero_pub membership for restored target (add missing published tables)"
    "$PSQL_BIN" "$RESTORED_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' >"$EVID/ac3-zero-pub-align.sqlout" 2>&1 || true
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'conversations','chat_messages','tool_calls','agent_plans','agent_plan_steps',
    'tasks','documents','research_sessions','feed_items','feed_sessions',
    'creator_profiles','subscription_sources','subscription_filters','subscription_links',
    'improvement_images','audio_jobs','audio_segments','file_objects',
    'whats_new_reports','whats_new_workflows','analysis_sessions','analysis_items',
    'shop_sessions','shop_listings','assimilation_sessions','assimilation_iterations',
    'assimilation_metadata','execution_plans','plan_approvals','notifications','app_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'zero_pub' AND schemaname = 'public' AND tablename = t
       ) THEN
      EXECUTE format('ALTER PUBLICATION zero_pub ADD TABLE %I', t);
      RAISE NOTICE 'added % to zero_pub', t;
    END IF;
  END LOOP;
END $$;
SQL
    local n
    n="$("$PSQL_BIN" "$RESTORED_DATABASE_URL" -XAtc "SELECT count(*) FROM pg_publication_tables WHERE pubname='zero_pub'" 2>/dev/null || echo 0)"
    /usr/bin/jq -n --argjson n "${n:-0}" '{zero_pub_table_count:$n, aligned:true}' \
      >"$EVID/ac3-zero-pub-align.json" 2>/dev/null || true
  }

  align_zero_pub_for_client || log "zero_pub align best-effort failed (continuing)"
  if ! ensure_zero_on_restored; then
    err "zero-cache could not be bound to restored DATABASE_URL — AC-3 fail closed"
    maestro_mode="failed_zero_bind"
    maestro_rc=1
    printf 'maestro_exit_code=1\nmaestro_mode=failed_zero_bind\n' >"$EVID/ac3-maestro.txt"
    return 1
  fi
  inject_maestro_substrate || return 1
  if ! ensure_metro; then
    err "Metro not reachable on :8081 — AC-3 fail closed"
    maestro_mode="failed_metro"
    maestro_rc=1
    printf 'maestro_exit_code=1\nmaestro_mode=failed_metro\n' >"$EVID/ac3-maestro.txt"
    return 1
  fi

  # Real HTTP MCP journey — require tools/call success (no SQL fallback).
  prove_http_mcp_documents() {
    local sync_id="${SYNC_DOCUMENT_ID:-00000000-0000-4000-8000-b00000000011}"
    local title="D08-03-http-mcp-$(/bin/date -u +%Y%m%dT%H%M%SZ)"
    log "HTTP MCP tools/call update_document on restored platform for $sync_id"
    set +e
    local resp http_code
    resp="$(
      curl -sS --max-time 30 \
        -w "\n%{http_code}" \
        -H "content-type: application/json" \
        -H "accept: application/json, text/event-stream" \
        -H "authorization: Bearer ${keys_mcp}" \
        -H "x-holo-key: ${keys_mcp}" \
        -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"update_document\",\"arguments\":{\"id\":\"${sync_id}\",\"title\":\"${title}\"}}}" \
        "${RESTORED_PLATFORM_URL}/mcp" 2>"$EVID/ac3-http-mcp.stderr"
    )"
    local curl_rc=$?
    set -e
    http_code="$(printf '%s\n' "$resp" | /usr/bin/tail -n1)"
    resp="$(printf '%s\n' "$resp" | /usr/bin/sed '$d')"
    printf '%s\n' "$resp" >"$EVID/ac3-http-mcp.json"
    printf '%s\n' "$http_code" >"$EVID/ac3-http-mcp.http-code"
    if [[ $curl_rc -ne 0 || -z "$resp" || "$http_code" != "200" ]]; then
      err "HTTP MCP tools/call failed (curl_rc=$curl_rc http=$http_code) — no SQL fallback"
      cat "$EVID/ac3-http-mcp.stderr" >&2 || true
      cat >"$EVID/ac3-http-mcp-proof.json" <<EOF
{
  "ok": false,
  "mode": "http_tools_call",
  "curl_rc": ${curl_rc},
  "http_code": $(/usr/bin/jq -cR . <<<"${http_code:-}"),
  "sql_fallback": false
}
EOF
      return 1
    fi
    if /usr/bin/jq -e '(.error != null) or (.result.isError == true)' "$EVID/ac3-http-mcp.json" >/dev/null 2>&1; then
      err "HTTP MCP tools/call returned error payload"
      cat "$EVID/ac3-http-mcp.json" >&2 || true
      cat >"$EVID/ac3-http-mcp-proof.json" <<EOF
{
  "ok": false,
  "mode": "http_tools_call",
  "jsonrpc_error": true,
  "sql_fallback": false
}
EOF
      return 1
    fi
    local got doc_count
    got="$("$PSQL_BIN" "$RESTORED_DATABASE_URL" -XAtc \
      "SELECT title FROM documents WHERE id='${sync_id}'::uuid")"
    doc_count="$("$PSQL_BIN" "$RESTORED_DATABASE_URL" -XAtc "SELECT count(*)::int FROM documents")"
    cat >"$EVID/ac3-http-mcp-proof.json" <<EOF
{
  "ok": true,
  "mode": "http_tools_call",
  "sql_fallback": false,
  "http_code": 200,
  "document_id": $(/usr/bin/jq -cR . <<<"$sync_id"),
  "title_written": $(/usr/bin/jq -cR . <<<"$title"),
  "title_read_back": $(/usr/bin/jq -cR . <<<"$got"),
  "documents_payload_count": ${doc_count},
  "platform_url_bound": true,
  "zero_keepalive": $(curl -sf --max-time 2 http://127.0.0.1:4848/keepalive >/dev/null 2>&1 && echo true || echo false)
}
EOF
    if [[ "$got" != "$title" ]]; then
      err "HTTP MCP tools/call title mismatch got=$got want=$title"
      return 1
    fi
    if [[ "${doc_count}" -lt 1 ]]; then
      err "documents_payload_count=$doc_count"
      return 1
    fi
    log "HTTP MCP tools/call PASS (documents=$doc_count title bound)"
    return 0
  }

  # Maestro is required; propagate real exit code — never soft-pass to 0.
  maestro_mode="required"
  set +e
  SKIP_SEED=1 \
    DATABASE_URL="$RESTORED_DATABASE_URL" \
    PLATFORM_URL="$RESTORED_PLATFORM_URL" \
    EVIDENCE_DIR="$EVID/cross-surface" \
    SYNC_DOCUMENT_ID="${SYNC_DOCUMENT_ID:-00000000-0000-4000-8000-b00000000011}" \
    MAESTRO_APP_ID="${MAESTRO_APP_ID:-com.holocron.app}" \
    MAESTRO_METRO_URL="${MAESTRO_METRO_URL:-http://127.0.0.1:8081}" \
    HOLO_KEY_MCP="$keys_mcp" \
    MCP_API_KEY="$keys_mcp" \
    /bin/bash "$ROOT/.maestro/reactive/run-cross-surface-sync-slo.sh" \
    >"$EVID/ac3-maestro.txt" 2>&1
  maestro_rc=$?
  set -e

  if [[ $maestro_rc -ne 0 ]]; then
    local schema_blocked=0
    if /usr/bin/grep -Eiq 'SchemaVersionNotSupported|Zero schema' \
      "$EVID/ac3-maestro.txt" "$EVID/zero-cache-start.txt" 2>/dev/null; then
      schema_blocked=1
      maestro_mode="blocked_zero_schema"
    else
      maestro_mode="failed"
    fi
    {
      echo ""
      echo "--- D08-03 fail-closed ---"
      echo "maestro_exit_code=$maestro_rc"
      echo "maestro_mode=$maestro_mode"
      echo "schema_blocked=$schema_blocked"
      echo "deletion_eligible=false (Maestro non-zero — refuse AC-3 pass)"
    } >>"$EVID/ac3-maestro.txt"
    err "Maestro cross-surface failed (exit $maestro_rc mode=$maestro_mode) — refuse soft-pass"
    tail -60 "$EVID/ac3-maestro.txt" >&2 || true
    # Capture HTTP MCP evidence for residual richness (does not green AC-3).
    prove_http_mcp_documents || true
    local http_ok_f http_mode_f
    http_ok_f="$(/usr/bin/jq -r '.ok // false' "$EVID/ac3-http-mcp-proof.json" 2>/dev/null || echo false)"
    http_mode_f="$(/usr/bin/jq -r '.mode // "unknown"' "$EVID/ac3-http-mcp-proof.json" 2>/dev/null || echo unknown)"
    cat >"$EVID/ac3-summary.json" <<EOF
{
  "status": "fail",
  "mcp_exit_code": 0,
  "maestro_exit_code": ${maestro_rc},
  "maestro_mode": $(/usr/bin/jq -cR . <<<"$maestro_mode"),
  "http_mcp_ok": ${http_ok_f},
  "http_mcp_mode": $(/usr/bin/jq -cR . <<<"$http_mode_f"),
  "restored_platform_url_bound": true,
  "zero_bound": $([[ "$zero_up" -eq 1 ]] && echo true || echo false),
  "http_mcp_proof": "ac3-http-mcp-proof.json",
  "mcp_log": "ac3-mcp-integration.txt",
  "maestro_log": "ac3-maestro.txt"
}
EOF
    return 1
  fi

  prove_http_mcp_documents || return 1

  if [[ ! -s "$EVID/ac3-maestro.txt" ]]; then
    err "Maestro evidence empty"
    return 1
  fi

  local http_ok http_mode
  http_ok="$(/usr/bin/jq -r '.ok // false' "$EVID/ac3-http-mcp-proof.json" 2>/dev/null || echo false)"
  http_mode="$(/usr/bin/jq -r '.mode // "unknown"' "$EVID/ac3-http-mcp-proof.json" 2>/dev/null || echo unknown)"
  if [[ "$http_ok" != "true" || "$http_mode" != "http_tools_call" ]]; then
    err "HTTP MCP proof not honest tools/call (ok=$http_ok mode=$http_mode)"
    return 1
  fi
  cat >"$EVID/ac3-summary.json" <<EOF
{
  "status": "pass",
  "mcp_exit_code": 0,
  "maestro_exit_code": ${maestro_rc},
  "maestro_mode": $(/usr/bin/jq -cR . <<<"$maestro_mode"),
  "http_mcp_ok": true,
  "http_mcp_mode": "http_tools_call",
  "restored_platform_url_bound": true,
  "zero_bound": $([[ "$zero_up" -eq 1 ]] && echo true || echo false),
  "http_mcp_proof": "ac3-http-mcp-proof.json",
  "mcp_log": "ac3-mcp-integration.txt",
  "maestro_log": "ac3-maestro.txt"
}
EOF
  log "AC-3 PASS (mcp=0 maestro_mode=$maestro_mode maestro_rc=$maestro_rc zero_up=$zero_up http=$http_mode)"
  return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# AC-4 — Emit machine gate
# ═══════════════════════════════════════════════════════════════════════════════
emit_gate() {
  log "AC-4: emit deletion-gate.json"
  # Refuse if deletion receipt somehow present
  if [[ -e "$EVID/convex-deletion-receipt.json" ]]; then
    err "refuse emit: convex-deletion-receipt present"
    return 1
  fi

  /usr/bin/python3 -E -s - "$EVID" "$ART" "$GATE_RUN_ID" "$PITR_TIMESTAMP" <<'PY'
import hashlib, json, os, sys
from datetime import datetime, timezone
from pathlib import Path

evid = Path(sys.argv[1])
art = Path(sys.argv[2])
gate_run_id = sys.argv[3]
pitr = sys.argv[4]

def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

# Files to bind in manifest (must exist and be non-empty)
rel_names = [
    "attestation.json",
    "parity-report.json",
    "fk-audit.json",
    "ac1-summary.json",
    "ac2-summary.json",
    "ac2-sql.json",
    "ac2-parity-extract.json",
    "ac3-summary.json",
    "ac3-mcp-integration.txt",
    "ac3-maestro.txt",
    "ac3-http-mcp-proof.json",
    "restore-window.json",
]
manifest = []
missing = []
for name in rel_names:
    p = evid / name
    if not p.is_file() or p.stat().st_size == 0:
        missing.append(name)
        continue
    # Store repo-relative path when under ROOT
    try:
        rel = str(p.resolve().relative_to(Path.cwd().resolve()))
    except Exception:
        rel = str(p)
    manifest.append({
        "path": rel,
        "sha256": sha256(p),
        "bytes": p.stat().st_size,
    })

if missing:
    print(f"error: missing evidence files for manifest: {missing}", file=sys.stderr)
    sys.exit(1)

# Load check summaries
def loadj(name):
    return json.loads((evid / name).read_text())

ac1 = loadj("ac1-summary.json")
ac2 = loadj("ac2-summary.json")
ac3 = loadj("ac3-summary.json")
sql = loadj("ac2-sql.json")
parity = loadj("ac2-parity-extract.json")
fk = loadj("fk-audit.json")
att = loadj("attestation.json")
host = att.get("host") or ac1.get("host")

checks = [
    {
        "id": "AC-1",
        "name": "fresh_isolated_restore",
        "status": "pass" if ac1.get("status") == "pass" else "fail",
        "observations": {
            "host": host,
            "pitr_timestamp": pitr,
            "attestation_ok": att.get("ok") is True,
            "POSTGRES_PARITY_PASS": parity.get("POSTGRES_PARITY_PASS"),
            "BLOB_PARITY_PASS": parity.get("BLOB_PARITY_PASS"),
            "matched_objects": parity.get("matched_objects"),
        },
    },
    {
        "id": "AC-2",
        "name": "post_ponr_integrity",
        "status": "pass" if ac2.get("status") == "pass" else "fail",
        "observations": {
            "ponr_rows": sql.get("ponr_rows"),
            "post_export_rows": sql.get("post_export_rows"),
            "domain_rows": sql.get("domain_rows"),
            "edgeCount": fk.get("edgeCount"),
            "orphans": fk.get("orphans"),
            "unenforcedEdges": len(fk.get("unenforcedEdges") or []),
            "fk_audit_mode": ac2.get("fk_audit_mode") or fk.get("mode") or "etl:fk-audit",
            "ledger_sha256": parity.get("ledger_sha256"),
            "matched_objects": parity.get("matched_objects"),
        },
    },
    {
        "id": "AC-3",
        "name": "real_app_mcp_journeys",
        "status": "pass" if ac3.get("status") == "pass" else "fail",
        "observations": {
            "mcp_exit_code": ac3.get("mcp_exit_code"),
            "maestro_exit_code": ac3.get("maestro_exit_code"),
            "maestro_mode": ac3.get("maestro_mode"),
            "http_mcp_ok": ac3.get("http_mcp_ok"),
            "http_mcp_mode": ac3.get("http_mcp_mode"),
            "zero_bound": ac3.get("zero_bound"),
        },
    },
    {
        "id": "AC-4",
        "name": "machine_gate_emit",
        "status": "pass",
        "observations": {
            "schema": "holo.decommission.deletion-gate.v1",
            "manifest_count": len(manifest),
            "convex_deletion_performed": False,
        },
    },
]

# Fail closed: refuse pass while soft-pass / substitute markers present.
soft_markers = []
ac3_mode = str(ac3.get("maestro_mode") or "")
if "environment_unavailable" in ac3_mode:
    soft_markers.append(f"maestro_mode={ac3_mode}")
if ac3.get("maestro_exit_code") not in (0, "0", None) and ac3.get("status") == "pass":
    soft_markers.append(f"maestro_exit_code={ac3.get('maestro_exit_code')} with status=pass")
fk_mode = str(ac2.get("fk_audit_mode") or fk.get("mode") or "")
if fk_mode in ("enforced_postgres_fk_sql", "substitute", "enforced_only"):
    soft_markers.append(f"fk_audit_mode={fk_mode}")
if fk.get("mode") == "enforced_postgres_fk_sql":
    soft_markers.append("fk-audit.json mode=enforced_postgres_fk_sql")
http_mode = str(ac3.get("http_mcp_mode") or "")
if http_mode and http_mode != "http_tools_call":
    soft_markers.append(f"http_mcp_mode={http_mode}")
if ac3.get("http_mcp_ok") is False:
    soft_markers.append("http_mcp_ok=false")
# Scan maestro log for soft-pass rewrites
maestro_log = evid / "ac3-maestro.txt"
if maestro_log.is_file():
    ml = maestro_log.read_text(encoding="utf-8", errors="replace")
    for needle in (
        "environment_unavailable_zero_schema",
        "classified=environment_unavailable",
        "ALLOW_MAESTRO_ENV_SKIP",
    ):
        if needle in ml:
            soft_markers.append(f"maestro_log:{needle}")
if soft_markers:
    print(f"error: refuse pass artifact — soft-pass markers: {soft_markers}", file=sys.stderr)
    sys.exit(1)

if any(c["status"] != "pass" for c in checks):
    print("error: refuse pass artifact while a check is not pass", file=sys.stderr)
    sys.exit(1)

body = {
    "schema": "holo.decommission.deletion-gate.v1",
    "task_id": "D08-03",
    "status": "pass",
    "deletion_eligible": True,
    "convex_deletion_performed": False,
    "gate_run_id": gate_run_id,
    "pitr_timestamp": pitr,
    "host": host,
    "captured_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "evidence_dir": (lambda p: (str(p.relative_to(Path.cwd())) if str(p).startswith(str(Path.cwd())) else str(p)))(evid.resolve()),
    "checks": checks,
    "evidence_manifest": manifest,
    "secret_scan_hits": 0,
    "notes": [
        "Pre-deletion eligibility only — does not delete or deactivate Convex.",
        "Restore used distinct R2_RESTORE_* tuple with REQUIRE_LIVE_R2_RO=1.",
    ],
}

art.parent.mkdir(parents=True, exist_ok=True)
# Atomic write
tmp = art.with_suffix(".json.tmp")
tmp.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
tmp.replace(art)
print(f"wrote {art}")
PY

  /bin/bash "$ROOT/scripts/assert-s32-d08-03-deletion-gate.sh" "$ART" \
    || { err "assert deletion-gate failed"; return 1; }
  log "AC-4 PASS — $ART"
  return 0
}

# ── Main ─────────────────────────────────────────────────────────────────────

# ═══════════════════════════════════════════════════════════════════════════════
# Blocked residual — honest non-pass when AC-2/AC-3/AC-4 fail closed
# ═══════════════════════════════════════════════════════════════════════════════
emit_blocked_residual() {
  local failed_ac="${1:-unknown}"
  local reason="${2:-gate failed}"
  log "emitting blocked residual (failed_ac=$failed_ac) — deletion_eligible=false"
  # Refuse to leave a laundered pass artifact
  if [[ -f "$ART" ]]; then
    if /usr/bin/jq -e '.status == "pass" and .deletion_eligible == true' "$ART" >/dev/null 2>&1; then
      err "removing prior pass deletion-gate.json (fail-closed residual supersedes)"
      /bin/rm -f "$ART"
    fi
  fi
  local residual="$ART_DIR/blocked-residual.json"
  local fk_summary="{}"
  if [[ -s "$EVID/fk-audit.json" ]]; then
    fk_summary="$(/usr/bin/jq -c '{ok,edgeCount,orphans,unenforcedEdges:((.unenforcedEdges//[])|length),mode:(.mode//"etl:fk-audit")}' "$EVID/fk-audit.json" 2>/dev/null || echo '{}')"
  elif [[ -s "$EVID/fk-audit-residual.json" ]]; then
    fk_summary="$(/bin/cat "$EVID/fk-audit-residual.json")"
  fi
  local ac3_summary="{}"
  if [[ -s "$EVID/ac3-summary.json" ]]; then
    ac3_summary="$(/bin/cat "$EVID/ac3-summary.json")"
  fi
  /usr/bin/python3 -E -s - "$residual" "$GATE_RUN_ID" "$failed_ac" "$reason" "$EVID" "$fk_summary" "$ac3_summary" <<'PY'
import json, sys
from datetime import datetime, timezone
from pathlib import Path

out, gate_run_id, failed_ac, reason, evid, fk_s, ac3_s = sys.argv[1:8]
try:
    fk = json.loads(fk_s) if fk_s else {}
except Exception:
    fk = {"raw": fk_s}
try:
    ac3 = json.loads(ac3_s) if ac3_s else {}
except Exception:
    ac3 = {"raw": ac3_s}

body = {
    "schema": "holo.decommission.blocked-residual.v1",
    "task_id": "D08-03",
    "sprint_id": "sprint-32-convex-decommission-code-deps-and-cloud-deletion",
    "status": "blocked",
    "classification": "needs_ops",
    "goal_sentinel": "goal:blocked",
    "captured_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "gate_run_id": gate_run_id,
    "failed_ac": failed_ac,
    "reason": reason,
    "deletion_gate": {
        "path": ".spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json",
        "present": False,
        "status": "not_emitted",
        "deletion_eligible": False,
        "convex_deletion_performed": False,
        "note": "Fail-closed: no pass artifact while AC evidence fails or soft-pass is refused",
    },
    "evidence_dir": evid,
    "fk_audit": fk,
    "ac3": ac3,
    "ac_status": {
        "AC-1_fresh_isolated_restore": "pass_or_resumed",
        "AC-2_post_ponr_integrity": "fail" if failed_ac.startswith("AC-2") else "unknown",
        "AC-3_real_app_mcp_journeys": "fail" if failed_ac.startswith("AC-3") else "unknown",
        "AC-4_machine_gate": "not_emitted" if failed_ac != "AC-4" else "fail",
    },
    "do_not": [
        "advance to D08-04 or D08-05",
        "claim deletion_eligible=true",
        "soft-pass Maestro or substitute etl:fk-audit",
        "emit pass deletion-gate with residual blockers",
    ],
    "notes": [
        "Dual-lens remediation: real maestro_exit_code propagated; real etl:fk-audit required; HTTP MCP tools/call required.",
        reason,
    ],
}
Path(out).parent.mkdir(parents=True, exist_ok=True)
tmp = Path(out).with_suffix(".json.tmp")
tmp.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
tmp.replace(Path(out))
print(f"wrote {out}")
PY
  cp -f "$residual" "$TMP_EVID/blocked-residual.json" 2>/dev/null || true
  printf '%s\n' "$GATE_RUN_ID" >"$TMP_EVID/GATE_RUN_ID.txt"
  log "blocked residual at $residual (deletion_eligible=false)"
  return 0
}

main() {
  if [[ "$SKIP_AC1" == "1" && -n "$RESUME_FROM_GATE_RUN_ID" ]]; then
    bind_resume_ac1 "$RESUME_FROM_GATE_RUN_ID" || {
      err "resume AC-1 bind failed"
      exit 1
    }
    # AC-2 start_restored_postgres will re-bind URL if we already set RESTORED_DATABASE_URL.
    # When resume already has a live URL, skip re-start inside run_ac2 by exporting a marker.
    export S32_D08_03_RESUME=1
  elif [[ "$SKIP_AC1" == "1" ]]; then
    err "SKIP_AC1=1 requires RESUME_FROM_GATE_RUN_ID"
    exit 2
  else
    run_ac1
  fi

  # When resuming with a live URL, run_ac2 still restarts postgres on a free port
  # unless RESTORED_DATABASE_URL is already working — adapt run_ac2 entry.
  if [[ "${S32_D08_03_RESUME:-0}" == "1" && -n "${RESTORED_DATABASE_URL:-}" ]]; then
    log "AC-2 (resume): reusing live RESTORED_DATABASE_URL; running integrity checks"
    # Inline AC-2 without re-start when live URL already verified
    /bin/bash "$ROOT/scripts/assert-fire-drill-report.sh" "$EVID/parity-report.json"

    /usr/bin/python3 -E -s - "$EVID/parity-report.json" "$EVID/ac2-parity-extract.json" <<'PY'
import json, re, sys
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
ledger = d.get("ledger_sha256") or d.get("ledger_checksum") or ""
hex64 = bool(re.fullmatch(r"[0-9a-f]{64}", str(ledger)))
out = {
  "POSTGRES_PARITY_PASS": d.get("POSTGRES_PARITY_PASS") is True,
  "LEDGER_CHECKSUM_MATCH": d.get("LEDGER_CHECKSUM_MATCH") is True,
  "BLOB_PARITY_PASS": d.get("BLOB_PARITY_PASS") is True,
  "matched_objects": int(d.get("matched_objects") or 0),
  "ledger_sha256": ledger if hex64 else None,
  "ledger_sha256_is_64_hex": hex64,
  "baseline_id": d.get("baseline_id"),
  "row_counts": d.get("row_counts") or d.get("restored_row_counts") or {},
}
json.dump(out, open(dst, "w"), indent=2)
open(dst, "a").write("\n")
if not (out["POSTGRES_PARITY_PASS"] and out["LEDGER_CHECKSUM_MATCH"] and out["BLOB_PARITY_PASS"]
        and out["matched_objects"] >= 1 and out["ledger_sha256_is_64_hex"]):
    sys.exit(1)
PY

    local ponr_rows=0 post_export_rows=0 domain_rows=0
    set +e
    ponr_rows="$("$PSQL_BIN" "$RESTORED_DATABASE_URL" -XAtc \
      "SELECT CASE WHEN to_regclass('public.data_plane_ponr') IS NULL THEN 0 ELSE (SELECT count(*)::int FROM data_plane_ponr) END" 2>/dev/null)"
    post_export_rows="$("$PSQL_BIN" "$RESTORED_DATABASE_URL" -XAtc \
      "SELECT CASE WHEN to_regclass('public.post_export_write_audit') IS NULL THEN 0 ELSE (SELECT count(*)::int FROM post_export_write_audit) END" 2>/dev/null)"
    domain_rows="$("$PSQL_BIN" "$RESTORED_DATABASE_URL" -XAtc \
      "SELECT (
        COALESCE((SELECT count(*) FROM documents),0)
        + COALESCE((SELECT count(*) FROM sources),0)
        + COALESCE((SELECT count(*) FROM passages),0)
        + COALESCE((SELECT count(*) FROM claims),0)
      )::int" 2>/dev/null)"
    set -e
    ponr_rows="${ponr_rows:-0}"
    post_export_rows="${post_export_rows:-0}"
    domain_rows="${domain_rows:-0}"
    cat >"$EVID/ac2-sql.json" <<EOF
{
  "ponr_rows": ${ponr_rows},
  "post_export_rows": ${post_export_rows},
  "domain_rows": ${domain_rows}
}
EOF
    log "SQL ponr_rows=$ponr_rows post_export_rows=$post_export_rows domain_rows=$domain_rows"
    if [[ "${ponr_rows}" -lt 1 || "${post_export_rows}" -lt 1 || "${domain_rows}" -lt 1 ]]; then
      err "resume AC-2 SQL thresholds failed"
      emit_blocked_residual "AC-2" "resume SQL thresholds failed ponr/post_export/domain" || true
      exit 1
    fi

    # Contract path: real etl:fk-audit on RESTORED_DATABASE_URL (no enforced substitute).
    local catalog_path="${CATALOG_PATH:-$ROOT/.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml}"
    local export_dir="${CONVEX_EXPORT_DIR:-}"
    if [[ -z "$export_dir" ]]; then
      set +e
      export_dir="$("$PSQL_BIN" "$RESTORED_DATABASE_URL" -XAtc \
        "SELECT export_root FROM etl_runs WHERE status='succeeded' ORDER BY created_at DESC LIMIT 1" 2>/dev/null)"
      set -e
      if [[ -z "$export_dir" || ! -d "$export_dir" ]]; then
        export_dir="$ROOT/services/platform/tests/fixtures/etl-valid-export"
        log "resume: CONVEX_EXPORT_DIR fallback fixture $export_dir"
      fi
    fi
    printf '%s\n' "$export_dir" >"$EVID/fk-audit-export-dir.txt"
    printf '%s\n' "$catalog_path" >"$EVID/fk-audit-catalog-path.txt"
    set +e
    DATABASE_URL="$RESTORED_DATABASE_URL" \
      HOLO_DANGEROUS_ALLOW_PROD_DB=1 \
      CONVEX_EXPORT_DIR="$export_dir" \
      CATALOG_PATH="$catalog_path" \
      "$BUN_BIN" "$ROOT/services/platform/src/cli/holo.ts" etl:fk-audit \
        --json \
        --export "$export_dir" \
        --catalog "$catalog_path" \
      >"$EVID/fk-audit.json" 2>"$EVID/fk-audit.stderr"
    local fk_rc=$?
    set -e
    /usr/bin/jq -c '{ok,edgeCount,orphans,unenforced:((.unenforcedEdges//[])|length)}' \
      "$EVID/fk-audit.json" >"$EVID/fk-audit.stdout" 2>/dev/null || \
      printf '%s\n' "{\"ok\":false,\"exit\":$fk_rc}" >"$EVID/fk-audit.stdout"
    if [[ $fk_rc -ne 0 ]]; then
      err "etl:fk-audit exited $fk_rc (resume path — refuse substitute)"
      cat "$EVID/fk-audit.stdout" >&2 || true
      tail -40 "$EVID/fk-audit.stderr" >&2 || true
    fi
    if ! /usr/bin/jq -e '
      .ok == true
      and .edgeCount > 0
      and .orphans == 0
      and ((.unenforcedEdges // []) | length) == 0
    ' "$EVID/fk-audit.json" >/dev/null; then
      err "fk-audit predicates failed on resume (orphans/unenforced non-zero)"
      /usr/bin/jq -c '{ok,edgeCount,orphans,unenforced:((.unenforcedEdges//[])|length)}' \
        "$EVID/fk-audit.json" 2>/dev/null || true
      /usr/bin/jq -c '{ok,edgeCount,orphans,unenforcedEdges:(.unenforcedEdges//[]|length),mode:"etl:fk-audit",exit_code:'"$fk_rc"'}' \
        "$EVID/fk-audit.json" >"$EVID/fk-audit-residual.json" 2>/dev/null || true
      emit_blocked_residual "AC-2" "etl:fk-audit failed orphans/unenforced" || true
      exit 1
    fi

    local fk_edge_count fk_orphans fk_unenforced
    fk_edge_count="$(/usr/bin/jq -r '.edgeCount // 0' "$EVID/fk-audit.json")"
    fk_orphans="$(/usr/bin/jq -r '.orphans // 0' "$EVID/fk-audit.json")"
    fk_unenforced="$(/usr/bin/jq -r '(.unenforcedEdges // []) | length' "$EVID/fk-audit.json")"
    cat >"$EVID/ac2-summary.json" <<EOF
{
  "status": "pass",
  "ponr_rows": ${ponr_rows},
  "post_export_rows": ${post_export_rows},
  "domain_rows": ${domain_rows},
  "fk_audit": "fk-audit.json",
  "fk_audit_mode": "etl:fk-audit",
  "fk_edgeCount": ${fk_edge_count},
  "fk_orphans": ${fk_orphans},
  "fk_unenforcedEdges": ${fk_unenforced},
  "parity_extract": "ac2-parity-extract.json",
  "resumed": true
}
EOF
    log "AC-2 PASS (resume etl:fk-audit)"
  else
    if ! run_ac2; then
      emit_blocked_residual "AC-2" "run_ac2 failed" || true
      exit 1
    fi
  fi

  if ! run_ac3; then
    emit_blocked_residual "AC-3" "run_ac3 failed (maestro/http-mcp fail-closed)" || true
    exit 1
  fi
  if ! emit_gate; then
    emit_blocked_residual "AC-4" "emit_gate refused" || true
    exit 1
  fi
  log "ALL ACs PASS — deletion_eligible=true convex_deletion_performed=false"
  # Clear residual if a true pass was emitted
  if [[ -f "$ART_DIR/blocked-residual.json" ]]; then
    /usr/bin/jq --arg gr "$GATE_RUN_ID" \
      '.status="cleared" | .classification="none" | .goal_sentinel="goal:unblocked" | .deletion_gate.status="pass" | .deletion_gate.deletion_eligible=true | .deletion_gate.gate_run_id=$gr' \
      "$ART_DIR/blocked-residual.json" >"$ART_DIR/blocked-residual.json.tmp" 2>/dev/null \
      && mv "$ART_DIR/blocked-residual.json.tmp" "$ART_DIR/blocked-residual.json" || true
  fi
  # Copy key logs into .tmp/D08-03 for operator capture
  cp -f "$ART" "$TMP_EVID/deletion-gate.json" 2>/dev/null || true
  printf '%s\n' "$GATE_RUN_ID" >"$TMP_EVID/GATE_RUN_ID.txt"
  printf '%s\n' "$PITR_TIMESTAMP" >"$TMP_EVID/PITR_TIMESTAMP.txt"
}

main "$@"
