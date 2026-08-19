# S33-MCP-03: Prove the 44-tool MCP surface on the deployed service over both transports after the data-plane flip

> Status: Backlog
> Assignee: mcp-implementer
> Priority: P0
> Type: FEATURE
> Effort: M · 120 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: mcp-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: S33-MCP-01, S33-MCP-02, S33-PLAT-04, S33-OPS-01, MK6-DATA-001, MK6-MCP-001, CUTOVER-MCP-001
> Blocks: —

## Outcome

Produce the sprint's MCP-side gate evidence: against the live deployed service, the full 44-tool surface enumerates over both transports, every frozen tool receives a real production call under the guarded cutover namespace, get_document returns real Postgres content instead of the retired-plane failure, and the fleet-dependent search tool succeeds through the real non-loopback fleet.

**Success state:** A reviewer holding `.tmp/S33-MCP-03/` and the bound `CUTOVER-MCP-001` ledger can see 44 tools listed over Streamable HTTP and in-container stdio, 44 real manifest-ordered production calls, independent read/write oracles, exact-sha service identity, successful namespaced cleanup with zero residual rows/jobs, the same document content over both transports, and a successful fleet-backed hybrid search.

## Critical Constraints

**MUST**

- Discover the migrated-document witness by calling list_documents on the deployed service; namespaced mutation fixtures are separate and must never substitute for retained-corpus evidence.
- Capture a RED artifact before the flip (get_document over the deployed endpoint while data_plane is 'convex') and a GREEN artifact after, both written under .tmp/S33-MCP-03/.
- Fail closed when HOLO_PRODUCTION_BASE_URL, HOLO_KEY_MCP, HOLO_DEPLOY_TARGET or HOLO_RELEASE_PATH are unset — throw in beforeAll, never it.skip to green.
- Assert the fleet endpoint reported by the deployed /health is a non-loopback, non-laptop address, so a fleet answer cannot be credited to the operator's machine.
- Record the fleet-dependent tool outcome as exactly `HYBRID_OK`; `ROLE_UNAVAILABLE`, an empty result, or a loopback/laptop inference route is blocking.
- Invoke the frozen 44-tool manifest in order through the guarded `CUTOVER-MCP-001` production-write verifier. Stop on first failure, repair only the responsible production path, retry that tool and family, and resume only after they pass.
- Record every created row and dependent job under the unique `mcp-e2e-<run-id>` namespace, verify each effect independently, and remove only ledgered identifiers in a scoped transaction. Zero residue is required.

**NEVER**

- NEVER issue an unnamespaced, unledgered, or non-reversible production mutation. Production writes are authorized only through the guarded verifier after host, SHA, Postgres health, bearer credential, and rollback-checkpoint proof.
- NEVER edit deployment, compose, health, cutover, or inference sources — this task adds a test plus captured evidence only.
- NEVER mark the task complete on the strength of a local run; the ACs are against the deployed service.
- NEVER accept `{results: []}` or `null` where the tool contract requires real application data, and never weaken a correct oracle to obtain green.

**STRICTLY**

- The evidence artifacts must contain the raw JSON-RPC responses, the deployed /health payload, and the resolved image digest, so a reviewer can re-derive every assertion without rerunning.

## Acceptance Criteria

### AC-1 — Deployed get_document serves real Postgres content over Streamable HTTP, and the pre-flip capture proves the difference

- **GIVEN** the deployed service at https://holocron.tail011a51.ts.net:44111 reports data_plane 'postgres' after the S33-PLAT flip, and a pre-flip RED capture exists for the identical call taken while the plane was still 'convex'
- **WHEN** an MCP client discovers a document via list_documents and then calls get_document with that id over the deployed /mcp endpoint
- **THEN** the response carries the exact title returned by list_documents with content byte length > 0 and data_plane 'postgres', while the pre-flip capture for the same call shows HTTP 410 with retired_cloud_plane_removed_d08_02
- **Verify:** `PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts`
- **Tier:** e2e · **Service:** deployed holocron service https://holocron.tail011a51.ts.net:44111/mcp over Tailscale Serve, backed by the deployed Postgres container · **Flow:** UC-SYNC-03
- **Scenario:** topology `multi-node` · evidence `file_artifact` · negative control: disconnect, stub, empty, static, mock

