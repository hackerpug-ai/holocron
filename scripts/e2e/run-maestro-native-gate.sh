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
command -v psql >/dev/null 2>&1 || fail "psql is not installed"

[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required; no database substitute is allowed"
[[ "$DATABASE_URL" == *holocron_nonprod* ]] || fail "DATABASE_URL must target holocron_nonprod"
[[ -n "${FLEET_URL:-}" ]] || fail "FLEET_URL is required; no inference substitute is allowed"
[[ -n "${EXPO_PUBLIC_PLATFORM_URL:-${PLATFORM_URL:-}}" ]] || fail "platform URL is required"
[[ -n "${EXPO_PUBLIC_RN_API_KEY:-}" ]] || fail "EXPO_PUBLIC_RN_API_KEY is required"
[[ "${EXPO_PUBLIC_REFERENCE_FLOW:-true}" == "true" ]] || fail "EXPO_PUBLIC_REFERENCE_FLOW must be true"
[[ -n "${ZERO_ADMIN_PASSWORD:-}" ]] || fail "ZERO_ADMIN_PASSWORD is required"

metro_url="${MAESTRO_METRO_URL:-}"
if [[ -z "$metro_url" ]]; then
  metro_host="$(ipconfig getifaddr en1 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || true)"
  [[ -n "$metro_host" ]] || fail "MAESTRO_METRO_URL is required and no reachable LAN interface was found"
  metro_url="http://${metro_host}:8081"
fi
[[ "$metro_url" =~ ^http://[^[:space:]]+:8081$ ]] || fail "MAESTRO_METRO_URL must be an http URL on port 8081"

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
    --arg message "Sprint 20 reference-flow ping ${session_id}" \
    '{session_id:$id,device_name:$device,device_udid:$udid,app_id:$app,zero_pid:$pid,artifact_dir:$artifact,reference_message:$message,status:"active"}' \
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
reference_message="$(jq -r '.reference_message' "$session_file")"

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
  -e MAESTRO_METRO_URL="$metro_url" \
  -e REFERENCE_MESSAGE="$reference_message" \
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
  --arg app "$app_id" --arg session "$session_id" --arg junit "native-artifacts/junit.xml" \
  --arg screenshot "native-artifacts/screenshot.png" --arg video "native-artifacts/step-${step}.mov" \
  --arg log "native-artifacts/maestro.log" --argjson exit_code "$maestro_rc" \
  --argjson junit_failures "$junit_failures" --argjson video_bytes "$video_bytes" \
  --argjson screenshot_bytes "$(wc -c <"$artifact_dir/screenshot.png" 2>/dev/null | tr -d ' ' || echo 0)" \
  '{version:1,driver:$driver,action_id:$action,action_count:1,flow:$flow,flow_sha256:$flow_sha,
    device_name:$device,device_udid:$udid,app_id:$app,session_id:$session,executed:true,
    maestro_exit_code:$exit_code,junit_path:$junit,screenshot_path:$screenshot,video_path:$video,
    log_path:$log,junit_failures:$junit_failures,screenshot_bytes:$screenshot_bytes,video_bytes:$video_bytes,
    observed_at:(now|todateiso8601)}' >"$evidence_file.tmp"
mv -f "$evidence_file.tmp" "$evidence_file"
cp -f "$evidence_file" "$artifact_dir/maestro-evidence.json"

conv_id="${EXPO_PUBLIC_REFERENCE_CONVERSATION_ID:-00000000-0000-0000-0000-000000000020}"
if [[ "$step" == "2" && "$maestro_rc" == "0" ]]; then
  dispatch_row=""
  for _ in {1..240}; do
    dispatch_row="$(psql "$DATABASE_URL" -t -A -F '|' -v conv_id="$conv_id" -v message="$reference_message" 2>/dev/null <<'SQL' || true
select m.session_id, r.status, r.role, m.id
from chat_messages m join chat_runs r on r.id::text=m.session_id
where m.conversation_id=:'conv_id' and m.role='user'
  and r.message=:'message' and r.request_id=('s20-reference-' || :'message') and m.content=:'message'
order by m.created_at desc limit 1;
SQL
)"
    dispatch_status="$(cut -d'|' -f2 <<<"$dispatch_row")"
    [[ "$dispatch_status" == "completed" ]] && break
    sleep 1
  done
  IFS='|' read -r run_id dispatch_status specialist_role user_message_id <<<"$dispatch_row"
  domain_ok=false
  [[ "$run_id" =~ ^[0-9a-fA-F-]{36}$ && "$dispatch_status" == "completed" && -n "$specialist_role" && "$user_message_id" =~ ^[0-9a-fA-F-]{36}$ ]] && domain_ok=true
  jq --arg kind postgres-fleet-completion --argjson ok "$domain_ok" --arg run_id "$run_id" \
    --arg status "$dispatch_status" --arg role "$specialist_role" --arg user_id "$user_message_id" \
    '.domain_evidence={kind:$kind,ok:$ok,run_id:$run_id,fleet_status:$status,specialist_role:$role,postgres_user_message_id:$user_id}' \
    "$evidence_file" >"$evidence_file.tmp" && mv -f "$evidence_file.tmp" "$evidence_file"
  jq --arg run_id "$run_id" '.reference_run_id=$run_id' "$session_file" >"$session_file.tmp" \
    && mv -f "$session_file.tmp" "$session_file"
  cp -f "$evidence_file" "$artifact_dir/maestro-evidence.json"
  [[ "$domain_ok" == "true" ]] || maestro_rc=1
elif [[ "$step" == "3" && "$maestro_rc" == "0" ]]; then
  run_id="$(jq -r '.reference_run_id // empty' "$session_file")"
  pg_row="$(psql "$DATABASE_URL" -t -A -F '|' -c \
    "select id, length(content) from chat_messages where conversation_id='${conv_id}' and role='agent' and session_id='${run_id}' and length(content)>0 order by created_at desc limit 1;" 2>/dev/null || true)"
  IFS='|' read -r pg_agent_id pg_content_len <<<"$pg_row"
  zero_result="$(ZERO_CACHE_URL="http://127.0.0.1:${zero_port}" REFERENCE_CONVERSATION_ID="$conv_id" bun "$repo_root/scripts/e2e/zero-reference-read.ts" 2>/dev/null || true)"
  zero_ok="$(jq -r '.ok // false' <<<"$zero_result" 2>/dev/null || echo false)"
  zero_agent_id="$(jq -r --arg run "$run_id" '.rows[]? | select(.role == "agent" and .session_id == $run and ((.content // "") | length) > 0) | .id' <<<"$zero_result" 2>/dev/null | tail -1 || true)"
  zero_content_len="$(jq -r --arg run "$run_id" '[.rows[]? | select(.role == "agent" and .session_id == $run) | ((.content // "") | length)] | max // 0' <<<"$zero_result" 2>/dev/null || echo 0)"
  domain_ok=false
  [[ "$run_id" =~ ^[0-9a-fA-F-]{36}$ && "$pg_agent_id" =~ ^[0-9a-fA-F-]{36}$ && "$zero_agent_id" == "$pg_agent_id" && "$pg_content_len" =~ ^[1-9][0-9]*$ && "$zero_content_len" =~ ^[1-9][0-9]*$ && "$zero_ok" == "true" ]] && domain_ok=true
  jq --arg kind postgres-zero-agent-match --argjson ok "$domain_ok" --arg run_id "$run_id" \
    --arg pg_id "$pg_agent_id" --arg zero_id "$zero_agent_id" --argjson pg_len "${pg_content_len:-0}" \
    --argjson zero_len "${zero_content_len:-0}" \
    '.domain_evidence={kind:$kind,ok:$ok,run_id:$run_id,postgres_agent_id:$pg_id,zero_agent_id:$zero_id,postgres_content_len:$pg_len,zero_content_len:$zero_len}' \
    "$evidence_file" >"$evidence_file.tmp" && mv -f "$evidence_file.tmp" "$evidence_file"
  cp -f "$evidence_file" "$artifact_dir/maestro-evidence.json"
  [[ "$domain_ok" == "true" ]] || maestro_rc=1
fi

if [[ "$maestro_rc" != "0" ]]; then
  cleanup_session
fi
exit "$maestro_rc"
