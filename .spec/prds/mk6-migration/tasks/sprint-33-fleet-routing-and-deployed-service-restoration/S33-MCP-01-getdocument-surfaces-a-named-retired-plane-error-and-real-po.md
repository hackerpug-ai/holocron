# S33-MCP-01: get_document surfaces a named retired-plane error and real Postgres content over both MCP transports

> Status: 🟡 In Progress
> Updated: 2026-08-16T21:51:39Z
> Assignee: mcp-implementer
> Priority: P0
> Type: FEATURE
> Effort: M · 90 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: mcp-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: —
> Blocks: S33-MCP-02, S33-MCP-03

## Outcome

Make the MCP get_document tool tell the truth about the observed data plane over both stdio and Streamable HTTP: real Postgres content when the plane is postgres, a NAMED fail-closed error carrying retired_cloud_plane_removed_d08_02 when the plane is still the retired cloud plane, and null only for a genuinely absent document.

**Success state:** A caller on either transport can distinguish three outcomes without ambiguity — seeded document content (data_plane=postgres, source=postgres), `null` (document absent), and isError:true with code RETIRED_DATA_PLANE / DATA_PLANE_READ_FAILED. The pre-flip and post-flip behaviors are no longer both representable as `null`.

## Critical Constraints

**MUST**

- Throw a named error for the retired plane: `RETIRED_DATA_PLANE: retired_cloud_plane_removed_d08_02 (data_plane=<observed>)` so gateway.ts maps code=RETIRED_DATA_PLANE with isError:true, mirroring the HTTP route's 410 for the identical condition.
- Throw `DATA_PLANE_READ_FAILED: <planeRead.error>` when readDocumentFromObservedPlane returns status >= 500, instead of falling through to the executor's own second Postgres connection.
- Preserve the NOT_FOUND-as-null contract for a genuinely absent documentId when the plane is postgres/unset.
- Preserve the existing full field set on the postgres path (documentId, title, content, status, isPublic, shareToken, date, createdAt, data_plane, source).

**NEVER**

