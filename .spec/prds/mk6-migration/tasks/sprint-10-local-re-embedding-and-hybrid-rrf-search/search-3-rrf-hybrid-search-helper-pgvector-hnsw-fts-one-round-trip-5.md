# search-3 — RRF hybrid search helper (pgvector HNSW + FTS, one round-trip) + 5 inline-HNSW surfaces

## What this does

Replace the deferred (throwing) hybrid_search path with a real RRF retrieval helper: embed the query via the fleet, run ONE Postgres CTE that fuses pgvector HNSW KNN over passages.embedding with FTS over passages.search_vector using reciprocal-rank fusion (k=60), and return ranked document-level results. Plus a single-table HNSW KNN helper that serves semantic search over the 5 inline embedding surfaces with no cloud dependency.

Provides: rrfHybridSearch(db, sql, { query, embed, limit }) helper — single-CTE pgvector HNSW KNN + FTS fused via reciprocal-rank (k=60); searchSurface(db, sql, surface, { query, embed, limit }) helper — single-table HNSW KNN over the 5 inline embedding columns; services/platform/src/search/{rrf.ts, surfaces.ts, index.ts}; Integration tests proving one-round-trip fusion + past-8K retrieval + zero-cloud inline surfaces

## Why

- MUST Fuse pgvector HNSW KNN + FTS ts_rank via RRF constant k=60 inside a single CTE round-trip
- MUST Embed the query through the shared embed() helper using prefixPolicy.query (QUERY mode) before the SQL leg
- MUST Shape every return to hybridSearchOutputSchema / SearchResultsOutputSchema (results[], totalResults, searchMethod)
- MUST Aggregate passage hits up to the document/source level for the display result
- NEVER Use the old Convex normalize-by-max (0.7 vector / 0.3 fts) weighted fusion — it is the documented anti-pattern
- NEVER Call Cohere (api.cohere.ai) or any cloud embedding endpoint for the query or any surface
- NEVER Mock, stub, or inject the query embedding or the Postgres connection in any test
- NEVER Issue the vector leg and the FTS leg as two separate SQL statements
- STRICTLY PRIMARY test tier is integration against real Postgres + real pgvector + the real fleet embed role (PLATFORM_IT=1)
- STRICTLY Embedding dimension is 1024 (Qwen3-Embedding); reject a query vector whose length is not 1024
- STRICTLY HNSW op-class is vector_cosine_ops (already declared in hnswEmbeddingIndex) — query with <=> cosine distance
- Grounded in: UC-DATA-04; CAP-EMB-01

## How to verify

- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts` → fails against the deferredExecute throw stub / unimplemented rrfHybridSearch before implementation; capture .tmp/search-3/red-output.txt
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts && PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/inline-surfaces-search.test.ts` → exit 0
- `pnpm tsgo --noEmit` → exit 0
- `pnpm biome check .` → exit 0
- `git diff --name-only` → only services/platform/src/search/{rrf,surfaces,index}.ts + services/platform/tests/integration/{rrf-search,inline-surfaces-search}.test.ts
- `validate_scenario` → AC-1 scenario exits 0; RED-against-start captured; seeded "Local Re-embedding & RRF Design" title observed in results[0]
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/search/rrf.ts (NEW) — rrfHybridSearch helper · services/platform/src/search/surfaces.ts (NEW) — searchSurface helper for the 5 inline HNSW surfaces · services/platform/src/search/index.ts (NEW) — barrel exports · services/platform/tests/integration/rrf-search.test.ts (NEW) — AC-1/2/4 integration tests · services/platform/tests/integration/inline-surfaces-search.test.ts (NEW) — AC-3 integration tests

