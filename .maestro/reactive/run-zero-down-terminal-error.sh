#!/usr/bin/env bash
# S31-FE-02 AC-1 / AC-2 runner — seed with zero-cache up, then boot it out and
# assert research-detail-error + chat-degraded-banner (terminal, no spinner).
#
# Fail-closed: requires Postgres, Mastra, Metro; requires zero-cache reachable
# for seed, then unreachable before Maestro (inverted keepalive preflight).
#
# Honest cold cache: after kill, a port-holder occupies :4848 so zero-cache cannot
# rebind, and on-device Zero SQLite is wiped so offline replica rows cannot mask the
# terminal error path.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export PATH="$ROOT/bin:$PATH"
export DATABASE_URL="${DATABASE_URL:-postgres://127.0.0.1:5432/holocron_nonprod}"
export MAESTRO_APP_ID="${MAESTRO_APP_ID:-com.holocron.app}"
# Simulator reaches Metro via LAN; 127.0.0.1 is the host loopback only.
# Prefer en0/en1, then Wi-Fi service IP (macOS may put Wi-Fi on en1).
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
# Rebuild Dev Client open URL whenever metro URL is resolved here
ENCODED=$(python3 -c 'import urllib.parse,os; print(urllib.parse.quote(os.environ["MAESTRO_METRO_URL"], safe=""))')
export MAESTRO_DEV_CLIENT_OPEN_URL="exp+holocron://expo-development-client/?url=${ENCODED}"
export MAESTRO_DEVICE="${MAESTRO_DEVICE:-}"
export MAESTRO_CHAT_URL="${MAESTRO_CHAT_URL:-holocron://chat/00000000-0000-4000-8000-0000000000e1}"
export EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.tmp/S31-FE-02}"
mkdir -p "$EVIDENCE_DIR"

DOMAIN="gui/$(id -u)"
ZERO_LABEL="holocron-zerocache"
PORT_HOLDER_PID=""

log() { echo "[run-zero-down-terminal-error] $*" | tee -a "$EVIDENCE_DIR/harness.log"; }
fail_closed() {
  log "FAIL-CLOSED: $*"
  exit 1
}

cleanup() {
  if [[ -n "${PORT_HOLDER_PID:-}" ]]; then
    kill "$PORT_HOLDER_PID" 2>/dev/null || true
    wait "$PORT_HOLDER_PID" 2>/dev/null || true
  fi
  # Best-effort restore zero-cache for subsequent healthy-stack flows.
  if ! curl -sf --max-time 2 http://127.0.0.1:4848/keepalive >/dev/null; then
    export ZERO_ADMIN_PASSWORD="${ZERO_ADMIN_PASSWORD:-local-zero-admin}"
    export DATABASE_URL="${DATABASE_URL:-postgres://127.0.0.1:5432/holocron_nonprod}"
    export ZERO_UPSTREAM_DB="${ZERO_UPSTREAM_DB:-$DATABASE_URL}"
    nohup bash "$ROOT/scripts/run-zero-cache.sh" \
      >"$EVIDENCE_DIR/zero-cache-restore.out.log" \
      2>"$EVIDENCE_DIR/zero-cache-restore.err.log" &
  fi
}
trap cleanup EXIT

if ! command -v holo >/dev/null 2>&1; then
  fail_closed "holo not on PATH after prepending $ROOT/bin"
fi

# Platform + Metro must be live for the app shell.
if ! curl -sf --max-time 3 http://127.0.0.1:4111/health >/dev/null; then
  fail_closed "platform :4111/health not ok"
fi
if ! curl -sf --max-time 3 http://127.0.0.1:8081/status >/dev/null; then
  fail_closed "metro :8081/status not ok"
fi

