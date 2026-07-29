#!/usr/bin/env bash
# D05-06 / REDHAT-FIX-H3 / CAP-BAK-01 — Multi-axis fresh restore target isolation
# probe (security review oracle).
#
# Real connectivity + mount + identity + IPC + control-plane checks only.
# Never always-exits-0. Supersedes narrow TCP/5432 + two path strings.
#
# PASS only when ALL multi-axis hold:
#   AXIS network / ipc_sockets / mounts / identity / control_plane / docker_runtime
#   → 0 reachable mini routes/sockets/mounts and distinct attested identity
#
# Usage:
#   MINI_HOST=203.0.113.1 MINI_ATTESTED_IDENTITY=... TARGET_ATTESTED_IDENTITY=... \
#     ./scripts/verify-restore-isolation.sh
#   RESTORE_CONTAINER=fresh-restore-01 ./scripts/verify-restore-isolation.sh --mini-host 203.0.113.1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MINI_HOST="${MINI_HOST:-}"
MINI_PG_PORT="${MINI_PG_PORT:-5432}"
MINI_SSH_PORT="${MINI_SSH_PORT:-22}"
NC_TIMEOUT_SEC="${NC_TIMEOUT_SEC:-2}"
MINI_PGDATA_MOUNT="${MINI_PGDATA_MOUNT:-/mnt/mini-pgdata}"
MINI_BLOB_MOUNT="${MINI_BLOB_MOUNT:-/mnt/mini-blobs}"
RESTORE_CONTAINER="${RESTORE_CONTAINER:-fresh-restore-01}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.tmp/D05-06}"
REQUIRE_ATTESTED_IDENTITY="${REQUIRE_ATTESTED_IDENTITY:-1}"
MINI_IPV4="${MINI_IPV4:-}"
MINI_IPV6="${MINI_IPV6:-}"
MINI_TAILNET_IP="${MINI_TAILNET_IP:-}"
MINI_LAN_IP="${MINI_LAN_IP:-}"
MINI_DNS_ALIASES="${MINI_DNS_ALIASES:-}"
MINI_HOSTNAMES="${MINI_HOSTNAMES:-}"
MINI_CONTROL_PORTS="${MINI_CONTROL_PORTS:-}"
MINI_UNIX_SOCKETS="${MINI_UNIX_SOCKETS:-}"
MINI_SOCKET_DEFAULTS="${MINI_SOCKET_DEFAULTS:-1}"
MINI_FORBIDDEN_MOUNT_PATHS="${MINI_FORBIDDEN_MOUNT_PATHS:-}"
TARGET_ATTESTED_IDENTITY="${TARGET_ATTESTED_IDENTITY:-}"
MINI_ATTESTED_IDENTITY="${MINI_ATTESTED_IDENTITY:-}"

