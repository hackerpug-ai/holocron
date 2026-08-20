# OBS-MCP-02 — Version the 45-tool contract and prove transport parity

**Status:** Planned
**Proposed By:** `mcp-planner`
**Primary implementer:** `mcp-implementer`
**Estimate:** 4–5 days
**Depends on:** OBS-MCP-01, OBS-05

## Objective

Publish `query_service_events` once in the canonical registry, version the MCP contract
to 1.1.0 with exactly 45 tools, and prove schema/result/error parity across authenticated
HTTP, canonical platform stdio, and the packaged delegated stdio surface.

## Critical constraints

- MUST keep `@modelcontextprotocol/sdk` directly exact-pinned to the OBS-01-approved
  resolved version (candidate `1.30.0`) wherever production source imports it.
- MUST register one canonical implementation only. Platform transports share its Zod
  schema and executor; the packaged delegate is a thin remote wrapper, not new logic.
- MUST expose all 45 tools to the full `mcp` key and local-process stdio. The dedicated
  observability key exposes only `query_service_events`.
- MUST reserve stdio stdout for JSON-RPC and never log keys, raw payloads, or sentinels.
- MUST update every active 44-count consumer intentionally while leaving frozen
  historical receipts immutable.
- NEVER weaken scope policy to make a count test pass or replace real child-process/
  HTTP/Postgres proof with an in-process handler test.

## Write-allowed files

```text
services/platform/package.json
pnpm-lock.yaml
services/platform/src/tools/registry.ts
services/platform/src/mcp/gateway.ts
services/platform/src/mcp/manifest-loader.ts
services/platform/src/mcp/verify-manifest.ts
services/platform/src/cli/commands/verify-no-convex.ts
services/platform/src/cli/holo.ts
services/platform/src/deploy/verify-production.ts
services/platform/src/index.ts
services/platform/src/prd/consistency.ts
services/platform/src/tools/__tests__/registry.test.ts
holocron-mcp/package.json
holocron-mcp/src/mastra/stdio.ts
holocron-mcp/src/platform/mcp-client.ts
holocron-mcp/src/config/env.ts
holocron-mcp/src/tools/observability.ts
.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml
services/platform/tests/fixtures/mcp-manifest/query_service_events_success.json
services/platform/tests/fixtures/mcp-manifest/query_service_events_empty.json
services/platform/tests/fixtures/mcp-manifest/query_service_events_error.json
services/platform/tests/integration/observability-mcp-parity.test.ts
services/platform/tests/integration/helpers/mcp-sweep-predicate.ts
services/platform/tests/integration/sprint19-mcp-rehost.test.ts
services/platform/tests/integration/sprint29-deployment.test.ts
services/platform/tests/integration/sprint29-human-gate-oracles.test.ts
services/platform/tests/integration/sprint29-soak-flip.test.ts
services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts
services/platform/tests/integration/sprint31-registry-execute.test.ts
services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts
services/platform/tests/integration/prd-consistency.test.ts
```

Active MK-VI API/component/capability/testing docs may change only where an explicit
44 count is part of the current contract. Historical roadmaps, completed receipts,
Sprint 33 worktrees, and sprint state are read-only.

## Contract publication

Manifest version is `1.1.0` and expected count is 45. The entry includes the exact
OBS-MCP-01 input/output schemas, defaults, stable errors, cursor/order contract,
`side_effects:null`, `idempotency:"read-only snapshot query"`, transports
`[stdio,streamable-http]`, required observability scope, and annotations:

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

Add success, empty, and error fixtures. The verifier requires an error fixture whenever
an entry declares errors, including read-only tools. Negative copies with wrong
version/count/scope/annotation/schema/fixture must fail.

## Transport contract

- HTTP full `mcp` projection lists/calls 45; observability projection lists/calls one;
  cross-scope calls fail before SQL.
- `holo mcp:stdio` runs direct local-process execution and lists/calls 45 with clean
  JSON-RPC stdout.
- Packaged `holocron-mcp` lists 45 but delegates the new tool using
  `HOLO_KEY_OBSERVABILITY`; the new wrapper uses the shared strict schema, never
  `AnyObject`. The observability key cannot invoke an existing tool.
- Parity compares the same hosted Postgres snapshot, query cursor, normalized content,
  and errors after removing only transport envelope fields.

## Acceptance and test criteria

- **AC-1:** Given manifest 1.1.0, when verification runs, then exactly 45 unique tools,
  exact schema/scope/annotations, and all three fixtures are present.
- **AC-2:** Given canonical registry/composition/executor, when audited, then one new
  implementation exists and every active surface/count resolves to 45 or scoped 45/1.
- **AC-3:** Given full and observability HTTP keys, when list/call runs, then full sees
  45, dedicated sees one, and cross-scope calls fail before SQL.
- **AC-4:** Given one real Postgres snapshot, when platform HTTP/stdio and packaged
  stdio call the tool, then schemas, content, cursors, and expected errors are equal.
- **TC-1:** Remove tool/success/empty/error fixture/scope/annotation or set count 44;
  each manifest derivative fails.
- **TC-2:** Repository guard rejects unexplained active `44 tool`, `44/44`, or
  `toBe(44)` outside the reviewed historical allowlist.
