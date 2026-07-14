# schema-6 — Review schema vs source catalog + Zero split

## What this does

Adversarial review verifying Drizzle schema satisfies source catalog dispositions, merges collapsed, canonical corpus correct, Zero split proper, and architecture posture honored

Provides: review-verdict, approval-decision.


## Why

- Every table/field/storage ref has approved disposition (T-DATA-020)
- Canonical corpus has exactly one sources + one passages (T-DATA-022)
- Zero split excludes vectors/passages/evidence (CAP-SYNC-01)
- AP-1 no-SQLite + AP-7 no-RLS honored
- Grounded in: UC-DATA-01, T-DATA-020, T-DATA-022, CAP-SYNC-01.


## How to verify

- `bun services/platform/src/cli/holo.ts catalog:coverage` → Exit 0, 60/60 tables dispositioned
- `bun services/platform/src/cli/holo.ts db:verify --merges` → Exit 0, 3+3 trios, no shells
- `psql -c '\dt sources*' && psql -c '\dt passages*'` → Exit 0, exactly 1 sources + 1 passages

## Scope

Writes: `REVIEW output only (verdict comment/notes - no source modifications)`.  
Prohibited: `services/platform/** (read-only review)` · `convex/** (read-only)` · `app/** (read-only)` · `holocron-mcp/src/** (read-only)`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: schema-6 — Review schema vs source catalog + Zero split
================================================================================

TASK_TYPE:  REVIEW
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (90 min)
AGENT:      reviewer=mastra-reviewer
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
Reviewer runs all verification gates against real Postgres + source catalog, emits APPROVED verdict with concrete checks, or NEEDS_FIXES with specific violations

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Verify all ~55 tables satisfy source catalog dispositions
- MUST Verify business 12->3 merge collapsed (analysis_*)
- MUST Verify research 5->3 merge collapsed (research_*)
- MUST Verify no per-domain shell tables survive
- MUST Verify canonical corpus has exactly one sources + one passages relation
- MUST Verify Zero split excludes vectors/passages/evidence/citations/telemetry
- MUST Verify REPLICA IDENTITY DEFAULT on all published tables
- MUST Verify AP-1 no-SQLite honored
- MUST Verify AP-7 no-RLS honored
- MUST Run all verification gates against real migrated Postgres
- MUST Emit APPROVED or NEEDS_FIXES verdict
- NEVER Approve schema with unmapped tables
- NEVER Approve schema with per-domain shells
- NEVER Approve schema with vectors in zero_pub
- NEVER Approve schema with RLS
- NEVER Approve schema with SQLite references
- NEVER Skip verification gates
- STRICTLY Every legacy surface must have catalog disposition
- STRICTLY Merges must be exactly 3+3 trios
- STRICTLY Zero split must exclude vectors
- STRICTLY Canonical corpus must be one sources + one passages

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): Every table/field/storage ref has approved catalog disposition
- [ ] AC-2: Business 12->3 and research 5->3 merges collapsed
- [ ] AC-3: Canonical corpus has exactly one sources + one passages relation
- [ ] AC-4: Zero split excludes vectors/passages/evidence/citations/telemetry
- [ ] AC-5: AP-1 no-SQLite and AP-7 no-RLS honored
- [ ] `pnpm biome check .` clean + `pnpm tsgo --noEmit` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (completeness proven against real Postgres, not hand-asserted)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Every table/field/storage ref has approved catalog disposition (flow_ref T-DATA-020)
  GIVEN Drizzle schema and source catalog
  WHEN  Reviewer runs catalog coverage verification
  THEN  Every legacy surface has approved disposition, no unmapped tables
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: migrated_postgres_with_catalog · evidence: stdout
    NEGATIVE_CONTROL: would fail if Unmapped table exists; Field not dispositioned; Storage ref missing; Schema conflicts with catalog; the required object/config is absent or a no-op stub
    MUST_OBSERVE: 60/60 tables dispositioned; All `fields` mapped; 6 storage refs covered; No `unmapped` items
    MUST_NOT_OBSERVE: Unmapped table; Missing field disposition; Uncovered storage ref; Schema mismatch; 0 rows / empty start state

AC-2 Business 12->3 and research 5->3 merges collapsed (flow_ref T-DATA-004)
  GIVEN Drizzle schema with merged tables
  WHEN  Reviewer runs merge verification
  THEN  Exactly one analysis_* trio and one research_* trio exist, no per-domain shells
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: migrated_postgres · evidence: stdout
    NEGATIVE_CONTROL: would fail if Per-domain shell tables exist; More than 3 analysis_* targets; Research not merged; Missing discriminators; the required object/config is absent or a no-op stub
    MUST_OBSERVE: `analysis_sessions`, analysis_items, analysis_evidence; research_sessions, `research_iterations`, research_findings; No per-`domain` shells; `Discriminators` present
    MUST_NOT_OBSERVE: revenue_validation_sessions; competitive_analysis_sessions; deep_research_sessions; More than 3 targets; 0 rows / empty start state

