# MK6-MCP-001: Repair MCP executor semantics and durable mutations

> Status: Backlog
> Assignee: mcp-implementer
> Reviewer: mcp-reviewer
> Priority: P0
> Type: bugfix
> Wave: 6
> Proposed by: mastra-planner
> Files: services/platform/src/mcp/executor.ts, services/platform/src/mcp/list-mutations.ts, services/platform/src/db/schema/subscriptions.ts, services/platform/src/db/migrations/0040_mcp_subscription_replay.sql, services/platform/tests/integration/mcp-behavior-live.test.ts, scripts/verify-mk6-mcp-executor.sh
> Depends on: MK6-DATA-001, MK6-QUEUE-001, MK6-MISSION-001

## Outcome

`check_subscriptions` and every MCP mutation produce truthful real Postgres/blob/queue effects, idempotent replay, and declared errors instead of zero/null false success.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --fresh-controlled-feed --json` changes a task-owned real HTTP feed after baseline and proves sourceType/enabled filtering, fetched-content persistence, `last_checked`, downstream enqueue, durable mutation readback, and one stable result under two concurrent identical calls.
- [ ] AC-2: `PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --negative-control mcp-semantic-no-op --json` — The `mcp-semantic-no-op` control first passes the real baseline, applies a hardcoded-zero mutant only in a disposable copy, and fails with `MCP_SEMANTIC_NO_OP`; no production fault hook exists.
- [ ] AC-3: `PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=disabled bash scripts/verify-mk6-mcp-executor.sh --json` — A disabled subscription returns its declared disabled outcome with zero content and queue delta.
- [ ] AC-4: `PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=malformed bash scripts/verify-mk6-mcp-executor.sh --json` — A malformed source returns `isError:true` with the manifest-declared schema/source error and zero durable delta.
- [ ] AC-5: `PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=upstream-error bash scripts/verify-mk6-mcp-executor.sh --fresh-controlled-feed --json` — A freshly changed controlled HTTP feed that returns an upstream error yields its declared upstream error and no fake success.
- [ ] AC-6: `PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=not-found bash scripts/verify-mk6-mcp-executor.sh --json` — A missing mutation target yields its manifest-declared not-found error, never ordinary null/empty success.
- [ ] AC-7: `PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=retired-plane bash scripts/verify-mk6-mcp-executor.sh --json` — Any content read selecting the retired plane yields HTTP 410 / MCP `isError:true` with exact code `retired_cloud_plane_removed_d08_02`, never null or an empty success.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Fresh feed changes source, content, last-checked, and queue state exactly once. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --fresh-controlled-feed --json` |
| TC-2 | Real baseline passes and disposable hardcoded-zero mutant fails. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --negative-control mcp-semantic-no-op --json` |
| TC-3 | Disabled subscription changes no durable state. | AC-3 | `PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=disabled bash scripts/verify-mk6-mcp-executor.sh --json` |
| TC-4 | Malformed source returns the declared error. | AC-4 | `PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=malformed bash scripts/verify-mk6-mcp-executor.sh --json` |
| TC-5 | Fresh upstream failure returns the declared error. | AC-5 | `PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=upstream-error bash scripts/verify-mk6-mcp-executor.sh --fresh-controlled-feed --json` |
| TC-6 | Missing mutation target returns the declared not-found error. | AC-6 | `PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=not-found bash scripts/verify-mk6-mcp-executor.sh --json` |
| TC-7 | Retired-plane reads return exact 410 semantics. | AC-7 | `PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=retired-plane bash scripts/verify-mk6-mcp-executor.sh --json` |

Recorded/frozen feeds, fixtures as proof, static manifest agreement, direct imports, and empty reads are non-oracles.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "MK6-MCP-001",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fresh_feed": {
      "seed_method": "public_api",
      "description": "task-owned real HTTP feed changed after baseline",
      "records": [
        "sourceId: mk6-source-1",
        "changedItemCount: 1"
      ]
    },
    "semantic_mutant": {
      "seed_method": "cli",
      "description": "passing real baseline plus hardcoded-zero mutant in a disposable source copy",
      "records": [
        "expectedMutantFailureCount: 1"
      ]
    },
    "disabled_source": {
      "seed_method": "public_api",
      "description": "real disabled subscription in Postgres",
      "records": [
        "expectedQueueDelta: 0"
      ]
    },
    "malformed_source": {
      "seed_method": "public_api",
      "description": "real malformed controlled source response",
      "records": [
        "expectedErrorCount: 1"
      ]
    },
    "upstream_error": {
      "seed_method": "public_api",
      "description": "freshly changed controlled HTTP source returning an upstream failure",
      "records": [
        "expectedErrorCount: 1"
      ]
    },
    "missing_target": {
      "seed_method": "public_api",
      "description": "real absent mutation target",
      "records": [
        "expectedErrorCount: 1"
      ]
    },
    "retired_plane": {
      "seed_method": "public_api",
      "description": "authenticated content request selecting retired Convex plane",
      "records": [
        "expectedHttpStatus: 410"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "Fresh controlled feed and concurrent mutation persist and enqueue exactly once",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --fresh-controlled-feed --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "mcp-executor-fresh-feed",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "mcp-postgres-queue-http-feed",
        "negative_control": {
          "would_fail_if": [
            "check_subscriptions is a hardcoded zero no-op or mutation persistence is removed"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_feed",
            "action": {
              "steps": [
                "capture baseline, change the real HTTP feed, call check_subscriptions, and issue two concurrent identical mutations"
              ]
            },
            "end_state": {
              "must_observe": [
                "persistedItemCount: 1",
                "downstreamQueueDelta: 1",
                "stableReplayRowCount: 1"
              ],
              "must_not_observe": [
                "persistedItemCount: 0",
                "empty last_checked"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "Real baseline kills disposable hardcoded-zero mutant",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --negative-control mcp-semantic-no-op --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "mcp-executor-semantic-mutant",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "mcp-postgres-queue-http-feed",
        "negative_control": {
          "would_fail_if": [
            "hardcoded zero mutant is accepted"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "semantic_mutant",
            "action": {
              "steps": [
                "pass real baseline then run disposable hardcoded-zero mutant"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselinePassCount: 1",
                "mutantFailureCount: 1",
                "failureClass: MCP_SEMANTIC_NO_OP"
              ],
              "must_not_observe": [
                "mutantFailureCount: 0",
                "empty failure class"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "Disabled source makes no durable change",
      "verify": "PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=disabled bash scripts/verify-mk6-mcp-executor.sh --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "mcp-executor-disabled",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "mcp-postgres-queue",
        "negative_control": {
          "would_fail_if": [
            "disabled filtering is removed"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "disabled_source",
            "action": {
              "steps": [
                "call check_subscriptions for disabled source"
              ]
            },
            "end_state": {
              "must_observe": [
                "disabledOutcomeCount: 1",
                "queueDelta: 0"
              ],
              "must_not_observe": [
                "queueDelta: 1",
                "empty source identity"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "Malformed source returns declared error",
      "verify": "PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=malformed bash scripts/verify-mk6-mcp-executor.sh --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "mcp-executor-malformed",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "mcp-http-feed",
        "negative_control": {
          "would_fail_if": [
            "malformed source is accepted as empty success"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "malformed_source",
            "action": {
              "steps": [
                "call check_subscriptions against malformed real response"
              ]
            },
            "end_state": {
              "must_observe": [
                "isErrorCount: 1",
                "durableDelta: 0"
              ],
              "must_not_observe": [
                "isErrorCount: 0",
                "empty error code"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "Upstream failure returns declared error",
      "verify": "PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=upstream-error bash scripts/verify-mk6-mcp-executor.sh --fresh-controlled-feed --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "mcp-executor-upstream",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "mcp-http-feed",
        "negative_control": {
          "would_fail_if": [
            "upstream error is replaced by static success"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "upstream_error",
            "action": {
              "steps": [
                "change controlled feed then return real upstream error"
              ]
            },
            "end_state": {
              "must_observe": [
                "isErrorCount: 1",
                "durableDelta: 0"
              ],
              "must_not_observe": [
                "isErrorCount: 0",
                "empty upstream error"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "description": "Missing mutation target returns declared not-found",
      "verify": "PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=not-found bash scripts/verify-mk6-mcp-executor.sh --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "mcp-executor-not-found",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "mcp-postgres",
        "negative_control": {
          "would_fail_if": [
            "not-found is converted to empty success"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "missing_target",
            "action": {
              "steps": [
                "mutate absent target through real MCP executor"
              ]
            },
            "end_state": {
              "must_observe": [
                "isErrorCount: 1",
                "durableDelta: 0"
              ],
              "must_not_observe": [
                "isErrorCount: 0",
                "empty error code"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-7",
      "type": "acceptance_criterion",
      "description": "Retired content plane returns exact 410 error",
      "verify": "PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=retired-plane bash scripts/verify-mk6-mcp-executor.sh --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "mcp-executor-retired-plane",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "mcp-http-postgres",
        "negative_control": {
          "would_fail_if": [
            "retired plane error is converted to null or empty success"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "retired_plane",
            "action": {
              "steps": [
                "read content through authenticated MCP with retired plane selector"
              ]
            },
            "end_state": {
              "must_observe": [
                "httpStatus: 410",
                "failureClass: retired_cloud_plane_removed_d08_02"
              ],
              "must_not_observe": [
                "httpStatus: 200",
                "empty result accepted"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Fresh feed persists and queues once",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --fresh-controlled-feed --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Semantic no-op mutant fails",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-mcp-executor.sh --negative-control mcp-semantic-no-op --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Disabled source changes nothing",
      "verify": "PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=disabled bash scripts/verify-mk6-mcp-executor.sh --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Malformed source errors",
      "verify": "PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=malformed bash scripts/verify-mk6-mcp-executor.sh --json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Upstream failure errors",
      "verify": "PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=upstream-error bash scripts/verify-mk6-mcp-executor.sh --fresh-controlled-feed --json",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Not-found errors",
      "verify": "PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=not-found bash scripts/verify-mk6-mcp-executor.sh --json",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Retired plane is exact 410",
      "verify": "PLATFORM_IT=1 MK6_MCP_EXECUTOR_CASE=retired-plane bash scripts/verify-mk6-mcp-executor.sh --json",
      "maps_to_ac": "AC-7"
    }
  ]
}
-->
