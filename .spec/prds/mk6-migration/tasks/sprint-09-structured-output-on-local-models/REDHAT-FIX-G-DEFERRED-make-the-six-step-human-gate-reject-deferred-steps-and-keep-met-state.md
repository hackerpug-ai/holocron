# REDHAT-FIX-G-DEFERRED — Make the six-step human gate reject deferred steps and keep met-state honest

## What this does

The canonical met() condition (jq + python mirror + bash assert) explicitly rejects any sprint with deferred human-gate steps; the sprint-09 sprint-goal-state.json reports honest `met:false`; future sprints cannot claim `met:true` while a gate step is deferred.

Provides: defense-in-depth: the jq condition_cmd is the canonical wall; evaluate_met() is the harness-resident mirror; assert-human-test-verdict.sh is the anti-forgery validator. All three get the explicit steps_deferred == 0 guard so a deferred step can never produce met()==true through any layer..

## Why

- MUST Add an explicit `steps_deferred == 0` guard to the canonical jq `condition_cmd` (met()) in docs/gate-verification.md — both the `[G0.b']` block AND the `harness.gate_loop` mirror block (they MUST stay byte-identical)
- MUST Add a deferred-step guard to `evaluate_met()` in hooks/sprint-completion-gate.py so a sprint-goal-state.json with `human_test.steps_deferred > 0` reports met()==false (BLOCK exit 2) when a completion is claimed
- MUST Add an explicit C-check to references/assert-human-test-verdict.sh that rejects any step with `result == "deferred"` (C5 already catches it via result != "pass", but the explicit check makes the rejection reason legible and future-proof against a state where steps_deferred > 0 but steps_passed == steps_total because someone mis-counted)
- MUST Update the existing sprint-09 sprint-goal-state.json `met` field from `true` to `false` AND set `met_layers.human_test_pass` to `false` — reflecting the honest state until REDHAT-FIX-H4 makes `holo extract:status` real and the gate step 5 is actually run
- MUST Write RED evidence FIRST: a new test in hooks/test_sprint_completion_gate.py that feeds a state file with `steps_deferred: 1` (mirroring the exact sprint-09 shape) and asserts exit 2 (BLOCK) — this test MUST fail against the current evaluate_met() because the existing guard keys on `steps_passed == steps_total` which SHOULD catch 5 != 6 but the test proves the explicit guard is needed for defense-in-depth
- NEVER Allow `met == true` (or top-level `met:true`) when `human_test.steps_deferred > 0` — a deferred step is NOT a passed step
- NEVER Remove or weaken the existing `steps_executed == steps_total` or `steps_passed == steps_total` clauses — the new `steps_deferred == 0` guard is ADDITIVE (belt-and-suspenders)
- NEVER Hand-edit the `met` field of sprint-goal-state.json to `true` to unblock — the field must be DERIVED from the jq condition, not hand-set
- STRICTLY The jq `condition_cmd` and `harness.gate_loop` mirror in gate-verification.md MUST remain byte-identical after the edit (the file itself documents this invariant — see the comment on line ~351)
- STRICTLY Run `python3 hooks/test_sprint_completion_gate.py` (all existing tests + the new deferred test) — zero failures
- STRICTLY Run `bash references/assert-human-test-verdict.sh` with a synthetic deferred-step gate-results.json to prove exit 1

## How to verify

- python3 hooks/test_sprint_completion_gate.py → all passed, 0 failed (incl. new deferred test)
- rg -c 'steps_deferred' docs/gate-verification.md → >= 2
- bash references/assert-human-test-verdict.sh <synthetic-deferred> <iso>; echo $? → 1
- jq -r '.met' .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/sprint-goal-state.json → false
- jq -r '.met_layers.human_test_pass' <sprint-09-state> → false

## Scope

