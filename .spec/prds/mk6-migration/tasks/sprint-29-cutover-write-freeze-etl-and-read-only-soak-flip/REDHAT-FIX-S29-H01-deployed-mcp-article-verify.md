# REDHAT-FIX-S29-H01 — Verify deployed network /mcp and /article endpoints with schema-valid Postgres-backed per-tool results (H-01)

> Status: Backlog
> Task ID: REDHAT-FIX-S29-H01
> Assignee: devops-engineer
> Priority: P0
> Type: FEATURE

## What this does

Close red-hat **H-01**: verify-soak must hit deployed network `/mcp` and `/article`
(or a real listening server URL), not only in-process `createHonoApp().request`.
Read tools must require schema-valid Postgres-backed success — HTTP 200 with application-level
error is FAIL. Preserve per-tool results.

## Why

Review: `.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md`. soak-fence.ts constructs fresh in-process app; treats HTTP 200/202 as success
even on MCP application errors; article check is app.request.

## How to verify

- `rg -n 'createHonoApp\(\)|app\.request' services/platform/src/cutover/soak-fence.ts` → verify path uses network URL when HOLO_SOAK_BASE_URL set
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'tools|article|mcp'`
- Evidence: toolsPassed == toolsTotal == 44 with per-tool records; no nulls

## Scope

Writes: `services/platform/src/cutover/soak-fence.ts`, soak-flip tests, gate-plan step 5 if needed, `.tmp/REDHAT-FIX-S29-H01/**`

<details>
<summary>▸ Full agent specification</summary>

================================================================================
TASK: REDHAT-FIX-S29-H01
================================================================================
TASK_TYPE: FEATURE
PRIORITY: P0
AGENT: implementer=devops-engineer | reviewer=mastra-reviewer
TDD_MODE: red_first
RED_GREEN_REQUIRED: yes

RUNTIME_COMMANDS:
  test: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts
  typecheck: pnpm tsgo --noEmit

OUTCOME
-------
Verify-soak tools/article checks use a real HTTP base URL; per-tool results require
MCP isError!=true / schema-valid payloads; toolsPassed/toolsTotal never null on pass.

DONE WHEN
---------
- [ ] AC-1: network /mcp verification (or real listen server) for tools
- [ ] AC-2: application-level MCP errors fail the tool check
- [ ] AC-3: /article via network, not only app.request
- [ ] AC-4: aggregate report has concrete toolsPassed/toolsTotal

ACCEPTANCE CRITERIA
-------------------

### AC-1 [PRIMARY] — network MCP
VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'tools|mcp'`
SCENARIO:
  start_ref: soak_tools_network
  MUST_OBSERVE: base URL or listen port used for tools
  MUST_NOT_OBSERVE: only createHonoApp in-process for the production verify path

### AC-2 — app-level errors fail
VERIFY: same suite -t 'error|isError|tool fail'
SCENARIO:
  start_ref: soak_tools_error
  MUST_OBSERVE: MCP error result marks tool failed
  MUST_NOT_OBSERVE: HTTP 200 with isError counted as pass

### AC-3 — article network
VERIFY: suite -t 'article'
SCENARIO:
  start_ref: soak_article_network
  MUST_OBSERVE: HTTP fetch to /article/
  MUST_NOT_OBSERVE: only app.request as sole path

### AC-4 — non-null tools counts
VERIFY: `jq -e '.toolsPassed != null and .toolsTotal != null' .tmp/D06-05/verify-soak*.json 2>/dev/null || PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'aggregate|verify'`
SCENARIO:
  start_ref: soak_aggregate
  MUST_OBSERVE: toolsPassed and toolsTotal numbers
  MUST_NOT_OBSERVE: null toolsPassed with overall.ok true

<!-- REQUIREMENT-CONTRACT v1 -->
```json
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-H01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fx-mcp-network": {
      "description": "network mcp",
      "seed_method": "public_api",
      "records": [
        "mcp"
      ]
    },
    "fx-article": {
      "description": "article",
      "seed_method": "public_api",
      "records": [
        "article"
      ]
    },
    "fx-tool-error": {
      "description": "tool error",
      "seed_method": "public_api",
      "records": [
        "error"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "network tools",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'tools|mcp'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub or mock replaces the real CLI/service boundary",
            "disconnect from real Postgres/Convex so no request is issued",
            "empty start with zero gates/tools/tables still reports green",
            "static hardcoded pass without executing the real path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-mcp-network",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'tools|mcp'"
              ]
            },
            "end_state": {
              "must_observe": [
                "toolsTotal >= 44 OR tools_checked_count >= 44",
                "network_base_url_used == true",
                "per_tool_results_count >= 44"
              ],
              "must_not_observe": [
                "tools_checked_count == 0",
                "empty tools list",
                "network_base_url_used == false with in-process only"
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
      "flow_ref": "T-SYNC-010",
      "description": "app errors fail",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'error|isError'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub or mock replaces the real CLI/service boundary",
            "disconnect from real Postgres/Convex so no request is issued",
            "empty start with zero gates/tools/tables still reports green",
            "static hardcoded pass without executing the real path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-tool-error",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'error|isError'"
              ]
            },
            "end_state": {
              "must_observe": [
                "tool_fail_on_isError == true",
                "http_200_with_isError_counts_as_pass == false"
              ],
              "must_not_observe": [
                "http_200_with_isError_counts_as_pass == true",
                "empty error handling"
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
      "flow_ref": "T-SYNC-010",
      "description": "article network",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'article'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub or mock replaces the real CLI/service boundary",
            "disconnect from real Postgres/Convex so no request is issued",
            "empty start with zero gates/tools/tables still reports green",
            "static hardcoded pass without executing the real path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-article",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'article'"
              ]
            },
            "end_state": {
              "must_observe": [
                "article_http_status == 200",
                "article_fetch_via_network == true"
              ],
              "must_not_observe": [
                "article_http_status == 0",
                "empty article body accepted as pass",
                "article_fetch_via_network == false only"
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
      "flow_ref": "T-SYNC-010",
      "description": "non-null counts",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'aggregate|verify'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub or mock replaces the real CLI/service boundary",
            "disconnect from real Postgres/Convex so no request is issued",
            "empty start with zero gates/tools/tables still reports green",
            "static hardcoded pass without executing the real path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-mcp-network",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'aggregate|verify'"
              ]
            },
            "end_state": {
              "must_observe": [
                "toolsPassed is integer >= 0",
                "toolsTotal >= 44",
                "toolsPassed_null == false"
              ],
              "must_not_observe": [
                "toolsPassed == null",
                "toolsTotal == null",
                "empty aggregate"
              ]
            }
          }
        ]
      }
    }
  ]
}
```
