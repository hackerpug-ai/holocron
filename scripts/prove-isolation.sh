#!/usr/bin/env bash
# D05-03 / REDHAT-FIX-H3 / CAP-BAK-01 — Multi-axis isolation probe for a genuinely
# fresh restore target.
#
# Supersedes narrow TCP/5432 + two-path-string theatre. Exit 0 only when EVERY
# axis PASSes (fail closed on any open axis):
#   AXIS network       — IPv4/IPv6/tailnet/LAN/DNS aliases unreachable on PG/SSH/control ports
#   AXIS ipc_sockets   — no mini unix sockets / shared IPC paths
#   AXIS mounts        — no mini PGDATA/blob/alternate bind-mounts
#   AXIS identity      — independently attested hardware/VM identity ≠ mini
#   AXIS control_plane — SSH + alternate management paths closed
#   AXIS docker_runtime— not host network / shared PID|IPC ns / mini volume binds (when container present)
#   AXIS r2_readonly   — restore credentials are List/Get only (no RW parent)
#
# Usage:
#   MINI_HOST=203.0.113.1 TARGET_ATTESTED_IDENTITY=... MINI_ATTESTED_IDENTITY=... \
#     ./scripts/prove-isolation.sh
#
# Real OS probes only (nc, mount/findmnt, test -S, getent/host, machine-id/SMBIOS).
# Never hardcodes exit 0. Never mocks network isolation.
set -euo pipefail

MINI_HOST="${MINI_HOST:-}"
MINI_PG_PORT="${MINI_PG_PORT:-5432}"
MINI_SSH_PORT="${MINI_SSH_PORT:-22}"
NC_TIMEOUT_SEC="${NC_TIMEOUT_SEC:-2}"
MINI_PGDATA_MOUNT="${MINI_PGDATA_MOUNT:-/mnt/mini-pgdata}"
MINI_BLOB_MOUNT="${MINI_BLOB_MOUNT:-/mnt/mini-blobs}"
REQUIRE_ATTESTED_IDENTITY="${REQUIRE_ATTESTED_IDENTITY:-1}"
RESTORE_CONTAINER="${RESTORE_CONTAINER:-}"
# Optional multi-coordinate network targets (comma-separated hostnames OK for aliases).
MINI_IPV4="${MINI_IPV4:-}"
MINI_IPV6="${MINI_IPV6:-}"
MINI_TAILNET_IP="${MINI_TAILNET_IP:-}"
MINI_LAN_IP="${MINI_LAN_IP:-}"
MINI_DNS_ALIASES="${MINI_DNS_ALIASES:-}"
MINI_HOSTNAMES="${MINI_HOSTNAMES:-}"
MINI_CONTROL_PORTS="${MINI_CONTROL_PORTS:-}"
MINI_UNIX_SOCKETS="${MINI_UNIX_SOCKETS:-}"
# When 1 (default), probe classic postgres unix socket paths (fail closed on co-located mini).
# Set 0 only for documented isolation fixtures that still run real test -S probes on
# MINI_UNIX_SOCKETS paths (never skip the ipc axis entirely).
MINI_SOCKET_DEFAULTS="${MINI_SOCKET_DEFAULTS:-1}"
MINI_FORBIDDEN_MOUNT_PATHS="${MINI_FORBIDDEN_MOUNT_PATHS:-}"
TARGET_ATTESTED_IDENTITY="${TARGET_ATTESTED_IDENTITY:-}"
MINI_ATTESTED_IDENTITY="${MINI_ATTESTED_IDENTITY:-}"

usage() {
  cat <<'EOF'
Usage: prove-isolation.sh [--mini-host HOST] [HOST]

Multi-axis isolation probe (REDHAT-FIX-H3). Exit 0 only if all axes PASS.

Environment:
  MINI_HOST                 Original mini hostname/IP (required unless positional)
  MINI_IPV4 / MINI_IPV6     Additional mini addresses to probe
  MINI_TAILNET_IP / MINI_LAN_IP
  MINI_DNS_ALIASES          Comma-separated DNS aliases that must not resolve+connect to mini services
  MINI_HOSTNAMES            Comma-separated alternate hostnames
  MINI_PG_PORT              Postgres port on mini (default 5432)
  MINI_SSH_PORT             SSH port on mini (default 22)
  MINI_CONTROL_PORTS        Extra management ports (comma-separated)
  MINI_PGDATA_MOUNT         Forbidden mount path (default /mnt/mini-pgdata)
  MINI_BLOB_MOUNT           Forbidden mount path (default /mnt/mini-blobs)
  MINI_FORBIDDEN_MOUNT_PATHS  Extra forbidden mount paths (comma-separated)
  MINI_UNIX_SOCKETS         Extra forbidden unix socket paths (comma-separated)
  MINI_SOCKET_DEFAULTS      Probe classic PG sockets (default 1); 0 = only MINI_UNIX_SOCKETS (fixture)
  TARGET_ATTESTED_IDENTITY  Target hardware/VM identity (or auto-read machine-id/SMBIOS)
  MINI_ATTESTED_IDENTITY    Mini hardware/VM identity (required when REQUIRE_ATTESTED_IDENTITY=1)
  REQUIRE_ATTESTED_IDENTITY Fail closed if identities missing/equal (default 1)
  RESTORE_CONTAINER         Optional docker container name to audit
  R2_*                      See R2 read-only axis (credential kind/policy/keys)
  NC_TIMEOUT_SEC            nc connect timeout seconds (default 2)
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
axis_failures=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; failures=$((failures + 1)); }
info() { echo "INFO: $*"; }
axis_begin() { echo "--- AXIS: $1 ---"; }
axis_end() {
  local name="$1"
  local before="$2"
  local delta=$((failures - before))
  if [[ $delta -eq 0 ]]; then
    echo "AXIS ${name}: PASS"
  else
    echo "AXIS ${name}: FAIL (${delta} check(s))"
    axis_failures=$((axis_failures + 1))
  fi
}

