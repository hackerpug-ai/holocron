# gate-5: Review seam sufficiency
> Status: ✅ Completed
> Commit: 7eb88845b2e50462ec26dd4f45606baab1baf80f
> Reviewer: product-manager+mastra-reviewer
> Completed: 2026-07-22T20:26:05Z

- **Sprint:** [Sprint 23: Deterministic Human Gate, Steering and Fulcrum Seams](./SPRINT.md)
- **Task Type:** `CHORE`
- **Status:** `Backlog`
- **Priority:** `P1`
- **Effort:** `S`
- **Estimate:** `90 minutes`
- **Agent:** `mastra-reviewer` — Mastra framework review specialist for seam validation and architectural compliance
- **Reviewer:** `mastra-reviewer`
- **Proposed By:** `mastra-planner`
- **TDD Mode:** `skipped`
- **RED/GREEN Required:** `no`

## Outcome
Review the seam sufficiency claim from gate-3 and validate that all 5 seams (contract, ledger, gate, role-bindings, publish) are real surfaces with concrete file:line citations. Validate that deterministic rules are Postgres-enforced, not handler-only. Confirm zero new platform code was added for fulcrum.

## Background
This task is part of Sprint 23: Deterministic Human Gate, Steering and Fulcrum Seams (UC-SVC-05; T-SVC-017…020). Review the seam sufficiency claim from gate-3 and validate that all 5 seams (contract, ledger, gate, role-bindings, publish) are real surfaces with concrete file:line citations. Validate that deterministic rules are Postgres-enforced, not handler-only. Confirm zero new platform code was added for fulcrum. The deterministic human-gate handlers and mid-run steering live in `services/platform/src/http/missions.ts` (routes in `services/platform/src/http/hono-app.ts`), backed by the `mission_verdicts`/`mission_steering`/`mission_runs` tables in `services/platform/src/db/schema/mission.ts` and enforced against the append-only ledger in `services/platform/src/db/schema/evidence.ts`. The ASSAY≠CHALLENGE distinct-instance seam and pure-TS evidence gate live in `services/platform/src/research/`. This sprint *hardens* existing surfaces — it does not recreate them.

## Specification
- **Objective:** Review the seam sufficiency claim from gate-3 and validate that all 5 seams (contract, ledger, gate, role-bindings, publish) are real surfaces with concrete file:line citations. Validate that deterministic rules are Postgres-enforced, not handler-only. Confirm zero new platform code was added for fulcrum.
- **Success state:** Review report confirms all seams exist with concrete citations, deterministic rules are Postgres-enforced, and fulcrum is an alias with no new platform code. Review identifies any gaps (e.g., handler-only validation, missing constraints, placeholder citations).

## Critical Constraints
### MUST
- MUST Review must cite concrete file:line evidence for every seam claim
- MUST Review must validate deterministic rules are Postgres-enforced (CHECK constraints or SECURITY DEFINER)
- MUST Review must confirm zero new template code for fulcrum (alias only)
- MUST Review must check instance ID tracking uses real fleet trace_ids not hardcoded strings
- MUST Review must verify pure-TS gate has no LLM calls
### NEVER
- Never approve seam claims without concrete citations
- Never accept handler-only validation as deterministic (must be Postgres-enforced)
- Never approve hardcoded instance IDs as inequality proof
- Never accept 'model choice will handle this' as deterministic enforcement
### STRICTLY
- STRICTLY Every seam in gate-3 authorable-check must have concrete evidence
- STRICTLY Every deterministic rule must have corresponding CHECK constraint or SECURITY DEFINER
- STRICTLY Fulcrum must be verified as alias only (no template code)

## Capability Chain
- **Touches:** CAP-INF-01
**Provides:**
- seam-sufficiency-review
- architectural-compliance-report
- no-new-platform-code-validation
**Consumes:**
- gate-1-human-gate-implementation
- gate-2-steering-instance-implementation
- gate-3-fulcrum-seams-proof
**Boundary contracts:**
- Review validates all seams are real surfaces with concrete citations
- Review confirms zero new platform code was added for fulcrum
- Review checks determinism is Postgres-enforced not handler-only

