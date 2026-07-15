# ledger-4 — RED tests: direct DML rejected, atomic supersession, stale-concurrent rejection, as-of chain

## What this does

Write RED test suite asserting immutability guarantees in failing-first mode.

Provides: immutability-red-suite.

## Why

- MUST: Write failing tests for direct DML rejection
- MUST: Write failing tests for atomic supersession
- MUST: Write failing tests for stale-concurrent rejection
- NEVER: Write tests that pass without implementation
- NEVER: Mock database responses
- NEVER: Write unit tests instead of integration
- STRICTLY: Tests written BEFORE implementation
- STRICTLY: Tests use real Postgres privileges
- STRICTLY: Tests verify DB-level enforcement
- Grounded in: UC-DATA-02, T-PLAT-004, T-DATA-005, T-DATA-006, T-DATA-007, T-DATA-008, T-DATA-022

## How to verify

- `ls tests/integration/service/RED/*.RED.test.ts` → Exit 0
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/RED/*.RED.test.ts` → Exit non-zero

## Scope

Writes: tests/integration/service/RED/ (NEW)

Prohibited: services/platform/src/ · tests/integration/service/ (OTHER)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: ledger-4 — RED tests: direct DML rejected, atomic supersession, stale-concurrent rejection, as-of chain
================================================================================

TASK_TYPE:  QA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (180 min)
AGENT:      implementer=red-test-generator | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: false)
CAPABILITY: N/A
SPRINT:     [Sprint 7 — Evidence-Graph Substrate and Ledger Immutability](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Write RED test suite asserting immutability guarantees in failing-first mode.
All RED tests committed and failing; running suite shows failures; tests document expected behavior.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Write failing tests for direct DML rejection
- MUST Write failing tests for atomic supersession
- MUST Write failing tests for stale-concurrent rejection
- MUST Write failing tests for as-of chain
- MUST Write failing tests for net-support
- MUST Write failing tests for canonical corpus
- MUST All tests use PLATFORM_IT=1 against real Postgres
- MUST All tests are RED when committed
- NEVER Write tests that pass without implementation
- NEVER Mock database responses
- NEVER Write unit tests instead of integration
- STRICTLY Tests written BEFORE implementation
- STRICTLY Tests use real Postgres privileges
- STRICTLY Tests verify DB-level enforcement

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Direct DML rejection tests written and failing (flow_ref T-PLAT-004, T-DATA-006)
- [ ] AC-2: Atomic supersession tests written and failing (flow_ref T-DATA-006)
- [ ] AC-3: Stale-concurrent rejection tests written and failing (flow_ref T-DATA-006)
- [ ] AC-4: As-of chain tests written and failing (flow_ref T-DATA-005)
- [ ] AC-5: Net-support tests written and failing (flow_ref T-DATA-008)
- [ ] `PLATFORM_IT=1 pnpm vitest run` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 Direct DML rejection tests written and failing (flow_ref T-PLAT-004, T-DATA-006)
  GIVEN: Postgres with schema but WITHOUT immutability migration
  WHEN:  Running RED test suite
  THEN:  Tests fail because UPDATE/DELETE do not raise permission denied
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none

AC-2 Atomic supersession tests written and failing (flow_ref T-DATA-006)
  GIVEN: Postgres WITHOUT revise_belief
  WHEN:  Running RED tests
  THEN:  Tests fail because function does not exist
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none

AC-3 Stale-concurrent rejection tests written and failing (flow_ref T-DATA-006)
  GIVEN: Postgres WITHOUT stale detection
  WHEN:  Running RED tests
  THEN:  Tests fail because no exception raised
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none

AC-4 As-of chain tests written and failing (flow_ref T-DATA-005)
  GIVEN: Postgres WITHOUT as-of queries
  WHEN:  Running RED tests
  THEN:  Tests fail because queries do not exist
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none

AC-5 Net-support tests written and failing (flow_ref T-DATA-008)
  GIVEN: Postgres WITHOUT net-support query
  WHEN:  Running RED tests
  THEN:  Tests fail because query missing
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- tests/integration/service/RED/ (NEW)
writeProhibited: services/platform/src/, tests/integration/service/ (OTHER)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. tests/integration/service/ Existing test structure
2. services/platform/src/db/schema/evidence.ts Evidence structure
3. .spec/prds/mk6-migration/tasks/sprint-07-*/ PRD AC/TC mapping

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- red-tests-exist: `ls tests/integration/service/RED/*.RED.test.ts` → Exit 0
- red-tests-fail: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/RED/*.RED.test.ts` → Exit non-zero

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: All tests use PLATFORM_IT=1 · Tests hit real Postgres · Test names map 1:1 to PRD
Should verify: immutability enforced at DB (REVOKE + SECURITY DEFINER fn) · bi-temporal as-of correctness · no app code bypasses revise_belief · real Postgres only (PLATFORM_IT=1)
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: ledger-1 · Blocks: none

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "ledger-4",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": false
  },
  "fixtures": {
    "unprotected-schema-db": {
      "description": "Schema WITHOUT immutability migration",
      "seed_method": "public_api",
      "records": [
        "holo db:migrate up to 0002_*",
        "Verify revise_belief missing",
        "Verify app role has UPDATE/DELETE"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN Postgres with schema but WITHOUT immutability migration WHEN Running RED test suite THEN Tests fail because UPDATE/DELETE do not raise permission denied",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/RED/immutability-dml-rejection.RED.test.ts (expected: fail)",
      "maps_to_ac": null,
      "scenario": null,
      "flow_ref": "T-PLAT-004, T-DATA-006"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Postgres WITHOUT revise_belief WHEN Running RED tests THEN Tests fail because function does not exist",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/RED/immutability-atomic-revision.RED.test.ts (expected: fail)",
      "maps_to_ac": null,
      "scenario": null,
      "flow_ref": "T-DATA-006"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Postgres WITHOUT stale detection WHEN Running RED tests THEN Tests fail because no exception raised",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/RED/immutability-concurrent-reject.RED.test.ts (expected: fail)",
      "maps_to_ac": null,
      "scenario": null,
      "flow_ref": "T-DATA-006"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Postgres WITHOUT as-of queries WHEN Running RED tests THEN Tests fail because queries do not exist",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/RED/evidence-asof-chain.RED.test.ts (expected: fail)",
      "maps_to_ac": null,
      "scenario": null,
      "flow_ref": "T-DATA-005"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Postgres WITHOUT net-support query WHEN Running RED tests THEN Tests fail because query missing",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/RED/evidence-net-support.RED.test.ts (expected: fail)",
      "maps_to_ac": null,
      "scenario": null,
      "flow_ref": "T-DATA-008"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Direct DML rejection tests are written and failing",
      "verify": "ls tests/integration/service/RED/immutability-dml-rejection.RED.test.ts && PLATFORM_IT=1 pnpm vitest run (expected: fail)",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Atomic supersession tests are written and failing",
      "verify": "ls tests/integration/service/RED/immutability-atomic-revision.RED.test.ts && PLATFORM_IT=1 pnpm vitest run (expected: fail)",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Stale-concurrent rejection tests are written and failing",
      "verify": "ls tests/integration/service/RED/immutability-concurrent-reject.RED.test.ts && PLATFORM_IT=1 pnpm vitest run (expected: fail)",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "As-of chain tests are written and failing",
      "verify": "ls tests/integration/service/RED/evidence-asof-chain.RED.test.ts && PLATFORM_IT=1 pnpm vitest run (expected: fail)",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Net-support tests are written and failing",
      "verify": "ls tests/integration/service/RED/evidence-net-support.RED.test.ts && PLATFORM_IT=1 pnpm vitest run (expected: fail)",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
</details>
