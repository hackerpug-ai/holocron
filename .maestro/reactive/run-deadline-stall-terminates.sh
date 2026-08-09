#!/usr/bin/env bash
# S31-FE-01 AC-2 harness: real stall origin on :4599 + Maestro deadline-stall flow.
#
# Fail-closed: if the stall server cannot bind or health-check, exit non-zero
# BEFORE Maestro (do not run a doomed flow).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgres://127.0.0.1:5432/holocron_nonprod}"
export MAESTRO_APP_ID="${MAESTRO_APP_ID:-com.holocron.app}"
export MAESTRO_METRO_URL="${MAESTRO_METRO_URL:-http://127.0.0.1:8081}"
export MAESTRO_CHAT_URL="${MAESTRO_CHAT_URL:-holocron://chat/00000000-0000-4000-8000-0000000000e1}"
export PLATFORM_URL="${PLATFORM_URL:-http://127.0.0.1:4111}"
export STALL_HOST="${STALL_HOST:-127.0.0.1}"
export STALL_PORT="${STALL_PORT:-4599}"
export HOLO_KEY_RN="${HOLO_KEY_RN:-replace-me-rn-key}"

if [[ -z "${MAESTRO_DEV_CLIENT_OPEN_URL:-}" ]]; then
  ENCODED=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("'"$MAESTRO_METRO_URL"'", safe=""))')
  export MAESTRO_DEV_CLIENT_OPEN_URL="exp+holocron://expo-development-client/?url=${ENCODED}"
fi

EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.tmp/S31-FE-01}"
mkdir -p "$EVIDENCE_DIR"
STALL_LOG="$EVIDENCE_DIR/stall-sse-server.log"
STALL_PID_FILE="$EVIDENCE_DIR/stall-sse-server.pid"

log() { echo "[run-deadline-stall-terminates] $*" | tee -a "$EVIDENCE_DIR/harness-deadline-stall.log"; }
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
  local tries="${2:-40}"
  for _ in $(seq 1 "$tries"); do
    if curl -sf --max-time 1 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.15
  done
  return 1
}

STALL_PID=""
cleanup() {
  if [[ -n "${STALL_PID:-}" ]]; then
    kill -9 "$STALL_PID" 2>/dev/null || true
  fi
  if [[ -f "$STALL_PID_FILE" ]]; then
    kill -9 "$(cat "$STALL_PID_FILE" 2>/dev/null || true)" 2>/dev/null || true
    rm -f "$STALL_PID_FILE"
  fi
  kill_port_listeners "$STALL_PORT"
}
trap cleanup EXIT

# ── Seed (optional) ───────────────────────────────────────────────────────
if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  log "seed:e2e --reset"
  if command -v bun >/dev/null 2>&1; then
    bun services/platform/src/cli/holo.ts seed:e2e --reset --json 2>&1 | tee "$EVIDENCE_DIR/seed-e2e.txt" || true
  fi
fi

# ── Stall origin on :4599 ─────────────────────────────────────────────────
kill_port_listeners "$STALL_PORT"
sleep 0.2
log "start stall-sse-server.py --mode stall on ${STALL_HOST}:${STALL_PORT}"
python3 "$ROOT/scripts/e2e/stall-sse-server.py" \
  --mode stall \
  --host "$STALL_HOST" \
  --port "$STALL_PORT" \
  >"$STALL_LOG" 2>&1 &
STALL_PID=$!
echo "$STALL_PID" >"$STALL_PID_FILE"

if ! wait_http_ok "http://${STALL_HOST}:${STALL_PORT}/health" 50; then
  fail_closed "stall-sse-server did not become healthy on ${STALL_HOST}:${STALL_PORT} (log: $STALL_LOG)"
fi
log "stall origin healthy pid=$STALL_PID"

# Prove accept-then-stall: headers arrive, body does not within 1s.
STALL_PROBE_OUT="$EVIDENCE_DIR/stall-probe.txt"
set +e
curl -sS -N --max-time 1 \
  -H "Accept: text/event-stream" \
  "http://${STALL_HOST}:${STALL_PORT}/api/chat-runs/probe/events" \
  >"$STALL_PROBE_OUT" 2>"$EVIDENCE_DIR/stall-probe.err"
set -e
# Body should be empty (headers-only stall); non-zero curl exit is expected on max-time.
if [[ -s "$STALL_PROBE_OUT" ]]; then
  # Some stacks buffer nothing — empty is ideal; if anything landed it must not be a full token stream.
  if grep -q "event: token" "$STALL_PROBE_OUT" 2>/dev/null; then
    fail_closed "stall origin emitted token events — not an accept-then-stall fixture"
  fi
fi
log "stall probe ok (no token body within 1s)"

# ── Maestro ───────────────────────────────────────────────────────────────
# Note: full end-to-end AC-2 against the iOS simulator requires the RN app's
# EXPO_PUBLIC_PLATFORM_URL (or runtime override) to target the stall origin so
# create+SSE hit :4599. Integration tests cover the controller path with the
# same origin; this harness is the visible Maestro gate when the app is wired.
log "maestro test deadline-stall-terminates.yml"
set +e
maestro test .maestro/reactive/deadline-stall-terminates.yml \
  -e MAESTRO_APP_ID="$MAESTRO_APP_ID" \
  -e MAESTRO_METRO_URL="$MAESTRO_METRO_URL" \
  -e MAESTRO_DEV_CLIENT_OPEN_URL="$MAESTRO_DEV_CLIENT_OPEN_URL" \
  -e MAESTRO_CHAT_URL="$MAESTRO_CHAT_URL" \
  2>&1 | tee "$EVIDENCE_DIR/AC-2-maestro.txt"
MAESTRO_EXIT=${PIPESTATUS[0]}
set -e

log "maestro exit=$MAESTRO_EXIT"
exit "$MAESTRO_EXIT"
