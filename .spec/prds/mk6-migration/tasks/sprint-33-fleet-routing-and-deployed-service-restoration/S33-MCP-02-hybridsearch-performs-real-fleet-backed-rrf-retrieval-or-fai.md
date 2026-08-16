# S33-MCP-02: hybrid_search performs real fleet-backed RRF retrieval or fails closed with a named ROLE_UNAVAILABLE error

> Status: Backlog
> Assignee: mcp-implementer
> Priority: P0
> Type: FEATURE
> Effort: M · 150 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: mcp-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: S33-MCP-01
> Blocks: S33-MCP-03

## Outcome

Make the MCP hybrid_search tool actually fleet-dependent and honest about it: real reciprocal-rank fusion over the passages corpus when the embed role resolves, and a named fail-closed error when it cannot — with search_fts remaining the fleet-independent keyword path.

**Success state:** A caller can distinguish 'the fleet answered' from 'the fleet is unreachable' from the tool result alone: searchMethod 'hybrid' with semantically-retrieved rows, or isError:true with code ROLE_UNAVAILABLE naming role 'embed' and the endpoint it tried. A query with zero lexical overlap still finds the seeded document through the vector leg, which no FTS-only or stubbed implementation can reproduce.

## Critical Constraints

**MUST**

- Route hybrid_search through rrfHybridSearch (src/search/rrf.ts) so the vector leg is real, and report searchMethod 'hybrid' — a value inside the manifest enum.
- Re-throw embed/role failures as `ROLE_UNAVAILABLE: fleet role 'embed' unreachable at <endpoint>: <cause>` so gateway.ts emits code ROLE_UNAVAILABLE with isError:true and the endpoint literal survives into the message.
- Keep search_fts on its own branch: documents-table FTS, no fleet dependency, unchanged output shape.
- Map RRF rows onto the declared SearchResultItem shape ({_id, title, content, score}) so structuredContent still validates against hybridSearchOutputSchema.

**NEVER**