- NEVER return `null` for the retired-plane case — that is the silent-empty-success defect this task removes (executor.ts:1004-1006).
- NEVER edit src/cutover/**, src/http/**, src/deploy/**, src/inference/**, or fleet/manifest.json (mastra-planner / devops-engineer lanes).
- NEVER modify the `check_subscriptions` case — MK6-MCP-001 owns it.
- NEVER add or rename fixture files under services/platform/tests/fixtures/mcp-manifest/ (mcp-fixture-coverage + placeholder-audit tests treat that directory as frozen).

**STRICTLY**

- Manifest yaml edit is ADDITIVE ONLY: append two error entries under the existing get_document `errors:` list. Do not touch its schemas, defaults, transports, or any other tool entry.
- This task edits 14-mcp-compatibility-manifest.yaml and must land BEFORE S33-MCP-02, which edits the same file.

## Acceptance Criteria

### AC-1 — Postgres plane returns the seeded document content over Streamable HTTP

- **GIVEN** the observed data plane is postgres (or unset) and s33_mcp01_seeded_document exists in holocron_nonprod
- **WHEN** an MCP client calls tools/call get_document with the seeded documentId over the real Streamable HTTP gateway, and again with a UUID proven absent
- **THEN** the seeded call returns the exact title and sentinel content with data_plane 'postgres', source 'postgres' and result.isError === false; the absent call returns result.content[0].text === 'null' with result.isError === false and no error code
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts`
- **Tier:** integration · **Service:** real Postgres (holocron_nonprod) + real Hono /mcp Streamable HTTP gateway · **Flow:** UC-SVC-04
- **Scenario:** topology `single-node` · evidence `api_response` · negative control: disconnect, stub, empty, static

### AC-2 — Retired plane fails closed with the named 410 reason instead of null

- **GIVEN** the observed data plane is 'convex' with target 'convex-frozen' (the deployed service's current state), driven by a real temp secrets file
- **WHEN** an MCP client calls tools/call get_document with the same seeded documentId over Streamable HTTP, and GET /api/documents/<same id> is issued against the same running app
- **THEN** the MCP tool result is isError:true carrying code RETIRED_DATA_PLANE and the reason literal retired_cloud_plane_removed_d08_02, the HTTP route returns 410 with the same literal, and neither returns a null document
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts`
- **Tier:** integration · **Service:** real Postgres (holocron_nonprod) + real Hono app (/mcp and /api/documents/:id) with HOLO_SECRETS_PATH set to the retired-plane secrets file · **Flow:** UC-SYNC-03
- **Scenario:** topology `single-node` · evidence `api_response` · negative control: stub, empty, static

### AC-3 — stdio transport is byte-identical to Streamable HTTP for both plane states

- **GIVEN** the same real Postgres database and the same two plane states (postgres and convex)
- **WHEN** the identical get_document calls are issued to a real `holo mcp:stdio` child process over JSON-RPC on stdin/stdout
- **THEN** the postgres-plane structuredContent deep-equals the HTTP result, the retired-plane result carries the identical RETIRED_DATA_PLANE code and reason literal, and zero stdout lines fail JSON.parse
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts`
- **Tier:** integration · **Service:** real `bun services/platform/src/cli/holo.ts mcp:stdio` child process + real Postgres · **Flow:** UC-SVC-04
- **Scenario:** topology `single-node` · evidence `stdout` · negative control: disconnect, stub, static

### AC-4 — Unreachable Postgres fails closed with a named error, never null

- **GIVEN** the plane is postgres but DATABASE_URL points at a verified-closed TCP port on 127.0.0.1
- **WHEN** an MCP client calls tools/call get_document over Streamable HTTP
- **THEN** the tool result is isError:true with code DATA_PLANE_READ_FAILED whose message carries the underlying postgres_document_read_failed reason
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts`
- **Tier:** integration · **Service:** real Hono /mcp gateway pointed at a real closed TCP port (no mock, no stub) · **Flow:** UC-SVC-04
- **Scenario:** topology `single-node` · evidence `api_response` · negative control: stub, empty, static

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | get_document over Streamable HTTP returns the seeded title and sentinel content with data_plane 'postgres' and result.isError === false | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts` |
| TC-2 | get_document returns result.content[0].text === 'null' with no error code for a UUID proven absent under the postgres plane | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts` |
| TC-3 | Under the retired cloud plane, /api/documents/:id returns 410 and MCP get_document returns isError with code RETIRED_DATA_PLANE and the retired_cloud_plane_removed_d08_02 literal, never null | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts` |
| TC-4 | stdio and Streamable HTTP produce deep-equal postgres-plane payloads, the identical retired-plane error code, and 0 stdout lines that fail JSON.parse | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts` |
| TC-5 | An unreachable Postgres yields code DATA_PLANE_READ_FAILED rather than a null document or a second-connection success | AC-4 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts` |
| TC-6 | The MCP compatibility manifest still verifies clean after the additive get_document error entries | AC-2 | `pnpm test:integration tests/integration/mcp-verify-manifest.test.ts` |

## Fixtures

**`s33_mcp01_seeded_document`** — One real documents row created through the MCP store_document tool over the real Streamable HTTP gateway (no direct INSERT), so the read path is proven against a row the MCP surface itself wrote. _(seed: public_api)_

- documents: title = 'S33-MCP-01 Postgres Plane Proof'
- documents: content = 'sentinel-s33-mcp-01-postgres-content-9f2c the retired plane must not answer this read'
- documentId: UUID captured from the store_document response and reused by every case

**`s33_mcp01_absent_document_id`** — A well-formed UUID that is absent from documents, asserted absent by a real SELECT before use. _(seed: cli)_

- uuid generated at test start; SELECT count(*)::int FROM documents WHERE id = <uuid>::uuid returns 0

**`s33_mcp01_retired_plane_env`** — A real temp secrets file driving the observed data plane back to the retired cloud plane, exactly as the deployed service reports today. _(seed: cli)_

- temp secrets yaml: HOLO_DATA_PLANE: convex
- temp secrets yaml: HOLO_ROLLBACK_TARGET: convex-frozen
- gateway/stdio child spawned with HOLO_SECRETS_PATH pointed at that file

**`s33_mcp01_unreachable_postgres`** — A real closed TCP port on 127.0.0.1 (bound then released at test start to prove it is closed) used as the DATABASE_URL host port. _(seed: cli)_

- DATABASE_URL = postgres://127.0.0.1:<verified-closed-port>/holocron_nonprod

## Reading List

- `services/platform/src/mcp/executor.ts` (991-1015) — The get_document case. Lines 1004-1006 are the defect: retired plane returns null. Lines 1007-1014 are the full-field Postgres path to preserve.
- `services/platform/src/cutover/data-plane-content.ts` (33-108) — READ-ONLY. ContentReadResult contract: status 410 + error 'retired_cloud_plane_removed_d08_02', 404 'document_not_found', 500 'postgres_document_read_failed'.
- `services/platform/src/mcp/gateway.ts` (24-56) — How thrown errors become { code, message } with isError:true. The code is the message prefix before ':' when it matches /^[A-Z][A-Z0-9_]+$/.
- `services/platform/src/cutover/soak-fence.ts` (200-230) — READ-ONLY. resolveObservedDataPlane precedence: durable secrets file first, then HOLO_DATA_PLANE env. Drives how the test forces the retired-plane state.
- `services/platform/src/http/hono-app.ts` (383) — READ-ONLY. The /api/documents/:id route that already returns 410 for the retired plane — the behavior the MCP tool must match.
- `services/platform/tests/integration/sprint19-mcp-rehost.test.ts` (575-770) — Established dual-transport pattern: real HTTP gateway sweep plus a real `holo mcp:stdio` child with JSON-RPC framing.
- `services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts` (50-140) — startMcpGateway helper — spawning a real Hono app child on an ephemeral port with scoped keys and env overrides.
- `.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml` (337-359) — get_document manifest entry — the errors list to extend additively.

## Guardrails

**WRITE-ALLOWED**

- services/platform/src/mcp/executor.ts (MODIFY — get_document case only)
- services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts (NEW)
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml (MODIFY — append RETIRED_DATA_PLANE and DATA_PLANE_READ_FAILED entries to get_document.errors only)

**WRITE-PROHIBITED**

- services/platform/src/cutover/** - mastra-planner lane (S33-PLAT-*)
- services/platform/src/http/health.ts - mastra-planner lane
- services/platform/src/http/hono-app.ts - mastra-planner lane
- services/platform/fleet/manifest.json - mastra-planner lane
- services/platform/src/deploy/** - mastra-planner lane
- services/platform/src/inference/** - mastra-planner lane
- services/platform/deploy/**, scripts/deploy* - devops-engineer lane (S33-OPS-*)
- services/platform/src/mcp/executor.ts case 'check_subscriptions' - MK6-MCP-001 owns it
- services/platform/tests/fixtures/mcp-manifest/** - frozen fixture set

## Design

**References**

- services/platform/src/mcp/gateway.ts:37-52 (error → code mapping)
- services/platform/src/cutover/data-plane-content.ts:40-49 (retired-plane fail-closed source of truth)
- services/platform/src/http/hono-app.ts:383 (HTTP route already returns 410 for this condition)

**Interaction notes**

- The HTTP route /api/documents/:id already returns 410 for the retired plane; this task makes the MCP tool agree instead of returning null. After the S33-PLAT flip both surfaces answer from Postgres.
- Because the tool throws rather than returning null, MCP clients see a tool result with isError:true — not a transport-level JSON-RPC error. Agent loops keep running and can report the named reason.
- Existing callers that treat null as 'not found' are unaffected: null is still the NOT_FOUND representation under the postgres plane.
- This task and S33-MCP-02 both append to 14-mcp-compatibility-manifest.yaml. They are serialized (02 depends_on 01) so they never edit that file concurrently.

**Pattern** — Named-code throw at the executor boundary so gateway.ts derives a machine-readable code: throw new Error(`RETIRED_DATA_PLANE: retired_cloud_plane_removed_d08_02 (data_plane=${plane})`).

_Source:_ `services/platform/src/mcp/executor.ts:26-27 and gateway.ts:38-45 (INVALID_ARGUMENT already uses this prefix convention)`

**Anti-pattern** — Returning null, `{}`, or a soft `{ ok: false }` object for the retired plane — indistinguishable from 'document not found' and unable to prove flipped-vs-unflipped.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/mcp/executor.ts services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts` | Exit 0 |
| typecheck | `pnpm tsgo --noEmit` | Exit 0 |
| unit | `pnpm test:unit` | Exit 0 |
| integration | `pnpm test:integration` | Exit 0 |
| prd-consistency | `pnpm prd:consistency` | Exit 0 |

## Agent Assignment

**mcp-implementer** — Pure MCP executor semantics + dual-transport (stdio + Streamable HTTP) conformance against the real gateway and real Postgres; no deployment, routing, or cutover-module changes.

## Coding Standards

- No `any` — use unknown + narrowing, matching the existing isRecord helpers.
- Named error codes are SCREAMING_SNAKE_CASE prefixes followed by ': ' so gateway.ts can extract them.
- stdio transport must never write to stdout outside the JSON-RPC frame — no console.log on any executor path.
- Tests are real-service only: real Postgres, real gateway child, real stdio child. No vi.mock, no fake transports, no it.skip fallbacks that hide missing infra.

## Boundary Contracts

- MCP tool error envelope: gateway.ts:37-52 derives `code` from the message prefix matching /^[A-Z][A-Z0-9_]+$/ before the first ':' and sets isError:true. Any named error MUST be thrown as `CODE: human message` or it collapses to INTERNAL_SERVER_ERROR.
- Manifest get_document contract: output is object-or-null; NOT_FOUND is expressed as null (14-mcp-compatibility-manifest.yaml:337-359). Absent-document null MUST remain distinguishable from retired-plane failure.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-MCP-01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s33_mcp01_seeded_document": {
      "description": "One real documents row created through the MCP store_document tool over the real Streamable HTTP gateway (no direct INSERT), so the read path is proven against a row the MCP surface itself wrote.",
      "seed_method": "public_api",
      "records": [
        "documents: title = 'S33-MCP-01 Postgres Plane Proof'",
        "documents: content = 'sentinel-s33-mcp-01-postgres-content-9f2c the retired plane must not answer this read'",
        "documentId: UUID captured from the store_document response and reused by every case"
      ]
    },
    "s33_mcp01_absent_document_id": {
      "description": "A well-formed UUID that is absent from documents, asserted absent by a real SELECT before use.",
      "seed_method": "cli",
      "records": [
        "uuid generated at test start; SELECT count(*)::int FROM documents WHERE id = <uuid>::uuid returns 0"
      ]
    },
    "s33_mcp01_retired_plane_env": {
      "description": "A real temp secrets file driving the observed data plane back to the retired cloud plane, exactly as the deployed service reports today.",
      "seed_method": "cli",
      "records": [
        "temp secrets yaml: HOLO_DATA_PLANE: convex",
        "temp secrets yaml: HOLO_ROLLBACK_TARGET: convex-frozen",
        "gateway/stdio child spawned with HOLO_SECRETS_PATH pointed at that file"
      ]
    },
    "s33_mcp01_unreachable_postgres": {
      "description": "A real closed TCP port on 127.0.0.1 (bound then released at test start to prove it is closed) used as the DATABASE_URL host port.",
      "seed_method": "cli",
      "records": [
        "DATABASE_URL = postgres://127.0.0.1:<verified-closed-port>/holocron_nonprod"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the observed data plane is postgres and the seeded document exists WHEN get_document is called over the real Streamable HTTP gateway THEN it returns the seeded title, the sentinel content substring, data_plane 'postgres', source 'postgres' and result.isError === false; an absent UUID returns result.content[0].text === 'null' with no error code",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts",
      "scenario": {
        "id": "S33-MCP-01/AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real Postgres (holocron_nonprod) + real Hono /mcp Streamable HTTP gateway",
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
            "start_ref": "s33_mcp01_seeded_document",
            "action": {
              "actor": "MCP client over Streamable HTTP with bearer HOLO_KEY_MCP",
              "steps": [
                "POST /mcp initialize, then tools/call store_document with the fixture title + content and capture documentId",
                "POST /mcp tools/call get_document { documentId }",
                "parse structuredContent from the JSON-RPC result"
              ]
            },
            "end_state": {
              "must_observe": [
                "structuredContent.title === 'S33-MCP-01 Postgres Plane Proof'",
                "structuredContent.content contains 'sentinel-s33-mcp-01-postgres-content-9f2c'",
                "structuredContent.data_plane === 'postgres'",
                "structuredContent.source === 'postgres'",
                "structuredContent.documentId === the documentId returned by store_document",
                "result.isError === false"
              ],
              "must_not_observe": [
                "result.isError === true",
                "structuredContent === null",
                "structuredContent is an empty object {}",
                "0 rows returned by SELECT count(*) FROM documents WHERE id = <captured documentId>",
                "any occurrence of 'retired_cloud_plane_removed_d08_02'"
              ]
            }
          },
          {
            "start_ref": "s33_mcp01_absent_document_id",
            "action": {
              "actor": "MCP client over Streamable HTTP",
              "steps": [
                "assert SELECT count(*)::int FROM documents WHERE id = <absent-uuid>::uuid returns 0",
                "POST /mcp tools/call get_document { documentId: <absent-uuid> }"
              ]
            },
            "end_state": {
              "must_observe": [
                "result.content[0].text === 'null'",
                "result.content array length === 1",
                "result.isError === false"
              ],
              "must_not_observe": [
                "parsed error code === 'RETIRED_DATA_PLANE'",
                "parsed error code === 'DATA_PLANE_READ_FAILED'",
                "an empty tool result carrying no content array",
                "result.isError === true"
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
      "description": "GIVEN the observed data plane is convex/convex-frozen WHEN get_document is called over MCP and /api/documents/:id over HTTP THEN MCP returns isError with code RETIRED_DATA_PLANE and HTTP returns 410, both containing retired_cloud_plane_removed_d08_02, and neither returns null",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts",
      "scenario": {
        "id": "S33-MCP-01/AC-2",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real Postgres + real Hono app (/mcp and /api/documents/:id) with retired-plane secrets",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
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
            "start_ref": "s33_mcp01_retired_plane_env",
            "action": {
              "actor": "MCP client + plain HTTP client against a gateway child started with the retired-plane secrets file",
              "steps": [
                "write temp secrets yaml with HOLO_DATA_PLANE: convex and HOLO_ROLLBACK_TARGET: convex-frozen",
                "spawn the Hono app child with HOLO_SECRETS_PATH pointed at it",
                "GET /api/documents/<seeded id> with bearer HOLO_KEY_MCP and record status + body",
                "POST /mcp tools/call get_document { documentId: <seeded id> }"
              ]
            },
            "end_state": {
              "must_observe": [
                "GET /api/documents/:id status === 410 with body containing 'retired_cloud_plane_removed_d08_02'",
                "MCP result.isError === true",
                "MCP parsed error code === 'RETIRED_DATA_PLANE'",
                "MCP error message contains 'retired_cloud_plane_removed_d08_02'",
                "MCP error message names the observed plane: contains 'data_plane=convex'"
              ],
              "must_not_observe": [
                "MCP result.content[0].text === 'null'",
                "a bare null MCP result carrying no error code",
                "structuredContent present on the MCP result",
                "parsed error code === 'INTERNAL_SERVER_ERROR'",
                "the seeded title 'S33-MCP-01 Postgres Plane Proof' anywhere in either response",
                "GET /api/documents/:id status === 200"
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
      "description": "GIVEN a real holo mcp:stdio child process WHEN the same two get_document calls are made THEN the postgres-plane payload deep-equals the HTTP payload, the retired-plane error code matches, and 0 stdout lines fail JSON.parse",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts",
      "scenario": {
        "id": "S33-MCP-01/AC-3",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real bun services/platform/src/cli/holo.ts mcp:stdio child process + real Postgres",
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
            "start_ref": "s33_mcp01_seeded_document",
            "action": {
              "actor": "JSON-RPC client writing to the stdio child's stdin",
              "steps": [
                "spawn bun services/platform/src/cli/holo.ts mcp:stdio with DATABASE_URL set and no plane override",
                "send initialize, then tools/call get_document { documentId }",
                "respawn the child with HOLO_SECRETS_PATH set to the retired-plane secrets file and repeat the same tools/call"
              ]
            },
            "end_state": {
              "must_observe": [
                "postgres-plane stdio structuredContent deep-equals the AC-1 HTTP structuredContent (title 'S33-MCP-01 Postgres Plane Proof', sentinel content, data_plane 'postgres')",
                "retired-plane stdio result.isError === true with parsed error code === 'RETIRED_DATA_PLANE'",
                "retired-plane stdio message contains 'retired_cloud_plane_removed_d08_02'",
                "count of stdout lines that fail JSON.parse === 0 across both runs",
                "every parsed stdout frame carries 'jsonrpc':'2.0'",
                "count of parsed JSON-RPC response frames >= 2 across both runs"
              ],
              "must_not_observe": [
                "retired-plane stdio result.content[0].text === 'null'",
                "0 JSON-RPC frames parsed from the child's stdout",
                "a transport-level JSON-RPC error object in place of a tool result carrying isError",
                "any divergence between the stdio and HTTP payloads for the postgres plane"
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
      "description": "GIVEN DATABASE_URL points at a verified-closed TCP port WHEN get_document is called THEN the result is isError:true with code DATA_PLANE_READ_FAILED containing postgres_document_read_failed, never null",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts",
      "scenario": {
        "id": "S33-MCP-01/AC-4",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real Hono /mcp gateway + verified-closed TCP port",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
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
            "start_ref": "s33_mcp01_unreachable_postgres",
            "action": {
              "actor": "MCP client over Streamable HTTP against a gateway child with the unreachable DATABASE_URL",
              "steps": [
                "bind an ephemeral port, record it, close it, and assert a fresh connect attempt is refused with ECONNREFUSED",
                "spawn the gateway child with DATABASE_URL using that closed port",
                "POST /mcp tools/call get_document { documentId: <any uuid> }"
              ]
            },
            "end_state": {
              "must_observe": [
                "result.isError === true",
                "parsed error code === 'DATA_PLANE_READ_FAILED'",
                "error message contains 'postgres_document_read_failed'"
              ],
              "must_not_observe": [
                "result.content[0].text === 'null'",
                "result.isError === false",
                "an empty error message carrying no postgres reason",
                "structuredContent present on the MCP result"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Seeded-document read over HTTP asserts exact title + sentinel content + data_plane + isError false",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Absent-UUID read returns literal 'null' text and no error code",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Retired-plane read returns 410 on HTTP and RETIRED_DATA_PLANE on MCP with the reason literal",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "stdio/HTTP parity for both plane states with 0 unparseable stdout lines",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Unreachable Postgres yields DATA_PLANE_READ_FAILED",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm test:integration services/platform/tests/integration/sprint33-mcp-01-get-document-data-plane.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Manifest verification still passes after the additive error entries",
      "maps_to_ac": "AC-2",
      "verify": "pnpm test:integration tests/integration/mcp-verify-manifest.test.ts"
    }
  ]
}
-->
