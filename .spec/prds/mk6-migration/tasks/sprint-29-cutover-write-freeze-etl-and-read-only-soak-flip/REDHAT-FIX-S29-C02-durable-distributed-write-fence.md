# REDHAT-FIX-S29-C02 — Implement a durable distributed production write fence and reciprocal rollback repoint (C-02)

> Status: Backlog
> Task ID: REDHAT-FIX-S29-C02
> Assignee: devops-engineer
> Priority: P0
> Type: FEATURE

## What this does

Close red-hat **C-02**: `cutover:flip` must write a durable, authoritative deployment/
control-plane configuration that every serving process (Hono app, MCP, job workers) loads
or is restarted against — not only `process.env` in the one-shot CLI. Prove configured
target + process generations. Define reciprocal config re-point to frozen Convex as rollback.

## Why

Review: `.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md`. soak-fence.ts only sets process.env and writes .tmp files; no consumer
loads soak-state.json; gate injects HOLO_MIGRATION_READ_ONLY into a fresh local process.

## How to verify

- `rg -n 'process\.env\[HOLO_MIGRATION_READ_ONLY\]|soak-state\.json' services/platform/src/cutover/soak-fence.ts services/platform/src`
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts`
- Prove cross-process: flip then spawn NEW process that observes migration_read_only without parent env injection
- Rollback path: re-point command restores Convex-serving config with audit record

## Scope

Writes: `services/platform/src/cutover/soak-fence.ts`, related config/state loaders under
`services/platform/src/cutover/**`, `services/platform/src/queue/jobs-runner.ts` if needed,
CLI wiring, integration tests, `.tmp/REDHAT-FIX-S29-C02/**`

Prohibited: process-local-only fence as the sole production path; mocking servers.

<details>
<summary>▸ Full agent specification</summary>

================================================================================
TASK: REDHAT-FIX-S29-C02
================================================================================
TASK_TYPE: FEATURE
STATUS: Backlog
PRIORITY: P0
AGENT: implementer=devops-engineer | reviewer=mastra-reviewer
TDD_MODE: red_first
RED_GREEN_REQUIRED: yes
CAPABILITY: CAP-CUT-01

RUNTIME_COMMANDS:
  test: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts
  typecheck: pnpm tsgo --noEmit

OUTCOME
-------
Flip installs a durable soak fence visible to a newly spawned process without injecting
HOLO_MIGRATION_READ_ONLY in the parent; rollback re-point is executable and audited.

CRITICAL CONSTRAINTS
--------------------
- MUST durable store (file under known path loaded by app boot OR env file + restart contract OR Convex/control plane) — document and implement one real mechanism
- MUST prove cross-process observation of fence after flip
- MUST implement rollback re-point counterpart
- NEVER claim pass solely via process.env mutation in CLI process
- NEVER leave soak-state.json unconsumed if it is the durability mechanism

DONE WHEN
---------
- [ ] AC-1: durable fence written and loaded by runtime (not only CLI process.env)
- [ ] AC-2: child process without inherited HOLO_MIGRATION_READ_ONLY still fences writes after flip
- [ ] AC-3: rollback/repoint command exists and records audit
- [ ] AC-4: typecheck clean

ACCEPTANCE CRITERIA
-------------------

### AC-1 [PRIMARY] — durable fence artifact
GIVEN cutover:flip WHEN completes THEN a durable config/state exists that runtime loaders read
VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'durable|flip'`
SCENARIO:
  NEGATIVE_CONTROL: only process.env in CLI
  START_REF: soak_flip_durable
  MUST_OBSERVE: durable fence artifact present after flip
  MUST_NOT_OBSERVE: fence only as process.env in flip CLI

### AC-2 — cross-process
GIVEN flipped state WHEN new Node process starts without parent env injection THEN writes return migration_read_only
VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'cross-process|child'`
SCENARIO:
  NEGATIVE_CONTROL: only works with HOLO_MIGRATION_READ_ONLY=1 in parent
  START_REF: soak_flip_cross_process
  MUST_OBSERVE: child process fenced
  MUST_NOT_OBSERVE: child accepts writes

### AC-3 — rollback repoint
GIVEN soak fence WHEN rollback/repoint runs THEN config points to frozen Convex path with audit
VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'rollback|repoint'`
SCENARIO:
  NEGATIVE_CONTROL: no repoint command
  START_REF: soak_rollback_repoint
  MUST_OBSERVE: repoint command exit 0 with audit fields
  MUST_NOT_OBSERVE: missing rollback surface

### AC-4 — typecheck
VERIFY: `pnpm tsgo --noEmit`

<!-- REQUIREMENT-CONTRACT v1 -->
```json
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-C02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fx-flip-durable": {
      "description": "durable flip",
      "seed_method": "public_api",
      "records": [
        "durable"
      ]
    },
    "fx-child-process": {
      "description": "child process",
      "seed_method": "public_api",
      "records": [
        "child"
      ]
    },
    "fx-rollback": {
      "description": "rollback",
      "seed_method": "public_api",
      "records": [
        "rollback"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "durable fence",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'durable|flip'",
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
            "start_ref": "fx-flip-durable",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'durable|flip'"
              ]
            },
            "end_state": {
              "must_observe": [
                "durable_fence_present == true",
                "runtime_loader_reads_durable == true",
                "process_env_only_fence == false"
              ],
              "must_not_observe": [
                "durable_fence_present == false",
                "empty durable store",
                "process_env_only_fence == true"
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
      "description": "cross-process",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'cross-process|child'",
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
            "start_ref": "fx-child-process",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'cross-process|child'"
              ]
            },
            "end_state": {
              "must_observe": [
                "child_write_status == migration_read_only OR child_status_code == 423",
                "child_process_count == 1"
              ],
              "must_not_observe": [
                "child_write_accepted == true",
                "child_process_count == 0",
                "empty child result"
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
      "description": "rollback",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'rollback|repoint'",
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
            "start_ref": "fx-rollback",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'rollback|repoint'"
              ]
            },
            "end_state": {
              "must_observe": [
                "repoint_exit_code == 0",
                "audit_fields_count >= 1",
                "repoint_command_registered == true"
              ],
              "must_not_observe": [
                "repoint_exit_code != 0 with missing command",
                "audit_fields_count == 0",
                "repoint_command_registered == false",
                "empty audit"
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
      "description": "typecheck",
      "verify": "pnpm tsgo --noEmit",
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
            "start_ref": "fx-flip-durable",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run pnpm tsgo --noEmit"
              ]
            },
            "end_state": {
              "must_observe": [
                "typecheck exit_code == 0"
              ],
              "must_not_observe": [
                "typecheck exit_code != 0",
                "empty skip"
              ]
            }
          }
        ]
      }
    }
  ]
}
```