Prohibited: convex/** — the Convex hybridSearch is the legacy being replaced; do not modify it, services/platform/src/db/schema/** — schema already declares embedding + HNSW + GIN; do not alter migration-shaped files, services/platform/src/tools/registry.ts — registry already pre-registers hybrid_search; CLI/registry execute wiring is search-4's scope

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: search-3 — RRF hybrid search helper (pgvector HNSW + FTS, one round-trip) + 5 inline-HNSW surfaces
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (240 min)
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
Replace the deferred (throwing) hybrid_search path with a real RRF retrieval helper: embed the query via the fleet, run ONE Postgres CTE that fuses pgvector HNSW KNN over passages.embedding with FTS over passages.search_vector using reciprocal-rank fusion (k=60), and return ranked document-level results. Plus a single-table HNSW KNN helper that serves semantic search over the 5 inline embedding surfaces with no cloud dependency.

A caller invoking rrfHybridSearch or searchSurface against real Postgres+pgvector gets ranked results in one round-trip; the seeded long document whose relevant span sits past character 8,000 is returned in top-k; the 5 inline surfaces return their seeded rows with zero Cohere/cloud calls.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Fuse pgvector HNSW KNN + FTS ts_rank via RRF constant k=60 inside a single CTE round-trip
- MUST Embed the query through the shared embed() helper using prefixPolicy.query (QUERY mode) before the SQL leg
- MUST Shape every return to hybridSearchOutputSchema / SearchResultsOutputSchema (results[], totalResults, searchMethod)
- MUST Aggregate passage hits up to the document/source level for the display result
- NEVER Use the old Convex normalize-by-max (0.7 vector / 0.3 fts) weighted fusion — it is the documented anti-pattern
- NEVER Call Cohere (api.cohere.ai) or any cloud embedding endpoint for the query or any surface
- NEVER Mock, stub, or inject the query embedding or the Postgres connection in any test
- NEVER Issue the vector leg and the FTS leg as two separate SQL statements
- STRICTLY PRIMARY test tier is integration against real Postgres + real pgvector + the real fleet embed role (PLATFORM_IT=1)
- STRICTLY Embedding dimension is 1024 (Qwen3-Embedding); reject a query vector whose length is not 1024
- STRICTLY HNSW op-class is vector_cosine_ops (already declared in hnswEmbeddingIndex) — query with <=> cosine distance

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Past-8K span retrieved in top-k via single-round-trip RRF (PRIMARY — sprint gate) [PRIMARY] (flow_ref T-DATA-013)
- [ ] AC-2: FTS-empty branch: query with no keyword match still returns the vector neighbour via RRF (flow_ref T-DATA-013)
- [ ] AC-3: Inline-HNSW surface KNN returns the seeded surface row with zero Cohere/cloud calls (flow_ref T-DATA-015)
- [ ] AC-4: No-match query against an empty target returns totalResults 0 without throwing (flow_ref T-DATA-013)
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 Past-8K span retrieved in top-k via single-round-trip RRF (PRIMARY — sprint gate) (PRIMARY) (flow_ref T-DATA-013)
  GIVEN: A document titled "Local Re-embedding & RRF Design" has been chunked+embedded via real `holo embed:run`; its body exceeds 8,000 characters and the passage containing the phrase "reciprocal rank fusion with k=60 constant in a single CTE round-trip" sits PAST character 8,000, with a non-null 1024-dim embedding and a populated search_vector on passages.
  WHEN:  rrfHybridSearch is called with query "how to combine vector and keyword rankings in one database query" and limit 10 — the query is embedded in QUERY mode via the real fleet and ONE CTE SQL statement is issued against real Postgres+pgvector.
  THEN:  the seeded target document is returned in the top-k results, searchMethod reports "rrf", and totalResults is at least 1.
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-pgvector · TDD_STATE: red→green
  SCENARIO — start_ref: seeded_long_doc_past_8k · evidence: stdout
    NEGATIVE_CONTROL: would fail if hybrid_search execute body is still the deferredExecute throw stub (schema-only, no implementation), RRF is replaced by the old Convex 0.7/0.3 normalize-by-max weighted fusion and the past-8K passage ranks below the cutoff, the FTS leg is dropped so only passages before char 8000 are reachable, the query embedding is mocked/stubbed instead of produced by the real fleet embed role, the vector and FTS legs are issued as two separate SQL round-trips
    CASE[0] start_ref=seeded_long_doc_past_8k · actor=api_client
      ACTION: rrfHybridSearch({ query: 'how to combine vector and keyword rankings in one database query', limit: 10 }) — query embedded via real fleet (QUERY mode), single CTE issued against real Postgres+pgvector
      MUST_OBSERVE: results[0].title equals "Local Re-embedding & RRF Design" | totalResults >= 1 | searchMethod equals "rrf"
      MUST_NOT_OBSERVE: totalResults equals 0 | the string "not implemented" in any thrown error | results[0]._id restricted to a passage located before character 8000

AC-2 FTS-empty branch: query with no keyword match still returns the vector neighbour via RRF (flow_ref T-DATA-013)
  GIVEN: A passage exists whose text is semantically related to the query but shares no FTS tokens with it, so websearch_to_tsquery('english', $query) matches zero rows while the HNSW KNN leg still finds a cosine neighbour.
  WHEN:  rrfHybridSearch is called with that semantic-only query and limit 10.
  THEN:  the vector neighbour passage is returned with a non-zero RRF score and searchMethod "rrf", with no exception from the empty FTS leg.
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-pgvector · TDD_STATE: red→green
  SCENARIO — start_ref: seeded_semantic_only_passage · evidence: stdout
    NEGATIVE_CONTROL: would fail if the FTS leg throwing on an empty tsquery result aborts the whole query, RRF scoring skips any passage that appears in only one leg, the COALESCE around 1.0/(60+fts.rank) is missing so NULL FTS rows NULL-out the score
    CASE[0] start_ref=seeded_semantic_only_passage · actor=api_client
      ACTION: rrfHybridSearch({ query: '<semantic paraphrase sharing no tokens with the seeded passage>', limit: 10 })
      MUST_OBSERVE: results contains the seeded semantic-only passage _id | totalResults >= 1 | searchMethod equals "rrf"
      MUST_NOT_OBSERVE: totalResults equals 0 | an uncaught Error from the empty FTS leg | rrf_score of NULL or NaN on the returned row

AC-3 Inline-HNSW surface KNN returns the seeded surface row with zero Cohere/cloud calls (flow_ref T-DATA-015)
  GIVEN: A research_findings row with claim_text "MLX prefill-tuned Qwen3 embedding server on Apple Silicon" has its embedding column populated to 1024 dims by the real fleet embed() helper.
  WHEN:  searchSurface is called with surface "research_findings", a related query, and limit 5 — query embedded via the real fleet, single-table HNSW KNN issued against research_findings.embedding.
  THEN:  the seeded finding row is returned in top-k with searchMethod "hnsw:research_findings" and no outbound network call to any cloud embedding endpoint is made.
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-pgvector · TDD_STATE: red→green
  SCENARIO — start_ref: seeded_surface_finding · evidence: stdout
    NEGATIVE_CONTROL: would fail if the surface query delegates to Cohere or any cloud embedding endpoint instead of the local fleet, research_findings.embedding is NULL so the HNSW KNN returns nothing, searchSurface does a cross-table join instead of single-table KNN, the surface name is not in the allowed 5-surface set
    CASE[0] start_ref=seeded_surface_finding · actor=api_client
      ACTION: searchSurface('research_findings', { query: 'local embedding server optimized for Mac prefill', limit: 5 }) — query embedded by real fleet, single-table HNSW KNN, no cloud call
      MUST_OBSERVE: results[0].claim_text contains "MLX prefill-tuned Qwen3 embedding server on Apple Silicon" | totalResults >= 1 | searchMethod equals "hnsw:research_findings"
      MUST_NOT_OBSERVE: totalResults equals 0 | any outbound HTTP call to api.cohere.ai or a cloud embedding host | the string "not implemented" in any thrown error

AC-4 No-match query against an empty target returns totalResults 0 without throwing (flow_ref T-DATA-013)
  GIVEN: The passages table has zero rows (or the query matches no FTS token and the target surface is empty), so both RRF legs produce no rows.
  WHEN:  rrfHybridSearch is called with an opaque no-match query and limit 10.
  THEN:  it resolves to { results: [], totalResults: 0, searchMethod: "rrf" } without throwing.
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-pgvector · TDD_STATE: red→green
  SCENARIO — start_ref: empty_passages_table · evidence: stdout
    NEGATIVE_CONTROL: would fail if the helper throws on an empty result set instead of returning a zero-total envelope, an undefined/null dereference occurs when both CTE legs are empty, searchMethod is omitted so the caller cannot distinguish a clean empty result from a crash
    CASE[0] start_ref=empty_passages_table · actor=api_client
      ACTION: rrfHybridSearch({ query: 'zzqxqxy nonmatchtoken 9991', limit: 10 }) against an empty passages table
      MUST_OBSERVE: totalResults equals 0 | searchMethod equals "rrf" | results is an empty array
      MUST_NOT_OBSERVE: an uncaught Error or rejection | totalResults greater than 0 | a null/undefined return value

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [rrfHybridSearch({ query: 'how to combine vector and keyword rankings in one database query', limit: 10 }).results[0].title equals "Local Re-embedding & RRF Design" and searchMethod equals "rrf"] (maps_to_ac AC-1)
- TC-2 [rrfHybridSearch returns the seeded semantic-only passage _id with a non-null rrf_score when the FTS leg matches zero rows] (maps_to_ac AC-2)
- TC-3 [searchSurface('research_findings', { query, limit: 5 }).results[0] contains "MLX prefill-tuned Qwen3 embedding server on Apple Silicon" with searchMethod "hnsw:research_findings" and zero outbound calls to api.cohere.ai] (maps_to_ac AC-3)
- TC-4 [rrfHybridSearch against an empty passages table resolves to an object whose totalResults equals 0 without throwing] (maps_to_ac AC-4)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/search/rrf.ts (NEW) — rrfHybridSearch helper
- services/platform/src/search/surfaces.ts (NEW) — searchSurface helper for the 5 inline HNSW surfaces
- services/platform/src/search/index.ts (NEW) — barrel exports
- services/platform/tests/integration/rrf-search.test.ts (NEW) — AC-1/2/4 integration tests
- services/platform/tests/integration/inline-surfaces-search.test.ts (NEW) — AC-3 integration tests
writeProhibited: convex/** — the Convex hybridSearch is the legacy being replaced; do not modify it, services/platform/src/db/schema/** — schema already declares embedding + HNSW + GIN; do not alter migration-shaped files, services/platform/src/tools/registry.ts — registry already pre-registers hybrid_search; CLI/registry execute wiring is search-4's scope

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/db/schema/evidence.ts 56-80
   - focus: PRIMARY PATTERN — passages table: embedding vector(1024), searchVector weighted FTS (text A-weight + situating_header B-weight), HNSW index passages_embedding_hnsw (vector_cosine_ops), GIN index passages_search_vector_gin. These are the exact columns/indexes the RRF CTE queries.
2. convex/documents/search.ts 21-112
   - focus: ANTI-PATTERN to replace — old Convex hybridSearch: Cohere embedding, parallel vectorSearch + fullTextSearch, 0.7/0.3 normalize-by-max weighted fusion. RRF replaces the fragile normalize-by-max weighting.
3. services/platform/src/db/columns.ts 18-62, 108-116
   - focus: vector customType (1024 default, [a,b,c] driver format), hnswEmbeddingIndex (vector_cosine_ops), searchVectorGinIndex, weightedSearchVectorSql — the building blocks the helper composes.
4. services/platform/src/db/client.ts 1-34
   - focus: withDb(db, sql) and createSql — postgres.js raw SQL access for the single-CTE round-trip.
5. services/platform/src/tools/schemas/search.ts 18-27
   - focus: hybridSearchInputSchema { query, limit? } + hybridSearchOutputSchema { results[], totalResults, searchMethod? } — the contract the helper must satisfy (already registered at registry.ts:130).

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED evidence (AC-1): `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts` → fails against the deferredExecute throw stub / unimplemented rrfHybridSearch before implementation; capture .tmp/search-3/red-output.txt
- GREEN (all ACs): `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts && PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/inline-surfaces-search.test.ts` → exit 0
- Type check: `pnpm tsgo --noEmit` → exit 0
- Lint: `pnpm biome check .` → exit 0
- Scope compliance: `git diff --name-only` → only services/platform/src/search/{rrf,surfaces,index}.ts + services/platform/tests/integration/{rrf-search,inline-surfaces-search}.test.ts
- Scenario un-fakeable (PRIMARY): `validate_scenario` → AC-1 scenario exits 0; RED-against-start captured; seeded "Local Re-embedding & RRF Design" title observed in results[0]

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- agent_rationale: Pure backend/agentic retrieval logic in the platform service — Drizzle/postgres.js raw SQL against pgvector + the shared fleet embed() helper. This is the MK-VI platform implementer's lane; no UI, no Convex. The reviewer (search-5) is a separate mastra-reviewer dispatch.
- RRF fusion uses reciprocal-rank 1/(60+rank) summed across legs — never the Convex 0.7/0.3 normalize-by-max weighting
- hybrid search issues exactly ONE SQL statement (a single CTE joining vec + fts legs) — never two sequential round-trips
- Query embedding is produced by the real fleet embed role (prefixPolicy.query) — never Cohere or any cloud endpoint
- Inline-surface search is single-table HNSW KNN per named surface — never a cross-table join
- Output conforms to hybridSearchOutputSchema { results: SearchResultItem[], totalResults: int, searchMethod?: string }

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: search-1, search-4 · Blocks: none

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "search-3",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded_long_doc_past_8k": {
      "description": "Document 'Local Re-embedding & RRF Design' chunked+embedded via real `holo embed:run`; body > 8,000 chars; the passage holding 'reciprocal rank fusion with k=60 constant in a single CTE round-trip' sits PAST character 8000; that passage has a non-null 1024-dim embedding and a populated search_vector.",
      "seed_method": "cli",
      "records": [
        "document title = \"Local Re-embedding & RRF Design\"",
        "≥2 passage rows; target passage text located past character 8000",
        "target passage.embedding is vector(1024) non-null",
        "passages.search_vector generated from text (A-weight) + situating_header (B-weight)"
      ]
    },
    "seeded_semantic_only_passage": {
      "description": "A passage whose text is semantically related to the query but shares no FTS tokens, so websearch_to_tsquery matches zero rows while HNSW KNN still returns it; embedding populated via real fleet.",
      "seed_method": "public_api",
      "records": [
        "passage text uses synonyms/paraphrase with no token overlap to the query",
        "embedding is vector(1024) non-null"
      ]
    },
    "seeded_surface_finding": {
      "description": "research_findings row with claim_text 'MLX prefill-tuned Qwen3 embedding server on Apple Silicon', embedding populated to 1024 dims via the real fleet embed() helper.",
      "seed_method": "public_api",
      "records": [
        "research_findings.claim_text = \"MLX prefill-tuned Qwen3 embedding server on Apple Silicon\"",
        "research_findings.embedding is vector(1024) non-null"
      ]
    },
    "empty_passages_table": {
      "description": "passages table state with zero rows (or a query matching no FTS token against an empty target) so both RRF legs produce no rows.",
      "seed_method": "public_api",
      "records": [
        "passages row count = 0 for the queried scope"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the seeded long document (relevant span past char 8000, embedded via real holo embed:run) WHEN rrfHybridSearch runs a semantic query THEN the target document is returned in top-k via a single-CTE RRF round-trip with searchMethod \"rrf\".",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "start_ref": "seeded_long_doc_past_8k",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-pgvector",
        "unit_test_justified": null,
        "negative_control": {
          "would_fail_if": [
            "hybrid_search execute body is still the deferredExecute throw stub",
            "RRF is replaced by the Convex 0.7/0.3 normalize-by-max weighted fusion",
            "the FTS leg is dropped so the past-8K passage is unretrievable",
            "the query embedding is mocked instead of produced by the real fleet",
            "vector and FTS legs run as two separate SQL round-trips"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_long_doc_past_8k",
            "action": {
              "actor": "api_client",
              "steps": [
                "rrfHybridSearch({ query: 'how to combine vector and keyword rankings in one database query', limit: 10 })"
              ]
            },
            "end_state": {
              "must_observe": [
                "results[0].title equals \"Local Re-embedding & RRF Design\"",
                "totalResults >= 1",
                "searchMethod equals \"rrf\""
              ],
              "must_not_observe": [
                "totalResults equals 0",
                "the string \"not implemented\"",
                "results[0]._id restricted to a passage before character 8000"
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
      "description": "GIVEN a passage matching the query only by vector (no FTS token overlap) WHEN rrfHybridSearch runs THEN it returns the vector neighbour via RRF without throwing on the empty FTS leg.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "start_ref": "seeded_semantic_only_passage",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-pgvector",
        "unit_test_justified": null,
        "negative_control": {
          "would_fail_if": [
            "the FTS leg throwing on an empty tsquery aborts the query",
            "RRF skips passages in only one leg",
            "COALESCE around 1.0/(60+fts.rank) is missing"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_semantic_only_passage",
            "action": {
              "actor": "api_client",
              "steps": [
                "rrfHybridSearch({ query: '<semantic paraphrase sharing no tokens>', limit: 10 })"
              ]
            },
            "end_state": {
              "must_observe": [
                "results contains the seeded semantic-only passage _id",
                "totalResults >= 1",
                "searchMethod equals \"rrf\""
              ],
              "must_not_observe": [
                "totalResults equals 0",
                "an uncaught Error from the empty FTS leg",
                "rrf_score of NULL or NaN"
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
      "description": "GIVEN a research_findings row embedded via the real fleet WHEN searchSurface('research_findings', {query, limit:5}) runs THEN it returns the seeded row with searchMethod \"hnsw:research_findings\" and zero cloud calls.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/inline-surfaces-search.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "start_ref": "seeded_surface_finding",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-pgvector",
        "unit_test_justified": null,
        "negative_control": {
          "would_fail_if": [
            "the surface query calls Cohere/cloud instead of the local fleet",
            "research_findings.embedding is NULL",
            "searchSurface does a cross-table join",
            "the surface name is outside the allowed 5-surface set"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_surface_finding",
            "action": {
              "actor": "api_client",
              "steps": [
                "searchSurface('research_findings', { query: 'local embedding server optimized for Mac prefill', limit: 5 })"
              ]
            },
            "end_state": {
              "must_observe": [
                "results[0].claim_text contains \"MLX prefill-tuned Qwen3 embedding server on Apple Silicon\"",
                "totalResults >= 1",
                "searchMethod equals \"hnsw:research_findings\""
              ],
              "must_not_observe": [
                "totalResults equals 0",
                "any outbound HTTP call to api.cohere.ai or a cloud embedding host",
                "the string \"not implemented\""
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
      "description": "GIVEN an empty passages table WHEN rrfHybridSearch runs an opaque no-match query THEN it resolves to { results: [], totalResults: 0, searchMethod: \"rrf\" } without throwing.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "start_ref": "empty_passages_table",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-pgvector",
        "unit_test_justified": null,
        "negative_control": {
          "would_fail_if": [
            "the helper throws on an empty result set",
            "a null dereference occurs when both CTE legs are empty",
            "searchMethod is omitted so a clean empty result is indistinguishable from a crash"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_passages_table",
            "action": {
              "actor": "api_client",
              "steps": [
                "rrfHybridSearch({ query: 'zzqxqxy nonmatchtoken 9991', limit: 10 }) against an empty passages table"
              ]
            },
            "end_state": {
              "must_observe": [
                "totalResults equals 0",
                "searchMethod equals \"rrf\"",
                "results is an empty array"
              ],
              "must_not_observe": [
                "an uncaught Error or rejection",
                "totalResults greater than 0",
                "a null/undefined return value"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "rrfHybridSearch returns the seeded \"Local Re-embedding & RRF Design\" document as results[0] with searchMethod \"rrf\".",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "rrfHybridSearch returns the semantic-only passage with a non-null rrf_score when the FTS leg matches zero rows.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "searchSurface('research_findings') returns the seeded finding row with searchMethod \"hnsw:research_findings\" and zero api.cohere.ai calls.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/inline-surfaces-search.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "rrfHybridSearch against an empty passages table resolves with totalResults equal to 0 without throwing.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
</details>
