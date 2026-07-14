# schema-2 — Drizzle domain schema — all domains → ~55 tables with merges, typed jsonb, status CHECK, uuidv7 PKs

## What this does

Author the complete Drizzle domain schema (~55 tables across ~16 files) implementing all table groups with merges, typed jsonb polymorphic columns, status CHECK constraints, uuidv7 primary keys, and timestamptz throughout, satisfying the source catalog dispositions, plus the holo db:migrate / db:probe / db:verify operator surface

Provides: drizzle-schema, domain-tables, uuidv7-primary-keys, status-check-constraints, holo-db-cli.


## Why

- Business 12→3 collapse (analysis_*)
- Research 5→3 collapse (research_*) with system discriminator
- Zero publication split (vectors/passages excluded)
- Source catalog disposition compliance
- Grounded in: UC-DATA-01, T-DATA-001, T-DATA-002, T-DATA-003, T-DATA-004, T-DATA-020.


## How to verify

- `bun services/platform/src/cli/holo.ts db:migrate` → Exit 0, all migrations applied, ≥55 tables created
- `bun services/platform/src/cli/holo.ts db:probe --jsonb cardData` → Exit 0, structural equality: true
- `bun services/platform/src/cli/holo.ts db:probe --status` → Exit non-zero on 'in-progress'; exit 0 on 'in_progress'

## Scope

Writes: `services/platform/src/db/schema/*.ts (NEW — Drizzle schema files, ~16 files)` · `services/platform/src/db/migrations/ (NEW — generated SQL migrations)` · `services/platform/src/cli/holo.ts (MODIFY — add db:migrate/db:probe/db:verify subcommands)` · `drizzle.config.ts (NEW — Drizzle config)`.  
Prohibited: `convex/** (read-only legacy)` · `app/** (not this sprint)` · `holocron-mcp/src/** (not this sprint)` · `tests/** (schema-5 owns the test suite)`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: schema-2 — Drizzle domain schema — all domains → ~55 tables with merges, typed jsonb, status CHECK, uuidv7 PKs
================================================================================

TASK_TYPE:  CONFIG
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L  (360 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: True)
CAPABILITY: CAP-SYNC-01
SPRINT:     [Sprint 4 — Provision Postgres and Domain Schema](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      DB_IT=1 pnpm vitest run <path>     (schema-5 integration suite)
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Drizzle migrations apply against real Postgres with 0 errors creating all ~55 tables with merges collapsed, status constraints enforced, typed jsonb round-tripping, and source-catalog coverage green

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Create ~55 tables across ~16 Drizzle schema files
- MUST Use uuidv7 for all primary keys
- MUST Use timestamptz throughout
- MUST Make polymorphic columns typed jsonb
- MUST Add status CHECK constraints with shared Zod enums
- MUST Implement business 12→3 merge (analysis_sessions/items/evidence via kind enum + payload jsonb)
- MUST Implement research 5→3 merge (research_*) with a system discriminator
- MUST Add legacy_convex_id columns for all tables
- MUST Satisfy 12-convex-source-catalog.yaml dispositions
- NEVER Use SQLite (AP-1 violation)
- NEVER Use auto-increment or serial IDs
- NEVER Add RLS (AP-7 violation)
- NEVER Create per-domain shells for merged tables (revenue_validation_sessions, competitive_analysis_sessions, deep_research_sessions, etc.)
- NEVER Omit status CHECK constraints
- STRICTLY All primary keys must be uuidv7
- STRICTLY Every table must carry a nullable indexed legacy_convex_id
- STRICTLY Status columns must have CHECK + shared Zod enum
- STRICTLY Business merges must collapse to exactly 3 analysis_* tables
- STRICTLY Research merges must collapse to exactly 3 research_* tables

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): All ~55 domain tables materialize via Drizzle migrate with 0 errors
- [ ] AC-2: Polymorphic jsonb columns round-trip with structural equality
- [ ] AC-3: Status CHECK constraint rejects out-of-vocabulary values
- [ ] AC-4: Business 12→3 and research 5→3 merges collapsed to trios
- [ ] AC-5: Every legacy surface has an approved source-catalog disposition
- [ ] `pnpm biome check .` clean + `pnpm tsgo --noEmit` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (completeness proven against real Postgres, not hand-asserted)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] All ~55 domain tables materialize via Drizzle migrate with 0 errors (flow_ref T-DATA-001)
  GIVEN Postgres 18 running with pgvector and the Drizzle schema authored
  WHEN  An operator runs holo db:migrate against a fresh Postgres 18
  THEN  All migrations apply with 0 errors and ≥55 tables are created
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: postgres_18_with_pgvector · evidence: stdout
    NEGATIVE_CONTROL: would fail if Drizzle schema files missing; Migration SQL invalid; Postgres not running; pgvector not installed; migration is a no-op stub
    MUST_OBSERVE: 0 errors; ≥55 tables created; exit code 0
    MUST_NOT_OBSERVE: ERROR; migration failed; 0 tables created

