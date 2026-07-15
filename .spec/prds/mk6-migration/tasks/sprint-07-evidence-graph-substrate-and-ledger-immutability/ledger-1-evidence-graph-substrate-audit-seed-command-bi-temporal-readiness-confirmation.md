# ledger-1 — Evidence-graph substrate audit + seed command (bi-temporal readiness confirmation)

## What this does

Audit the existing evidence-graph substrate to confirm bi-temporal correctness for UC-DATA-02, and implement the holo evidence:seed command for test data seeding. The substrate tables already exist from Sprint 04; this task validates their immutability-readiness and adds ONLY what is missing (e.g., a partial unique index enforcing one open belief per claim if needed, or the seed command).

Provides: evidence-substrate-audit, evidence-seed-command.

## Why

- MUST: Confirm existing evidence.ts tables satisfy UC-DATA-02 bi-temporal requirements
- MUST: Add evidence:seed command to holo.ts CLI
- MUST: DO NOT modify evidence.ts unless a specific immutability gap is identified
- NEVER: Re-create sources, passages, claims, entities, relations, or beliefs tables
- NEVER: Modify evidence.ts without first documenting a specific gap
- STRICTLY: All commands follow existing holo.ts switch/case pattern
- STRICTLY: Integration tests use PLATFORM_IT=1 pnpm vitest run against real Postgres
- Grounded in: UC-DATA-02

## How to verify

- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-*.test.ts` → Exit 0

## Scope

Writes: services/platform/src/cli/holo.ts (MODIFY - add evidence:seed command) · services/platform/src/db/migrations/0003_*.sql (NEW - only if partial unique index or other gaps are identified) · tests/integration/service/evidence-*.test.ts (NEW - integration tests) · services/platform/src/db/evidence/ (NEW - query helpers if needed)

Prohibited: services/platform/src/db/schema/evidence.ts (MODIFY ONLY IF a real immutability gap is documented - tables already exist from Sprint 04) · services/platform/src/db/schema/ (OTHER - do not modify other schema files) · services/platform/src/db/migrations/0000_*.sql, 0001_*.sql, 0002_*.sql (MODIFY - existing migrations are immutable)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: ledger-1 — Evidence-graph substrate audit + seed command (bi-temporal readiness confirmation)
================================================================================

TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (300 min)
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
Audit the existing evidence-graph substrate to confirm bi-temporal correctness for UC-DATA-02, and implement the holo evidence:seed command for test data seeding. The substrate tables already exist from Sprint 04; this task validates their immutability-readiness and adds ONLY what is missing (e.g., a partial unique index enforcing one open belief per claim if needed, or the seed command).
The evidence:seed command inserts a claim with two contradicting passages; query helpers confirm bi-temporal columns (validFrom/validTo, txFrom/txTo) are correctly present; beliefs_current_idx and relations_current_idx correctly filter WHERE tx_to IS NULL; supports/contradicts relationType values are enforced; any missing immutability-enforcement indexes are added; substrate is ready for ledger-2 immutability migration.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Confirm existing evidence.ts tables satisfy UC-DATA-02 bi-temporal requirements
- MUST Add evidence:seed command to holo.ts CLI
- MUST DO NOT modify evidence.ts unless a specific immutability gap is identified
- NEVER Re-create sources, passages, claims, entities, relations, or beliefs tables
- NEVER Modify evidence.ts without first documenting a specific gap
- STRICTLY All commands follow existing holo.ts switch/case pattern
- STRICTLY Integration tests use PLATFORM_IT=1 pnpm vitest run against real Postgres

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Seed command inserts claim + two contradicting passages + relations (flow_ref T-DATA-005)
- [ ] AC-2: Partial unique index enforces one open belief per claim (flow_ref T-DATA-006)
- [ ] AC-3: Relations supports/contradicts edges carry validity windows (flow_ref T-DATA-008)
- [ ] AC-4: Canonical-corpus shape intact (one passages, one sources table) (flow_ref T-PLAT-004, T-DATA-022)
- [ ] `PLATFORM_IT=1 pnpm vitest run` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 Seed command inserts claim + two contradicting passages + relations (flow_ref T-DATA-005)
  GIVEN: A running Postgres instance with the evidence schema migrated
  WHEN:  Operator runs holo evidence:seed
  THEN:  One sources row, two passages rows with contradictory text, one claims row linked to both passages, and two relations rows (one supports, one contradicts) are inserted into the database
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  SCENARIO — start_ref: empty-evidence-db · evidence: db_query
    NEGATIVE_CONTROL: would fail if seed command is a no-op/stub that inserts 0 rows; seed command disconnects from database (empty transaction); relations table omitted (no supports/contradicts rows inserted)
    MUST_OBSERVE: sources COUNT = 1; passages COUNT = 2; claims COUNT = 1; relations COUNT = 2 WHERE relationType IN ('supports', 'contradicts'); sources COUNT WHERE tx_from IS NOT NULL = 1; passages COUNT WHERE tx_from IS NOT NULL AND tx_to IS NULL = 2
    MUST_NOT_OBSERVE: sources COUNT = 0; passages COUNT = 0; claims COUNT = 0; relations COUNT = 0; sources COUNT WHERE tx_from IS NOT NULL = 0; passages COUNT WHERE tx_from IS NOT NULL AND tx_to IS NULL = 0

AC-2 Partial unique index enforces one open belief per claim (flow_ref T-DATA-006)
  GIVEN: The evidence schema is migrated with partial unique index beliefs_one_open_per_claim_uidx
  WHEN:  Attempting to insert two beliefs for the same claimId with tx_to IS NULL
  THEN:  The second insert fails with SQLSTATE 23505 (unique_violation); the index enforces exactly one open belief per claim
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  SCENARIO — start_ref: empty-evidence-db · evidence: db_query
    NEGATIVE_CONTROL: would fail if partial unique index beliefs_one_open_per_claim_uidx is omitted (2 open beliefs allowed); index is a non-unique btree index (no enforcement, 2 open beliefs succeed); index WHERE tx_to IS NULL clause is missing (enforces across all beliefs, not just open)
    MUST_OBSERVE: B1 insert succeeds; B2 insert raises SQLSTATE 23505; open beliefs for claim-1 COUNT = 1; pg_indexes COUNT WHERE indexname = 'beliefs_one_open_per_claim_uidx' = 1; indexdef contains 'WHERE tx_to IS NULL' text
    MUST_NOT_OBSERVE: B2 insert succeeds (no violation); open beliefs for claim-1 COUNT = 2; open beliefs for claim-1 COUNT = 0; pg_indexes COUNT WHERE indexname = 'beliefs_one_open_per_claim_uidx' = 0; indexdef does not contain 'WHERE tx_to IS NULL' text

AC-3 Relations supports/contradicts edges carry validity windows (flow_ref T-DATA-008)
  GIVEN: The evidence schema is migrated with relations table having validFrom/validTo columns
  WHEN:  Inserting a relation with validFrom/validTo and querying at covered vs uncovered as-of points
  THEN:  The relation is returned by validity-windowed query at a covered as-of point and excluded at an uncovered point
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  SCENARIO — start_ref: empty-evidence-db · evidence: db_query
    NEGATIVE_CONTROL: would fail if validFrom/validTo columns ignored (treated as NULL/unbounded); query omits the validity window filter WHERE clause; relationType enum does not include supports/contradicts values
    MUST_OBSERVE: covered as-of (2024-03-01) COUNT = 1; uncovered as-of (2024-07-01) COUNT = 0; all relations COUNT = 1; R1 has validFrom = '2024-01-01'; R1 has validTo = '2024-06-01'
    MUST_NOT_OBSERVE: covered as-of COUNT = 0; uncovered as-of COUNT = 1; both queries return same COUNT; all relations COUNT = 0

AC-4 Canonical-corpus shape intact (one passages, one sources table) (flow_ref T-PLAT-004, T-DATA-022)
  GIVEN: The evidence schema is migrated from Sprint 04
  WHEN:  Querying information_schema for tables and checking document-passage FK relations
  THEN:  Exactly ONE sources table and ONE passages table exist (no duplicate corpus); passages FK to sources via sourceId
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  SCENARIO — start_ref: empty-evidence-db · evidence: db_query
    NEGATIVE_CONTROL: would fail if duplicate passages tables created (shadow corpus split); sources table missing (0 count); sources table duplicated (count > 1); passages.sourceId FK constraint missing (no REFERENCES clause)
    MUST_OBSERVE: information_schema.tables COUNT for name='sources' = 1; information_schema.tables COUNT for name='passages' = 1; passages FOREIGN KEY COUNT on sourceId = 1; FK references COUNT WHERE unique_constraint_table_name = 'sources' = 1
    MUST_NOT_OBSERVE: information_schema.tables COUNT for name='passages' = 2 (duplicate); information_schema.tables COUNT for name='sources' = 0; information_schema.tables COUNT for name='passages' = 0; passages FOREIGN KEY COUNT = 0; FK references COUNT WHERE unique_constraint_table_name = 'sources' = 0

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cli/holo.ts (MODIFY - add evidence:seed command)
- services/platform/src/db/migrations/0003_*.sql (NEW - only if partial unique index or other gaps are identified)
- tests/integration/service/evidence-*.test.ts (NEW - integration tests)
- services/platform/src/db/evidence/ (NEW - query helpers if needed)
writeProhibited: services/platform/src/db/schema/evidence.ts (MODIFY ONLY IF a real immutability gap is documented - tables already exist from Sprint 04), services/platform/src/db/schema/ (OTHER - do not modify other schema files), services/platform/src/db/migrations/0000_*.sql, 0001_*.sql, 0002_*.sql (MODIFY - existing migrations are immutable)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/db/schema/evidence.ts PRIMARY PATTERN - evidence substrate schema with bi-temporal columns
2. services/platform/src/cli/holo.ts CLI command registration pattern for evidence:seed
3. services/platform/src/db/columns.ts Column helpers: timestamptz, idColumn, etc.
4. services/platform/src/db/enums.ts relationTypeValues and sourceKindValues enums
5. services/platform/src/db/verify.ts Pattern for db:verify integration tests

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- typecheck: `pnpm tsgo --noEmit` → Exit 0
- lint: `pnpm biome check .` → Exit 0
- integration-tests: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-*.test.ts` → Exit 0

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: Seed command should follow existing holo.ts switch/case pattern · Use Drizzle ORM for all DB operations · Integration tests must use PLATFORM_IT=1 environment variable · Follow existing verify.ts and probe.ts patterns for DB assertions
Should verify: immutability enforced at DB (REVOKE + SECURITY DEFINER fn) · bi-temporal as-of correctness · no app code bypasses revise_belief · real Postgres only (PLATFORM_IT=1)
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: none · Blocks: ledger-2, ledger-3

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "ledger-1",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "empty-evidence-db": {
      "description": "Postgres with evidence schema but no data",
      "seed_method": "public_api",
      "records": [
        "Run holo db:migrate to create all tables",
        "Verify empty state: COUNT = 0 on sources, passages, claims, entities, relations, beliefs"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a running Postgres instance with the evidence schema migrated, WHEN operator runs holo evidence:seed, THEN one sources row, two passages rows with contradictory text, one claims row linked to both passages, and two relations rows (one supports, one contradicts) are inserted into the database",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "seed command is a no-op/stub that inserts 0 rows",
            "seed command disconnects from database (empty transaction)",
            "relations table omitted (no supports/contradicts rows inserted)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty-evidence-db",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo db:migrate to ensure schema is present",
                "Run holo evidence:seed",
                "Query sources: SELECT COUNT(*) FROM sources",
                "Query passages: SELECT COUNT(*) FROM passages",
                "Query claims: SELECT COUNT(*) FROM claims",
                "Query relations: SELECT COUNT(*) FROM relations WHERE relationType IN ('supports', 'contradicts')",
                "Query sources: SELECT COUNT(*) FROM sources WHERE tx_from IS NOT NULL",
                "Query passages: SELECT COUNT(*) FROM passages WHERE tx_from IS NOT NULL AND tx_to IS NULL"
              ]
            },
            "end_state": {
              "must_observe": [
                "sources COUNT = 1",
                "passages COUNT = 2",
                "claims COUNT = 1",
                "relations COUNT = 2 WHERE relationType IN ('supports', 'contradicts')",
                "sources COUNT WHERE tx_from IS NOT NULL = 1",
                "passages COUNT WHERE tx_from IS NOT NULL AND tx_to IS NULL = 2"
              ],
              "must_not_observe": [
                "sources COUNT = 0",
                "passages COUNT = 0",
                "claims COUNT = 0",
                "relations COUNT = 0",
                "sources COUNT WHERE tx_from IS NOT NULL = 0",
                "passages COUNT WHERE tx_from IS NOT NULL AND tx_to IS NULL = 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the evidence schema is migrated with partial unique index beliefs_one_open_per_claim_uidx, WHEN attempting to insert two beliefs for the same claimId with tx_to IS NULL, THEN the second insert fails with SQLSTATE 23505 (unique_violation); the index enforces exactly one open belief per claim",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-unique-belief.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "partial unique index beliefs_one_open_per_claim_uidx is omitted (2 open beliefs allowed)",
            "index is a non-unique btree index (no enforcement, 2 open beliefs succeed)",
            "index WHERE tx_to IS NULL clause is missing (enforces across all beliefs, not just open)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty-evidence-db",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo db:migrate",
                "Insert belief B1: INSERT INTO beliefs (claim_id, statement, tx_from, tx_to) VALUES ('claim-1', 'statement-1', now(), NULL)",
                "Query open beliefs: SELECT COUNT(*) FROM beliefs WHERE claim_id = 'claim-1' AND tx_to IS NULL",
                "Attempt to insert belief B2: INSERT INTO beliefs (claim_id, statement, tx_from, tx_to) VALUES ('claim-1', 'statement-2', now(), NULL)",
                "Query open beliefs again: SELECT COUNT(*) FROM beliefs WHERE claim_id = 'claim-1' AND tx_to IS NULL",
                "Query pg_indexes: SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'beliefs_one_open_per_claim_uidx'",
                "Query indexdef: SELECT indexdef FROM pg_indexes WHERE indexname = 'beliefs_one_open_per_claim_uidx'"
              ]
            },
            "end_state": {
              "must_observe": [
                "B1 insert succeeds",
                "B2 insert raises SQLSTATE 23505",
                "open beliefs for claim-1 COUNT = 1",
                "pg_indexes COUNT WHERE indexname = 'beliefs_one_open_per_claim_uidx' = 1",
                "indexdef contains 'WHERE tx_to IS NULL' text"
              ],
              "must_not_observe": [
                "B2 insert succeeds (no violation)",
                "open beliefs for claim-1 COUNT = 2",
                "open beliefs for claim-1 COUNT = 0",
                "pg_indexes COUNT WHERE indexname = 'beliefs_one_open_per_claim_uidx' = 0",
                "indexdef does not contain 'WHERE tx_to IS NULL' text"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the evidence schema is migrated with relations table having validFrom/validTo columns, WHEN inserting a relation with validFrom/validTo and querying at covered vs uncovered as-of points, THEN the relation is returned by validity-windowed query at a covered as-of point and excluded at an uncovered point",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-validity-windows.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "validFrom/validTo columns ignored (treated as NULL/unbounded)",
            "query omits the validity window filter WHERE clause",
            "relationType enum does not include supports/contradicts values"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty-evidence-db",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo db:migrate",
                "Insert relation R1: INSERT INTO relations (relation_type, subject_id, object_id, valid_from, valid_to, tx_from, tx_to) VALUES ('supports', 'claim-1', 'claim-2', '2024-01-01'::timestamptz, '2024-06-01'::timestamptz, now(), NULL)",
                "Query covered as-of: SELECT COUNT(*) FROM relations WHERE subject_id = 'claim-1' AND valid_from <= '2024-03-01'::timestamptz AND (valid_to IS NULL OR valid_to > '2024-03-01'::timestamptz) AND tx_to IS NULL",
                "Query uncovered as-of: SELECT COUNT(*) FROM relations WHERE subject_id = 'claim-1' AND valid_from <= '2024-07-01'::timestamptz AND (valid_to IS NULL OR valid_to > '2024-07-01'::timestamptz) AND tx_to IS NULL",
                "Query all relations for claim-1: SELECT COUNT(*) FROM relations WHERE subject_id = 'claim-1' AND tx_to IS NULL"
              ]
            },
            "end_state": {
              "must_observe": [
                "covered as-of (2024-03-01) COUNT = 1",
                "uncovered as-of (2024-07-01) COUNT = 0",
                "all relations COUNT = 1",
                "R1 has validFrom = '2024-01-01'",
                "R1 has validTo = '2024-06-01'"
              ],
              "must_not_observe": [
                "covered as-of COUNT = 0",
                "uncovered as-of COUNT = 1",
                "both queries return same COUNT",
                "all relations COUNT = 0"
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
      "description": "GIVEN the evidence schema is migrated from Sprint 04, WHEN querying information_schema for tables and checking document-passage FK relations, THEN exactly ONE sources table and ONE passages table exist (no duplicate corpus); passages FK to sources via sourceId",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-canonical-corpus.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "duplicate passages tables created (shadow corpus split)",
            "sources table missing (0 count)",
            "sources table duplicated (count > 1)",
            "passages.sourceId FK constraint missing (no REFERENCES clause)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty-evidence-db",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo db:migrate",
                "Query sources tables: SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'sources' AND table_schema = 'public'",
                "Query passages tables: SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'passages' AND table_schema = 'public'",
                "Query passages FK: SELECT COUNT(*) FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.table_name = 'passages' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'sourceId'",
                "Query FK references: SELECT COUNT(*) FROM information_schema.referential_constraints rc JOIN information_schema.table_constraints tc ON rc.constraint_name = tc.constraint_name WHERE tc.table_name = 'passages' AND rc.unique_constraint_table_name = 'sources'"
              ]
            },
            "end_state": {
              "must_observe": [
                "information_schema.tables COUNT for name='sources' = 1",
                "information_schema.tables COUNT for name='passages' = 1",
                "passages FOREIGN KEY COUNT on sourceId = 1",
                "FK references COUNT WHERE unique_constraint_table_name = 'sources' = 1"
              ],
              "must_not_observe": [
                "information_schema.tables COUNT for name='passages' = 2 (duplicate)",
                "information_schema.tables COUNT for name='sources' = 0",
                "information_schema.tables COUNT for name='passages' = 0",
                "passages FOREIGN KEY COUNT = 0",
                "FK references COUNT WHERE unique_constraint_table_name = 'sources' = 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Seed command inserts exactly one claim, two passages, and two relations",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-seed.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Partial unique index prevents second open belief for same claim",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-unique-belief.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Relations validity windows filter correctly at covered vs uncovered as-of points",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-validity-windows.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Canonical corpus has exactly one passages table and one sources table",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/evidence-canonical-corpus.test.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
</details>