## Acceptance Criteria
### AC-1: All 5 seams validated with concrete citations [PRIMARY] [PRIMARY]
- **GIVEN:** gate-3 holo fulcrum:authorable-check output showing 5 PASS results
- **WHEN:** Reviewer inspects each seam citation
- **THEN:** Every citation points to existing code: mission_templates table exists in schema/mission.ts, ledger tables exist in schema/evidence.ts, gate function exists in research/evidence-gate.ts, role bindings exist in templates/evidence-research.ts, documents table exists in schema/documents.ts. No citations are placeholders.
- **Test tier:** `integration`
- **Verification service:** `mastra-reviewer`
- **Flow ref:** `UC-SVC-05/AC-4`
- **Verify:** `grep -E 'PASS — .*:[0-9]+' <(pnpm --filter @holocron/platform dev holo fulcrum:authorable-check) | wc -l | grep 5`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `mastra-reviewer`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - review accepts seam claims without verifying citations (citation is stubbed)
    - review approves placeholder citations like 'TODO' (citation is stubbed)
    - review skips checking file existence (check is stubbed to return empty)
  - **Evidence:** artifact `code-review`, required_capture=True
  - **Case 1** — start_ref `gate-3-authorable-check-output`:
    - actor: `mastra-reviewer`
    - step: Read holo fulcrum:authorable-check output
    - step: For each of 5 seams, open cited file:line
    - step: Verify cited code/tables actually exist
    - step: Confirm citations are not placeholders
    - MUST observe:
      - All 5 cited files exist at referenced paths — 5 files found at cited paths
      - Cited lines contain the relevant table/function definitions — 5 table/function pairs found
      - No 'TODO', 'verify manually', or placeholder citations
      - Review report lists 5 seams with concrete evidence
    - MUST NOT observe:
      - Citations to non-existent files (no placeholder citations)
      - Placeholder citations (no placeholder citations)
      - Seams without citations (no placeholder citations)

### AC-2: Deterministic rules are Postgres-enforced
- **GIVEN:** gate-1 implementation of uncited-kill rejection, WIP=1 check, and probe-gated advance
- **WHEN:** Reviewer inspects the enforcement implementation
- **THEN:** All three rules use Postgres enforcement: CHECK constraints in schema, SECURITY DEFINER functions for complex queries, or unique indexes for idempotency. No rule is handler-only validation.
- **Test tier:** `integration`
- **Verification service:** `mastra-reviewer`
- **Flow ref:** `UC-SVC-05/AC-1`
- **Verify:** `grep -E 'CHECK.*SECURITY DEFINER|uniqueIndex' services/platform/src/db/schema/mission.ts | wc -l | grep -E '[0-9]{1,}'`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `mastra-reviewer`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - review accepts handler-only validation as deterministic (handler is stubbed)
    - review skips checking for CHECK constraints (check is stubbed to return empty)
    - review approves rules without Postgres enforcement (static)
  - **Evidence:** artifact `code-review`, required_capture=True
  - **Case 1** — start_ref `gate-1-implementation`:
    - actor: `mastra-reviewer`
    - step: Read gate-1 handler code in services/platform/src/http/missions.ts
    - step: Read schema/mission.ts for CHECK constraints
    - step: Verify each rule has Postgres enforcement
    - step: Confirm no handler-only validation
    - MUST observe:
      - CHECK constraints or SECURITY DEFINER functions for each rule — 3 enforcement mechanisms
      - Idempotency enforced by unique indexes (run_id, request_key) — 2 unique indexes
      - Review report confirms Postgres enforcement for all 3 rules
    - MUST NOT observe:
      - Handler-only validation without Postgres backup (empty/start signature missing)
      - Rules enforced only by if statements (empty/start signature missing)
      - Deterministic claims without CHECK/SECURITY DEFINER (empty/start signature missing)