AC-2 Polymorphic jsonb columns round-trip with structural equality (flow_ref T-DATA-002)
  GIVEN Drizzle schema with typed jsonb columns (cardData, configJson, metadataJson, plan, payload)
  WHEN  Writing and reading a polymorphic payload through holo db:probe --jsonb
  THEN  The payload round-trips with structural equality
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: migrated_postgres · evidence: stdout
    NEGATIVE_CONTROL: would fail if jsonb column missing; type casting fails; structural comparison not enforced; value stored as text not jsonb; the required object/config is absent or a no-op stub
    MUST_OBSERVE: structural equality: true; `payload` matches
    MUST_NOT_OBSERVE: type mismatch; structural inequality; null payload; 0 rows / empty start state

AC-3 Status CHECK constraint rejects out-of-vocabulary values (flow_ref T-DATA-003)
  GIVEN Drizzle schema with normalized status CHECK constraints + shared Zod enums
  WHEN  Inserting an out-of-vocabulary status then the normalized value
  THEN  The CHECK rejects the invalid value and accepts the normalized one
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: migrated_postgres · evidence: stdout
    NEGATIVE_CONTROL: would fail if CHECK constraint missing; invalid status accepted; no Zod enum validation; constraint is a no-op
    MUST_OBSERVE: 'in-progress' rejected by CHECK; 'in_progress' accepted; `constraint` violation error
    MUST_NOT_OBSERVE: both accepted; neither rejected; no constraint error

AC-4 Business 12→3 and research 5→3 merges collapsed to trios (flow_ref T-DATA-004)
  GIVEN Drizzle schema with merged analysis_* and research_* tables
  WHEN  Running holo db:verify --merges
  THEN  Exactly one analysis_* trio and one research_* trio exist, with no per-domain shells
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: migrated_postgres · evidence: stdout
    NEGATIVE_CONTROL: would fail if per-domain shell tables exist; more than 3 analysis_* targets; research tables not merged; missing discriminators; the required object/config is absent or a no-op stub
    MUST_OBSERVE: `analysis_sessions`, analysis_items, analysis_evidence; research_sessions, `research_iterations`, research_findings; no per-`domain` shells
    MUST_NOT_OBSERVE: revenue_validation_sessions; competitive_analysis_sessions; deep_research_sessions; more than 3 targets per group; 0 rows / empty start state

