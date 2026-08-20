# OBS-MCP-01 — Build the service-event read model and bounded query

**Status:** Planned
**Proposed By:** `mcp-planner`
**Primary implementer:** `mcp-implementer`
**Estimate:** 4–5 days
**Depends on:** OBS-03

## Objective

Create an indexed, redacted `service_event_feed_v1` plus the strict query schema,
executor, cursor, deep-link, freshness, and dedicated HTTP authorization boundary. This
task does not publish the 45th registry/manifest entry; OBS-MCP-02 owns publication.

## Critical constraints

- MUST consume OBS-03's real `service_events` writer/table. Missing producers block
  this task; never synthesize deployment/health/exporter rows.
- MUST use a regular `security_invoker` Postgres view and documented first-party tables;
  no materialized stale copy, Docker logs, Langfuse private table, raw payload JSON, raw
  model response, prompt, message, or error body is allowed.
- MUST authorize before executor/database URL/SQL creation. Existing `mcp` scope and
  local stdio retain full access; `observability` scope can call only this tool.
- MUST use stable tuple ordering, a query-bound versioned cursor, one repeatable-read
  transaction, a seven-day maximum, and real index-plan receipts.
- NEVER fabricate release identity, source freshness, or deep links.

## Write-allowed files

```text
AGENTS.md
.env.example
services/platform/config/secrets.example.yaml
services/platform/src/db/migrations/0043_service_event_feed_v1.sql
services/platform/src/db/migrations/meta/**
services/platform/src/db/schema/observability.ts
services/platform/src/db/schema/index.ts
services/platform/src/observability/service-event-feed.ts
services/platform/src/observability/service-event-cursor.ts
services/platform/src/tools/schemas/observability.ts
services/platform/src/tools/schemas/index.ts
services/platform/src/mcp/auth-context.ts
services/platform/src/mcp/executor.ts
services/platform/src/mcp/gateway.ts
services/platform/src/http/middleware/scoped-key.ts
services/platform/src/http/hono-app.ts
services/platform/tests/fixtures/observability/service-event-feed.sql
services/platform/tests/integration/observability-service-event-feed.test.ts
services/platform/tests/integration/observability-mcp-auth.test.ts
```

Registry, compatibility manifest/fixtures, packaged `holocron-mcp`, Compose, OBS-03
producers, prior migrations, Sprint 33 worktrees, and sprint state are read-only.

## SQL read-model contract

Migration 0043 creates `service_event_feed_v1` and
`service_event_source_freshness_v1` with `CREATE OR REPLACE VIEW`; indexes use
`IF NOT EXISTS`. Every branch normalizes:

```text
event_id, observed_at, source, category, type, severity, status,
trace_id, run_id, entity_type, entity_id, duration_ms,
input_tokens, output_tokens, total_tokens, summary, metadata, redacted
```

Use `UNION ALL`, namespaced IDs, and `(observed_at DESC,event_id DESC)` ordering.
Freshness returns exactly seven keys, with `NULL` for a source without events.

Source mapping:

- `mission`: `mission_events` + `mission_runs`; lifecycle types/status/trace/run;
  allow only event/stage/checkpoint/template identifiers, never `payload_json`.
- `chat`: `chat_run_events` + `chat_runs`, excluding token events; allow only
  seq/role/step counts, never message/final/error/data bodies.
- `inference`: `inference_telemetry`; model category, token/wall values, allow only
  provider/model/role/step/error code, never endpoint/error text.
- `agent`: safe legacy `agent_telemetry`; allow classification source, specialist,
  confidence, duration; never intent/query/reasoning/regex/tools/raw response.
- `deployment`, `health`, `observability`: `service_events`, with the PRD's category and
  strict per-source metadata allowlists.

Add observed/id, trace, run, source/type indexes to underlying tables. Prove default,
trace, and run queries with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` against
production-shape seeded volume.

## Tool and cursor contract

Use the exact PRD input/output schema. Defaults anchor `until` once, set `since` one
hour earlier, use all sources/severities, `detailLevel=summary`, and `limit=50` (max
200). Status/event/entity/trace/run tokens are length-bounded. Cursor pages accept the
cursor and optional unchanged limit only.

Cursor is canonical base64url JSON with `{v:1, observedAt, eventId, query, digest}`;
the digest binds all resolved filters and anchored `until`. Reject malformed, changed,
oversize, unsupported-version, or filter-mismatched cursors. Fetch `limit+1` and seek
with `(observed_at,event_id) < (...)`.

Read events and freshness in one `REPEATABLE READ, READ ONLY` transaction. Build a
trace URL only from validated HTTPS `OBSERVABILITY_BASE_URL` and
`LANGFUSE_PROJECT_ID`, preserving `/observability`; omit it for absent trace/config.
Production release identity must pass the existing immutable validator.

## Authorization and errors

Add `HOLO_KEY_OBSERVABILITY` as a value-free configured name and scope. The full `mcp`
key lists/calls all published tools including this one after OBS-MCP-02. The
`observability` key lists/calls only this tool. Unknown/missing HTTP keys return 401 and
Bearer challenge; cross-scope calls return `FORBIDDEN` before any database interaction.
Expected errors use `isError:true` JSON text with stable codes such as
`INVALID_ARGUMENT`, `INVALID_WINDOW`, `WINDOW_TOO_LARGE`, `INVALID_CURSOR`,
`CURSOR_MISMATCH`, `FORBIDDEN`, `SOURCE_UNAVAILABLE`,
`RELEASE_IDENTITY_UNAVAILABLE`, and `CANCELLED`.

## Acceptance and test criteria

- **AC-1:** Given real rows for all seven sources, when the view is queried, then exact
  safe mappings and seven-key nullable freshness match independent SQL.
- **AC-2:** Given equal timestamps and multiple pages/filters, when queries run, then
  every row appears once in stable order and invalid/>7-day/cursor mutation fails.
- **AC-3:** Given forbidden raw-field sentinels, when view/tool/evidence serialize, then
  match count is zero and deterministic safe summaries remain.
- **AC-4:** Given full, observability, wrong, and missing credentials, when HTTP calls
  occur, then policy is exact and denied calls make zero database queries.
- **TC-1:** Omit one source, alter one safe mapping, or expose one raw JSON field and
  source parity fails.
- **TC-2:** Equal-time pagination, filter-bound cursor, defaults, limits, cancellation,
  and empty result cases exercise real Postgres.
- **TC-3:** Unique canaries in every forbidden source column have zero result/artifact
  matches.
- **TC-4:** Use a deliberately invalid DB URL on a forbidden request; result remains
  `FORBIDDEN`, proving SQL was never opened.

## Verification

```bash
pnpm typecheck
pnpm test:unit
PLATFORM_IT=1 pnpm vitest run --project integration \
  services/platform/tests/integration/observability-service-event-feed.test.ts \
  services/platform/tests/integration/observability-mcp-auth.test.ts
