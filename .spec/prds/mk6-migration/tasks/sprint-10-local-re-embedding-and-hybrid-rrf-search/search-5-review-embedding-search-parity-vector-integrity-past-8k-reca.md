# search-5 — Review embedding + search parity (vector integrity, past-8K recall, RRF one-round-trip, zero-cloud surfaces)
> Status: ✅ Completed
> Cycle: 1
> Commit: cbc8eb1a7502f5127f1f5253f12bff4fe118d854
> Reviewer: mastra-reviewer
> Completed: 2026-07-17T17:44:33Z

## What this does

Adversarially confirm the local re-embedding + hybrid RRF search meets UC-DATA-04: (a) zero null/wrong-dim vectors across passages, (b) the past-8K golden span is retrieved in top-k, (c) recall on the golden set is >= the old Convex hybridSearch, (d) RRF is a single round-trip, and (e) the 5 inline-HNSW surfaces return results with zero Cohere/cloud calls.

Provides: A signed review verdict (APPROVED | NEEDS_FIXES) with file:line findings covering vector integrity, past-8K golden retrieval, recall-vs-Convex parity, single-round-trip RRF, and zero-cloud inline surfaces; .tmp/search-5/review-report.md capturing the observed evidence (db_query results, benchmark stdout, network-call assertion)

## Why

- MUST Re-run rrfHybridSearch and searchSurface against the seeded data; capture the real db_query + benchmark stdout
- MUST Confirm passages.embedding has zero NULLs and zero non-1024 vectors after the embed pass
- MUST Confirm the seeded past-8K document is returned in top-k by the golden span query
- MUST Confirm new RRF recall over the golden set is >= the Convex hybridSearch baseline recall
- NEVER APPROVE on the strength of unit tests alone — integration evidence against real Postgres+pgvector is required
- NEVER APPROVE if RRF issues two SQL round-trips or uses normalize-by-max instead of reciprocal-rank k=60
- NEVER APPROVE if any inline-surface query makes an outbound call to Cohere or a cloud embedding host
- NEVER APPROVE with an un-fakeable-scenario gap (validate_scenario must pass on the consumed PRIMARY AC-1 of search-3)
- STRICTLY Findings cite file:line; recall numbers quote the benchmark stdout line verbatim
- STRICTLY Verdict is APPROVED only when AC-1..AC-5 all pass with captured seeded evidence
- Grounded in: UC-DATA-03,UC-DATA-04; CAP-EMB-01

## How to verify

- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts` → passages nulls=0, wrong_dim=0 captured in review-report.md
- `pnpm tsx scripts/benchmark-search.ts` → stdout 'recall new=…' >= Convex baseline captured verbatim
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/inline-surfaces-search.test.ts` → 5 surfaces return seeded rows, zero api.cohere.ai calls captured
- `pnpm tsgo --noEmit` → exit 0
- `cat .tmp/search-5/review-report.md` → APPROVED with all 5 confirmations, or NEEDS_FIXES with file:line findings
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

## Scope

Writes: .tmp/search-5/review-report.md (NEW) — signed verdict + captured evidence · .tmp/search-5/red-output.txt (NEW) — observed integration/benchmark stdout excerpts