# Seed requires zero-cache up so rows replicate into the publication.
if ! curl -sf --max-time 3 http://127.0.0.1:4848/keepalive >/dev/null; then
  log "zero-cache not answering — attempting scripts/run-zero-cache.sh"
  export ZERO_ADMIN_PASSWORD="${ZERO_ADMIN_PASSWORD:-local-zero-admin}"
  export ZERO_UPSTREAM_DB="${ZERO_UPSTREAM_DB:-$DATABASE_URL}"
  nohup bash "$ROOT/scripts/run-zero-cache.sh" \
    >"$EVIDENCE_DIR/zero-cache.out.log" \
    2>"$EVIDENCE_DIR/zero-cache.err.log" &
  for _ in $(seq 1 40); do
    if curl -sf --max-time 2 http://127.0.0.1:4848/keepalive >/dev/null; then
      break
    fi
    sleep 0.5
  done
fi
if ! curl -sf --max-time 3 http://127.0.0.1:4848/keepalive >/dev/null; then
  fail_closed "zero-cache :4848/keepalive not ok before seed (start scripts/run-zero-cache.sh)"
fi

log "holo=$(command -v holo)"
log "MAESTRO_METRO_URL=$MAESTRO_METRO_URL"
# Prefer seed:e2e --reset; when data_plane_ponr truncate guard is armed (S30+),
# TRUNCATE fails closed — fall back to idempotent upsert seed (reset:false).
log "seed:e2e (zero-cache up; --reset preferred, PONR-safe upsert fallback)"
set +e
SEED_OUT=$(holo seed:e2e --reset 2>&1)
SEED_RC=$?
set -e
printf '%s\n' "$SEED_OUT" | tee -a "$EVIDENCE_DIR/seed-e2e.txt" >/dev/null
if [[ $SEED_RC -ne 0 ]]; then
  if printf '%s' "$SEED_OUT" | grep -q 'PONR_IMMUTABLE'; then
    log "seed:e2e --reset blocked by PONR_IMMUTABLE — seeding with reset:false upserts"
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
    printf '%s\n' "$SEED_JSON" | tee -a "$EVIDENCE_DIR/seed-e2e-no-truncate.txt" >/dev/null
    if [[ $SEED_RC -ne 0 ]]; then
      fail_closed "seed:e2e upsert (reset:false) failed after PONR --reset block"
    fi
  else
    fail_closed "seed:e2e --reset failed (not PONR): see $EVIDENCE_DIR/seed-e2e.txt"
  fi
fi

mkdir -p "$ROOT/.tmp/seed-e2e"
# Active research session with document_id null (no redirect). S24 e2e substrate.
export MAESTRO_RESEARCH_SESSION_URL="${MAESTRO_RESEARCH_SESSION_URL:-holocron://research/00000000-0000-4000-8000-e00000000033}"
export MAESTRO_CHAT_URL="${MAESTRO_CHAT_URL:-holocron://chat/00000000-0000-4000-8000-0000000000e1}"
{
  echo "export MAESTRO_RESEARCH_SESSION_URL=\"$MAESTRO_RESEARCH_SESSION_URL\""
  echo "export MAESTRO_CHAT_URL=\"$MAESTRO_CHAT_URL\""
} >"$ROOT/.tmp/seed-e2e/maestro.env"
log "MAESTRO_RESEARCH_SESSION_URL=$MAESTRO_RESEARCH_SESSION_URL"
log "MAESTRO_CHAT_URL=$MAESTRO_CHAT_URL"

# Boot zero-cache out so keepalive fails (fail-closed inverted preflight).
log "booting out ${ZERO_LABEL} (zero-cache down for Maestro)"
launchctl bootout "${DOMAIN}/${ZERO_LABEL}" 2>/dev/null || true
for p in $(lsof -nP -iTCP:4848 -sTCP:LISTEN -t 2>/dev/null || true); do
  kill -9 "$p" 2>/dev/null || true
done
pkill -9 -f 'zero-cache' 2>/dev/null || true
sleep 0.5

# Occupy :4848 so zero-cache cannot rebind mid-run (accept+close → keepalive fails).
python3 - "$EVIDENCE_DIR/port-holder.pid" <<'PY' &
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
echo "$PORT_HOLDER_PID" >"$EVIDENCE_DIR/port-holder.pid"
sleep 0.3

