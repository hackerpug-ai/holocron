# schema-3 — HNSW + GIN + btree indexes incl. generated search_vector tsvector

## What this does

Create the index substrate: passages HNSW (vector_cosine_ops), 5 inline HNSW columns, generated search_vector tsvector columns with GIN indexes, and btree/GIN covering indexes, using HNSW not IVFFlat for ~15-40K vectors

Provides: vector-hnsw-indexes, fts-gin-indexes, covering-indexes, search-vector-generated.


## Why

- HNSW not IVFFlat for ~15-40K vectors
- Zero publication split (vectors indexed but not published)
- Grounded in: UC-DATA-01, T-DATA-001, T-DATA-015.


## How to verify

- `bun services/platform/src/cli/holo.ts db:verify --indexes` → Exit 0, all HNSW/GIN/btree indexes found, no IVFFlat
- `psql -c 'EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM passages ORDER BY embedding <=> (SELECT embedding FROM passages LIMIT 1) LIMIT 10;'` → Index Scan using passages_embedding_hnsw

## Scope

Writes: `services/platform/src/db/schema/*.ts (MODIFY - add indexes)` · `services/platform/src/db/migrations/ (NEW - index migration SQL)` · `services/platform/src/cli/holo.ts (MODIFY - add db:verify --indexes)`.  
Prohibited: `convex/** (read-only)` · `app/** (not this sprint)` · `holocron-mcp/src/** (not this sprint)`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: schema-3 — HNSW + GIN + btree indexes incl. generated search_vector tsvector
================================================================================

TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (150 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: True)
CAPABILITY: —
SPRINT:     [Sprint 4 — Provision Postgres and Domain Schema](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      DB_IT=1 pnpm vitest run <path>     (schema-5 integration suite)
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
holo db:verify --indexes confirms every declared index exists with correct type (HNSW/GIN/btree) on its target table and column

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Create passages HNSW index with vector_cosine_ops
- MUST Create 5 inline HNSW columns (research_findings, research_iterations, subscription_content, toolbelt_tools, improvement_requests)
- MUST Create generated search_vector tsvector columns for FTS
- MUST Create GIN indexes on all search_vector columns
- MUST Create btree/GIN covering indexes for common queries
- MUST Use HNSW NOT IVFFlat (no lists training, no REINDEX on growth)
- MUST Index dimensions must match vector(1024)
- NEVER Use IVFFlat indexes
- NEVER Forget HNSW on passages embedding
- NEVER Omit GIN on tsvector columns
- NEVER Use vector dimensions other than 1024
- STRICTLY passages must have HNSW index named exactly 'passages_embedding_hnsw'
- STRICTLY All FTS tables must have generated search_vector + GIN
- STRICTLY HNSW indexes must use vector_cosine_ops

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): passages HNSW index with vector_cosine_ops exists
- [ ] AC-2: 5 inline HNSW columns have indexes
- [ ] AC-3: Generated search_vector tsvector + GIN indexes exist
- [ ] `pnpm biome check .` clean + `pnpm tsgo --noEmit` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (completeness proven against real Postgres, not hand-asserted)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] passages HNSW index with vector_cosine_ops exists (flow_ref T-DATA-015)
  GIVEN Drizzle schema with passages table and embedding column
  WHEN  Running index verification
  THEN  passages_embedding_hnsw index exists with type HNSW using vector_cosine_ops
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: migrated_postgres_with_schema · evidence: stdout
    NEGATIVE_CONTROL: would fail if HNSW index missing; Index type is IVFFlat; vector_cosine_ops not used; Index name incorrect; the required object/config is absent or a no-op stub
    MUST_OBSERVE: `passages_embedding_hnsw`; access method: hnsw; `vector_cosine_ops`
    MUST_NOT_OBSERVE: no HNSW index found; access method: ivfflat; IVFFlat index present; Index not found

AC-2 5 inline HNSW columns have indexes (flow_ref T-DATA-015)
  GIVEN Drizzle schema with research_findings, research_iterations, subscription_content, toolbelt_tools, improvement_requests
  WHEN  Running index verification
  THEN  All 5 tables have HNSW indexes on their vector columns
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: migrated_postgres_with_schema · evidence: stdout
    NEGATIVE_CONTROL: would fail if Any of the 5 indexes missing; Index type wrong; Vector column missing; the required object/config is absent or a no-op stub
    MUST_OBSERVE: `research_findings_embedding_hnsw`; `research_iterations_embedding_hnsw`; `subscription_content_embedding_hnsw`; `toolbelt_tools_embedding_hnsw`; `improvement_requests_embedding_hnsw`
    MUST_NOT_OBSERVE: Missing HNSW index; Index count less than 5; 0 rows / empty start state

