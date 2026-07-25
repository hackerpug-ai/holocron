#!/usr/bin/env python3
import json, os, hashlib

SP = "/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-23-deterministic-human-gate-steering-and-fulcrum-seams"
EV = SP + "/.gate-evidence/20260723T041043Z"
plan = json.load(open(SP + "/gate-plan.json"))

obs = {
 1:("pass",1070,"HTTP 422 {ok:false, code:UNCITED_KILL_REJECTED} - uncited kill rejected by Postgres trigger enforce_mission_human_gate (0025_deterministic_human_gate.sql:19-33)"),
 2:("pass",1068,"Concurrent burst of 6 identical research creates: 1 winner INSERT landed (ran plan/retrieve) + 5 refused HTTP 403 {code:WIP_ONE_EXCEEDED} by partial unique index mission_runs_active_subject_wip_one_uidx (0025:4-7)"),
 3:("pass",1073,"3a HTTP 403 PROBE_REQUIRED_FOR_VALIDATED (test.echo run has no research.plan@1); 3b HTTP 200 {ok:true, verdict id 019f8d3a...} against run 019f8d2e with committed research.plan@1 -> STEP3_VERDICT=refused_then_accepted"),
 4:("pass",1078,"HTTP 200 {ok:true, eventType:steer, steering id 019f8d38-44ba...} - mid-run steering written; mission:cycle reads it next with no workflow restart"),
 5:("fail",1075,None),
 6:("pass",1077,"5 seams PASS (contract/ledger/gate/role-bindings/publish) + 'Overall: SUFFICIENT - fulcrum can be authored with zero new platform code'"),
}

steps = []
for s in plan["steps"]:
    n = s["n"]; res, dur, evsum = obs[n]
    st = {
        "n": n, "text": s["text"], "type": s["type"], "method": s["method"],
        "executed": True, "result": res,
        "evidence": evsum if evsum else "see failure",
        "log": EV + "/step%d.log" % n,
        "duration_ms": dur,
        "cmd_sha": hashlib.sha256(s["literal_cmd"].encode()).hexdigest(),
    }
    if n == 5:
        st["failure"] = {
            "expected": 'exit 0 and JSON output contains "assayChallengeDistinct":true (distinct ASSAY vs CHALLENGE fleet instance ids) with supporting+refuting claims admitted through the identical pure-TS evidence gate. Assertion spec: expected_exit 0, expect_log_regex "assayChallengeDistinct":true.',
            "actual": "exit 1; `holo mission:cycle` returned {ok:false, code:MISSION_CYCLE_FAILED, error:'Budget limit exceeded (monthly limit). Contact your org admin.'}. The cycle's real assay + challenge fleet model calls were refused HTTP 403 by the local fleet proxy's UPSTREAM LLM provider. A direct curl to http://127.0.0.1:4545/v1/chat/completions returns the identical {error:{message:'Budget limit exceeded (monthly limit)',code:403}}.",
            "evidence_pointer": "step5.log lines 3-7 (MISSION_CYCLE_FAILED JSON) | direct fleet probe: curl :4545/v1/chat/completions -> 403 'Budget limit exceeded (monthly limit)' | proxy /Users/inference1/Projects/rogueone/.tmp/local-loop-fleet-proxy.ts:3 forwards to UPSTREAM_BASE_URL (default 127.0.0.1:8000/v1) and contains NO budget logic - the 403 originates upstream",
            "root_cause_hypothesis": "HYPOTHESIS: environmental, not product. The upstream LLM account behind the local-loop fleet proxy (rogueone project, PID 2239) has exhausted its monthly budget, so mission:cycle cannot obtain any model response for the assay/challenge stages. The mission:cycle deterministic logic (distinct instance ids, pure-TS admission parity) is correct but unexercisable in this environment. Platform handler/trigger code under test in steps 1-4 is unaffected and passed.",
            "remedy_suggestion": "HYPOTHESIS: re-point the fleet proxy at an upstream with available monthly budget (rogueone UPSTREAM_BASE_URL/UPSTREAM_API_KEY), or admin-reset/increase the upstream monthly budget, then re-run /kb-run-human-tests step 5. No holocron platform source change is indicated.",
            "remedy_file_guess": "HYPOTHESIS: none in holocron - the constraint is the fleet upstream config in /Users/inference1/Projects/rogueone/.tmp/local-loop-fleet-proxy.ts (env UPSTREAM_BASE_URL/UPSTREAM_API_KEY), not services/platform/.",
        }
    steps.append(st)

res_obj = {
    "sprint": "sprint-23-deterministic-human-gate-steering-and-fulcrum-seams",
    "sprint_identity": plan["sprint_identity"],
    "run_id": "20260723T041043Z",
    "verdict": "fail",
    "reviewed_sha": "1df9d37a6cba15cd44f235aa1325f577a9b8384d",
    "reviewed_branch": "main",
    "review_note": "QA/review stage: no merge, no push, no branch movement, no product-source mutation. Verdict does not land work - the run stage merges the reviewed commit to main after approval.",
    "blocked_reason": None,
    "blocked_root_cause": "step 5 failed on an ENVIRONMENTAL constraint (exhausted upstream LLM monthly budget behind the local fleet proxy), not a product defect. Classified gate-env-defect (transient).",
    "steps_total": 6, "steps_executed": 6, "steps_passed": 5, "steps_failed": 1,
    "ui_driver": "none",
    "exec_surface": "exec surface:215 (0AEDF4D0-252D-4512-B171-AAC3D3A3448D) | service surface:216 (24C5AA57-F5AB-42E1-BE6F-54C0FCD22EFD)",
    "qa_surface_id": os.environ.get("CMUX_SURFACE_ID", ""),
    "qa_session_id": "",
    "runner": "cmux",
    "evidence_dir": EV,
    "service_log": EV + "/service.log",
    "steps": steps,
}

tmp = SP + "/gate-results.json.tmp"
json.dump(res_obj, open(tmp, "w"), indent=2)
os.replace(tmp, SP + "/gate-results.json")
print("gate-results.json written (verdict=%s, %d/%d passed)" % (res_obj["verdict"], res_obj["steps_passed"], res_obj["steps_total"]))
