#!/usr/bin/env bash
# D05-03 / CAP-BAK-01 — Isolation probe for a genuinely fresh restore target.
#
# Exits 0 only when ALL checks pass:
#   (a) no TCP route to original mini Postgres (MINI_HOST:5432)
#   (b) no /mnt/mini-pgdata mount
#   (c) no /mnt/mini-blobs mount
#   (d) R2 credentials are read-only scoped (no RW parent / Put-Delete policy)
#
# Usage:
#   MINI_HOST=203.0.113.1 ./scripts/prove-isolation.sh
#   ./scripts/prove-isolation.sh 203.0.113.1
#   ./scripts/prove-isolation.sh --mini-host 203.0.113.1
#
# MUST_OBSERVE on success (stdout):
#   PASS: no route to mini Postgres
#   PASS: no mini PGDATA mount
#   PASS: no mini blob mount
#   PASS: R2 credentials are read-only scoped
#
# Never always-exits-0. Real nc / mount / env checks only.
set -euo pipefail

MINI_HOST="${MINI_HOST:-}"
MINI_PG_PORT="${MINI_PG_PORT:-5432}"
NC_TIMEOUT_SEC="${NC_TIMEOUT_SEC:-2}"
# Optional: override mount paths under test (defaults match CAP-BAK-01 contract).
MINI_PGDATA_MOUNT="${MINI_PGDATA_MOUNT:-/mnt/mini-pgdata}"
MINI_BLOB_MOUNT="${MINI_BLOB_MOUNT:-/mnt/mini-blobs}"

usage() {
  cat <<'EOF'
Usage: prove-isolation.sh [--mini-host HOST] [HOST]

Environment:
  MINI_HOST              Original mini hostname/IP (required unless positional)
  MINI_PG_PORT           Postgres port on mini (default 5432)
  NC_TIMEOUT_SEC         nc connect timeout seconds (default 2)
  MINI_PGDATA_MOUNT      Forbidden mount path (default /mnt/mini-pgdata)
  MINI_BLOB_MOUNT        Forbidden mount path (default /mnt/mini-blobs)
  R2_ACCESS_KEY_ID       Required restore-target R2 key (read-only scoped)
  R2_SECRET_ACCESS_KEY   Required restore-target R2 secret (read-only scoped)
  R2_CREDENTIAL_KIND     Must be object-read-only or read-only
  R2_CREDENTIAL_POLICY   Optional JSON; if set must not allow Put/Delete
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mini-host)
      MINI_HOST="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "FAIL: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [[ -z "$MINI_HOST" ]]; then
        MINI_HOST="$1"
      else
        echo "FAIL: unexpected argument: $1" >&2
        exit 2
      fi
      shift
      ;;
  esac
done

if [[ -z "$MINI_HOST" ]]; then
  echo "FAIL: MINI_HOST is required (env or --mini-host / positional)" >&2
  usage >&2
  exit 2
fi

failures=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; failures=$((failures + 1)); }

# ── (a) No route to mini Postgres ──────────────────────────────────────────
# Real nc probe with a hard wall-clock timeout (never hang on blackhole routes).
run_with_timeout() {
  # run_with_timeout <seconds> <command> [args...]
  # Echoes command stdout+stderr; returns command exit status (124 on timeout).
  local seconds="$1"
  shift
  local out_file rc
  out_file="$(mktemp -t prove-isolation-nc.XXXXXX)"
  (
    "$@" >"$out_file" 2>&1
  ) &
  local cmd_pid=$!
  (
    sleep "$seconds"
    kill "$cmd_pid" 2>/dev/null || true
  ) &
  local watch_pid=$!
  set +e
  wait "$cmd_pid"
  rc=$?
  set -e
  kill "$watch_pid" 2>/dev/null || true
  wait "$watch_pid" 2>/dev/null || true
  # If we killed it, treat as timeout (unreachable for isolation purposes).
  if ! kill -0 "$cmd_pid" 2>/dev/null; then
    # cmd_pid already reaped by wait; if sleep watcher fired, rc may be 143/137.
    :
  fi
  cat "$out_file" 2>/dev/null || true
  rm -f "$out_file"
  # Normalize: killed by signal → non-zero (no route).
  if [[ $rc -eq 0 ]]; then
    return 0
  fi
  return 1
}