### AC-2 — The deployed surface enumerates 44 tools and answers identically over stdio inside the container

- **GIVEN** the deployed release at $HOLO_RELEASE_PATH on host $HOLO_DEPLOY_TARGET with the mastra container running the same image digest that serves /mcp
- **WHEN** tools/list and the same get_document call are issued over Streamable HTTP and over a real stdio MCP process inside the mastra container
- **THEN** both transports list the identical 44 tool ids, return deep-equal get_document payloads, and the artifact's recorded image digest equals the sha256 digest of the running container
- **Verify:** `PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts`
- **Tier:** e2e · **Service:** deployed holocron MCP HTTP endpoint + real `holo mcp:stdio` process inside the deployed mastra container · **Flow:** UC-SVC-04
- **Scenario:** topology `multi-node` · evidence `stdout` · negative control: disconnect, stub, static, empty

### AC-3 — The fleet-dependent tool succeeds through the real off-laptop fleet

- **GIVEN** the deployed service's fleet endpoint from /health and the S33-MCP-02 semantics in the running image
- **WHEN** an MCP client calls hybrid_search against the deployed endpoint
- **THEN** the artifact's classification field is exactly 'HYBRID_OK', searchMethod is 'hybrid', totalResults is at least 1 with a positive score, and the /health fleet endpoint is a non-loopback, non-laptop address
- **Verify:** `PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts`
- **Tier:** e2e · **Service:** deployed holocron MCP endpoint + deployed /health fleet probe + the LiteLLM router on holocron routing to the Mac minis · **Flow:** UC-SVC-04
- **Scenario:** topology `multi-node` · evidence `api_response` · negative control: stub, empty, static, mock

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | The deployed get_document returns the same title list_documents reported, with content byte length > 0 and data_plane 'postgres' | AC-1 | `PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts` |
| TC-2 | The pre-flip RED artifact for the identical call contains HTTP 410 with retired_cloud_plane_removed_d08_02 and the post-flip response does not | AC-1 | `PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts` |
| TC-3 | Unauthenticated POST /mcp returns 401 and authenticated returns 200 on the deployed endpoint | AC-1 | `PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts` |
| TC-4 | Both transports enumerate the identical 44 tool ids, return deep-equal get_document payloads, and the recorded digest matches the running container | AC-2 | `PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts` |
| TC-5 | hybrid_search on the deployed service classifies as exactly HYBRID_OK with at least one positively scored result | AC-3 | `PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts` |
| TC-6 | The deployed /health fleet endpoint is non-loopback and not the operator's laptop | AC-3 | `PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts` |

## Fixtures

**`s33_mcp03_deployed_document`** — A real migrated document already resident in the deployed Postgres, discovered read-only through the MCP list_documents tool in the same run. Its id, title and content length become the literals every later assertion is bound to. _(seed: recorded_external)_

- tools/call list_documents { limit: 5 } against https://holocron.tail011a51.ts.net:44111/mcp
- captured: documents[0].id (UUID), documents[0].title (non-empty string), byte length of documents[0].content
- precondition asserted: MK6-DATA-001 corpus proof exists, so the discovered row is migrated data and not a test artifact

**`s33_mcp03_preflip_capture`** — The RED artifact: the identical get_document call issued before the data-plane flip, when the deployed service still reports data_plane 'convex'. _(seed: recorded_external)_

- .tmp/S33-MCP-03/red-get-document.json containing the raw JSON-RPC response, the raw GET /api/documents/:id response, and the /health data_plane value at capture time

**`s33_mcp03_health_snapshot`** — The deployed /health payload captured in the same run, used to bind the fleet endpoint and data plane to the MCP assertions. _(seed: recorded_external)_

- GET https://holocron.tail011a51.ts.net:44111/health
- captured: status, data_plane, fleet.endpoint, fleet.ready

## Reading List

