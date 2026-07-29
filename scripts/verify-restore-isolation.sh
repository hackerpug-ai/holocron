#!/usr/bin/env bash
# D05-06 / CAP-BAK-01 AC-1 — Fresh restore target isolation probe (security review).
#
# Real connectivity + mount checks only. Never always-exits-0.
#
# PASS only when ALL hold:
#   (1) MINI_HOST is set and is NOT a co-located/local mini address when local :5432 is open
#   (2) nc to MINI_HOST:MINI_PG_PORT is unreachable (non-zero)
#   (3) mount table has 0 entries for mini PGDATA / blob paths
#   (4) optional: Docker restore target not on host network / not sharing mini volumes
#
# Usage:
#   MINI_HOST=203.0.113.1 ./scripts/verify-restore-isolation.sh
#   ./scripts/verify-restore-isolation.sh --mini-host 203.0.113.1
#   RESTORE_CONTAINER=fresh-restore-01 ./scripts/verify-restore-isolation.sh --mini-host 203.0.113.1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MINI_HOST="${MINI_HOST:-}"
MINI_PG_PORT="${MINI_PG_PORT:-5432}"
NC_TIMEOUT_SEC="${NC_TIMEOUT_SEC:-2}"
MINI_PGDATA_MOUNT="${MINI_PGDATA_MOUNT:-/mnt/mini-pgdata}"
MINI_BLOB_MOUNT="${MINI_BLOB_MOUNT:-/mnt/mini-blobs}"
RESTORE_CONTAINER="${RESTORE_CONTAINER:-fresh-restore-01}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.tmp/D05-06}"

PASS_COUNT=0
FAIL_COUNT=0
pass() { echo "PASS: $*"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "FAIL: $*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
info() { echo "INFO: $*"; }

usage() {
  cat <<'EOF'
Usage: verify-restore-isolation.sh [--mini-host HOST] [HOST]

Environment:
  MINI_HOST              Original mini hostname/IP (required)
  MINI_PG_PORT           Postgres port on mini (default 5432)
  NC_TIMEOUT_SEC         nc connect timeout seconds (default 2)
  MINI_PGDATA_MOUNT      Forbidden mount path (default /mnt/mini-pgdata)
  MINI_BLOB_MOUNT        Forbidden mount path (default /mnt/mini-blobs)
  RESTORE_CONTAINER      Optional docker container to audit (default fresh-restore-01)
  EVIDENCE_DIR           Where to write probe logs (default .tmp/D05-06)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mini-host) MINI_HOST="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    --) shift; break ;;
    -*)
      echo "FAIL: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [[ -z "$MINI_HOST" ]]; then MINI_HOST="$1"; else
        echo "FAIL: unexpected argument: $1" >&2; exit 2
      fi
      shift
      ;;
  esac
done

if [[ -z "$MINI_HOST" ]]; then
  # Prefer restore-target.env if present
  for cand in \
    "$ROOT/.tmp/fresh-restore/fresh-restore-01/restore-target.env" \
    "$ROOT/../D05-03/.tmp/fresh-restore/fresh-restore-01/restore-target.env" \
    "/Users/inference1/Projects/holocron/.kb-run-sprint/worktrees/D05-03/.tmp/fresh-restore/fresh-restore-01/restore-target.env"
  do
    if [[ -f "$cand" ]]; then
      # shellcheck disable=SC1090
      set -a; source "$cand"; set +a
      MINI_HOST="${MINI_HOST:-}"
      info "loaded MINI_HOST from $cand"
      break
    fi
  done
fi

if [[ -z "$MINI_HOST" ]]; then
  echo "FAIL: MINI_HOST is required (env, --mini-host, or restore-target.env)" >&2
  usage >&2
  exit 2
fi

mkdir -p "$EVIDENCE_DIR"
LOG="$EVIDENCE_DIR/ac1-isolation-probe.txt"
exec > >(tee "$LOG") 2>&1

echo "=== verify-restore-isolation (mini=${MINI_HOST}:${MINI_PG_PORT}) ==="

# Refuse treating localhost / loopback as "isolated" when local Postgres is listening —
# that is co-location, not a fresh hardware boundary.
is_loopback_host() {
  case "$1" in
    127.0.0.1|localhost|::1|0.0.0.0) return 0 ;;
    *) return 1 ;;
  esac
}

