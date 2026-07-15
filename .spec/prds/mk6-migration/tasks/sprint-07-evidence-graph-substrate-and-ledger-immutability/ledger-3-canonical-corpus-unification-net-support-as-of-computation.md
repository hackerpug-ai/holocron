# ledger-3 — Canonical corpus unification + net-support / as-of computation

## What this does

Implement query helpers and CLI commands for as-of temporal queries, net-support computation, and canonical corpus registration.

Provides: as-of-queries, net-support-computation, canonical-corpus-registration.

## Why

- MUST: Implement evidence:belief --as-of <tx>
- MUST: Compute net-support from validity-windowed relations
- MUST: Implement evidence:register-doc <id>
- NEVER: Duplicate passages for registered docs
- NEVER: Compute net-support without validity filtering
- NEVER: Use simple WHERE tx_to IS NULL without as-of
- STRICTLY: All queries use real Postgres (PLATFORM_IT=1)
- STRICTLY: As-of filters both dimensions
- STRICTLY: Net-support is SQL-based
- Grounded in: UC-DATA-02, T-DATA-005, T-DATA-007, T-DATA-008, T-DATA-022

## How to verify

- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-*.test.ts` → Exit 0

## Scope

Writes: services/platform/src/cli/holo.ts (MODIFY) · services/platform/src/db/evidence/ (NEW) · tests/integration/service/evidence-*.test.ts (NEW)

Prohibited: services/platform/src/db/schema/evidence.ts · services/platform/src/db/migrations/ · services/platform/src/db/

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: ledger-3 — Canonical corpus unification + net-support / as-of computation
================================================================================

TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (210 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: true)
CAPABILITY: N/A
SPRINT:     [Sprint 7 — Evidence-Graph Substrate and Ledger Immutability](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Implement query helpers and CLI commands for as-of temporal queries, net-support computation, and canonical corpus registration.
holo evidence:belief --as-of returns historical belief; net-support computed from validity-windowed relations; evidence:register-doc links doc to existing passages; no duplicate corpus; as-of chain preserved.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Implement evidence:belief --as-of <tx>
- MUST Compute net-support from validity-windowed relations
- MUST Implement evidence:register-doc <id>
- MUST Registered doc chunks are same passages rows
- MUST As-of uses both temporal dimensions
- MUST Net-support only counts relations with validity window covering as-of
- NEVER Duplicate passages for registered docs
- NEVER Compute net-support without validity filtering
- NEVER Use simple WHERE tx_to IS NULL without as-of
- NEVER Register doc without linking passages
- STRICTLY All queries use real Postgres (PLATFORM_IT=1)
- STRICTLY As-of filters both dimensions
- STRICTLY Net-support is SQL-based
- STRICTLY Canonical corpus verified by passage ID equality

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: As-of query returns historical belief state (flow_ref T-DATA-005)
- [ ] AC-2: Net-support computed from validity-windowed relations (flow_ref T-DATA-008)
- [ ] AC-3: Register internal doc as self-sourced source (flow_ref T-DATA-007, T-DATA-022)
- [ ] AC-4: As-of query preserves full audit chain (flow_ref T-DATA-005)
- [ ] `PLATFORM_IT=1 pnpm vitest run` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 As-of query returns historical belief state (flow_ref T-DATA-005)
  GIVEN: Postgres with B1, B2, B3 revisions
  WHEN:  holo evidence:belief --claim-id <id> --as-of <timestamp between B1 and B2>
  THEN:  Returns B1, not B2 or B3
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none

AC-2 Net-support computed from validity-windowed relations (flow_ref T-DATA-008)
  GIVEN: Relations R1 (supports, valid 2024-01), R2 (contradicts, valid 2024-03), R3 (supports, valid 2024-07)
  WHEN:  Computing net-support as-of 2024-04-01
  THEN:  Net-support = 0 (R1 +1, R2 -1, R3 excluded)
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none

AC-3 Register internal doc as self-sourced source (flow_ref T-DATA-007, T-DATA-022)
  GIVEN: Existing passages for doc-123
  WHEN:  holo evidence:register-doc doc-123
  THEN:  New sources row with sourceKind=holocron_internal, no new passages
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none

AC-4 As-of query preserves full audit chain (flow_ref T-DATA-005)
  GIVEN: Belief chain B1->B2->B3->B4
  WHEN:  holo evidence:belief --claim-id <id> --as-of for each timestamp
  THEN:  Each returns correct belief, chain preserved
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cli/holo.ts (MODIFY)
- services/platform/src/db/evidence/ (NEW)
- tests/integration/service/evidence-*.test.ts (NEW)
writeProhibited: services/platform/src/db/schema/evidence.ts, services/platform/src/db/migrations/, services/platform/src/db/

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/db/schema/evidence.ts relations and beliefs structure
   - Lines: 118-174
2. services/platform/src/cli/holo.ts CLI command pattern
3. services/platform/src/db/verify.ts Test assertion pattern

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- typecheck: `pnpm tsgo --noEmit` → Exit 0
- lint: `pnpm biome check .` → Exit 0
- integration-tests: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-*.test.ts` → Exit 0

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: As-of: tx_from <= as-of AND (tx_to IS NULL OR tx_to > as-of) · Net-support: validFrom <= as-of AND (validTo IS NULL OR validTo > as-of) · Register-doc links passages
Should verify: immutability enforced at DB (REVOKE + SECURITY DEFINER fn) · bi-temporal as-of correctness · no app code bypasses revise_belief · real Postgres only (PLATFORM_IT=1)
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: ledger-2 · Blocks: ledger-4

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "ledger-3",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "revised-belief-chain-db": {
      "description": "Sequential revisions B1->B2->B3",
      "seed_method": "public_api",
      "records": [
        "holo db:migrate",
        "holo evidence:seed",
        "holo evidence:revise B1",
        "holo evidence:revise B2"
      ]
    },
    "relations-with-validity-windows": {
      "description": "Relations with overlapping windows",
      "seed_method": "public_api",
      "records": [
        "Insert R1 supports valid 2024-01 to 2024-06",
        "Insert R2 contradicts valid 2024-03 to 2024-12",
        "Insert R3 supports valid 2024-07 to 2024-12"
      ]
    },
    "passages-existing-db": {
      "description": "Existing passages for doc-123",
      "seed_method": "public_api",
      "records": [
        "Insert 5 passages with documentId=doc-123"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN Postgres with B1, B2, B3 revisions WHEN holo evidence:belief --claim-id <id> --as-of <timestamp between B1 and B2> THEN Returns B1, not B2 or B3",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-asof-transaction.test.ts",
      "maps_to_ac": null,
      "scenario": null,
      "flow_ref": "T-DATA-005"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Relations R1 (supports, valid 2024-01), R2 (contradicts, valid 2024-03), R3 (supports, valid 2024-07) WHEN Computing net-support as-of 2024-04-01 THEN Net-support = 0 (R1 +1, R2 -1, R3 excluded)",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-net-support.test.ts",
      "maps_to_ac": null,
      "scenario": null,
      "flow_ref": "T-DATA-008"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Existing passages for doc-123 WHEN holo evidence:register-doc doc-123 THEN New sources row with sourceKind=holocron_internal, no new passages",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-register-doc.test.ts",
      "maps_to_ac": null,
      "scenario": null,
      "flow_ref": "T-DATA-007, T-DATA-022"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Belief chain B1->B2->B3->B4 WHEN holo evidence:belief --claim-id <id> --as-of for each timestamp THEN Each returns correct belief, chain preserved",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-asof-chain.test.ts",
      "maps_to_ac": null,
      "scenario": null,
      "flow_ref": "T-DATA-005"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "As-of query returns historical belief",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-asof-transaction.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Net-support computed from validity-windowed relations",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-net-support.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Register doc links existing passages",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-register-doc.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "As-of queries preserve full chain",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-asof-chain.test.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
</details>
