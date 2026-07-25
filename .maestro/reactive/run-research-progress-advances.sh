#!/usr/bin/env bash
# S-REACTIVE-02 AC-1 harness: seed-friendly Maestro run with Postgres advance helper.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-postgres://127.0.0.1:5432/holocron_nonprod}"
export MAESTRO_APP_ID="${MAESTRO_APP_ID:-com.holocron.app}"
export MAESTRO_METRO_URL="${MAESTRO_METRO_URL:-http://127.0.0.1:8082}"
export MAESTRO_RESEARCH_SESSION_URL="${MAESTRO_RESEARCH_SESSION_URL:-holocron://research/00000000-0000-4000-8000-e00000000033}"
export RESEARCH_SESSION_ID="${RESEARCH_SESSION_ID:-00000000-0000-4000-8000-e00000000033}"
export ADVANCE_SERVER_PORT="${ADVANCE_SERVER_PORT:-8765}"

if [[ -z "${MAESTRO_DEV_CLIENT_OPEN_URL:-}" ]]; then
  ENCODED=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("'"$MAESTRO_METRO_URL"'", safe=""))')
  export MAESTRO_DEV_CLIENT_OPEN_URL="exp+holocron://expo-development-client/?url=${ENCODED}"
fi

if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  if command -v bun >/dev/null 2>&1; then
    bun services/platform/src/cli/holo.ts seed:e2e --reset --json || true
  fi
fi

ADV_PID=""
if ! curl -sf "http://127.0.0.1:${ADVANCE_SERVER_PORT}/health" >/dev/null; then
  python3 .maestro/reactive/advance-server.py >/tmp/s-reactive-02-advance-server.log 2>&1 &
  ADV_PID=$!
  cleanup() { [[ -n "$ADV_PID" ]] && kill "$ADV_PID" 2>/dev/null || true; }
  trap cleanup EXIT
  for _ in $(seq 1 50); do
    if curl -sf "http://127.0.0.1:${ADVANCE_SERVER_PORT}/health" >/dev/null; then
      break
    fi
    sleep 0.1
  done
fi

curl -sf "http://127.0.0.1:${ADVANCE_SERVER_PORT}/health" >/dev/null
curl -sf "http://127.0.0.1:${ADVANCE_SERVER_PORT}/advance/1/5" >/dev/null

exec maestro test .maestro/reactive/research-progress-advances.yml \
  -e MAESTRO_APP_ID="$MAESTRO_APP_ID" \
  -e MAESTRO_METRO_URL="$MAESTRO_METRO_URL" \
  -e MAESTRO_DEV_CLIENT_OPEN_URL="$MAESTRO_DEV_CLIENT_OPEN_URL" \
  -e MAESTRO_RESEARCH_SESSION_URL="$MAESTRO_RESEARCH_SESSION_URL" \
  -e ADVANCE_SERVER_URL="http://127.0.0.1:${ADVANCE_SERVER_PORT}"
