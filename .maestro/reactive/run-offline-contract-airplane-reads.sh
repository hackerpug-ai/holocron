#!/usr/bin/env bash
# S31-FE-07 — Prove airplane-mode reads offline contract (two Maestro segments).
#
# Segment 1: zero-cache DOWN, Mastra UP  → research-detail-error + loading absent
# Segment 2: zero-cache UP,   Mastra DOWN → exactly one chat-degraded-banner
#
# Fail-closed preflight (AC-4): segment 1 MUST NOT run Maestro while :4848/keepalive
# still answers. Names port 4848 in the refusal message.
#
# Modes:
#   default                         full two-segment proof + restore
#   OFFLINE_CONTRACT_AC4_PROBE=1    leave zero up; expect non-zero before Maestro
#   OFFLINE_CONTRACT_NEGATIVE_CONTROL=1
#                                   scratch-disable watchdog; segment 1 must FAIL,
#                                   then revert and re-run green (AC-3)
#   OFFLINE_CONTRACT_SEGMENT=1|2    run a single segment (services must already match)
#
# Timeouts derive from ZERO_ROW_WATCHDOG_DEADLINE_MS (hooks/use-zero-row-watchdog.ts)
# plus a stated margin (10000). No independent deadline invention.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export PATH="$ROOT/bin:$PATH"
export DATABASE_URL="${DATABASE_URL:-postgres://127.0.0.1:5432/holocron_nonprod}"
export MAESTRO_APP_ID="${MAESTRO_APP_ID:-com.holocron.app}"
export MAESTRO_DEVICE="${MAESTRO_DEVICE:-}"
export MAESTRO_CHAT_URL="${MAESTRO_CHAT_URL:-holocron://chat/00000000-0000-4000-8000-0000000000e1}"
export MAESTRO_RESEARCH_SESSION_URL="${MAESTRO_RESEARCH_SESSION_URL:-holocron://research/00000000-0000-4000-8000-e00000000033}"

# ZERO_ROW_WATCHDOG_DEADLINE_MS + 10000 margin (do not invent a free-standing budget).
WATCHDOG_MS="$(
  python3 - <<'PY'
import re, pathlib
p = pathlib.Path("hooks/use-zero-row-watchdog.ts")
text = p.read_text()
m = re.search(r"ZERO_ROW_WATCHDOG_DEADLINE_MS\s*=\s*([\d_]+)", text)
if not m:
    raise SystemExit("ZERO_ROW_WATCHDOG_DEADLINE_MS not found")
print(int(m.group(1).replace("_", "")))
PY
)"
MARGIN_MS=10000
export MAESTRO_RESEARCH_ERROR_TIMEOUT_MS="${MAESTRO_RESEARCH_ERROR_TIMEOUT_MS:-$((WATCHDOG_MS + MARGIN_MS))}"

# Simulator reaches Metro via LAN; 127.0.0.1 is host loopback only.
if [[ -z "${MAESTRO_METRO_URL:-}" || "${MAESTRO_METRO_URL}" == "http://:8081" || "${MAESTRO_METRO_URL}" == "http://127.0.0.1:8081" ]]; then
  LAN_IP=""
  for iface in en0 en1 en2; do
    LAN_IP=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
    [[ -n "$LAN_IP" ]] && break
  done
  if [[ -z "$LAN_IP" ]]; then
    LAN_IP=$(networksetup -getinfo Wi-Fi 2>/dev/null | awk -F': ' '/^IP address:/{print $2; exit}' || true)
  fi
  if [[ -n "$LAN_IP" ]]; then
    export MAESTRO_METRO_URL="http://${LAN_IP}:8081"
  else
    export MAESTRO_METRO_URL="http://127.0.0.1:8081"
  fi
fi
ENCODED=$(python3 -c 'import urllib.parse,os; print(urllib.parse.quote(os.environ["MAESTRO_METRO_URL"], safe=""))')
export MAESTRO_DEV_CLIENT_OPEN_URL="exp+holocron://expo-development-client/?url=${ENCODED}"

EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.spec/prds/mk6-migration/tasks/sprint-31-migration-integrity-remediation/.gate-evidence}"
mkdir -p "$EVIDENCE_DIR"
TMP_DIR="${TMP_DIR:-$ROOT/.tmp/S31-FE-07}"
mkdir -p "$TMP_DIR"

