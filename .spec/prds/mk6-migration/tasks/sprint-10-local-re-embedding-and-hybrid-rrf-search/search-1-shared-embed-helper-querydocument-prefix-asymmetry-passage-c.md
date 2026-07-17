# search-1 — Shared embed() helper (query/document prefix asymmetry) + passage chunking (~512 tok)
> Status: ✅ Completed
> Cycle: 1
> Commit: 3fab2c569d159853e432ab85a7dba043d04be499
> Reviewer: mastra-reviewer
> Completed: 2026-07-17T17:44:33Z

## What this does

Provide the single embed() helper that applies Qwen3 query/document prefix asymmetry through resolveModel('embed'), plus a passage chunker that splits documents into ~512-token self-locating passages — the foundation consumed by search-2 (re-embed job) and search-3 (RRF search).

Provides: embed(text, mode) — single Qwen3-Embedding helper applying prefixPolicy.query / prefixPolicy.document asymmetry, returning a 1024-dim number[]; createFleetEmbeddingModel(resolved) — embedding analog of createFleetChatModel; chunkDocument(text, opts) — ~512-token passage splitter with overlap + self-locating situatingHeader

## Why

- MUST Compose resolveModel('embed') for every embedding — the prefix policy and dimension come from the manifest EmbedPolicySchema, never hardcoded
- MUST Apply the Qwen3 prefix asymmetrically: query mode gets prefixPolicy.query, document mode gets prefixPolicy.document
- MUST Chunk so a relevant span past character 8000 lands in its own passage (defeats the old 8K truncation)
- MUST Return Float32-compatible number[] of length exactly 1024
- NEVER Bypass resolveModel / hardcode a fleet endpoint URL inside embed()
- NEVER Return a null or all-zero embedding silently — a fleet failure surfaces a typed error (RoleUnavailableError)
- NEVER Make query-mode and document-mode identical (that defeats prefix asymmetry)
- NEVER Write to the passages table from this task — chunkDocument returns plain objects; persistence is search-2
- STRICTLY createFleetEmbeddingModel mirrors createFleetChatModel (resolve-model.ts:221-236): createOpenAICompatible({ name, baseURL, apiKey }).embeddingModel(litellmModelId)
- STRICTLY Use the ai v7 embed() / embedMany() signatures: embed({ model, value }) → { embedding }, embedMany({ model, values }) → { embeddings }
- Grounded in: UC-DATA-03; CAP-EMB-01

## How to verify

- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts` → test fails against absent embed()/chunkDocument before implementation (ReferenceError)
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts` → exit 0
- `pnpm tsgo --noEmit` → exit 0
- `pnpm biome check .` → exit 0
- `git diff --name-only` → only embed.ts, chunk.ts, embed-helper.test.ts modified
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/inference/embed.ts (NEW) · services/platform/src/inference/chunk.ts (NEW) · services/platform/tests/integration/embed-helper.test.ts (NEW)

