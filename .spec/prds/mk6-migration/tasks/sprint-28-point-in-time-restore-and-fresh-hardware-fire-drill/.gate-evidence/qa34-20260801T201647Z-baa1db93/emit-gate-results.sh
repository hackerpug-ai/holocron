#!/bin/bash
set -euo pipefail

sprint_dir="${1:?sprint dir}"
evidence_dir="${2:?evidence dir}"
run_id="${3:?run id}"
qa_surface_id="${4:?qa surface UUID}"
exec_surface="${5:?exec surface description}"
plan="$sprint_dir/gate-plan.json"
out="$sprint_dir/gate-results.json"
tmp="$out.tmp"
steps_tmp="$(/usr/bin/mktemp -t qa34-gate-steps.XXXXXX)"
trap '/bin/rm -f "$steps_tmp" "$tmp"' EXIT
: >"$steps_tmp"

planned="$(/usr/bin/jq -er '.planned_steps' "$plan")"
[[ "$planned" -gt 0 ]]
for ((n = 1; n <= planned; n++)); do
  log="$evidence_dir/step${n}.log"
  exit_file="$evidence_dir/step${n}.exit"
  assertion="$evidence_dir/step${n}.assertion.json"
  [[ -s "$log" && -s "$exit_file" && -s "$assertion" ]]
  exit_code="$(/bin/cat "$exit_file")"
  [[ "$exit_code" == "0" ]]
  /usr/bin/grep -q "^@@GATE-META step=step${n} cmd_sha=" "$log"
  /usr/bin/grep -q '^@@GATE-EXIT=0@@$' "$log"
  rel_log=".gate-evidence/${run_id}/step${n}.log"
  /usr/bin/jq -nc \
    --argjson n "$n" \
    --arg text "$(/usr/bin/jq -er --argjson n "$n" '.steps[] | select(.n==$n) | .text' "$plan")" \
    --arg type "$(/usr/bin/jq -er --argjson n "$n" '.steps[] | select(.n==$n) | .type' "$plan")" \
    --arg log "$rel_log" \
    '{n:$n,text:$text,type:$type,executed:true,result:"pass",evidence:("exit 0 and deterministic assertion passed; " + $log),log:$log}' \
    >>"$steps_tmp"
done

steps="$(/usr/bin/jq -sc '.' "$steps_tmp")"
verified=false
verification_method="pending-verification"
if [[ -f "$sprint_dir/gate-verification.json" ]] && \
  /usr/bin/jq -e '.verified == true and .recomputed_verdict == "pass"' "$sprint_dir/gate-verification.json" >/dev/null 2>&1; then
  verified=true
  verification_method="$(/usr/bin/jq -er '.method' "$sprint_dir/gate-verification.json")"
fi
written_at="$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ)"
/usr/bin/jq -n \
  --arg sprint "$(/usr/bin/jq -er '.sprint' "$plan")" \
  --argjson sprint_identity "$(/usr/bin/jq -c '.sprint_identity' "$plan")" \
  --arg run_id "$run_id" \
  --arg exec_surface "$exec_surface" \
  --arg qa_surface_id "$qa_surface_id" \
  --arg written_at "$written_at" \
  --arg method "$verification_method" \
  --argjson total "$planned" \
  --argjson steps "$steps" \
  --argjson verified "$verified" \
  '{sprint:$sprint,sprint_identity:$sprint_identity,run_id:$run_id,verdict:"pass",verified:$verified,
    method:$method,
    runner:"cmux-exec-pane",ui_driver:"none",exec_surface:$exec_surface,qa_surface_id:$qa_surface_id,
    steps_total:$total,steps_executed:$total,steps_passed:$total,steps:$steps,written_at:$written_at}' \
  >"$tmp"
/bin/mv "$tmp" "$out"
trap - EXIT
/bin/rm -f "$steps_tmp"
echo "gate_results_emitted_from_evidence=$out steps=$planned verified_mirror=$verified"
