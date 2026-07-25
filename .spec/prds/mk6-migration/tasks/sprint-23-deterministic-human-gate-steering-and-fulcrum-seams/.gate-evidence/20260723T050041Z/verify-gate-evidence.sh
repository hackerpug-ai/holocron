#!/usr/bin/env bash
# verify-gate-evidence.sh — deterministic recompute of the verdict from raw evidence.
# Usage: verify-gate-evidence.sh <gate-results.json> <gate-plan.json> <evidence_dir>
# Recomputes each step's result from the raw .log + .exit + .assertion.json files,
# independently of the agent's claim. Writes gate-verification.json.
set -euo pipefail

RESULTS_JSON="$1"
PLAN_JSON="$2"
EVIDENCE_DIR="$3"
SPRINT_DIR="$(dirname "$PLAN_JSON")"

python3 - "$RESULTS_JSON" "$PLAN_JSON" "$EVIDENCE_DIR" "$SPRINT_DIR" <<'PY_EOF'
import json, re, hashlib, sys, os

results_path, plan_path, evidence_dir, sprint_dir = sys.argv[1:5]

with open(plan_path) as f:
    plan = json.load(f)
with open(results_path) as f:
    results = json.load(f)

steps_planned = plan["planned_steps"]
plan_steps = {s["n"]: s for s in plan["steps"]}

# D7: check for wholesale test-suite invocations
TEST_RUNNER_PATTERNS = [
    r'\bbun\s+run\s+e2e:', r'\bpytest\b', r'\bnpm\s+test\b',
    r'\bcargo\s+test\b', r'\bnpx\s+playwright\s+test\b', r'\bcypress\s+run\b',
]

discrepancies = []
recomputed_steps = {}

for n in sorted(plan_steps.keys()):
    ps = plan_steps[n]
    literal_cmd = ps.get("literal_cmd", "")
    assertion = ps.get("assertion", {})

    log_path = os.path.join(evidence_dir, f"step{n}.log")
    exit_path = os.path.join(evidence_dir, f"step{n}.exit")
    assertion_file = os.path.join(evidence_dir, f"step{n}.assertion.json")

    # Check evidence exists
    if not os.path.exists(log_path) or not os.path.exists(exit_path):
        discrepancies.append({
            "step": n, "kind": "dropped-step",
            "claimed": "pass",
            "recomputed": "fail",
            "evidence_pointer": f"missing {log_path} or {exit_path}"
        })
        recomputed_steps[n] = {"result": "fail", "reason": "missing-evidence"}
        continue

    with open(log_path) as f:
        log_text = f.read()
    with open(exit_path) as f:
        exit_code = int(f.read().strip())

    # D2: cmd_sha fidelity — recompute from literal_cmd and check it's in the log
    recomputed_sha = hashlib.sha256(literal_cmd.encode()).hexdigest()
    if f"cmd_sha={recomputed_sha}" not in log_text:
        discrepancies.append({
            "step": n, "kind": "cmd-fidelity-fail",
            "claimed": "pass",
            "recomputed": "fail",
            "evidence_pointer": f"step{n}.log does not contain cmd_sha={recomputed_sha}"
        })

    # D7: wholesale test-suite detection
    is_test_runner = any(re.search(p, literal_cmd) for p in TEST_RUNNER_PATTERNS)
    if is_test_runner:
        discrepancies.append({
            "step": n, "kind": "test-runner-invocation",
            "claimed": "pass",
            "recomputed": "blocked",
            "evidence_pointer": f"literal_cmd matches test-runner pattern: {literal_cmd[:80]}"
        })
        recomputed_steps[n] = {"result": "blocked", "reason": "test-runner-invocation"}
        continue

    # Recompute assertion
    expected_exit = assertion.get("expected_exit", 0)
    exit_ok = (exit_code == expected_exit)

    expect_re = assertion.get("expect_log_regex", "")
    expect_not_re = assertion.get("expect_not_log_regex", "")
    regex_ok = True
    regex_not_ok = True
    if expect_re:
        regex_ok = re.search(expect_re, log_text) is not None
    if expect_not_re:
        regex_not_ok = re.search(expect_not_re, log_text) is None

    if assertion.get("kind") == "manual":
        result = "manual"
    elif exit_ok and regex_ok and regex_not_ok:
        result = "pass"
    else:
        result = "fail"

    recomputed_steps[n] = {
        "result": result, "exit_ok": exit_ok,
        "regex_ok": regex_ok, "regex_not_ok": regex_not_ok,
        "exit_code": exit_code
    }

    # Compare with claimed result
    claimed_step = None
    for cs in results.get("steps", []):
        if cs["n"] == n:
            claimed_step = cs
            break
    if claimed_step:
        claimed_result = claimed_step.get("result", "")
        if claimed_result != result:
            discrepancies.append({
                "step": n, "kind": "result-mismatch",
                "claimed": claimed_result,
                "recomputed": result,
                "evidence_pointer": f"step{n}.log exit={exit_code} regex_ok={regex_ok} not_regex_ok={regex_not_ok}"
            })

# D1: coverage parity
recomputed_count = len(recomputed_steps)
if recomputed_count != steps_planned:
    discrepancies.append({
        "step": 0, "kind": "coverage-count",
        "claimed": steps_planned,
        "recomputed": recomputed_count,
        "evidence_pointer": f"planned {steps_planned} vs recomputed {recomputed_count}"
    })

# Recompute verdict
has_fail = any(s["result"] == "fail" for s in recomputed_steps.values())
has_blocked = any(s["result"] in ("blocked", "manual", "wiring_gap") for s in recomputed_steps.values())
if has_blocked:
    recomputed_verdict = "blocked"
elif has_fail:
    recomputed_verdict = "fail"
else:
    recomputed_verdict = "pass"

claimed_verdict = results.get("verdict", "unknown")
verified = (claimed_verdict == recomputed_verdict) and len(discrepancies) == 0

verification = {
    "verified": verified,
    "claimed_verdict": claimed_verdict,
    "recomputed_verdict": recomputed_verdict,
    "steps_planned": steps_planned,
    "steps_recomputed": recomputed_count,
    "discrepancies": discrepancies,
    "method": "verify-gate-evidence.sh:recompute@local",
    "recomputed_steps": recomputed_steps,
    "written_at": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
}

out_path = os.path.join(sprint_dir, "gate-verification.json")
with open(out_path, "w") as f:
    json.dump(verification, f, indent=2)

print(json.dumps(verification, indent=2))
PY_EOF