AC-3 Canonical corpus has exactly one sources + one passages relation (flow_ref T-DATA-022)
  GIVEN Drizzle evidence-graph schema
  WHEN  Reviewer inspects evidence tables
  THEN  Exactly one sources and one passages table exist, no duplicates
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-18-real · TDD_STATE: none
  SCENARIO — start_ref: migrated_postgres · evidence: stdout
    NEGATIVE_CONTROL: would fail if Multiple sources tables exist; Multiple passages tables exist; Duplicate physical relations; the required object/config is absent or a no-op stub
    MUST_OBSERVE: sources: 1; passages: 1; No `duplicate` relations
    MUST_NOT_OBSERVE: sources: 0; passages: 0; Multiple sources_*; Multiple passages_*; Duplicate physical relations

AC-4 Zero split excludes vectors/passages/evidence/citations/telemetry (flow_ref CAP-SYNC-01)
  GIVEN zero_pub publication
  WHEN  Reviewer runs replication status
  THEN  Publication excludes vectors, passages, evidence, citations, telemetry
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: postgres_with_zero_pub · evidence: stdout
    NEGATIVE_CONTROL: would fail if passages in publication; vector columns published; evidence tables included; citations included; telemetry included; the required object/config is absent or a no-op stub
    MUST_OBSERVE: `passages` NOT in zero_pub; sources NOT in `zero_pub`; claims NOT in `zero_pub`; `entities` NOT in zero_pub; `relations` NOT in zero_pub; beliefs NOT in `zero_pub`; `citations` NOT in zero_pub; `agent_telemetry` NOT in zero_pub
    MUST_NOT_OBSERVE: passages in zero_pub; vectors in publication; evidence tables published; 0 rows / empty start state