### AC-3: Zero new platform code for fulcrum
- **GIVEN:** gate-3 fulcrum template and CLI alias
- **WHEN:** Reviewer inspects the fulcrum implementation
- **THEN:** Fulcrum is purely a CLI alias that references the existing evidence-research template. No new template code exists. No new platform code was added. The instantiation='fulcrum' field is the only addition.
- **Test tier:** `integration`
- **Verification service:** `mastra-reviewer`
- **Flow ref:** `UC-SVC-05/AC-4`
- **Verify:** `! grep -r 'templateKey.*fulcrum' services/platform/src/mission/templates/`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `mastra-reviewer`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - review approves new template code for fulcrum (static)
    - review doesn't check for hidden template additions (check is stubbed to return empty)
    - review accepts 'minimal' platform code instead of zero (static)
  - **Evidence:** artifact `code-review`, required_capture=True
  - **Case 1** — start_ref `gate-3-fulcrum-implementation`:
    - actor: `mastra-reviewer`
    - step: Search services/platform/src/mission/templates/ for 'fulcrum'
    - step: Verify no new template definition exists
    - step: Check CLI alias in holo.ts uses existing template
    - step: Confirm only instantiation field added
    - MUST observe:
      - No template with templateKey='fulcrum'
      - CLI alias maps to templateKey='evidence-research'
      - Only new field is instantiation='fulcrum'
      - Review report confirms zero new platform code — 0 new .ts files
    - MUST NOT observe:
      - New fulcrum template definition (no new code)
      - New platform code beyond CLI alias (no new code)
      - Template code duplication (no new code)

### AC-4: Instance IDs are real fleet values not hardcoded
- **GIVEN:** gate-2 ASSAY≠CHALLENGE instance tracking implementation
- **WHEN:** Reviewer inspects the instance ID tracking code
- **THEN:** Instance IDs (assayInstanceId, challengeInstanceId) come from real fleet trace_ids in mission_stage_runs, not hardcoded strings. The inequality is asserted from concrete fleet values.
- **Test tier:** `integration`
- **Verification service:** `mastra-reviewer`
- **Flow ref:** `UC-SVC-05/AC-3`
- **Verify:** `grep -E 'fleet:model:.*inst-' services/platform/src/research/inspection.ts`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `mastra-reviewer`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - review accepts hardcoded 'assay-instance' vs 'challenge-instance' strings
    - review doesn't verify fleet pattern in instance IDs (static)
    - review approves inequality without concrete IDs (static)
  - **Evidence:** artifact `code-review`, required_capture=True
  - **Case 1** — start_ref `gate-2-instance-tracking`:
    - actor: `mastra-reviewer`
    - step: Read services/platform/src/research/inspection.ts
    - step: Verify assayInstanceId/challengeInstanceId source from trace_id
    - step: Check trace_id values match fleet pattern
    - step: Confirm no hardcoded strings
    - MUST observe:
      - instance IDs sourced from mission_stage_runs.trace_id — concrete IDs like `fleet:model:qwen-2.5-7b:inst-001` vs `fleet:model:qwen-2.5-7b:inst-002`
      - trace_id values match 'fleet:model:.*inst-.*' pattern
      - No hardcoded 'assay-instance' or 'challenge-instance' strings
      - Review report confirms real fleet instance tracking — report cites 2 fleet instance IDs
    - MUST NOT observe:
      - Hardcoded instance ID strings (no new code)
      - Fake inequality without real IDs (empty/start signature missing)
      - Instance IDs disconnected from fleet (empty/start signature missing)

## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | All seam citations are concrete file:line | AC-1 | `pnpm --filter @holocron/platform dev holo fulcrum:authorable-check | grep -c 'PASS — .*:[0-9]+' | grep 5` |
| TC-2 | Deterministic rules use Postgres enforcement | AC-2 | `grep -E 'CHECK|SECURITY DEFINER' services/platform/src/db/schema/mission.ts | grep -E 'kill|WIP|probe'` |
| TC-3 | Fulcrum uses existing template only | AC-3 | `! grep -r 'templateKey.*fulcrum' services/platform/src/mission/templates/` |
| TC-4 | Instance IDs match fleet pattern | AC-4 | `grep -E 'fleet:model:.*inst-' services/platform/src/research/inspection.ts` |

