# GATE-FIX-004 — Gate step 3 assertion must not self-match literal_cmd echo
> Status: ⬜ Pending
> Sprint: [Sprint 23](./SPRINT.md)
> Agent: devops-engineer
> Reviewer: code-reviewer
> Estimate: 45 min
> Type: CONFIG
> Priority: P0
> Proposed By: kb-run-human-tests (verified fail `20260723T061322Z`)
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome
Step 3 `expect_log_regex` cannot pass solely because success tokens appear in the `# literal_cmd:` echo line. Pass requires **body-level** proof of unprobed refuse (`PROBE_REQUIRED_FOR_VALIDATED` in arm A response body) and probed accept (`"ok":true` in arm B response body), with any summary success token that is **not** a contiguous substring of the `# literal_cmd:` line (split-construct, as with step 2 `NO_WIP_IN_BURST`). Fail closed with **`exit 1`** when the dual claim is not met so `expected_exit=0` cannot greenwash.

## Evidence (immutable)
- Run: `20260723T061322Z` · step 3 recorded **pass** but functional claim **not** proven
- `.gate-evidence/20260723T061322Z/step3.log` line 2: `# literal_cmd: … then echo 'STEP3_VERDICT=refused_then_accepted' …`
- Same log real output: `STEP3_VERDICT=other` (both arms `MISSION_NOT_FOUND` after reseed)
- Verifier recomputes pass because the success token is present in the command echo (`gate-verification.json` annotation: inherited false positive)
- **Self-match surface in current literal_cmd** (all continuous in the echo line):
  1. `STEP3_VERDICT=refused_then_accepted` (current sole `expect_log_regex`)
  2. bare `PROBE_REQUIRED_FOR_VALIDATED` (appears in comment/`grep -q` text)
  3. bare `"ok":true` (appears in comment/`grep -q` text)
- Preserve `.gate-evidence/20260723T061322Z/**` untouched

## Critical Constraints
### MUST
- MUST rewrite step 3 assertion so `re.search(expect_log_regex, echo_only)` is **False** when `echo_only` is only the `# literal_cmd:` line
- MUST require evidence of **both**: unprobed refuse body containing `PROBE_REQUIRED_FOR_VALIDATED` **and** probed accept body containing ok:true — evaluated against **captured arm response variables / body files**, not against the whole log that includes the command echo
- MUST split-construct any summary success token (e.g. `P1=STEP3_PROOF=refused; P2=_then_ok` → `printf`) **or** set `expect_log_regex` only to fragments that do **not** appear continuously in `literal_cmd`
- MUST fail closed: if dual claim fails, print a split fail marker (e.g. `NO_STEP3` + `_DUAL`) and **`exit 1`** (so `expected_exit=0` cannot pass alone)
- MUST keep `expected_exit=0` for the success path (failure path is exit 1 from the script, not a flipped expected_exit)
### NEVER
- NEVER leave bare `STEP3_VERDICT=refused_then_accepted` as both the success echo and the sole `expect_log_regex` while that string remains contiguous in `literal_cmd`
- NEVER set `expect_log_regex` to bare `PROBE_REQUIRED_FOR_VALIDATED` or bare `"ok":true` / `"ok"\s*:\s*true` while those strings remain contiguous in the `# literal_cmd:` echo (same self-match class)
- NEVER change product source or migrations
- NEVER treat `MISSION_NOT_FOUND` on both arms as dual-claim success
### STRICTLY
- STRICTLY gate-plan step 3 only (+ optional GATE-RESULTS notes / `.tmp/GATE-FIX-004/**`)
- Coordinate with GATE-FIX-003: step 3 must use fresh runs + real probe readiness, not vanished UUIDs

## Specification
- **Objective:** Close step 3 false-positive self-match; make assertion body-honest.
- **Success state:** Echo-only evaluation fails; a real dual-response success produces pass (exit 0 + non-self-matching token / body proof); a dual-response failure exits 1 and does not satisfy `expected_exit=0`.
- **Recommended pattern (mirror step 2):**
  1. Capture arm A/B JSON bodies into variables or `/tmp` files
  2. Grep bodies for refuse code + accept ok
  3. On success: `printf` a split-constructed token that is **not** a contiguous substring of `literal_cmd`
  4. On failure: print split fail marker + `exit 1`
  5. Set `expect_log_regex` to that success token (or a body-only fragment proven non-self-matching by AC-1 VERIFY)

## Acceptance Criteria
### AC-1: Assertion fails on command-echo alone [PRIMARY]
**GIVEN:** step 3 `literal_cmd` is echoed as `# literal_cmd: …`  
**WHEN:** `expect_log_regex` is applied to that echo line only  
**THEN:** no match  
**VERIFY:** `python3 -c 'import re,json; p=json.load(open("gate-plan.json")); s=[x for x in p["steps"] if x["n"]==3][0]; r=s["assertion"]["expect_log_regex"]; echo="# literal_cmd: "+s["literal_cmd"]+"\n"; assert re.search(r, echo) is None, r'`
**TEST_TIER:** integration · **FLOW_REF:** UC-SVC-05