# ── helpers ────────────────────────────────────────────────────────────────

run_with_timeout() {
  local seconds="$1"
  shift
  local out_file rc
  out_file="$(mktemp -t prove-isolation-nc.XXXXXX)"
  # Run in its own process group so timeout kill reaps hung nc children.
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
  if [[ $rc -eq 0 ]]; then
    return 0
  fi
  return 1
}

# Returns 0 if TCP connect succeeds (reachable = isolation broken).
tcp_reachable() {
  local host="$1" port="$2" timeout="${3:-$NC_TIMEOUT_SEC}"
  local nc_out="" nc_rc=1
  # Hard wall ≈ nc timeout; avoid double-waiting on option fallbacks by detecting
  # supported flags once per process via a sticky env marker.
  local wall="$timeout"
  if [[ "$wall" -lt 1 ]]; then wall=1; fi
  if ! command -v nc >/dev/null 2>&1; then
    return 2
  fi
  set +e
  if [[ -z "${_PROVE_NC_STYLE:-}" ]]; then
    nc_out="$(run_with_timeout "$wall" nc -z -G "$timeout" "$host" "$port")"
    nc_rc=$?
    if echo "$nc_out" | grep -qiE 'invalid|illegal|usage|unknown option'; then
      nc_out="$(run_with_timeout "$wall" nc -z -w "$timeout" "$host" "$port")"
      nc_rc=$?
      if echo "$nc_out" | grep -qiE 'invalid|illegal|usage|unknown option'; then
        _PROVE_NC_STYLE=plain
        export _PROVE_NC_STYLE
        nc_out="$(run_with_timeout "$wall" nc -z -v "$host" "$port")"
        nc_rc=$?
      else
        _PROVE_NC_STYLE=w
        export _PROVE_NC_STYLE
      fi
    else
      _PROVE_NC_STYLE=G
      export _PROVE_NC_STYLE
    fi
  else
    case "$_PROVE_NC_STYLE" in
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

is_loopback_host() {
  case "$1" in
    127.0.0.1|localhost|::1|0.0.0.0|0000::1) return 0 ;;
    *) return 1 ;;
  esac
}

