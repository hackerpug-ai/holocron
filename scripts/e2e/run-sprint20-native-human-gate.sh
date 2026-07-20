#!/usr/bin/env bash
# Sprint 20 strict kb-run-human-tests adapter.
#
# The first three steps are driven by the shared native Maestro runner, one
# scoped flow per human action. The last three steps are driven through one
# monitored tmux surface by exec-step.sh. This script only assembles claims
# from those raw results; verify-gate-evidence.sh remains the verdict source.
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
sprint_dir="$repo_root/.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow"
plan="$sprint_dir/gate-plan.json"
skill_root="${KB_RUN_HUMAN_TESTS_SKILL_ROOT:-/Users/inference1/.codex/skills/kb-run-human-tests}"
native_runner="$skill_root/references/run-maestro-step.sh"
terminal_runner="$skill_root/references/exec-step.sh"
verifier="$skill_root/references/verify-gate-evidence.sh"
mode="run"
evidence_dir=""
ci_artifact_dir="${E2E_CI_ARTIFACT_DIR:-}"
run_id=""

fail() { echo "sprint20-native-human-gate: $*" >&2; exit 2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) mode="check"; shift ;;
    --run) mode="run"; shift ;;
    --evidence-dir) evidence_dir="${2:-}"; shift 2 ;;
    --ci-artifact-dir) ci_artifact_dir="${2:-}"; shift 2 ;;
    --run-id) run_id="${2:-}"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) fail "unknown argument: $1" ;;
  esac
done

command -v jq >/dev/null 2>&1 || fail "jq is required"
[[ -f "$plan" ]] || fail "gate plan is missing: $plan"
[[ -x "$native_runner" ]] || fail "shared native runner is missing or not executable: $native_runner"
[[ -x "$terminal_runner" ]] || fail "shared terminal runner is missing or not executable: $terminal_runner"
[[ -x "$verifier" ]] || fail "shared evidence verifier is missing or not executable: $verifier"

if [[ "$mode" == "check" ]]; then
  command -v python3 >/dev/null 2>&1 || fail "python3 is required"
  command -v tmux >/dev/null 2>&1 || fail "tmux is required"
  jq -e '
    .planned_steps == 6 and
    .ui_driver_resolution.resolved_driver == "maestro-ios" and
    ([.steps[0:3][] | .type == "native-ui" and .native.driver == "maestro-ios" and .native.action_count == 1] | all)
  ' "$plan" >/dev/null || fail "gate plan does not declare three explicit one-action Maestro steps"
  jq -nc --arg plan "$plan" --arg driver maestro-ios --arg skill "$skill_root" \
    '{ok:true,plan:$plan,driver:$driver,shared_skill_root:$skill}'
  exit 0
fi

[[ -n "$ci_artifact_dir" ]] || fail "--ci-artifact-dir or E2E_CI_ARTIFACT_DIR is required"
[[ -d "$ci_artifact_dir" ]] || fail "CI artifact directory does not exist: $ci_artifact_dir"
run_id="${run_id:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
evidence_dir="${evidence_dir:-$sprint_dir/.gate-evidence/native-$run_id}"
mkdir -p "$evidence_dir"
export E2E_CI_ARTIFACT_DIR="$ci_artifact_dir"

# Capstone's offline replay must bind to the exact tested source SHA captured
# by CI. Missing provenance is intentionally not repaired here; capstone then
# fails closed instead of silently treating the local checkout as tested.
if [[ -z "${EXPECTED_TESTED_SHA:-}" && -s "$ci_artifact_dir/ci-run-provenance.json" ]]; then
  EXPECTED_TESTED_SHA="$(jq -r '.tested_sha // .head_sha // empty' "$ci_artifact_dir/ci-run-provenance.json")"
  export EXPECTED_TESTED_SHA
fi

