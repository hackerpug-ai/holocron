#!/usr/bin/env bash
# run-step.sh <step-number> — execute one gate step via exec-step.sh, reading literal_cmd + assertion
# straight from gate-plan.json (so verify-gate-evidence.sh D2 cmd-fidelity holds byte-for-byte).
set -euo pipefail

SPRINT_DIR="/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-11-scheduler-and-durable-queue"
RUN_ID="$(cat "$SPRINT_DIR/.gate-evidence/.last-run-id")"
EVD="$SPRINT_DIR/.gate-evidence/$RUN_ID"
EXEC_UUID="3B86281D-7B4C-4BB0-933E-A367C6414C41"
EXEC_SH="/Users/inference1/.config/opencode/skills/kb-run-human-tests/references/exec-step.sh"
PLAN="$SPRINT_DIR/gate-plan.json"

STEP_NUM="${1:?step number required}"
IDX=$((STEP_NUM - 1))

CMD="$(jq -r ".steps[$IDX].literal_cmd" "$PLAN")"
ASSERT="$(jq -c ".steps[$IDX].assertion" "$PLAN")"

echo "═══ STEP $STEP_NUM ═══"
echo "CMD: $CMD"
echo "ASSERT: $ASSERT"

# Write assertion to a temp file and pass via --assertion as a string read from file,
# to avoid any shell quoting mangling of the JSON.
ASSERT_FILE="$EVD/.step${STEP_NUM}.assertion.input"
printf '%s' "$ASSERT" > "$ASSERT_FILE"

bash "$EXEC_SH" "$EXEC_UUID" "/Users/inference1/Projects/holocron" "step${STEP_NUM}" "$CMD" \
  --timeout 300 --evidence-dir "$EVD" --assertion "$ASSERT"