- `services/platform/tests/integration/service/health-readiness.test.ts` (32-45) — Env contract for deployed-service tests: PLATFORM_IT, HOLO_DEPLOY_TARGET, HOLO_PRODUCTION_BASE_URL / HOLO_VERIFY_BASE_URL, HOLO_RELEASE_PATH.
- `services/platform/tests/integration/sprint19-mcp-rehost.test.ts` (575-770) — Dual-transport sweep pattern, JSON-RPC framing over stdio, and the id-set equality assertion between transports.
- `services/platform/tests/integration/sprint29-deployment.test.ts` (430-470) — Established /mcp auth assertions — 401 unauthenticated, 200 with the bearer key.
- `services/platform/deploy/compose/compose.yaml` (49-90) — READ-ONLY. The mastra container derives DATABASE_URL from /run/secrets/database_url at command time — an exec must re-export it before running the stdio CLI. Image root contains src/cli/holo.ts.
- `services/platform/src/deploy/production-deploy.ts` (534-595) — READ-ONLY. Published ports: mastra on 127.0.0.1:44111, Postgres on 127.0.0.1:44112 (host loopback only) — why stdio must run on the host.
- `services/platform/src/http/middleware/scoped-key.ts` (31-95) — READ-ONLY. HOLO_KEY_MCP is the /mcp scope; /health is exempt from auth.
- `.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPRINT.md` (66-96) — The human testing gate this evidence feeds.

## Guardrails

**WRITE-ALLOWED**

- services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts (NEW)
- .tmp/S33-MCP-03/ (NEW — captured evidence artifacts)

**WRITE-PROHIBITED**

