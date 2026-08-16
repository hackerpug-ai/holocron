# MK6-MCP-002: Prove all 44 MCP tools over both real transports

> Status: Backlog
> Assignee: mcp-implementer
> Reviewer: mcp-reviewer
> Priority: P0
> Type: feature
> Wave: 3
> Proposed by: mastra-planner
> Files: services/platform/src/mcp/gateway.ts, services/platform/src/tools/registry.ts, services/platform/src/tools/schemas/**, services/platform/src/mcp/manifest-loader.ts, services/platform/src/mcp/manifest-replay.ts, services/platform/src/mcp/manifest-schema.ts, services/platform/src/mcp/registry-reader.ts, services/platform/src/mcp/verify-manifest.ts, services/platform/src/mcp/verify-rehost.ts, holocron-mcp/src/mastra/stdio.ts, holocron-mcp/src/platform/mcp-client.ts, services/platform/tests/integration/sprint19-mcp-rehost.test.ts, services/platform/tests/integration/sprint31-mcp-idempotent-replay.test.ts, tests/integration/mcp-dual-transport-live.test.ts, scripts/verify-mk6-mcp-all-44.sh
> Depends on: MK6-MCP-001, MK6-MISSION-001, MK6-RUNTIME-001

## Outcome

Actual stdio and stateless Streamable HTTP discover and behaviorally execute exactly 44 tools against the same non-empty real release, including declared failures, auth, cancellation, replay, and durable effects.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-mcp-all-44.sh --stdio --tailnet-http --json` spawns the real stdio child and calls authenticated `https://<tailnet-fqdn>:44111/mcp` from a second authorized real tailnet device; both initialize/list exactly 44 and call all 44 with schema-valid inputs, non-empty reads, durable mutation readback, idempotency, cancellation, and equivalent result/error envelopes.
- [ ] AC-2: Origin/DNS-rebinding, missing/wrong scope, retired plane, not-found, invalid schema, and upstream failures yield 401/403 or `isError:true` as declared; stdio writes JSON-RPC only to stdout and no secret value appears in captures.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Both real transports call all 44 tools and match behavior/effects. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-mcp-all-44.sh --stdio --tailnet-http --json` |
| TC-2 | Wrong MCP scope is rejected and causes no database/blob/queue delta. | AC-2 | `PLATFORM_IT=1 MK6_MCP44_NEGATIVE=wrong-scope bash scripts/verify-mk6-mcp-all-44.sh --tailnet-http --json` |

`MANUAL-ONLY MCP-M1`: the second authorized tailnet device and scoped API-key name must be supplied by the operator. Static tool count, switch coverage, frozen fixtures, generated schemas, and `tools/list` alone cannot pass. Keep official `@modelcontextprotocol/sdk`, stateless HTTP, and stdio; this personal-tailnet scoped-key policy is the immutable AP-7 boundary.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-MCP-002","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"mcp_release":{"seed_method":"public_api","description":"same non-empty real release reached by stdio and a second real tailnet device","records":["expectedToolCount: 44","sentinelId: mk6-mcp-sentinel-1"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN one non-empty release WHEN actual stdio and a second real tailnet device call all tools THEN exactly 44 behaviors and durable effects agree","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-mcp-all-44.sh --stdio --tailnet-http --json","maps_to_ac":null,"scenario":{"test_tier":"e2e","tier":"visible","verification_service":"mcp-stdio-streamable-http-postgres","topology":"multi-node","negative_control":{"would_fail_if":["the second real device is removed or tools/call is replaced by static tools/list"]},"evidence":{"artifact_type":"api_response","required_capture":true},"cases":[{"start_ref":"mcp_release","action":{"steps":["drive stdio locally and drive a second real tailnet device through HTTPS to call all 44 tools"]},"end_state":{"must_observe":["stdioToolCalls: 44","tailnetToolCalls: 44","durableMutationCount > 0"],"must_not_observe":["tailnetToolCalls: 0","empty database"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Auth, schema and declared failures are truthful and redacted","verify":"PLATFORM_IT=1 MK6_MCP44_NEGATIVE=wrong-scope bash scripts/verify-mk6-mcp-all-44.sh --tailnet-http --json","maps_to_ac":null},{"id":"TC-1","type":"test_criterion","description":"Both transports behaviorally execute 44 tools","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-mcp-all-44.sh --stdio --tailnet-http --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"Wrong scope changes no durable state","verify":"PLATFORM_IT=1 MK6_MCP44_NEGATIVE=wrong-scope bash scripts/verify-mk6-mcp-all-44.sh --tailnet-http --json","maps_to_ac":"AC-2"}]}
-->
