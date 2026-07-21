# gate-1: Deterministic human-gate handlers — verdicts, WIP=1, cited-kill, probe-gated advance
> Status: ⬜ Pending

- **Sprint:** [Sprint 23: Deterministic Human Gate, Steering and Fulcrum Seams](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `L`
- **Estimate:** `240 minutes`
- **Agent:** `mastra-implementer` — Mastra framework implementation with deterministic Postgres handlers and human-gate logic
- **Reviewer:** `mastra-reviewer`
- **Proposed By:** `mastra-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
Hardening Sprint 15 verdict handlers (appendMissionVerdictFromHttp, createMissionRunFromHttp) to deterministically enforce three human-gate rules: (1) reject uncited kill verdicts, (2) refuse WIP>1 by blocking second concurrent build on same subject, (3) refuse advance→validated transitions without recorded probe evidence. All enforcement must survive handler restart and be visible in Postgres row state.

## Background
This task is part of Sprint 23: Deterministic Human Gate, Steering and Fulcrum Seams (UC-SVC-05; T-SVC-017…020). Hardening Sprint 15 verdict handlers (appendMissionVerdictFromHttp, createMissionRunFromHttp) to deterministically enforce three human-gate rules: (1) reject uncited kill verdicts, (2) refuse WIP>1 by blocking second concurrent build on same subject, (3) refuse advance→validated transitions without recorded probe evidence. All enforcement must survive handler restart and be visible in Postgres row state. The deterministic human-gate handlers and mid-run steering live in `services/platform/src/http/missions.ts` (routes in `services/platform/src/http/hono-app.ts`), backed by the `mission_verdicts`/`mission_steering`/`mission_runs` tables in `services/platform/src/db/schema/mission.ts` and enforced against the append-only ledger in `services/platform/src/db/schema/evidence.ts`. The ASSAY≠CHALLENGE distinct-instance seam and pure-TS evidence gate live in `services/platform/src/research/`. This sprint *hardens* existing surfaces — it does not recreate them.

## Specification
- **Objective:** Hardening Sprint 15 verdict handlers (appendMissionVerdictFromHttp, createMissionRunFromHttp) to deterministically enforce three human-gate rules: (1) reject uncited kill verdicts, (2) refuse WIP>1 by blocking second concurrent build on same subject, (3) refuse advance→validated transitions without recorded probe evidence. All enforcement must survive handler restart and be visible in Postgres row state.
- **Success state:** A human operator POSTing verdicts or starting builds sees deterministic rejections (403/422) when rules are violated, with exactly zero partial writes to mission_verdicts/mission_runs. The ledger remains append-only. Test suite proves each rejection with concrete row counts and status codes against real Postgres.

## Critical Constraints
### MUST
- MUST Enforce uncited kill rejection BEFORE INSERT to mission_verdicts — handler must return 403/422
- MUST Refuse second concurrent build on same subject via WIP=1 check — exactly one active mission_runs row per subject
- MUST Refuse advance→validated transition without probe evidence — query ledger before verdict INSERT
- MUST All checks must be Postgres-enforced (CHECK constraints or SECURITY DEFINER functions) — not handler-only validation
- MUST Return deterministic error codes: UNCITED_KILL_REJECTED, WIP_ONE_EXCEEDED, PROBE_REQUIRED_FOR_VALIDATED
### NEVER
- Never allow a model choice to substitute for deterministic enforcement
- Never allow partial writes on rule violation — transaction must rollback before client response
- Never mutate the append-only evidence ledger (sources/passages/claims/beliefs tables) in these handlers
- Never add new platform code to implement human gate — harden existing Sprint 15 surfaces only
### STRICTLY
- STRICTLY All three rules must be enforced in the same transaction BEFORE verdict INSERT
- STRICTLY Fixtures must use real Postgres row counts and concrete status codes — no stub assertions
- STRICTLY Every rule must fail if the underlying check is disconnected or stubbed

## Capability Chain
- **Touches:** CAP-INF-01
**Provides:**
- deterministic-kill-citation-check
- wip-one-subject-lock
- probe-gated-advance-transition
**Consumes:**
- mission-verdicts-table
- mission-steering-table
- evidence-ledger-tables
**Boundary contracts:**
- human-gate verdicts enforce against append-only ledger
- concurrent build refusal via WIP=1 subject lock
- advance→validated transition requires recorded probe

## Acceptance Criteria
### AC-1: Uncited kill verdict rejected deterministically [PRIMARY] [PRIMARY]
- **GIVEN:** An active mission run exists in mission_runs with status='running' and no belief rows in the append-only ledger citing the research subject
- **WHEN:** Operator POSTs /api/missions/:id/verdicts {verdict:'kill', rationale:'Kill this research'} without a citation field or with empty citation
- **THEN:** Handler returns 422 with error code UNCITED_KILL_REJECTED and zero mission_verdicts rows are inserted for this run. Transaction rolls back completely.
- **Test tier:** `integration`
- **Verification service:** `platform-http-handler + Postgres`
- **Flow ref:** `UC-SVC-05/AC-1`
- **Verify:** `bun test --grep 'uncited-kill-rejected' services/platform/tests/integration/mission-engine-red.test.ts`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `platform-http-handler + Postgres`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - handler is a no-op that inserts without check
    - citation check is stubbed to always return true
    - belief ledger query is disconnected/mocked
  - **Evidence:** artifact `api_response`, required_capture=True
  - **Case 1** — start_ref `active-mission-run-no-beliefs`:
    - actor: `api_client`
    - step: POST /api/missions/{runId}/verdicts {verdict:'kill', rationale:'Kill without evidence'}
    - MUST observe:
      - response status 422
      - body.code == 'UNCITED_KILL_REJECTED'
      - SELECT COUNT(*) FROM mission_verdicts WHERE run_id = '{runId}' == 0
    - MUST NOT observe:
      - any mission_verdicts row for the run (count = 0 — empty)
      - response status 200 (the start signature — 403/422 required)
      - partial insert followed by rollback (count = 0 — empty)

### AC-2: Second concurrent build refused (WIP=1)
- **GIVEN:** One active mission run exists with subject='quantum computing applications' and status='running'
- **WHEN:** Operator POSTs /api/missions with goal='Research quantum computing applications' (same subject)
- **THEN:** Handler returns 403 with error code WIP_ONE_EXCEEDED and zero new mission_runs rows are inserted. Existing run remains untouched.
- **Test tier:** `integration`
- **Verification service:** `platform-http-handler + Postgres`
- **Flow ref:** `UC-SVC-05/AC-1`
- **Verify:** `bun test --grep 'wip-one-refused' services/platform/tests/integration/mission-engine-red.test.ts`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `platform-http-handler + Postgres`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - handler skips subject match check (handler is stubbed)
    - WIP query is mocked to return 0 always
    - check is handler-only without Postgres constraint (handler is stubbed)
  - **Evidence:** artifact `api_response`, required_capture=True
  - **Case 1** — start_ref `one-active-mission-run`:
    - actor: `api_client`
    - step: POST /api/missions {goal:'Research quantum computing applications'}
    - MUST observe:
      - response status 403
      - body.code == 'WIP_ONE_EXCEEDED'
      - SELECT COUNT(*) FROM mission_runs WHERE status = 'running' AND goal ILIKE '%quantum computing%' == 1
    - MUST NOT observe:
      - second mission_runs row for the subject (count = 0 — empty)
      - response status 200 (the start signature — 403/422 required)
      - existing run status mutation (empty/start signature missing)

### AC-3: Advance to validated refused without recorded probe
- **GIVEN:** An active mission run exists with status='assay_challenge' and zero probe rows in mission_stage_runs (stage_kind='research.plan@1' output missing)
- **WHEN:** Operator POSTs /api/missions/:id/verdicts {verdict:'advance', rationale:'Advance to validated'}
- **THEN:** Handler returns 403 with error code PROBE_REQUIRED_FOR_VALIDATED and zero mission_verdicts rows are inserted. Run status remains unchanged.
- **Test tier:** `integration`
- **Verification service:** `platform-http-handler + Postgres`
- **Flow ref:** `UC-SVC-05/AC-1`
- **Verify:** `bun test --grep 'unprobed-advance-refused' services/platform/tests/integration/mission-engine-red.test.ts`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `platform-http-handler + Postgres`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - handler skips probe check (handler is stubbed)
    - probe query is mocked to return a fake probe row
    - check is handler-only without ledger validation (handler is stubbed)
  - **Evidence:** artifact `api_response`, required_capture=True
  - **Case 1** — start_ref `mission-run-no-probe`:
    - actor: `api_client`
    - step: POST /api/missions/{runId}/verdicts {verdict:'advance', rationale:'Advance to validated'}
    - MUST observe:
      - response status 403
      - body.code == 'PROBE_REQUIRED_FOR_VALIDATED'
      - SELECT COUNT(*) FROM mission_stage_runs WHERE run_id = '{runId}' AND stage_kind = 'research.plan@1' AND status = 'committed' == 0
    - MUST NOT observe:
      - mission_verdicts row inserted (count = 0 — empty)
      - response status 200 (the start signature — 403/422 required)
      - run status change to 'validated' (empty/start signature missing)

### AC-4: Postgres-enforced constraints survive handler restart
- **GIVEN:** A handler crash mid-transaction with a rule violation in progress
- **WHEN:** Handler process restarts and operator retries the same request
- **THEN:** Postgres transaction has rolled back completely. Idempotency key replay returns the persisted rejection without re-executing logic. No partial rows exist.
- **Test tier:** `integration`
- **Verification service:** `platform-http-handler + Postgres`
- **Flow ref:** `UC-SVC-05/AC-1`
- **Verify:** `bun test --grep 'postgres-rollback-survives-handler-crash' services/platform/tests/integration/mission-engine-red.test.ts`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration`
  - **Verification service:** `platform-http-handler + Postgres`
  - **Topology:** `single-node`
  - **Negative control — would fail if:
    - transaction is not atomic across checks (check is stubbed to return empty)
    - handler crash leaves partial rows (handler is stubbed)
    - idempotency replay re-executes instead of returning cached rejection (static)
  - **Evidence:** artifact `db_query`, required_capture=True
  - **Case 1** — start_ref `active-mission-run-before-crash`:
    - actor: `background_job`
    - step: Start handler POST /api/missions/{runId}/verdicts {verdict:'kill'}
    - step: Kill handler process after rule check but before INSERT
    - step: Restart handler
    - step: Replay same verdict POST with identical requestKey
    - MUST observe:
      - second request returns 403/422 immediately (cached rejection)
      - SELECT COUNT(*) FROM mission_verdicts WHERE run_id = '{runId}' == 0
      - request_key conflict returns persisted rejection without re-execution — cached 403/422 response served
    - MUST NOT observe:
      - partial mission_verdicts row (count = 0 — empty)
      - double execution of rule checks (empty/start signature missing)
      - response status 200 (the start signature — 403/422 required)

## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Integration test suite runs with PLATFORM_IT=1 and real Postgres | AC-1 | `PLATFORM_IT=1 pnpm test:integration --grep 'gate-1'` |
| TC-2 | All rule rejections return deterministic error codes | AC-1 | `grep -r 'UNCITED_KILL_REJECTED|WIP_ONE_EXCEEDED|PROBE_REQUIRED_FOR_VALIDATED' services/platform/tests/integration/mission-engine-red.test.ts` |
| TC-3 | Zero mutations to append-only evidence ledger in gate handlers | AC-1 | `! grep -E 'INSERT|UPDATE|DELETE.*sources|passages|claims|beliefs' services/platform/src/http/missions.ts` |
| TC-4 | Postgres constraints or SECURITY DEFINER functions enforce rules | AC-4 | `grep -E 'CHECK.*SECURITY DEFINER' services/platform/src/db/**/*.sql` |

## Reading List
- `services/platform/src/http/missions.ts` (569-700) — Existing appendMissionVerdictFromHttp handler structure and transaction pattern
- `services/platform/src/db/schema/mission.ts` (313-331) — mission_verdicts table schema with unique index on (run_id, request_key)
- `services/platform/src/db/schema/evidence.ts` (32-174) — Append-only ledger tables (sources, passages, claims, beliefs) with bi-temporal windows
- `services/platform/tests/integration/mission-engine-red.test.ts` (2399-2456) — Existing deterministic rejection test pattern for reference
- `/Users/inference1/Projects/brain/docs/TDD-METHODOLOGY.md` (RED-GREEN-REFACTOR cycle) — Per-AC TDD workflow with real Postgres verification

## Guardrails
**Write allowed:**
- `services/platform/src/http/missions.ts (MODIFY)`
- `services/platform/src/db/schema/mission.ts (MODIFY for constraints)`
- `services/platform/src/db/migrations/* (NEW for CHECK constraints)`
- `services/platform/tests/integration/mission-engine-red.test.ts (MODIFY for new RED tests)`
**Write prohibited:**
- `services/platform/src/db/schema/evidence.ts — NEVER mutate append-only ledger schema in gate tasks`
- `Any migration that adds INSERT/UPDATE/DELETE privileges on beliefs table to app role`
- `services/platform/src/mission/templates/* — no template changes in this task`

## Design
**References:**
- Sprint 15 control surface (hono-app.ts POST /api/missions/:id/verdicts, POST /api/missions/:id/steer)
- Existing idempotency key pattern in appendMissionVerdictFromHttp (lines 569-700)
**Interaction notes:**
- A
- l
- l
-  
- t
- h
- r
- e
- e
-  
- r
- u
- l
- e
- s
-  
- m
- u
- s
- t
-  
- c
- h
- e
- c
- k
-  
- i
- n
-  
- t
- h
- e
-  
- s
- a
- m
- e
-  
- t
- r
- a
- n
- s
- a
- c
- t
- i
- o
- n
-  
- B
- E
- F
- O
- R
- E
-  
- v
- e
- r
- d
- i
- c
- t
-  
- I
- N
- S
- E
- R
- T
- .
-  
- U
- s
- e
-  
- S
- E
- L
- E
- C
- T
-  
- F
- O
- R
-  
- U
- P
- D
- A
- T
- E
-  
- o
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
- r
- u
- n
- s
-  
- t
- o
-  
- p
- r
- e
- v
- e
- n
- t
-  
- r
- a
- c
- e
-  
- c
- o
- n
- d
- i
- t
- i
- o
- n
- s
-  
- o
- n
-  
- W
- I
- P
- =
- 1
-  
- c
- h
- e
- c
- k
- .
- **Pattern:** Postgres-first deterministic enforcement: CHECK constraints for state transitions, SECURITY DEFINER functions for complex queries (belief citation check), unique indexes for idempotency
- **Pattern source:** `Sprint 07 immutable ledger migrations (0004_beliefs_immutability_revise.sql) for SECURITY DEFINER pattern`
- **Anti-pattern:** Handler-only validation that can be bypassed or leaves partial state on crash

## Verification Gates
- **RED tests written and failing**
  - command: `bun test --grep 'uncited-kill-rejected|wip-one-refused|unprobed-advance-refused' services/platform/tests/integration/mission-engine-red.test.ts`
  - expected: Exit 1 with concrete assertion failures showing rejection does not occur
- **All GREEN tests pass**
  - command: `PLATFORM_IT=1 pnpm test:integration --grep 'gate-1'`
  - expected: Exit 0 with 4/4 tests passing and concrete row counts asserted
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
- **Agent:** `mastra-implementer` — Mastra framework implementation with deterministic Postgres handlers and human-gate logic
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
- PRD refs: UC-SVC-05, T-SVC-017.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "gate-1",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "active-mission-run-no-beliefs": {
      "description": "One mission_runs row with status='running' and zero beliefs rows citing the subject",
      "seed_method": "public_api",
      "records": [
        "INSERT INTO mission_runs (id, goal, status) VALUES ('{runId}', 'Research quantum computing', 'running')",
        "SELECT COUNT(*) FROM beliefs WHERE subject ILIKE '%quantum%' == 0"
      ]
    },
    "one-active-mission-run": {
      "description": "Single active mission run for subject 'quantum computing applications'",
      "seed_method": "public_api",
      "records": [
        "INSERT INTO mission_runs (id, goal, status, subject) VALUES ('{runId}', 'Research quantum computing applications', 'running', 'quantum computing applications')"
      ]
    },
    "mission-run-no-probe": {
      "description": "Mission run in assay_challenge stage with no committed probe stage run",
      "seed_method": "public_api",
      "records": [
        "INSERT INTO mission_runs (id, goal, status) VALUES ('{runId}', 'Research topic', 'assay_challenge')",
        "SELECT COUNT(*) FROM mission_stage_runs WHERE run_id = '{runId}' AND stage_kind = 'research.plan@1' AND status = 'committed' == 0"
      ]
    },
    "active-mission-run-before-crash": {
      "description": "Active mission run positioned before handler crash simulation",
      "seed_method": "public_api",
      "records": [
        "INSERT INTO mission_runs (id, goal, status) VALUES ('{runId}', 'Research crash recovery', 'running')"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN: An active mission run exists in mission_runs with status='running' and no belief rows in the append-only ledger citing the research subject. WHEN: Operator POSTs /api/missions/:id/verdicts {verdict:'kill', rationale:'Kill this research'} without a citation field or with empty citation. THEN: Handler returns 422 with error code UNCITED_KILL_REJECTED and zero mission_verdicts rows are inserted for this run. Transaction rolls back completely.",
      "verify": "bun test --grep 'uncited-kill-rejected' services/platform/tests/integration/mission-engine-red.test.ts"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN: One active mission run exists with subject='quantum computing applications' and status='running'. WHEN: Operator POSTs /api/missions with goal='Research quantum computing applications' (same subject). THEN: Handler returns 403 with error code WIP_ONE_EXCEEDED and zero new mission_runs rows are inserted. Existing run remains untouched.",
      "verify": "bun test --grep 'wip-one-refused' services/platform/tests/integration/mission-engine-red.test.ts"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN: An active mission run exists with status='assay_challenge' and zero probe rows in mission_stage_runs (stage_kind='research.plan@1' output missing). WHEN: Operator POSTs /api/missions/:id/verdicts {verdict:'advance', rationale:'Advance to validated'}. THEN: Handler returns 403 with error code PROBE_REQUIRED_FOR_VALIDATED and zero mission_verdicts rows are inserted. Run status remains unchanged.",
      "verify": "bun test --grep 'unprobed-advance-refused' services/platform/tests/integration/mission-engine-red.test.ts"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN: A handler crash mid-transaction with a rule violation in progress. WHEN: Handler process restarts and operator retries the same request. THEN: Postgres transaction has rolled back completely. Idempotency key replay returns the persisted rejection without re-executing logic. No partial rows exist.",
      "verify": "bun test --grep 'postgres-rollback-survives-handler-crash' services/platform/tests/integration/mission-engine-red.test.ts"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Integration test suite runs with PLATFORM_IT=1 and real Postgres",
      "verify": "PLATFORM_IT=1 pnpm test:integration --grep 'gate-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "All rule rejections return deterministic error codes",
      "verify": "grep -r 'UNCITED_KILL_REJECTED|WIP_ONE_EXCEEDED|PROBE_REQUIRED_FOR_VALIDATED' services/platform/tests/integration/mission-engine-red.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Zero mutations to append-only evidence ledger in gate handlers",
      "verify": "! grep -E 'INSERT|UPDATE|DELETE.*sources|passages|claims|beliefs' services/platform/src/http/missions.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Postgres constraints or SECURITY DEFINER functions enforce rules",
      "verify": "grep -E 'CHECK.*SECURITY DEFINER' services/platform/src/db/**/*.sql",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
