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
device_udid=""
app_path="${EXPO_DEV_BUILD_PATH:-}"
app_id="${MAESTRO_APP_ID:-org.name.holocron}"
# AC-3 — dev-client session mode (one of tutorial / server-list+tutorial /
# server-list+already-running / already-running). Override via the env var.
mode_dev_client="${MAESTRO_DEV_CLIENT_MODE:-server-list+already-running}"
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
command -v python3 >/dev/null 2>&1 || fail "python3 is not installed; cannot resolve simulator UDID"
[[ -f "$flow" ]] || fail "Maestro flow does not exist: $flow"
[[ -n "$app_path" ]] || fail "EXPO_DEV_BUILD_PATH is required; refusing Expo Go or a missing build"
# An iOS .app is a DIRECTORY bundle (Mach-O executable + Info.plist + resources),
# not a single file. A strict directory check is the correct contract for an app
# bundle and rejects accidental file paths.
[[ -d "$app_path" ]] || fail "Expo development build does not exist: $app_path"

# Zero 1.8.0's change-streamer restores its replica through Litestream during
# startup. Validate the real executable and backup contract before namespace
# reset or any service starts; otherwise Zero exits after startup with the less
# actionable "Missing --litestream-executable" error.
litestream_executable="${ZERO_LITESTREAM_EXECUTABLE:-}"
litestream_config="${ZERO_LITESTREAM_CONFIG:-$repo_root/scripts/e2e/zero-cache-litestream.yml}"
[[ -n "$litestream_executable" ]] \
  || fail "ZERO_LITESTREAM_EXECUTABLE is required for Zero 1.8.0; provide the Rocicorp litestream fork"
[[ -x "$litestream_executable" ]] \
  || fail "ZERO_LITESTREAM_EXECUTABLE is not executable: $litestream_executable"
litestream_version="$("$litestream_executable" version 2>&1)" \
  || fail "ZERO_LITESTREAM_EXECUTABLE could not run 'version': $litestream_executable"
[[ -n "$litestream_version" ]] \
  || fail "ZERO_LITESTREAM_EXECUTABLE returned no version: $litestream_executable"
[[ -n "${ZERO_LITESTREAM_BACKUP_URL:-}" ]] \
  || fail "ZERO_LITESTREAM_BACKUP_URL is required for Zero 1.8.0 Litestream restore/backup"
[[ -f "$litestream_config" ]] \
  || fail "ZERO_LITESTREAM_CONFIG does not exist: $litestream_config"

# Maestro's --device option requires a simulator UDID, while MAESTRO_DEVICE is
# intentionally a human-readable name for the simctl/operator contract. Resolve
# the exact available name through the real CoreSimulator JSON and reject both
# missing and ambiguous matches; never pass the name through as a fallback.
simulator_json="$(xcrun simctl list devices available --json)" \
  || fail "could not query available iOS Simulators as JSON"
device_udid="$(python3 -c '
import json
import sys

try:
    data = json.load(sys.stdin)
    if not isinstance(data, dict) or not isinstance(data.get("devices"), dict):
        raise ValueError("devices must be an object")
    matches = [
        device
        for devices in data["devices"].values()
        for device in devices
        if device.get("name") == sys.argv[1]
        and device.get("isAvailable") is True
    ]
except (AttributeError, KeyError, TypeError, ValueError, json.JSONDecodeError):
    sys.exit(1)

if len(matches) != 1:
    sys.exit(1)

udid = matches[0].get("udid")
if not isinstance(udid, str) or not udid:
    sys.exit(1)
print(udid)
' "$device" <<<"$simulator_json")" \
  || fail "could not resolve one exact available UDID for named simulator: $device"
[[ "$device_udid" =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$ ]] \
  || fail "resolved simulator UDID is invalid for named simulator: $device"

zero_port="${ZERO_PORT:-4848}"
zero_startup_timeout_seconds="${ZERO_STARTUP_TIMEOUT_SECONDS:-180}"
[[ "$zero_startup_timeout_seconds" =~ ^[1-9][0-9]*$ ]] \
  || fail "ZERO_STARTUP_TIMEOUT_SECONDS must be a positive integer"

if [[ "$mode" == "--check" ]]; then
  printf '{"ok":true,"device":"%s","device_udid":"%s","flow":"%s","app":"%s","artifacts":"%s"}\n' "$device" "$device_udid" "$flow" "$app_path" "$artifact_dir"
  exit 0
