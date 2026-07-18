#!/usr/bin/env bash
# Sprint 20 D03 — fail-closed Maestro cold-boot reference-flow harness.
# This script never substitutes a mock app, backend, fleet, or simulator.
set -Eeuo pipefail

mode="${1:---run}"
if [[ "$mode" != "--check" && "$mode" != "--run" ]]; then
  echo "usage: $0 [--check|--run]" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
artifact_dir="${E2E_ARTIFACT_DIR:-$repo_root/.tmp/maestro-reference-flow}"
flow="${MAESTRO_FLOW:-$repo_root/.e2e/maestro/reference-flow.yaml}"
device="${MAESTRO_DEVICE:-}"
app_path="${EXPO_DEV_BUILD_PATH:-}"
app_id="${MAESTRO_APP_ID:-com.holocron.app}"
mkdir -p "$artifact_dir"

fail() {
  echo "maestro-reference-flow: $*" >&2
  exit 1
}

[[ -n "$device" ]] || fail "MAESTRO_DEVICE must name an available iOS Simulator"
[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required; no database substitute is allowed"
[[ "$DATABASE_URL" == *holocron_nonprod* ]] || fail "DATABASE_URL must target holocron_nonprod"
[[ -n "${FLEET_URL:-}" ]] || fail "FLEET_URL is required; no inference substitute is allowed"
[[ -n "${EXPO_PUBLIC_PLATFORM_URL:-${PLATFORM_URL:-}}" ]] || fail "platform URL is required"
[[ -n "${EXPO_PUBLIC_RN_API_KEY:-}" ]] || fail "EXPO_PUBLIC_RN_API_KEY is required for the Hono chat command"
[[ "${EXPO_PUBLIC_REFERENCE_FLOW:-true}" == "true" ]] || fail "EXPO_PUBLIC_REFERENCE_FLOW must be true for the reference build"
[[ -n "${ZERO_ADMIN_PASSWORD:-}" ]] || fail "ZERO_ADMIN_PASSWORD is required for the real zero-cache"
command -v maestro >/dev/null 2>&1 || fail "maestro CLI is not installed"
command -v xcrun >/dev/null 2>&1 || fail "xcrun is not installed"
[[ -f "$flow" ]] || fail "Maestro flow does not exist: $flow"
[[ -n "$app_path" ]] || fail "EXPO_DEV_BUILD_PATH is required; refusing Expo Go or a missing build"
[[ -f "$app_path" ]] || fail "Expo development build does not exist: $app_path"

simulators="$(xcrun simctl list devices available)"
grep -Fq "$device" <<<"$simulators" || fail "named simulator is unavailable: $device"

if [[ "$mode" == "--check" ]]; then
  printf '{"ok":true,"device":"%s","flow":"%s","app":"%s","artifacts":"%s"}\n' "$device" "$flow" "$app_path" "$artifact_dir"
  exit 0
fi

# The reset is intentionally before boot/flow execution and fails closed.
bun "$repo_root/services/platform/src/cli/holo.ts" namespace reset --json >"$artifact_dir/namespace-reset.json"

zero_port="${ZERO_PORT:-4848}"
NODE_ENV=production pnpm exec zero-cache \
  --upstream-db "$DATABASE_URL" \
  --cvr-db "${ZERO_CVR_DB:-$DATABASE_URL}" \
  --change-db "${ZERO_CHANGE_DB:-$DATABASE_URL}" \
  --app-publications zero_pub \
  --port "$zero_port" \
  --admin-password "$ZERO_ADMIN_PASSWORD" \
  >"$artifact_dir/zero-cache.log" 2>&1 &
zero_pid=$!
stop_zero() {
  kill "$zero_pid" 2>/dev/null || true
  wait "$zero_pid" 2>/dev/null || true
}
for _ in {1..30}; do
  if ! kill -0 "$zero_pid" 2>/dev/null; then
    tail -80 "$artifact_dir/zero-cache.log" >&2 || true
    fail "zero-cache exited before becoming ready"
  fi
  if curl --silent --fail --max-time 1 "http://127.0.0.1:${zero_port}/keepalive" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl --silent --fail --max-time 2 "http://127.0.0.1:${zero_port}/keepalive" >/dev/null \
  || fail "zero-cache did not become ready"

booted="$(xcrun simctl list devices | awk -v wanted="$device" '$0 ~ wanted { print ($0 ~ /Booted/) }')"
if [[ "$booted" != "1" ]]; then
  xcrun simctl boot "$device" 2>"$artifact_dir/simctl-boot.stderr" || true
fi
xcrun simctl bootstatus "$device" -b >"$artifact_dir/simctl-bootstatus.txt"
xcrun simctl install "$device" "$app_path" >"$artifact_dir/simctl-install.txt"

video="$artifact_dir/reference-flow.mov"
xcrun simctl io "$device" recordVideo --codec=h264 "$video" >"$artifact_dir/video.log" 2>&1 &
video_pid=$!
cleanup() {
  kill "$video_pid" 2>/dev/null || true
  wait "$video_pid" 2>/dev/null || true
  xcrun simctl io "$device" screenshot "$artifact_dir/final.png" >/dev/null 2>&1 || true
  stop_zero
}
trap cleanup EXIT

maestro --device "$device" test "$flow" \
  --format JUNIT \
  --output "$artifact_dir/junit.xml" \
  --debug-output "$artifact_dir/debug" \
  --test-output-dir "$artifact_dir/test-output" \
  -e MAESTRO_APP_ID="$app_id" \
  -e PLATFORM_URL="${EXPO_PUBLIC_PLATFORM_URL:-${PLATFORM_URL}}" \
  -e E2E_ARTIFACT_DIR="$artifact_dir"
