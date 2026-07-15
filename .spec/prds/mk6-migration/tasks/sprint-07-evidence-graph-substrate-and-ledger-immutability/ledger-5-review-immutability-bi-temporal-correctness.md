# ledger-5 — Review immutability + bi-temporal correctness

## What this does

Adversarially review immutability and bi-temporal implementation.

Provides: immutability-review-findings.

## Why

- MUST: Validate DB privilege enforcement
- MUST: Verify no bypasses
- MUST: Verify SECURITY DEFINER
- NEVER: Accept app-layer enforcement
- NEVER: Accept missing tripwire
- NEVER: Accept incomplete temporal
- STRICTLY: Grep patterns detect stubs
- STRICTLY: Validate real Postgres proof
- STRICTLY: Check tripwire coverage
- Grounded in: UC-DATA-02, T-PLAT-004, T-DATA-005, T-DATA-006, T-DATA-007, T-DATA-008, T-DATA-022

## How to verify

- `cat .spec/prds/mk6-migration/tasks/sprint-07-*/review-findings.md` → File exists

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-07-*/review-findings.md (NEW)

Prohibited: services/platform/src/ · tests/

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: ledger-5 — Review immutability + bi-temporal correctness
================================================================================

TASK_TYPE:  REVIEW
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (90 min)
AGENT:      implementer=mastra-reviewer | reviewer=mastra-reviewer
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
Adversarially review immutability and bi-temporal implementation.
Review confirms enforcement, atomicity, rejection, idempotency, as-of, net-support, corpus, no stubs, real Postgres, tripwire coverage.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Validate DB privilege enforcement
- MUST Verify no bypasses
- MUST Verify SECURITY DEFINER
- MUST Verify supersession atomicity
- MUST Verify stale rejection
- MUST Verify idempotency
- MUST Verify as-of correctness
- MUST Verify net-support filtering
- MUST Verify corpus unification
- MUST Detect stubs
- MUST Validate real Postgres tests
- NEVER Accept app-layer enforcement
- NEVER Accept missing tripwire
- NEVER Accept incomplete temporal

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: DB privilege enforcement verified (flow_ref T-PLAT-004, T-DATA-006)
- [ ] AC-2: Supersession atomicity verified (flow_ref T-DATA-006)
- [ ] AC-3: As-of bi-temporal verified (flow_ref T-DATA-005)
- [ ] AC-4: Net-support validity filtering verified (flow_ref T-DATA-008)
- [ ] AC-5: No stubs or bypasses detected (flow_ref T-PLAT-004, T-DATA-006)
- [ ] `PLATFORM_IT=1 pnpm vitest run` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 DB privilege enforcement verified (flow_ref T-PLAT-004, T-DATA-006)
  GIVEN: ledger-2 implementation
  WHEN:  Reviewing migration and privileges
  THEN:  REVOKE/GRANT present, SECURITY DEFINER correct
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none

AC-2 Supersession atomicity verified (flow_ref T-DATA-006)
  GIVEN: ledger-2 implementation
  WHEN:  Reviewing function SQL
  THEN:  SELECT FOR UPDATE, stale check, atomic transaction
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none

AC-3 As-of bi-temporal verified (flow_ref T-DATA-005)
  GIVEN: ledger-3 implementation
  WHEN:  Reviewing queries
  THEN:  Both dimensions filtered, NULL handled
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none

AC-4 Net-support validity filtering verified (flow_ref T-DATA-008)
  GIVEN: ledger-3 implementation
  WHEN:  Reviewing net-support
  THEN:  Validity window filtered, SQL-based
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none

AC-5 No stubs or bypasses detected (flow_ref T-PLAT-004, T-DATA-006)
  GIVEN: Implementations complete
  WHEN:  Running grep patterns
  THEN:  No fake returns, no mocks, no bypasses, real Postgres, tripwire coverage
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-07-*/review-findings.md (NEW)
writeProhibited: services/platform/src/, tests/

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/db/migrations/0003_*.sql REVOKE/GRANT and function
2. tests/integration/service/immutability-*.test.ts Immutability tests
3. tests/integration/service/evidence-*.test.ts As-of and net-support tests
4. services/platform/src/db/evidence/ Query helpers
5. services/platform/src/cli/holo.ts CLI commands

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- review-complete: `cat .spec/prds/mk6-migration/tasks/sprint-07-*/review-findings.md` → File exists

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: Grep patterns detect stubs · Real Postgres verification · Check tripwire coverage · Validate bi-temporal
Should verify: immutability enforced at DB (REVOKE + SECURITY DEFINER fn) · bi-temporal as-of correctness · no app code bypasses revise_belief · real Postgres only (PLATFORM_IT=1)
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: ledger-2, ledger-3, ledger-4 · Blocks: none

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "ledger-5",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": false
  },
  "fixtures": {
    "implementation-complete": {
      "description": "All implementations complete",
      "seed_method": "public_api",
      "records": [
        "ledger-2: migration applied",
        "ledger-3: queries implemented",
        "ledger-4: tests pass",
        "All tests pass with PLATFORM_IT=1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN ledger-2 implementation WHEN Reviewing migration and privileges THEN REVOKE/GRANT present, SECURITY DEFINER correct",
      "verify": "mastra-reviewer validates migration SQL and Postgres",
      "maps_to_ac": null,
      "scenario": null,
      "flow_ref": "T-PLAT-004, T-DATA-006"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN ledger-2 implementation WHEN Reviewing function SQL THEN SELECT FOR UPDATE, stale check, atomic transaction",
      "verify": "mastra-reviewer validates function",
      "maps_to_ac": null,
      "scenario": null,
      "flow_ref": "T-DATA-006"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN ledger-3 implementation WHEN Reviewing queries THEN Both dimensions filtered, NULL handled",
      "verify": "mastra-reviewer validates query SQL",
      "maps_to_ac": null,
      "scenario": null,
      "flow_ref": "T-DATA-005"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN ledger-3 implementation WHEN Reviewing net-support THEN Validity window filtered, SQL-based",
      "verify": "mastra-reviewer validates query",
      "maps_to_ac": null,
      "scenario": null,
      "flow_ref": "T-DATA-008"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Implementations complete WHEN Running grep patterns THEN No fake returns, no mocks, no bypasses, real Postgres, tripwire coverage",
      "verify": "mastra-reviewer grep patterns",
      "maps_to_ac": null,
      "scenario": null,
      "flow_ref": "T-PLAT-004, T-DATA-006"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "DB privilege enforcement correct",
      "verify": "mastra-reviewer validates REVOKE/GRANT",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Supersession atomicity correct",
      "verify": "mastra-reviewer validates SELECT FOR UPDATE",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "As-of uses both dimensions",
      "verify": "mastra-reviewer validates bi-temporal",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Net-support filters validity",
      "verify": "mastra-reviewer validates filtering",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "No stubs or bypasses",
      "verify": "mastra-reviewer grep patterns",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
</details>
