# gate-2: Mid-run steering + ASSAY≠CHALLENGE enforcement within a cycle
> Status: ✅ Completed
> Commit: 7fea20a12b5dc8236bb820ef58abc6a0db5d44db
> Reviewer: product-manager+mastra-reviewer
> Completed: 2026-07-22T20:26:03Z

- **Sprint:** [Sprint 23: Deterministic Human Gate, Steering and Fulcrum Seams](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `L`
- **Estimate:** `210 minutes`
- **Agent:** `mastra-implementer` — Mastra framework implementation with workflow steering coordination and instance tracking
- **Reviewer:** `mastra-reviewer`
- **Proposed By:** `mastra-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
Ensure mid-run steering takes effect on the following cycle without restarting the workflow, and guarantee that ASSAY and CHALLENGE stages use distinct fleet model instances within a single cycle. Refuting claims must pass the same pure-TS admission gate as supporting ones. All enforcement must be observable in mission_stage_runs trace rows.

## Background
This task is part of Sprint 23: Deterministic Human Gate, Steering and Fulcrum Seams (UC-SVC-05; T-SVC-017…020). Ensure mid-run steering takes effect on the following cycle without restarting the workflow, and guarantee that ASSAY and CHALLENGE stages use distinct fleet model instances within a single cycle. Refuting claims must pass the same pure-TS admission gate as supporting ones. All enforcement must be observable in mission_stage_runs trace rows. The deterministic human-gate handlers and mid-run steering live in `services/platform/src/http/missions.ts` (routes in `services/platform/src/http/hono-app.ts`), backed by the `mission_verdicts`/`mission_steering`/`mission_runs` tables in `services/platform/src/db/schema/mission.ts` and enforced against the append-only ledger in `services/platform/src/db/schema/evidence.ts`. The ASSAY≠CHALLENGE distinct-instance seam and pure-TS evidence gate live in `services/platform/src/research/`. This sprint *hardens* existing surfaces — it does not recreate them.

## Specification
- **Objective:** Ensure mid-run steering takes effect on the following cycle without restarting the workflow, and guarantee that ASSAY and CHALLENGE stages use distinct fleet model instances within a single cycle. Refuting claims must pass the same pure-TS admission gate as supporting ones. All enforcement must be observable in mission_stage_runs trace rows.
- **Success state:** Operator writes a steering row mid-run and sees the next cycle use the new instruction. A mission cycle shows two different fleet instance IDs in mission_stage_runs for assay and challenge stages. Both supporting and refuting claims pass the identical deterministic admission gate. Test suite proves this with real fleet instance IDs and concrete row state.

## Critical Constraints
### MUST
- MUST Steering instruction written to mission_steering must be read by the next cycle without workflow restart
- MUST ASSAY stage instance ID must differ from CHALLENGE stage instance ID within the same mission run
- MUST Both instances must be real fleet model IDs (not hardcoded inequality)
- MUST Refuting claims must pass the same pure-TS admission gate as supporting claims
- MUST Instance IDs must be observable in mission_stage_runs trace rows
### NEVER
- Never restart the workflow to apply steering — it must be read from the steering row mid-cycle
- Never use hardcoded instance IDs or fake inequality checks
- Never allow model choice to bypass the pure-TS admission gate
- Never mutate stage graph or template definition to enforce instance differences
### STRICTLY
- STRICTLY Steering row read must occur in every cycle after the first checkpoint
- STRICTLY Instance ID inequality must be asserted with concrete fleet IDs from stage trace
- STRICTLY Admission gate must be pure-TS with zero LLM calls (deterministic)

## Capability Chain
- **Touches:** CAP-INF-01
**Provides:**
- mid-run-steering-takes-effect-next-cycle
- assay-challenge-instance-inequality-proof
- refuting-claim-admission-parity
**Consumes:**
- mission_steering-table
- evidence-research-template
- fleet-instance-tracking
**Boundary contracts:**
- steering row alters cycle behavior without workflow restart
- ASSAY and CHALLENGE use distinct fleet model instances within one cycle
- refuting claims pass the same pure-TS admission gate as supporting claims

## Acceptance Criteria
### AC-1: Mid-run steering takes effect on next cycle [PRIMARY] [PRIMARY]
- **GIVEN:** A mission run is in 'assay' stage with cycle_index=1
- **WHEN:** Operator POSTs /api/missions/:id/steer {instruction:'Focus on recent papers only'} while cycle is running
- **THEN:** Next cycle (cycle_index=2) reads the steering row and applies the instruction without workflow restart. The steering row is visible in mission_steering and the event log.
- **Test tier:** `integration`
- **Verification service:** `mastra-workflow + Postgres`
- **Flow ref:** `UC-SVC-05/AC-2`
- **Verify:** `bun test --grep 'steering-next-cycle' services/platform/tests/integration/mission-engine-red.test.ts`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `mastra-workflow + Postgres`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - workflow restarts on every steering write (static)
    - steering row is read but ignored in next cycle (static)
    - steering read is stubbed to return empty
  - **Evidence:** artifact `db_query`, required_capture=True
  - **Case 1** — start_ref `mission-in-assay-cycle`:
    - actor: `api_client`
    - step: POST /api/missions/{runId}/steer {instruction:'Focus on recent papers only'}
    - step: Wait for next cycle to commit (poll mission_events for cycle_index=2)
    - MUST observe:
      - SELECT COUNT(*) FROM mission_steering WHERE run_id = '{runId}' AND instruction ILIKE '%recent papers%' == 1
      - mission_events row with event_type='steer' and cycle_index=2
      - stage output for cycle_index=2 reflects 'recent papers' constraint
    - MUST NOT observe:
      - workflow restart (duplicate cycle_index=1) (empty/start signature missing)
      - steering row ignored in cycle_index=2 output (count = 0 — empty)
      - mission_steering count == 0 (empty/start signature missing)

### AC-2: ASSAY≠CHALLENGE distinct instances within same cycle
- **GIVEN:** A mission run completes both assay and challenge stages in cycle_index=1
- **WHEN:** Operator inspects the mission_stage_rows trace for that run
- **THEN:** assayInstanceId and challengeInstanceId are different concrete fleet model IDs (e.g., 'fleet:model:qwen-2.5-7b:inst-001' vs 'fleet:model:qwen-2.5-7b:inst-002'). The inequality is real, not hardcoded.
- **Test tier:** `integration`
- **Verification service:** `fleet + Postgres`
- **Flow ref:** `UC-SVC-05/AC-3`
- **Verify:** `bun test --grep 'assay-challenge-distinct-instances' services/platform/tests/integration/mission-engine-red.test.ts`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `fleet + Postgres`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - both stages use the same instance ID (static)
    - instance IDs are hardcoded strings
    - instance tracking is disconnected from fleet calls
  - **Evidence:** artifact `db_query`, required_capture=True
  - **Case 1** — start_ref `mission-run-with-assay-challenge`:
    - actor: `api_client`
    - step: Query mission_stage_runs for run_id '{runId}' and stage_key IN ('assay', 'challenge')
    - step: Extract trace_id for both stages
    - step: Compare instance IDs
    - MUST observe:
      - assay_trace_id != challenge_trace_id — concrete values like `fleet:model:qwen-2.5-7b:inst-001` vs `fleet:model:qwen-2.5-7b:inst-002`
      - Both trace_ids match 'fleet:model:qwen-2.5-7b:inst-*' pattern
      - mission_stage_runs has exactly 2 rows for these stages
    - MUST NOT observe:
      - identical trace_id values (no concrete inequality)
      - hardcoded 'assay-instance' vs 'challenge-instance' strings (no new code)
      - null or empty trace_id values

### AC-3: Refuting claims pass identical admission gate
- **GIVEN:** The pure-TS evidence gate (research/gate.ts) with deterministic admission logic
- **WHEN:** A refuting claim (supports=false) reaches the gate alongside supporting claims
- **THEN:** Both claim types pass through the same pure-TS admission function with identical threshold checks. No model call occurs in the gate. Admission is deterministic from claim attributes.
- **Test tier:** `integration`
- **Verification service:** `evidence-gate + Postgres`
- **Flow ref:** `UC-SVC-05/AC-3`
- **Verify:** `bun test --grep 'refuting-claim-admission-parity' services/platform/tests/integration/mission-engine-red.test.ts`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `evidence-gate + Postgres`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - gate uses different logic for refuting vs supporting claims (static)
    - gate makes an LLM call to evaluate claims (static)
    - refuting claims are rejected deterministically (static)
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `mixed-supporting-refuting-claims`:
    - actor: `background_job`
    - step: Run evidence-gate with 3 supporting claims and 2 refuting claims
    - step: Trace gate execution path
    - step: Assert gate output contains both claim types
    - MUST observe:
      - Gate returns 5 (3 supporting + 2 refuting) claims total (3 supporting + 2 refuting)
      - Gate execution trace shows pure-TS path (no LLM calls) — trace shows 0 LLM API calls
      - Both claim types pass same threshold checks — 5 claims total (3 supporting + 2 refuting)
    - MUST NOT observe:
      - Filtering of refuting claims (empty/start signature missing)
      - LLM API calls in gate execution (empty/start signature missing)
      - Different admission logic per claim type (no concrete inequality)

### AC-4: CLI command emits ASSAY vs CHALLENGE instance IDs
- **GIVEN:** A completed mission run with assay and challenge stages
- **WHEN:** Operator runs holo mission:cycle <runId>
- **THEN:** Command outputs assayInstanceId, challengeInstanceId, and a computed assayChallengeDistinct=true field. Both IDs are concrete fleet instance IDs, not placeholders.
- **Test tier:** `integration`
- **Verification service:** `platform-cli + Postgres`
- **Flow ref:** `UC-SVC-05/AC-3`
- **Verify:** `bun test --grep 'cli-cycle-instance-ids' services/platform/tests/integration/mission-engine-red.test.ts`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `platform-cli + Postgres`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - command outputs placeholder values (static)
    - instance IDs are missing or null (static)
    - assayChallengeDistinct is hardcoded true
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `completed-mission-with-both-stages`:
    - actor: `cli_user`
    - step: Run: pnpm --filter @holocron/platform dev holo mission:cycle {runId}
    - MUST observe:
      - stdout contains 'assayInstanceId: fleet:model:qwen-2.5-7b:inst-*'
      - stdout contains 'challengeInstanceId: fleet:model:qwen-2.5-7b:inst-*'
      - stdout contains 'assayChallengeDistinct: true' with different concrete IDs
      - Both instance IDs match real fleet pattern — 2 IDs matching `fleet:model:.*:inst-.*` regex
    - MUST NOT observe:
      - placeholder values like 'assay-instance' or 'TODO' (no concrete inequality)
      - identical instance IDs (empty/start signature missing)
      - null or empty instance ID fields

## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | All steering and instance tests pass against real fleet | AC-1 | `PLATFORM_IT=1 pnpm test:integration --grep 'gate-2'` |
| TC-2 | Steering takes effect without workflow restart | AC-1 | `grep -r 'cycle_index.*2.*steering' services/platform/tests/integration/mission-engine-red.test.ts` |
| TC-3 | Instance IDs are concrete fleet values | AC-2 | `grep -E 'fleet:model:.*inst-' services/platform/tests/integration/mission-engine-red.test.ts` |
| TC-4 | Pure-TS gate has no LLM calls | AC-3 | `! grep -r 'generate|stream' services/platform/src/research/evidence-gate.ts` |

## Reading List
- `services/platform/src/http/missions.ts` (435-567) — Existing appendMissionSteeringFromHttp handler and transaction pattern
- `services/platform/src/mission/templates/evidence-research.ts` (52-67) — Assay and challenge stage definitions with role bindings
- `services/platform/src/research/inspection.ts` (1-100) — Assay/challenge instance tracking and assayChallengeDistinct computed field
- `services/platform/src/research/evidence-gate.ts` (1-50) — Pure-TS deterministic admission logic (no model calls)
- `services/platform/src/cli/holo.ts` (mission:cycle command) — Existing CLI structure for new mission:cycle command

## Guardrails
**Write allowed:**
- `services/platform/src/http/missions.ts (MODIFY for steering read coordination)`
- `services/platform/src/mission/runtime.ts (MODIFY for steering row read per cycle)`
- `services/platform/src/cli/holo.ts (MODIFY for mission:cycle command)`
- `services/platform/tests/integration/mission-engine-red.test.ts (MODIFY for RED tests)`
**Write prohibited:**
- `services/platform/src/mission/templates/* — no template changes, steering is runtime-only`
- `services/platform/src/research/evidence-gate.ts — already pure-TS, do not add model calls`
- `Any changes to role bindings in evidence-research template`

## Design
**References:**
- Sprint 15 steering handler (appendMissionSteeringFromHttp)
- Sprint 17 ASSAY≠CHALLENGE instance tracking (inspection.ts assayInstanceId, challengeInstanceId)
**Interaction notes:**
- S
- t
- e
- e
- r
- i
- n
- g
-  
- r
- o
- w
-  
- r
- e
- a
- d
-  
- m
- u
- s
- t
-  
- b
- e
-  
- a
- d
- d
- e
- d
-  
- t
- o
-  
- t
- h
- e
-  
- c
- y
- c
- l
- e
-  
- l
- o
- o
- p
-  
- a
- f
- t
- e
- r
-  
- c
- h
- e
- c
- k
- p
- o
- i
- n
- t
-  
- r
- e
- s
- u
- m
- e
- .
-  
- I
- n
- s
- t
- a
- n
- c
- e
-  
- I
- D
- s
-  
- a
- r
- e
-  
- a
- l
- r
- e
- a
- d
- y
-  
- t
- r
- a
- c
- k
- e
- d
-  
- i
- n
-  
- m
- i
- s
- s
- i
- o
- n
- _
- s
- t
- a
- g
- e
- _
- r
- u
- n
- s
- .
- t
- r
- a
- c
- e
- _
- i
- d
-  
- —
-  
- C
- L
- I
-  
- m
- u
- s
- t
-  
- q
- u
- e
- r
- y
-  
- a
- n
- d
-  
- d
- i
- s
- p
- l
- a
- y
-  
- t
- h
- e
- m
- .
- **Pattern:** Runtime steering via append-only control table (mission_steering) read by each cycle; instance tracking via fleet trace_id in stage runs
- **Pattern source:** `Sprint 15 mission_steering table pattern, Sprint 17 instance tracking in inspection.ts`
- **Anti-pattern:** Workflow restart for steering or hardcoded instance ID strings

## Verification Gates
- **RED tests written and failing**
  - command: `bun test --grep 'steering-next-cycle|assay-challenge-distinct-instances' services/platform/tests/integration/mission-engine-red.test.ts`
  - expected: Exit 1 with failures showing steering not applied or instances equal
- **All GREEN tests pass**
  - command: `PLATFORM_IT=1 pnpm test:integration --grep 'gate-2'`
  - expected: Exit 0 with 4/4 tests passing and concrete instance IDs asserted
- **CLI command outputs instance IDs**
  - command: `pnpm --filter @holocron/platform dev holo mission:cycle <runId>`
  - expected: Stdout contains concrete fleet instance IDs and assayChallengeDistinct field
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
- **Agent:** `mastra-implementer` — Mastra framework implementation with workflow steering coordination and instance tracking
- **Reviewer:** `mastra-reviewer` — adversarial seam-sufficiency + determinism review

## Evidence Gates
- RED-against-start for every behavioral AC (tdd_mode `red_first`): True
- Real-services (Postgres + fleet) integration proof required: `True`
- Fakeability: `validate_scenario.py` exit 0 on every behavioral AC (independently re-verified)

## Review Criteria
- Deterministic rules are Postgres-enforced (CHECK / SECURITY DEFINER / unique index), not handler-only
- ASSAY≠CHALLENGE uses real fleet instance ids, not hardcoded strings
- Fulcrum is an alias/instantiation of evidence-research — zero new platform code
- Every behavioral AC's scenario passes `validate_scenario.py` with zero CRITICAL/HIGH

## Dependencies
- **Depends on:** none
- **Blocks:** gate-3

## Coding Standards
- `brain/docs/coding-standards/typescript.md`
- `brain/docs/coding-standards/testing.md`
- `brain/docs/TDD-METHODOLOGY.md`

## Notes
- Generated by /kb-sprint-tasks-plan on 2026-07-21. Topological order in SPRINT.md: gate-4 (RED first) → gate-1 ∥ gate-2 → gate-3 (capstone) → gate-5 (review).
- PRD refs: UC-SVC-05, T-SVC-018, T-SVC-019.

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "gate-2",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "mission-in-assay-cycle": {
      "description": "Mission run in assay stage with cycle_index=1, ready for steering",
      "seed_method": "public_api",
      "records": [
        "INSERT INTO mission_runs (id, goal, status) VALUES ('{runId}', 'Research topic', 'assay')",
        "INSERT INTO mission_stage_runs (run_id, stage_key, cycle_index) VALUES ('{runId}', 'assay', 1)"
      ]
    },
    "mission-run-with-assay-challenge": {
      "description": "Mission run with both assay and challenge stages completed",
      "seed_method": "public_api",
      "records": [
        "INSERT INTO mission_runs (id, goal, status) VALUES ('{runId}', 'Research topic', 'challenge')",
        "INSERT INTO mission_stage_runs (run_id, stage_key, trace_id, status) VALUES ('{runId}', 'assay', 'fleet:model:qwen-2.5-7b:inst-001', 'committed')",
        "INSERT INTO mission_stage_runs (run_id, stage_key, trace_id, status) VALUES ('{runId}', 'challenge', 'fleet:model:qwen-2.5-7b:inst-002', 'committed')"
      ]
    },
    "mixed-supporting-refuting-claims": {
      "description": "Evidence-gate input with 3 supporting and 2 refuting claims",
      "seed_method": "public_api",
      "records": [
        "Seed 5 claims in claims table (3 with supports=true, 2 with supports=false)"
      ]
    },
    "completed-mission-with-both-stages": {
      "description": "Completed mission run for CLI command testing",
      "seed_method": "public_api",
      "records": [
        "INSERT INTO mission_runs (id, goal, status) VALUES ('{runId}', 'Research topic', 'completed')",
        "INSERT INTO mission_stage_runs (run_id, stage_key, trace_id, status) VALUES ('{runId}', 'assay', 'fleet:model:qwen-2.5-7b:inst-a1b2', 'committed')",
        "INSERT INTO mission_stage_runs (run_id, stage_key, trace_id, status) VALUES ('{runId}', 'challenge', 'fleet:model:qwen-2.5-7b:inst-x9y8', 'committed')"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN: A mission run is in 'assay' stage with cycle_index=1. WHEN: Operator POSTs /api/missions/:id/steer {instruction:'Focus on recent papers only'} while cycle is running. THEN: Next cycle (cycle_index=2) reads the steering row and applies the instruction without workflow restart. The steering row is visible in mission_steering and the event log.",
      "verify": "bun test --grep 'steering-next-cycle' services/platform/tests/integration/mission-engine-red.test.ts"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN: A mission run completes both assay and challenge stages in cycle_index=1. WHEN: Operator inspects the mission_stage_rows trace for that run. THEN: assayInstanceId and challengeInstanceId are different concrete fleet model IDs (e.g., 'fleet:model:qwen-2.5-7b:inst-001' vs 'fleet:model:qwen-2.5-7b:inst-002'). The inequality is real, not hardcoded.",
      "verify": "bun test --grep 'assay-challenge-distinct-instances' services/platform/tests/integration/mission-engine-red.test.ts"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN: The pure-TS evidence gate (research/gate.ts) with deterministic admission logic. WHEN: A refuting claim (supports=false) reaches the gate alongside supporting claims. THEN: Both claim types pass through the same pure-TS admission function with identical threshold checks. No model call occurs in the gate. Admission is deterministic from claim attributes.",
      "verify": "bun test --grep 'refuting-claim-admission-parity' services/platform/tests/integration/mission-engine-red.test.ts"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN: A completed mission run with assay and challenge stages. WHEN: Operator runs holo mission:cycle <runId>. THEN: Command outputs assayInstanceId, challengeInstanceId, and a computed assayChallengeDistinct=true field. Both IDs are concrete fleet instance IDs, not placeholders.",
      "verify": "bun test --grep 'cli-cycle-instance-ids' services/platform/tests/integration/mission-engine-red.test.ts"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "All steering and instance tests pass against real fleet",
      "verify": "PLATFORM_IT=1 pnpm test:integration --grep 'gate-2'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Steering takes effect without workflow restart",
      "verify": "grep -r 'cycle_index.*2.*steering' services/platform/tests/integration/mission-engine-red.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Instance IDs are concrete fleet values",
      "verify": "grep -E 'fleet:model:.*inst-' services/platform/tests/integration/mission-engine-red.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Pure-TS gate has no LLM calls",
      "verify": "! grep -r 'generate|stream' services/platform/src/research/evidence-gate.ts",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