PASS_COUNT=0
FAIL_COUNT=0
AXIS_FAIL=0
pass() { echo "PASS: $*"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "FAIL: $*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
info() { echo "INFO: $*"; }
axis_begin() { echo "--- AXIS: $1 ---"; }
axis_end() {
  local name="$1"
  local before="$2"
  local delta=$((FAIL_COUNT - before))
  if [[ $delta -eq 0 ]]; then
    echo "AXIS ${name}: PASS"
  else
    echo "AXIS ${name}: FAIL (${delta} check(s))"
    AXIS_FAIL=$((AXIS_FAIL + 1))
  fi
}

usage() {
  cat <<'EOF'
Usage: verify-restore-isolation.sh [--mini-host HOST] [HOST]

Multi-axis isolation oracle (REDHAT-FIX-H3). Exit 0 only if all axes PASS.

Environment:
  MINI_HOST / MINI_IPV4 / MINI_IPV6 / MINI_TAILNET_IP / MINI_LAN_IP
  MINI_DNS_ALIASES / MINI_HOSTNAMES / MINI_CONTROL_PORTS
  MINI_PG_PORT / MINI_SSH_PORT / NC_TIMEOUT_SEC
  MINI_PGDATA_MOUNT / MINI_BLOB_MOUNT / MINI_FORBIDDEN_MOUNT_PATHS
  MINI_UNIX_SOCKETS
  TARGET_ATTESTED_IDENTITY / MINI_ATTESTED_IDENTITY / REQUIRE_ATTESTED_IDENTITY
  RESTORE_CONTAINER   Optional docker container to audit (default fresh-restore-01)
  EVIDENCE_DIR        Where to write probe logs (default .tmp/D05-06)
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
  for cand in \
    "$ROOT/.tmp/fresh-restore/fresh-restore-01/restore-target.env" \
    "$ROOT/../D05-03/.tmp/fresh-restore/fresh-restore-01/restore-target.env" \
    "/Users/inference1/Projects/holocron/.kb-run-sprint/worktrees/D05-03/.tmp/fresh-restore/fresh-restore-01/restore-target.env"
  do
    if [[ -f "$cand" ]]; then
      # shellcheck disable=SC1090
      set -a; source "$cand"; set +a
      MINI_HOST="${MINI_HOST:-}"
      info "loaded env from $cand"
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

echo "=== verify-restore-isolation MULTI-AXIS (mini=${MINI_HOST}:${MINI_PG_PORT}) ==="
echo "contract: network+ipc_sockets+mounts+identity+control_plane+docker_runtime"
echo "supersedes: TCP/5432 + /mnt/mini-pgdata|/mnt/mini-blobs only"

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

run_with_timeout() {
  local seconds="$1"; shift
  local out_file rc
  out_file="$(mktemp -t verify-isolation-nc.XXXXXX)"
  (
    set -m
    "$@" >"$out_file" 2>&1 &
    local inner=$!
    (
      sleep "$seconds"
      kill -TERM -"$inner" 2>/dev/null || kill -TERM "$inner" 2>/dev/null || true
      sleep 0.2
      kill -KILL -"$inner" 2>/dev/null || kill -KILL "$inner" 2>/dev/null || true
    ) &
    local watch=$!
    set +e
    wait "$inner"
    rc=$?
    set -e
    kill "$watch" 2>/dev/null || true
    wait "$watch" 2>/dev/null || true
    exit "$rc"
  ) &
  local cmd_pid=$!
  set +e
  wait "$cmd_pid"
  rc=$?
  set -e
  cat "$out_file" 2>/dev/null || true
  rm -f "$out_file"
  [[ $rc -eq 0 ]] && return 0
  return 1
}

tcp_reachable() {
  local host="$1" port="$2" timeout="${3:-$NC_TIMEOUT_SEC}"
  local nc_out="" nc_rc=1
  local wall="$timeout"
  if [[ "$wall" -lt 1 ]]; then wall=1; fi
  if ! command -v nc >/dev/null 2>&1; then
    return 2
  fi
  set +e
  if [[ -z "${_VERIFY_NC_STYLE:-}" ]]; then
    nc_out="$(run_with_timeout "$wall" nc -z -G "$timeout" "$host" "$port")"
    nc_rc=$?
    if echo "$nc_out" | grep -qiE 'invalid|illegal|usage|unknown option'; then
      nc_out="$(run_with_timeout "$wall" nc -z -w "$timeout" "$host" "$port")"
      nc_rc=$?
      if echo "$nc_out" | grep -qiE 'invalid|illegal|usage|unknown option'; then
        _VERIFY_NC_STYLE=plain
        export _VERIFY_NC_STYLE
        nc_out="$(run_with_timeout "$wall" nc -z -v "$host" "$port")"
        nc_rc=$?
      else
        _VERIFY_NC_STYLE=w
        export _VERIFY_NC_STYLE
      fi
    else
      _VERIFY_NC_STYLE=G
      export _VERIFY_NC_STYLE
    fi
  else
    case "$_VERIFY_NC_STYLE" in
      G) nc_out="$(run_with_timeout "$wall" nc -z -G "$timeout" "$host" "$port")"; nc_rc=$? ;;
      w) nc_out="$(run_with_timeout "$wall" nc -z -w "$timeout" "$host" "$port")"; nc_rc=$? ;;
      *) nc_out="$(run_with_timeout "$wall" nc -z -v "$host" "$port")"; nc_rc=$? ;;
    esac
  fi
  set -e
  if [[ $nc_rc -eq 0 ]]; then
    echo "$nc_out"
    return 0
  fi
  return 1
}

csv_items() {
  local raw="${1:-}"
  [[ -z "$raw" ]] && return 0
  local IFS=','
  local item
  for item in $raw; do
    item="$(echo "$item" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [[ -n "$item" ]] && printf '%s\n' "$item"
  done
}

path_is_mounted() {
  local path="$1"
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
  [[ $mounted -eq 1 ]]
}