Prohibited: services/platform/src/** — the reviewer does not edit implementation; findings go to review-report.md and a NEEDS_FIXES verdict routes back to search-3/search-4, convex/** — legacy, read-only, services/platform/src/db/schema/** — read-only

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: search-5 — Review embedding + search parity (vector integrity, past-8K recall, RRF one-round-trip, zero-cloud surfaces)
================================================================================

TASK_TYPE:  REVIEW
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (90 min)
AGENT:      mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: true)
CAPABILITY: CAP-EMB-01
SPRINT:     [Sprint 10 — Local Re-embedding and Hybrid RRF Search](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Adversarially confirm the local re-embedding + hybrid RRF search meets UC-DATA-04: (a) zero null/wrong-dim vectors across passages, (b) the past-8K golden span is retrieved in top-k, (c) recall on the golden set is >= the old Convex hybridSearch, (d) RRF is a single round-trip, and (e) the 5 inline-HNSW surfaces return results with zero Cohere/cloud calls.

The reviewer returns APPROVED with captured evidence for all five confirmations, or NEEDS_FIXES with file:line findings on every failing confirmation.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Re-run rrfHybridSearch and searchSurface against the seeded data; capture the real db_query + benchmark stdout
- MUST Confirm passages.embedding has zero NULLs and zero non-1024 vectors after the embed pass
- MUST Confirm the seeded past-8K document is returned in top-k by the golden span query
- MUST Confirm new RRF recall over the golden set is >= the Convex hybridSearch baseline recall
- NEVER APPROVE on the strength of unit tests alone — integration evidence against real Postgres+pgvector is required
- NEVER APPROVE if RRF issues two SQL round-trips or uses normalize-by-max instead of reciprocal-rank k=60
- NEVER APPROVE if any inline-surface query makes an outbound call to Cohere or a cloud embedding host
- NEVER APPROVE with an un-fakeable-scenario gap (validate_scenario must pass on the consumed PRIMARY AC-1 of search-3)
- STRICTLY Findings cite file:line; recall numbers quote the benchmark stdout line verbatim
- STRICTLY Verdict is APPROVED only when AC-1..AC-5 all pass with captured seeded evidence

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Reviewer confirms zero null / wrong-dimension embedding vectors across passages
- [ ] AC-2: Reviewer confirms the past-8K golden span is retrieved in top-k (flow_ref T-DATA-013)
- [ ] AC-3: Reviewer confirms recall on the golden query set >= Convex hybridSearch baseline (PRIMARY parity gate) [PRIMARY] (flow_ref T-DATA-014)
- [ ] AC-4: Reviewer confirms RRF is a single round-trip (one CTE, reciprocal-rank k=60, no normalize-by-max) (flow_ref T-DATA-013)
- [ ] AC-5: Reviewer confirms inline-HNSW surfaces return results with zero Cohere/cloud calls (flow_ref T-DATA-015)
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 Reviewer confirms zero null / wrong-dimension embedding vectors across passages
  GIVEN: The seeded long document has been embedded via real `holo embed:run` (search-4) and passages rows exist.
  WHEN:  The reviewer runs the integrity query SELECT count(*) FILTER (WHERE embedding IS NULL) AS nulls, count(*) FILTER (WHERE vector_dims(embedding) <> 1024) AS wrong_dim FROM passages.
  THEN:  the query returns nulls = 0 and wrong_dim = 0.
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-pgvector · TDD_STATE: red→green
  SCENARIO — start_ref: seeded_long_doc_past_8k · evidence: db_query
    NEGATIVE_CONTROL: would fail if the embed pass left passages.embedding NULL on any row, the embed pass wrote a vector whose dimension is not 1024, the integrity query is run against a different/empty schema
    CASE[0] start_ref=seeded_long_doc_past_8k · actor=api_client
      ACTION: run integrity query: count FILTER embedding IS NULL, count FILTER vector_dims(embedding)<>1024 over passages
      MUST_OBSERVE: nulls equals 0 | wrong_dim equals 0 | total passages count >= 2
      MUST_NOT_OBSERVE: nulls greater than 0 | wrong_dim greater than 0

AC-2 Reviewer confirms the past-8K golden span is retrieved in top-k (flow_ref T-DATA-013)
  GIVEN: The seeded long document's relevant passage sits past character 8,000 and is embedded.
  WHEN:  The reviewer runs rrfHybridSearch with the golden span query and limit 10.
  THEN:  the seeded "Local Re-embedding & RRF Design" document appears in the top-k results.
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-pgvector · TDD_STATE: red→green
  SCENARIO — start_ref: seeded_long_doc_past_8k · evidence: stdout
    NEGATIVE_CONTROL: would fail if chunking did not split the past-8K span into its own passage, the past-8K passage embedding is NULL so neither leg reaches it, RRF ranks the past-8K passage below the cutoff
    CASE[0] start_ref=seeded_long_doc_past_8k · actor=api_client
      ACTION: rrfHybridSearch({ query: 'how to combine vector and keyword rankings in one database query', limit: 10 })
      MUST_OBSERVE: a result with title "Local Re-embedding & RRF Design" appears in the top-k | totalResults >= 1
      MUST_NOT_OBSERVE: the past-8K document absent from results | totalResults equals 0

AC-3 Reviewer confirms recall on the golden query set >= Convex hybridSearch baseline (PRIMARY parity gate) (PRIMARY) (flow_ref T-DATA-014)
  GIVEN: The golden query set and the Convex hybridSearch baseline recall are defined in scripts/benchmark-search.ts.
  WHEN:  The reviewer runs the new RRF search over the golden set and compares aggregate recall to the Convex baseline.
  THEN:  new recall is greater than or equal to the Convex baseline recall.
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-pgvector · TDD_STATE: red→green
  SCENARIO — start_ref: golden_query_set · evidence: stdout
    NEGATIVE_CONTROL: would fail if the new RRF search drops the FTS leg so keyword-only golden queries are missed, RRF uses normalize-by-max weighting that suppresses high-recall vector neighbours, the benchmark compares against a hand-picked threshold instead of the real Convex baseline
    CASE[0] start_ref=golden_query_set · actor=api_client
      ACTION: run scripts/benchmark-search.ts over the golden set; capture the 'recall new=… baseline=…' stdout line
      MUST_OBSERVE: stdout line 'recall new=0.8' or higher | stdout line shows new recall >= Convex baseline recall | golden set size matches the benchmark golden set count
      MUST_NOT_OBSERVE: new recall strictly less than Convex baseline recall | 'recall new=0.0' indicating the RRF path returned nothing

AC-4 Reviewer confirms RRF is a single round-trip (one CTE, reciprocal-rank k=60, no normalize-by-max) (flow_ref T-DATA-013)
  GIVEN: The rrfHybridSearch helper from search-3 is wired and callable.
  WHEN:  The reviewer inspects the helper source and traces the issued SQL.
  THEN:  the helper issues exactly one SQL statement fusing vec + fts via a CTE with COALESCE(1.0/(60+rank),0) per leg and no 0.7/0.3 normalize-by-max.
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-pgvector · TDD_STATE: red→green
  SCENARIO — start_ref: seeded_long_doc_past_8k · evidence: stdout
    NEGATIVE_CONTROL: would fail if the helper issues two separate SQL statements (vector then FTS), the fusion uses score/maxScore * weight (normalize-by-max) instead of reciprocal rank, the RRF constant is not 60
    CASE[0] start_ref=seeded_long_doc_past_8k · actor=api_client
      ACTION: grep rrf.ts for 'WITH vec' single CTE + '1.0/(60' reciprocal-rank term; assert no '/ max' normalize-by-max
      MUST_OBSERVE: exactly one sql`` template literal in rrfHybridSearch | the literal '1.0/(60' appears in the fusion expression | searchMethod equals "rrf" on the returned result
      MUST_NOT_OBSERVE: two sequential sql queries in rrfHybridSearch | a normalize-by-max '* VECTOR_WEIGHT' / '* 0.7' expression | the Convex '0.7' / '0.3' constants

AC-5 Reviewer confirms inline-HNSW surfaces return results with zero Cohere/cloud calls (flow_ref T-DATA-015)
  GIVEN: The 5 inline surfaces (research_findings, research_iterations, subscription_content, toolbelt_tools, improvement_requests) each have a seeded row with a populated embedding.
  WHEN:  The reviewer runs searchSurface over each of the 5 surfaces with a related query and observes outbound network calls.
  THEN:  each surface returns its seeded row with searchMethod "hnsw:<surface>" and no outbound call to api.cohere.ai or any cloud embedding host.
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres-pgvector · TDD_STATE: red→green
  SCENARIO — start_ref: seeded_surface_finding · evidence: stdout
    NEGATIVE_CONTROL: would fail if searchSurface delegates query embedding to Cohere / a cloud host, a surface query does a cross-table join instead of single-table HNSW KNN, any of the 5 surface embedding columns is NULL so KNN returns nothing
    CASE[0] start_ref=seeded_surface_finding · actor=api_client
      ACTION: run searchSurface over all 5 surfaces; assert zero outbound calls to api.cohere.ai
      MUST_OBSERVE: results returned for the research_findings surface containing "MLX prefill-tuned Qwen3 embedding server on Apple Silicon" | searchMethod equals "hnsw:research_findings" | 5 surfaces each returned >= 1 result
      MUST_NOT_OBSERVE: any outbound HTTP call to api.cohere.ai or a cloud embedding host | the string "not implemented" | a surface returning totalResults 0 for its seeded row

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [the passages integrity query returns nulls equal to 0 and wrong_dim equal to 0] (maps_to_ac AC-1)
- TC-2 [the golden span query returns the seeded "Local Re-embedding & RRF Design" document inside the top-k results] (maps_to_ac AC-2)
- TC-3 [scripts/benchmark-search.ts prints a recall figure for the new RRF search that is greater than or equal to the Convex hybridSearch baseline recall] (maps_to_ac AC-3)
- TC-4 [rrfHybridSearch contains exactly one sql template literal with the reciprocal-rank term '1.0/(60' and no normalize-by-max weighting] (maps_to_ac AC-4)
- TC-5 [searchSurface returns >= 1 result for each of the 5 inline surfaces with zero outbound calls to api.cohere.ai] (maps_to_ac AC-5)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .tmp/search-5/review-report.md (NEW) — signed verdict + captured evidence
- .tmp/search-5/red-output.txt (NEW) — observed integration/benchmark stdout excerpts
writeProhibited: services/platform/src/** — the reviewer does not edit implementation; findings go to review-report.md and a NEEDS_FIXES verdict routes back to search-3/search-4, convex/** — legacy, read-only, services/platform/src/db/schema/** — read-only

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Vector integrity evidence: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts` → passages nulls=0, wrong_dim=0 captured in review-report.md
- Recall parity evidence: `pnpm tsx scripts/benchmark-search.ts` → stdout 'recall new=…' >= Convex baseline captured verbatim
- Inline-surface zero-cloud evidence: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/inline-surfaces-search.test.ts` → 5 surfaces return seeded rows, zero api.cohere.ai calls captured
- Type check (no regressions introduced): `pnpm tsgo --noEmit` → exit 0
- Verdict artifact: `cat .tmp/search-5/review-report.md` → APPROVED with all 5 confirmations, or NEEDS_FIXES with file:line findings

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- agent_rationale: Adversarial parity + integrity review of the local re-embedding + RRF search stack. Consumes the outputs of search-1 (embed helper), search-2 (schema/seed), search-3 (RRF + surface helpers), search-4 (CLI/registry wiring). This is the mastra-reviewer's lane — it observes real search behavior against seeded data and blocks on any stub, null vector, sub-baseline recall, multi-round-trip RRF, or cloud leak.
- The review re-runs the REAL search paths against real Postgres+pgvector+fleet — it never reads only the unit tests or trusts a green CI badge
- Recall parity is measured against the documented Convex hybridSearch baseline in scripts/benchmark-search.ts — never against an ad-hoc threshold
- 'Zero cloud' is asserted by observing no outbound call to api.cohere.ai / any cloud embedding host during the surface query — never by trusting a config flag
- A single sub-baseline recall, a null/wrong-dim vector, a two-round-trip RRF, or any Cohere call is a blocking NEEDS_FIXES

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: search-1, search-2, search-3, search-4 · Blocks: none

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "search-5",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded_long_doc_past_8k": {
      "description": "Document 'Local Re-embedding & RRF Design' chunked+embedded via real holo embed:run; the relevant passage sits past character 8000 with a non-null 1024-dim embedding and populated search_vector.",
      "seed_method": "cli",
      "records": [
        "document title = \"Local Re-embedding & RRF Design\"",
        "target passage past character 8000",
        "embedding vector(1024) non-null",
        "search_vector generated"
      ]
    },
    "seeded_surface_finding": {
      "description": "research_findings row with claim_text 'MLX prefill-tuned Qwen3 embedding server on Apple Silicon', embedding populated to 1024 dims via the real fleet embed() helper.",
      "seed_method": "public_api",
      "records": [
        "claim_text = \"MLX prefill-tuned Qwen3 embedding server on Apple Silicon\"",
        "embedding vector(1024) non-null"
      ]
    },
    "golden_query_set": {
      "description": "The unchanged golden query set + Convex hybridSearch baseline recall defined in scripts/benchmark-search.ts \u2014 the parity oracle.",
      "seed_method": "public_api",
      "records": [
        "golden query set from scripts/benchmark-search.ts",
        "Convex hybridSearch baseline recall recorded"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the seeded long document embedded via holo embed:run WHEN the reviewer runs the passages integrity query THEN nulls = 0 and wrong_dim = 0.",
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
            "the embed pass left passages.embedding NULL",
            "the embed pass wrote a non-1024 vector",
            "the integrity query targets a different schema",
            "stub or mock implementation returns empty/static results without real Postgres or fleet"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_long_doc_past_8k",
            "action": {
              "actor": "api_client",
              "steps": [
                "integrity query count FILTER embedding IS NULL, count FILTER vector_dims<>1024 over passages"
              ]
            },
            "end_state": {
              "must_observe": [
                "nulls equals 0",
                "wrong_dim equals 0",
                "total passages count >= 2"
              ],
              "must_not_observe": [
                "nulls greater than 0",
                "wrong_dim greater than 0"
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
      "description": "GIVEN the seeded past-8K passage WHEN rrfHybridSearch runs the golden span query THEN the target document appears in top-k.",
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
            "chunking did not split the past-8K span",
            "the past-8K passage embedding is NULL",
            "RRF ranks the past-8K passage below the cutoff",
            "stub or mock implementation returns empty/static results without real Postgres or fleet"
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
                "a result titled \"Local Re-embedding & RRF Design\" in top-k",
                "totalResults >= 1"
              ],
              "must_not_observe": [
                "the past-8K document absent from results",
                "totalResults equals 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the golden query set + Convex hybridSearch baseline WHEN the reviewer runs the new RRF search over the golden set THEN new recall >= Convex baseline recall.",
      "verify": "pnpm tsx scripts/benchmark-search.ts",
      "maps_to_ac": null,
      "scenario": {
        "start_ref": "golden_query_set",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-pgvector",
        "unit_test_justified": null,
        "negative_control": {
          "would_fail_if": [
            "the new RRF search drops the FTS leg",
            "RRF uses normalize-by-max suppressing vector neighbours",
            "the benchmark compares against an ad-hoc threshold instead of the Convex baseline",
            "stub or mock implementation returns empty/static results without real Postgres or fleet"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "golden_query_set",
            "action": {
              "actor": "api_client",
              "steps": [
                "run scripts/benchmark-search.ts; capture 'recall new=\u2026 baseline=\u2026'"
              ]
            },
            "end_state": {
              "must_observe": [
                "stdout 'recall new=0.8' or higher",
                "`recall new>=baseline` new recall >= Convex baseline recall",
                "`golden_set_size >= 1` golden set size matches the benchmark count"
              ],
              "must_not_observe": [
                "new recall strictly less than Convex baseline",
                "'recall new=0.0'"
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
      "description": "GIVEN the wired rrfHybridSearch WHEN the reviewer inspects source + traces SQL THEN it issues one CTE with reciprocal-rank k=60 and no normalize-by-max.",
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
            "two separate SQL statements are issued",
            "fusion uses score/maxScore*weight",
            "the RRF constant is not 60",
            "stub or mock implementation returns empty/static results without real Postgres or fleet"
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
                "inspect rrf.ts: one sql`` CTE + '1.0/(60' term; assert no '/ max'"
              ]
            },
            "end_state": {
              "must_observe": [
                "`sql_template_count === 1` exactly one sql template literal in rrfHybridSearch",
                "literal '1.0/(60' present",
                "searchMethod equals \"rrf\""
              ],
              "must_not_observe": [
                "two sequential sql queries",
                "'* VECTOR_WEIGHT' / '* 0.7'",
                "the Convex '0.7'/'0.3' constants"
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
      "description": "GIVEN seeded rows on the 5 inline surfaces WHEN the reviewer runs searchSurface over each THEN each returns its seeded row with zero Cohere/cloud calls.",
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
            "searchSurface delegates to Cohere/cloud",
            "a surface query does a cross-table join",
            "any surface embedding is NULL",
            "stub or mock implementation returns empty/static results without real Postgres or fleet"
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
                "run searchSurface over all 5 surfaces; assert zero api.cohere.ai calls"
              ]
            },
            "end_state": {
              "must_observe": [
                "research_findings result contains \"MLX prefill-tuned Qwen3 embedding server on Apple Silicon\"",
                "searchMethod equals \"hnsw:research_findings\"",
                "5 surfaces each returned >= 1 result"
              ],
              "must_not_observe": [
                "any outbound call to api.cohere.ai or cloud host",
                "the string \"not implemented\"",
                "a surface returning totalResults 0 for its seeded row"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "passages integrity query returns nulls 0 and wrong_dim 0.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "the golden span query returns the seeded past-8K document inside top-k.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "benchmark-search.ts prints a new RRF recall >= the Convex hybridSearch baseline recall.",
      "verify": "pnpm tsx scripts/benchmark-search.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "rrfHybridSearch has exactly one sql CTE with '1.0/(60' and no normalize-by-max.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/rrf-search.test.ts",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "searchSurface returns >= 1 result per surface with zero api.cohere.ai calls.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/inline-surfaces-search.test.ts",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
</details>
