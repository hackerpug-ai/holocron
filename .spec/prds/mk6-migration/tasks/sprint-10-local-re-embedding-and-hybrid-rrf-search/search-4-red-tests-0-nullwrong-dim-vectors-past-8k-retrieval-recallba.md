# search-4 — RED tests: 0 null/wrong-dim vectors, past-8K retrieval, recall≥baseline, idempotent re-embed
> Status: ✅ Completed
> Commit: 6fb7fb390d31d9b5025142c14eb6fcfe82f32c33
> Reviewer: mastra-reviewer
> Completed: 2026-07-17T15:53:16Z

## What this does

Author the RED test suite for Sprint 10's local re-embedding + hybrid search capability, proving each test fails against the empty implementation with a specific signature — establishing the red_first gate that search-1, search-2, and search-3 implement against.

Provides: tests/integration/embed-helper.test.ts — RED tests proving embed() asymmetry + chunking fail against empty impl; tests/integration/embed-run.test.ts — RED tests proving idempotent/resumable re-embed fails against empty impl; tests/integration/search-recall.test.ts — RED tests proving past-8K retrieval + recall≥baseline fail against empty impl; captured RED evidence (.tmp/search-4/red-output.txt) that gates implementer dispatch

## Why

- MUST Author tests that fail against the absent embed()/chunkDocument()/embedRun() with a specific, captured signature
- MUST Seed the golden past-8K document via a real DB insert in beforeAll (never view-injection)
- MUST Gate every RED assertion on PLATFORM_IT=1 so it runs against the real fleet + real Postgres
- MUST Capture the RED output to .tmp/search-4/red-output.txt before any implementer starts
- NEVER Write production implementation code — this task is tests-only
- NEVER Write a test that passes on an empty/stub implementation (the anti-pattern these tests exist to catch)
- NEVER Mock the fleet endpoint or the Postgres connection — real services only
- NEVER Bundle the RED tests into a single mega-test — one focused test per criterion
- STRICTLY Use the PLATFORM_IT=1 pnpm vitest run <path> runner (matches Sprint 9 struct tests)
- STRICTLY Each RED test's must_observe includes the concrete failure signature (the ReferenceError name or the assertion's 0-results count)
- Grounded in: UC-DATA-03; CAP-EMB-01

## How to verify

- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts services/platform/tests/integration/embed-run.test.ts services/platform/tests/integration/search-recall.test.ts` → all targeted tests FAIL with the captured signatures (ReferenceError / 0-results); output saved to .tmp/search-4/red-output.txt
- `test -s .tmp/search-4/red-output.txt` → exit 0 (non-empty RED evidence)
- `pnpm tsgo --noEmit` → exit 0 (test files must be syntactically/type valid even though they fail at runtime)
- `pnpm biome check .` → exit 0
- `git diff --name-only` → only the three test files + .tmp/search-4/red-output.txt
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/tests/integration/embed-helper.test.ts (NEW) · services/platform/tests/integration/embed-run.test.ts (NEW) · services/platform/tests/integration/search-recall.test.ts (NEW) · .tmp/search-4/red-output.txt (NEW — RED evidence capture)

Prohibited: services/platform/src/** — tests-only task; no production source, services/platform/src/inference/embed.ts — search-1 implements this, services/platform/src/inference/chunk.ts — search-1 implements this, services/platform/src/inference/embed-run.ts — search-2 implements this

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: search-4 — RED tests: 0 null/wrong-dim vectors, past-8K retrieval, recall≥baseline, idempotent re-embed
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (180 min)
AGENT:      red-test-generator
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
Author the RED test suite for Sprint 10's local re-embedding + hybrid search capability, proving each test fails against the empty implementation with a specific signature — establishing the red_first gate that search-1, search-2, and search-3 implement against.

All four RED test files exist, run under PLATFORM_IT=1, and each fails with a captured specific signature (ReferenceError for missing functions, or an assertion showing zero vectors / zero results) — never a syntax error or a false pass.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Author tests that fail against the absent embed()/chunkDocument()/embedRun() with a specific, captured signature
- MUST Seed the golden past-8K document via a real DB insert in beforeAll (never view-injection)
- MUST Gate every RED assertion on PLATFORM_IT=1 so it runs against the real fleet + real Postgres
- MUST Capture the RED output to .tmp/search-4/red-output.txt before any implementer starts
- NEVER Write production implementation code — this task is tests-only
- NEVER Write a test that passes on an empty/stub implementation (the anti-pattern these tests exist to catch)
- NEVER Mock the fleet endpoint or the Postgres connection — real services only
- NEVER Bundle the RED tests into a single mega-test — one focused test per criterion
- STRICTLY Use the PLATFORM_IT=1 pnpm vitest run <path> runner (matches Sprint 9 struct tests)
- STRICTLY Each RED test's must_observe includes the concrete failure signature (the ReferenceError name or the assertion's 0-results count)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: RED test '0 null/wrong-dim vectors' fails against empty embed()/chunkDocument() impl [PRIMARY] (flow_ref T-DATA-009)
- [ ] AC-2: RED test 'past-8K retrieval' fails against empty chunkDocument/hybridSearch impl (flow_ref T-DATA-010)
- [ ] AC-3: RED test 'recall ≥ baseline' fails against empty hybridSearch impl (flow_ref T-DATA-010)
- [ ] AC-4: RED test 'idempotent re-embed' fails against empty embedRun() impl (flow_ref T-DATA-012)
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 RED test '0 null/wrong-dim vectors' fails against empty embed()/chunkDocument() impl (PRIMARY) (flow_ref T-DATA-009)
  GIVEN: the repo state where src/inference/embed.ts and src/inference/chunk.ts do not exist
  WHEN:  PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts is executed
  THEN:  the test fails with a captured RED signature showing embed is not defined and zero vectors checked
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: empty-impl · evidence: stdout
    NEGATIVE_CONTROL: would fail if the test file has a syntax error so zero tests are collected (not a real RED), the test imports a non-existent helper and crashes at module load without running the assertion, the test uses a mock that always passes (defeats the RED purpose)
    CASE[0] start_ref=empty-impl · actor=cli_user
      ACTION: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts
      MUST_OBSERVE: `test 'embed produces 1024-dim vector' status: failed` | `ReferenceError: embed is not defined` | `failed: 1`
      MUST_NOT_OBSERVE: `passed: 1` | `status: PASS` | `0 tests collected`

AC-2 RED test 'past-8K retrieval' fails against empty chunkDocument/hybridSearch impl (flow_ref T-DATA-010)
  GIVEN: a golden document with relevant span past char 8000 seeded in real Postgres and chunkDocument/hybridSearch not yet implemented
  WHEN:  PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/search-recall.test.ts is executed
  THEN:  the past-8K retrieval test fails with a captured RED signature (chunkDocument not defined or zero results returned)
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: golden-past-8k-doc · evidence: stdout
    NEGATIVE_CONTROL: would fail if the test does not seed the past-8K document and asserts on an empty table (trivially passes), the test imports a mock search function that returns the marker passage (false green), the test never asserts on the marker span at offset 8400
    CASE[0] start_ref=golden-past-8k-doc · actor=cli_user
      ACTION: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/search-recall.test.ts
      MUST_OBSERVE: `test 'past-8K span ranks top-k' status: failed` | `ReferenceError: chunkDocument is not defined` | `failed: 1`
      MUST_NOT_OBSERVE: `status: PASS` | `passed: 1`

AC-3 RED test 'recall ≥ baseline' fails against empty hybridSearch impl (flow_ref T-DATA-010)
  GIVEN: hybridSearch (the new platform RRF search) is not yet implemented and the golden set is seeded
  WHEN:  PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/search-recall.test.ts is executed
  THEN:  the recall test fails showing zero results returned against the seeded golden set
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: golden-past-8k-doc · evidence: stdout
    NEGATIVE_CONTROL: would fail if the recall test asserts recall ≥ 0 (trivially satisfiable by returning nothing), the test mocks hybridSearch to return the golden passage (false green), the test does not bind to a T-DATA-010 golden set
    CASE[0] start_ref=golden-past-8k-doc · actor=cli_user
      ACTION: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/search-recall.test.ts
      MUST_OBSERVE: `test 'recall@10 >= baseline' status: failed` | `received 0 results` | `failed: 1`
      MUST_NOT_OBSERVE: `status: PASS` | `passed: 1`

AC-4 RED test 'idempotent re-embed' fails against empty embedRun() impl (flow_ref T-DATA-012)
  GIVEN: src/inference/embed-run.ts does not exist and real Postgres passages with NULL embeddings are seeded
  WHEN:  PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts is executed
  THEN:  the idempotent re-embed test fails with a captured RED signature (embedRun not defined)
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: empty-impl · evidence: stdout
    NEGATIVE_CONTROL: would fail if the test does not assert on the duplicate-count after re-run (trivially passes), the test mocks embedRun as a no-op returning undefined (false green), the test crashes at import without running the idempotency assertion
    CASE[0] start_ref=empty-impl · actor=cli_user
      ACTION: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts
      MUST_OBSERVE: `test 're-embed adds no duplicates' status: failed` | `ReferenceError: embedRun is not defined` | `failed: 1`
      MUST_NOT_OBSERVE: `status: PASS` | `passed: 1`

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [the embed-helper RED test run reports at least 1 failed test under PLATFORM_IT=1] (maps_to_ac AC-1)
- TC-2 [the search-recall RED test run reports the past-8K retrieval test as failed] (maps_to_ac AC-2)
- TC-3 [the search-recall RED test run reports the recall baseline test as failed] (maps_to_ac AC-3)
- TC-4 [the embed-run RED test run reports the idempotent re-embed test as failed] (maps_to_ac AC-4)
- TC-5 [the RED output is captured to .tmp/search-4/red-output.txt] (maps_to_ac AC-1)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/tests/integration/embed-helper.test.ts (NEW)
- services/platform/tests/integration/embed-run.test.ts (NEW)
- services/platform/tests/integration/search-recall.test.ts (NEW)
- .tmp/search-4/red-output.txt (NEW — RED evidence capture)
writeProhibited: services/platform/src/** — tests-only task; no production source, services/platform/src/inference/embed.ts — search-1 implements this, services/platform/src/inference/chunk.ts — search-1 implements this, services/platform/src/inference/embed-run.ts — search-2 implements this

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/inference/extract-structured.ts 1-15
   - focus: Sprint 9 PLATFORM_IT=1 integration-test runner pattern + the struct test reference (the canonical RED harness shape)
2. services/platform/tests/integration/db-migrate.test.ts 1-40
   - focus: existing integration test conventions in this repo: PLATFORM_IT guard, real Postgres connection, beforeAll seeding
3. convex/documents/search.ts 21-60
   - focus: the OLD Convex hybridSearch being replaced — the golden set + recall baseline must prove the new path beats the old 8K-truncated Cohere approach
4. services/platform/src/db/schema/evidence.ts 56-80
   - focus: passages table columns the RED tests seed against (sourceId, ordinal, embedding, situatingHeader)
5. services/platform/src/tools/schemas/search.ts 18-26
   - focus: hybridSearchInputSchema/OutputSchema the recall test exercises (search-3 domain)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED evidence captured: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts services/platform/tests/integration/embed-run.test.ts services/platform/tests/integration/search-recall.test.ts` → all targeted tests FAIL with the captured signatures (ReferenceError / 0-results); output saved to .tmp/search-4/red-output.txt
