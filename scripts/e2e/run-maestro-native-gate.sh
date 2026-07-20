#!/usr/bin/env bash
# Sprint 20 native human-gate driver.
#
# Each invocation drives exactly one scoped Maestro flow against the same
# simulator session. Step 1 provisions the real substrate and leaves it alive;
# step 2 sends the message; step 3 observes the Zero-synced reply and tears the
# session down. The shared kb-run-human-tests runner records and verifies the
# per-step evidence emitted here.
set -Eeuo pipefail

mode="--run"
step=""
session_dir=""
artifact_dir=""
flow=""
evidence_file=""
action_id=""

fail() {
  echo "maestro-native-gate: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
usage: run-maestro-native-gate.sh [--check|--run] --step N --session-dir DIR \
  --artifact-dir DIR --flow FILE --evidence-file FILE --action-id ID
EOF
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check|--run) mode="$1"; shift ;;
    --step) step="${2:-}"; shift 2 ;;
    --session-dir) session_dir="${2:-}"; shift 2 ;;
    --artifact-dir) artifact_dir="${2:-}"; shift 2 ;;
    --flow) flow="${2:-}"; shift 2 ;;
    --evidence-file) evidence_file="${2:-}"; shift 2 ;;
    --action-id) action_id="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
device="${MAESTRO_DEVICE:-}"
app_id="${MAESTRO_APP_ID:-}"
app_path="${EXPO_DEV_BUILD_PATH:-}"
flow="${flow:-$repo_root/.e2e/maestro/gate/step-${step}.yaml}"
session_dir="${session_dir:-$repo_root/.tmp/maestro-native-gate-session}"
artifact_dir="${artifact_dir:-$repo_root/.tmp/maestro-native-gate/step-${step}}"
evidence_file="${evidence_file:-$artifact_dir/maestro-evidence.json}"
action_id="${action_id:-step-${step}}"

[[ "$step" =~ ^[123]$ ]] || fail "--step must be 1, 2, or 3"
[[ -n "$device" ]] || fail "MAESTRO_DEVICE must name an available iOS Simulator"
[[ -n "$app_id" ]] || fail "MAESTRO_APP_ID is required"
[[ -n "$app_path" ]] || fail "EXPO_DEV_BUILD_PATH is required"
[[ -d "$app_path" ]] || fail "Expo development build does not exist: $app_path"
[[ -f "$flow" ]] || fail "Maestro flow does not exist: $flow"
command -v maestro >/dev/null 2>&1 || fail "maestro CLI is not installed"
command -v xcrun >/dev/null 2>&1 || fail "xcrun is not installed"
command -v python3 >/dev/null 2>&1 || fail "python3 is not installed"