- NEVER return `{ results: [], totalResults: 0 }` with isError absent when the embed role cannot resolve — that is the silent empty success this task eliminates.
- NEVER return FTS-only rows labeled searchMethod 'hybrid'.
- NEVER edit src/inference/**, src/search/** (consume them read-only), src/cutover/**, src/http/**, or fleet/manifest.json.
- NEVER change the TOOL_ID_ALIASES map in src/tools/registry.ts.
- NEVER add or rename files under services/platform/tests/fixtures/mcp-manifest/.
- NEVER start this task before S33-MCP-01 has landed — both append to 14-mcp-compatibility-manifest.yaml and would collide.

**STRICTLY**

- Manifest yaml edit is ADDITIVE ONLY: append a ROLE_UNAVAILABLE error entry to hybrid_search.errors. Do not alter its input/output schema, defaults, or transports.

## Acceptance Criteria

### AC-1 — hybrid_search retrieves a lexically-disjoint document through the real fleet vector leg

- **GIVEN** the passages corpus holds s33_mcp02_semantic_corpus with a real 1024-dim fleet embedding, and the embed role resolves against the live router
- **WHEN** an MCP client calls tools/call hybrid_search over Streamable HTTP with the probe query that shares no tokens with the passage text, and calls search_fts with the identical query
- **THEN** hybrid_search returns the seeded document title with searchMethod 'hybrid' and a score > 0 while search_fts returns totalResults === 0 for the same query — proving the hit came from the vector leg, not keywords
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545 pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts`
- **Tier:** integration · **Service:** real LiteLLM fleet router (embed role, qwen3-embedding) + real Postgres passages/pgvector + real Hono /mcp gateway · **Flow:** UC-SVC-04
- **Scenario:** topology `single-node` · evidence `api_response` · negative control: disconnect, stub, empty, static

### AC-2 — Unreachable fleet makes hybrid_search fail closed with a named role error

- **GIVEN** FLEET_URL points at a verified-closed TCP port so the embed role cannot resolve
- **WHEN** an MCP client calls tools/call hybrid_search over Streamable HTTP
- **THEN** the result is isError:true with code ROLE_UNAVAILABLE naming the literal role token 'embed' and the literal closed endpoint, and no results array is returned at all
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts`
- **Tier:** integration · **Service:** real Hono /mcp gateway with FLEET_URL on a real closed port + real Postgres · **Flow:** UC-SVC-04
- **Scenario:** topology `single-node` · evidence `api_response` · negative control: stub, empty, static, mock

### AC-3 — search_fts stays fleet-independent after the split

- **GIVEN** the same gateway child with FLEET_URL on the verified-closed port and s33_mcp02_lexical_row seeded
- **WHEN** an MCP client calls tools/call search_fts with the distinctive anchor token
- **THEN** the seeded row is returned with result.isError === false, proving keyword search was not coupled to the fleet by the hybrid_search change
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts`
- **Tier:** integration · **Service:** real Hono /mcp gateway with unreachable fleet + real Postgres · **Flow:** UC-SVC-04
- **Scenario:** topology `single-node` · evidence `api_response` · negative control: disconnect, stub, empty

### AC-4 — stdio transport reproduces both hybrid_search outcomes identically

- **GIVEN** a real `holo mcp:stdio` child process against the same Postgres corpus
- **WHEN** the probe query is issued once with the live fleet and once with the verified-closed FLEET_URL
- **THEN** the live run returns searchMethod 'hybrid' with the seeded title and the closed run returns isError:true with code ROLE_UNAVAILABLE, matching the HTTP results, with 0 unparseable stdout lines
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545 pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts`
- **Tier:** integration · **Service:** real `bun services/platform/src/cli/holo.ts mcp:stdio` child + real fleet + real Postgres · **Flow:** UC-SVC-04
- **Scenario:** topology `single-node` · evidence `stdout` · negative control: disconnect, stub, static

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | hybrid_search returns the seeded document for a query with zero lexical overlap while search_fts returns totalResults === 0 for the same query | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545 pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts` |
| TC-2 | hybrid_search reports searchMethod 'hybrid', a value inside the manifest enum and matching the frozen success fixture | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545 pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts` |
| TC-3 | With an unreachable fleet, hybrid_search returns isError:true with code ROLE_UNAVAILABLE naming role 'embed' and the endpoint, and no results array | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts` |
| TC-4 | search_fts still returns the lexical anchor row while the fleet is unreachable | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts` |
| TC-5 | stdio reproduces both hybrid_search outcomes with payloads matching the HTTP transport and 0 unparseable stdout lines | AC-4 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545 pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts` |
| TC-6 | Manifest verification and the manifest negative-control suite still pass after the additive hybrid_search error entry | AC-2 | `pnpm test:integration tests/integration/mcp-verify-manifest.test.ts tests/integration/mcp-manifest-negative-controls.test.ts` |

## Fixtures

**`s33_mcp02_semantic_corpus`** — One document plus one passage whose embedding is produced by the REAL fleet embed role (document mode, 1024-dim), inserted into the real passages table. The passage text and the probe query share no lexical tokens, so only the vector leg can connect them. _(seed: cli)_

- documents: title = 'S33-MCP-02 Fleet Retrieval Proof'
- sources: one row bound to that documentId
- passages: text = 'The escape hatch engages whenever the on-premises token generator stops answering during a scheduled service window.'
- passages.embedding = real fleet embed(text, 'document'), asserted length 1024 and not all-zero
- probe query (zero lexical overlap with the passage text) = 'what occurs if the local LLM box quits replying while being patched'

**`s33_mcp02_lexical_row`** — A documents row containing a distinctive literal token so search_fts has a real keyword hit that does not depend on the fleet. _(seed: public_api)_

- documents: title = 'S33-MCP-02 Lexical Anchor'
- documents: content = 'zylophonequux is the distinctive lexical anchor token for S33-MCP-02'

**`s33_mcp02_unreachable_fleet`** — A real closed TCP port used as FLEET_URL so the embed role genuinely fails to resolve. _(seed: cli)_

- FLEET_URL = http://127.0.0.1:<verified-closed-port>
- closed-ness asserted by binding and releasing the port, then confirming connect is refused with ECONNREFUSED

## Reading List

- `services/platform/src/mcp/executor.ts` (854-871) — The defect: search_fts and hybrid_search share one FTS branch and hybrid_search returns searchMethod 'postgres-fts'. Split them.
- `services/platform/src/search/rrf.ts` (17-140) — READ-ONLY. rrfHybridSearch signature, the 1024-dim guard, the all-zero-embedding refusal, and the single-CTE vector+FTS fusion over passages.
- `services/platform/src/inference/embed.ts` (85-128) — READ-ONLY. embed() throws RoleUnavailableError when the embed role cannot resolve — the failure this task must name.
- `services/platform/src/inference/resolve-model.ts` (95-109) — READ-ONLY. RoleUnavailableError carries code 'ROLE_UNAVAILABLE', role, endpoint and degradationAction; its message starts lowercase, so re-throw with the code prefix.
- `services/platform/src/tools/schemas/search.ts` (18-27) — hybridSearchOutputSchema — results items are {_id, title?, score?, content?}; map RRF rows onto this shape.
- `services/platform/tests/integration/redhat-fix-1-cap-emb-retrieve.test.ts` (105-200) — Established real-embedding seeding pattern: real embed(), insert sources + passages with a real vector, snapshot/restore passages for corpus isolation.
- `.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml` (180-215) — hybrid_search entry — the searchMethod enum and the errors list to extend additively.
- `services/platform/tests/fixtures/mcp-manifest/hybrid_search_success.json` (1-12) — READ-ONLY frozen fixture already declaring searchMethod 'hybrid' — corroborates that 'postgres-fts' is the drift.

## Guardrails

**WRITE-ALLOWED**

- services/platform/src/mcp/executor.ts (MODIFY — split the search_fts / hybrid_search branch only)
- services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts (NEW)
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml (MODIFY — append a ROLE_UNAVAILABLE entry to hybrid_search.errors only; rebase onto the S33-MCP-01 edit first)

**WRITE-PROHIBITED**

- services/platform/src/search/** - consume rrfHybridSearch read-only
- services/platform/src/inference/** - mastra-planner lane (S33-PLAT-*)
- services/platform/fleet/manifest.json - mastra-planner lane
- services/platform/src/cutover/**, services/platform/src/http/**, services/platform/src/deploy/** - other lanes
- services/platform/deploy/**, scripts/deploy* - devops-engineer lane (S33-OPS-*)
- services/platform/src/tools/registry.ts - alias map and registration order are frozen for this sprint
- services/platform/src/mcp/executor.ts case 'check_subscriptions' - MK6-MCP-001 owns it
- services/platform/tests/fixtures/mcp-manifest/** - frozen fixture set
- the get_document case in executor.ts - S33-MCP-01 owns it

## Design

**References**

- services/platform/src/search/rrf.ts:75-140 (the real hybrid implementation already in the codebase)
- services/platform/fleet/manifest.json roles.embed (degradationAction 'fail-closed', 1024-dim)
- services/platform/src/mcp/gateway.ts:37-52 (error → code mapping)

**Interaction notes**

- hybrid_search is aliased as `search_knowledge_base` and `search` for chat tool grants (registry.ts:56-60). After this change, a chat turn taken while the embed role is unresolvable receives an MCP tool error with code ROLE_UNAVAILABLE rather than an empty result set. That surfaces as a tool-level isError the agent can report — it does not abort the chat run — and callers wanting keyword-only retrieval should call search_fts.
- S33-OPS-05 provisions qwen3-embedding to both minis and adds it to the holocron router. Once that lands the deployed branch becomes HYBRID_OK; until then ROLE_UNAVAILABLE is the honest, observable outcome — not a silent empty result.
- rrfHybridSearch searches the passages corpus (document-aggregated) while search_fts searches the documents table. This is deliberate: the vector corpus lives in passages.
- Serialized behind S33-MCP-01: both tasks append to 14-mcp-compatibility-manifest.yaml and both edit executor.ts, so they must not run in parallel.
- Topology on AC-1/AC-4 is single-node deliberately. The test drives one node's gateway and reaches the fleet through a router endpoint that is loopback from the test host (http://127.0.0.1:4545); which host served the embedding is not observable in the MCP response, so no cross-device property is claimed here. The cross-device fleet assertion lives in S33-MCP-03/AC-3, which checks the deployed /health fleet endpoint is non-loopback.

**Pattern** — Delegate to the existing real implementation and re-throw its failure with a machine-readable code prefix: catch (err) { if (err instanceof RoleUnavailableError) throw new Error(`ROLE_UNAVAILABLE: ${err.message}`); throw err; }

_Source:_ `services/platform/src/mcp/executor.ts:26-27 (INVALID_ARGUMENT prefix convention) and src/search/rrf.ts:87-100`

**Anti-pattern** — Catching the embed failure and returning `{ results: [], totalResults: 0, searchMethod: 'hybrid' }`, or silently falling back to FTS rows under the 'hybrid' label — both are indistinguishable from 'the corpus had no match' and both are exactly what a stub would produce.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/mcp/executor.ts services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts` | Exit 0 |
| typecheck | `pnpm tsgo --noEmit` | Exit 0 |
| unit | `pnpm test:unit` | Exit 0 |
| integration | `pnpm test:integration` | Exit 0 |
| prd-consistency | `pnpm prd:consistency` | Exit 0 |

## Agent Assignment

**mcp-implementer** — Changes MCP executor tool semantics and dual-transport error surfacing; consumes the existing rrfHybridSearch and fleet embed helpers read-only rather than editing src/inference or src/search.

## Coding Standards

- No `any`; narrow unknown with the existing isRecord helpers.
- Named error codes are SCREAMING_SNAKE_CASE prefixes followed by ': '.
- Never log to stdout on any executor path — the stdio transport shares that stream.
- Tests use the real fleet embed and real pgvector; no vi.mock, no injected fake embed function, no it.skip that hides a missing fleet (fail closed with a clear message instead).

## Boundary Contracts

- Manifest hybrid_search.searchMethod is a closed enum: [hybrid, fts_only, vector_only] (14-mcp-compatibility-manifest.yaml:203-205). The current 'postgres-fts' value violates it and disagrees with the frozen fixture hybrid_search_success.json ('hybrid').
- fleet/manifest.json role 'embed' declares degradationAction 'fail-closed' with embeddingDimension 1024 — no silent substitution when the role cannot resolve.
- gateway.ts:37-52 derives the MCP error code from the thrown message prefix; RoleUnavailableError's own message starts lowercase and would collapse to INTERNAL_SERVER_ERROR unless re-thrown with a 'ROLE_UNAVAILABLE: ' prefix.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-MCP-02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s33_mcp02_semantic_corpus": {
      "description": "One document plus one passage whose embedding is produced by the REAL fleet embed role (document mode, 1024-dim), inserted into the real passages table. The passage text and the probe query share no lexical tokens, so only the vector leg can connect them.",
      "seed_method": "cli",
      "records": [
        "documents: title = 'S33-MCP-02 Fleet Retrieval Proof'",
        "sources: one row bound to that documentId",
        "passages: text = 'The escape hatch engages whenever the on-premises token generator stops answering during a scheduled service window.'",
        "passages.embedding = real fleet embed(text, 'document'), asserted length 1024 and not all-zero",
        "probe query (zero lexical overlap with the passage text) = 'what occurs if the local LLM box quits replying while being patched'"
      ]
    },
    "s33_mcp02_lexical_row": {
      "description": "A documents row containing a distinctive literal token so search_fts has a real keyword hit that does not depend on the fleet.",
      "seed_method": "public_api",
      "records": [
        "documents: title = 'S33-MCP-02 Lexical Anchor'",
        "documents: content = 'zylophonequux is the distinctive lexical anchor token for S33-MCP-02'"
      ]
    },
    "s33_mcp02_unreachable_fleet": {
      "description": "A real closed TCP port used as FLEET_URL so the embed role genuinely fails to resolve.",
      "seed_method": "cli",
      "records": [
        "FLEET_URL = http://127.0.0.1:<verified-closed-port>",
        "closed-ness asserted by binding and releasing the port, then confirming connect is refused with ECONNREFUSED"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a passage embedded by the real fleet WHEN hybrid_search is called over Streamable HTTP with a lexically-disjoint probe query THEN the seeded document is returned with searchMethod 'hybrid' and score > 0 while search_fts returns totalResults === 0 for the identical query",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545 pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts",
      "scenario": {
        "id": "S33-MCP-02/AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real fleet embed role + real Postgres pgvector + real /mcp gateway",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s33_mcp02_semantic_corpus",
            "action": {
              "actor": "MCP client over Streamable HTTP with bearer HOLO_KEY_MCP",
              "steps": [
                "snapshot and isolate the passages corpus for the run (temp-table snapshot + restore, per the redhat-fix-1 pattern)",
                "insert the document + source + passage and embed the passage text with the real fleet embed() in document mode",
                "assert the stored embedding has length 1024 and is not all-zero",
                "POST /mcp tools/call search_fts { query: <probe query>, limit: 20 }",
                "POST /mcp tools/call hybrid_search { query: <probe query>, limit: 20 }"
              ]
            },
            "end_state": {
              "must_observe": [
                "hybrid_search structuredContent.searchMethod === 'hybrid'",
                "hybrid_search structuredContent.results[0].title === 'S33-MCP-02 Fleet Retrieval Proof'",
                "hybrid_search structuredContent.totalResults >= 1",
                "hybrid_search structuredContent.results[0].score > 0",
                "search_fts structuredContent.totalResults === 0 for the identical probe query",
                "the stored passage embedding vector length === 1024"
              ],
              "must_not_observe": [
                "hybrid_search structuredContent.searchMethod === 'postgres-fts'",
                "hybrid_search structuredContent.searchMethod === 'fts_only'",
                "hybrid_search structuredContent.totalResults === 0",
                "an empty hybrid_search results array",
                "hybrid_search result.isError === true"
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
      "description": "GIVEN FLEET_URL on a verified-closed port WHEN hybrid_search is called THEN the result is isError:true with code ROLE_UNAVAILABLE naming role 'embed' and the literal endpoint, with no results array",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts",
      "scenario": {
        "id": "S33-MCP-02/AC-2",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real /mcp gateway + verified-closed fleet port + real Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s33_mcp02_unreachable_fleet",
            "action": {
              "actor": "MCP client over Streamable HTTP against a gateway child started with the unreachable FLEET_URL",
              "steps": [
                "bind and release an ephemeral port, then confirm connect is refused with ECONNREFUSED",
                "spawn the gateway child with FLEET_URL set to that closed port and the real DATABASE_URL",
                "POST /mcp tools/call hybrid_search { query: 'zylophonequux', limit: 20 }"
              ]
            },
            "end_state": {
              "must_observe": [
                "result.isError === true",
                "parsed error code === 'ROLE_UNAVAILABLE'",
                "error message contains the literal role token 'embed'",
                "error message contains the literal closed endpoint 'http://127.0.0.1:<closed-port>'"
              ],
              "must_not_observe": [
                "structuredContent present on the MCP result",
                "any results array in the payload",
                "structuredContent.totalResults === 0 with result.isError === false",
                "an empty results array returned as a success",
                "structuredContent.searchMethod === 'hybrid'"
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
      "description": "GIVEN an unreachable fleet WHEN search_fts is called with the seeded anchor token THEN it returns the seeded row with result.isError === false",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts",
      "scenario": {
        "id": "S33-MCP-02/AC-3",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real /mcp gateway with unreachable fleet + real Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s33_mcp02_lexical_row",
            "action": {
              "actor": "MCP client over Streamable HTTP against the unreachable-fleet gateway child",
              "steps": [
                "seed the lexical anchor row through tools/call store_document",
                "POST /mcp tools/call search_fts { query: 'zylophonequux', limit: 20 }"
              ]
            },
            "end_state": {
              "must_observe": [
                "structuredContent.totalResults >= 1",
                "results contain title 'S33-MCP-02 Lexical Anchor'",
                "results[0].content contains 'zylophonequux'",
                "result.isError === false"
              ],
              "must_not_observe": [
                "parsed error code === 'ROLE_UNAVAILABLE'",
                "structuredContent.totalResults === 0",
                "an empty search_fts results array"
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
      "description": "GIVEN a real stdio MCP child WHEN both fleet states are exercised THEN stdio matches the HTTP transport for the hybrid success and the ROLE_UNAVAILABLE failure with 0 unparseable stdout lines",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545 pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts",
      "scenario": {
        "id": "S33-MCP-02/AC-4",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real stdio MCP child + real fleet + real Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s33_mcp02_semantic_corpus",
            "action": {
              "actor": "JSON-RPC client writing to the stdio child's stdin",
              "steps": [
                "spawn the stdio child with the live FLEET_URL, send initialize then tools/call hybrid_search with the probe query",
                "respawn the stdio child with FLEET_URL on the verified-closed port and repeat the identical tools/call"
              ]
            },
            "end_state": {
              "must_observe": [
                "live run: structuredContent.searchMethod === 'hybrid' and results[0].title === 'S33-MCP-02 Fleet Retrieval Proof'",
                "closed run: result.isError === true with parsed error code === 'ROLE_UNAVAILABLE' naming the literal role token 'embed'",
                "count of stdout lines that fail JSON.parse === 0 across both runs",
                "every parsed stdout frame carries 'jsonrpc':'2.0'",
                "live-run stdio structuredContent deep-equals the AC-1 HTTP structuredContent"
              ],
              "must_not_observe": [
                "closed run returning an empty results array with result.isError === false",
                "live run returning structuredContent.searchMethod === 'postgres-fts'",
                "0 JSON-RPC frames parsed from the child's stdout",
                "any divergence from the corresponding HTTP payloads"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Lexically-disjoint probe query retrieves the seeded document only through the vector leg",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545 pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "searchMethod value conforms to the manifest enum and the frozen fixture",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545 pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Unreachable fleet yields ROLE_UNAVAILABLE with the named role and endpoint and no results array",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "search_fts remains fleet-independent",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "stdio/HTTP parity for both fleet states",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545 pnpm test:integration services/platform/tests/integration/sprint33-mcp-02-hybrid-search-fleet.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Manifest suites still pass after the additive error entry",
      "maps_to_ac": "AC-2",
      "verify": "pnpm test:integration tests/integration/mcp-verify-manifest.test.ts tests/integration/mcp-manifest-negative-controls.test.ts"
    }
  ]
}
-->
