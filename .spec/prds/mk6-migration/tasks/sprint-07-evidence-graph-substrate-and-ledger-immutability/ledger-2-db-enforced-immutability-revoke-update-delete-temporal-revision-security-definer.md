# ledger-2 — DB-enforced immutability: REVOKE UPDATE/DELETE + temporal-revision SECURITY DEFINER function

## What this does

Create a Drizzle migration 0003_* that (a) REVOKES UPDATE/DELETE privileges on the beliefs table from the application DB role and GRANTs them only to a privileged/owner role, and (b) creates a SECURITY DEFINER SQL function revise_belief(...) that atomically performs temporal revision.

Provides: immutability-enforcement, temporal-revision-function.

## Why

- MUST: REVOKE UPDATE/DELETE on beliefs from the app DB role
- MUST: GRANT UPDATE/DELETE on beliefs only to privileged/owner role
- MUST: Create SECURITY DEFINER function revise_belief() with atomic supersession
- NEVER: Allow UPDATE/DELETE on beliefs through the app role
- NEVER: Use application-layer enforcement only
- NEVER: Create function that does not run as SECURITY DEFINER
- STRICTLY: All operations use real Postgres (PLATFORM_IT=1)
- STRICTLY: Migration is 0003_*
- STRICTLY: Function signature: revise_belief(p_belief_id, p_actor, p_run_id, p_idempotency_key, p_new_statement, p_new_confidence, p_valid_from, p_validTo)
- Grounded in: UC-DATA-02, T-PLAT-004, T-DATA-006

## How to verify

- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-*.test.ts` → Exit 0

## Scope

Writes: services/platform/src/db/migrations/0003_*.sql (NEW) · services/platform/src/db/migrations/meta/0003_*.json (NEW) · services/platform/src/cli/holo.ts (MODIFY) · tests/integration/service/immutability-*.test.ts (NEW)

Prohibited: services/platform/src/db/schema/evidence.ts · services/platform/src/db/migrations/0000-*.sql, 0001-*.sql, 0002-*.sql

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: ledger-2 — DB-enforced immutability: REVOKE UPDATE/DELETE + temporal-revision SECURITY DEFINER function
================================================================================

TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (240 min)
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
Create a Drizzle migration 0003_* that (a) REVOKES UPDATE/DELETE privileges on the beliefs table from the application DB role and GRANTs them only to a privileged/owner role, and (b) creates a SECURITY DEFINER SQL function revise_belief(...) that atomically performs temporal revision.
Direct UPDATE/DELETE on beliefs via app role raises permission denied ERROR 42501; calling revise_belief() atomically closes predecessor and inserts successor; concurrent revise - one commits, stale one rejected; idempotencyKey replay returns existing; db:probe --raw demonstrates permission denied.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST REVOKE UPDATE/DELETE on beliefs from the app DB role
- MUST GRANT UPDATE/DELETE on beliefs only to privileged/owner role
- MUST Create SECURITY DEFINER function revise_belief() with atomic supersession
- MUST Function must close predecessor tx_to, insert successor with supersedesId
- MUST Function must reject stale concurrent revisions
- MUST Function must record actor/runId/idempotencyKey
- MUST Function must be idempotent on idempotencyKey
- MUST Add evidence:revise command calling the function
- MUST Extend db:probe with --raw flag for direct DML testing
- NEVER Allow UPDATE/DELETE on beliefs through the app role
- NEVER Use application-layer enforcement only
- NEVER Create function that does not run as SECURITY DEFINER
- NEVER Bypass tx_to closure on predecessor
- STRICTLY All operations use real Postgres (PLATFORM_IT=1)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: App role cannot directly UPDATE or DELETE beliefs (flow_ref T-PLAT-004, T-DATA-006)
- [ ] AC-2: Authorized revise closes predecessor and inserts successor atomically (flow_ref T-DATA-006)
- [ ] AC-3: Stale concurrent revision is rejected (flow_ref T-DATA-006)
- [ ] AC-4: IdempotencyKey replay returns existing revision (flow_ref T-DATA-006)
- [ ] AC-5: CLI command evidence:revise calls function correctly (flow_ref T-DATA-006)
- [ ] AC-6: db:probe --raw demonstrates direct DML rejection (flow_ref T-PLAT-004)
- [ ] `PLATFORM_IT=1 pnpm vitest run` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 App role cannot directly UPDATE or DELETE beliefs (flow_ref T-PLAT-004, T-DATA-006)
  GIVEN: Postgres with evidence schema and 0003_* immutability migration applied
  WHEN:  Attempting UPDATE beliefs SET statement = 'changed' or DELETE FROM beliefs using app role
  THEN:  Both commands raise ERROR 42501 (permission denied)
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  SCENARIO — start_ref: seeded-belief-db · evidence: db_query
    NEGATIVE_CONTROL: would fail if REVOKE omitted (app role retains UPDATE/DELETE via default grant); App role has UPDATE/DELETE privileges through default PUBLIC grant (static bypass)
    MUST_OBSERVE: UPDATE raises ERROR 42501; DELETE raises ERROR 42501; db:probe shows ERROR 42501; UPDATE affected 0 rows (rowcount = 0)
    MUST_NOT_OBSERVE: UPDATE succeeds (rowcount ≥ 1, not 0); DELETE succeeds (rowcount ≥ 1, not 0); Any beliefs modified (rowcount ≥ 1, not 0)

AC-2 Authorized revise closes predecessor and inserts successor atomically (flow_ref T-DATA-006)
  GIVEN: Postgres with immutability migration and belief B1 with tx_to IS NULL
  WHEN:  Calling revise_belief(B1.id, 'op-1', 'run-123', 'key-abc', 'new statement', 0.9, now(), NULL)
  THEN:  B1.tx_to set to now(), B2 inserted with supersedesId = B1.id, tx_from = now(), function returns B2.id
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  SCENARIO — start_ref: seeded-belief-db · evidence: db_query
    NEGATIVE_CONTROL: would fail if revise_belief function is stub/empty (not created as SECURITY DEFINER); SELECT FOR UPDATE omitted (no row lock, race condition allows stale overwrites); Atomic transaction omitted (predecessor close and successor insert are separate operations)
    MUST_OBSERVE: B1 has tx_to IS NOT NULL (closed); B2 has supersedesId = B1.id; B2 has tx_from IS NOT NULL, tx_to IS NULL (current); Exactly 1 current belief (COUNT WHERE tx_to IS NULL = 1)
    MUST_NOT_OBSERVE: B1 has tx_to IS NULL (0 closed); B2 missing or wrong supersedesId (supersedesId IS NULL); Two current beliefs (COUNT WHERE tx_to IS NULL = 2); COUNT WHERE tx_to IS NULL = 0

AC-3 Stale concurrent revision is rejected (flow_ref T-DATA-006)
  GIVEN: Postgres with belief B1, tx_to IS NULL
  WHEN:  Two concurrent transactions call revise_belief(B1.id), second after first closed B1
  THEN:  First succeeds, second raises exception, only one successor
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  SCENARIO — start_ref: seeded-belief-db · evidence: db_query
    NEGATIVE_CONTROL: would fail if Stale-state check omitted (predecessor tx_to not verified before closing); SELECT FOR UPDATE omitted (no row lock, concurrent revisions both succeed)
    MUST_OBSERVE: T1 revise_belief succeeds and returns successor ID; T2 revise_belief raises exception (stale concurrent revision); Exactly 1 successor belief exists in database; B1.tx_to is set (closed by T1)
    MUST_NOT_OBSERVE: Both T1 and T2 succeed (two successors for same predecessor) (0 rows); T2 succeeds (rowcount ≥ 1) without raising exception; Two current beliefs (COUNT WHERE tx_to IS NULL = 2)

AC-4 IdempotencyKey replay returns existing revision (flow_ref T-DATA-006)
  GIVEN: Successful revision R1 with idempotencyKey = 'key-abc'
  WHEN:  Calling revise_belief() again with same idempotencyKey
  THEN:  Returns R1.id without inserting new row
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  SCENARIO — start_ref: seeded-belief-db · evidence: db_query
    NEGATIVE_CONTROL: would fail if idempotency check omitted (replay inserts duplicate rows); idempotencyKey unique index omitted (duplicate rows allowed)
    MUST_OBSERVE: First revise_belief creates R1 and returns R1.id; Second revise_belief with same key-abc returns R1.id (existing ID); Exactly 1 belief with idempotencyKey = 'key-abc'; R1 has original values: statement = 'statement-1', actor = 'op-1'
    MUST_NOT_OBSERVE: Second call creates a new successor with different ID; Two beliefs with idempotencyKey = 'key-abc' (COUNT = 2); R1 modified to 'different' statement

AC-5 CLI command evidence:revise calls function correctly (flow_ref T-DATA-006)
  GIVEN: Postgres with immutability migration and existing belief
  WHEN:  Running holo evidence:revise <id> --actor <name> --run-id <run> --idempotency-key <key>
  THEN:  CLI parses arguments, calls revise_belief(), outputs successor ID
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  SCENARIO — start_ref: seeded-belief-db · evidence: stdout
    NEGATIVE_CONTROL: would fail if CLI command not registered in holo.ts (command stub/empty); Argument parsing stubbed (no real parameters passed); Function call bypassed (app-layer mock instead of real revise_belief)
    MUST_OBSERVE: CLI exits with code 0 (exit code = 0); Stdout contains successor ID with UUID format (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx); Stdout contains revision metadata: actor = 'op-1', runId present; Database query confirms: predecessor COUNT WHERE tx_to IS NOT NULL = 1, successor COUNT WHERE tx_to IS NULL = 1
    MUST_NOT_OBSERVE: CLI exits with error code (exit code ≠ 0); Stdout empty or missing successor ID (successor ID length = 0); No change in database (COUNT modified = 0)

AC-6 db:probe --raw demonstrates direct DML rejection (flow_ref T-PLAT-004)
  GIVEN: Postgres with immutability migration
  WHEN:  Running holo db:probe --raw "UPDATE beliefs SET statement = 'hacked'"
  THEN:  Outputs ERROR 42501, exit non-zero, no rows modified
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  SCENARIO — start_ref: seeded-belief-db · evidence: stdout
    NEGATIVE_CONTROL: would fail if db:probe --raw flag not implemented (command stub/empty); Raw DML executed with superuser privileges instead of app role; Error not captured and reported by db:probe (silent failure)
    MUST_OBSERVE: db:probe exits with non-zero code (exit code = 1); Stdout contains ERROR 42501 or 'permission denied' text; Stdout references table 'beliefs' and operation 'UPDATE'; Database query shows original statement unchanged (COUNT modified = 0)
    MUST_NOT_OBSERVE: db:probe exits with code 0 (exit code = 0); UPDATE succeeds without error (error count = 0); Any belief has statement = 'hacked' (COUNT WHERE statement = 'hacked' = 0)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/db/migrations/0003_*.sql (NEW)
- services/platform/src/db/migrations/meta/0003_*.json (NEW)
- services/platform/src/cli/holo.ts (MODIFY)
- tests/integration/service/immutability-*.test.ts (NEW)
writeProhibited: services/platform/src/db/schema/evidence.ts, services/platform/src/db/migrations/0000-*.sql, 0001-*.sql, 0002-*.sql

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/db/schema/evidence.ts beliefs table structure
   - Lines: 150-174
2. services/platform/src/db/migrations/0002_zero_pub.sql Existing migration pattern
3. services/platform/src/cli/holo.ts CLI command pattern
4. services/platform/src/db/probe.ts db:probe pattern

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- typecheck: `pnpm tsgo --noEmit` → Exit 0
- lint: `pnpm biome check .` → Exit 0
- integration-tests: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-*.test.ts` → Exit 0

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: REVOKE/GRANT privileges · SECURITY DEFINER function · SELECT FOR UPDATE · Check predecessor.tx_to
Should verify: immutability enforced at DB (REVOKE + SECURITY DEFINER fn) · bi-temporal as-of correctness · no app code bypasses revise_belief · real Postgres only (PLATFORM_IT=1)
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: ledger-1 · Blocks: ledger-3, ledger-4

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "ledger-2",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-belief-db": {
      "description": "Postgres with evidence:seed data",
      "seed_method": "public_api",
      "records": [
        "holo db:migrate",
        "holo evidence:seed",
        "Verify 1 belief with tx_to IS NULL"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN Postgres with evidence schema and 0003_* immutability migration applied, WHEN Attempting UPDATE beliefs SET statement = 'changed' or DELETE FROM beliefs using app role, THEN Both commands raise ERROR 42501 (permission denied)",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-dml-rejected.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "negative_control": {
          "would_fail_if": [
            "REVOKE omitted (app role retains UPDATE/DELETE via default grant)",
            "App role has UPDATE/DELETE privileges through default PUBLIC grant (static bypass)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-belief-db",
            "action": {
              "actor": "operator",
              "steps": [
                "Connect as app role",
                "UPDATE beliefs SET statement = 'changed'",
                "Verify ERROR 42501",
                "DELETE FROM beliefs",
                "Verify ERROR 42501",
                "db:probe --raw UPDATE",
                "Verify permission denied"
              ]
            },
            "end_state": {
              "must_observe": [
                "UPDATE raises ERROR 42501",
                "DELETE raises ERROR 42501",
                "db:probe shows ERROR 42501",
                "UPDATE affected 0 rows (rowcount = 0)"
              ],
              "must_not_observe": [
                "UPDATE succeeds (rowcount ≥ 1, not 0)",
                "DELETE succeeds (rowcount ≥ 1, not 0)",
                "Any beliefs modified (rowcount ≥ 1, not 0)"
              ]
            }
          }
        ],
        "test_tier": "integration",
        "verification_service": "postgres"
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Postgres with immutability migration and belief B1 with tx_to IS NULL, WHEN Calling revise_belief(B1.id, 'op-1', 'run-123', 'key-abc', 'new statement', 0.9, now(), NULL), THEN B1.tx_to set to now(), B2 inserted with supersedesId = B1.id, tx_from = now(), function returns B2.id",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-atomic-revision.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "negative_control": {
          "would_fail_if": [
            "revise_belief function is stub/empty (not created as SECURITY DEFINER)",
            "SELECT FOR UPDATE omitted (no row lock, race condition allows stale overwrites)",
            "Atomic transaction omitted (predecessor close and successor insert are separate operations)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-belief-db",
            "action": {
              "actor": "operator",
              "steps": [
                "holo evidence:revise B1.id --actor op-1",
                "Query B1: verify tx_to IS NOT NULL",
                "Query B2: verify supersedesId = B1.id",
                "Verify exactly 1 current belief"
              ]
            },
            "end_state": {
              "must_observe": [
                "B1 has tx_to IS NOT NULL (closed)",
                "B2 has supersedesId = B1.id",
                "B2 has tx_from IS NOT NULL, tx_to IS NULL (current)",
                "Exactly 1 current belief (COUNT WHERE tx_to IS NULL = 1)"
              ],
              "must_not_observe": [
                "B1 has tx_to IS NULL (0 closed)",
                "B2 missing or wrong supersedesId (supersedesId IS NULL)",
                "Two current beliefs (COUNT WHERE tx_to IS NULL = 2)",
                "COUNT WHERE tx_to IS NULL = 0"
              ]
            }
          }
        ],
        "test_tier": "integration",
        "verification_service": "postgres"
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Postgres with belief B1, tx_to IS NULL, WHEN Two concurrent transactions call revise_belief(B1.id), second after first closed B1, THEN First succeeds, second raises exception, only one successor",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-concurrent-reject.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "Stale-state check omitted (predecessor tx_to not verified before closing)",
            "SELECT FOR UPDATE omitted (no row lock, concurrent revisions both succeed)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-belief-db",
            "action": {
              "actor": "operator",
              "steps": [
                "Start Transaction T1: BEGIN",
                "T1: SELECT revise_belief(B1.id, 'op-1', 'run-1', 'key-1', 'statement-1', 0.8, now(), NULL)",
                "T1: COMMIT (B1 now has tx_to set)",
                "Start Transaction T2: BEGIN",
                "T2: SELECT revise_belief(B1.id, 'op-2', 'run-2', 'key-2', 'statement-2', 0.7, now(), NULL)",
                "T2: Should raise exception REVISE_STALE_CONCURRENT or similar",
                "T2: ROLLBACK (due to exception)"
              ]
            },
            "end_state": {
              "must_observe": [
                "T1 revise_belief succeeds and returns successor ID",
                "T2 revise_belief raises exception (stale concurrent revision)",
                "Exactly 1 successor belief exists in database",
                "B1.tx_to is set (closed by T1)"
              ],
              "must_not_observe": [
                "Both T1 and T2 succeed (two successors for same predecessor) (0 rows)",
                "T2 succeeds (rowcount ≥ 1) without raising exception",
                "Two current beliefs (COUNT WHERE tx_to IS NULL = 2)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Successful revision R1 with idempotencyKey = 'key-abc', WHEN Calling revise_belief() again with same idempotencyKey, THEN Returns R1.id without inserting new row",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-idempotency.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "idempotency check omitted (replay inserts duplicate rows)",
            "idempotencyKey unique index omitted (duplicate rows allowed)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-belief-db",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo evidence:revise B1.id --actor op-1 --run-id run-1 --idempotency-key key-abc --statement 'statement-1' --confidence 0.8",
                "Record returned successor ID R1.id",
                "Run holo evidence:revise B1.id --actor op-2 --run-id run-2 --idempotency-key key-abc --statement 'different' --confidence 0.5",
                "Verify return value equals R1.id (not a new ID)"
              ]
            },
            "end_state": {
              "must_observe": [
                "First revise_belief creates R1 and returns R1.id",
                "Second revise_belief with same key-abc returns R1.id (existing ID)",
                "Exactly 1 belief with idempotencyKey = 'key-abc'",
                "R1 has original values: statement = 'statement-1', actor = 'op-1'"
              ],
              "must_not_observe": [
                "Second call creates a new successor with different ID",
                "Two beliefs with idempotencyKey = 'key-abc' (COUNT = 2)",
                "R1 modified to 'different' statement"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Postgres with immutability migration and existing belief, WHEN Running holo evidence:revise <id> --actor <name> --run-id <run> --idempotency-key <key>, THEN CLI parses arguments, calls revise_belief(), outputs successor ID",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-cli-revise.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "CLI command not registered in holo.ts (command stub/empty)",
            "Argument parsing stubbed (no real parameters passed)",
            "Function call bypassed (app-layer mock instead of real revise_belief)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-belief-db",
            "action": {
              "actor": "operator",
              "steps": [
                "Get a belief ID from seeded data",
                "Run holo evidence:revise <id> --actor op-1 --run-id run-123 --idempotency-key key-abc --statement 'revised statement' --confidence 0.95",
                "Capture stdout output",
                "Parse successor ID from output"
              ]
            },
            "end_state": {
              "must_observe": [
                "CLI exits with code 0 (exit code = 0)",
                "Stdout contains successor ID with UUID format (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
                "Stdout contains revision metadata: actor = 'op-1', runId present",
                "Database query confirms: predecessor COUNT WHERE tx_to IS NOT NULL = 1, successor COUNT WHERE tx_to IS NULL = 1"
              ],
              "must_not_observe": [
                "CLI exits with error code (exit code ≠ 0)",
                "Stdout empty or missing successor ID (successor ID length = 0)",
                "No change in database (COUNT modified = 0)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN Postgres with immutability migration, WHEN Running holo db:probe --raw \"UPDATE beliefs SET statement = 'hacked'\", THEN Outputs ERROR 42501, exit non-zero, no rows modified",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-probe-rejection.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "db:probe --raw flag not implemented (command stub/empty)",
            "Raw DML executed with superuser privileges instead of app role",
            "Error not captured and reported by db:probe (silent failure)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-belief-db",
            "action": {
              "actor": "operator",
              "steps": [
                "Get a belief ID from seeded data",
                "Run holo db:probe --raw \"UPDATE beliefs SET statement = 'hacked' WHERE id = '<id>'\"",
                "Capture stdout and exit code"
              ]
            },
            "end_state": {
              "must_observe": [
                "db:probe exits with non-zero code (exit code = 1)",
                "Stdout contains ERROR 42501 or 'permission denied' text",
                "Stdout references table 'beliefs' and operation 'UPDATE'",
                "Database query shows original statement unchanged (COUNT modified = 0)"
              ],
              "must_not_observe": [
                "db:probe exits with code 0 (exit code = 0)",
                "UPDATE succeeds without error (error count = 0)",
                "Any belief has statement = 'hacked' (COUNT WHERE statement = 'hacked' = 0)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "App role cannot UPDATE or DELETE beliefs directly",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-dml-rejected.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Revise function atomically closes predecessor and inserts successor",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-atomic-revision.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Stale concurrent revisions are rejected",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-concurrent-reject.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "IdempotencyKey replay returns existing revision",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-idempotency.test.ts",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "CLI evidence:revise calls function correctly",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-cli-revise.test.ts",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "db:probe --raw shows direct DML permission denied",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-probe-rejection.test.ts",
      "maps_to_ac": "AC-6"
    }
  ]
}
-->
</details>