fi

# The reset is intentionally before boot/flow execution and fails closed.
bun "$repo_root/services/platform/src/cli/holo.ts" namespace reset --json >"$artifact_dir/namespace-reset.json"

NODE_ENV=production pnpm exec zero-cache \
  --upstream-db "$DATABASE_URL" \
  --cvr-db "${ZERO_CVR_DB:-$DATABASE_URL}" \
  --change-db "${ZERO_CHANGE_DB:-$DATABASE_URL}" \
  --app-publications zero_pub \
  --port "$zero_port" \
  --admin-password "$ZERO_ADMIN_PASSWORD" \
  --litestream-executable "$litestream_executable" \
  --litestream-backup-url "$ZERO_LITESTREAM_BACKUP_URL" \
  --litestream-config-path "$litestream_config" \
  >"$artifact_dir/zero-cache.log" 2>&1 &
zero_pid=$!
stop_zero() {
  if [[ -n "${zero_pid:-}" ]]; then
    kill "$zero_pid" 2>/dev/null || true
    wait "$zero_pid" 2>/dev/null || true
    zero_pid=""
  fi
}
# Install this trap immediately after launching zero-cache. Readiness can fail
# before the later video cleanup trap exists, and a real zero-cache must not be
# left orphaned in that window.
trap stop_zero EXIT
zero_ready=0
for ((ready_wait_seconds = 0; ready_wait_seconds < zero_startup_timeout_seconds; ready_wait_seconds += 1)); do
  if ! kill -0 "$zero_pid" 2>/dev/null; then
    tail -80 "$artifact_dir/zero-cache.log" >&2 || true
    fail "zero-cache exited before becoming ready"
  fi
  if curl --silent --fail --max-time 1 "http://127.0.0.1:${zero_port}/keepalive" >/dev/null 2>&1; then
    zero_ready=1
    break
  fi
  sleep 1
done
[[ "$zero_ready" == "1" ]] \
  || fail "zero-cache did not become ready within ${zero_startup_timeout_seconds} seconds"

booted="$(xcrun simctl list devices | awk -v wanted="$device" '$0 ~ wanted { print ($0 ~ /Booted/) }')"
if [[ "$booted" != "1" ]]; then
  xcrun simctl boot "$device" 2>"$artifact_dir/simctl-boot.stderr" || true
fi
xcrun simctl bootstatus "$device" -b >"$artifact_dir/simctl-bootstatus.txt"
# Keep the configured name as the operator-facing artifact metadata while
# recording the resolved ID used only for Maestro.
printf '{"name":"%s","udid":"%s"}\n' "$device" "$device_udid" \
  >"$artifact_dir/simctl-device-resolution.json"
# AC-2 — fresh reinstall every run so a stale build cannot false-pass. terminate
# and uninstall tolerate a not-yet-installed app on a fresh simulator (|| true);
# install does NOT swallow failures. Each step captures its own artifact file.
xcrun simctl terminate "$device" "$app_id" >"$artifact_dir/simctl-terminate.txt" 2>&1 || true
echo "terminated: $app_id (tolerated if absent)" >>"$artifact_dir/simctl-terminate.txt"
xcrun simctl uninstall "$device" "$app_id" >"$artifact_dir/simctl-uninstall.txt" 2>&1 || true
echo "uninstalled: $app_id (tolerated if absent)" >>"$artifact_dir/simctl-uninstall.txt"
xcrun simctl install "$device" "$app_path" >"$artifact_dir/simctl-install.txt" 2>&1
# `xcrun simctl install` is silent on success; write a sentinel so an empty file
# is never mistaken for "did not run".
echo "installed: $app_path" >>"$artifact_dir/simctl-install.txt"