local_pg_listening() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${MINI_PG_PORT}" -sTCP:LISTEN 2>/dev/null | grep -qE '127\.0\.0\.1|::1|\*' && return 0
  fi
  if command -v nc >/dev/null 2>&1; then
    if nc -z -G 1 127.0.0.1 "$MINI_PG_PORT" 2>/dev/null || nc -z -w 1 127.0.0.1 "$MINI_PG_PORT" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

if is_loopback_host "$MINI_HOST"; then
  if local_pg_listening; then
    fail "MINI_HOST=${MINI_HOST} is loopback and local :${MINI_PG_PORT} is listening — co-located, not isolated"
  else
    info "MINI_HOST is loopback but local :${MINI_PG_PORT} not listening — still rejecting loopback as mini identity"
    fail "MINI_HOST must be the original mini address (not loopback) for a meaningful isolation probe"
  fi
else
  pass "MINI_HOST is not loopback (${MINI_HOST})"
fi

run_with_timeout() {
  local seconds="$1"; shift
  local out_file rc
  out_file="$(mktemp -t verify-isolation-nc.XXXXXX)"
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
  cat "$out_file" 2>/dev/null || true
  rm -f "$out_file"
  [[ $rc -eq 0 ]] && return 0
  return 1
}

# (1) Real nc probe to mini Postgres
if ! command -v nc >/dev/null 2>&1; then
  fail "nc not available — cannot prove no route to mini Postgres"
else
  wall=$((NC_TIMEOUT_SEC + 1))
  nc_out=""
  nc_rc=1
  set +e
  nc_out="$(run_with_timeout "$wall" nc -z -G "$NC_TIMEOUT_SEC" "$MINI_HOST" "$MINI_PG_PORT")"
  nc_rc=$?
  if [[ $nc_rc -ne 0 ]] && echo "$nc_out" | grep -qiE 'invalid|illegal|usage|unknown option'; then
    nc_out="$(run_with_timeout "$wall" nc -z -w "$NC_TIMEOUT_SEC" "$MINI_HOST" "$MINI_PG_PORT")"
    nc_rc=$?
  fi
  if [[ $nc_rc -ne 0 ]] && echo "$nc_out" | grep -qiE 'invalid|illegal|usage|unknown option'; then
    nc_out="$(run_with_timeout "$wall" nc -z -v "$MINI_HOST" "$MINI_PG_PORT")"
    nc_rc=$?
  fi
  set -e
  if [[ $nc_rc -eq 0 ]]; then
    fail "mini Postgres reachable at ${MINI_HOST}:${MINI_PG_PORT} (nc exit 0) — isolation broken"
    echo "  detail: ${nc_out}" >&2
  else
    pass "no route to mini Postgres (nc -z ${MINI_HOST} ${MINI_PG_PORT} exit non-zero)"
    info "nc_detail: $(echo "$nc_out" | tr '\n' ' ' | head -c 200)"
  fi
fi

# (2) Mount table: no shared mini PGDATA / blob mounts
check_no_mount() {
  local path="$1" label="$2"
  local mounted=0

  if command -v findmnt >/dev/null 2>&1; then
    if findmnt -n "$path" >/dev/null 2>&1; then mounted=1; fi
  fi
  if mount 2>/dev/null | awk -v p="$path" '
    {
      for (i = 1; i <= NF; i++) {
        if ($i == p) { found=1 }
        if ($i == "on" && $(i+1) == p) { found=1 }
      }
    }
    END { exit found ? 0 : 1 }
  '; then
    mounted=1
  fi
  if [[ -r /proc/mounts ]] && awk -v p="$path" '$2 == p { found=1 } END { exit found ? 0 : 1 }' /proc/mounts 2>/dev/null; then
    mounted=1
  fi
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
    pass "no mini ${label} mount at ${path}"
  fi
}

check_no_mount "$MINI_PGDATA_MOUNT" "PGDATA"
check_no_mount "$MINI_BLOB_MOUNT" "blob"

# Also fail if mount table references classic mini live paths as restore mounts
if mount 2>/dev/null | grep -qiE '/mnt/mini-(pgdata|blobs)|mini-pgdata|mini-blobs'; then
  fail "mount table still references mini data paths"
  mount 2>/dev/null | grep -iE 'mini' || true
else
  pass "mount table has 0 mini PGDATA/blob path entries"
fi

