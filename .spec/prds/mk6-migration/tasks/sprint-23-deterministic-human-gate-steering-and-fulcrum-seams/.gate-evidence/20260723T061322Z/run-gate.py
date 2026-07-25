#!/usr/bin/env python3
"""Run every gate-plan.json step through exec-step.sh, byte-identical literal_cmd.

Reads gate-plan.json, calls exec-step.sh per step with the literal_cmd pulled
directly from the plan (no paraphrasing, so cmd_sha matches), and prints a JSON
summary. Each step is run by bash exec-step.sh; env (DATABASE_URL,
FLEET_MANIFEST_PATH, FLEET_URL) is inherited from the exec pane.
"""
import json, os, subprocess, sys, time

SPRINT_DIR="/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-23-deterministic-human-gate-steering-and-fulcrum-seams"
EVIDENCE_DIR=os.path.join(SPRINT_DIR, ".gate-evidence/20260723T061322Z")
PLAN=os.path.join(SPRINT_DIR, "gate-plan.json")
EXEC=os.path.join(EVIDENCE_DIR, "exec-step.sh")

plan=json.load(open(PLAN))
results=[]
for s in plan["steps"]:
    n=s["n"]
    literal=s["literal_cmd"]
    assertion_input=os.path.join(EVIDENCE_DIR, f"step{n}.assertion.input.json")
    # write the assertion input that exec-step.sh's python will read
    with open(assertion_input, "w") as f:
        json.dump(s["assertion"], f)
    print(f"\n=== STEP {n} ====================================================", flush=True)
    print(f"# literal_cmd (len={len(literal)}): {literal[:120]}...", flush=True)
    t0=time.time()
    proc=subprocess.run(
        ["bash", EXEC, str(n), literal, EVIDENCE_DIR, assertion_input, "300"],
        cwd="/Users/inference1/Projects/holocron",
        capture_output=False,
    )
    dur=int((time.time()-t0)*1000)
    aj=os.path.join(EVIDENCE_DIR, f"step{n}.assertion.json")
    assertion_out=json.load(open(aj)) if os.path.exists(aj) else {"result":"missing","cmd_sha":None}
    results.append({
        "n": n, "exec_exit": proc.returncode,
        "result": assertion_out.get("result"),
        "duration_ms": assertion_out.get("duration_ms"),
        "cmd_sha": assertion_out.get("cmd_sha"),
        "exit_ok": assertion_out.get("exit_ok"),
        "regex_ok": assertion_out.get("log_regex_matched"),
        "not_regex_ok": assertion_out.get("log_not_regex_ok"),
    })
    print(f"--- step {n}: exec_exit={proc.returncode} result={assertion_out.get('result')} dur={assertion_out.get('duration_ms')}ms", flush=True)

print("\n=== SUMMARY ====================================================", flush=True)
print(json.dumps(results, indent=2), flush=True)
with open(os.path.join(EVIDENCE_DIR,"runner-summary.json"),"w") as f:
    json.dump(results, f, indent=2)