# Wipe on-device Zero SQLite replica so offline cache cannot hide the error path.
if [[ -n "$MAESTRO_DEVICE" ]]; then
  xcrun simctl terminate "$MAESTRO_DEVICE" "$MAESTRO_APP_ID" 2>/dev/null || true
  APP_DATA=$(xcrun simctl get_app_container "$MAESTRO_DEVICE" "$MAESTRO_APP_ID" data 2>/dev/null || true)
  if [[ -n "$APP_DATA" && -d "$APP_DATA" ]]; then
    rm -rf "$APP_DATA/Documents/SQLite" \
      "$APP_DATA/Library/Caches"/* \
      "$APP_DATA/Library/Application Support"/* 2>/dev/null || true
    log "wiped simulator Zero SQLite under $APP_DATA"
  fi
fi

if curl -sf --max-time 2 http://127.0.0.1:4848/keepalive >/dev/null; then
  fail_closed "zero-cache :4848/keepalive still ok after bootout — cannot prove terminal error"
fi
log "preflight ok: zero-cache down (keepalive fails; port-holder pid=$PORT_HOLDER_PID); platform+metro up"

log "maestro test zero-down-terminal-error.yml"
MAESTRO_ARGS=(
  test .maestro/reactive/zero-down-terminal-error.yml
  --format junit
  --output "$EVIDENCE_DIR/maestro-zero-down-junit.xml"
  -e MAESTRO_APP_ID="$MAESTRO_APP_ID"
  -e MAESTRO_METRO_URL="$MAESTRO_METRO_URL"
  -e MAESTRO_DEV_CLIENT_OPEN_URL="$MAESTRO_DEV_CLIENT_OPEN_URL"
  -e MAESTRO_RESEARCH_SESSION_URL="$MAESTRO_RESEARCH_SESSION_URL"
  -e MAESTRO_CHAT_URL="$MAESTRO_CHAT_URL"
)
if [[ -n "$MAESTRO_DEVICE" ]]; then
  MAESTRO_ARGS+=(--device "$MAESTRO_DEVICE")
fi

set +e
maestro "${MAESTRO_ARGS[@]}" 2>&1 | tee "$EVIDENCE_DIR/maestro-zero-down.log"
MAESTRO_RC=${PIPESTATUS[0]}
set -e

# Stop port-holder before restore
if [[ -n "${PORT_HOLDER_PID:-}" ]]; then
  kill "$PORT_HOLDER_PID" 2>/dev/null || true
  wait "$PORT_HOLDER_PID" 2>/dev/null || true
  PORT_HOLDER_PID=""
fi

log "restoring zero-cache after Maestro (best-effort)"
export ZERO_ADMIN_PASSWORD="${ZERO_ADMIN_PASSWORD:-local-zero-admin}"
export ZERO_UPSTREAM_DB="${ZERO_UPSTREAM_DB:-$DATABASE_URL}"
nohup bash "$ROOT/scripts/run-zero-cache.sh" \
  >"$EVIDENCE_DIR/zero-cache-restore.out.log" \
  2>"$EVIDENCE_DIR/zero-cache-restore.err.log" &
for _ in $(seq 1 40); do
  if curl -sf --max-time 2 http://127.0.0.1:4848/keepalive >/dev/null; then
    log "zero-cache restored on :4848"
    break
  fi
  sleep 0.5
done

# Copy latest Maestro debug artifacts into evidence (screenshots + logs)
LATEST_MAESTRO=$(ls -td "${HOME}/.maestro/tests/"* 2>/dev/null | head -1 || true)
if [[ -n "${LATEST_MAESTRO:-}" ]]; then
  mkdir -p "$EVIDENCE_DIR/maestro-debug"
  cp -R "$LATEST_MAESTRO/." "$EVIDENCE_DIR/maestro-debug/" 2>/dev/null || true
  log "copied maestro debug from $LATEST_MAESTRO"
fi
# Promote takeScreenshot artifacts from CWD if present
for shot in S31-FE-02-AC-*.png; do
  [[ -f "$shot" ]] || continue
  cp "$shot" "$EVIDENCE_DIR/" 2>/dev/null || true
  mkdir -p "$ROOT/docs/evidence/S31-FE-02"
  cp "$shot" "$ROOT/docs/evidence/S31-FE-02/" 2>/dev/null || true
done

exit "$MAESTRO_RC"
