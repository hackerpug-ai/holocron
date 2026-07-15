# schema-5 — RED tests: 0-error migrate, status CHECK, jsonb round-trip, merges collapsed, replication readiness

## What this does

Author the failing-when-broken RED suite (integration tests against REAL Postgres) with negative controls proving each gate bites: migrate errors, status CHECK, jsonb round-trip, merges collapsed, replication readiness

Provides: red-test-suite, integration-tests.


## Why

- Tests run against REAL Postgres (DB_IT=1)
- Each test FAILS when behavior absent (negative controls)
- No mocking of Postgres
- Grounded in: UC-DATA-01, T-DATA-001, T-DATA-002, T-DATA-003, T-DATA-004, T-PLAT-003.


## How to verify

- `DB_IT=1 pnpm vitest run services/platform/tests/integration/db-migrate.test.ts services/platform/tests/integration/status-check.test.ts services/platform/tests/integration/jsonb-roundtrip.test.ts services/platform/tests/integration/merges-collapsed.test.ts services/platform/tests/integration/replication-ready.test.ts` → Exit non-zero, RED tests fail before schema
- `DB_IT=1 pnpm vitest run services/platform/tests/integration/` → Exit 0, all tests pass after schema-2/3/4

## Scope

Writes: `services/platform/tests/integration/*.test.ts (NEW - RED test files)` · `services/platform/src/db/__tests__/*.test.ts (NEW - schema tests)`.  
Prohibited: `convex/** (read-only)` · `app/** (not this sprint)` · `services/platform/src/db/schema/*.ts (schema-2 owns schema)`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: schema-5 — RED tests: 0-error migrate, status CHECK, jsonb round-trip, merges collapsed, replication readiness
================================================================================

TASK_TYPE:  TEST
STATUS:     Completed
PRIORITY:   P0
EFFORT:     M  (150 min)
AGENT:      implementer=red-test-generator | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-SYNC-01
SPRINT:     [Sprint 4 — Provision Postgres and Domain Schema](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      DB_IT=1 pnpm vitest run <path>     (schema-5 integration suite)
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
DB_IT=1 pnpm vitest run <path> shows RED tests failing against the absent/broken schema; after schema fixes, same tests go GREEN

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Write integration tests against REAL Postgres (DB_IT=1)
- MUST Prove each gate FAILS when behavior absent
- MUST Test 0-error migrate against real Postgres
- MUST Test status CHECK rejects invalid/accepts valid
- MUST Test jsonb round-trip with structural equality
- MUST Test merges collapsed to 3+3 trios
- MUST Test replication readiness (zero_pub excludes vectors, replica identity set)
- MUST Use negative controls for each test
- MUST Capture RED evidence before schema fixes
- NEVER Mock Postgres
- NEVER Stub database calls
- NEVER Write tests that pass without real behavior
- NEVER Omit negative controls
- NEVER Use in-memory fake databases
- STRICTLY Every test must run against real Postgres
- STRICTLY Every test must have negative control
- STRICTLY RED evidence must be captured before schema fixes
- STRICTLY Tests must fail when behavior absent

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): RED test: 0-error migrate against real Postgres
- [x] AC-2: RED test: status CHECK rejects invalid/accepts valid
- [x] AC-3: RED test: jsonb round-trip with structural equality
- [x] AC-4: RED test: merges collapsed to trios
- [x] AC-5: RED test: replication readiness
- [ ] `pnpm biome check .` clean + `pnpm tsgo --noEmit` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (completeness proven against real Postgres, not hand-asserted)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] RED test: 0-error migrate against real Postgres (flow_ref T-DATA-001)
  GIVEN Fresh Postgres 18 instance
  WHEN  Running the migrate test
  THEN  The test fails when migrations have errors and passes when clean
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-18-real · TDD_STATE: red
  SCENARIO — start_ref: fresh_postgres_18 · evidence: stdout
    NEGATIVE_CONTROL: would fail if Migration has SQL errors; Table creation fails; Postgres not running; Migration file missing; the required object/config is absent or a no-op stub
    MUST_OBSERVE: Test FAILS with `migration` error; After fix, test `PASSES`; `Exit` code non-zero when RED
    MUST_NOT_OBSERVE: Test passes with broken migration; Test fails with clean migration; Mocked Postgres; 0 rows / empty start state