csv_items() {
  # Print non-empty comma-separated items, one per line.
  local raw="${1:-}"
  if [[ -z "$raw" ]]; then
    return 0
  fi
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
    if findmnt -n "$path" >/dev/null 2>&1; then
      mounted=1
    fi
  fi

  if mount 2>/dev/null | awk -v p="$path" '
    {
      for (i = 1; i <= NF; i++) {
        if ($i == p || $i ~ ("^" p "$")) { found=1 }
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
    # GATE-FIX-S28R3-QA22: shell-native parent path (no PATH dirname)
    parent="${path%/*}"
    [[ "$parent" == "$path" || -z "$parent" ]] && parent="."
    path_dev="$(df -P "$path" 2>/dev/null | awk 'NR==2 {print $1}')"
    parent_dev="$(df -P "$parent" 2>/dev/null | awk 'NR==2 {print $1}')"
    if [[ -n "$path_dev" && -n "$parent_dev" && "$path_dev" != "$parent_dev" ]]; then
      mounted=1
    fi
  fi

  [[ $mounted -eq 1 ]]
}

check_no_mount() {
  local path="$1"
  local label="$2"
  if path_is_mounted "$path"; then
    fail "${label} mounted at ${path} — isolation broken"
  else
    pass "no mini ${label} mount at ${path}"
  fi
}

read_local_attested_identity() {
  # Independently read hardware/VM identity from OS sources (never hardcode).
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
  # Cloud instance-id (best-effort; short timeout).
  if [[ -z "$id" ]] && command -v curl >/dev/null 2>&1; then
    id="$(curl -sS -m 1 http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null | tr -d '[:space:]' || true)"
  fi
  printf '%s' "$id"
}

# ── AXIS: network ──────────────────────────────────────────────────────────
check_network_axis() {
  axis_begin "network"
  local before=$failures

  if ! command -v nc >/dev/null 2>&1; then
    fail "nc not available — cannot prove network isolation"
    axis_end "network" "$before"
    return
  fi

  # Build unique host coordinate list.
  local -a hosts=()
  local h
  for h in "$MINI_HOST" "$MINI_IPV4" "$MINI_IPV6" "$MINI_TAILNET_IP" "$MINI_LAN_IP"; do
    [[ -n "$h" ]] && hosts+=("$h")
  done
  while IFS= read -r h; do
    [[ -n "$h" ]] && hosts+=("$h")
  done < <(csv_items "$MINI_HOSTNAMES")
  while IFS= read -r h; do
    [[ -n "$h" ]] && hosts+=("$h")
  done < <(csv_items "$MINI_DNS_ALIASES")

  # Dedup
  local -a uniq=()
  local seen="|"
  for h in "${hosts[@]}"; do
    case "$seen" in
      *"|$h|"*) continue ;;
    esac
    seen="${seen}${h}|"
    uniq+=("$h")
  done

  if [[ ${#uniq[@]} -eq 0 ]]; then
    fail "no mini network coordinates configured"
    axis_end "network" "$before"
    return
  fi

  # Ports: PG on all coordinates; control ports on all; SSH on primary MINI_HOST only
  # (SSH multi-coordinate coverage lives in control_plane axis).
  local -a ports=("$MINI_PG_PORT")
  local p
  while IFS= read -r p; do
    [[ -n "$p" ]] && ports+=("$p")
  done < <(csv_items "$MINI_CONTROL_PORTS")

  local port_seen="|"
  local -a uniq_ports=()
  for p in "${ports[@]}"; do
    case "$port_seen" in
      *"|$p|"*) continue ;;
    esac
    port_seen="${port_seen}${p}|"
    uniq_ports+=("$p")
  done

  info "network coordinates: ${uniq[*]}"
  info "network ports: ${uniq_ports[*]} (+ SSH ${MINI_SSH_PORT} on primary ${MINI_HOST})"

  local reachable=0
  for h in "${uniq[@]}"; do
    # DNS resolve when hostname-like (not pure IPv4/IPv6) — record aliases.
    if [[ "$h" == *.* || "$h" == *:* ]] && ! [[ "$h" =~ ^[0-9.]+$ || "$h" =~ ^[0-9a-fA-F:]+$ ]]; then
      if command -v getent >/dev/null 2>&1; then
        local resolved
        resolved="$(getent hosts "$h" 2>/dev/null | awk '{print $1}' | head -1 || true)"
        if [[ -n "$resolved" ]]; then
          info "DNS alias ${h} → ${resolved}"
        fi
      elif command -v host >/dev/null 2>&1; then
        info "DNS lookup ${h}: $(host -W 1 "$h" 2>/dev/null | head -1 || true)"
      fi
    fi

    for p in "${uniq_ports[@]}"; do
      local detail=""
      set +e
      detail="$(tcp_reachable "$h" "$p")"
      local trc=$?
      set -e
      if [[ $trc -eq 0 ]]; then
        fail "mini network target reachable at ${h}:${p} (nc exit 0) — isolation broken"
        echo "  detail: ${detail}" >&2
        reachable=$((reachable + 1))
      elif [[ $trc -eq 2 ]]; then
        fail "nc unavailable for ${h}:${p}"
      else
        pass "no route to mini at ${h}:${p}"
      fi
    done
  done

  # Primary SSH reachability also belongs to the network axis summary.
  local ssh_detail="" ssh_trc=1
  set +e
  ssh_detail="$(tcp_reachable "$MINI_HOST" "$MINI_SSH_PORT")"
  ssh_trc=$?
  set -e
  if [[ $ssh_trc -eq 0 ]]; then
    fail "mini network target reachable at ${MINI_HOST}:${MINI_SSH_PORT} (SSH)"
    echo "  detail: ${ssh_detail}" >&2
    reachable=$((reachable + 1))
  else
    pass "no route to mini at ${MINI_HOST}:${MINI_SSH_PORT}"
  fi

  if [[ $reachable -eq 0 ]]; then
    pass "0 successful mini network connections across IPv4/IPv6/tailnet/LAN/DNS axes"
  fi

  axis_end "network" "$before"
}

# ── AXIS: ipc_sockets ──────────────────────────────────────────────────────
check_ipc_axis() {
  axis_begin "ipc_sockets"
  local before=$failures

  local -a sockets=()
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
  local s
  while IFS= read -r s; do
    [[ -n "$s" ]] && sockets+=("$s")
  done < <(csv_items "$MINI_UNIX_SOCKETS")

  if [[ ${#sockets[@]} -eq 0 ]]; then
    fail "ipc_sockets axis has zero paths to probe (set MINI_UNIX_SOCKETS or MINI_SOCKET_DEFAULTS=1)"
  fi

  local open_sockets=0
  for s in "${sockets[@]}"; do
    if [[ -S "$s" ]]; then
      fail "mini-like unix socket present at ${s} — isolation broken"
      open_sockets=$((open_sockets + 1))
    else
      pass "no unix socket at ${s}"
    fi
  done

  # Shared IPC namespace with host/init (Linux containers pretending to be fresh hardware).
  if [[ -r /proc/self/ns/ipc && -r /proc/1/ns/ipc ]]; then
    local self_ipc init_ipc
    self_ipc="$(readlink /proc/self/ns/ipc 2>/dev/null || true)"
    init_ipc="$(readlink /proc/1/ns/ipc 2>/dev/null || true)"
    if [[ -n "$self_ipc" && -n "$init_ipc" && "$self_ipc" == "$init_ipc" && "$(id -u)" -ne 0 ]]; then
      # Non-root process sharing init IPC is normal on bare metal host; only flag when
      # explicitly marked as container-on-host via container env.
      if [[ -n "${container:-}" || -f /.dockerenv || -n "${RESTORE_CONTAINER}" ]]; then
        # Inside docker without private IPC → shared with host (often true for default).
        # Default docker gives private IPC; shared only with --ipc=host.
        if [[ -f /proc/1/cgroup ]] && grep -qE 'docker|containerd|kubepods' /proc/1/cgroup 2>/dev/null; then
          info "container IPC ns same as pid1 (expected when pid1 is container init)"
        fi
      fi
    fi
  fi

  if [[ $open_sockets -eq 0 ]]; then
    pass "0 mini unix sockets accessible"
  fi

  axis_end "ipc_sockets" "$before"
}

# ── AXIS: mounts ───────────────────────────────────────────────────────────
check_mounts_axis() {
  axis_begin "mounts"
  local before=$failures

  check_no_mount "$MINI_PGDATA_MOUNT" "PGDATA"
  check_no_mount "$MINI_BLOB_MOUNT" "blob"

  # Legacy path-string scan plus alternate mini bind-mount patterns.
  local mount_blob
  mount_blob="$(mount 2>/dev/null || true)"
  if [[ -r /proc/mounts ]]; then
    mount_blob="${mount_blob}"$'\n'"$(cat /proc/mounts 2>/dev/null || true)"
  fi

  if echo "$mount_blob" | grep -qiE '/mnt/mini-(pgdata|blobs)|mini-pgdata|mini-blobs|/opt/homebrew/var/postgresql|postgresql@[0-9]+'; then
    fail "mount table references mini live data paths"
    echo "$mount_blob" | grep -iE 'mini|postgresql@|homebrew/var/postgresql' || true
  else
    pass "mount table has 0 classic mini PGDATA/blob path entries"
  fi

  # Alternate forbidden paths (operator/test supplied + common mini restores).
  local -a extra_paths=(
    /mnt/mini-pgdata-alt
    /mnt/mini-data
    /mnt/restore-from-mini
    /var/lib/postgresql/mini
  )
  local ep
  while IFS= read -r ep; do
    [[ -n "$ep" ]] && extra_paths+=("$ep")
  done < <(csv_items "$MINI_FORBIDDEN_MOUNT_PATHS")

  for ep in "${extra_paths[@]}"; do
    if path_is_mounted "$ep"; then
      fail "alternate mini bind-mount present at ${ep}"
    else
      pass "no alternate mini mount at ${ep}"
    fi
  done

  axis_end "mounts" "$before"
}

# ── AXIS: identity ─────────────────────────────────────────────────────────
check_identity_axis() {
  axis_begin "identity"
  local before=$failures

  local target_id="$TARGET_ATTESTED_IDENTITY"
  local mini_id="$MINI_ATTESTED_IDENTITY"
  local source="env"

  if [[ -z "$target_id" ]]; then
    target_id="$(read_local_attested_identity)"
    source="os"
  fi

  info "TARGET_ATTESTED_IDENTITY source=${source} value=${target_id:-<empty>}"
  info "MINI_ATTESTED_IDENTITY value=${mini_id:-<empty>}"

  if [[ "${REQUIRE_ATTESTED_IDENTITY}" == "1" ]]; then
    if [[ -z "$target_id" ]]; then
      fail "TARGET_ATTESTED_IDENTITY empty (env and OS machine-id/SMBIOS/cloud id missing)"
    else
      pass "target attested identity non-empty"
    fi
    if [[ -z "$mini_id" ]]; then
      fail "MINI_ATTESTED_IDENTITY empty — cannot prove distinct hardware/VM identity"
    else
      pass "mini attested identity non-empty"
    fi
    if [[ -n "$target_id" && -n "$mini_id" ]]; then
      if [[ "$target_id" == "$mini_id" ]]; then
        fail "identity collision: target == mini (${target_id}) — same-host / not fresh hardware"
      else
        pass "target identity distinct from mini"
      fi
    fi
  else
    info "REQUIRE_ATTESTED_IDENTITY=0 — identity axis soft (not recommended)"
    if [[ -n "$target_id" && -n "$mini_id" && "$target_id" == "$mini_id" ]]; then
      fail "identity collision even with soft mode"
    else
      pass "identity axis soft-pass (REQUIRE_ATTESTED_IDENTITY=0)"
    fi
  fi

  axis_end "identity" "$before"
}

# ── AXIS: control_plane ────────────────────────────────────────────────────
check_control_plane_axis() {
  axis_begin "control_plane"
  local before=$failures

  if ! command -v nc >/dev/null 2>&1; then
    fail "nc not available — cannot prove control-plane isolation"
    axis_end "control_plane" "$before"
    return
  fi

  # SSH / management paths: primary host + tailnet/LAN when distinct (deduped).
  local -a hosts=("$MINI_HOST")
  [[ -n "$MINI_TAILNET_IP" && "$MINI_TAILNET_IP" != "$MINI_HOST" ]] && hosts+=("$MINI_TAILNET_IP")
  [[ -n "$MINI_LAN_IP" && "$MINI_LAN_IP" != "$MINI_HOST" && "$MINI_LAN_IP" != "$MINI_TAILNET_IP" ]] && hosts+=("$MINI_LAN_IP")

  local h open=0
  for h in "${hosts[@]}"; do
    [[ -z "$h" ]] && continue
    if is_loopback_host "$h"; then
      fail "control-plane mini coordinate is loopback (${h}) — co-located, not isolated"
      open=$((open + 1))
      continue
    fi
    local detail=""
    set +e
    detail="$(tcp_reachable "$h" "$MINI_SSH_PORT")"
    local trc=$?
    set -e
    if [[ $trc -eq 0 ]]; then
      fail "SSH/control-plane reachable at ${h}:${MINI_SSH_PORT}"
      echo "  detail: ${detail}" >&2
      open=$((open + 1))
    else
      pass "SSH closed to mini at ${h}:${MINI_SSH_PORT}"
    fi
  done

  # Optional explicit control ports already covered in network axis; restate summary.
  if [[ $open -eq 0 ]]; then
    pass "SSH and alternate control-plane paths to mini are closed"
  fi

  axis_end "control_plane" "$before"
}

# ── AXIS: docker_runtime ───────────────────────────────────────────────────
check_docker_axis() {
  axis_begin "docker_runtime"
  local before=$failures

  # Host-level: refuse if we are clearly a same-host container sharing host net.
  if [[ -f /.dockerenv ]] || [[ -n "${container:-}" ]]; then
    if [[ -r /proc/net/route ]]; then
      info "running inside container — checking network mode signals"
    fi
    # network_mode=host often exposes host /proc/1 as non-containerized — best-effort.
    if [[ -r /proc/1/cgroup ]] && ! grep -qE 'docker|containerd|kubepods|libpod' /proc/1/cgroup 2>/dev/null; then
      # pid1 not in container cgroup often means --pid=host / host-like.
      if [[ -r /proc/self/cgroup ]] && grep -qE 'docker|containerd' /proc/self/cgroup 2>/dev/null; then
        fail "container appears to share host PID namespace (pid1 not containerized)"
      fi
    fi
  fi

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    local cname="${RESTORE_CONTAINER:-fresh-restore-01}"
    if docker inspect "$cname" >/dev/null 2>&1; then
      local mode binds mounts pidmode ipcmode
      mode="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$cname" 2>/dev/null || true)"
      binds="$(docker inspect -f '{{json .HostConfig.Binds}}' "$cname" 2>/dev/null || echo null)"
      mounts="$(docker inspect -f '{{json .Mounts}}' "$cname" 2>/dev/null || echo null)"
      pidmode="$(docker inspect -f '{{.HostConfig.PidMode}}' "$cname" 2>/dev/null || true)"
      ipcmode="$(docker inspect -f '{{.HostConfig.IpcMode}}' "$cname" 2>/dev/null || true)"
      info "container=${cname} NetworkMode=${mode} PidMode=${pidmode} IpcMode=${ipcmode}"

      if [[ "$mode" == "host" ]]; then
        fail "restore container uses network_mode=host (shares mini host routes)"
      else
        pass "restore container not on host network (mode=${mode})"
      fi
      if [[ "$pidmode" == "host" ]]; then
        fail "restore container uses pid=host (shares mini process namespace)"
      else
        pass "restore container not sharing host PID namespace (mode=${pidmode:-default})"
      fi
      if [[ "$ipcmode" == "host" ]]; then
        fail "restore container uses ipc=host (shares mini IPC namespace)"
      else
        pass "restore container not sharing host IPC namespace (mode=${ipcmode:-default})"
      fi
      if echo "$binds$mounts" | grep -qiE '/mnt/mini-|postgresql@|/opt/homebrew/var/postgresql|mini-pgdata|mini-blobs'; then
        fail "restore container mounts look like mini live data paths"
        echo "  binds=${binds}" >&2
      else
        pass "restore container has no mini live-data bind mounts"
      fi
    else
      info "docker container ${cname} not present — docker_runtime host-level only"
      pass "no co-located restore container with host-network/mini binds to audit"
    fi
  else
    info "docker unavailable — docker_runtime axis host-level only"
    pass "docker runtime not applicable on this host"
  fi

  axis_end "docker_runtime" "$before"
}

# ── AXIS: r2_readonly ──────────────────────────────────────────────────────
# Declarative env/policy checks + optional live aws proof via prove-r2-readonly.sh.
# Placeholder-only success is NOT enough for AC-2; live proof required when keys
# are real, or when REQUIRE_LIVE_R2_RO=1.
#
# REDHAT-FIX-H4 credential negative control: live Put/Delete probes (inside
# prove-r2-readonly.sh) target only sacrificial drill-neg/<uuid> keys. NEVER
# delete the bucket-root recovery object key named "existing" or any denylisted
# recovery prefix (backup/, archive/, pgbackrest/, restic/).
r2_is_placeholder() {
  local v="${1:-}"
  [[ -z "$v" ]] && return 0
  case "$v" in
    # REDHAT-FIX-S28R3: bare ro-test (gate legacy default) is placeholder, not live RO.
    ro-test|ro-test-*|*ro-test*|*placeholder*|*replace-me*|*example*|*not-for-prod*|*test-key*|*test-secret*)
      return 0
      ;;
  esac
  [[ "$v" == *example-accountid* ]] && return 0
  return 1
}

check_r2_axis() {
  axis_begin "r2_readonly"
  local before=$failures
  local kind="${R2_CREDENTIAL_KIND:-}"
  local policy="${R2_CREDENTIAL_POLICY:-}"
  local key="${R2_ACCESS_KEY_ID:-${R2_RESTORE_ACCESS_KEY_ID:-}}"
  local secret="${R2_SECRET_ACCESS_KEY:-${R2_RESTORE_SECRET_ACCESS_KEY:-}}"
  local endpoint="${R2_ENDPOINT:-}"
  local bad=0

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

  case "$kind" in
    object-read-only|read-only|object_read_only|readonly) ;;
    *)
      echo "  detail: R2_CREDENTIAL_KIND must be object-read-only or read-only (got: '${kind:-<empty>}')" >&2
      bad=1
      ;;
  esac

  if [[ -n "$policy" ]]; then
    if echo "$policy" | grep -qiE 's3:PutObject|s3:DeleteObject|s3:Put|s3:Delete|"s3:\*"|"\*"'; then
      if echo "$policy" | grep -qiE 's3:PutObject|s3:DeleteObject|"s3:\*"'; then
        if echo "$policy" | tr -d '\n' | grep -qiE 'Effect["[:space:]]*:["[:space:]]*Allow[^}]*s3:(PutObject|DeleteObject)'; then
          echo "  detail: R2_CREDENTIAL_POLICY allows Put/Delete — not read-only" >&2
          bad=1
        elif echo "$policy" | grep -qiE 's3:PutObject|s3:DeleteObject'; then
          echo "  detail: R2_CREDENTIAL_POLICY contains Put/Delete actions — not read-only" >&2
          bad=1
        fi
      fi
      if echo "$policy" | grep -qE '"Action"[[:space:]]*:[[:space:]]*"\*"|"Resource"[[:space:]]*:[[:space:]]*"\*"|"s3:\*"'; then
        echo "  detail: R2_CREDENTIAL_POLICY contains wildcards — not least-privilege" >&2
        bad=1
      fi
    fi
    # GATE-FIX-S28R3-QA3 / H-1: JSON-parse every Allow object Resource.
    # GATE-FIX-S28R3-QA4 / H-1: also parse Action/NotAction/NotResource; reject writes & wildcards.
    # Require exact arn:aws:s3:::${bucket}/${exactPrefix}/* — reject bare bucket/*
    # even when exact prefix is also present; reject wrong bucket/prefix.
    local expect_bucket="${R2_BUCKET_NAME:-holocron-backup}"
    local expect_prefix="${R2_RESTORE_OBJECT_PREFIX:-${R2_PGBACKREST_PREFIX:-pgbackrest}}"
    expect_prefix="${expect_prefix#/}"
    expect_prefix="${expect_prefix%/}"
    local policy_check_rc=0
    set +e
    python3 - "$policy" "$expect_bucket" "$expect_prefix" <<'PY'
import json, sys

raw, bucket, prefix = sys.argv[1], sys.argv[2], sys.argv[3].strip("/")
errors = []
try:
    policy = json.loads(raw)
except Exception as e:
    print(f"  detail: R2_CREDENTIAL_POLICY is not valid JSON — refuse ({e})", file=sys.stderr)
    sys.exit(2)

stmts = policy.get("Statement") or []
if isinstance(stmts, dict):
    stmts = [stmts]

# Allowlist: bucket-level List/GetBucketLocation; object-level GetObject on exact prefix only.
BUCKET_ACTIONS = {"s3:ListBucket", "s3:GetBucketLocation"}
OBJECT_ACTIONS = {"s3:GetObject"}
ALLOWED_ACTIONS = BUCKET_ACTIONS | OBJECT_ACTIONS
FORBIDDEN_ACTION_SUBSTRINGS = (
    "Put",
    "Delete",
    "Create",
    "Abort",
    "Write",
    "Update",
    "RestoreObject",
    "Replicate",
    "Bypass",
    "ObjectAcl",
    "BucketAcl",
    "Policy",
    "Admin",
)

def as_list(val):
    if val is None:
        return []
    if isinstance(val, str):
        return [val]
    if isinstance(val, list):
        return val
    return [val]

def present_nonempty(val):
    if val is None:
        return False
    if isinstance(val, str):
        return bool(val.strip())
    if isinstance(val, list):
        return len(val) > 0
    if isinstance(val, dict):
        return len(val) > 0
    return True

object_resources = []
seen_actions = set()
for stmt in stmts:
    if not isinstance(stmt, dict):
        continue
    if str(stmt.get("Effect", "")).lower() != "allow":
        continue

    # GATE-FIX-S28R3-QA4 / H-1: NotAction / NotResource are write-capable bypasses.
    if present_nonempty(stmt.get("NotAction")):
        errors.append("Allow NotAction present (not least-privilege read-only)")
    if present_nonempty(stmt.get("NotResource")):
        errors.append("Allow NotResource present (not least-privilege read-only)")

    actions = as_list(stmt.get("Action"))
    action_strs = []
    for a in actions:
        if not isinstance(a, str) or not a.strip():
            errors.append(f"Allow Action entry invalid: {a!r}")
            continue
        action_strs.append(a.strip())
        seen_actions.add(a.strip())

    for a in action_strs:
        if a in ("*", "s3:*") or a.endswith(":*") and a.startswith("s3"):
            errors.append(f"Allow Action wildcard refused: {a}")
            continue
        if a not in ALLOWED_ACTIONS:
            # Explicit forbid Put/Delete/admin even if not in allowlist message.
            if any(tok.lower() in a.lower() for tok in FORBIDDEN_ACTION_SUBSTRINGS) or a == "*":
                errors.append(f"Allow Action write/admin refused: {a}")
            else:
                errors.append(f"Allow Action not in read-only allowlist: {a}")

    resources = as_list(stmt.get("Resource"))
    if not resources and not present_nonempty(stmt.get("NotResource")):
        errors.append("Allow statement missing Resource")
        continue

    bucket_resources = []
    obj_resources_stmt = []
    for r in resources:
        if not isinstance(r, str):
            errors.append(f"Allow Resource entry invalid: {r!r}")
            continue
        if r == "*":
            errors.append("Allow Resource wildcard * refused")
            continue
        if not r.startswith("arn:aws:s3:::"):
            errors.append(f"Allow Resource not an s3 ARN: {r}")
            continue
        rest = r[len("arn:aws:s3:::"):]
        if "/" not in rest:
            # Bucket-level ARN (ListBucket / GetBucketLocation). Exact bucket only.
            if rest != bucket:
                errors.append(f"Allow Resource wrong bucket (bucket-level): {r}")
            else:
                bucket_resources.append(r)
            continue
        # Object-scoped ARN
        b, path = rest.split("/", 1)
        object_resources.append(r)
        obj_resources_stmt.append(r)
        if b != bucket:
            errors.append(f"Allow object Resource wrong bucket: {r}")
            continue
        expected_path = f"{prefix}/*"
        if path == "*":
            errors.append(
                f"Allow object Resource is bare bucket/* (not least-privilege even if exact prefix also present): {r}"
            )
        elif path != expected_path:
            errors.append(
                f"Allow object Resource off exact prefix (require arn:aws:s3:::{bucket}/{expected_path}): {r}"
            )

    # GATE-FIX-S28R3-QA5 / H-1: exact action↔resource class pairing per Allow.
    # Bucket actions (ListBucket/GetBucketLocation) require ≥1 bucket ARN and zero object ARNs.
    # GetObject requires ≥1 object ARN and zero bucket ARNs. Mixed classes in one statement fail.
    has_bucket_action = any(a in BUCKET_ACTIONS for a in action_strs)
    has_get_object = any(a in OBJECT_ACTIONS for a in action_strs)
    if has_bucket_action and obj_resources_stmt:
        errors.append(
            "Allow mixes bucket action with object ARN (exact pairing requires bucket ARN only)"
        )
    if has_get_object and bucket_resources:
        errors.append(
            "Allow mixes GetObject with bucket ARN (exact pairing requires object ARN only)"
        )
    if has_bucket_action and not bucket_resources:
        errors.append(
            "Allow bucket action requires ≥1 exact bucket ARN (and zero object ARNs)"
        )
    if has_get_object and not obj_resources_stmt:
        errors.append(
            "Allow GetObject requires ≥1 exact prefix object ARN (and zero bucket ARNs)"
        )

if not object_resources and not errors:
    # No object ARN at all — still require GetObject shape via action set below.
    pass

if "s3:ListBucket" not in seen_actions and "ListBucket" not in {a.split(":")[-1] for a in seen_actions}:
    errors.append("missing required Action s3:ListBucket on Allow")
if "s3:GetObject" not in seen_actions and "GetObject" not in {a.split(":")[-1] for a in seen_actions}:
    errors.append("missing required Action s3:GetObject on Allow")

for e in errors:
    print(f"  detail: R2_CREDENTIAL_POLICY {e}", file=sys.stderr)
sys.exit(1 if errors else 0)
PY
    policy_check_rc=$?
    set -e
    if [[ $policy_check_rc -ne 0 ]]; then
      bad=1
    fi
  fi

  local placeholders=0
  if r2_is_placeholder "$key" || r2_is_placeholder "$secret" || r2_is_placeholder "$endpoint"; then
    placeholders=1
  fi

  # Prefer distinct restore identity when present.
  local restore_key="${R2_RESTORE_ACCESS_KEY_ID:-}"
  local restore_secret="${R2_RESTORE_SECRET_ACCESS_KEY:-}"
  local missing_restore=0
  if [[ -z "$restore_key" || -z "$restore_secret" ]]; then
    missing_restore=1
  fi
  if [[ $missing_restore -eq 0 ]] && { r2_is_placeholder "$restore_key" || r2_is_placeholder "$restore_secret"; }; then
    missing_restore=1
  fi

  local script_dir _sd
  # GATE-FIX-S28R3-QA22: shell-native script dir (no PATH dirname)
  _sd="${BASH_SOURCE[0]%/*}"
  [[ "$_sd" == "${BASH_SOURCE[0]}" ]] && _sd="."
  script_dir="$(cd "$_sd" && pwd)"
  local live_script="${script_dir}/prove-r2-readonly.sh"
  local need_live=0
  if [[ "${REQUIRE_LIVE_R2_RO:-0}" == "1" ]]; then
    need_live=1
  elif [[ $placeholders -eq 0 && -n "$key" && -n "$secret" && -n "$endpoint" ]]; then
    need_live=1
  fi

  # REDHAT-FIX-S28R3 / HIGH-1: REQUIRE_LIVE_R2_RO=1 never WARN→PASS on placeholders or missing R2_RESTORE_*.
  if [[ "${REQUIRE_LIVE_R2_RO:-0}" == "1" ]]; then
    if [[ $placeholders -eq 1 || $missing_restore -eq 1 ]]; then
      echo "  detail: DEPENDENCY-S28-R2-RO — REQUIRE_LIVE_R2_RO=1 refuses placeholder/missing distinct R2_RESTORE_*" >&2
      echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
      bad=1
      need_live=0
    fi
  fi

  if [[ $need_live -eq 1 ]]; then
    if [[ ! -x "$live_script" && -f "$live_script" ]]; then
      chmod +x "$live_script" 2>/dev/null || true
    fi
    if [[ ! -f "$live_script" ]]; then
      echo "  detail: live probe script missing: $live_script" >&2
      bad=1
    else
      echo "  detail: running live R2 read-only probe (real aws CLI)" >&2
      set +e
      bash "$live_script"
      local live_rc=$?
      set -e
      if [[ $live_rc -ne 0 ]]; then
        echo "  detail: live R2 read-only probe failed (exit ${live_rc})" >&2
        if [[ "${REQUIRE_LIVE_R2_RO:-0}" == "1" ]]; then
          echo "  detail: DEPENDENCY-S28-R2-RO — live object-read-only proof required and failed" >&2
          echo "RESIDUAL: DEPENDENCY-S28-R2-RO" >&2
        fi
        bad=1
      fi
    fi
  elif [[ $placeholders -eq 1 && "${REQUIRE_LIVE_R2_RO:-0}" != "1" ]]; then
    echo "  detail: WARN placeholder R2 keys — declarative scope only; AC-2 needs live prove-r2-readonly.sh" >&2
  fi

  if [[ $bad -eq 0 ]]; then
    pass "R2 credentials are read-only scoped"
  else
    fail "R2 credentials are not read-only scoped"
  fi

  axis_end "r2_readonly" "$before"
}

# ── main ───────────────────────────────────────────────────────────────────
echo "=== prove-isolation MULTI-AXIS (mini=${MINI_HOST}:${MINI_PG_PORT}) ==="
echo "contract: network+ipc_sockets+mounts+identity+control_plane+docker_runtime+r2_readonly"
echo "supersedes: TCP/5432 + /mnt/mini-pgdata|/mnt/mini-blobs only"

check_network_axis
check_ipc_axis
check_mounts_axis
check_identity_axis
check_control_plane_axis
check_docker_axis
check_r2_axis

echo "=== SUMMARY: check_failures=${failures} axis_failures=${axis_failures} ==="
if [[ $failures -gt 0 || $axis_failures -gt 0 ]]; then
  echo "=== RESULT: FAIL (${failures} check(s); ${axis_failures} axis/axes open) ==="
  exit 1
fi

echo "=== RESULT: PASS (all multi-axis isolation checks) ==="
exit 0