AC-3 Generated search_vector tsvector + GIN indexes exist (flow_ref T-DATA-001)
  GIVEN Drizzle schema with FTS tables
  WHEN  Running index verification
  THEN  All FTS tables have generated search_vector column and GIN index
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: migrated_postgres_with_schema · evidence: stdout
    NEGATIVE_CONTROL: would fail if search_vector column missing; Not generated; GIN index missing; Column is plain tsvector not generated; the required object/config is absent or a no-op stub
    MUST_OBSERVE: `search_vector`; generated: true; gin index `exists`; `documents_search_vector_gin`; `sources_search_vector_gin`
    MUST_NOT_OBSERVE: no GIN index; search_vector not generated; Missing search_vector column

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/db/schema/*.ts (MODIFY - add indexes)
- services/platform/src/db/migrations/ (NEW - index migration SQL)
- services/platform/src/cli/holo.ts (MODIFY - add db:verify --indexes)
writeProhibited: convex/** (read-only), app/** (not this sprint), holocron-mcp/src/** (not this sprint)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/03-data-schema.md:35-43 [Vectors & search: HNSW not IVFFlat, 6 Convex indexes -> 1 passages HNSW + 5 inline]
2. .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:CAP-SYNC-01 [Zero split: vectors indexed but not published]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- All indexes exist: `bun services/platform/src/cli/holo.ts db:verify --indexes` → Exit 0, all HNSW/GIN/btree indexes found, no IVFFlat
- HNSW query plan: `psql -c 'EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM passages ORDER BY embedding <=> (SELECT embedding FROM passages LIMIT 1) LIMIT 10;'` → Index Scan using passages_embedding_hnsw

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: HNSW wins for ~15-40K vectors (no lists training, no REINDEX); Inline HNSW for small vector columns; Generated search_vector tsvector via GENERATED ALWAYS AS; GIN for FTS, HNSW for vectors
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: schema-2  ·  Blocks: schema-5 · schema-6

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "schema-3",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "migrated_postgres_with_schema": {
      "description": "Postgres after Drizzle schema-2 migrations applied",
      "seed_method": "public_api",
      "records": [
        "~55 tables exist",
        "All columns defined",
        "Vector columns present"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-DATA-015",
      "description": "GIVEN passages table WHEN db:verify --indexes runs THEN passages_embedding_hnsw exists with HNSW + vector_cosine_ops",
      "verify": "holo db:verify --indexes",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli",
        "flow_ref": "T-DATA-015",
        "negative_control": {
          "would_fail_if": [
            "HNSW index missing",
            "Index type is IVFFlat",
            "vector_cosine_ops not used",
            "Index name incorrect",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated_postgres_with_schema",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run holo db:verify --indexes",
                "Inspect output for passages_embedding_hnsw"
              ]
            },
            "end_state": {
              "must_observe": [
                "`passages_embedding_hnsw`",
                "access method: hnsw",
                "`vector_cosine_ops`"
              ],
              "must_not_observe": [
                "no HNSW index found",
                "access method: ivfflat",
                "IVFFlat index present",
                "Index not found"
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
      "flow_ref": "T-DATA-015",
      "description": "GIVEN 5 tables with vector columns WHEN db:verify --indexes runs THEN all 5 have HNSW indexes",
      "verify": "holo db:verify --indexes",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli",
        "flow_ref": "T-DATA-015",
        "negative_control": {
          "would_fail_if": [
            "Any of the 5 indexes missing",
            "Index type wrong",
            "Vector column missing",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated_postgres_with_schema",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run holo db:verify --indexes",
                "Check for all 5 HNSW indexes"
              ]
            },
            "end_state": {
              "must_observe": [
                "`research_findings_embedding_hnsw`",
                "`research_iterations_embedding_hnsw`",
                "`subscription_content_embedding_hnsw`",
                "`toolbelt_tools_embedding_hnsw`",
                "`improvement_requests_embedding_hnsw`"
              ],
              "must_not_observe": [
                "Missing HNSW index",
                "Index count less than 5",
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
      "flow_ref": "T-DATA-001",
      "description": "GIVEN FTS tables WHEN db:verify --indexes runs THEN search_vector generated + GIN exists",
      "verify": "holo db:verify --indexes",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli",
        "flow_ref": "T-DATA-001",
        "negative_control": {
          "would_fail_if": [
            "search_vector column missing",
            "Not generated",
            "GIN index missing",
            "Column is plain tsvector not generated",
            "the required object/config is absent or a no-op stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated_postgres_with_schema",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run holo db:verify --indexes",
                "Verify search_vector + GIN on FTS tables"
              ]
            },
            "end_state": {
              "must_observe": [
                "`search_vector`",
                "generated: true",
                "gin index `exists`",
                "`documents_search_vector_gin`",
                "`sources_search_vector_gin`"
              ],
              "must_not_observe": [
                "no GIN index",
                "search_vector not generated",
                "Missing search_vector column"
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
      "description": "passages HNSW index exists",
      "verify": "holo db:verify --indexes -> passages_embedding_hnsw found"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "5 inline HNSW columns have indexes",
      "verify": "holo db:verify --indexes -> 5 HNSW indexes found"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "FTS search_vector + GIN exist",
      "verify": "holo db:verify --indexes -> GIN on search_vector columns"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "Query plan uses HNSW",
      "verify": "EXPLAIN ANALYZE shows hnsw scan"
    }
  ]
}
-->
</details>