# AC-3 — record the dev-client session mode used for this run.
cat >"$artifact_dir/dev-client-setup.json" <<JSON
{"mode":"$mode_dev_client","app_id":"$app_id","flow":"$flow","captured_at":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
JSON

video="$artifact_dir/reference-flow.mov"
# REDHAT-FIX-H3 — remove any stale recorder sidecar (.mov.sb-*) AND the prior
# target before recording so a resource-busy conflict cannot leave a sidecar-
# only result that masquerades as a valid video.
rm -f "$video" "$artifact_dir"/.mov.sb-* 2>/dev/null || true
# GATE-FIX-G2 — clear host-recording lock left by prior SIGTERM (must SIGINT to finalize).
# A leftover recorder makes the next recordVideo fail with "Resource busy".
if pgrep -x simctl >/dev/null 2>&1; then
  # Best-effort: interrupt any prior simctl io recordVideo for this device.
  pkill -INT -x simctl 2>/dev/null || true
  sleep 1
fi
xcrun simctl io "$device" recordVideo --codec=h264 -f "$video" >"$artifact_dir/video.log" 2>&1 &
video_pid=$!
video_bad=0
finalize_recording() {
  # SIGINT tells recordVideo to finalize the .mov; SIGTERM leaves Resource busy + empty path.
  if [[ -n "${video_pid:-}" ]]; then
    kill -INT "$video_pid" 2>/dev/null || true
    wait "$video_pid" 2>/dev/null || true
  fi
  sleep 1
  xcrun simctl io "$device" screenshot "$artifact_dir/final.png" >/dev/null 2>&1 || true
  # REDHAT-FIX-H3 — post-run sidecar cleanup so the artifact dir holds exactly
  # the named .mov (+ sibling screenshot/junit artifacts), never a sidecar-only result.
  rm -f "$artifact_dir"/.mov.sb-* 2>/dev/null || true
  return 0
}
cleanup() {
  finalize_recording
  stop_zero
  return 0
}
trap cleanup EXIT

# Capture Maestro's process status explicitly. With errexit enabled, a non-zero
# CLI status would otherwise skip the artifact checks below and hide whether
# the flow, recorder, or post-run validation was responsible for the failure.
set +e
maestro --device "$device_udid" test "$flow" \
  --format JUNIT \
  --output "$artifact_dir/junit.xml" \
  --debug-output "$artifact_dir/debug" \
  --test-output-dir "$artifact_dir/test-output" \
  -e MAESTRO_APP_ID="$app_id" \
  -e PLATFORM_URL="${EXPO_PUBLIC_PLATFORM_URL:-${PLATFORM_URL}}" \
  -e E2E_ARTIFACT_DIR="$artifact_dir"
maestro_rc=$?
printf '%s\n' "$maestro_rc" >"$artifact_dir/maestro-exit-code.txt"
# Keep the post-run verdict path explicit and independent from incidental shell
# statuses. The actual flow and recorder outcomes remain fail-closed below.
set +e
# Finalize the recorder before validating the exact video path. recordVideo
# writes the .mov during SIGINT cleanup, after Maestro has already returned.
finalize_recording
trap - EXIT
video_bad=0
# REDHAT-FIX-H3 — recorder-failure surfacing. If the exact reference-flow.mov
# is missing/empty OR the recorder logged a known failure, record a named reason
# and force a non-zero exit so a sidecar-only / empty-video result can never be
# mistaken for a green run (the capstone verifier also rejects an empty .mov).
if [[ ! -s "$video" ]]; then
  echo "reference-flow.mov missing or empty after run (recorder did not finalize)" >>"$artifact_dir/video.log"
  video_bad=1
fi
if grep -qiE "Host recording is already in progress|Resource busy|simctl io.*failed" "$artifact_dir/video.log" 2>/dev/null; then
  echo "recorder failure detected in video.log" >>"$artifact_dir/video.log"
  video_bad=1
fi
final_rc="$maestro_rc"
if [[ "$video_bad" == "1" ]]; then
  final_rc=1
fi
capstone_rc=0
if [[ "${RUN_CAPSTONE_VERDICT:-false}" == "true" && "$maestro_rc" == "0" && "$video_bad" == "0" ]]; then
  "$repo_root/scripts/e2e/capstone-verdict.sh" \
    --artifact-dir "$artifact_dir" >"$artifact_dir/capstone-run.log" 2>&1
  capstone_rc=$?
  if [[ "$capstone_rc" != "0" ]]; then
    final_rc=1
  fi
fi
printf 'maestro_rc=%s\nvideo_bad=%s\ncapstone_rc=%s\nfinal_rc=%s\n' \
  "$maestro_rc" "$video_bad" "$capstone_rc" "$final_rc" >"$artifact_dir/harness-verdict.txt"
stop_zero
exit "$final_rc"
