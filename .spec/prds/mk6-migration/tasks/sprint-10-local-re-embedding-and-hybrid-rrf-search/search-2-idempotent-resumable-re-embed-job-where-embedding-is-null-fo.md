# search-2 — Idempotent resumable re-embed job (WHERE embedding IS NULL ... FOR UPDATE SKIP LOCKED) + optional contextual header + holo embed:run
> Status: ✅ Completed
> Cycle: 1
> Commit: a31876b15232a739d540f248bc395f95fe820dc2
> Reviewer: mastra-reviewer
> Completed: 2026-07-17T17:44:33Z

## What this does

Provide the idempotent, resumable re-embed job that fills NULL embedding columns in the passages table using document-mode Qwen3 embeddings, plus the holo embed:run operator command — making every passage searchable via the RRF fusion in search-3.

Provides: embedRun() — idempotent re-embed job: SELECT passages WHERE embedding IS NULL FOR UPDATE SKIP LOCKED → embed each in document mode → UPDATE passages SET embedding; holo embed:run operator command wired into the CLI switch (holo.ts); optional contextual situatingHeader generation (document title + section context) for passages lacking one

## Why

- MUST Use WHERE embedding IS NULL ... FOR UPDATE SKIP LOCKED — the resumable + concurrent-safe selector
- MUST Embed stored passages in document mode only (prefixPolicy.document)
- MUST Commit per-passage so an interruption leaves completed embeddings persisted (resumable)
- MUST Verify vector dimension === 1024 before UPDATE — reject wrong-dimension vectors from the fleet
- NEVER Re-embed passages that already carry a non-null embedding (idempotency violation)
- NEVER Insert duplicate passages on resume — UPDATE existing rows, never re-INSERT
- NEVER Roll back already-embedded passages when a later passage fails (all-or-nothing is wrong here)
- NEVER Store a query-mode embedding in the passages table (asymmetry: stored = document mode)
- STRICTLY Follow the holo.ts command-dispatch pattern (holo.ts:390 switch / case 'embed:run')
- STRICTLY UPDATE passages SET embedding = ${vector} WHERE id = ${id} — one statement per passage inside the SKIP LOCKED transaction
- Grounded in: UC-DATA-03; CAP-EMB-01

## How to verify

- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts` → test fails against absent embedRun() before implementation (ReferenceError)
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts` → exit 0
- `pnpm tsgo --noEmit` → exit 0
- `pnpm biome check .` → exit 0
- `git diff --name-only` → only embed-run.ts, holo.ts, embed-run.test.ts modified
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/inference/embed-run.ts (NEW) · services/platform/src/cli/holo.ts (MODIFY — add embed:run + embed:verify cases) · services/platform/tests/integration/embed-run.test.ts (NEW)

