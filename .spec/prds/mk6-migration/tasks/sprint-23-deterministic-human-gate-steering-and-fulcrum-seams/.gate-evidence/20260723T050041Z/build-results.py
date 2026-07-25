#!/usr/bin/env python3
import json, os
SPRINT_DIR="/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-23-deterministic-human-gate-steering-and-fulcrum-seams"
EVIDENCE_DIR=os.path.join(SPRINT_DIR, ".gate-evidence/20260723T050041Z")
RUN_ID="20260723T050041Z"
plan=json.load(open(os.path.join(SPRINT_DIR,"gate-plan.json")))

DQ='"'
steps=[]
for s in plan["steps"]:
    n=s["n"]
    a=json.load(open(os.path.join(EVIDENCE_DIR, f"step{n}.assertion.json")))
    log_rel=f".gate-evidence/{RUN_ID}/step{n}.log"
    step={
        "n":n, "text":s["text"], "type":s["type"], "method":s["method"],
        "literal_cmd":s["literal_cmd"],
        "executed":True, "result":a["result"],
        "evidence":f"exit={a['actual_exit']} duration_ms={a['duration_ms']} cmd_sha={a['cmd_sha'][:12]}... regex_matched={a['log_regex_matched']} not_regex_ok={a['log_not_regex_ok']}",
        "log":log_rel,
        "duration_ms":a["duration_ms"],
        "cmd_sha":a["cmd_sha"],
    }
    if a["result"]!="pass":
        exp_re = a["expect_log_regex"]
        not_re = a["expect_not_log_regex"] or "(none)"
        # Build the evidence pointer using literal concat to avoid quote-escaping pitfalls
        ep_lines = []
        ep_lines.append(f".gate-evidence/{RUN_ID}/step{n}.log:15 shows {DQ}{DQ}{DQ}assayChallengeDistinct{DQ}{DQ}: true,{DQ}{DQ}{DQ} (with a space after the colon)")
        ep_lines.append(f"assertion regex {DQ}{exp_re}{DQ} has no space -> Python re.search fails.")
        ep_lines.append("Production CLI (bun services/platform/src/cli/holo.ts mission:cycle --json) pretty-prints JSON with a ': ' separator; the gate-plan assertion was authored against compact ':'.")
        ep_lines.append("The functional claim IS satisfied by the same output: assayInstanceId != challengeInstanceId, admission.pureTs=true, supportingAdmitted=1, refutingAdmitted=1.")
        ep_lines.append("Only the byte-exact assertion regex fails (spec drift, not a product defect).")
        step["failure"]={
            "expected":f"exit {a['expected_exit']} AND log matches /{exp_re}/ AND log does NOT match /{not_re}/ (from gate-plan.json step {n} assertion - deterministic)",
            "actual":f"exit={a['actual_exit']} (exit_ok={a['exit_ok']}); regex /{exp_re}/ matched={a['log_regex_matched']}; not_regex /{not_re}/ ok={a['log_not_regex_ok']} (deterministic - extracted from step{n}.assertion.json + step{n}.log)",
            "evidence_pointer":" ".join(ep_lines),
            "root_cause_hypothesis":"HYPOTHESIS: gate-plan.json step 5 assertion.expect_log_regex was authored against compact JSON output (no space after the colon), but the CLI's --json flag pretty-prints with a ': ' separator. The underlying gate behavior (distinct ASSAY/CHALLENGE instances + refuting-claim admission parity) is observably correct in the same log.",
            "remedy_suggestion":"HYPOTHESIS: tighten the regex to /\"assayChallengeDistinct\":\\s*true/ in gate-plan.json (one-character spec fix, no product change) - this is the documented remedy for spec-vs-output drift. Alternative: change the CLI to emit compact JSON (NOT recommended - broader blast radius). Routed to GATE-FIX / the run stage; the qa stage does not modify product source or gate-plan.",
            "remedy_file_guess":"HYPOTHESIS: .spec/prds/mk6-migration/tasks/sprint-23-deterministic-human-gate-steering-and-fulcrum-seams/gate-plan.json:76 (step 5 assertion.expect_log_regex)"
        }
    steps.append(step)

steps_executed=sum(1 for s in steps if s["executed"])
steps_passed=sum(1 for s in steps if s["result"]=="pass")
has_fail=any(s["result"]=="fail" for s in steps)
has_blocked=any(s["result"] in ("blocked","manual","wiring_gap") for s in steps)
verdict = "blocked" if has_blocked else ("fail" if has_fail else "pass")

caveat_step2 = (
    "Step 2 (WIP=1 burst): the literal_cmd's own `grep -l 'WIP_ONE_EXCEEDED'` search string is echoed into "
    f".gate-evidence/{RUN_ID}/step2.log:2, so the assertion regex /WIP_ONE_EXCEEDED/ matches on that command echo - "
    "NOT on actual WIP enforcement. The burst itself returned NO_WIP_IN_BURST with all 6 requests failing "
    "MISSION_RUNTIME_FAILED (a fleet/mission-template runtime error, not a WIP refusal). The deterministic "
    "verifier (verify-gate-evidence.sh) recomputes 'pass' because the regex does appear in the raw log, so "
    "step 2 is recorded as pass per the contract; but the underlying functional claim (concurrent second-build "
    "refused with WIP_ONE_EXCEEDED) is NOT proven by this evidence. Flagged for GATE-FIX: the step 2 literal_cmd "
    "needs a separator between the burst and the assertion grep (so the grep search-string cannot match its own "
    "echo), or the burst needs a fleet endpoint that returns 200 so a real winner row lands and the partial "
    "unique index mission_runs_active_subject_wip_one_uidx actually collides."
)

results={
    "sprint":"sprint-23-deterministic-human-gate-steering-and-fulcrum-seams",
    "sprint_identity":plan["sprint_identity"],
    "run_id":RUN_ID,
    "verdict":verdict,
    "steps_total":len(steps), "steps_executed":steps_executed, "steps_passed":steps_passed,
    "ui_driver":"none",
    "exec_surface":"surface:229 (4561CFB7-7381-44F6-96B1-A7836C53D1F0)",
    "qa_surface_id":"1E01FE24-1BCF-4771-903B-52DF3BD7272A",
    "qa_session_id": os.environ.get("CMUX_SURFACE_ID",""),
    "method_note":"Real cmux exec pane (new-split right of qa surface 1E01FE24...). Each literal_cmd pulled byte-identical from gate-plan.json via run-gate.py (no paraphrasing -> cmd_sha matches D2). Service on :4111 reused as-is (not restarted); env in pane: FLEET_MANIFEST_PATH=/tmp/holocron-fleet-local-valid.json, FLEET_URL=http://127.0.0.1:4546, DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod. Bearer rn-gate-s23 (steps 1-4) is the real API key already configured on the running service. No wholesale test-suite invocation (D7 clean). No product source or migrations modified.",
    "caveats":[caveat_step2],
    "verified": None,
    "steps":steps,
}
tmp=os.path.join(SPRINT_DIR,"gate-results.json.tmp")
with open(tmp,"w") as f: json.dump(results,f,indent=2)
os.replace(tmp, os.path.join(SPRINT_DIR,"gate-results.json"))
print("wrote gate-results.json verdict=",verdict,"steps_passed=",steps_passed,"/",len(steps))