- services/platform/src/** - this task adds verification only; behavior fixes belong to S33-MCP-01 and S33-MCP-02
- services/platform/deploy/**, scripts/deploy* - devops-engineer lane (S33-OPS-*)
- services/platform/src/cutover/**, src/http/**, src/deploy/**, src/inference/**, fleet/manifest.json - mastra-planner lane (S33-PLAT-*)
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml - S33-MCP-01 and S33-MCP-02 own the additive edits
- the deployed database - guarded namespaced writes only through `CUTOVER-MCP-001`; all recorded rows and dependent jobs must be independently proven and removed by ledgered identifier

## Design

**References**

- Verified live 2026-08-16: /mcp returns 401 (surface wired, auth enforced); /health returns 503 with failing_dependency 'fleet' and data_plane 'convex'.
- services/platform/src/mcp/gateway.ts:63-73 (stateless Streamable HTTP, same-origin allowed origins)

**Interaction notes**

- This task cannot start green: before the S33-PLAT flip, AC-1 fails against the deployed service. That failure is the required RED evidence and must be captured to .tmp/S33-MCP-03/red-get-document.json rather than worked around.
- The human gate turns the laptop off the tailnet; this test proves the machine-checkable half of that claim by asserting the deployed fleet endpoint is neither loopback nor the laptop. Proof that a specific mini generated the tokens comes from the S33-OPS router metrics / oMLX logs, not from an MCP response.
- AC-3 runs only after fleet routing is healthy. `ROLE_UNAVAILABLE` is useful diagnostic evidence but is not a passing state for this cutover.

**Pattern** — Discovery-bound assertions: never hardcode an id or title against production — read them from one tool and assert them through another, on both transports, so the assertion cannot be satisfied by a static response.

_Source:_ `services/platform/tests/integration/sprint19-mcp-rehost.test.ts:614-766`

**Anti-pattern** — Asserting only that a tool call 'returned a result' or that HTTP status is 200 — both are satisfied by a disconnected or stubbed service and prove nothing about the flip.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts` | Exit 0 |
| typecheck | `pnpm tsgo --noEmit` | Exit 0 |
| unit | `pnpm test:unit` | Exit 0 |
| integration | `pnpm test:integration` | Exit 0 |
| live | `pnpm test:live` | Exit 0 |

## Agent Assignment

**mcp-implementer** — Dual-transport MCP conformance against the live deployed gateway; requires MCP protocol fluency (JSON-RPC framing, stdio inside the container, structuredContent parity) rather than deployment or routing changes.

## Coding Standards

- Fail closed on missing env: throw in beforeAll naming the missing variable. Never it.skip when the deployed target is unreachable.
- No `any`; parse JSON-RPC payloads through narrow type guards.
- Every assertion must be traceable to a captured artifact under .tmp/S33-MCP-03/.
- Production mutations require the guarded verifier and its namespace/ledger/cleanup contract; direct ad hoc mutation calls from this test are prohibited.

## Boundary Contracts

- Deployed MCP endpoint: https://holocron.tail011a51.ts.net:44111/mcp — Streamable HTTP, bearer HOLO_KEY_MCP, 401 without it (verified live 2026-08-16).
- Deployed Postgres publishes only 127.0.0.1:44112 on the holocron host, so the stdio transport must be exercised on that host inside the mastra container, not from a remote client.
- The deployed service must report `data_plane: postgres` with migration read-only disabled before the guarded sweep. A write fence, missing rollback checkpoint, wrong host/SHA, missing bearer, or cleanup residue is a blocking failure.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-MCP-03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s33_mcp03_deployed_document": {
      "description": "A real migrated document already resident in the deployed Postgres, discovered read-only through the MCP list_documents tool in the same run. Its id, title and content length become the literals every later assertion is bound to.",
      "seed_method": "recorded_external",
      "records": [
        "tools/call list_documents { limit: 5 } against https://holocron.tail011a51.ts.net:44111/mcp",
        "captured: documents[0].id (UUID), documents[0].title (non-empty string), byte length of documents[0].content",
        "precondition asserted: MK6-DATA-001 corpus proof exists, so the discovered row is migrated data and not a test artifact"
      ]
    },
    "s33_mcp03_preflip_capture": {
      "description": "The RED artifact: the identical get_document call issued before the data-plane flip, when the deployed service still reports data_plane 'convex'.",
      "seed_method": "recorded_external",
      "records": [
        ".tmp/S33-MCP-03/red-get-document.json containing the raw JSON-RPC response, the raw GET /api/documents/:id response, and the /health data_plane value at capture time"
      ]
    },
    "s33_mcp03_health_snapshot": {
      "description": "The deployed /health payload captured in the same run, used to bind the fleet endpoint and data plane to the MCP assertions.",
      "seed_method": "recorded_external",
      "records": [
        "GET https://holocron.tail011a51.ts.net:44111/health",
        "captured: status, data_plane, fleet.endpoint, fleet.ready"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the deployed service reports data_plane 'postgres' and a pre-flip RED capture exists WHEN an MCP client discovers a document via list_documents and calls get_document over the deployed /mcp THEN it receives that exact title with content byte length > 0 and data_plane 'postgres', while the RED capture for the same call shows HTTP 410 retired_cloud_plane_removed_d08_02",
      "verify": "PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts",
      "scenario": {
        "id": "S33-MCP-03/AC-1",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "deployed holocron MCP endpoint + deployed Postgres",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "static",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s33_mcp03_deployed_document",
            "action": {
              "actor": "MCP client on a second real device (a different tailnet host from the deployed node) \u2014 a cross-device read path, bearer HOLO_KEY_MCP",
              "steps": [
                "record this client device's tailnet hostname and the deployed node's hostname, and assert they differ",
                "GET /health and record status, data_plane, fleet.endpoint",
                "POST /mcp without Authorization and record the status (auth boundary control)",
                "POST /mcp initialize, then tools/call list_documents { limit: 5 }",
                "capture documents[0].id and documents[0].title",
                "POST /mcp tools/call get_document { documentId: <captured id> }",
                "write .tmp/S33-MCP-03/green-get-document.json with the raw responses"
              ]
            },
            "end_state": {
              "must_observe": [
                "unauthenticated POST /mcp status === 401",
                "authenticated POST /mcp status === 200",
                "/health data_plane === 'postgres'",
                "get_document structuredContent.title === the title captured from list_documents",
                "get_document structuredContent.content byte length > 0 and recorded in the artifact",
                "get_document structuredContent.data_plane === 'postgres' and source === 'postgres'",
                ".tmp/S33-MCP-03/red-get-document.json contains 'retired_cloud_plane_removed_d08_02' with recorded HTTP status 410",
                "the client device's tailnet hostname !== 'holocron' (the deployed node), both recorded in the artifact"
              ],
              "must_not_observe": [
                "get_document result.content[0].text === 'null'",
                "parsed error code === 'RETIRED_DATA_PLANE' in the post-flip response",
                "'retired_cloud_plane_removed_d08_02' in the post-flip response",
                "0 documents returned by list_documents"
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
      "description": "GIVEN the deployed release on the holocron host WHEN tools/list and get_document are issued over Streamable HTTP and over in-container stdio THEN both list the identical 44 tool ids, return deep-equal payloads, and the recorded image digest equals the running container's sha256 digest",
      "verify": "PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts",
      "scenario": {
        "id": "S33-MCP-03/AC-2",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "deployed MCP HTTP endpoint + in-container stdio MCP process",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "static",
            "empty"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s33_mcp03_deployed_document",
            "action": {
              "actor": "MCP client on a second real device plus a remote exec session driving the deployed node's own entrypoint \u2014 both nodes driven in one cross-device run",
              "steps": [
                "POST /mcp tools/list and collect the sorted tool id list",
                "run the in-container stdio MCP process on the second real node $HOLO_DEPLOY_TARGET via its own entrypoint: docker compose -f \"$HOLO_RELEASE_PATH/deploy/compose/compose.yaml\" exec -T mastra /bin/sh -ec 'export DATABASE_URL=\"$(cat /run/secrets/database_url)\"; exec bun src/cli/holo.ts mcp:stdio'",
                "send initialize, tools/list, and tools/call get_document { documentId: <captured id> } over that process's stdin",
                "write .tmp/S33-MCP-03/stdio-transcript.json with both transports' raw frames"
              ]
            },
            "end_state": {
              "must_observe": [
                "HTTP tools/list length === 44",
                "stdio tools/list length === 44 and deep-equals the sorted HTTP list",
                "the list contains 'get_document', 'hybrid_search', 'search_fts', 'list_documents'",
                "stdio get_document structuredContent deep-equals the AC-1 HTTP structuredContent",
                "the image digest recorded in the artifact === the sha256 digest reported by docker inspect on the running mastra container",
                "count of stdout lines that fail JSON.parse === 0"
              ],
              "must_not_observe": [
                "a tool count other than 44 on either transport",
                "0 tools returned by tools/list on either transport",
                "stdio stdout carrying non-JSON-RPC output",
                "any get_document divergence between transports"
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
      "description": "GIVEN healthy deployed fleet routing WHEN hybrid_search is called against the deployed endpoint THEN the artifact classification is exactly 'HYBRID_OK' with a positive real result, and the /health fleet endpoint is non-loopback and not the laptop",
      "verify": "PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts",
      "scenario": {
        "id": "S33-MCP-03/AC-3",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "deployed MCP endpoint + deployed fleet routing",
        "topology": "multi-node",
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
            "start_ref": "s33_mcp03_health_snapshot",
            "action": {
              "actor": "MCP client on a second real device, against the deployed node's own endpoint \u2014 a cross-device fleet check",
              "steps": [
                "GET /health and record fleet.endpoint and fleet.ready",
                "POST /mcp tools/call hybrid_search { query: <two content words taken from the discovered document's content>, limit: 10 }",
                "classify the outcome and write .tmp/S33-MCP-03/fleet-tool-outcome.json with the raw response, the classification field, and the fleet endpoint"
              ]
            },
            "end_state": {
              "must_observe": [
                "/health fleet.endpoint does not contain '127.0.0.1', 'localhost', '::1' or 'host.docker.internal'",
                "artifact field 'classification' === 'HYBRID_OK'",
                "structuredContent.searchMethod === 'hybrid' with totalResults >= 1 and results[0].score > 0"
              ],
              "must_not_observe": [
                "structuredContent.totalResults === 0 with result.isError === false",
                "an empty results array returned as a success",
                "parsed error code === 'ROLE_UNAVAILABLE'",
                "parsed error code === 'INTERNAL_SERVER_ERROR' carrying no named role or endpoint",
                "a fleet endpoint resolving to the operator's laptop"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Deployed get_document title/content/data_plane assertions bound to the list_documents discovery",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "RED (pre-flip) vs GREEN (post-flip) artifacts differ on the retired-plane literal and the 410 status",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "401 unauthenticated / 200 authenticated on the deployed /mcp",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "44-tool parity, get_document deep-equality, and digest match",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Fleet-dependent tool classification is one of two named states, never an empty success",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Fleet endpoint from /health is non-loopback and not the laptop",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 HOLO_PRODUCTION_BASE_URL=https://holocron.tail011a51.ts.net:44111 HOLO_DEPLOY_TARGET=holocron pnpm test:integration services/platform/tests/integration/sprint33-mcp-03-deployed-surface.test.ts"
    }
  ]
}
-->