- **TC-3:** Invalid DB URL on cross-scope calls still returns `FORBIDDEN`, with zero
  query count.
- **TC-4:** Spawn both real stdio child processes; every stdout line parses as JSON-RPC,
  results match HTTP, and key/raw-sentinel match count is zero.

## Verification

```bash
bun services/platform/src/cli/holo.ts mcp:verify-manifest --json
bun services/platform/src/cli/holo.ts mcp:verify-rehost --json
pnpm typecheck
pnpm test:unit
PLATFORM_IT=1 pnpm vitest run --project integration \
  services/platform/tests/integration/observability-mcp-parity.test.ts \
  services/platform/tests/integration/sprint19-mcp-rehost.test.ts \
  services/platform/tests/integration/sprint31-manifest-reconciliation.test.ts \
  services/platform/tests/integration/sprint31-registry-execute.test.ts \
  services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts
pnpm prd:consistency
git diff --check
```

Artifacts: `.tmp/OBS-MCP-02/start-ref.json`, `manifest-45.json`,
`registry-executor-parity.json`, `http-scope-projections.json`,
`platform-stdio-list-call.jsonl`, `legacy-stdio-list-call.jsonl`,
`cross-transport-parity.json`, `negative-controls.json`, `stdout-hygiene.json`, and
`active-44-audit.json`.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "OBS-MCP-02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "manifest_45": {
      "seed_method": "cli",
      "description": "canonical v1.1.0 manifest registry and success empty error fixtures",
      "records": [
        "expectedToolCount:45"
      ]
    },
    "transport_snapshot": {
      "seed_method": "public_api",
      "description": "one real hosted Postgres snapshot queried by HTTP and two stdio child processes",
      "records": [
        "expectedParityMismatchCount:0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN contract version 1.1.0 WHEN manifest verification runs THEN exactly 45 unique tools and complete schema scope annotations and fixtures pass",
      "verify": "bun services/platform/src/cli/holo.ts mcp:verify-manifest --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-MCP-02/AC-1",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "mcp-manifest-verifier",
        "negative_control": {
          "would_fail_if": [
            "count 44 or a required error fixture is accepted",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "manifest_45",
            "action": {
              "steps": [
                "verify canonical and mutated manifests"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedToolCount:45",
                "canonicalExitCode:0",
                "mutantFailureCount >= 6"
              ],
              "must_not_observe": [
                "duplicateToolCount > 0",
                "missing error fixture accepted",
                "empty required evidence"
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
      "description": "GIVEN registry composition executor and active docs WHEN audited THEN one implementation and exact 45 or scoped 45/1 counts remain",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-mcp-parity.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-MCP-02/AC-2",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "registry-composition-repository-audit",
        "negative_control": {
          "would_fail_if": [
            "duplicate platform logic or an unexplained active 44 assertion remains",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "manifest_45",
            "action": {
              "steps": [
                "compare registry executor composition and active count audit"
              ]
            },
            "end_state": {
              "must_observe": [
                "canonicalImplementationCount:1",
                "expectedToolCount:45",
                "unexplained44Count:0"
              ],
              "must_not_observe": [
                "duplicateExecutorBranchCount > 1",
                "activeCountMismatch",
                "empty required evidence"
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
      "description": "GIVEN full and observability HTTP credentials WHEN list and call run THEN projections are 45 and one with cross-scope denial before SQL",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-mcp-parity.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-MCP-02/AC-3",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "streamable-http-real-postgres-auth",
        "negative_control": {
          "would_fail_if": [
            "scope filtering is omitted or denial happens after SQL",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "transport_snapshot",
            "action": {
              "steps": [
                "list and cross-call both projections with query counter"
              ]
            },
            "end_state": {
              "must_observe": [
                "fullToolCount:45",
                "observabilityToolCount:1",
                "deniedQueryCount:0"
              ],
              "must_not_observe": [
                "crossScopeSuccessCount > 0",
                "database error on denied call",
                "empty required evidence"
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
      "description": "GIVEN one real snapshot WHEN HTTP platform stdio and packaged stdio query THEN normalized schemas results cursors and errors are equal with clean stdout",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-mcp-parity.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-MCP-02/AC-4",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "http-platform-stdio-packaged-stdio-postgres",
        "negative_control": {
          "would_fail_if": [
            "a child process is replaced by an in-process handler or delegate uses the wrong key",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "transport_snapshot",
            "action": {
              "steps": [
                "spawn both stdio servers and compare calls to authenticated HTTP"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedParityMismatchCount:0",
                "jsonRpcStdoutParseFailureCount:0",
                "childProcessCount:2"
              ],
              "must_not_observe": [
                "keyMatchCount > 0",
                "rawSentinelMatchCount > 0",
                "empty required evidence"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Manifest version count schema scope annotation and fixture mutants all fail.",
      "verify": "bun services/platform/src/cli/holo.ts mcp:verify-manifest --negative-observability --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "One canonical implementation exists and active unexplained 44 count is zero.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-mcp-parity.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "HTTP scope projections are 45 and one with zero SQL on denial.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-mcp-parity.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Real HTTP and both stdio child processes produce equal normalized results and clean JSON-RPC stdout.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-mcp-parity.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