Prohibited: services/platform/src/inference/resolve-model.ts — consume resolveModel, never modify the router, services/platform/src/fleet/** — manifest schema is frozen; read prefixPolicy, do not change it, services/platform/src/db/schema/evidence.ts — passages schema is owned by schema tasks; chunkDocument returns plain objects, no schema edits, services/platform/src/cli/holo.ts — CLI command is search-2's scope

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: search-1 — Shared embed() helper (query/document prefix asymmetry) + passage chunking (~512 tok)
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
Provide the single embed() helper that applies Qwen3 query/document prefix asymmetry through resolveModel('embed'), plus a passage chunker that splits documents into ~512-token self-locating passages — the foundation consumed by search-2 (re-embed job) and search-3 (RRF search).

embed('text','query') and embed('text','document') each return a distinct 1024-dim vector from the live fleet endpoint, and chunkDocument splits a >8K document so the relevant span past char 8000 survives in its own passage.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Compose resolveModel('embed') for every embedding — the prefix policy and dimension come from the manifest EmbedPolicySchema, never hardcoded
- MUST Apply the Qwen3 prefix asymmetrically: query mode gets prefixPolicy.query, document mode gets prefixPolicy.document
- MUST Chunk so a relevant span past character 8000 lands in its own passage (defeats the old 8K truncation)
- MUST Return Float32-compatible number[] of length exactly 1024
- NEVER Bypass resolveModel / hardcode a fleet endpoint URL inside embed()
- NEVER Return a null or all-zero embedding silently — a fleet failure surfaces a typed error (RoleUnavailableError)
- NEVER Make query-mode and document-mode identical (that defeats prefix asymmetry)
- NEVER Write to the passages table from this task — chunkDocument returns plain objects; persistence is search-2
- STRICTLY createFleetEmbeddingModel mirrors createFleetChatModel (resolve-model.ts:221-236): createOpenAICompatible({ name, baseURL, apiKey }).embeddingModel(litellmModelId)
- STRICTLY Use the ai v7 embed() / embedMany() signatures: embed({ model, value }) → { embedding }, embedMany({ model, values }) → { embeddings }

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: embed() produces 1024-dim vector with query/document prefix asymmetry [PRIMARY] (flow_ref T-DATA-011)
- [ ] AC-2: chunkDocument splits a >8K doc into ≤512-token passages preserving the past-8K span (flow_ref T-DATA-009)
- [ ] AC-3: chunkDocument handles short and empty input at the boundary (flow_ref T-DATA-009)
- [ ] AC-4: embed() fails explicitly when the fleet embed endpoint is unreachable (flow_ref T-DATA-011)
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 embed() produces 1024-dim vector with query/document prefix asymmetry (PRIMARY) (flow_ref T-DATA-011)
  GIVEN: the fleet embed role is live at :4545 and resolveModel('embed') returns ResolvedModel with embeddingDimension=1024 and a non-empty prefixPolicy
  WHEN:  embed('machine learning transformer attention','query') and embed('machine learning transformer attention','document') are each called once against the real fleet endpoint
  THEN:  both return a number[] of length exactly 1024 and the query-mode vector differs from the document-mode vector
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: live-fleet-embed · evidence: stdout
    NEGATIVE_CONTROL: would fail if embed() returns a hardcoded all-zero vector of length 1024, prefix policy is bypassed so query and document modes are byte-identical, fleet embed endpoint is stubbed with a mock returning a constant vector, embed() bypasses resolveModel and hits a wrong baseURL
    CASE[0] start_ref=live-fleet-embed · actor=api_client
      ACTION: embed('machine learning transformer attention', 'query')
      MUST_OBSERVE: `result.length === 1024` | `Number.isFinite(result[0]) === true` | `result.every(v => v !== 0) === true`
      MUST_NOT_OBSERVE: `null` | `result.length === 0` | all-zero vector
    CASE[1] start_ref=live-fleet-embed · actor=api_client
      ACTION: embed('machine learning transformer attention', 'document')
      MUST_OBSERVE: `docResult.length === 1024` | `cosineDistance(queryResult, docResult) > 0.0001`
      MUST_NOT_OBSERVE: `deepEqual(queryResult, docResult) === true` | `null`

AC-2 chunkDocument splits a >8K doc into ≤512-token passages preserving the past-8K span (flow_ref T-DATA-009)
  GIVEN: a document of ~10048 chars with a unique marker string 'ZZZ_RELEVANT_SPAN_AT_8400_ZZZ' at char offset 8400
  WHEN:  chunkDocument(longDoc, { title: 'Embedding Guide', maxTokens: 512, overlap: 64 }) is called
  THEN:  it returns ≥2 passages, each ≤512 tokens, the marker span survives in a passage, and every passage carries a situatingHeader containing the title
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: long-doc-past-8k · evidence: stdout
    NEGATIVE_CONTROL: would fail if chunkDocument returns a single passage truncated at 8K (the old truncation bug), chunking hardcodes an empty array, situatingHeader is always an empty string, chunkDocument drops the marker span past offset 8000
    CASE[0] start_ref=long-doc-past-8k · actor=api_client
      ACTION: chunkDocument(longDoc, { title: 'Embedding Guide', maxTokens: 512, overlap: 64 })
      MUST_OBSERVE: `passages.length >= 2` | `passages.some(p => p.text.includes('ZZZ_RELEVANT_SPAN_AT_8400_ZZZ')) === true` | `passages.every(p => p.tokenCount <= 512) === true` | `passages[0].situatingHeader.includes('Embedding Guide') === true`
      MUST_NOT_OBSERVE: `passages.length === 1` | marker span dropped past 8K | empty situatingHeader

AC-3 chunkDocument handles short and empty input at the boundary (flow_ref T-DATA-009)
  GIVEN: chunkDocument is called with a short single-sentence text and with an empty string
  WHEN:  chunkDocument('short text', opts) and chunkDocument('', opts) are each called
  THEN:  the short text yields exactly one passage containing the full text, and the empty string yields zero passages
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: long-doc-past-8k · evidence: stdout
    NEGATIVE_CONTROL: would fail if chunkDocument throws on empty input instead of returning zero passages, chunkDocument splits a short text into multiple spurious passages, chunkDocument returns a passage whose text differs from the input
    CASE[0] start_ref=long-doc-past-8k · actor=api_client
      ACTION: chunkDocument('short text', { title: 'Tiny' })
      MUST_OBSERVE: `passages.length === 1` | `passages[0].text === 'short text'` | `passages[0].ordinal === 0`
      MUST_NOT_OBSERVE: `passages.length === 0` | `null`
    CASE[1] start_ref=long-doc-past-8k · actor=api_client
      ACTION: chunkDocument('', { title: 'Empty' })
      MUST_OBSERVE: `passages.length === 0`
      MUST_NOT_OBSERVE: passage with empty text | `null`

AC-4 embed() fails explicitly when the fleet embed endpoint is unreachable (flow_ref T-DATA-011)
  GIVEN: the fleet embed endpoint is overridden to a dead port so resolveModel('embed') fails its health probe
  WHEN:  embed('text','query') is called against the unreachable endpoint
  THEN:  it throws RoleUnavailableError with code ROLE_UNAVAILABLE — never returns null or a zero vector
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: dead-fleet-embed · evidence: stdout
    NEGATIVE_CONTROL: would fail if embed() swallows the connection error and returns null, embed() returns a zero vector on failure, embed() retries forever instead of failing closed
    CASE[0] start_ref=dead-fleet-embed · actor=api_client
      ACTION: embed('text', 'query') with endpointOverride to dead port
      MUST_OBSERVE: `throws RoleUnavailableError` | `error code === 'ROLE_UNAVAILABLE'`
      MUST_NOT_OBSERVE: `returns null` | `returns a zero vector` | silent success

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [embed('machine learning transformer attention','query') returns an array whose length equals 1024] (maps_to_ac AC-1)
- TC-2 [the cosine distance between the query-mode vector and the document-mode vector for the same input text is greater than 0.0001] (maps_to_ac AC-1)
- TC-3 [chunkDocument returns at least 2 passages for a 10048-char document] (maps_to_ac AC-2)
- TC-4 [every passage from chunkDocument carries a tokenCount less than or equal to 512] (maps_to_ac AC-2)
- TC-5 [chunkDocument('') returns an array of length 0] (maps_to_ac AC-3)
- TC-6 [embed throws RoleUnavailableError when the fleet endpoint is unreachable] (maps_to_ac AC-4)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/inference/embed.ts (NEW)
- services/platform/src/inference/chunk.ts (NEW)
- services/platform/tests/integration/embed-helper.test.ts (NEW)
writeProhibited: services/platform/src/inference/resolve-model.ts — consume resolveModel, never modify the router, services/platform/src/fleet/** — manifest schema is frozen; read prefixPolicy, do not change it, services/platform/src/db/schema/evidence.ts — passages schema is owned by schema tasks; chunkDocument returns plain objects, no schema edits, services/platform/src/cli/holo.ts — CLI command is search-2's scope

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/inference/resolve-model.ts 221-236, 250-390
   - focus: createFleetChatModel provider pattern (createOpenAICompatible → .chatModel) — the embedding analog uses .embeddingModel; ResolvedModel.embeddingDimension + prefixPolicy at 384-387
2. services/platform/src/inference/extract-structured.ts 88-154
   - focus: resolveModel(role) → build ai-sdk model → call → typed outcome composition pattern (Sprint 9 sibling)
3. services/platform/src/fleet/manifest.schema.ts 29-35, 78-83
   - focus: EmbedPolicySchema: embeddingDimension + prefixPolicy {query, document}; embed role REQUIRES these
4. services/platform/src/db/schema/evidence.ts 56-80
   - focus: passages table shape — embedding vector(1024), situatingHeader, tokenCount, ordinal — that chunkDocument must produce compatible objects for

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED evidence: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts` → test fails against absent embed()/chunkDocument before implementation (ReferenceError)
- All tests pass: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts` → exit 0
- Type check: `pnpm tsgo --noEmit` → exit 0
- Lint: `pnpm biome check .` → exit 0
- Scope compliance: `git diff --name-only` → only embed.ts, chunk.ts, embed-helper.test.ts modified

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: createFleetEmbeddingModel mirrors createFleetChatModel: createOpenAICompatible({ name, baseURL: resolved.baseURL, apiKey }).embeddingModel(resolved.litellmModelId); then ai v7 embed({ model, value: prefixedText }) → { embedding }
- pattern_source: services/platform/src/inference/resolve-model.ts:221-236
- anti_pattern: Calling the /embeddings HTTP endpoint directly with fetch, bypassing resolveModel and the ai-sdk provider — loses health probing, prefix policy, and retry semantics
- agent_rationale: Composes resolveModel('embed') with @ai-sdk/openai-compatible — the same provider-composition pattern Sprint 9 used for createFleetChatModel / extractStructured. mastra-implementer owns the inference layer and ai-sdk v7 call sites (embed/embedMany), so it owns the embedding analog.
- embed() MUST call resolveModel('embed') — never bypass the router or hardcode a baseURL
- embed() MUST apply prefixPolicy: query mode prepends prefixPolicy.query, document mode prepends prefixPolicy.document — the two modes MUST NOT be identical
- chunkDocument MUST split into passages that each carry a non-empty situatingHeader so a chunk is self-locating
- embed() MUST return number[] of length ResolvedModel.embeddingDimension (1024) — never null, never a zero vector
- These helpers are pure (no DB writes) — persistence is search-2's job

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: search-4 · Blocks: search-2, search-3

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "search-1",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "live-fleet-embed": {
      "description": "fleet embed role reachable at :4545; resolveModel('embed') returns baseURL on :4545, litellmModelId for Qwen3-Embedding, embeddingDimension 1024, non-empty prefixPolicy",
      "seed_method": "cli",
      "records": [
        "resolveModel('embed') succeeds with healthy:true",
        "endpoint http://127.0.0.1:4545/v1/embeddings live"
      ]
    },
    "long-doc-past-8k": {
      "description": "document text of 10048 characters with a unique marker string 'ZZZ_RELEVANT_SPAN_AT_8400_ZZZ' at character offset 8400",
      "seed_method": "cli",
      "records": [
        "text length 10048 chars",
        "marker at offset 8400",
        "title 'Embedding Guide'"
      ]
    },
    "dead-fleet-embed": {
      "description": "fleet embed endpoint overridden to a dead port (endpointOverride) so resolveModel('embed') health probe fails with RoleUnavailableError",
      "seed_method": "cli",
      "records": [
        "endpointOverride points at unreachable port",
        "resolveModel throws RoleUnavailableError code ROLE_UNAVAILABLE"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the fleet embed role is live at :4545 and resolveModel('embed') returns embeddingDimension=1024 with a non-empty prefixPolicy, WHEN embed() is called in both query and document modes for the same text, THEN both return a 1024-dim number[] and the query-mode vector differs from document-mode",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "embed() returns a hardcoded all-zero vector of length 1024",
            "prefix policy is bypassed so query and document modes are byte-identical",
            "fleet embed endpoint is stubbed with a mock returning a constant vector",
            "embed() bypasses resolveModel and hits a wrong baseURL"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live-fleet-embed",
            "action": {
              "actor": "api_client",
              "steps": [
                "embed('machine learning transformer attention', 'query')"
              ]
            },
            "end_state": {
              "must_observe": [
                "`result.length === 1024`",
                "`Number.isFinite(result[0]) === true`",
                "`result.every(v => v !== 0) === true`"
              ],
              "must_not_observe": [
                "`null`",
                "`result.length === 0`",
                "all-zero vector"
              ]
            }
          },
          {
            "start_ref": "live-fleet-embed",
            "action": {
              "actor": "api_client",
              "steps": [
                "embed('machine learning transformer attention', 'document')"
              ]
            },
            "end_state": {
              "must_observe": [
                "`docResult.length === 1024`",
                "`cosineDistance(queryResult, docResult) > 0.0001`"
              ],
              "must_not_observe": [
                "`deepEqual(queryResult, docResult) === true`",
                "`null`",
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
      "description": "GIVEN a document of ~10048 chars with a marker at offset 8400, WHEN chunkDocument splits it at maxTokens 512 overlap 64, THEN it returns \u22652 passages each \u2264512 tokens with the marker preserved and a situatingHeader containing the title",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "chunkDocument returns a single passage truncated at 8K (old truncation bug)",
            "chunking hardcodes an empty array",
            "situatingHeader is always an empty string",
            "chunkDocument drops the marker span past offset 8000"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "long-doc-past-8k",
            "action": {
              "actor": "api_client",
              "steps": [
                "chunkDocument(longDoc, { title: 'Embedding Guide', maxTokens: 512, overlap: 64 })"
              ]
            },
            "end_state": {
              "must_observe": [
                "`passages.length >= 2`",
                "`passages.some(p => p.text.includes('ZZZ_RELEVANT_SPAN_AT_8400_ZZZ')) === true`",
                "`passages.every(p => p.tokenCount <= 512) === true`",
                "`passages[0].situatingHeader.includes('Embedding Guide') === true`"
              ],
              "must_not_observe": [
                "`passages.length === 1`",
                "marker span dropped past 8K",
                "empty situatingHeader"
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
      "description": "GIVEN chunkDocument is called with a short text and an empty string, WHEN both are processed, THEN the short text yields exactly one passage with the full text and the empty string yields zero passages",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "chunkDocument throws on empty input instead of returning zero passages",
            "chunkDocument splits a short text into multiple spurious passages",
            "chunkDocument returns a passage whose text differs from the input"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "long-doc-past-8k",
            "action": {
              "actor": "api_client",
              "steps": [
                "chunkDocument('short text', { title: 'Tiny' })"
              ]
            },
            "end_state": {
              "must_observe": [
                "`passages.length === 1`",
                "`passages[0].text === 'short text'`",
                "`passages[0].ordinal === 0`"
              ],
              "must_not_observe": [
                "`passages.length === 0`",
                "`null`"
              ]
            }
          },
          {
            "start_ref": "long-doc-past-8k",
            "action": {
              "actor": "api_client",
              "steps": [
                "chunkDocument('', { title: 'Empty' })"
              ]
            },
            "end_state": {
              "must_observe": [
                "`passages.length === 0`"
              ],
              "must_not_observe": [
                "passage with empty text",
                "`null`"
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
      "description": "GIVEN the fleet embed endpoint is overridden to a dead port, WHEN embed('text','query') is called, THEN it throws RoleUnavailableError with code ROLE_UNAVAILABLE \u2014 never returns null or a zero vector",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "test_tier": "integration",
        "tier": "holdout",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "embed() swallows the connection error and returns null",
            "embed() returns a zero vector on failure",
            "embed() retries forever instead of failing closed",
            "stub or mock implementation returns empty/static results without real Postgres or fleet"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "dead-fleet-embed",
            "action": {
              "actor": "api_client",
              "steps": [
                "embed('text', 'query') with endpointOverride to dead port"
              ]
            },
            "end_state": {
              "must_observe": [
                "`throws RoleUnavailableError`",
                "`error code === 'ROLE_UNAVAILABLE'`"
              ],
              "must_not_observe": [
                "`returns null`",
                "`returns a zero vector`",
                "silent success",
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
      "description": "embed('machine learning transformer attention','query') returns an array whose length equals 1024",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "the cosine distance between the query-mode vector and the document-mode vector for the same input text is greater than 0.0001",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "chunkDocument returns at least 2 passages for a 10048-char document",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "every passage from chunkDocument carries a tokenCount less than or equal to 512",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "chunkDocument('') returns an array of length 0",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "embed throws RoleUnavailableError when the fleet endpoint is unreachable",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/embed-helper.test.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
</details>