steps_file="$evidence_dir/step-claims.ndjson"
: >"$steps_file"
session_name="sprint20-human-$run_id"
tmux_started=false
cleanup() {
  if [[ "$tmux_started" == true ]]; then
    tmux kill-session -t "$session_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

record_native_step() {
  local n="$1" step_dir="$evidence_dir/step${1}" result_file rc=0 claim
  mkdir -p "$step_dir"
  result_file="$step_dir/runner-result.json"
  set +e
  bash "$native_runner" "$repo_root" "$plan" "$n" "$evidence_dir" 300 >"$result_file"
  rc=$?
  set -e
  claim="blocked"
  if [[ -s "$result_file" ]] && jq -e . "$result_file" >/dev/null 2>&1; then
    if [[ "$(jq -r '.exit_code // 125' "$result_file")" == "0" && "$(jq -r 'if has("timed_out") then .timed_out else true end' "$result_file")" == "false" ]]; then
      claim="pass"
    else
      claim="fail"
    fi
  elif [[ "$rc" != "0" ]]; then
    claim="fail"
  fi
  jq -nc --argjson n "$n" --arg text "$(jq -r --argjson n "$n" '.steps[] | select(.n == $n) | .text' "$plan")" \
    --arg type native-ui --arg result "$claim" --arg log "$step_dir/step${n}.log" \
    --arg evidence "$step_dir/maestro-evidence.json" --argjson executed "$([[ -s "$result_file" ]] && echo true || echo false)" \
    '{n:$n,text:$text,type:$type,executed:$executed,result:$result,log:$log,native_evidence:$evidence}' >>"$steps_file"
}

record_terminal_step() {
  local n="$1" step_dir="$evidence_dir" result_json cmd assertion output rc=0 claim exit_code timed_out
  cmd="$(jq -r --argjson n "$n" '.steps[] | select(.n == $n) | .literal_cmd' "$plan")"
  assertion="$(jq -c --argjson n "$n" '.steps[] | select(.n == $n) | .assertion' "$plan")"
  set +e
  output="$(bash "$terminal_runner" "tmux:$session_name" "$repo_root" "step${n}" "$cmd" \
    --evidence-dir "$evidence_dir" --timeout 900 --assertion "$assertion")"
  rc=$?
  set -e
  result_json="$evidence_dir/step${n}.runner-result.json"
  printf '%s\n' "$output" >"$result_json"
  exit_code="$(jq -r '.exit // 125' <<<"$output" 2>/dev/null || echo 125)"
  timed_out="$(jq -r 'if has("timed_out") then .timed_out else true end' <<<"$output" 2>/dev/null || echo true)"
  claim="fail"
  [[ "$exit_code" =~ ^[0-9]+$ && "$timed_out" == "false" && "$rc" == "0" ]] && claim="pass"
  jq -nc --argjson n "$n" --arg text "$(jq -r --argjson n "$n" '.steps[] | select(.n == $n) | .text' "$plan")" \
    --arg type terminal --arg result "$claim" --arg log "$evidence_dir/step${n}.log" \
    --argjson executed true '{n:$n,text:$text,type:$type,executed:$executed,result:$result,log:$log}' >>"$steps_file"
}

for n in 1 2 3; do
  record_native_step "$n"
done

# tmux servers retain an environment from when the server was first started;
# inheriting the parent shell is therefore not deterministic. Start the
# monitored shell with the exact variables needed by the literal terminal
# commands, especially the fresh CI artifact binding and tested SHA.
tmux_env_args=("PATH=$PATH" "HOME=$HOME")
for env_name in \
  E2E_CI_ARTIFACT_DIR EXPECTED_TESTED_SHA DATABASE_URL FLEET_URL PLATFORM_URL \
  EXPO_PUBLIC_PLATFORM_URL EXPO_PUBLIC_RN_API_KEY EXPO_PUBLIC_REFERENCE_FLOW \
  EXPO_PUBLIC_REFERENCE_CONVERSATION_ID EXPO_PUBLIC_ZERO_CACHE_URL ZERO_ADMIN_PASSWORD \
  ZERO_CVR_DB ZERO_CHANGE_DB ZERO_PORT ZERO_LITESTREAM_EXECUTABLE \
  ZERO_LITESTREAM_BACKUP_URL ZERO_LITESTREAM_CONFIG MAESTRO_DEVICE MAESTRO_APP_ID \
  EXPO_DEV_BUILD_PATH; do
  if [[ -v "$env_name" ]]; then
    tmux_env_args+=("$env_name=${!env_name}")
  fi
done
tmux new-session -d -s "$session_name" -c "$repo_root" -- env "${tmux_env_args[@]}" "${SHELL:-/bin/zsh}"
tmux_started=true
for n in 4 5 6; do
  record_terminal_step "$n"
done

steps_json="$(jq -sc '.' "$steps_file")"
steps_passed="$(jq '[.[] | select(.result == "pass")] | length' <<<"$steps_json")"
steps_executed="$(jq '[.[] | select(.executed == true)] | length' <<<"$steps_json")"
verdict="fail"
[[ "$steps_passed" == "6" && "$steps_executed" == "6" ]] && verdict="pass"
gate_results="$sprint_dir/gate-results.json"
gate_tmp="$gate_results.tmp.$$"
jq -n \
  --arg sprint "sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow" \
  --arg run_id "$run_id" --arg verdict "$verdict" --arg artifact "$ci_artifact_dir" \
  --arg evidence "$evidence_dir" --arg tested_sha "${EXPECTED_TESTED_SHA:-}" \
  --argjson steps "$steps_json" --argjson total 6 --argjson executed "$steps_executed" --argjson passed "$steps_passed" \
  '{sprint:$sprint,run_id:$run_id,verdict:$verdict,steps_total:$total,steps_executed:$executed,steps_passed:$passed,
    ui_driver:"maestro-ios",exec_surface:"tmux+native-maestro",artifact_dir:$artifact,evidence_dir:$evidence,
    tested_sha:$tested_sha,steps:$steps}' >"$gate_tmp"
mv -f "$gate_tmp" "$gate_results"

verification="$evidence_dir/gate-verification.json"
set +e
bash "$verifier" "$gate_results" "$plan" "$evidence_dir" >"$verification"
verify_rc=$?
set -e
# Keep the verifier's exact JSON at the sprint contract path as well as beside
# the raw evidence. This is a copy of machine output, never a hand-authored
# verdict or a recomputed field.
sprint_verification="$sprint_dir/gate-verification.json"
cp -f "$verification" "$sprint_verification.tmp.$$"
mv -f "$sprint_verification.tmp.$$" "$sprint_verification"

jq -r --arg plan "$plan" --arg gate "$gate_results" --arg verification "$verification" \
  '"# Sprint 20 Native Human Gate\n\n" +
   "- Plan: `" + $plan + "`\n" +
   "- Gate results: `" + $gate + "`\n" +
   "- Deterministic verification: `" + $verification + "`\n" +
   "- Verified: `" + ((.verified // false) | tostring) + "`\n" +
   "- Recomputed verdict: `" + (.recomputed_verdict // "unknown") + "`\n"' \
  "$verification" >"$evidence_dir/GATE-RESULTS.md"

cat "$verification"
exit "$verify_rc"