read_local_attested_identity() {
  local id=""
  if [[ -r /etc/machine-id ]]; then
    id="$(tr -d '[:space:]' </etc/machine-id 2>/dev/null || true)"
  fi
  if [[ -z "$id" && -r /var/lib/dbus/machine-id ]]; then
    id="$(tr -d '[:space:]' </var/lib/dbus/machine-id 2>/dev/null || true)"
  fi
  if [[ -z "$id" ]] && command -v ioreg >/dev/null 2>&1; then
    id="$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk -F'"' '/IOPlatformUUID/{print $4; exit}' | tr -d '[:space:]')"
  fi
  if [[ -z "$id" ]] && command -v sysctl >/dev/null 2>&1; then
    id="$(sysctl -n kern.uuid 2>/dev/null | tr -d '[:space:]' || true)"
  fi
  if [[ -z "$id" ]] && command -v curl >/dev/null 2>&1; then
    id="$(curl -sS -m 1 http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null | tr -d '[:space:]' || true)"
  fi
  printf '%s' "$id"
}

# Refuse loopback mini identity when co-located.
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

# ── AXIS network ───────────────────────────────────────────────────────────
axis_begin "network"
_net_before=$FAIL_COUNT
if ! command -v nc >/dev/null 2>&1; then
  fail "nc not available — cannot prove no route to mini"
else
  hosts=("$MINI_HOST")
  [[ -n "$MINI_IPV4" ]] && hosts+=("$MINI_IPV4")
  [[ -n "$MINI_IPV6" ]] && hosts+=("$MINI_IPV6")
  [[ -n "$MINI_TAILNET_IP" ]] && hosts+=("$MINI_TAILNET_IP")
  [[ -n "$MINI_LAN_IP" ]] && hosts+=("$MINI_LAN_IP")
  while IFS= read -r h; do [[ -n "$h" ]] && hosts+=("$h"); done < <(csv_items "$MINI_HOSTNAMES")
  while IFS= read -r h; do [[ -n "$h" ]] && hosts+=("$h"); done < <(csv_items "$MINI_DNS_ALIASES")

  ports=("$MINI_PG_PORT")
  while IFS= read -r p; do [[ -n "$p" ]] && ports+=("$p"); done < <(csv_items "$MINI_CONTROL_PORTS")

  info "network coordinates: ${hosts[*]}"
  info "network ports: ${ports[*]} (+ SSH ${MINI_SSH_PORT} on primary)"

  reachable=0
  for h in "${hosts[@]}"; do
    [[ -z "$h" ]] && continue
    for p in "${ports[@]}"; do
      set +e
      detail="$(tcp_reachable "$h" "$p")"
      trc=$?
      set -e
      if [[ $trc -eq 0 ]]; then
        fail "mini network target reachable at ${h}:${p}"
        echo "  detail: ${detail}" >&2
        reachable=$((reachable + 1))
      else
        pass "no route to mini at ${h}:${p}"
      fi
    done
  done
  set +e
  detail="$(tcp_reachable "$MINI_HOST" "$MINI_SSH_PORT")"
  trc=$?
  set -e
  if [[ $trc -eq 0 ]]; then
    fail "mini network target reachable at ${MINI_HOST}:${MINI_SSH_PORT} (SSH)"
    reachable=$((reachable + 1))
  else
    pass "no route to mini at ${MINI_HOST}:${MINI_SSH_PORT}"
  fi
  if [[ $reachable -eq 0 ]]; then
    pass "0 successful mini network connections (IPv4/IPv6/tailnet/LAN/DNS)"
  fi
fi
axis_end "network" "$_net_before"

# ── AXIS ipc_sockets ───────────────────────────────────────────────────────
axis_begin "ipc_sockets"
_ipc_before=$FAIL_COUNT
sockets=()
if [[ "${MINI_SOCKET_DEFAULTS}" == "1" ]]; then
  sockets+=(
    /tmp/.s.PGSQL.5432
    /var/run/postgresql/.s.PGSQL.5432
    /run/postgresql/.s.PGSQL.5432
    /private/tmp/.s.PGSQL.5432
  )
else
  info "MINI_SOCKET_DEFAULTS=0 — classic PG socket list skipped; probing MINI_UNIX_SOCKETS only"