git diff --check
```

Artifacts: `.tmp/OBS-MCP-01/start-ref.json`, `migration-report.json`,
`source-mapping-parity.json`, `query-plans.json`, `cursor-negative-controls.json`,
`http-auth-receipts.json`, `redaction-sentinel-scan.json`, and
`release-freshness-deep-links.json`.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "OBS-MCP-01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seven_sources": {
      "seed_method": "public_api",
      "description": "real producers plus production-shape Postgres rows for all seven safe sources",
      "records": [
        "expectedSourceCount:7",
        "expectedSentinelMatchCount:0"
      ]
    },
    "auth_matrix": {
      "seed_method": "public_api",
      "description": "full mcp observability wrong and missing bearer cases with SQL query counter",
      "records": [
        "expectedDeniedQueryCount:0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN real rows for seven sources WHEN the security-invoker view is queried THEN normalized safe mappings and freshness match independent SQL",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-service-event-feed.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-MCP-01/AC-1",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "real-postgres-service-event-views",
        "negative_control": {
          "would_fail_if": [
            "an operational source is synthetic or a raw payload is selected",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seven_sources",
            "action": {
              "steps": [
                "run producers then compare views with independent SQL"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedSourceCount:7",
                "sourceMappingMismatchCount:0",
                "freshnessKeyCount:7"
              ],
              "must_not_observe": [
                "rawPayloadFieldCount > 0",
                "missing source key",
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
      "description": "GIVEN equal timestamps filters windows and pages WHEN bounded query runs THEN tuple order is lossless and invalid cursor or window fails",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-service-event-feed.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-MCP-01/AC-2",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "real-postgres-repeatable-read-query",
        "negative_control": {
          "would_fail_if": [
            "pagination uses offset or cursor filters can be changed",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seven_sources",
            "action": {
              "steps": [
                "page equal-time rows then mutate cursor and exceed window"
              ]
            },
            "end_state": {
              "must_observe": [
                "duplicateEventCount:0",
                "missingEventCount:0",
                "cursorMutationExitCode != 0",
                "longWindowExitCode != 0"
              ],
              "must_not_observe": [
                "windowDays > 7",
                "offset pagination",
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
      "description": "GIVEN unique forbidden-field sentinels WHEN view tool and artifacts serialize THEN zero sentinel matches and safe summaries remain",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-service-event-feed.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-MCP-01/AC-3",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres-mcp-redaction-scan",
        "negative_control": {
          "would_fail_if": [
            "arbitrary JSON or raw model responses are returned",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seven_sources",
            "action": {
              "steps": [
                "seed forbidden columns query and scan all serialized outputs"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedSentinelMatchCount:0",
                "emptySummaryCount:0"
              ],
              "must_not_observe": [
                "raw response sentinel",
                "secret sentinel",
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
      "description": "GIVEN full observability wrong and missing credentials WHEN HTTP tools are listed or called THEN scopes are exact and denied paths make zero SQL queries",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-mcp-auth.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-MCP-01/AC-4",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "hono-streamable-http-real-postgres",
        "negative_control": {
          "would_fail_if": [
            "authorization happens after executor or database creation",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "auth_matrix",
            "action": {
              "steps": [
                "list and call with every credential using invalid DB URL for denied cases"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedDeniedQueryCount:0",
                "observabilityAllowedToolCount:1",
                "missingKeyHttpStatus:401"
              ],
              "must_not_observe": [
                "crossScopeSuccessCount > 0",
                "database connection error on denied call",
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
      "description": "Seven source mappings and freshness match independent real SQL.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-service-event-feed.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Tuple pagination is lossless and cursor/window mutations fail.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-service-event-feed.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "All forbidden-field canaries have zero serialized matches.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-service-event-feed.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Cross-scope denials happen before any database connection or query.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-mcp-auth.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