- RED file exists: `test -s .tmp/search-4/red-output.txt` → exit 0 (non-empty RED evidence)
- Type check: `pnpm tsgo --noEmit` → exit 0 (test files must be syntactically/type valid even though they fail at runtime)
- Lint: `pnpm biome check .` → exit 0
- Scope compliance: `git diff --name-only` → only the three test files + .tmp/search-4/red-output.txt

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: One focused RED test per T-DATA criterion; each seeds real data in beforeAll, asserts a concrete non-degenerate outcome, and fails with a captured signature (ReferenceError / 0-results) against the absent implementation
- pattern_source: brain/docs/RED-FIRST-TEST-GATE.md + Sprint 9 struct-test harness
- anti_pattern: A RED test that passes on an empty implementation (asserts recall ≥ 0, or mocks the search to return the golden passage) — this is exactly the fake-green the scenario-contract exists to prevent
- agent_rationale: This task's entire deliverable is the RED test suite — failing tests authored first against the empty implementation, capturing specific failure signatures (ReferenceError, zero-results assertion). The red-test-generator specializes in writing failing tests from specs; it does not implement. Its RED evidence IS the sprint's red_first gate for search-1/search-2/search-3.
- This task WRITES ONLY test files — it must not create or modify any production source under src/
- Every RED test MUST fail on a real product assertion (ReferenceError for missing fn, or an assertion showing 0 results), not a flow typo or syntax error
- RED tests MUST seed via real entrypoints (real Postgres, real fleet :4545, real CLI) — never mocks or view-injection
- The past-8K and recall tests reference search-3's hybrid search function and will go GREEN only after search-3 lands; search-4 only proves they are RED now

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: none · Blocks: search-1, search-2, search-3

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "search-4",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "empty-impl": {
      "description": "repo state where src/inference/embed.ts, chunk.ts, and embed-run.ts do not exist; real Postgres + fleet :4545 are reachable",
      "seed_method": "cli",
      "records": [
        "src/inference/embed.ts absent",
        "src/inference/chunk.ts absent",
        "src/inference/embed-run.ts absent",
        "Postgres passages table reachable",
        "fleet :4545 reachable"
      ]
    },
    "golden-past-8k-doc": {
      "description": "real Postgres source + document whose relevant span sits past character 8000, seeded via a test-fixture DB insert in beforeAll; marker string 'ZZZ_RELEVANT_SPAN_AT_8400_ZZZ' at char offset 8400",
      "seed_method": "public_api",
      "records": [
        "document text length 10048 chars",
        "marker 'ZZZ_RELEVANT_SPAN_AT_8400_ZZZ' at char offset 8400",
        "sourceId src_golden_001",
        "documentId doc_golden_001"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN src/inference/embed.ts and chunk.ts do not exist, WHEN PLATFORM_IT=1 vitest runs embed-helper.test.ts, THEN the 'embed produces 1024-dim vector' test fails with ReferenceError: embed is not defined",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "the test file has a syntax error so zero tests are collected (not a real RED)",
            "the test imports a non-existent helper and crashes at module load without running the assertion",
            "the test uses a mock that always passes (defeats the RED purpose)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty-impl",
            "action": {
              "actor": "cli_user",
              "steps": [
                "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts"
              ]
            },
            "end_state": {
              "must_observe": [
                "`test 'embed produces 1024-dim vector' status: failed`",
                "`ReferenceError: embed is not defined`",
                "`failed: 1`"
              ],
              "must_not_observe": [
                "`passed: 1`",
                "`status: PASS`",
                "`0 tests collected`"
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
      "description": "GIVEN a golden document with relevant span past char 8000 seeded in real Postgres and chunkDocument/hybridSearch absent, WHEN PLATFORM_IT=1 vitest runs search-recall.test.ts, THEN the past-8K retrieval test fails with ReferenceError: chunkDocument is not defined",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/search-recall.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "the test does not seed the past-8K document and asserts on an empty table (trivially passes)",
            "the test imports a mock search function that returns the marker passage (false green)",
            "the test never asserts on the marker span at offset 8400"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "golden-past-8k-doc",
            "action": {
              "actor": "cli_user",
              "steps": [
                "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/search-recall.test.ts"
              ]
            },
            "end_state": {
              "must_observe": [
                "`test 'past-8K span ranks top-k' status: failed`",
                "`ReferenceError: chunkDocument is not defined`",
                "`failed: 1`"
              ],
              "must_not_observe": [
                "`status: PASS`",
                "`passed: 1`",
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
      "description": "GIVEN hybridSearch is not yet implemented and the golden set is seeded, WHEN PLATFORM_IT=1 vitest runs search-recall.test.ts, THEN the recall@10 baseline test fails showing received 0 results",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/search-recall.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "holdout",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "the recall test asserts recall \u2265 0 (trivially satisfiable by returning nothing)",
            "the test mocks hybridSearch to return the golden passage (false green)",
            "the test does not bind to a T-DATA-010 golden set"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "golden-past-8k-doc",
            "action": {
              "actor": "cli_user",
              "steps": [
                "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/search-recall.test.ts"
              ]
            },
            "end_state": {
              "must_observe": [
                "`test 'recall@10 >= baseline' status: failed`",
                "`received 0 results`",
                "`failed: 1`"
              ],
              "must_not_observe": [
                "`status: PASS`",
                "`passed: 1`",
                "empty results (0)"
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
      "description": "GIVEN src/inference/embed-run.ts does not exist and real Postgres passages with NULL embeddings are seeded, WHEN PLATFORM_IT=1 vitest runs embed-run.test.ts, THEN the idempotent re-embed test fails with ReferenceError: embedRun is not defined",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "the test does not assert on the duplicate-count after re-run (trivially passes)",
            "the test mocks embedRun as a no-op returning undefined (false green)",
            "the test crashes at import without running the idempotency assertion"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty-impl",
            "action": {
              "actor": "cli_user",
              "steps": [
                "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts"
              ]
            },
            "end_state": {
              "must_observe": [
                "`test 're-embed adds no duplicates' status: failed`",
                "`ReferenceError: embedRun is not defined`",
                "`failed: 1`"
              ],
              "must_not_observe": [
                "`status: PASS`",
                "`passed: 1`",
                "empty results (0)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "the embed-helper RED test run reports at least 1 failed test under PLATFORM_IT=1",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "the search-recall RED test run reports the past-8K retrieval test as failed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/search-recall.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "the search-recall RED test run reports the recall baseline test as failed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/search-recall.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "the embed-run RED test run reports the idempotent re-embed test as failed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-run.test.ts",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "the RED output is captured to .tmp/search-4/red-output.txt",
      "verify": "test -s .tmp/search-4/red-output.txt",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->
</details>