DOMAIN="gui/$(id -u)"
ZERO_LABEL="holocron-zerocache"
MASTRA_LABEL="holocron-mastra"
PORT_HOLDER_PID=""
VIDEO_PID=""
PLATFORM_CMD=""
PLATFORM_PID=""
STOPPED_ZERO=0
STOPPED_MASTRA=0
SCRATCH_APPLIED=0

log() { echo "[run-offline-contract-airplane-reads] $*" | tee -a "$TMP_DIR/harness.log"; }
fail_closed() {
  log "FAIL-CLOSED: $*"
  exit 1
}

kill_port_listeners() {
  local port="$1"
  for p in $(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true); do
    kill -9 "$p" 2>/dev/null || true
  done
}

wait_http_ok() {
  local url="$1"
  local tries="${2:-80}"
  for _ in $(seq 1 "$tries"); do
    if curl -sf --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

wait_http_down() {
  local url="$1"
  local tries="${2:-40}"
  for _ in $(seq 1 "$tries"); do
    if ! curl -sf --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

start_port_holder_4848() {
  python3 - "$TMP_DIR/port-holder.pid" <<'PY' &
import socket, sys, time, os
pid_path = sys.argv[1]
open(pid_path, "w").write(str(os.getpid()))
s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    s.bind(("::", 4848))
except OSError:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("0.0.0.0", 4848))
s.listen(16)
while True:
    try:
        c, _ = s.accept()
        c.close()
    except Exception:
        time.sleep(0.05)
PY
  PORT_HOLDER_PID=$!
  echo "$PORT_HOLDER_PID" >"$TMP_DIR/port-holder.pid"
  sleep 0.3
}

stop_port_holder() {
  if [[ -n "${PORT_HOLDER_PID:-}" ]]; then
    kill "$PORT_HOLDER_PID" 2>/dev/null || true
    wait "$PORT_HOLDER_PID" 2>/dev/null || true
    PORT_HOLDER_PID=""
  fi
  if [[ -f "$TMP_DIR/port-holder.pid" ]]; then
    kill "$(cat "$TMP_DIR/port-holder.pid" 2>/dev/null || true)" 2>/dev/null || true
    rm -f "$TMP_DIR/port-holder.pid"
  fi
}

stop_zero_cache() {
  log "stop zero-cache (launchctl bootout + kill :4848)"
  launchctl bootout "${DOMAIN}/${ZERO_LABEL}" 2>/dev/null || true
  kill_port_listeners 4848
  pkill -9 -f 'zero-cache' 2>/dev/null || true
  sleep 0.4
  start_port_holder_4848
  STOPPED_ZERO=1
}

ensure_zero_cache_bin() {
  # Worktrees sometimes lack a full node_modules install; fall back to monorepo root
  # or a sibling worktree that already has @rocicorp/zero linked.
  if [[ -x "$ROOT/node_modules/.bin/zero-cache" ]]; then
    return 0
  fi
  local candidate
  for candidate in \
    "${HOLOCRON_MAIN_ROOT:-/Users/inference1/Projects/holocron}/node_modules/.bin/zero-cache" \
    "$ROOT/../S31-FE-06/node_modules/.bin/zero-cache" \
    "$ROOT/../S31-FE-05/node_modules/.bin/zero-cache" \
    "$ROOT/../S31-FE-02/node_modules/.bin/zero-cache"; do
    if [[ -x "$candidate" ]]; then
      mkdir -p "$ROOT/node_modules/.bin" "$ROOT/node_modules/@rocicorp"
      ln -sfn "$candidate" "$ROOT/node_modules/.bin/zero-cache"
      local pkg_dir
      pkg_dir="$(cd "$(dirname "$candidate")/.." && pwd)/@rocicorp/zero"
      if [[ ! -e "$ROOT/node_modules/@rocicorp/zero" && -d "$pkg_dir" ]]; then
        ln -sfn "$pkg_dir" "$ROOT/node_modules/@rocicorp/zero"
      fi
      # If candidate is a node shim that imports relative to monorepo package, also try
      # linking from the candidate's package root.
      local alt_pkg
      alt_pkg="$(dirname "$(dirname "$candidate")")/@rocicorp/zero"
      if [[ ! -e "$ROOT/node_modules/@rocicorp/zero" && -d "$alt_pkg" ]]; then
        ln -sfn "$alt_pkg" "$ROOT/node_modules/@rocicorp/zero"
      fi
      log "linked zero-cache bin from $candidate"
      return 0
    fi
  done
  return 1
}

restore_zero_cache() {
  stop_port_holder
  # Ensure nothing still holds :4848 (stale port-holder or half-dead zero).
  kill_port_listeners 4848
  sleep 0.2
  if curl -sf --max-time 2 http://127.0.0.1:4848/keepalive >/dev/null 2>&1; then
    log "zero-cache already answering on :4848"
    STOPPED_ZERO=0
    return 0
  fi
  ensure_zero_cache_bin || log "WARN: zero-cache bin not found; scripts/run-zero-cache.sh may fail"
  log "restore zero-cache via scripts/run-zero-cache.sh"
  export ZERO_ADMIN_PASSWORD="${ZERO_ADMIN_PASSWORD:-local-zero-admin}"
  export ZERO_UPSTREAM_DB="${ZERO_UPSTREAM_DB:-$DATABASE_URL}"
  export HOLO_ROOT="${HOLO_ROOT:-$ROOT}"
  nohup bash "$ROOT/scripts/run-zero-cache.sh" \
    >"$TMP_DIR/zero-cache-restore.out.log" \
    2>"$TMP_DIR/zero-cache-restore.err.log" &
  if ! wait_http_ok "http://127.0.0.1:4848/keepalive" 100; then
    log "WARN: zero-cache restore poll timed out; last err:"
    tail -20 "$TMP_DIR/zero-cache-restore.err.log" 2>/dev/null | tee -a "$TMP_DIR/harness.log" || true
    tail -20 "$TMP_DIR/zero-cache-restore.out.log" 2>/dev/null | tee -a "$TMP_DIR/harness.log" || true
    return 1
  fi
  STOPPED_ZERO=0
  return 0
}

capture_platform_cmd() {
  PLATFORM_PID="$(lsof -nP -iTCP:4111 -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
  PLATFORM_CMD=""
  if [[ -n "$PLATFORM_PID" ]]; then
    PLATFORM_CMD="$(ps -p "$PLATFORM_PID" -o args= 2>/dev/null || true)"
  fi
  log "platform_pid=${PLATFORM_PID:-none} cmd=${PLATFORM_CMD:-none}"
}

stop_mastra() {
  capture_platform_cmd
  log "stop holocron-mastra / :4111"
  launchctl bootout "${DOMAIN}/${MASTRA_LABEL}" 2>/dev/null || true
  kill_port_listeners 4111
  sleep 0.4
  STOPPED_MASTRA=1
}

restore_mastra() {
  if curl -sf --max-time 2 http://127.0.0.1:4111/health >/dev/null 2>&1; then
    log "mastra/platform already answering on :4111"
    STOPPED_MASTRA=0
    return 0
  fi
  log "restore mastra/platform on :4111"
  if [[ -n "${PLATFORM_CMD:-}" ]]; then
    # shellcheck disable=SC2086
    nohup $PLATFORM_CMD >>"$TMP_DIR/mastra-restore.log" 2>&1 &
  else
    # Fallback: re-bootstrap launchd plist or worktree service:up
    if [[ -f "$HOME/Library/LaunchAgents/holocron-mastra.plist" ]]; then
      launchctl bootstrap "$DOMAIN" "$HOME/Library/LaunchAgents/holocron-mastra.plist" 2>/dev/null || true
    fi
    if ! wait_http_ok "http://127.0.0.1:4111/health" 20; then
      export HOLO_ROOT="${HOLO_ROOT:-$ROOT}"
      export PORT="${PORT:-4111}"
      nohup bun "$ROOT/services/platform/src/cli/holo.ts" service:up \
        >>"$TMP_DIR/mastra-restore.log" 2>&1 &
    fi
  fi
  wait_http_ok "http://127.0.0.1:4111/health" 80 || log "WARN: mastra restore poll timed out"
  STOPPED_MASTRA=0
}

wipe_sim_zero_sqlite() {
  local device="${MAESTRO_DEVICE:-}"
  if [[ -z "$device" ]]; then
    # Prefer first booted iPhone
    device=$(xcrun simctl list devices booted 2>/dev/null | awk -F '[()]' '/iPhone/{print $2; exit}' || true)
  fi
  [[ -z "$device" ]] && return 0
  xcrun simctl terminate "$device" "$MAESTRO_APP_ID" 2>/dev/null || true
  local app_data
  app_data=$(xcrun simctl get_app_container "$device" "$MAESTRO_APP_ID" data 2>/dev/null || true)
  if [[ -n "$app_data" && -d "$app_data" ]]; then
    rm -rf "$app_data/Documents/SQLite" \
      "$app_data/Library/Caches"/* \
      "$app_data/Library/Application Support"/* 2>/dev/null || true
    log "wiped simulator Zero SQLite under $app_data (device=$device)"
  fi
  MAESTRO_DEVICE="${MAESTRO_DEVICE:-$device}"
  export MAESTRO_DEVICE
}

start_video() {
  local out="$1"
  rm -f "$out"
  # recordVideo blocks until SIGINT; run in background.
  xcrun simctl io booted recordVideo --codec=h264 "$out" >"$TMP_DIR/video.log" 2>&1 &
  VIDEO_PID=$!
  log "recording video pid=$VIDEO_PID → $out"
  sleep 1
}

stop_video() {
  if [[ -n "${VIDEO_PID:-}" ]]; then
    kill -INT "$VIDEO_PID" 2>/dev/null || true
    wait "$VIDEO_PID" 2>/dev/null || true
    VIDEO_PID=""
    log "video capture stopped"
  fi
}

apply_watchdog_scratch() {
  log "AC-3: scratch-disable useZeroRowWatchdog (always return null)"
  python3 - <<'PY'
from pathlib import Path
p = Path("hooks/use-zero-row-watchdog.ts")
text = p.read_text()
if "S31_FE_07_SCRATCH_DISABLED" in text:
    raise SystemExit(0)
# Prepend early return after function signature body start.
needle = "export function useZeroRowWatchdog(row: unknown, enabled: boolean): Error | null {\n"
insert = needle + "  // S31_FE_07_SCRATCH_DISABLED — temporary AC-3 negative control; never commit\n  return null;\n"
if needle not in text:
    raise SystemExit("watchdog function signature not found")
p.write_text(text.replace(needle, insert, 1))
PY
  SCRATCH_APPLIED=1
}

revert_watchdog_scratch() {
  if [[ "$SCRATCH_APPLIED" == "1" ]]; then
    log "AC-3: git checkout hooks/use-zero-row-watchdog.ts"
    git checkout -- hooks/use-zero-row-watchdog.ts
    SCRATCH_APPLIED=0
  fi
}

seed_e2e() {
  if ! command -v holo >/dev/null 2>&1; then
    fail_closed "holo not on PATH after prepending $ROOT/bin"
  fi
  log "holo=$(command -v holo) seed:e2e (zero must be up)"
  set +e
  SEED_OUT=$(holo seed:e2e --reset 2>&1)
  SEED_RC=$?
  set -e
  printf '%s\n' "$SEED_OUT" | tee "$TMP_DIR/seed-e2e.txt" >/dev/null
  if [[ $SEED_RC -ne 0 ]]; then
    if printf '%s' "$SEED_OUT" | grep -q 'PONR_IMMUTABLE'; then
      log "seed:e2e --reset blocked by PONR_IMMUTABLE — upsert reset:false"
      set +e
      SEED_JSON=$(
        DATABASE_URL="$DATABASE_URL" bun -e '
          import { seedE2eDatabase } from "./services/platform/src/db/seed-e2e.ts";
          const r = await seedE2eDatabase({ reset: false, databaseUrl: process.env.DATABASE_URL });
          console.log(JSON.stringify(r));
          process.exit(r.ok ? 0 : 1);
        ' 2>&1
      )
      SEED_RC=$?
      set -e
      printf '%s\n' "$SEED_JSON" | tee "$TMP_DIR/seed-e2e-no-truncate.txt" >/dev/null
      if [[ $SEED_RC -ne 0 ]]; then
        fail_closed "seed:e2e upsert (reset:false) failed after PONR --reset block"
      fi
    else
      fail_closed "seed:e2e --reset failed (not PONR): see $TMP_DIR/seed-e2e.txt"
    fi
  fi

  # Fail-closed: the Maestro deep-links target fixed e2e UUIDs — prove they exist.
  local conv_id="00000000-0000-4000-8000-0000000000e1"
  local research_id="00000000-0000-4000-8000-e00000000033"
  local conv_count research_count
  conv_count=$(psql "$DATABASE_URL" -Atc "select count(*) from conversations where id = '${conv_id}'" 2>/dev/null || echo 0)
  research_count=$(psql "$DATABASE_URL" -Atc "select count(*) from research_sessions where id = '${research_id}'" 2>/dev/null || echo 0)
  if [[ "${conv_count:-0}" != "1" || "${research_count:-0}" != "1" ]]; then
    fail_closed "seed incomplete: conversations(${conv_id})=${conv_count} research_sessions(${research_id})=${research_count}"
  fi
  log "seed verified: conversation + research session rows present"
  # Give Zero a brief catch-up window after upserts while :4848 is live.
  sleep 2
}

run_maestro_segment() {
  local segment="$1"
  local junit_out="$TMP_DIR/maestro-segment-${segment}-junit.xml"
  local log_out="$TMP_DIR/maestro-segment-${segment}.log"
  log "maestro segment=$segment timeout_ms=$MAESTRO_RESEARCH_ERROR_TIMEOUT_MS metro=$MAESTRO_METRO_URL"

  local args=(
    test .maestro/reactive/offline-contract-airplane-reads.yml
    --format junit
    --output "$junit_out"
    -e MAESTRO_APP_ID="$MAESTRO_APP_ID"
    -e MAESTRO_METRO_URL="$MAESTRO_METRO_URL"
    -e MAESTRO_DEV_CLIENT_OPEN_URL="$MAESTRO_DEV_CLIENT_OPEN_URL"
    -e MAESTRO_RESEARCH_SESSION_URL="$MAESTRO_RESEARCH_SESSION_URL"
    -e MAESTRO_CHAT_URL="$MAESTRO_CHAT_URL"
    -e MAESTRO_OFFLINE_SEGMENT="$segment"
    -e MAESTRO_RESEARCH_ERROR_TIMEOUT_MS="$MAESTRO_RESEARCH_ERROR_TIMEOUT_MS"
  )
  if [[ -n "${MAESTRO_DEVICE:-}" ]]; then
    args+=(--device "$MAESTRO_DEVICE")
  fi

  set +e
  maestro "${args[@]}" 2>&1 | tee "$log_out"
  local rc=${PIPESTATUS[0]}
  set -e

  # Promote screenshots
  for shot in S31-FE-07-segment-*.png; do
    [[ -f "$shot" ]] || continue
    cp "$shot" "$EVIDENCE_DIR/" 2>/dev/null || true
    cp "$shot" "$TMP_DIR/" 2>/dev/null || true
  done
  local latest
  latest=$(ls -td "${HOME}/.maestro/tests/"* 2>/dev/null | head -1 || true)
  if [[ -n "${latest:-}" ]]; then
    mkdir -p "$TMP_DIR/maestro-debug-segment-${segment}"
    cp -R "$latest/." "$TMP_DIR/maestro-debug-segment-${segment}/" 2>/dev/null || true
  fi
  return "$rc"
}

# ── Cleanup trap: always attempt restore ──────────────────────────────────
cleanup() {
  stop_video
  revert_watchdog_scratch
  stop_port_holder
  if [[ "$STOPPED_MASTRA" == "1" ]]; then
    restore_mastra || true
  fi
  if [[ "$STOPPED_ZERO" == "1" ]]; then
    restore_zero_cache || true
  fi
}
trap cleanup EXIT

log "WATCHDOG_MS=$WATCHDOG_MS MAESTRO_RESEARCH_ERROR_TIMEOUT_MS=$MAESTRO_RESEARCH_ERROR_TIMEOUT_MS"
log "MAESTRO_METRO_URL=$MAESTRO_METRO_URL"
log "EVIDENCE_DIR=$EVIDENCE_DIR"

# ── AC-4 probe: zero still up → refuse before Maestro ─────────────────────
if [[ "${OFFLINE_CONTRACT_AC4_PROBE:-0}" == "1" ]]; then
  if ! curl -sf --max-time 3 http://127.0.0.1:4848/keepalive >/dev/null; then
    fail_closed "AC4 probe requires zero-cache UP on :4848 (keepalive currently failing)"
  fi
  # Inverted preflight for segment 1: keepalive ok means we must not run Maestro.
  fail_closed "segment-1 preflight refused: zero-cache still answering on port 4848 (keepalive ok) — boot out holocron-zerocache before airplane-mode reads; 0 Maestro invocations"
fi

# ── Shared live prerequisites ─────────────────────────────────────────────
if ! curl -sf --max-time 3 http://127.0.0.1:8081/status >/dev/null; then
  fail_closed "metro :8081/status not ok"
fi

# ── Single-segment override ───────────────────────────────────────────────
if [[ -n "${OFFLINE_CONTRACT_SEGMENT:-}" ]]; then
  case "$OFFLINE_CONTRACT_SEGMENT" in
    1)
      if curl -sf --max-time 2 http://127.0.0.1:4848/keepalive >/dev/null; then
        fail_closed "segment-1 preflight refused: zero-cache still answering on port 4848 — 0 Maestro invocations"
      fi
      if ! curl -sf --max-time 3 http://127.0.0.1:4111/health >/dev/null; then
        fail_closed "segment-1 requires Mastra/platform :4111/health ok"
      fi
      run_maestro_segment 1
      exit $?
      ;;
    2)
      if ! curl -sf --max-time 2 http://127.0.0.1:4848/keepalive >/dev/null; then
        fail_closed "segment-2 requires zero-cache :4848/keepalive ok"
      fi
      if curl -sf --max-time 2 http://127.0.0.1:4111/health >/dev/null; then
        fail_closed "segment-2 preflight refused: Mastra still answering on port 4111"
      fi
      run_maestro_segment 2
      exit $?
      ;;
    *)
      fail_closed "OFFLINE_CONTRACT_SEGMENT must be 1 or 2"
      ;;
  esac
fi

# ── Full path: seed (zero up) → segment 1 → segment 2 → restore ───────────
if ! curl -sf --max-time 3 http://127.0.0.1:4111/health >/dev/null; then
  fail_closed "platform/Mastra :4111/health not ok before segment 1 setup"
fi

if ! curl -sf --max-time 3 http://127.0.0.1:4848/keepalive >/dev/null; then
  log "zero-cache not answering — starting scripts/run-zero-cache.sh for seed"
  export ZERO_ADMIN_PASSWORD="${ZERO_ADMIN_PASSWORD:-local-zero-admin}"
  export ZERO_UPSTREAM_DB="${ZERO_UPSTREAM_DB:-$DATABASE_URL}"
  nohup bash "$ROOT/scripts/run-zero-cache.sh" \
    >"$TMP_DIR/zero-cache.out.log" 2>"$TMP_DIR/zero-cache.err.log" &
  wait_http_ok "http://127.0.0.1:4848/keepalive" 80 \
    || fail_closed "zero-cache :4848/keepalive not ok before seed"
fi

seed_e2e

# Optional AC-3 negative control path
if [[ "${OFFLINE_CONTRACT_NEGATIVE_CONTROL:-0}" == "1" ]]; then
  apply_watchdog_scratch
  stop_zero_cache
  if curl -sf --max-time 2 http://127.0.0.1:4848/keepalive >/dev/null; then
    fail_closed "segment-1 preflight refused: zero-cache still answering on port 4848 after bootout"
  fi
  wipe_sim_zero_sqlite
  log "AC-3: expecting segment 1 FAIL on watchdog-disabled build"
  set +e
  run_maestro_segment 1
  NEG_RC=$?
  set -e
  if [[ "$NEG_RC" -eq 0 ]]; then
    revert_watchdog_scratch
    fail_closed "AC-3 negative control: segment 1 unexpectedly PASSED with watchdog disabled"
  fi
  log "AC-3 RED evidence: segment 1 failed as expected (rc=$NEG_RC)"
  printf 'AC-3 regressed run exit=%s\n' "$NEG_RC" | tee "$EVIDENCE_DIR/S31-FE-07-AC-3-negative-control.txt"
  revert_watchdog_scratch
  # Restore zero, give Metro a moment, re-stop zero, prove green
  restore_zero_cache
  sleep 2
  stop_zero_cache
  if curl -sf --max-time 2 http://127.0.0.1:4848/keepalive >/dev/null; then
    fail_closed "segment-1 preflight refused: zero-cache still answering on port 4848"
  fi
  wipe_sim_zero_sqlite
  log "AC-3: re-run segment 1 after git checkout (expect PASS)"
  run_maestro_segment 1
  GREEN_RC=$?
  printf 'AC-3 restored run exit=%s\n' "$GREEN_RC" | tee -a "$EVIDENCE_DIR/S31-FE-07-AC-3-negative-control.txt"
  restore_zero_cache
  exit "$GREEN_RC"
fi

# ── Segment 1 ─────────────────────────────────────────────────────────────
stop_zero_cache
# Fail-closed inverted preflight (AC-1 / AC-4 substrate)
if curl -sf --max-time 2 http://127.0.0.1:4848/keepalive >/dev/null; then
  fail_closed "segment-1 preflight refused: zero-cache still answering on port 4848 after bootout — 0 Maestro invocations"
fi
if ! curl -sf --max-time 3 http://127.0.0.1:4111/health >/dev/null; then
  fail_closed "segment-1 requires Mastra/platform :4111 still healthy"
fi
log "preflight ok: zero-cache DOWN on 4848; Mastra UP on 4111"

wipe_sim_zero_sqlite
start_video "$EVIDENCE_DIR/S31-FE-07-segment-1.mp4"

set +e
run_maestro_segment 1
SEG1_RC=$?
set -e
stop_video

if [[ "$SEG1_RC" -ne 0 ]]; then
  log "segment 1 FAILED rc=$SEG1_RC"
  exit "$SEG1_RC"
fi
log "segment 1 PASS"
printf 'segment-1 exit=0 timeout_ms=%s\n' "$MAESTRO_RESEARCH_ERROR_TIMEOUT_MS" \
  | tee "$EVIDENCE_DIR/S31-FE-07-segment-1-summary.txt"

# ── Segment 2 ─────────────────────────────────────────────────────────────
restore_zero_cache
if ! wait_http_ok "http://127.0.0.1:4848/keepalive" 80; then
  fail_closed "segment-2 setup: zero-cache failed to restore on :4848"
fi
# Re-seed while zero is up so the chat conversation is in the publication
# (segment 1 only needs the research error path; segment 2 needs a real row).
seed_e2e

stop_mastra
if ! wait_http_down "http://127.0.0.1:4111/health" 40; then
  fail_closed "segment-2 setup: Mastra still answering on :4111 after bootout"
fi
if ! curl -sf --max-time 2 http://127.0.0.1:4848/keepalive >/dev/null; then
  fail_closed "segment-2 setup: zero-cache not answering on :4848"
fi
log "preflight ok: zero-cache UP; Mastra DOWN on 4111"

set +e
run_maestro_segment 2
SEG2_RC=$?
set -e

if [[ "$SEG2_RC" -ne 0 ]]; then
  log "segment 2 FAILED rc=$SEG2_RC"
  restore_mastra
  exit "$SEG2_RC"
fi
log "segment 2 PASS"
printf 'segment-2 exit=0 banner=chat-degraded-banner cardinality=1\n' \
  | tee "$EVIDENCE_DIR/S31-FE-07-segment-2-summary.txt"

# ── Restore both services (AC-5) ──────────────────────────────────────────
restore_mastra
restore_zero_cache

if ! curl -sf --max-time 3 http://127.0.0.1:4848/keepalive >/dev/null; then
  fail_closed "post-restore: :4848/keepalive not ok"
fi
if ! curl -sf --max-time 3 http://127.0.0.1:4111/health >/dev/null; then
  fail_closed "post-restore: :4111/health not ok"
fi
log "restore ok: both 4848 and 4111 answer"

# Evidence header for reviewers (AC-6)
cat >"$EVIDENCE_DIR/S31-FE-07-EVIDENCE-HEADER.md" <<EOF
# S31-FE-07 evidence header

**Proven conjunct (1 of 5):** airplane-mode reads  
**Flow:** .maestro/reactive/offline-contract-airplane-reads.yml  
**Harness:** .maestro/reactive/run-offline-contract-airplane-reads.sh  
**Segment 1 video:** S31-FE-07-segment-1.mp4  
**Segment 2 summary:** S31-FE-07-segment-2-summary.txt  

**Not covered (risk R23):** queued writes, rejection rollback, duplicate replay, concurrent-edit outcomes.

WATCHDOG_MS=${WATCHDOG_MS}
MAESTRO_RESEARCH_ERROR_TIMEOUT_MS=${MAESTRO_RESEARCH_ERROR_TIMEOUT_MS}
SEG1_RC=${SEG1_RC}
SEG2_RC=${SEG2_RC}
EOF

log "DONE both segments green; evidence in $EVIDENCE_DIR"
exit 0
