#!/usr/bin/env bash
# exec-step.sh <step_n> <full_evidence_dir_relative>
set -uo pipefail
N="$1"
SPRINT_DIR=".spec/prds/mk6-migration/tasks/sprint-23-deterministic-human-gate-steering-and-fulcrum-seams"
PLAN="$SPRINT_DIR/gate-plan.json"
EVIDENCE_DIR="$2"

CMD_JSON=$(python3 -c "import json; p=json.load(open('$PLAN')); print([s for s in p['steps'] if s['n']==$N][0]['literal_cmd'])")
ASSERT_JSON=$(python3 -c "import json; p=json.load(open('$PLAN')); print(json.dumps([s for s in p['steps'] if s['n']==$N][0]['assertion']))")

CMD_SHA=$(printf '%s' "$CMD_JSON" | sha256sum | awk '{print $1}')

echo "cmd_sha=$CMD_SHA" > "$EVIDENCE_DIR/step${N}.log"
echo "assertion=$ASSERT_JSON" >> "$EVIDENCE_DIR/step${N}.log"
echo "---EXEC step${N} $(date -u +%Y-%m-%dT%H:%M:%SZ)---" >> "$EVIDENCE_DIR/step${N}.log"

set +e
bash -c "$CMD_JSON" >> "$EVIDENCE_DIR/step${N}.log" 2>&1
EXIT_CODE=$?
set -e

echo "$EXIT_CODE" > "$EVIDENCE_DIR/step${N}.exit"
printf '%s\n' "$ASSERT_JSON" > "$EVIDENCE_DIR/step${N}.assertion.json"

echo "STEP${N}_EXIT=$EXIT_CODE CMD_SHA=$CMD_SHA"
