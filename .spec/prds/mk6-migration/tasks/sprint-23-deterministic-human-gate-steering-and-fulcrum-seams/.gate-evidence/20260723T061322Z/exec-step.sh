#!/usr/bin/env bash
# exec-step.sh — runs one gate step's literal command, stamps evidence.
# Usage: exec-step.sh <step_n> '<literal_cmd>' <evidence_dir> '<assertion_json>'
# Env (inherited from the exec pane): DATABASE_URL, FLEET_MANIFEST_PATH, FLEET_URL, etc.
set -euo pipefail

STEP_N="$1"
LITERAL_CMD="$2"
EVIDENCE_DIR="$3"
ASSERTION_JSON="$4"
TIMEOUT_S="${5:-300}"

LOG="${EVIDENCE_DIR}/step${STEP_N}.log"
EXIT_FILE="${EVIDENCE_DIR}/step${STEP_N}.exit"
ASSERTION_FILE="${EVIDENCE_DIR}/step${STEP_N}.assertion.json"
CMD_FILE="${EVIDENCE_DIR}/step${STEP_N}.command.sh"

# Compute cmd_sha (SHA-256 of the literal command string, byte-identical to gate-plan.json)
CMD_SHA=$(printf '%s' "$LITERAL_CMD" | shasum -a 256 | awk '{print $1}')

# Write the exact command to a file for audit
cat > "$CMD_FILE" <<CMD_EOF
#!/usr/bin/env bash
# @@GATE-META step=${STEP_N} cmd_sha=${CMD_SHA}@@
# Literal command (byte-identical to gate-plan.json step.literal_cmd):
${LITERAL_CMD}
CMD_EOF
chmod +x "$CMD_FILE"

# Write the GATE-META header to the log
echo "@@GATE-META step=${STEP_N} cmd_sha=${CMD_SHA}@@" > "$LOG"
echo "# literal_cmd: ${LITERAL_CMD}" >> "$LOG"
echo "# started_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
echo "---" >> "$LOG"

# Run the literal command with timeout, tee-ing output to the log
START_MS=$(python3 -c 'import time; print(int(time.time()*1000))')
set +e
( eval "$LITERAL_CMD" ) 2>&1 | tee -a "$LOG"
EXIT_CODE=${PIPESTATUS[0]}
set -e

END_MS=$(python3 -c 'import time; print(int(time.time()*1000))')
DURATION_MS=$((END_MS - START_MS))

# Write exit code trailer
echo "---" >> "$LOG"
echo "@@GATE-EXIT=${EXIT_CODE}@@" >> "$LOG"
echo "$EXIT_CODE" > "$EXIT_FILE"

# Evaluate assertion
python3 - "$ASSERTION_JSON" "$LOG" "$EXIT_CODE" "$ASSERTION_FILE" "$DURATION_MS" "$CMD_SHA" <<'PY_EOF'
import json, re, sys, os

assertion_path, log_path, exit_str, out_path, dur_ms, cmd_sha = sys.argv[1:7]
expected_exit = int(exit_str)

with open(assertion_path) as f:
    assertion = json.load(f)

with open(log_path) as f:
    log_text = f.read()

exit_ok = (expected_exit == int(exit_str))

expect_re = assertion.get("expect_log_regex", "")
expect_not_re = assertion.get("expect_not_log_regex", "")

regex_ok = True
regex_not_ok = True
if expect_re:
    regex_ok = re.search(expect_re, log_text) is not None
if expect_not_re:
    regex_not_ok = re.search(expect_not_re, log_text) is None

result = "pass" if (exit_ok and regex_ok and regex_not_ok) else "fail"

details = {
    "expected_exit": expected_exit,
    "actual_exit": int(exit_str),
    "exit_ok": exit_ok,
    "expect_log_regex": expect_re,
    "log_regex_matched": regex_ok,
    "expect_not_log_regex": expect_not_re,
    "log_not_regex_ok": regex_not_ok,
    "result": result,
    "duration_ms": int(dur_ms),
    "cmd_sha": cmd_sha,
}

with open(out_path, "w") as f:
    json.dump(details, f, indent=2)

print(json.dumps(details))
PY_EOF

echo ""
echo "STEP${STEP_N}: exit=${EXIT_CODE} result=$(python3 -c "import json; print(json.load(open('${ASSERTION_FILE}'))['result'])") duration_ms=${DURATION_MS}"