## Reading List
- `services/platform/src/http/missions.ts` (569-700) — gate-1 deterministic rule enforcement implementation
- `services/platform/src/db/schema/mission.ts` (313-331) — CHECK constraints and unique indexes for deterministic enforcement
- `services/platform/src/mission/templates/evidence-research.ts` (1-100) — Template definition fulcrum uses as alias
- `services/platform/src/research/inspection.ts` (1-100) — Instance ID tracking from fleet trace_ids
- `services/platform/src/cli/holo.ts` (fulcrum alias) — CLI alias mapping to evidence-research template

## Guardrails
**Write allowed:**
- `Review report output (markdown file in .tmp/gate-5/)`
- `No code modifications — review is READ-ONLY`
**Write prohibited:**
- `Any source code modifications — review is validation only`
- `schema changes during review`
- `template modifications during review`

## Design
**References:**
- Sprint 23 gate-1, gate-2, gate-3 implementations for review context
- Sprint 07 immutable ledger migrations for SECURITY DEFINER pattern reference
**Interaction notes:**
- R
- e
- v
- i
- e
- w
-  
- i
- s
-  
- R
- E
- A
- D
- -
- O
- N
- L
- Y
- .
-  
- R
- e
- v
- i
- e
- w
- e
- r
-  
- s
- h
- o
- u
- l
- d
-  
- g
- r
- e
- p
-  
- f
- o
- r
-  
- p
- a
- t
- t
- e
- r
- n
- s
-  
- a
- n
- d
-  
- r
- e
- a
- d
-  
- c
- i
- t
- e
- d
-  
- f
- i
- l
- e
- :
- l
- i
- n
- e
-  
- r
- e
- f
- e
- r
- e
- n
- c
- e
- s
-  
- t
- o
-  
- v
- a
- l
- i
- d
- a
- t
- e
-  
- s
- e
- a
- m
-  
- c
- l
- a
- i
- m
- s
- .
- **Pattern:** Adversarial review: validate every seam claim with concrete file:line evidence, reject placeholder citations, confirm Postgres enforcement
- **Pattern source:** `mastra-reviewer adversarial review methodology`
- **Anti-pattern:** Approving seam claims without concrete verification

## Verification Gates
- **Seam citations verified**
  - command: `pnpm --filter @holocron/platform dev holo fulcrum:authorable-check | grep -c 'PASS — .*:[0-9]+' | grep 5`
  - expected: 5 PASS results with concrete file:line citations
- **Postgres enforcement confirmed**
  - command: `grep -E 'CHECK|SECURITY DEFINER' services/platform/src/db/schema/mission.ts`
  - expected: CHECK constraints or SECURITY DEFINER for each deterministic rule
- **Zero new platform code**
  - command: `! grep -r 'templateKey.*fulcrum' services/platform/src/mission/templates/`
  - expected: No new template code for fulcrum
- **Real fleet instance IDs**
  - command: `grep -E 'fleet:model:.*inst-' services/platform/src/research/inspection.ts`
  - expected: Instance IDs match fleet pattern

## Agent Assignment
- **Agent:** `mastra-reviewer` — Mastra framework review specialist for seam validation and architectural compliance
- **Reviewer:** `mastra-reviewer` — adversarial seam-sufficiency + determinism review

## Evidence Gates
- RED-against-start for every behavioral AC (tdd_mode `skipped`): False
- Real-services (Postgres + fleet) integration proof required: `False`
- Fakeability: `validate_scenario.py` exit 0 on every behavioral AC (independently re-verified)

## Review Criteria
- Deterministic rules are Postgres-enforced (CHECK / SECURITY DEFINER / unique index), not handler-only
- ASSAY≠CHALLENGE uses real fleet instance ids, not hardcoded strings
- Fulcrum is an alias/instantiation of evidence-research — zero new platform code
- Every behavioral AC's scenario passes `validate_scenario.py` with zero CRITICAL/HIGH