# (3) Docker restore target audit (best-effort when container exists)
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if docker inspect "$RESTORE_CONTAINER" >/dev/null 2>&1; then
    mode="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$RESTORE_CONTAINER" 2>/dev/null || true)"
    binds="$(docker inspect -f '{{json .HostConfig.Binds}}' "$RESTORE_CONTAINER" 2>/dev/null || echo null)"
    mounts="$(docker inspect -f '{{json .Mounts}}' "$RESTORE_CONTAINER" 2>/dev/null || echo null)"
    ports="$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$RESTORE_CONTAINER" 2>/dev/null || echo null)"
    info "container=${RESTORE_CONTAINER} NetworkMode=${mode}"
    info "PortBindings=${ports}"

    if [[ "$mode" == "host" ]]; then
      fail "restore container uses network_mode=host (shares mini host routes)"
    else
      pass "restore container not on host network (mode=${mode})"
    fi

    if echo "$binds$mounts" | grep -qiE '/mnt/mini-|postgresql@|/opt/homebrew/var/postgresql|mini-pgdata|mini-blobs'; then
      fail "restore container mounts look like mini live data paths"
      echo "  binds=${binds}" >&2
    else
      pass "restore container has no mini live-data bind mounts"
    fi

    # Host port publish must be loopback-only if published
    if echo "$ports" | grep -qE '"HostIp":\s*""|"HostIp":\s*"0\.0\.0\.0"|"HostIp":\s*"::"'; then
      fail "restore container publishes Postgres on non-loopback HostIp"
    elif echo "$ports" | grep -q 'HostPort'; then
      if echo "$ports" | grep -qE '"HostIp":\s*"127\.0\.0\.1"'; then
        pass "restore container Postgres publish is loopback-only (127.0.0.1)"
      else
        # empty HostIp means 0.0.0.0 on docker
        fail "restore container Postgres publish HostIp is not 127.0.0.1"
      fi
    else
      info "no PortBindings on restore container (ok if not yet started)"
    fi

    # In-container nc if prove script mounted
    set +e
    docker exec \
      -e "MINI_HOST=${MINI_HOST}" \
      -e "MINI_PG_PORT=${MINI_PG_PORT}" \
      "$RESTORE_CONTAINER" \
      sh -c "command -v nc >/dev/null && (nc -z -w ${NC_TIMEOUT_SEC} \"\$MINI_HOST\" \"\$MINI_PG_PORT\" || nc -z -G ${NC_TIMEOUT_SEC} \"\$MINI_HOST\" \"\$MINI_PG_PORT\"); echo nc_rc=\$?" \
      >"$EVIDENCE_DIR/ac1-incontainer-nc.txt" 2>&1
    in_rc=$?
    set -e
    if [[ $in_rc -eq 0 ]] && grep -q 'nc_rc=0' "$EVIDENCE_DIR/ac1-incontainer-nc.txt" 2>/dev/null; then
      fail "in-container nc reached mini ${MINI_HOST}:${MINI_PG_PORT}"
    elif [[ -f "$EVIDENCE_DIR/ac1-incontainer-nc.txt" ]]; then
      # non-zero or nc missing: if nc ran and reported non-zero, pass
      if grep -qE 'nc_rc=[1-9]' "$EVIDENCE_DIR/ac1-incontainer-nc.txt" 2>/dev/null; then
        pass "in-container nc cannot reach mini Postgres"
      else
        info "in-container nc probe skipped or inconclusive (see ac1-incontainer-nc.txt)"
      fi
    fi
  else
    info "docker container ${RESTORE_CONTAINER} not present — host-level isolation only"
  fi
else
  info "docker unavailable — host-level isolation only"
fi

reachable_routes=0
if [[ $FAIL_COUNT -gt 0 ]]; then
  # count route-related fails loosely for summary
  reachable_routes=$FAIL_COUNT
fi

echo "=== SUMMARY: pass=${PASS_COUNT} fail=${FAIL_COUNT} mini=${MINI_HOST}:${MINI_PG_PORT} ==="
echo "reachable_mini_routes_failed_checks=${FAIL_COUNT}"

if [[ $FAIL_COUNT -gt 0 ]]; then
  echo "=== RESULT: FAIL (isolation broken or probe incomplete) ==="
  exit 1
fi

echo "=== RESULT: PASS (0 reachable mini routes; 0 shared mini mounts) ==="
exit 0