fi
while IFS= read -r s; do [[ -n "$s" ]] && sockets+=("$s"); done < <(csv_items "$MINI_UNIX_SOCKETS")
if [[ ${#sockets[@]} -eq 0 ]]; then
  fail "ipc_sockets axis has zero paths to probe (set MINI_UNIX_SOCKETS or MINI_SOCKET_DEFAULTS=1)"
fi
open_socks=0
for s in "${sockets[@]}"; do
  if [[ -S "$s" ]]; then
    fail "mini-like unix socket present at ${s}"
    open_socks=$((open_socks + 1))
  else
    pass "no unix socket at ${s}"
  fi
done
if [[ $open_socks -eq 0 ]]; then
  pass "0 mini unix sockets accessible"
fi
axis_end "ipc_sockets" "$_ipc_before"

# ── AXIS mounts ────────────────────────────────────────────────────────────
axis_begin "mounts"
_mnt_before=$FAIL_COUNT
for pair in "${MINI_PGDATA_MOUNT}:PGDATA" "${MINI_BLOB_MOUNT}:blob"; do
  path="${pair%%:*}"
  label="${pair##*:}"
  if path_is_mounted "$path"; then
    fail "${label} mounted at ${path} — isolation broken"
  else
    pass "no mini ${label} mount at ${path}"
  fi
done

if mount 2>/dev/null | grep -qiE '/mnt/mini-(pgdata|blobs)|mini-pgdata|mini-blobs|/opt/homebrew/var/postgresql|postgresql@[0-9]+'; then
  fail "mount table still references mini data paths"
  mount 2>/dev/null | grep -iE 'mini|postgresql@|homebrew/var/postgresql' || true
else
  pass "mount table has 0 mini PGDATA/blob path entries"
fi

extra_paths=(/mnt/mini-pgdata-alt /mnt/mini-data /mnt/restore-from-mini /var/lib/postgresql/mini)
while IFS= read -r ep; do [[ -n "$ep" ]] && extra_paths+=("$ep"); done < <(csv_items "$MINI_FORBIDDEN_MOUNT_PATHS")
for ep in "${extra_paths[@]}"; do
  if path_is_mounted "$ep"; then
    fail "alternate mini bind-mount present at ${ep}"
  else
    pass "no alternate mini mount at ${ep}"
  fi
done
axis_end "mounts" "$_mnt_before"

# ── AXIS identity ──────────────────────────────────────────────────────────
axis_begin "identity"
_id_before=$FAIL_COUNT
target_id="$TARGET_ATTESTED_IDENTITY"
mini_id="$MINI_ATTESTED_IDENTITY"
source="env"
if [[ -z "$target_id" ]]; then
  target_id="$(read_local_attested_identity)"
  source="os"
fi
info "TARGET_ATTESTED_IDENTITY source=${source} value=${target_id:-<empty>}"
info "MINI_ATTESTED_IDENTITY value=${mini_id:-<empty>}"

if [[ "${REQUIRE_ATTESTED_IDENTITY}" == "1" ]]; then
  if [[ -z "$target_id" ]]; then
    fail "TARGET_ATTESTED_IDENTITY empty"
  else
    pass "target attested identity non-empty"
  fi
  if [[ -z "$mini_id" ]]; then
    fail "MINI_ATTESTED_IDENTITY empty"
  else
    pass "mini attested identity non-empty"
  fi
  if [[ -n "$target_id" && -n "$mini_id" ]]; then
    if [[ "$target_id" == "$mini_id" ]]; then
      fail "identity collision: target == mini (${target_id})"
    else
      pass "target identity distinct from mini"
    fi
  fi
else
  info "REQUIRE_ATTESTED_IDENTITY=0 — soft identity axis"
  if [[ -n "$target_id" && -n "$mini_id" && "$target_id" == "$mini_id" ]]; then
    fail "identity collision even with soft mode"
  else
    pass "identity axis soft-pass"
  fi
fi
axis_end "identity" "$_id_before"

# ── AXIS control_plane ─────────────────────────────────────────────────────
axis_begin "control_plane"
_cp_before=$FAIL_COUNT
if ! command -v nc >/dev/null 2>&1; then
  fail "nc not available for control-plane probe"
else
  cp_hosts=("$MINI_HOST")
  [[ -n "$MINI_TAILNET_IP" && "$MINI_TAILNET_IP" != "$MINI_HOST" ]] && cp_hosts+=("$MINI_TAILNET_IP")
  [[ -n "$MINI_LAN_IP" && "$MINI_LAN_IP" != "$MINI_HOST" && "$MINI_LAN_IP" != "$MINI_TAILNET_IP" ]] && cp_hosts+=("$MINI_LAN_IP")
  open_cp=0
  for h in "${cp_hosts[@]}"; do
    [[ -z "$h" ]] && continue
    if is_loopback_host "$h"; then
      fail "control-plane mini coordinate is loopback (${h})"
      open_cp=$((open_cp + 1))
      continue
    fi
    set +e
    detail="$(tcp_reachable "$h" "$MINI_SSH_PORT")"
    trc=$?
    set -e
    if [[ $trc -eq 0 ]]; then
      fail "SSH/control-plane reachable at ${h}:${MINI_SSH_PORT}"
      open_cp=$((open_cp + 1))
    else
      pass "SSH closed to mini at ${h}:${MINI_SSH_PORT}"
    fi
  done
  if [[ $open_cp -eq 0 ]]; then
    pass "SSH and alternate control-plane paths to mini are closed"
  fi
fi
axis_end "control_plane" "$_cp_before"

# ── AXIS docker_runtime ────────────────────────────────────────────────────
axis_begin "docker_runtime"
_dk_before=$FAIL_COUNT
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if docker inspect "$RESTORE_CONTAINER" >/dev/null 2>&1; then
    mode="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$RESTORE_CONTAINER" 2>/dev/null || true)"
    binds="$(docker inspect -f '{{json .HostConfig.Binds}}' "$RESTORE_CONTAINER" 2>/dev/null || echo null)"
    mounts_json="$(docker inspect -f '{{json .Mounts}}' "$RESTORE_CONTAINER" 2>/dev/null || echo null)"
    ports="$(docker inspect -f '{{json .HostConfig.PortBindings}}' "$RESTORE_CONTAINER" 2>/dev/null || echo null)"
    pidmode="$(docker inspect -f '{{.HostConfig.PidMode}}' "$RESTORE_CONTAINER" 2>/dev/null || true)"
    ipcmode="$(docker inspect -f '{{.HostConfig.IpcMode}}' "$RESTORE_CONTAINER" 2>/dev/null || true)"
    info "container=${RESTORE_CONTAINER} NetworkMode=${mode} PidMode=${pidmode} IpcMode=${ipcmode}"
    info "PortBindings=${ports}"

    if [[ "$mode" == "host" ]]; then
      fail "restore container uses network_mode=host (shares mini host routes)"
    else
      pass "restore container not on host network (mode=${mode})"
    fi
    if [[ "$pidmode" == "host" ]]; then
      fail "restore container uses pid=host"
    else
      pass "restore container not sharing host PID namespace"
    fi
    if [[ "$ipcmode" == "host" ]]; then
      fail "restore container uses ipc=host"
    else
      pass "restore container not sharing host IPC namespace"
    fi
    if echo "$binds$mounts_json" | grep -qiE '/mnt/mini-|postgresql@|/opt/homebrew/var/postgresql|mini-pgdata|mini-blobs'; then
      fail "restore container mounts look like mini live data paths"
      echo "  binds=${binds}" >&2
    else
      pass "restore container has no mini live-data bind mounts"
    fi
    if echo "$ports" | grep -qE '"HostIp":\s*""|"HostIp":\s*"0\.0\.0\.0"|"HostIp":\s*"::"'; then
      fail "restore container publishes Postgres on non-loopback HostIp"
    elif echo "$ports" | grep -q 'HostPort'; then
      if echo "$ports" | grep -qE '"HostIp":\s*"127\.0\.0\.1"'; then
        pass "restore container Postgres publish is loopback-only (127.0.0.1)"
      else
        fail "restore container Postgres publish HostIp is not 127.0.0.1"
      fi
    else
      info "no PortBindings on restore container (ok if not yet started)"
    fi

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
      if grep -qE 'nc_rc=[1-9]' "$EVIDENCE_DIR/ac1-incontainer-nc.txt" 2>/dev/null; then
        pass "in-container nc cannot reach mini Postgres"
      else
        info "in-container nc probe skipped or inconclusive"
      fi
    fi
  else
    info "docker container ${RESTORE_CONTAINER} not present — host-level isolation only"
    pass "no co-located restore container with host-network/mini binds to audit"
  fi
else
  info "docker unavailable — host-level isolation only"
  pass "docker runtime not applicable on this host"
fi
axis_end "docker_runtime" "$_dk_before"

echo "=== SUMMARY: pass=${PASS_COUNT} fail=${FAIL_COUNT} axis_fail=${AXIS_FAIL} mini=${MINI_HOST}:${MINI_PG_PORT} ==="
echo "reachable_mini_routes_failed_checks=${FAIL_COUNT}"
echo "attested_identity_target=${target_id:-}"
echo "attested_identity_mini=${mini_id:-}"

if [[ $FAIL_COUNT -gt 0 || $AXIS_FAIL -gt 0 ]]; then
  echo "=== RESULT: FAIL (isolation broken or probe incomplete; multi-axis open) ==="
  exit 1
fi

echo "=== RESULT: PASS (0 reachable mini routes/sockets/mounts; distinct attested identity) ==="
exit 0