## Dependencies
- **Depends on:** gate-1, gate-2, gate-3
- **Blocks:** none

## Coding Standards
- `brain/docs/coding-standards/review.md`

## Notes
- Generated by /kb-sprint-tasks-plan on 2026-07-21. Topological order in SPRINT.md: gate-4 (RED first) → gate-1 ∥ gate-2 → gate-3 (capstone) → gate-5 (review).
- PRD refs: UC-SVC-05.

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "gate-5",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": false
  },
  "fixtures": {
    "gate-3-authorable-check-output": {
      "description": "Output from holo fulcrum:authorable-check showing 5 PASS seams",
      "seed_method": "recorded_external",
      "records": [
        "Run command and capture output for review"
      ]
    },
    "gate-1-implementation": {
      "description": "gate-1 deterministic rules implementation",
      "seed_method": "recorded_external",
      "records": [
        "Read handler and schema code for Postgres enforcement"
      ]
    },
    "gate-3-fulcrum-implementation": {
      "description": "gate-3 fulcrum CLI alias and template usage",
      "seed_method": "recorded_external",
      "records": [
        "Verify CLI alias uses existing evidence-research template"
      ]
    },
    "gate-2-instance-tracking": {
      "description": "gate-2 instance ID tracking code",
      "seed_method": "recorded_external",
      "records": [
        "Read inspection.ts for real fleet instance ID usage"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN: gate-3 holo fulcrum:authorable-check output showing 5 PASS results. WHEN: Reviewer inspects each seam citation. THEN: Every citation points to existing code: mission_templates table exists in schema/mission.ts, ledger tables exist in schema/evidence.ts, gate function exists in research/evidence-gate.ts, role bindings exist in templates/evidence-research.ts, documents table exists in schema/documents.ts. No citations are placeholders.",
      "verify": "grep -E 'PASS \u2014 .*:[0-9]+' <(pnpm --filter @holocron/platform dev holo fulcrum:authorable-check) | wc -l | grep 5"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN: gate-1 implementation of uncited-kill rejection, WIP=1 check, and probe-gated advance. WHEN: Reviewer inspects the enforcement implementation. THEN: All three rules use Postgres enforcement: CHECK constraints in schema, SECURITY DEFINER functions for complex queries, or unique indexes for idempotency. No rule is handler-only validation.",
      "verify": "grep -E 'CHECK.*SECURITY DEFINER|uniqueIndex' services/platform/src/db/schema/mission.ts | wc -l | grep -E '[0-9]{1,}'"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN: gate-3 fulcrum template and CLI alias. WHEN: Reviewer inspects the fulcrum implementation. THEN: Fulcrum is purely a CLI alias that references the existing evidence-research template. No new template code exists. No new platform code was added. The instantiation='fulcrum' field is the only addition.",
      "verify": "! grep -r 'templateKey.*fulcrum' services/platform/src/mission/templates/"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN: gate-2 ASSAY\u2260CHALLENGE instance tracking implementation. WHEN: Reviewer inspects the instance ID tracking code. THEN: Instance IDs (assayInstanceId, challengeInstanceId) come from real fleet trace_ids in mission_stage_runs, not hardcoded strings. The inequality is asserted from concrete fleet values.",
      "verify": "grep -E 'fleet:model:.*inst-' services/platform/src/research/inspection.ts"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "All seam citations are concrete file:line",
      "verify": "pnpm --filter @holocron/platform dev holo fulcrum:authorable-check | grep -c 'PASS \u2014 .*:[0-9]+' | grep 5",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Deterministic rules use Postgres enforcement",
      "verify": "grep -E 'CHECK|SECURITY DEFINER' services/platform/src/db/schema/mission.ts | grep -E 'kill|WIP|probe'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Fulcrum uses existing template only",
      "verify": "! grep -r 'templateKey.*fulcrum' services/platform/src/mission/templates/",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Instance IDs match fleet pattern",
      "verify": "grep -E 'fleet:model:.*inst-' services/platform/src/research/inspection.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