AC-2 RED test: status CHECK rejects invalid/accepts valid (flow_ref T-DATA-003)
  GIVEN Postgres with status CHECK constraints
  WHEN  Running the status CHECK test
  THEN  The test fails when CHECK is missing or wrong, passes when enforced
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-18-real · TDD_STATE: none
  SCENARIO — start_ref: postgres_with_status_constraints · evidence: stdout
    NEGATIVE_CONTROL: would fail if CHECK constraint missing; Invalid status accepted; Valid status rejected; Zod enum missing; the required object/config is absent or a no-op stub
    MUST_OBSERVE: Test fails when CHECK `missing`; Test passes when CHECK `present`; Invalid status `rejected` by CHECK; Valid status `accepted`
    MUST_NOT_OBSERVE: Invalid status passes; Valid status rejected; Test passes without CHECK; 0 rows / empty start state

AC-3 RED test: jsonb round-trip with structural equality (flow_ref T-DATA-002)
  GIVEN Postgres with jsonb columns
  WHEN  Running the jsonb round-trip test
  THEN  The test fails when round-trip breaks, passes with structural equality
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-18-real · TDD_STATE: none
  SCENARIO — start_ref: postgres_with_jsonb_columns · evidence: stdout
    NEGATIVE_CONTROL: would fail if jsonb column missing; Type casting fails; Structural comparison not enforced; Round-trip loses data; the required object/config is absent or a no-op stub
    MUST_OBSERVE: Test passes with `structural` equality; Test fails when jsonb `broken`; Round-trip `preserves` structure; Complex types handled `correctly`
    MUST_NOT_OBSERVE: Structural inequality passes; Test passes with broken jsonb; Data loss in round-trip; 0 rows / empty start state

AC-4 RED test: merges collapsed to trios (flow_ref T-DATA-004)
  GIVEN Postgres with merged tables
  WHEN  Running the merges test
  THEN  The test fails when per-domain shells exist, passes with 3+3 trios
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-18-real · TDD_STATE: none
  SCENARIO — start_ref: postgres_with_merged_tables · evidence: stdout
    NEGATIVE_CONTROL: would fail if Per-domain shell tables exist; More than 3 analysis_* targets; Research not merged; Missing discriminators; the required object/config is absent or a no-op stub
    MUST_OBSERVE: Test passes with 3+3 trios; Test fails with per-`domain` shells; No `revenue_validation_sessions`; No `deep_research_sessions`
    MUST_NOT_OBSERVE: Test passes with shells; More than 3 analysis_* targets; Missing research discriminator; 0 rows / empty start state