[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required; no database substitute is allowed"
[[ "$DATABASE_URL" == *holocron_nonprod* ]] || fail "DATABASE_URL must target holocron_nonprod"
[[ -n "${FLEET_URL:-}" ]] || fail "FLEET_URL is required; no inference substitute is allowed"
[[ -n "${EXPO_PUBLIC_PLATFORM_URL:-${PLATFORM_URL:-}}" ]] || fail "platform URL is required"
[[ -n "${EXPO_PUBLIC_RN_API_KEY:-}" ]] || fail "EXPO_PUBLIC_RN_API_KEY is required"
[[ "${EXPO_PUBLIC_REFERENCE_FLOW:-true}" == "true" ]] || fail "EXPO_PUBLIC_REFERENCE_FLOW must be true"
[[ -n "${ZERO_ADMIN_PASSWORD:-}" ]] || fail "ZERO_ADMIN_PASSWORD is required"

litestream_executable="${ZERO_LITESTREAM_EXECUTABLE:-}"
litestream_config="${ZERO_LITESTREAM_CONFIG:-$repo_root/scripts/e2e/zero-cache-litestream.yml}"
[[ -x "$litestream_executable" ]] || fail "ZERO_LITESTREAM_EXECUTABLE is required and must be executable"
[[ -n "${ZERO_LITESTREAM_BACKUP_URL:-}" ]] || fail "ZERO_LITESTREAM_BACKUP_URL is required"
[[ -f "$litestream_config" ]] || fail "ZERO_LITESTREAM_CONFIG does not exist: $litestream_config"

simulator_json="$(xcrun simctl list devices available --json)" \
  || fail "could not query available iOS Simulators as JSON"
device_udid="$(python3 -c '
import json, sys
data = json.load(sys.stdin)
matches = [d for devices in data["devices"].values() for d in devices
           if d.get("name") == sys.argv[1] and d.get("isAvailable") is True]
if len(matches) != 1 or not matches[0].get("udid"):
    raise SystemExit(1)
print(matches[0]["udid"])
' "$device" <<<"$simulator_json")" \
  || fail "could not resolve one exact available UDID for named simulator: $device"
[[ "$device_udid" =~ ^[0-9A-Fa-f-]{36}$ ]] || fail "resolved simulator UDID is invalid"

if [[ "$mode" == "--check" ]]; then
  jq -nc --arg device "$device" --arg udid "$device_udid" --arg flow "$flow" \
    --arg app "$app_path" '{ok:true,driver:"maestro-ios",device:$device,device_udid:$udid,flow:$flow,app:$app}'
  exit 0
fi

mkdir -p "$artifact_dir" "$session_dir"
session_file="$session_dir/session.json"
zero_port="${ZERO_PORT:-4848}"
zero_pid=""
session_id="native-maestro-$(date -u +%Y%m%dT%H%M%SZ)-$$"

kill_process_tree() {
  local pid="$1" signal="${2:-TERM}" child
  [[ "$pid" =~ ^[0-9]+$ ]] || return 0
  while read -r child; do
    [[ "$child" =~ ^[0-9]+$ ]] || continue
    kill_process_tree "$child" "$signal"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  kill -"$signal" "$pid" 2>/dev/null || true
}

stop_zero() {
  if [[ -n "$zero_pid" ]]; then
    kill_process_tree "$zero_pid" TERM
    wait "$zero_pid" 2>/dev/null || true
    zero_pid=""
  fi
}

cleanup_session() {
  local recorded_pid=""
  if [[ -s "$session_file" ]]; then
    recorded_pid="$(jq -r '.zero_pid // empty' "$session_file" 2>/dev/null || true)"
  fi
  if [[ "$recorded_pid" =~ ^[0-9]+$ ]]; then
    kill_process_tree "$recorded_pid" TERM
    sleep 1
    kill -0 "$recorded_pid" 2>/dev/null && kill_process_tree "$recorded_pid" KILL || true
  fi
  rm -f "$session_file"
}

if [[ "$step" == "1" ]]; then
  cleanup_session
  rm -rf "$session_dir"/zero-data
  mkdir -p "$session_dir"/zero-data
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
    >"$session_dir/zero-cache.log" 2>&1 &
  zero_pid=$!
  for _ in {1..180}; do
    if ! kill -0 "$zero_pid" 2>/dev/null; then
      tail -80 "$session_dir/zero-cache.log" >&2 || true
      fail "zero-cache exited before becoming ready"
    fi
    curl --silent --fail --max-time 1 "http://127.0.0.1:${zero_port}/keepalive" >/dev/null 2>&1 && break
    sleep 1
  done
  curl --silent --fail --max-time 1 "http://127.0.0.1:${zero_port}/keepalive" >/dev/null 2>&1 \
    || fail "zero-cache did not become ready"
  booted="$(xcrun simctl list devices | awk -v wanted="$device" '$0 ~ wanted { print ($0 ~ /Booted/) }')"
  [[ "$booted" == "1" ]] || xcrun simctl boot "$device" >"$artifact_dir/simctl-boot.log" 2>&1 || true
  xcrun simctl bootstatus "$device" -b >"$artifact_dir/simctl-bootstatus.txt"
  xcrun simctl terminate "$device" "$app_id" >"$artifact_dir/simctl-terminate.txt" 2>&1 || true
  xcrun simctl uninstall "$device" "$app_id" >"$artifact_dir/simctl-uninstall.txt" 2>&1 || true
  xcrun simctl install "$device" "$app_path" >"$artifact_dir/simctl-install.txt" 2>&1
  printf '%s\n' "installed: $app_path" >>"$artifact_dir/simctl-install.txt"
  jq -n --arg id "$session_id" --arg device "$device" --arg udid "$device_udid" \
    --arg app "$app_id" --argjson pid "$zero_pid" --arg artifact "$artifact_dir" \
    '{session_id:$id,device_name:$device,device_udid:$udid,app_id:$app,zero_pid:$pid,artifact_dir:$artifact,status:"active"}' \
    >"$session_file"
else
  [[ -s "$session_file" ]] || fail "native Maestro session is missing; run step 1 first"
  session_device="$(jq -r '.device_name // empty' "$session_file")"
  session_udid="$(jq -r '.device_udid // empty' "$session_file")"
  session_pid="$(jq -r '.zero_pid // empty' "$session_file")"
  [[ "$session_device" == "$device" && "$session_udid" == "$device_udid" ]] \
    || fail "native session device identity does not match the named simulator"
  [[ "$session_pid" =~ ^[0-9]+$ ]] && kill -0 "$session_pid" 2>/dev/null \
    || fail "native session zero-cache is not alive"
  zero_pid="$session_pid"
  session_id="$(jq -r '.session_id' "$session_file")"
fi

video="$artifact_dir/step-${step}.mov"
rm -f "$video" "$artifact_dir"/.mov.sb-* 2>/dev/null || true
xcrun simctl io "$device" recordVideo --codec=h264 -f "$video" >"$artifact_dir/video.log" 2>&1 &
video_pid=$!
set +e
maestro --device "$device_udid" test "$flow" \
  --format JUNIT \
  --output "$artifact_dir/junit.xml" \
  --debug-output "$artifact_dir/debug" \
  --test-output-dir "$artifact_dir/test-output" \
  -e MAESTRO_APP_ID="$app_id" \
  -e PLATFORM_URL="${EXPO_PUBLIC_PLATFORM_URL:-${PLATFORM_URL}}" \
  -e E2E_ARTIFACT_DIR="$artifact_dir" \
  >"$artifact_dir/maestro.log" 2>&1
maestro_rc=$?
set -e
kill -INT "$video_pid" 2>/dev/null || true
wait "$video_pid" 2>/dev/null || true
sleep 1
xcrun simctl io "$device" screenshot "$artifact_dir/screenshot.png" >/dev/null 2>&1 || true

junit_failures="-1"
if [[ -s "$artifact_dir/junit.xml" ]]; then
  junit_failures="$(sed -En 's/.*<testsuite[^>]* failures="([0-9]+)".*/\1/p' "$artifact_dir/junit.xml" | head -1)"
  [[ "$junit_failures" =~ ^[0-9]+$ ]] || junit_failures="-1"
fi
video_bytes=0
[[ -s "$video" ]] && video_bytes="$(wc -c <"$video" | tr -d ' ')"
flow_sha256="$(shasum -a 256 "$flow" | awk '{print $1}')"
mkdir -p "$(dirname "$evidence_file")"
jq -n \
  --arg driver "maestro-ios" --arg action "$action_id" --arg flow "$flow" \
  --arg flow_sha "$flow_sha256" --arg device "$device" --arg udid "$device_udid" \
  --arg app "$app_id" --arg session "$session_id" --arg junit "$artifact_dir/junit.xml" \
  --arg screenshot "$artifact_dir/screenshot.png" --arg video "$video" \
  --arg log "$artifact_dir/maestro.log" --argjson exit_code "$maestro_rc" \
  --argjson junit_failures "$junit_failures" --argjson video_bytes "$video_bytes" \
  --argjson screenshot_bytes "$(wc -c <"$artifact_dir/screenshot.png" 2>/dev/null | tr -d ' ' || echo 0)" \
  '{version:1,driver:$driver,action_id:$action,action_count:1,flow:$flow,flow_sha256:$flow_sha,
    device_name:$device,device_udid:$udid,app_id:$app,session_id:$session,executed:true,
    maestro_exit_code:$exit_code,junit_path:$junit,screenshot_path:$screenshot,video_path:$video,
    log_path:$log,junit_failures:$junit_failures,screenshot_bytes:$screenshot_bytes,video_bytes:$video_bytes,
    observed_at:(now|todateiso8601)}' >"$evidence_file.tmp"
mv -f "$evidence_file.tmp" "$evidence_file"
cp -f "$evidence_file" "$artifact_dir/maestro-evidence.json"

if [[ "$step" == "3" || "$maestro_rc" != "0" ]]; then
  cleanup_session
fi
exit "$maestro_rc"