### AC-2: Body-level dual claim (refuse then accept)
**GIVEN:** fresh unprobed + probed advance responses (after GATE-FIX-003 run discovery + probe readiness)  
**WHEN:** step 3 runs against real services  
**THEN:** log contains body-level `PROBE_REQUIRED_FOR_VALIDATED` from arm A and body-level ok:true from arm B; success path exit 0; neither arm is solely `MISSION_NOT_FOUND` for the dual claim  
**VERIFY:** Fresh evidence log; dual greps on **response bodies** (not only summary token / command text)

### AC-3: Fail path exits non-zero
**GIVEN:** a simulated or real failure of the dual claim  
**WHEN:** the fail branch runs  
**THEN:** process exits **1** (and may emit a split fail marker that is also non-self-matching if used in `expect_not_log_regex`)  
**VERIFY:** `bash -lc` unit of the fail branch returns exit code 1

### AC-4: Historical step3.log preserved
**GIVEN:** `.gate-evidence/20260723T061322Z/step3.log`  
**WHEN:** task lands  
**THEN:** file still shows self-match hazard + `STEP3_VERDICT=other`  
**VERIFY:** `test -f .gate-evidence/20260723T061322Z/step3.log && grep -q 'STEP3_VERDICT=other' .gate-evidence/20260723T061322Z/step3.log`

## Test Criteria
| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | expect_log_regex fails on echo-only | AC-1 | AC-1 VERIFY |
| TC-2 | Fresh dual body proof on success | AC-2 | AC-2 VERIFY |
| TC-3 | Fail branch exit 1 | AC-3 | AC-3 VERIFY |
| TC-4 | 061322Z step3.log preserved | AC-4 | AC-4 VERIFY |

## Guardrails
**WRITE-ALLOWED:** `gate-plan.json` (step 3 literal_cmd + assertion + method_note); optional `GATE-RESULTS.md`; `.tmp/GATE-FIX-004/**`  
**WRITE-PROHIBITED:** `services/**`, migrations, `.gate-evidence/20260723T061322Z/**`

## Agent Instructions
1. Mirror step 2 pattern: split-construct success/fail tokens; evaluate product codes on **captured bodies**, not the command echo.
2. Prefer asserting success via a non-self-matching summary token (`expect_log_regex`) plus in-script dual body checks that gate the exit code. Optional: `expect_not_log_regex` for the split fail marker.
3. Do **not** “fix” the self-match by switching `expect_log_regex` to bare `PROBE_REQUIRED_FOR_VALIDATED` or bare `"ok":true` while those remain in comments/`grep -q` strings inside `literal_cmd`.
4. If GATE-FIX-003 lands first, build on its fresh-run variables + probe poll; if combined, implement both in one gate-plan rewrite but keep AC evidence separable.
5. Do not claim pass without fresh dual-response evidence against live services.

## Verification Gates
1. AC-1…AC-4 VERIFY
2. Diff ⊆ writeAllowed
3. No product paths

## Dependencies
- depends_on: GATE-FIX-003 (fresh runs + probe readiness) — may be co-implemented in one wave if both are CONFIG-only on `gate-plan.json`, but AC-2 VERIFY requires live runs
- blocks: honest human-gate re-pass for step 3

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-004",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s23_061322_step3_self_match": {
      "description": "step3.log: pass via literal_cmd echo of STEP3_VERDICT=refused_then_accepted while real output is other; also bare PROBE_REQUIRED_FOR_VALIDATED and ok:true appear in literal_cmd",
      "seed_method": "file_artifact",
      "records": [".gate-evidence/20260723T061322Z/step3.log"]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN echo-only log WHEN expect_log_regex applied THEN no match",
      "verify": "python re.search false on # literal_cmd only",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan+file_artifact",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["self-matching success token in literal_cmd", "bare PROBE_REQUIRED_FOR_VALIDATED as sole regex while in cmd", "bare ok:true as sole regex while in cmd", "stub", "empty"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [{
          "start_ref": "s23_061322_step3_self_match",
          "action": { "actor": "operator", "steps": ["Evaluate expect_log_regex against # literal_cmd line only"] },
          "end_state": {
            "must_observe": ["no match on echo-only"],
            "must_not_observe": ["pass solely because STEP3_VERDICT=refused_then_accepted appears in literal_cmd", "pass solely because PROBE_REQUIRED_FOR_VALIDATED appears in literal_cmd", "pass solely because ok:true appears in literal_cmd"]
          }
        }]
      }
    },
    { "id": "AC-2", "type": "acceptance_criterion", "description": "Body-level refuse then accept (not MISSION_NOT_FOUND-only)", "verify": "fresh dual body greps" },
    { "id": "AC-3", "type": "acceptance_criterion", "description": "Fail branch exit 1", "verify": "bash -lc fail branch exit 1" },
    { "id": "AC-4", "type": "acceptance_criterion", "description": "Archive preserved", "verify": "test -f step3.log" },
    { "id": "TC-1", "type": "test_criterion", "description": "Echo-only fails", "maps_to_ac": "AC-1", "verify": "AC-1 VERIFY" },
    { "id": "TC-2", "type": "test_criterion", "description": "Fresh dual body", "maps_to_ac": "AC-2", "verify": "AC-2 VERIFY" },
    { "id": "TC-3", "type": "test_criterion", "description": "Fail exit 1", "maps_to_ac": "AC-3", "verify": "AC-3 VERIFY" },
    { "id": "TC-4", "type": "test_criterion", "description": "Archive ok", "maps_to_ac": "AC-4", "verify": "AC-4 VERIFY" }
  ]
}
-->
