# gate-3: Fulcrum-seams capstone — assert seams suffice to author fulcrum with no new platform code
> Status: ⬜ Pending

- **Sprint:** [Sprint 23: Deterministic Human Gate, Steering and Fulcrum Seams](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `M`
- **Estimate:** `180 minutes`
- **Agent:** `mastra-implementer` — Mastra framework implementation with template compilation and CLI command authoring
- **Reviewer:** `mastra-reviewer`
- **Proposed By:** `mastra-planner`
- **TDD Mode:** `skipped`
- **RED/GREEN Required:** `no`
- **Seeded/Integration Evidence Required:** `yes` (RED/GREEN ceremony skipped, but real-services proof still required — Axis B)

## Outcome
Create holo fulcrum:authorable-check CLI command that compiles the fulcrum template (which is an alias of evidence-research) against the 5 seams it requires: (1) mission-contract records, (2) append-only ledger tables, (3) pure-TS evidence gate, (4) ASSAY≠CHALLENGE role bindings, (5) idempotent document publish path. The command proves these seams exist with zero new platform code required.

## Background
This task is part of Sprint 23: Deterministic Human Gate, Steering and Fulcrum Seams (UC-SVC-05; T-SVC-017…020). Create holo fulcrum:authorable-check CLI command that compiles the fulcrum template (which is an alias of evidence-research) against the 5 seams it requires: (1) mission-contract records, (2) append-only ledger tables, (3) pure-TS evidence gate, (4) ASSAY≠CHALLENGE role bindings, (5) idempotent document publish path. The command proves these seams exist with zero new platform code required. The deterministic human-gate handlers and mid-run steering live in `services/platform/src/http/missions.ts` (routes in `services/platform/src/http/hono-app.ts`), backed by the `mission_verdicts`/`mission_steering`/`mission_runs` tables in `services/platform/src/db/schema/mission.ts` and enforced against the append-only ledger in `services/platform/src/db/schema/evidence.ts`. The ASSAY≠CHALLENGE distinct-instance seam and pure-TS evidence gate live in `services/platform/src/research/`. This sprint *hardens* existing surfaces — it does not recreate them.

## Specification
- **Objective:** Create holo fulcrum:authorable-check CLI command that compiles the fulcrum template (which is an alias of evidence-research) against the 5 seams it requires: (1) mission-contract records, (2) append-only ledger tables, (3) pure-TS evidence gate, (4) ASSAY≠CHALLENGE role bindings, (5) idempotent document publish path. The command proves these seams exist with zero new platform code required.
- **Success state:** Running holo fulcrum:authorable-check outputs 5 PASS results (one per seam) and overall SUFFICIENT verdict. Each PASS cites concrete platform surfaces (file:line for code, table:name for schemas). Fulcrum runs as a CLI alias with no new template code.

## Critical Constraints
### MUST
- MUST holo fulcrum:authorable-check command must compile fulcrum template against all 5 seams (contract, ledger, gate, role-bindings, publish)
- MUST Compilation must use REAL existing surfaces — no stub seams or mock tables
- MUST Command must output PASS/FAIL for each seam and an overall SUFFICIENT/INSUFFICIENT verdict
- MUST Zero new platform code must be required — fulcrum is a CLI alias of evidence-research template
- MUST All seam references must be concrete file:line or table:name citations
### NEVER
- Never add new platform code to implement fulcrum — it's a standing template
- Never stub or mock seam surfaces in the compilation check
- Never claim seam sufficiency without concrete citations
- Never modify the evidence-research template for fulcrum-specific logic
### STRICTLY
- STRICTLY All 5 seams must be verified in one command run
- STRICTLY Seam verification must be deterministic (same inputs = same PASS/FAIL)
- STRICTLY Command must fail fast on first MISSING seam (INSUFFICIENT)

## Capability Chain
- **Touches:** CAP-INF-01
**Provides:**
- fulcrum-authorable-check-command
- template-compiles-against-all-seams
- zero-new-platform-code-proof
**Consumes:**
- gate-1-human-gate-seams
- gate-2-steering-instance-seams
- evidence-research-template
- mission-template-registry
**Boundary contracts:**
- Fulcrum template compiles against contract+ledger+gate+role-bindings+publish seams
- CLI command proves compilation with zero new platform code
- All seams are visible in existing platform surfaces

## Acceptance Criteria
### AC-1: Command compiles fulcrum against all 5 seams [PRIMARY] [PRIMARY]
- **GIVEN:** The evidence-research template registered with key 'evidence-research' and fulcrum as a CLI alias
- **WHEN:** Operator runs holo fulcrum:authorable-check
- **THEN:** Command outputs seam-by-seam compilation results: contract-seam PASS (mission_templates table exists), ledger-seam PASS (sources/passages/claims/beliefs tables exist), gate-seam PASS (research/evidence-gate.ts pure-TS function exists), role-bindings-seam PASS (assay=divergent, challenge=convergent in template), publish-seam PASS (documents table exists). Overall verdict: SUFFICIENT.
- **Test tier:** `integration`
- **Verification service:** `platform-cli + Postgres`
- **Flow ref:** `UC-SVC-05/AC-4`
- **Verify:** `pnpm --filter @holocron/platform dev holo fulcrum:authorable-check`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `platform-cli + Postgres`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - command claims SUFFICIENT without checking seams (check is stubbed to return empty)
    - seam checks are stubbed to always return PASS
    - command outputs PASS but seams are missing (citation is stubbed)
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `registered-evidence-research-template`:
    - actor: `cli_user`
    - step: Run: pnpm --filter @holocron/platform dev holo fulcrum:authorable-check
    - MUST observe:
      - stdout contains 'contract-seam: PASS — mission_templates table exists (services/platform/src/db/schema/mission.ts:line)'
      - stdout contains 'ledger-seam: PASS — sources, passages, claims, beliefs tables exist (services/platform/src/db/schema/evidence.ts:lines)'
      - stdout contains 'gate-seam: PASS — pure-TS gate exists (services/platform/src/research/evidence-gate.ts:line)'
      - stdout contains 'role-bindings-seam: PASS — assay=divergent, challenge=convergent (services/platform/src/mission/templates/evidence-research.ts:lines)'
      - stdout contains 'publish-seam: PASS — documents table exists (services/platform/src/db/schema/documents.ts:line)'
      - stdout contains 'Overall: SUFFICIENT — fulcrum can be authored with zero new platform code'
    - MUST NOT observe:
      - any seam result: FAIL (no failures before fix)
      - Overall: INSUFFICIENT (empty/start signature missing)
      - stub or mock citations (no placeholder citations)

### AC-2: Fulcrum CLI alias uses existing template
- **GIVEN:** The evidence-research template registered with key 'evidence-research'
- **WHEN:** Operator runs holo fulcrum <goal> (existing CLI alias)
- **THEN:** Command creates a mission run using templateKey='evidence-research' with instantiation='fulcrum'. No new template code is executed.
- **Test tier:** `integration`
- **Verification service:** `platform-cli + Postgres`
- **Flow ref:** `UC-SVC-05/AC-4`
- **Verify:** `bun test --grep 'fulcrum-alias-uses-existing-template' services/platform/tests/integration/mission-engine-red.test.ts`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `platform-cli + Postgres`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - fulcrum alias creates a new template row (static)
    - alias executes different template code (static)
    - instantiation field is not set (static)
  - **Evidence:** artifact `db_query`, required_capture=True
  - **Case 1** — start_ref `registered-evidence-research-template`:
    - actor: `cli_user`
    - step: Run: pnpm --filter @holocron/platform dev holo fulcrum 'Analyze quantum computing trends'
    - step: Query mission_runs for template_key and instantiation
    - MUST observe:
      - SELECT template_key FROM mission_runs WHERE goal ILIKE '%quantum computing%' == 'evidence-research'
      - SELECT instantiation FROM mission_runs WHERE goal ILIKE '%quantum computing%' == 'fulcrum'
      - mission_runs row exists with status='running'
    - MUST NOT observe:
      - template_key == 'fulcrum' (empty/start signature missing)
      - new template row in mission_templates (count = 0 — empty)
      - template code different from evidence-research (no concrete inequality)

### AC-3: Seam citations are concrete file:line references
- **GIVEN:** holo fulcrum:authorable-check command output
- **WHEN:** Operator reads the seam PASS results
- **THEN:** Each result includes a concrete citation to existing code: file path and line number for code, or table name and line for schema. No 'TODO' or 'verify manually' placeholders.
- **Test tier:** `integration`
- **Verification service:** `platform-cli`
- **Flow ref:** `UC-SVC-05/AC-4`
- **Verify:** `grep -E 'PASS — .*:[0-9]+' <(pnpm --filter @holocron/platform dev holo fulcrum:authorable-check)`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `platform-cli`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - seam results lack file:line citations (citation is stubbed)
    - citations are placeholder strings (citation is stubbed)
    - citations point to non-existent files (citation is stubbed)
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `registered-evidence-research-template`:
    - actor: `cli_user`
    - step: Run: pnpm --filter @holocron/platform dev holo fulcrum:authorable-check
    - step: Parse output for file:line patterns
    - MUST observe:
      - All 5 PASS results match pattern 'PASS — .* ([a-z/]+\.ts:[0-9]+)'
      - Cited files exist at referenced paths — 5 files found at cited paths
      - No 'TODO', 'verify manually', or placeholder citations
    - MUST NOT observe:
      - PASS without citation (empty/start signature missing)
      - citation to non-existent file (empty/start signature missing)
      - placeholder citation strings (no placeholder citations)

### AC-4: Command fails fast on missing seam
- **GIVEN:** A platform missing one seam (e.g., evidence-gate.ts deleted)
- **WHEN:** Operator runs holo fulcrum:authorable-check
- **THEN:** Command detects the missing seam, outputs FAIL for that seam with MISSING reason, and returns overall INSUFFICIENT. It does not continue checking remaining seams.
- **Test tier:** `integration`
- **Verification service:** `platform-cli + Postgres`
- **Flow ref:** `UC-SVC-05/AC-4`
- **Verify:** `bun test --grep 'authorable-check-fails-fast-missing-seam' services/platform/tests/integration/mission-engine-red.test.ts`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `platform-cli + Postgres`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - command continues checking seams after MISSING detection (check is stubbed to return empty)
    - command returns SUFFICIENT despite missing seam (citation is stubbed)
    - missing seam is not detected (citation is stubbed)
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `platform-with-missing-gate-seam`:
    - actor: `cli_user`
    - step: Temporarily delete services/platform/src/research/evidence-gate.ts
    - step: Run: pnpm --filter @holocron/platform dev holo fulcrum:authorable-check
    - MUST observe:
      - stdout contains 'gate-seam: FAIL — MISSING'
      - stdout contains 'Reason: research/evidence-gate.ts does not exist'
      - stdout contains 'Overall: INSUFFICIENT'
      - Command exits immediately after FAIL (does not check remaining seams) — exit code 1
    - MUST NOT observe:
      - subsequent seam checks after gate-seam FAIL (no failures before fix)
      - Overall: SUFFICIENT (empty/start signature missing)
      - command exit 0 (empty/start signature missing)

## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Fulcrum authorable-check command passes all seams | AC-1 | `pnpm --filter @holocron/platform dev holo fulcrum:authorable-check | grep 'Overall: SUFFICIENT'` |
| TC-2 | Fulcrum alias uses evidence-research template | AC-2 | `grep 'templateKey.*evidence-research' services/platform/src/cli/holo.ts` |
| TC-3 | All seam citations are concrete file:line | AC-3 | `pnpm --filter @holocron/platform dev holo fulcrum:authorable-check | grep -c 'PASS — .*:[0-9]+' | grep 5` |
| TC-4 | No new template code for fulcrum | AC-2 | `! grep -r 'templateKey.*fulcrum' services/platform/src/mission/templates/` |

## Reading List
- `services/platform/src/mission/templates/evidence-research.ts` (1-100) — Shared template definition and instantiation list
- `services/platform/src/cli/holo.ts` (existing CLI aliases) — How research/deepResearch/subscriptions-research map to evidence-research template
- `services/platform/src/research/evidence-gate.ts` (1-50) — Pure-TS gate function that must be cited
- `services/platform/src/db/schema/mission.ts` (mission_templates table) — Contract seam (mission_templates table)
- `services/platform/src/db/schema/evidence.ts` (32-174) — Ledger seam (sources, passages, claims, beliefs tables)

## Guardrails
**Write allowed:**
- `services/platform/src/cli/holo.ts (MODIFY for fulcrum:authorable-check command)`
- `services/platform/tests/integration/mission-engine-red.test.ts (MODIFY for seam check tests)`
- `services/platform/src/cli/commands/* (NEW for command modularization)`
**Write prohibited:**
- `services/platform/src/mission/templates/* — no template changes, fulcrum uses existing evidence-research`
- `services/platform/src/db/schema/* — no schema changes for seams`
- `services/platform/src/research/evidence-gate.ts — already pure-TS, do not modify`

## Design
**References:**
- Existing CLI aliases in holo.ts (research, deepResearch, subscriptions-research)
- Sprint 22 evidence-research template as shared core
**Interaction notes:**
- C
- o
- m
- m
- a
- n
- d
-  
- s
- h
- o
- u
- l
- d
-  
- q
- u
- e
- r
- y
-  
- P
- o
- s
- t
- g
- r
- e
- s
-  
- f
- o
- r
-  
- s
- c
- h
- e
- m
- a
-  
- e
- x
- i
- s
- t
- e
- n
- c
- e
-  
- c
- h
- e
- c
- k
- s
-  
- a
- n
- d
-  
- u
- s
- e
-  
- f
- s
- .
- e
- x
- i
- s
- t
- s
- S
- y
- n
- c
-  
- f
- o
- r
-  
- c
- o
- d
- e
-  
- c
- h
- e
- c
- k
- s
- .
-  
- A
- l
- l
-  
- c
- h
- e
- c
- k
- s
-  
- m
- u
- s
- t
-  
- b
- e
-  
- d
- e
- t
- e
- r
- m
- i
- n
- i
- s
- t
- i
- c
- .
- **Pattern:** CLI command that validates seam existence by concrete surface citations (file:line, table:name)
- **Pattern source:** `Sprint 15 mission template registration pattern`
- **Anti-pattern:** Placeholder seams or 'verify manually' outputs

## Verification Gates
- **Command outputs SUFFICIENT with all seams PASS**
  - command: `pnpm --filter @holocron/platform dev holo fulcrum:authorable-check`
  - expected: Exit 0 with 5 PASS results and Overall: SUFFICIENT
- **Fulcrum alias creates mission run**
  - command: `pnpm --filter @holocron/platform dev holo fulcrum 'test goal'`
  - expected: Exit 0 and mission_runs row created with template_key='evidence-research', instantiation='fulcrum'
- **Type check clean**
  - command: `pnpm typecheck`
  - expected: Exit 0
- **Lint pass**
  - command: `pnpm lint`
  - expected: Exit 0
- **Scope compliance**
  - command: `git diff --name-only`
  - expected: Only files in writeAllowed list modified

## Agent Assignment
- **Agent:** `mastra-implementer` — Mastra framework implementation with template compilation and CLI command authoring
- **Reviewer:** `mastra-reviewer` — adversarial seam-sufficiency + determinism review

## Evidence Gates
- RED-against-start for every behavioral AC (tdd_mode `skipped`): False
- Real-services (Postgres + fleet) integration proof required: `True`
- Fakeability: `validate_scenario.py` exit 0 on every behavioral AC (independently re-verified)

## Review Criteria
- Deterministic rules are Postgres-enforced (CHECK / SECURITY DEFINER / unique index), not handler-only
- ASSAY≠CHALLENGE uses real fleet instance ids, not hardcoded strings
- Fulcrum is an alias/instantiation of evidence-research — zero new platform code
- Every behavioral AC's scenario passes `validate_scenario.py` with zero CRITICAL/HIGH

## Dependencies
- **Depends on:** gate-1, gate-2
- **Blocks:** none

## Coding Standards
- `brain/docs/coding-standards/typescript.md`
- `brain/docs/coding-standards/cli.md`

## Notes
- Generated by /kb-sprint-tasks-plan on 2026-07-21. Topological order in SPRINT.md: gate-4 (RED first) → gate-1 ∥ gate-2 → gate-3 (capstone) → gate-5 (review).
- PRD refs: UC-SVC-05, T-SVC-020.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "gate-3",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "registered-evidence-research-template": {
      "description": "Evidence-research template registered in mission_templates table",
      "seed_method": "migration_fixture",
      "records": [
        "INSERT INTO mission_templates (template_key, version, definition_json) VALUES ('evidence-research', '1.0.2', '{...}')"
      ]
    },
    "platform-with-missing-gate-seam": {
      "description": "Platform temporarily missing evidence-gate.ts for fail-fast test",
      "seed_method": "recorded_external",
      "records": [
        "Delete services/platform/src/research/evidence-gate.ts (temporary, restored after test)"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN: The evidence-research template registered with key 'evidence-research' and fulcrum as a CLI alias. WHEN: Operator runs holo fulcrum:authorable-check. THEN: Command outputs seam-by-seam compilation results: contract-seam PASS (mission_templates table exists), ledger-seam PASS (sources/passages/claims/beliefs tables exist), gate-seam PASS (research/evidence-gate.ts pure-TS function exists), role-bindings-seam PASS (assay=divergent, challenge=convergent in template), publish-seam PASS (documents table exists). Overall verdict: SUFFICIENT.",
      "verify": "pnpm --filter @holocron/platform dev holo fulcrum:authorable-check"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN: The evidence-research template registered with key 'evidence-research'. WHEN: Operator runs holo fulcrum <goal> (existing CLI alias). THEN: Command creates a mission run using templateKey='evidence-research' with instantiation='fulcrum'. No new template code is executed.",
      "verify": "bun test --grep 'fulcrum-alias-uses-existing-template' services/platform/tests/integration/mission-engine-red.test.ts"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN: holo fulcrum:authorable-check command output. WHEN: Operator reads the seam PASS results. THEN: Each result includes a concrete citation to existing code: file path and line number for code, or table name and line for schema. No 'TODO' or 'verify manually' placeholders.",
      "verify": "grep -E 'PASS \u2014 .*:[0-9]+' <(pnpm --filter @holocron/platform dev holo fulcrum:authorable-check)"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN: A platform missing one seam (e.g., evidence-gate.ts deleted). WHEN: Operator runs holo fulcrum:authorable-check. THEN: Command detects the missing seam, outputs FAIL for that seam with MISSING reason, and returns overall INSUFFICIENT. It does not continue checking remaining seams.",
      "verify": "bun test --grep 'authorable-check-fails-fast-missing-seam' services/platform/tests/integration/mission-engine-red.test.ts"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Fulcrum authorable-check command passes all seams",
      "verify": "pnpm --filter @holocron/platform dev holo fulcrum:authorable-check | grep 'Overall: SUFFICIENT'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Fulcrum alias uses evidence-research template",
      "verify": "grep 'templateKey.*evidence-research' services/platform/src/cli/holo.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "All seam citations are concrete file:line",
      "verify": "pnpm --filter @holocron/platform dev holo fulcrum:authorable-check | grep -c 'PASS \u2014 .*:[0-9]+' | grep 5",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "No new template code for fulcrum",
      "verify": "! grep -r 'templateKey.*fulcrum' services/platform/src/mission/templates/",
      "maps_to_ac": "AC-2"
    }
  ]
}
-->
