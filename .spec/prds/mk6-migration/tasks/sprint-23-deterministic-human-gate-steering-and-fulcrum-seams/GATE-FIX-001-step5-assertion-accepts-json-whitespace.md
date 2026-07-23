# GATE-FIX-001 — Gate step 5 assertion must accept JSON whitespace
> Status: ⬜ Pending
> Sprint: [Sprint 23](./SPRINT.md)
> Agent: devops-engineer
> Reviewer: code-reviewer
> Estimate: 30 min
> Type: CONFIG
> Priority: P0
> Proposed By: kb-run-human-tests (verified fail `20260723T050041Z`)
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome
`gate-plan.json` step 5 `expect_log_regex` matches pretty-printed `assayChallengeDistinct: true` (ordinary JSON whitespace) while the `mission:cycle` `literal_cmd` stays byte-identical.

## Evidence (immutable)
- Run: `20260723T050041Z` · verdict **fail** (verified)
- `.gate-evidence/20260723T050041Z/step5.log` — `"assayChallengeDistinct": true,` (space after `:`)
- `gate-results.json` step 5 failure: regex `/"assayChallengeDistinct":true/` (no space) did not match
- `gate-verification.json` — recomputed fail agrees
- Do **not** rewrite/delete `.gate-evidence/20260723T050041Z/**`

## Critical Constraints
### MUST
- MUST set step 5 `assertion.expect_log_regex` to a form that accepts ordinary JSON whitespace (e.g. `"assayChallengeDistinct"\s*:\s*true`)
- MUST keep step 5 `literal_cmd` unchanged (still `holo.ts mission:cycle … --json`)
- MUST preserve fail evidence under `.gate-evidence/20260723T050041Z/`
### NEVER
- NEVER change product source, CLI pretty-print, or migrations
- NEVER change step 5 `literal_cmd` text
### STRICTLY
- STRICTLY only `gate-plan.json` step 5 assertion (and optional GATE-RESULTS notes) are in scope

## Specification
- **Objective:** Fix step 5 assertion drift vs pretty-printed CLI JSON.
- **Success state:** Fresh step 5 re-run exits 0 and assertion matches; historical fail evidence remains intact.

## Acceptance Criteria
### AC-1: Regex accepts ordinary JSON whitespace [PRIMARY]
**GIVEN:** CLI emits `"assayChallengeDistinct": true` (space after colon) as in `step5.log:15`
**WHEN:** `gate-plan.json` step 5 assertion is applied to that output
**THEN:** regex matches; step 5 result is pass
**VERIFY:** `python3 -c 'import re,pathlib; t=pathlib.Path(".spec/prds/mk6-migration/tasks/sprint-23-deterministic-human-gate-steering-and-fulcrum-seams/.gate-evidence/20260723T050041Z/step5.log").read_text(); import json; r=json.load(open(".spec/prds/mk6-migration/tasks/sprint-23-deterministic-human-gate-steering-and-fulcrum-seams/gate-plan.json"))["steps"][4]["assertion"]["expect_log_regex"]; assert re.search(r,t), r'`
**TEST_TIER:** integration · **FLOW_REF:** UC-SVC-05

### AC-2: literal_cmd unchanged
**GIVEN:** pre-fix `literal_cmd` for step 5
**WHEN:** this task lands
**THEN:** step 5 `literal_cmd` equals prior mission:cycle command (no product/CLI change)
**VERIFY:** `jq -r '.steps[]|select(.n==5)|.literal_cmd' gate-plan.json | grep -F 'mission:cycle'`

### AC-3: Fail archive preserved
**GIVEN:** `.gate-evidence/20260723T050041Z/step5.log`
**WHEN:** task lands
**THEN:** file still exists and still shows historical space-after-colon form
**VERIFY:** `test -f .gate-evidence/20260723T050041Z/step5.log && grep -q 'assayChallengeDistinct.: true' .gate-evidence/20260723T050041Z/step5.log`

## Test Criteria
| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Step 5 expect_log_regex matches historical step5.log | AC-1 | AC-1 VERIFY command exits 0 |
| TC-2 | Step 5 literal_cmd still contains mission:cycle | AC-2 | AC-2 VERIFY |
| TC-3 | 20260723T050041Z step5.log still present | AC-3 | AC-3 VERIFY |

## Guardrails
**WRITE-ALLOWED:** `gate-plan.json` (step 5 assertion only); optional notes in `GATE-RESULTS.md`
**WRITE-PROHIBITED:** `services/**`, migrations, `.gate-evidence/20260723T050041Z/**`, step 5 `literal_cmd`

## Verification Gates
1. AC-1/TC-1 VERIFY exit 0
2. `git diff --name-only` ⊆ writeAllowed
3. No product/migration paths in diff

## Dependencies
- depends_on: gate-1…gate-5 (landed)
- blocks: honest human-gate re-pass for step 5

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-001",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s23_step5_fail_log": {
      "description": "Historical step5.log with pretty-printed assayChallengeDistinct true",
      "seed_method": "file_artifact",
      "records": [".gate-evidence/20260723T050041Z/step5.log"]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN pretty-printed step5.log WHEN step5 expect_log_regex applied THEN match",
      "verify": "python3 re.search of gate-plan step5 regex against step5.log",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan+file_artifact",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["compact-only regex", "stub", "empty"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [{
          "start_ref": "s23_step5_fail_log",
          "action": { "actor": "operator", "steps": ["Apply step5 expect_log_regex to step5.log"] },
          "end_state": {
            "must_observe": ["regex match on assayChallengeDistinct true with optional whitespace"],
            "must_not_observe": ["regex_matched=false against historical pretty-print"]
          }
        }]
      }
    },
    { "id": "AC-2", "type": "acceptance_criterion", "description": "literal_cmd unchanged mission:cycle", "verify": "jq step5 literal_cmd contains mission:cycle" },
    { "id": "AC-3", "type": "acceptance_criterion", "description": "fail archive preserved", "verify": "test -f step5.log" },
    { "id": "TC-1", "type": "test_criterion", "description": "Regex matches historical step5.log", "maps_to_ac": "AC-1", "verify": "AC-1 VERIFY" },
    { "id": "TC-2", "type": "test_criterion", "description": "literal_cmd contains mission:cycle", "maps_to_ac": "AC-2", "verify": "AC-2 VERIFY" },
    { "id": "TC-3", "type": "test_criterion", "description": "step5.log present", "maps_to_ac": "AC-3", "verify": "AC-3 VERIFY" }
  ]
}
-->