AC-5 AP-1 no-SQLite and AP-7 no-RLS honored (flow_ref UC-DATA-01)
  GIVEN Drizzle schema and Postgres instance
  WHEN  Reviewer checks architecture posture
  THEN  No SQLite references, no RLS policies, single-user tailnet trust
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-18-real · TDD_STATE: none
  SCENARIO — start_ref: migrated_postgres · evidence: stdout
    NEGATIVE_CONTROL: would fail if SQLite references found; RLS policies present; Multi-tenant schemas exist; the required object/config is absent or a no-op stub
    MUST_OBSERVE: No sqlite `references`; 0 rows in pg_policies; Single schema 'public'
    MUST_NOT_OBSERVE: sqlite mentioned; RLS policies found; Multi-tenant schemas; 0 rows / empty start state

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- REVIEW output only (verdict comment/notes - no source modifications)
writeProhibited: services/platform/** (read-only review), convex/** (read-only), app/** (read-only), holocron-mcp/src/** (read-only)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml:1-400 [Approved dispositions for every table/field/storage ref]
2. .spec/prds/mk6-migration/10-technical-requirements/03-data-schema.md:1-53 [Schema invariants, merges, evidence-graph substrate]
3. .spec/prds/mk6-migration/10-technical-requirements/01-architecture-posture.md:AP-1, AP-7 [Postgres-only, no RLS, single-user tailnet trust]
4. .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:CAP-SYNC-01 [Zero reactive sync boundary contracts]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Source catalog coverage: `bun services/platform/src/cli/holo.ts catalog:coverage` → Exit 0, 60/60 tables dispositioned
- Merges verification: `bun services/platform/src/cli/holo.ts db:verify --merges` → Exit 0, 3+3 trios, no shells
- Canonical corpus: `psql -c '\dt sources*' && psql -c '\dt passages*'` → Exit 0, exactly 1 sources + 1 passages
- Zero split: `bun services/platform/src/cli/holo.ts repl:status` → Exit 0, vectors/passages/evidence excluded
- Architecture posture: `grep -r sqlite services/platform/src/db/schema/ ; psql -c 'SELECT * FROM pg_policies;'` → 0 SQLite refs, 0 RLS policies

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: Reviewer runs all verification gates; Approves only if all checks pass; Emits NEEDS_FIXES with specific violations; Adversarial review against source catalog
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: schema-2 · schema-3 · schema-4 · schema-5  ·  Blocks: 

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "schema-6",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "migrated_postgres_with_catalog": {
      "description": "Postgres with migrations applied and source catalog loaded",
      "seed_method": "public_api",
      "records": [
        "~55 tables exist",
        "12-convex-source-catalog.yaml loaded"
      ]
    },
    "migrated_postgres": {
      "description": "Postgres with all migrations from schema-2/3/4 applied",
      "seed_method": "public_api",
      "records": [
        "Tables created",
        "Indexes present",
        "zero_pub exists"
      ]
    },
    "postgres_with_zero_pub": {
      "description": "Postgres with zero_pub publication configured",
      "seed_method": "public_api",
      "records": [
        "zero_pub created",
        "Tables published"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-DATA-020",
      "description": "GIVEN schema + catalog WHEN reviewer runs catalog:coverage THEN every table/field/storage dispositioned",
      "verify": "holo catalog:coverage",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli",
        "flow_ref": "T-DATA-020",
        "negative_control": {
          "would_fail_if": [
            "Unmapped table exists",
            "Field not dispositioned",
            "Storage ref missing",
            "Schema conflicts with catalog",
            "the required object/config is absent or a no-op stub"
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
              "actor": "reviewer",
              "steps": [
                "Run holo catalog:coverage",
                "Inspect unmapped items",
                "Check all 60 tables dispositioned",
                "Verify every field mapped"
              ]
            },
            "end_state": {
              "must_observe": [
                "60/60 tables dispositioned",
                "All `fields` mapped",
                "6 storage refs covered",
                "No `unmapped` items"
              ],
              "must_not_observe": [
                "Unmapped table",
                "Missing field disposition",
                "Uncovered storage ref",
                "Schema mismatch",
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
      "flow_ref": "T-DATA-004",
      "description": "GIVEN merged schema WHEN reviewer runs db:verify --merges THEN 3+3 trios, no shells",
      "verify": "holo db:verify --merges",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli",
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
            "start_ref": "migrated_postgres",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Run holo db:verify --merges",
                "Verify 3 analysis_* targets",
                "Verify 3 research_* targets",
                "Check discriminators present"
              ]
            },
            "end_state": {
              "must_observe": [
                "`analysis_sessions`, analysis_items, analysis_evidence",
                "research_sessions, `research_iterations`, research_findings",
                "No per-`domain` shells",
                "`Discriminators` present"
              ],
              "must_not_observe": [
                "revenue_validation_sessions",
                "competitive_analysis_sessions",
                "deep_research_sessions",
                "More than 3 targets",
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
      "flow_ref": "T-DATA-022",
      "description": "GIVEN evidence schema WHEN reviewer inspects tables THEN exactly one sources + one passages",
      "verify": "psql \\dt",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-18-real",
        "flow_ref": "T-DATA-022",
        "negative_control": {
          "would_fail_if": [
            "Multiple sources tables exist",
            "Multiple passages tables exist",
            "Duplicate physical relations",
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
              "actor": "reviewer",
              "steps": [
                "Query pg_tables for sources pattern",
                "Query pg_tables for passages pattern",
                "Verify exactly one of each"
              ]
            },
            "end_state": {
              "must_observe": [
                "sources: 1",
                "passages: 1",
                "No `duplicate` relations"
              ],
              "must_not_observe": [
                "sources: 0",
                "passages: 0",
                "Multiple sources_*",
                "Multiple passages_*",
                "Duplicate physical relations"
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
      "flow_ref": "CAP-SYNC-01",
      "description": "GIVEN zero_pub WHEN reviewer runs repl:status THEN vectors/passages/evidence excluded",
      "verify": "holo repl:status",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli",
        "flow_ref": "CAP-SYNC-01",
        "negative_control": {
          "would_fail_if": [
            "passages in publication",
            "vector columns published",
            "evidence tables included",
            "citations included",
            "telemetry included",
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
              "actor": "reviewer",
              "steps": [
                "Run holo repl:status",
                "Inspect zero_pub table list",
                "Verify passages excluded",
                "Verify vectors excluded",
                "Check evidence excluded"
              ]
            },
            "end_state": {
              "must_observe": [
                "`passages` NOT in zero_pub",
                "sources NOT in `zero_pub`",
                "claims NOT in `zero_pub`",
                "`entities` NOT in zero_pub",
                "`relations` NOT in zero_pub",
                "beliefs NOT in `zero_pub`",
                "`citations` NOT in zero_pub",
                "`agent_telemetry` NOT in zero_pub"
              ],
              "must_not_observe": [
                "passages in zero_pub",
                "vectors in publication",
                "evidence tables published",
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
      "flow_ref": "UC-DATA-01",
      "description": "GIVEN schema WHEN reviewer checks posture THEN no SQLite, no RLS",
      "verify": "Schema inspection + pg_policies",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-18-real",
        "flow_ref": "UC-DATA-01",
        "negative_control": {
          "would_fail_if": [
            "SQLite references found",
            "RLS policies present",
            "Multi-tenant schemas exist",
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
              "actor": "reviewer",
              "steps": [
                "Check schema files for sqlite references",
                "Check pg_policies for RLS",
                "Verify single-user posture"
              ]
            },
            "end_state": {
              "must_observe": [
                "No sqlite `references`",
                "0 rows in pg_policies",
                "Single schema 'public'"
              ],
              "must_not_observe": [
                "sqlite mentioned",
                "RLS policies found",
                "Multi-tenant schemas",
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
      "description": "Source catalog coverage complete",
      "verify": "catalog:coverage -> 60/60 tables"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "Merges collapsed correctly",
      "verify": "db:verify --merges -> 3+3 targets"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "Canonical corpus has one sources + one passages",
      "verify": "\\dt -> exactly 1 each"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "Zero split excludes vectors",
      "verify": "repl:status -> vectors excluded"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "Architecture posture honored",
      "verify": "No SQLite, no RLS"
    }
  ]
}
-->
</details>