check_no_route_to_mini_pg() {
  local host="$1" port="$2" timeout="$3"
  local nc_out="" nc_rc=1
  if ! command -v nc >/dev/null 2>&1; then
    fail "nc not available — cannot prove no route to mini Postgres"
    return
  fi

  # Prefer macOS -G / Linux -w, always under hard wall-clock cap (timeout+1).
  local wall=$((timeout + 1))
  set +e
  nc_out="$(run_with_timeout "$wall" nc -z -G "$timeout" "$host" "$port")"
  nc_rc=$?
  if [[ $nc_rc -ne 0 ]] && echo "$nc_out" | grep -qiE 'invalid|illegal|usage|unknown option'; then
    nc_out="$(run_with_timeout "$wall" nc -z -w "$timeout" "$host" "$port")"
    nc_rc=$?
  fi
  if [[ $nc_rc -ne 0 ]] && echo "$nc_out" | grep -qiE 'invalid|illegal|usage|unknown option'; then
    nc_out="$(run_with_timeout "$wall" nc -z -v "$host" "$port")"
    nc_rc=$?
  fi
  set -e

  if [[ $nc_rc -eq 0 ]]; then
    fail "mini Postgres reachable at ${host}:${port} (nc exit 0) — isolation broken"
    echo "  detail: ${nc_out}" >&2
  else
    pass "no route to mini Postgres"
  fi
}

# ── (b)(c) No mini data mounts ─────────────────────────────────────────────
# Fail if mount table lists the path as a mount point OR if it exists as a
# mount-style directory that is a mount (findmnt / mount | grep).
check_no_mount() {
  local path="$1"
  local label="$2"
  local mounted=0

  if command -v findmnt >/dev/null 2>&1; then
    if findmnt -n "$path" >/dev/null 2>&1; then
      mounted=1
    fi
  fi

  # Parse mount table (macOS + Linux). Match mount path as a field.
  if mount 2>/dev/null | awk -v p="$path" '
    {
      for (i = 1; i <= NF; i++) {
        if ($i == p || $i ~ ("^" p "$")) { found=1 }
        # macOS: "on /mnt/mini-pgdata ("
        if ($i == "on" && $(i+1) == p) { found=1 }
      }
    }
    END { exit found ? 0 : 1 }
  '; then
    mounted=1
  fi

  # Also refuse if path is present in /proc/mounts (Linux containers).
  if [[ -r /proc/mounts ]] && awk -v p="$path" '$2 == p { found=1 } END { exit found ? 0 : 1 }' /proc/mounts 2>/dev/null; then
    mounted=1
  fi

  # Explicit probe: bind-mount detection via device identity vs parent (best-effort).
  if [[ -d "$path" ]] && command -v df >/dev/null 2>&1; then
    local path_dev parent_dev parent
    parent="$(dirname "$path")"
    path_dev="$(df -P "$path" 2>/dev/null | awk 'NR==2 {print $1}')"
    parent_dev="$(df -P "$parent" 2>/dev/null | awk 'NR==2 {print $1}')"
    if [[ -n "$path_dev" && -n "$parent_dev" && "$path_dev" != "$parent_dev" ]]; then
      mounted=1
    fi
  fi

  if [[ $mounted -eq 1 ]]; then
    fail "${label} mounted at ${path} — isolation broken"
  else
    pass "no mini ${label} mount"
  fi
}