AC-5 RED test: replication readiness (flow_ref T-PLAT-003)
  GIVEN Postgres with zero_pub publication
  WHEN  Running the replication test
  THEN  The test fails when vectors are included or replica identity is missing
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-18-real · TDD_STATE: none
  SCENARIO — start_ref: postgres_with_zero_pub · evidence: stdout
    NEGATIVE_CONTROL: would fail if passages in publication; vector columns published; REPLICA IDENTITY missing; evidence tables included; the required object/config is absent or a no-op stub
    MUST_OBSERVE: Test passes with correct `zero_pub`; Test fails when `passages` included; Test fails when vectors `published`; All tables have REPLICA `IDENTITY`
    MUST_NOT_OBSERVE: Test passes with passages in pub; Test passes without REPLICA IDENTITY; vectors in zero_pub; 0 rows / empty start state

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/tests/integration/*.test.ts (NEW - RED test files)
- services/platform/src/db/__tests__/*.test.ts (NEW - schema tests)
writeProhibited: convex/** (read-only), app/** (not this sprint), services/platform/src/db/schema/*.ts (schema-2 owns schema)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/tasks/sprint-02-convex-source-catalog-asset-inventory/catalog-5-red-tests-negative-controls.md:1-200 [RED test methodology and negative control patterns]
2. brain/docs/TESTING-HIERARCHY.md:1-100 [Integration/E2E test requirements, no mocking]
3. .spec/prds/mk6-migration/10-technical-requirements/03-data-schema.md:1-53 [Schema invariants to test]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED tests fail without schema: `DB_IT=1 pnpm vitest run services/platform/tests/integration/db-migrate.test.ts services/platform/tests/integration/status-check.test.ts services/platform/tests/integration/jsonb-roundtrip.test.ts services/platform/tests/integration/merges-collapsed.test.ts services/platform/tests/integration/replication-ready.test.ts` → Exit non-zero, RED tests fail before schema
- Tests go green after schema: `DB_IT=1 pnpm vitest run services/platform/tests/integration/` → Exit 0, all tests pass after schema-2/3/4

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: Every test must run against REAL Postgres; Each test must FAIL when behavior absent; Negative controls prove the gate bites; RED evidence captured before GREEN
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: schema-2 · schema-3 · schema-4  ·  Blocks: schema-6

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "schema-5",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fresh_postgres_18": {
      "description": "Fresh Postgres 18 instance for migration testing",
      "seed_method": "public_api",
      "records": [
        "Postgres 18 running",
        "pgvector installed",
        "wal_level=logical"
      ]
    },
    "postgres_with_status_constraints": {
      "description": "Postgres with status CHECK constraints in schema",
      "seed_method": "public_api",
      "records": [
        "Status columns have CHECK",
        "Zod enums defined"
      ]
    },
    "postgres_with_jsonb_columns": {
      "description": "Postgres with jsonb polymorphic columns",
      "seed_method": "public_api",
      "records": [
        "jsonb columns present",
        "Types defined"
      ]
    },
    "postgres_with_merged_tables": {
      "description": "Postgres with merged tables (3+3 trios)",
      "seed_method": "public_api",
      "records": [
        "analysis_* trio exists",
        "research_* trio exists"
      ]
    },
    "postgres_with_zero_pub": {
      "description": "Postgres with zero_pub publication configured",
      "seed_method": "public_api",
      "records": [
        "zero_pub created",
        "wal_level=logical"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-DATA-001",
      "description": "GIVEN fresh Postgres WHEN migrate test runs THEN fails with errors, passes when clean",
      "verify": "DB_IT=1 pnpm vitest run db-migrate.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-18-real",
        "flow_ref": "T-DATA-001",
        "negative_control": {
          "would_fail_if": [
            "Migration has SQL errors",
            "Table creation fails",
            "Postgres not running",
            "Migration file missing",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_postgres_18",
            "action": {
              "actor": "test_runner",
              "steps": [
                "Run DB_IT=1 pnpm vitest run db-migrate.test.ts",
                "Observe test RED when migration invalid",
                "Fix migration, observe GREEN"
              ]
            },
            "end_state": {
              "must_observe": [
                "Test FAILS with `migration` error",
                "After fix, test `PASSES`",
                "`Exit` code non-zero when RED"
              ],
              "must_not_observe": [
                "Test passes with broken migration",
                "Test fails with clean migration",
                "Mocked Postgres",
                "0 rows / empty start state"
              ]
            }
          }
        ]
      },
      "maps_to_ac": null
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-DATA-003",
      "description": "GIVEN status CHECK WHEN test runs THEN fails when CHECK missing, passes when enforced",
      "verify": "DB_IT=1 pnpm vitest run status-check.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-18-real",
        "flow_ref": "T-DATA-003",
        "negative_control": {
          "would_fail_if": [
            "CHECK constraint missing",
            "Invalid status accepted",
            "Valid status rejected",
            "Zod enum missing",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_with_status_constraints",
            "action": {
              "actor": "test_runner",
              "steps": [
                "Run status-check.test.ts",
                "Test tries INSERT 'in-progress' -> should fail",
                "Test tries INSERT 'in_progress' -> should succeed",
                "Remove CHECK -> test should FAIL"
              ]
            },
            "end_state": {
              "must_observe": [
                "Test fails when CHECK `missing`",
                "Test passes when CHECK `present`",
                "Invalid status `rejected` by CHECK",
                "Valid status `accepted`"
              ],
              "must_not_observe": [
                "Invalid status passes",
                "Valid status rejected",
                "Test passes without CHECK",
                "0 rows / empty start state"
              ]
            }
          }
        ]
      },
      "maps_to_ac": null
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-DATA-002",
      "description": "GIVEN jsonb columns WHEN test runs THEN fails when round-trip broken, passes with equality",
      "verify": "DB_IT=1 pnpm vitest run jsonb-roundtrip.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-18-real",
        "flow_ref": "T-DATA-002",
        "negative_control": {
          "would_fail_if": [
            "jsonb column missing",
            "Type casting fails",
            "Structural comparison not enforced",
            "Round-trip loses data",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_with_jsonb_columns",
            "action": {
              "actor": "test_runner",
              "steps": [
                "Run jsonb-roundtrip.test.ts",
                "Write complex polymorphic payload",
                "Read back and compare structurally",
                "Break jsonb column -> test should FAIL"
              ]
            },
            "end_state": {
              "must_observe": [
                "Test passes with `structural` equality",
                "Test fails when jsonb `broken`",
                "Round-trip `preserves` structure",
                "Complex types handled `correctly`"
              ],
              "must_not_observe": [
                "Structural inequality passes",
                "Test passes with broken jsonb",
                "Data loss in round-trip",
                "0 rows / empty start state"
              ]
            }
          }
        ]
      },
      "maps_to_ac": null
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-DATA-004",
      "description": "GIVEN merged tables WHEN test runs THEN fails with shells, passes with 3+3 trios",
      "verify": "DB_IT=1 pnpm vitest run merges-collapsed.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-18-real",
        "flow_ref": "T-DATA-004",
        "negative_control": {
          "would_fail_if": [
            "Per-domain shell tables exist",
            "More than 3 analysis_* targets",
            "Research not merged",
            "Missing discriminators",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_with_merged_tables",
            "action": {
              "actor": "test_runner",
              "steps": [
                "Run merges-collapsed.test.ts",
                "Verify exactly 3 analysis_* + 3 research_* tables",
                "Create per-domain shell -> test should FAIL"
              ]
            },
            "end_state": {
              "must_observe": [
                "Test passes with 3+3 trios",
                "Test fails with per-`domain` shells",
                "No `revenue_validation_sessions`",
                "No `deep_research_sessions`"
              ],
              "must_not_observe": [
                "Test passes with shells",
                "More than 3 analysis_* targets",
                "Missing research discriminator",
                "0 rows / empty start state"
              ]
            }
          }
        ]
      },
      "maps_to_ac": null
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-003",
      "description": "GIVEN zero_pub WHEN test runs THEN fails when vectors included, passes when correct",
      "verify": "DB_IT=1 pnpm vitest run replication-ready.test.ts",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-18-real",
        "flow_ref": "T-PLAT-003",
        "negative_control": {
          "would_fail_if": [
            "passages in publication",
            "vector columns published",
            "REPLICA IDENTITY missing",
            "evidence tables included",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_with_zero_pub",
            "action": {
              "actor": "test_runner",
              "steps": [
                "Run replication-ready.test.ts",
                "Verify passages excluded from zero_pub",
                "Verify vectors excluded",
                "Check REPLICA IDENTITY DEFAULT",
                "Add passages to pub -> test should FAIL"
              ]
            },
            "end_state": {
              "must_observe": [
                "Test passes with correct `zero_pub`",
                "Test fails when `passages` included",
                "Test fails when vectors `published`",
                "All tables have REPLICA `IDENTITY`"
              ],
              "must_not_observe": [
                "Test passes with passages in pub",
                "Test passes without REPLICA IDENTITY",
                "vectors in zero_pub",
                "0 rows / empty start state"
              ]
            }
          }
        ]
      },
      "maps_to_ac": null
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "Migrate test fails with errors",
      "verify": "Test fails when migration invalid"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "Status CHECK test enforces validity",
      "verify": "Test fails when CHECK missing"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "jsonb round-trip preserves structure",
      "verify": "Test fails when jsonb broken"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "Merges test detects shells",
      "verify": "Test fails with per-domain shells"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "Replication test enforces split",
      "verify": "Test fails when vectors in pub"
    }
  ]
}
-->
</details>