Writes: Projects/brain/skills/kb-run-sprint/hooks/sprint-completion-gate.py (MODIFY — add deferred-step guard to evaluate_met()) · Projects/brain/skills/kb-run-sprint/hooks/test_sprint_completion_gate.py (MODIFY — add steps_deferred > 0 => BLOCK test case + MET_TRUE fixture update) · Projects/brain/skills/kb-run-sprint/docs/gate-verification.md (MODIFY — add (.human_test.steps_deferred // 0) == 0 to BOTH condition_cmd blocks) · Projects/brain/skills/kb-run-sprint/references/assert-human-test-verdict.sh (MODIFY — add explicit deferred-step C-check) · .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/sprint-goal-state.json (MODIFY — met: false, met_layers.human_test_pass: false) · .tmp/redhat-fix-g-deferred*/** (NEW evidence)

Prohibited: services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/resolve-model.ts · services/platform/src/inference/extract-structured.ts · services/platform/src/inference/probe-capability.ts · services/platform/src/mastra.ts · services/platform/src/cli/holo.ts · Projects/brain/skills/kb-run-sprint/scripts/sync-status.py

<details>
<summary>▾ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-G-DEFERRED — Make the six-step human gate reject deferred steps and keep met-state honest
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (90 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-reviewer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: true)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 9 — Structured Output on Local Models](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
The canonical met() condition (jq + python mirror + bash assert) explicitly rejects any sprint with deferred human-gate steps; the sprint-09 sprint-goal-state.json reports honest `met:false`; future sprints cannot claim `met:true` while a gate step is deferred.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Add an explicit `steps_deferred == 0` guard to the canonical jq `condition_cmd` (met()) in docs/gate-verification.md — both the `[G0.b']` block AND the `harness.gate_loop` mirror block (they MUST stay byte-identical)
- MUST Add a deferred-step guard to `evaluate_met()` in hooks/sprint-completion-gate.py so a sprint-goal-state.json with `human_test.steps_deferred > 0` reports met()==false (BLOCK exit 2) when a completion is claimed
- MUST Add an explicit C-check to references/assert-human-test-verdict.sh that rejects any step with `result == "deferred"` (C5 already catches it via result != "pass", but the explicit check makes the rejection reason legible and future-proof against a state where steps_deferred > 0 but steps_passed == steps_total because someone mis-counted)
- MUST Update the existing sprint-09 sprint-goal-state.json `met` field from `true` to `false` AND set `met_layers.human_test_pass` to `false` — reflecting the honest state until REDHAT-FIX-H4 makes `holo extract:status` real and the gate step 5 is actually run
- MUST Write RED evidence FIRST: a new test in hooks/test_sprint_completion_gate.py that feeds a state file with `steps_deferred: 1` (mirroring the exact sprint-09 shape) and asserts exit 2 (BLOCK) — this test MUST fail against the current evaluate_met() because the existing guard keys on `steps_passed == steps_total` which SHOULD catch 5 != 6 but the test proves the explicit guard is needed for defense-in-depth
- NEVER Allow `met == true` (or top-level `met:true`) when `human_test.steps_deferred > 0` — a deferred step is NOT a passed step
- NEVER Remove or weaken the existing `steps_executed == steps_total` or `steps_passed == steps_total` clauses — the new `steps_deferred == 0` guard is ADDITIVE (belt-and-suspenders)
- NEVER Hand-edit the `met` field of sprint-goal-state.json to `true` to unblock — the field must be DERIVED from the jq condition, not hand-set
- STRICTLY The jq `condition_cmd` and `harness.gate_loop` mirror in gate-verification.md MUST remain byte-identical after the edit (the file itself documents this invariant — see the comment on line ~351)
- STRICTLY Run `python3 hooks/test_sprint_completion_gate.py` (all existing tests + the new deferred test) — zero failures
- STRICTLY Run `bash references/assert-human-test-verdict.sh` with a synthetic deferred-step gate-results.json to prove exit 1

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: evaluate_met() in sprint-completion-gate.py reports met()==false (BLOCK) when human_test.steps_deferred > 0, even if verdict=="pass" and steps_passed==steps_total (flow_ref T-INFER-010)
- [ ] AC-2: the jq condition_cmd in gate-verification.md [G0.b'] AND harness.gate_loop mirror both include `AND (.human_test.steps_deferred // 0) == 0` and remain byte-identical to each other (flow_ref T-INFER-010)
- [ ] AC-3: assert-human-test-verdict.sh rejects (exit 1) any gate-results.json step with result:"deferred" with a legible reason mentioning "deferred" (flow_ref T-INFER-010)
- [ ] AC-4: sprint-09 sprint-goal-state.json met field is false and met_layers.human_test_pass is false (honest state until REDHAT-FIX-H4) (flow_ref T-INFER-010)
- [ ] python3 hooks/test_sprint_completion_gate.py green (all existing + new deferred test) + bash references/assert-human-test-verdict.sh synthetic deferred case exit 1

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 GIVEN a sprint-goal-state.json with human_test.verdict=="pass" AND steps_executed==steps_total AND steps_passed==steps_total BUT steps_deferred==1 WHEN the sprint-completion-gate.py hook evaluates met() against this state during a completion claim THEN met()==false and the hook exits 2 (BLOCK) with a reason mentioning steps_deferred (PRIMARY) (flow_ref T-INFER-010)
  GIVEN: a sprint-goal-state.json shaped like the sprint-09 incident: human_test.verdict="pass", steps_executed=6, steps_total=6, steps_passed=6, steps_deferred=1 (the defense-in-depth case where someone mis-counted a deferred step as passed)
  WHEN:  sprint-completion-gate.py runs with a transcript claiming sprint completion against this state
  THEN:  evaluate_met() returns ok=false with a reason citing steps_deferred > 0; hook exits 2 (BLOCK)
  TEST_TIER: integration · VERIFICATION_SERVICE: local-python-subprocess · TDD_STATE: red→green
  SCENARIO — start_ref: deferred-state-fixture · evidence: stdout
    NEGATIVE_CONTROL: would fail if the steps_deferred guard is omitted from evaluate_met(), evaluate_met() only checks steps_passed == steps_total (the mis-count case slips through), the hook mocks the state file read, the test writes steps_deferred: 0 (not testing the guard)
    CASE start_ref=deferred-state-fixture · actor=reviewer
      ACTION: Write a temp sprint-goal-state.json with human_test.steps_deferred=1, verdict="pass", steps_executed=6, steps_total=6, steps_passed=6 (the mis-count case)
      ACTION: Write a transcript claiming '[goal:complete]' for that sprint
      ACTION: Run python3 hooks/sprint-completion-gate.py as a real subprocess with the real JSON payload on stdin
      ACTION: Assert exit code 2 (BLOCK) and stderr contains 'steps_deferred'
      MUST_OBSERVE: exit code == 2 (BLOCK) | stderr contains the substring 'steps_deferred' | evaluate_met() reasons list includes a deferred-step reason
      MUST_NOT_OBSERVE: exit code == 0 (ALLOW) | stderr absent or empty | no mention of deferred in the reasons

AC-2 GIVEN docs/gate-verification.md WHEN grepping the condition_cmd in [G0.b'] and the harness.gate_loop mirror THEN both contain `(.human_test.steps_deferred // 0) == 0` and the two blocks are byte-identical in their human_test clauses (flow_ref T-INFER-010)
  GIVEN: docs/gate-verification.md after the fix
  WHEN:  grepping for steps_deferred in the condition_cmd blocks
  THEN:  both [G0.b'] and harness.gate_loop contain the steps_deferred == 0 clause; diff between the two human_test clause sets shows only the steps_deferred addition is present in both
  TEST_TIER: integration · VERIFICATION_SERVICE: local-shell · TDD_STATE: red→green
  SCENARIO — start_ref: gate-verification-doc · evidence: stdout
    NEGATIVE_CONTROL: would fail if steps_deferred clause added to only one block (drift between [G0.b'] and harness.gate_loop), clause added to neither block, the clause uses `== 1` instead of `== 0`
    CASE start_ref=gate-verification-doc · actor=reviewer
      ACTION: rg -c 'steps_deferred' docs/gate-verification.md → expect >= 2 (both blocks)
      ACTION: Extract both condition_cmd jq blocks and diff their human_test clauses
      MUST_OBSERVE: rg count for 'steps_deferred' in docs/gate-verification.md >= 2 | both [G0.b'] and harness.gate_loop blocks contain '(.human_test.steps_deferred // 0) == 0'
      MUST_NOT_OBSERVE: steps_deferred appears in only one block | the clause is absent from both blocks

AC-3 GIVEN a gate-results.json with a step having result:"deferred" WHEN running bash references/assert-human-test-verdict.sh THEN it exits 1 with a reason mentioning 'deferred' (flow_ref T-INFER-010)
  GIVEN: assert-human-test-verdict.sh after adding the explicit deferred-step C-check
  WHEN:  feeding it a synthetic gate-results.json where step 5 has result:"deferred"
  THEN:  exit 1 and stderr contains 'deferred' (legible rejection reason)
  TEST_TIER: integration · VERIFICATION_SERVICE: local-shell · TDD_STATE: red→green
  SCENARIO — start_ref: deferred-gate-results-fixture · evidence: stdout
    NEGATIVE_CONTROL: would fail if the explicit deferred check is omitted (C5 catches it generically but the reason says 'result=deferred' not 'deferred step rejected'), the check accepts result:"deferred" as a pass, the script exits 0 on a deferred step
    CASE start_ref=deferred-gate-results-fixture · actor=reviewer
      ACTION: Write a temp gate-results.json with verdict:"pass", steps_total:6, steps_executed:6, steps_passed:5, and step 5 having result:"deferred"
      ACTION: Run bash references/assert-human-test-verdict.sh <file> <recent-iso>
      ACTION: Assert exit 1 and stderr contains 'deferred'
      MUST_OBSERVE: exit code == 1 | stderr contains the substring 'deferred'
      MUST_NOT_OBSERVE: exit code == 0 | stderr does not mention 'deferred'

AC-4 GIVEN the sprint-09 sprint-goal-state.json WHEN reading the met field and met_layers.human_test_pass THEN met is false and met_layers.human_test_pass is false (honest state reflecting the deferred step 5 until REDHAT-FIX-H4 lands) (flow_ref T-INFER-010)
  GIVEN: the sprint-09 sprint-goal-state.json after the honest-state update
  WHEN:  reading the met and met_layers.human_test_pass fields
  THEN:  met == false AND met_layers.human_test_pass == false; the gate.steps_deferred remains 1 with the deferred_note intact
  TEST_TIER: integration · VERIFICATION_SERVICE: local-shell · TDD_STATE: red→green
  SCENARIO — start_ref: sprint-09-state-fixture · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if met field left as true (the dishonest state this task fixes), met_layers.human_test_pass left as true, the deferred_note is deleted (losing context)
    CASE start_ref=sprint-09-state-fixture · actor=reviewer
      ACTION: jq -r '.met' .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/sprint-goal-state.json
      ACTION: jq -r '.met_layers.human_test_pass' <same file>
      MUST_OBSERVE: jq '.met' outputs 'false' | jq '.met_layers.human_test_pass' outputs 'false' | jq '.gate.steps_deferred' outputs '1' (unchanged)
      MUST_NOT_OBSERVE: .met == true | .met_layers.human_test_pass == true | .gate.steps_deferred changed from 1

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [evaluate_met() in sprint-completion-gate.py blocks (exit 2) on steps_deferred > 0 with a legible reason] (maps_to_ac AC-1)
- TC-2 [jq condition_cmd in gate-verification.md has steps_deferred == 0 in both [G0.b'] and harness.gate_loop] (maps_to_ac AC-2)
- TC-3 [assert-human-test-verdict.sh rejects deferred steps with exit 1 and 'deferred' in stderr] (maps_to_ac AC-3)
- TC-4 [sprint-09 sprint-goal-state.json reports honest met:false and human_test_pass:false] (maps_to_ac AC-4)
- TC-5 [All existing sprint-completion-gate tests still pass (no regression)] (maps_to_ac AC-1)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- Projects/brain/skills/kb-run-sprint/hooks/sprint-completion-gate.py (MODIFY — add deferred-step guard to evaluate_met())
- Projects/brain/skills/kb-run-sprint/hooks/test_sprint_completion_gate.py (MODIFY — add steps_deferred > 0 => BLOCK test case + MET_TRUE fixture update)
- Projects/brain/skills/kb-run-sprint/docs/gate-verification.md (MODIFY — add (.human_test.steps_deferred // 0) == 0 to BOTH condition_cmd blocks)
- Projects/brain/skills/kb-run-sprint/references/assert-human-test-verdict.sh (MODIFY — add explicit deferred-step C-check)
- .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/sprint-goal-state.json (MODIFY — met: false, met_layers.human_test_pass: false)
- .tmp/redhat-fix-g-deferred*/** (NEW evidence)
writeProhibited: services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/resolve-model.ts · services/platform/src/inference/extract-structured.ts · services/platform/src/inference/probe-capability.ts · services/platform/src/mastra.ts · services/platform/src/cli/holo.ts · Projects/brain/skills/kb-run-sprint/scripts/sync-status.py

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. Projects/brain/skills/kb-run-sprint/hooks/sprint-completion-gate.py 186-238
   - focus: evaluate_met() — the python mirror of the jq met() condition; add the deferred-step guard here (lines 211-222 region, after the e2e checks)
2. Projects/brain/skills/kb-run-sprint/docs/gate-verification.md 330-360
   - focus: harness.gate_loop.condition_cmd jq block — add (.human_test.steps_deferred // 0) == 0; the [G0.b'] block is referenced at line ~115-118
3. Projects/brain/skills/kb-run-sprint/references/assert-human-test-verdict.sh 76-101
   - focus: C4 (completeness) and C5 (per-step) — add an explicit deferred check; C5 already rejects result!="pass" but make 'deferred' legible
4. Projects/brain/skills/kb-run-sprint/hooks/test_sprint_completion_gate.py 75-154
   - focus: MET_TRUE fixture + test pattern — add a new test case after line 154 that writes a deferred-step state and asserts exit 2
5. .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/sprint-goal-state.json 1-97
   - focus: met:true (line 4), met_layers.human_test_pass:true (line 94), gate.steps_deferred:1 (line 39) — the dishonest state to correct
6. .spec/reviews/red-hat-2026-07-17T04-30-00Z.md 108-131
   - focus: G-DEFERRED finding — the Source/Severity/Evidence/Rule/Impact that this task remediates

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- python3 hooks/test_sprint_completion_gate.py → all passed, 0 failed (incl. new deferred test)
- rg -c 'steps_deferred' docs/gate-verification.md → >= 2
- bash references/assert-human-test-verdict.sh <synthetic-deferred> <iso>; echo $? → 1
- jq -r '.met' .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/sprint-goal-state.json → false
- jq -r '.met_layers.human_test_pass' <sprint-09-state> → false

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: defense-in-depth: the jq condition_cmd is the canonical wall; evaluate_met() is the harness-resident mirror; assert-human-test-verdict.sh is the anti-forgery validator. All three get the explicit steps_deferred == 0 guard so a deferred step can never produce met()==true through any layer.
- pattern_source: sprint-completion-gate.py evaluate_met() docstring (line 191: 'Mirror the canonical jq met()'); gate-verification.md line 351 ('MUST stay byte-identical to [G0.b']')
- anti_pattern: hand-setting met:true in sprint-goal-state.json independent of the jq condition — the orchestrator must DERIVE met from condition_cmd, never hand-write it. A top-level met field that disagrees with condition_cmd is the bug.
- agent_rationale: The sprint-09 incident proves the jq condition's steps_passed == steps_total clause is insufficient in practice: the orchestrator hand-wrote met:true and the hook's evaluate_met() does NOT currently check steps_deferred explicitly (it relies on steps_passed != steps_total, but the state file had steps_passed:5 steps_total:6 and STILL claimed met:true — meaning the met field was hand-set, not derived). The explicit steps_deferred == 0 guard makes the rejection legible and forces the met field to be derived. This is the process-integrity fix that prevents recurrence.
- Depends on:  · Blocks: REDHAT-FIX-H4

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: none · Blocks: REDHAT-FIX-H4

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-G-DEFERRED",
  "proposed_by": "mastra-reviewer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "deferred-state-fixture": {
      "description": "A sprint-goal-state.json shaped like the sprint-09 incident: tasks all complete, gate PASS, e2e PASS, human_test.verdict=\"pass\", steps_executed=6, steps_total=6, steps_passed=6, steps_deferred=1 (the mis-count defense-in-depth case where a deferred step was wrongly counted as passed). Used to prove the explicit deferred guard catches what steps_passed==steps_total would miss.",
      "seed_method": "public_api",
      "records": [
        "human_test.verdict = \"pass\"",
        "human_test.steps_executed = 6",
        "human_test.steps_total = 6",
        "human_test.steps_passed = 6 (mis-count: a deferred step was counted as passed)",
        "human_test.steps_deferred = 1",
        "gate.overall = \"PASS\"",
        "e2e.overall = \"PASS\"",
        "tasks.all_completed = true"
      ]
    },
    "sprint-09-state-fixture": {
      "description": "The real sprint-09 sprint-goal-state.json as it exists today (met:true, steps_deferred:1) — the target of the honest-state correction.",
      "seed_method": "public_api",
      "records": [
        ".spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/sprint-goal-state.json exists",
        "met: true (line 4 — to be corrected to false)",
        "gate.steps_deferred: 1 (line 39 — unchanged)",
        "met_layers.human_test_pass: true (line 94 — to be corrected to false)"
      ]
    },
    "gate-verification-doc": {
      "description": "The gate-verification.md document containing both condition_cmd jq blocks ([G0.b'] and harness.gate_loop mirror).",
      "seed_method": "public_api",
      "records": [
        "Projects/brain/skills/kb-run-sprint/docs/gate-verification.md exists",
        "[G0.b'] condition_cmd block at ~line 115-118",
        "harness.gate_loop.condition_cmd mirror at ~line 337-350",
        "both currently lack a steps_deferred clause"
      ]
    },
    "deferred-gate-results-fixture": {
      "description": "A synthetic gate-results.json with verdict:\"pass\" but step 5 having result:\"deferred\" — used to prove assert-human-test-verdict.sh rejects it.",
      "seed_method": "public_api",
      "records": [
        "verdict: \"pass\"",
        "steps_total: 6, steps_executed: 6, steps_passed: 5",
        "step 5: { n: 5, executed: true, result: \"deferred\", method: \"deferred\" }",
        "all other steps: executed: true, result: \"pass\""
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "primary": true,
      "description": "GIVEN a sprint-goal-state.json with human_test.verdict==\"pass\" AND steps_executed==steps_total AND steps_passed==steps_total BUT steps_deferred==1 WHEN the sprint-completion-gate.py hook evaluates met() against this state during a completion claim THEN met()==false and the hook exits 2 (BLOCK) with a reason mentioning steps_deferred",
      "given": "a sprint-goal-state.json shaped like the sprint-09 incident: human_test.verdict=\"pass\", steps_executed=6, steps_total=6, steps_passed=6, steps_deferred=1 (the defense-in-depth case where someone mis-counted a deferred step as passed)",
      "when": "sprint-completion-gate.py runs with a transcript claiming sprint completion against this state",
      "then": "evaluate_met() returns ok=false with a reason citing steps_deferred > 0; hook exits 2 (BLOCK)",
      "flow_ref": "T-INFER-010",
      "test_tier": "integration",
      "verification_service": "local-python-subprocess",
      "tdd_state": "red→green",
      "scenario": {
        "tier": "visible",
        "negative_control": {
          "would_fail_if": [
            "the steps_deferred guard is omitted from evaluate_met()",
            "evaluate_met() only checks steps_passed == steps_total (the mis-count case slips through)",
            "the hook mocks the state file read",
            "the test writes steps_deferred: 0 (not testing the guard)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "deferred-state-fixture",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Write a temp sprint-goal-state.json with human_test.steps_deferred=1, verdict=\"pass\", steps_executed=6, steps_total=6, steps_passed=6 (the mis-count case)",
                "Write a transcript claiming '[goal:complete]' for that sprint",
                "Run python3 hooks/sprint-completion-gate.py as a real subprocess with the real JSON payload on stdin",
                "Assert exit code 2 (BLOCK) and stderr contains 'steps_deferred'"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code == 2 (BLOCK)",
                "stderr contains the substring 'steps_deferred'",
                "evaluate_met() reasons list includes a deferred-step reason"
              ],
              "must_not_observe": [
                "exit code == 0 (ALLOW)",
                "stderr absent or empty",
                "no mention of deferred in the reasons"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "AC-2",
      "primary": false,
      "description": "GIVEN docs/gate-verification.md WHEN grepping the condition_cmd in [G0.b'] and the harness.gate_loop mirror THEN both contain `(.human_test.steps_deferred // 0) == 0` and the two blocks are byte-identical in their human_test clauses",
      "given": "docs/gate-verification.md after the fix",
      "when": "grepping for steps_deferred in the condition_cmd blocks",
      "then": "both [G0.b'] and harness.gate_loop contain the steps_deferred == 0 clause; diff between the two human_test clause sets shows only the steps_deferred addition is present in both",
      "flow_ref": "T-INFER-010",
      "test_tier": "integration",
      "verification_service": "local-shell",
      "tdd_state": "red→green",
      "scenario": {
        "tier": "visible",
        "negative_control": {
          "would_fail_if": [
            "steps_deferred clause added to only one block (drift between [G0.b'] and harness.gate_loop)",
            "clause added to neither block",
            "the clause uses `== 1` instead of `== 0`"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "gate-verification-doc",
            "action": {
              "actor": "reviewer",
              "steps": [
                "rg -c 'steps_deferred' docs/gate-verification.md → expect >= 2 (both blocks)",
                "Extract both condition_cmd jq blocks and diff their human_test clauses"
              ]
            },
            "end_state": {
              "must_observe": [
                "rg count for 'steps_deferred' in docs/gate-verification.md >= 2",
                "both [G0.b'] and harness.gate_loop blocks contain '(.human_test.steps_deferred // 0) == 0'"
              ],
              "must_not_observe": [
                "steps_deferred appears in only one block",
                "the clause is absent from both blocks"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "AC-3",
      "primary": false,
      "description": "GIVEN a gate-results.json with a step having result:\"deferred\" WHEN running bash references/assert-human-test-verdict.sh THEN it exits 1 with a reason mentioning 'deferred'",
      "given": "assert-human-test-verdict.sh after adding the explicit deferred-step C-check",
      "when": "feeding it a synthetic gate-results.json where step 5 has result:\"deferred\"",
      "then": "exit 1 and stderr contains 'deferred' (legible rejection reason)",
      "flow_ref": "T-INFER-010",
      "test_tier": "integration",
      "verification_service": "local-shell",
      "tdd_state": "red→green",
      "scenario": {
        "tier": "visible",
        "negative_control": {
          "would_fail_if": [
            "the explicit deferred check is omitted (C5 catches it generically but the reason says 'result=deferred' not 'deferred step rejected')",
            "the check accepts result:\"deferred\" as a pass",
            "the script exits 0 on a deferred step"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "deferred-gate-results-fixture",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Write a temp gate-results.json with verdict:\"pass\", steps_total:6, steps_executed:6, steps_passed:5, and step 5 having result:\"deferred\"",
                "Run bash references/assert-human-test-verdict.sh <file> <recent-iso>",
                "Assert exit 1 and stderr contains 'deferred'"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code == 1",
                "stderr contains the substring 'deferred'"
              ],
              "must_not_observe": [
                "exit code == 0",
                "stderr does not mention 'deferred'"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "AC-4",
      "primary": false,
      "description": "GIVEN the sprint-09 sprint-goal-state.json WHEN reading the met field and met_layers.human_test_pass THEN met is false and met_layers.human_test_pass is false (honest state reflecting the deferred step 5 until REDHAT-FIX-H4 lands)",
      "given": "the sprint-09 sprint-goal-state.json after the honest-state update",
      "when": "reading the met and met_layers.human_test_pass fields",
      "then": "met == false AND met_layers.human_test_pass == false; the gate.steps_deferred remains 1 with the deferred_note intact",
      "flow_ref": "T-INFER-010",
      "test_tier": "integration",
      "verification_service": "local-shell",
      "tdd_state": "red→green",
      "scenario": {
        "tier": "visible",
        "negative_control": {
          "would_fail_if": [
            "met field left as true (the dishonest state this task fixes)",
            "met_layers.human_test_pass left as true",
            "the deferred_note is deleted (losing context)"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sprint-09-state-fixture",
            "action": {
              "actor": "reviewer",
              "steps": [
                "jq -r '.met' .spec/prds/mk6-migration/tasks/sprint-09-structured-output-on-local-models/sprint-goal-state.json",
                "jq -r '.met_layers.human_test_pass' <same file>"
              ]
            },
            "end_state": {
              "must_observe": [
                "jq '.met' outputs 'false'",
                "jq '.met_layers.human_test_pass' outputs 'false'",
                "jq '.gate.steps_deferred' outputs '1' (unchanged)"
              ],
              "must_not_observe": [
                ".met == true",
                ".met_layers.human_test_pass == true",
                ".gate.steps_deferred changed from 1"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "TC-1",
      "description": "evaluate_met() in sprint-completion-gate.py blocks (exit 2) on steps_deferred > 0 with a legible reason",
      "verify": "python3 hooks/test_sprint_completion_gate.py (new 'steps_deferred > 0 => BLOCK' test case passes)",
      "maps_to_ac": "AC-1",
      "type": "test_criterion"
    },
    {
      "id": "TC-2",
      "description": "jq condition_cmd in gate-verification.md has steps_deferred == 0 in both [G0.b'] and harness.gate_loop",
      "verify": "rg -c 'steps_deferred' docs/gate-verification.md → >= 2",
      "maps_to_ac": "AC-2",
      "type": "test_criterion"
    },
    {
      "id": "TC-3",
      "description": "assert-human-test-verdict.sh rejects deferred steps with exit 1 and 'deferred' in stderr",
      "verify": "bash references/assert-human-test-verdict.sh <synthetic-deferred-file> <iso>; echo exit=$? → exit=1 and stderr contains deferred",
      "maps_to_ac": "AC-3",
      "type": "test_criterion"
    },
    {
      "id": "TC-4",
      "description": "sprint-09 sprint-goal-state.json reports honest met:false and human_test_pass:false",
      "verify": "jq -r '.met, .met_layers.human_test_pass' <sprint-09-state> → 'false' 'false'",
      "maps_to_ac": "AC-4",
      "type": "test_criterion"
    },
    {
      "id": "TC-5",
      "description": "All existing sprint-completion-gate tests still pass (no regression)",
      "verify": "python3 hooks/test_sprint_completion_gate.py → all passed, 0 failed",
      "maps_to_ac": "AC-1",
      "type": "test_criterion"
    }
  ]
}
-->