Prohibited: services/platform/src/inference/embed.ts — search-1 owns the helper; embedRun consumes it, services/platform/src/db/schema/** — schema is frozen; consume the passages table, do not alter it, services/platform/src/tools/schemas/search.ts — search-3 owns the search schemas

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: search-2 — Idempotent resumable re-embed job (WHERE embedding IS NULL ... FOR UPDATE SKIP LOCKED) + optional contextual header + holo embed:run
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (180 min)
AGENT:      mastra-implementer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: true)
CAPABILITY: CAP-EMB-01
SPRINT:     [Sprint 10 — Local Re-embedding and Hybrid RRF Search](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Provide the idempotent, resumable re-embed job that fills NULL embedding columns in the passages table using document-mode Qwen3 embeddings, plus the holo embed:run operator command — making every passage searchable via the RRF fusion in search-3.

After holo embed:run, zero passages carry a NULL or wrong-dimension embedding, a second run changes nothing, and an interrupted run resumes without duplicates.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Use WHERE embedding IS NULL ... FOR UPDATE SKIP LOCKED — the resumable + concurrent-safe selector
- MUST Embed stored passages in document mode only (prefixPolicy.document)
- MUST Commit per-passage so an interruption leaves completed embeddings persisted (resumable)
- MUST Verify vector dimension === 1024 before UPDATE — reject wrong-dimension vectors from the fleet
- NEVER Re-embed passages that already carry a non-null embedding (idempotency violation)
- NEVER Insert duplicate passages on resume — UPDATE existing rows, never re-INSERT
- NEVER Roll back already-embedded passages when a later passage fails (all-or-nothing is wrong here)
- NEVER Store a query-mode embedding in the passages table (asymmetry: stored = document mode)
- STRICTLY Follow the holo.ts command-dispatch pattern (holo.ts:390 switch / case 'embed:run')
- STRICTLY UPDATE passages SET embedding = ${vector} WHERE id = ${id} — one statement per passage inside the SKIP LOCKED transaction

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: embedRun fills all NULL embeddings with 1024-dim vectors [PRIMARY] (flow_ref T-DATA-012)
- [ ] AC-2: re-running embedRun is idempotent — no duplicates, no re-embed (flow_ref T-DATA-012)
- [ ] AC-3: embedRun resumes after interruption without duplicating (flow_ref T-DATA-012)
- [ ] AC-4: mid-batch fleet error commits completed passages and surfaces a typed EmbedRunError (flow_ref T-DATA-012)
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 embedRun fills all NULL embeddings with 1024-dim vectors (PRIMARY) (flow_ref T-DATA-012)
  GIVEN: real Postgres passages table with 3 passages all carrying embedding = NULL
  WHEN:  embedRun() runs once
  THEN:  every passage now carries a non-null 1024-dim vector and the count of NULL embeddings is 0
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-passages-null-embed · evidence: db_query
    NEGATIVE_CONTROL: would fail if embedRun() is a no-op that leaves all embeddings NULL, embedRun() stores a hardcoded zero vector instead of a real fleet embedding, embedRun() is stubbed to UPDATE a single passage and skip the rest, the passages table is disconnected from the real Postgres instance
    CASE[0] start_ref=seeded-passages-null-embed · actor=background_job
      ACTION: await embedRun()
      MUST_OBSERVE: `SELECT COUNT(*) FROM passages WHERE embedding IS NULL === 0` | `SELECT COUNT(*) FROM passages WHERE vector_dims(embedding) === 1024 === 3` | `embedding IS NOT NULL on all 3 passages`
      MUST_NOT_OBSERVE: `embedding IS NULL count: 3` | null embedding | wrong-dimension vector

AC-2 re-running embedRun is idempotent — no duplicates, no re-embed (flow_ref T-DATA-012)
  GIVEN: the passages table is fully embedded (every passage carries a non-null 1024-dim vector, row count 3)
  WHEN:  embedRun() runs a second time
  THEN:  the passage row count is unchanged at 3, no duplicate (documentId, ordinal) pairs exist, and zero rows were re-processed
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: fully-embedded-passages · evidence: db_query
    NEGATIVE_CONTROL: would fail if the second run re-embeds all passages (WHERE clause missing embedding IS NULL filter), the second run INSERTs duplicate passage rows, embedRun ignores the NULL filter and processes all rows
    CASE[0] start_ref=fully-embedded-passages · actor=background_job
      ACTION: await embedRun() (second invocation)
      MUST_OBSERVE: `passages row count unchanged: 3` | `SELECT COUNT(*) FROM passages WHERE embedding IS NULL === 0` | `COUNT of duplicate (documentId, ordinal) pairs === 0`
      MUST_NOT_OBSERVE: `row count > 3` | duplicate ordinals | new passages inserted

AC-3 embedRun resumes after interruption without duplicating (flow_ref T-DATA-012)
  GIVEN: 3 passages where ordinal 0 is embedded but ordinals 1 and 2 carry embedding = NULL (simulating an interruption after 1 of 3)
  WHEN:  embedRun() runs again to resume
  THEN:  the remaining 2 passages are embedded, the total NULL count is 0, the row count is still 3, and ordinal 0's embedding is unchanged
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: partially-embedded · evidence: db_query
    NEGATIVE_CONTROL: would fail if the resume re-embeds ordinal 0 (not idempotent on the already-done row), the resume INSERTs new rows instead of UPDATEing ordinals 1 and 2, the resume skips ordinals 1 and 2 and reports success
    CASE[0] start_ref=partially-embedded · actor=background_job
      ACTION: await embedRun() resume after interruption
      MUST_OBSERVE: `SELECT COUNT(*) FROM passages WHERE embedding IS NULL === 0` | `row count still 3` | `passage ordinal 0 embedding unchanged (identical vector)`
      MUST_NOT_OBSERVE: duplicate of ordinal 0 | `row count 5` | null embedding on ordinal 1 or 2

AC-4 mid-batch fleet error commits completed passages and surfaces a typed EmbedRunError (flow_ref T-DATA-012)
  GIVEN: 3 NULL passages and the fleet embed endpoint returns a 500 error after embedding passage 0
  WHEN:  embedRun() runs
  THEN:  passage 0's embedding is committed (per-passage commit), a typed EmbedRunError is thrown identifying passage 1, and passage 2 remains NULL for resume
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-passages-null-embed · evidence: db_query
    NEGATIVE_CONTROL: would fail if embedRun rolls back passage 0's commit on the passage-1 failure (all-or-nothing loses work), embedRun swallows the fleet error and returns silently, embedRun marks passage 2 as embedded despite the failure
    CASE[0] start_ref=seeded-passages-null-embed · actor=background_job
      ACTION: await embedRun() with fleet returning 500 after passage 0
      MUST_OBSERVE: `passage 0 embedding committed (NOT NULL)` | `throws EmbedRunError` | `passage 2 embedding still NULL`
      MUST_NOT_OBSERVE: all-or-nothing rollback of passage 0 | silent return | passage 2 falsely marked embedded

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [after embedRun() the count of passages with NULL embedding equals 0] (maps_to_ac AC-1)
- TC-2 [every embedded passage carries a vector whose vector_dims equals 1024] (maps_to_ac AC-1)
- TC-3 [a second embedRun() invocation leaves the passage row count unchanged] (maps_to_ac AC-2)
- TC-4 [after a resume run the count of duplicate (documentId, ordinal) pairs equals 0] (maps_to_ac AC-3)
- TC-5 [a mid-batch fleet error throws EmbedRunError] (maps_to_ac AC-4)
- TC-6 [after a mid-batch error the passage embedded before the failure carries a non-null embedding] (maps_to_ac AC-4)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/inference/embed-run.ts (NEW)
- services/platform/src/cli/holo.ts (MODIFY — add embed:run + embed:verify cases)
- services/platform/tests/integration/embed-run.test.ts (NEW)
writeProhibited: services/platform/src/inference/embed.ts — search-1 owns the helper; embedRun consumes it, services/platform/src/db/schema/** — schema is frozen; consume the passages table, do not alter it, services/platform/src/tools/schemas/search.ts — search-3 owns the search schemas

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/cli/holo.ts 375-410, 1094-1120
   - focus: main() switch dispatch pattern + evidence:seed case as the template for the embed:run command (dynamic import + JSON/text output + exit code)
2. services/platform/src/db/schema/evidence.ts 56-80
   - focus: passages table: embedding vector(1024), sourceId, documentId, ordinal — the columns embedRun selects and updates
3. services/platform/src/db/columns.ts 18-36
   - focus: vector customType toDriver/fromDriver format [1,2,3,...] — the UPDATE must pass number[] in this shape
4. services/platform/src/db/connection.ts 1-36
   - focus: resolveDatabaseUrl({ preferHolocron: true }) — the real Postgres connection the job uses
5. services/platform/src/inference/embed.ts 1-60
   - focus: search-1's embed(text,'document') helper — embedRun MUST call this, never bypass it

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED evidence: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts` → test fails against absent embedRun() before implementation (ReferenceError)
- All tests pass: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts` → exit 0
- Type check: `pnpm tsgo --noEmit` → exit 0
- Lint: `pnpm biome check .` → exit 0
- Scope compliance: `git diff --name-only` → only embed-run.ts, holo.ts, embed-run.test.ts modified

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: SELECT id, text FROM passages WHERE embedding IS NULL ORDER BY ordinal FOR UPDATE SKIP LOCKED LIMIT batch; for each row: embed(text,'document') → verify length === 1024 → UPDATE passages SET embedding = $vector WHERE id; commit per row; on fleet error throw EmbedRunError naming the passage
- pattern_source: Postgres SKIP LOCKED idempotent-resumable batch idiom + holo.ts CLI dispatch
- anti_pattern: A single transaction wrapping the whole batch (all-or-nothing rollback loses completed embeddings on a late failure) — per-passage commit is required for resumability
- agent_rationale: This is a DB-batch job composing search-1's embed() helper with Drizzle UPDATE against real Postgres+pgvector, plus a CLI command in holo.ts. mastra-implementer owns the inference layer and the existing CLI command structure (holo.ts switch dispatch), so it owns the re-embed pipeline and the embed:run operator command.
- embedRun() MUST select only passages WHERE embedding IS NULL (idempotent — re-run touches nothing once complete)
- The SELECT MUST use FOR UPDATE SKIP LOCKED (concurrent-safe, resumable, no duplicate processing)
- embedRun() MUST use document-mode embeddings (prefixPolicy.document) — never query-mode for stored passages
- Per-passage commits: a mid-batch failure commits already-embedded passages and surfaces a typed EmbedRunError, never an all-or-nothing rollback that loses work
- holo embed:run is an operator command following the existing holo.ts dispatch convention

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: search-1, search-4 · Blocks: search-3

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "search-2",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-passages-null-embed": {
      "description": "real Postgres passages table with 3 passages (ordinals 0,1,2) all carrying embedding = NULL, belonging to sourceId src_test_001",
      "seed_method": "public_api",
      "records": [
        "3 rows in passages with embedding IS NULL",
        "sourceId src_test_001",
        "documentId doc_test_001"
      ]
    },
    "fully-embedded-passages": {
      "description": "passages table where every passage already carries a 1024-dim embedding (the post-AC-1 state), row count 3",
      "seed_method": "public_api",
      "records": [
        "3 passages all with embedding NOT NULL",
        "vector_dims(embedding) === 1024 on all rows",
        "row count: 3"
      ]
    },
    "partially-embedded": {
      "description": "3 passages where ordinal 0 carries a 1024-dim embedding and ordinals 1,2 carry embedding = NULL (simulating interruption after 1 of 3)",
      "seed_method": "public_api",
      "records": [
        "passage ordinal 0: embedding NOT NULL (1024-dim)",
        "passage ordinals 1,2: embedding IS NULL",
        "row count: 3"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN real Postgres with 3 passages carrying embedding = NULL, WHEN embedRun() runs once, THEN every passage carries a non-null 1024-dim vector and the NULL count is 0",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "embedRun() is a no-op leaving all embeddings NULL",
            "embedRun() stores a hardcoded zero vector instead of a real fleet embedding",
            "embedRun() is stubbed to UPDATE a single passage and skip the rest",
            "the passages table is disconnected from the real Postgres instance"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-passages-null-embed",
            "action": {
              "actor": "background_job",
              "steps": [
                "await embedRun()"
              ]
            },
            "end_state": {
              "must_observe": [
                "`SELECT COUNT(*) FROM passages WHERE embedding IS NULL === 0`",
                "`SELECT COUNT(*) FROM passages WHERE vector_dims(embedding) === 1024 === 3`",
                "`embedding IS NOT NULL on all 3 passages`"
              ],
              "must_not_observe": [
                "`embedding IS NULL count: 3`",
                "null embedding",
                "wrong-dimension vector",
                "empty results (0)"
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
      "description": "GIVEN the passages table is fully embedded (row count 3), WHEN embedRun() runs a second time, THEN the row count is unchanged, no duplicate (documentId, ordinal) pairs exist, and zero rows were re-processed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "the second run re-embeds all passages (WHERE clause missing embedding IS NULL filter)",
            "the second run INSERTs duplicate passage rows",
            "embedRun ignores the NULL filter and processes all rows",
            "stub or mock implementation returns empty/static results without real Postgres or fleet"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fully-embedded-passages",
            "action": {
              "actor": "background_job",
              "steps": [
                "await embedRun() (second invocation)"
              ]
            },
            "end_state": {
              "must_observe": [
                "`passages row count unchanged: 3`",
                "`SELECT COUNT(*) FROM passages WHERE embedding IS NULL === 0`",
                "`COUNT of duplicate (documentId, ordinal) pairs === 0`"
              ],
              "must_not_observe": [
                "`row count > 3`",
                "duplicate ordinals",
                "new passages inserted",
                "empty results (0)"
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
      "description": "GIVEN 3 passages where ordinal 0 is embedded and ordinals 1,2 are NULL, WHEN embedRun() resumes, THEN the remaining 2 are embedded, NULL count is 0, row count is 3, and ordinal 0 is unchanged",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "the resume re-embeds ordinal 0 (not idempotent on already-done row)",
            "the resume INSERTs new rows instead of UPDATEing ordinals 1 and 2",
            "the resume skips ordinals 1 and 2 and reports success",
            "stub or mock implementation returns empty/static results without real Postgres or fleet"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "partially-embedded",
            "action": {
              "actor": "background_job",
              "steps": [
                "await embedRun() resume after interruption"
              ]
            },
            "end_state": {
              "must_observe": [
                "`SELECT COUNT(*) FROM passages WHERE embedding IS NULL === 0`",
                "`row count still 3`",
                "`passage ordinal 0 embedding unchanged (identical vector)`"
              ],
              "must_not_observe": [
                "duplicate of ordinal 0",
                "`row count 5`",
                "null embedding on ordinal 1 or 2"
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
      "description": "GIVEN 3 NULL passages and the fleet returns 500 after passage 0, WHEN embedRun() runs, THEN passage 0's embedding is committed, a typed EmbedRunError is thrown, and passage 2 remains NULL for resume",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "holdout",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "embedRun rolls back passage 0's commit on the passage-1 failure (all-or-nothing loses work)",
            "embedRun swallows the fleet error and returns silently",
            "embedRun marks passage 2 as embedded despite the failure",
            "stub or mock implementation returns empty/static results without real Postgres or fleet"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-passages-null-embed",
            "action": {
              "actor": "background_job",
              "steps": [
                "await embedRun() with fleet returning 500 after passage 0"
              ]
            },
            "end_state": {
              "must_observe": [
                "`passage 0 embedding committed (NOT NULL)`",
                "`throws EmbedRunError`",
                "`passage 2 embedding still NULL`"
              ],
              "must_not_observe": [
                "all-or-nothing rollback of passage 0",
                "silent return",
                "passage 2 falsely marked embedded"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "after embedRun() the count of passages with NULL embedding equals 0",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "every embedded passage carries a vector whose vector_dims equals 1024",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "a second embedRun() invocation leaves the passage row count unchanged",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "after a resume run the count of duplicate (documentId, ordinal) pairs equals 0",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "a mid-batch fleet error throws EmbedRunError",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "after a mid-batch error the passage embedded before the failure carries a non-null embedding",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
</details>