# ── (d) R2 credentials read-only scoped ────────────────────────────────────
check_r2_readonly() {
  local kind="${R2_CREDENTIAL_KIND:-}"
  local policy="${R2_CREDENTIAL_POLICY:-}"
  local key="${R2_ACCESS_KEY_ID:-}"
  local secret="${R2_SECRET_ACCESS_KEY:-}"
  local bad=0

  # Forbidden ambient RW / parent admin credentials on restore target.
  local forbidden_vars=(
    R2_PARENT_ACCESS_KEY_ID
    R2_PARENT_SECRET_ACCESS_KEY
    R2_READ_WRITE_CREDENTIAL
    R2_READ_WRITE_ACCESS_KEY_ID
    R2_READ_WRITE_SECRET_ACCESS_KEY
    R2_RW_ACCESS_KEY_ID
    R2_RW_SECRET_ACCESS_KEY
  )
  local v
  for v in "${forbidden_vars[@]}"; do
    if [[ -n "${!v:-}" ]]; then
      echo "  detail: forbidden env ${v} is set" >&2
      bad=1
    fi
  done

  # Any env key matching *READ_WRITE* / *_RW_* under R2_ is forbidden when non-empty.
  # Empty values (e.g. docker -e VAR= to clear) are ignored.
  while IFS= read -r line; do
    local ename="${line%%=*}"
    local eval="${line#*=}"
    if [[ -z "$eval" ]]; then
      continue
    fi
    if [[ "$ename" == R2_*READ_WRITE* || "$ename" == R2_*_RW_* ]]; then
      echo "  detail: forbidden env pattern ${ename} is set" >&2
      bad=1
    fi
  done < <(env | grep -E '^R2_' || true)

  if [[ -z "$key" || -z "$secret" ]]; then
    echo "  detail: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must both be set" >&2
    bad=1
  fi

  # Kind must explicitly declare read-only scope (not backup RW runtime).
  case "$kind" in
    object-read-only|read-only|object_read_only|readonly)
      ;;
    *)
      echo "  detail: R2_CREDENTIAL_KIND must be object-read-only or read-only (got: '${kind:-<empty>}')" >&2
      bad=1
      ;;
  esac

  # If policy JSON present, reject Put/Delete actions and wildcards.
  if [[ -n "$policy" ]]; then
    if echo "$policy" | grep -qiE 's3:PutObject|s3:DeleteObject|s3:Put|s3:Delete|"s3:\*"|"\*"'; then
      # Allow only if the matching tokens are clearly under Deny (rare); fail closed.
      if echo "$policy" | grep -qiE 's3:PutObject|s3:DeleteObject|"s3:\*"'; then
        # Check whether Put/Delete appear inside an Allow statement roughly.
        if echo "$policy" | tr -d '\n' | grep -qiE 'Effect["[:space:]]*:["[:space:]]*Allow[^}]*s3:(PutObject|DeleteObject)'; then
          echo "  detail: R2_CREDENTIAL_POLICY allows Put/Delete — not read-only" >&2
          bad=1
        elif echo "$policy" | grep -qiE 's3:PutObject|s3:DeleteObject'; then
          # Fail closed even without perfect JSON parse — restore target policy
          # must be List/Get only; Put/Delete strings indicate wrong policy.
          echo "  detail: R2_CREDENTIAL_POLICY contains Put/Delete actions — not read-only" >&2
          bad=1
        fi
      fi
      if echo "$policy" | grep -qE '"Action"[[:space:]]*:[[:space:]]*"\*"|"Resource"[[:space:]]*:[[:space:]]*"\*"|"s3:\*"'; then
        echo "  detail: R2_CREDENTIAL_POLICY contains wildcards — not least-privilege" >&2
        bad=1
      fi
    fi
    # Positive signal: policy should mention List and Get (when provided).
    if ! echo "$policy" | grep -qiE 's3:ListBucket|ListBucket'; then
      echo "  detail: R2_CREDENTIAL_POLICY missing ListBucket" >&2
      bad=1
    fi
    if ! echo "$policy" | grep -qiE 's3:GetObject|GetObject'; then
      echo "  detail: R2_CREDENTIAL_POLICY missing GetObject" >&2
      bad=1
    fi
  fi

  if [[ $bad -eq 0 ]]; then
    pass "R2 credentials are read-only scoped"
  else
    fail "R2 credentials are not read-only scoped"
  fi
}

echo "=== prove-isolation (mini=${MINI_HOST}:${MINI_PG_PORT}) ==="
check_no_route_to_mini_pg "$MINI_HOST" "$MINI_PG_PORT" "$NC_TIMEOUT_SEC"
check_no_mount "$MINI_PGDATA_MOUNT" "PGDATA"
check_no_mount "$MINI_BLOB_MOUNT" "blob"
check_r2_readonly

if [[ $failures -gt 0 ]]; then
  echo "=== RESULT: FAIL (${failures} check(s) failed) ==="
  exit 1
fi

echo "=== RESULT: PASS (all isolation checks) ==="
exit 0