AC-5 Every legacy surface has an approved source-catalog disposition (flow_ref T-DATA-020)
  GIVEN Drizzle schema and the committed 12-convex-source-catalog.yaml
  WHEN  Running source-catalog coverage verification
  THEN  Every table/field/storage reference has an approved disposition
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: migrated_postgres_with_catalog · evidence: stdout
    NEGATIVE_CONTROL: would fail if missing table in catalog; field not dispositioned; storage ref omitted; schema conflicts with catalog
    MUST_OBSERVE: all 60 legacy tables dispositioned; every field `mapped`; `storage` refs covered
    MUST_NOT_OBSERVE: unmapped table; missing field disposition; uncovered storage ref; 0 rows / empty start state

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/db/schema/*.ts (NEW — Drizzle schema files, ~16 files)
- services/platform/src/db/migrations/ (NEW — generated SQL migrations)
- services/platform/src/cli/holo.ts (MODIFY — add db:migrate/db:probe/db:verify subcommands)
- drizzle.config.ts (NEW — Drizzle config)
writeProhibited: convex/** (read-only legacy), app/** (not this sprint), holocron-mcp/src/** (not this sprint), tests/** (schema-5 owns the test suite)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/03-data-schema.md:1-53 [Table groups, merges, evidence-graph substrate, vectors/search]
2. .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml:1-400 [Approved dispositions for every table/field/storage ref]
3. services/platform/src/catalog/merges.ts:1-162 [Business 12→3 and research 5→3 merge target logic]
4. .spec/prds/mk6-migration/10-technical-requirements/01-architecture-posture.md:AP-1, AP-7 [Postgres-only, no RLS, single-user]
5. services/platform/src/cli/holo.ts:1-60 [The operator CLI to extend with db:* subcommands]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Migrate applies cleanly: `bun services/platform/src/cli/holo.ts db:migrate` → Exit 0, all migrations applied, ≥55 tables created
- jsonb round-trip: `bun services/platform/src/cli/holo.ts db:probe --jsonb cardData` → Exit 0, structural equality: true
- Status CHECK enforced: `bun services/platform/src/cli/holo.ts db:probe --status` → Exit non-zero on 'in-progress'; exit 0 on 'in_progress'
- Merges collapsed: `bun services/platform/src/cli/holo.ts db:verify --merges` → Exit 0, exactly 3 analysis_* + 3 research_* targets, no per-domain shells
- Catalog coverage: `bun services/platform/src/cli/holo.ts catalog:coverage` → Exit 0, 60/60 tables dispositioned

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: All tables use uuidv7 PKs; every table carries a nullable indexed legacy_convex_id; status columns have CHECK + shared Zod; merges use discriminator columns (kind enum, system discriminator); Zero publication split requires schema separation — keep vectors in passages, not documents
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: schema-1 · sprint-02-convex-source-catalog-asset-inventory  ·  Blocks: schema-3 · schema-4 · schema-5 · schema-6

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "schema-2",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "postgres_18_with_pgvector": {
      "description": "Postgres 18 instance with pgvector installed and wal_level=logical (from schema-1)",
      "seed_method": "recorded_external",
      "records": [
        "Postgres 18.x.x",
        "pgvector installed",
        "wal_level=logical"
      ]
    },
    "migrated_postgres": {
      "description": "Postgres 18 after Drizzle migrations applied successfully",
      "seed_method": "public_api",
      "records": [
        "\u226555 tables created",
        "all migrations applied",
        "0 errors"
      ]
    },
    "migrated_postgres_with_catalog": {
      "description": "Postgres with migrations applied + source catalog loaded for coverage checks",
      "seed_method": "public_api",
      "records": [
        "schema matches catalog",
        "all dispositions satisfied"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-DATA-001",
      "description": "GIVEN Postgres 18 with pgvector WHEN holo db:migrate runs THEN all ~55 tables created with 0 errors",
      "verify": "bun services/platform/src/cli/holo.ts db:migrate",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli",
        "flow_ref": "T-DATA-001",
        "negative_control": {
          "would_fail_if": [
            "Drizzle schema files missing",
            "Migration SQL invalid",
            "Postgres not running",
            "pgvector not installed",
            "migration is a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_18_with_pgvector",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run holo db:migrate against a fresh Postgres 18",
                "Count created tables"
              ]
            },
            "end_state": {
              "must_observe": [
                "0 errors",
                "\u226555 tables created",
                "exit code 0"
              ],
              "must_not_observe": [
                "ERROR",
                "migration failed",
                "0 tables created"
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
      "flow_ref": "T-DATA-002",
      "description": "GIVEN Drizzle jsonb columns WHEN polymorphic payload written/read THEN structural equality holds",
      "verify": "bun services/platform/src/cli/holo.ts db:probe --jsonb cardData",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli",
        "flow_ref": "T-DATA-002",
        "negative_control": {
          "would_fail_if": [
            "jsonb column missing",
            "type casting fails",
            "structural comparison not enforced",
            "value stored as text not jsonb",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated_postgres",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run holo db:probe --jsonb cardData with a nested sample payload",
                "Verify round-trip structural equality"
              ]
            },
            "end_state": {
              "must_observe": [
                "structural equality: true",
                "`payload` matches"
              ],
              "must_not_observe": [
                "type mismatch",
                "structural inequality",
                "null payload",
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
      "flow_ref": "T-DATA-003",
      "description": "GIVEN status CHECK constraints WHEN invalid value inserted THEN rejected by CHECK",
      "verify": "bun services/platform/src/cli/holo.ts db:probe --status",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli",
        "flow_ref": "T-DATA-003",
        "negative_control": {
          "would_fail_if": [
            "CHECK constraint missing",
            "invalid status accepted",
            "no Zod enum validation",
            "constraint is a no-op"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated_postgres",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Attempt INSERT with status='in-progress'",
                "Attempt INSERT with status='in_progress'",
                "Compare results"
              ]
            },
            "end_state": {
              "must_observe": [
                "'in-progress' rejected by CHECK",
                "'in_progress' accepted",
                "`constraint` violation error"
              ],
              "must_not_observe": [
                "both accepted",
                "neither rejected",
                "no constraint error"
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
      "description": "GIVEN merged tables WHEN db:verify --merges runs THEN exactly 3 analysis_* + 3 research_* targets, no per-domain shells",
      "verify": "bun services/platform/src/cli/holo.ts db:verify --merges",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli",
        "flow_ref": "T-DATA-004",
        "negative_control": {
          "would_fail_if": [
            "per-domain shell tables exist",
            "more than 3 analysis_* targets",
            "research tables not merged",
            "missing discriminators",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated_postgres",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run holo db:verify --merges",
                "Inspect merge targets"
              ]
            },
            "end_state": {
              "must_observe": [
                "`analysis_sessions`, analysis_items, analysis_evidence",
                "research_sessions, `research_iterations`, research_findings",
                "no per-`domain` shells"
              ],
              "must_not_observe": [
                "revenue_validation_sessions",
                "competitive_analysis_sessions",
                "deep_research_sessions",
                "more than 3 targets per group",
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
      "flow_ref": "T-DATA-020",
      "description": "GIVEN schema + source catalog WHEN catalog:coverage runs THEN every table/field/storage dispositioned",
      "verify": "bun services/platform/src/cli/holo.ts catalog:coverage",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli",
        "flow_ref": "T-DATA-020",
        "negative_control": {
          "would_fail_if": [
            "missing table in catalog",
            "field not dispositioned",
            "storage ref omitted",
            "schema conflicts with catalog"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated_postgres_with_catalog",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run holo catalog:coverage",
                "Verify all fields mapped"
              ]
            },
            "end_state": {
              "must_observe": [
                "all 60 legacy tables dispositioned",
                "every field `mapped`",
                "`storage` refs covered"
              ],
              "must_not_observe": [
                "unmapped table",
                "missing field disposition",
                "uncovered storage ref",
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
      "description": "All ~55 tables materialize via holo db:migrate with 0 errors",
      "verify": "bun services/platform/src/cli/holo.ts db:migrate \u2192 exit 0, \u226555 tables"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "jsonb round-trips with structural equality",
      "verify": "holo db:probe --jsonb cardData \u2192 structural equality true"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "Status CHECK rejects out-of-vocabulary values",
      "verify": "holo db:probe --status rejects 'in-progress', accepts 'in_progress'"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "Merges collapse to one analysis_* trio + one research_* trio",
      "verify": "holo db:verify --merges \u2192 exactly 3+3 targets, no shells"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "Source catalog coverage is complete (60/60 tables)",
      "verify": "holo catalog:coverage \u2192 60/60 tables dispositioned"
    }
  ]
}
-->
</details>