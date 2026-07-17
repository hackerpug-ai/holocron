# queue-4 — RED tests: kill-9 at commit/dispatch/ack → exactly-once + dedupe, all-16-fire, priority, DLQ
> Status: Backlog
> Sprint: [Sprint 11 — Scheduler and Durable Queue](./SPRINT.md)
> Agent: red-test-generator
> Estimate: 210 minutes
> Type: CHORE
> Proposed By: mastra-planner
> TDD_MODE: red_first
> RED_GREEN_REQUIRED: yes

## What this does

The RED suite contains seeded live-service cases for kill-9 boundaries, jobs:run-all, jobs:list, priority, and DLQ, and those tests fail red against the current mainline for the intended reasons.

## Why

Sprint 11 needs live, seeded RED coverage for queue kill-9 boundaries, inventory, priority, and dead-letter handling before the implementation lands.

## How to verify

- `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}`
- `pnpm tsgo --noEmit`
- `pnpm test`

## Scope

Writes: services/platform/tests/integration/** · tests/integration/service/RED/**

Prohibited: .spec/** · .tmp/** · unrelated product code outside the queue harness and tests

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: queue-4 — RED tests: kill-9 at commit/dispatch/ack → exactly-once + dedupe, all-16-fire, priority, DLQ
================================================================================

TASK_TYPE: CHORE
STATUS: Backlog
PRIORITY: P0
EFFORT: M (210 minutes)
AGENT: implementer=red-test-generator | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE: red_first
RED_GREEN_REQUIRED: yes
REQUIRES_SEEDED_EVIDENCE: yes
SPRINT: [Sprint 11 — Scheduler and Durable Queue](./SPRINT.md)
CAPABILITY_COVERAGE: N/A

RUNTIME_COMMANDS:
  test: pnpm test
  typecheck: pnpm tsgo --noEmit
  lint: pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------

The RED suite contains seeded live-service cases for kill-9 boundaries, jobs:run-all, jobs:list, priority, and DLQ, and those tests fail red against the current mainline for the intended reasons.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- MUST drive real Postgres and the live service harness; NEVER prove queue behavior with mocks, stubs, or in-memory fakes.
- MUST capture seeded evidence for each kill-9 boundary, the 16-job inventory, priority ordering, and the DLQ path; NEVER omit the audit trail.
- STRICTLY fail on duplicate side effects, silent drops, or missing fencing metadata; NEVER accept a green-only proof that skips the boundary cases.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1: the suite captures exactly one observable side effect plus one auditable dedupe record, never zero and never two [PRIMARY]
- [ ] AC-2: all 16 migrated jobs are exercised against real Postgres and each former Convex side effect is observed
- [ ] AC-3: interactive work is selected before background missions
- [ ] AC-4: the job lands in the dead-letter path and is not silently dropped
- [ ] `pnpm tsgo --noEmit` is clean and the exact verification gates below pass
- [ ] Only SCOPE.writeAllowed files are modified

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

Sprint 11 needs live, seeded RED coverage for queue kill-9 boundaries, inventory, priority, and dead-letter handling before the implementation lands.

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective:** Author the red-first live-service queue tests that pin the durable-queue contract before implementation lands.

**Success state:** The RED suite contains seeded live-service cases for kill-9 boundaries, jobs:run-all, jobs:list, priority, and DLQ, and those tests fail red against the current mainline for the intended reasons.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

Each AC is a requirement with a stable ID. Behavioral ACs carry a real seeded scenario.

### AC-1 — PRIMARY

**GIVEN:** a seeded durable effect job and its queue key exist in real Postgres

**WHEN:** the RED suite kills the worker at commit/dispatch/ack boundaries

**THEN:** the suite captures exactly one observable side effect plus one auditable dedupe record, never zero and never two

- **Test tier:** `integration`
- **Verification service:** queue service + Postgres
- **Unit-test justification:** Not applicable
- **Flow ref:** `UC-PLAT-03`
- **TDD state:** `none`
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-durable.RED.test.ts`

**Scenario**

**Start ref:** `red_durable_effect_seed` (fixture defined below)
**Negative control:** would fail if disconnect, stub, empty, mock, static
**Evidence:** stdout (capture required: yes)
- Case 1 — actor: operator; action: enqueue seeded effect → kill -9 before commit → re-run same key
  - MUST observe: exactly one observable effect · one outbox entry · one inbox dedupe record
  - MUST NOT observe: zero effects · duplicate effects
- Case 2 — actor: operator; action: enqueue seeded effect → kill -9 after commit before enqueue → re-run same key
  - MUST observe: exactly one observable effect · one outbox entry · one inbox dedupe record
  - MUST NOT observe: partial commit loss · duplicate effects
- Case 3 — actor: operator; action: enqueue seeded effect → kill -9 after dispatch before ack → re-run same key
  - MUST observe: exactly one observable effect · one outbox entry · one inbox dedupe record
  - MUST NOT observe: duplicate ack · silent drop

### AC-2

**GIVEN:** the legacy 16-job inventory is seeded

**WHEN:** the RED suite runs the all-jobs coverage pass

**THEN:** all 16 migrated jobs are exercised against real Postgres and each former Convex side effect is observed

- **Test tier:** `integration`
- **Verification service:** queue service + Postgres
- **Unit-test justification:** Not applicable
- **Flow ref:** `UC-PLAT-03`
- **TDD state:** `none`
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:run-all`

**Scenario**

**Start ref:** `cron_inventory_16` (fixture defined below)
**Negative control:** would fail if disconnect, stub, empty, mock, static
**Evidence:** stdout (capture required: yes)
- Case 1 — actor: operator; action: run holo jobs:run-all
  - MUST observe: 16 jobs fired · observed side effects in Postgres
  - MUST NOT observe: empty run · mock-only proof

### AC-3

**GIVEN:** interactive and background jobs are both seeded

**WHEN:** the RED suite dequeues a mixed queue

**THEN:** interactive work is selected before background missions

- **Test tier:** `integration`
- **Verification service:** queue service + Postgres
- **Unit-test justification:** Not applicable
- **Flow ref:** `UC-PLAT-03`
- **TDD state:** `none`
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-priority.RED.test.ts`

**Scenario**

**Start ref:** `priority_lane_seed` (fixture defined below)
**Negative control:** would fail if disconnect, stub, empty, mock, static
**Evidence:** stdout (capture required: yes)
- Case 1 — actor: worker; action: load background mission → load interactive chat job → dequeue
  - MUST observe: interactive job dequeues first
  - MUST NOT observe: background first · unordered dequeue

### AC-4

**GIVEN:** a poison job seed exists with bounded retries

**WHEN:** the RED suite forces retries past the cap

**THEN:** the job lands in the dead-letter path and is not silently dropped

- **Test tier:** `integration`
- **Verification service:** queue service + Postgres
- **Unit-test justification:** Not applicable
- **Flow ref:** `UC-PLAT-03`
- **TDD state:** `none`
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-dlq.RED.test.ts`

**Scenario**

**Start ref:** `dlq_poison_seed` (fixture defined below)
**Negative control:** would fail if disconnect, stub, empty, mock, static
**Evidence:** stdout (capture required: yes)
- Case 1 — actor: worker; action: run job until retries exceed cap
  - MUST observe: dead-letter row written · terminal failure recorded
  - MUST NOT observe: silent drop · unbounded retry

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Boolean criterion | Maps to | Exact verify command |
|----|-------------------|----------|----------------------|
| TC-1 | Killing at each queue boundary is covered by the RED suite | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-durable.RED.test.ts` |
| TC-2 | The all-16-fire path is covered by the RED suite | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:run-all` |
| TC-3 | Priority ordering is covered by the RED suite | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-priority.RED.test.ts` |
| TC-4 | Dead-letter coverage is present in the RED suite | AC-4 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-dlq.RED.test.ts` |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

| Path | Lines / section | Focus |
|------|------------------|-------|
| `/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/04-uc-plat.md` | 45-52 | UC-PLAT-03 queue contract and acceptance criteria |
| `/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md` | 33-37 | exactly-once observable effects and outbox/inbox contract |
| `/Users/inference1/Projects/holocron/tests/integration/service/harness.ts` | 1-228 | real live-service boot helper and CLI harness |

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

**WRITE-ALLOWED**

- services/platform/tests/integration/**
- tests/integration/service/RED/**

**WRITE-PROHIBITED**

- .spec/**
- .tmp/**
- unrelated product code outside the queue harness and tests
- Any file not explicitly listed as write-allowed

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

**Reference:** tests/integration/service/harness.ts:1-228 + services/platform/src/inference/degraded-mode-controller.ts:143-153,625-665

**Source:** /Users/inference1/Projects/holocron/tests/integration/service/harness.ts:1-228; /Users/inference1/Projects/holocron/services/platform/src/inference/degraded-mode-controller.ts:143-153,625-665

**Anti-pattern:** A green-only suite that never kills the worker, never uses live Postgres, or proves priority with a stub queue.

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

- References: None — backend task
- Pattern: none — backend task
- Pattern source: N/A
- Notes: No UI/design artifact; this is a live-service test harness task.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS
--------------------------------------------------------------------------------

- Use the live-service harness and real Postgres only.
- Cover each kill-9 boundary explicitly and keep the audit evidence seeded.
- Fail the suite for the current mainline until the implementation lands.

For each AC, follow RED → GREEN → REFACTOR when TDD_MODE is not skipped. The orchestrator independently verifies RED failure and GREEN success. Do not write implementation during RED.

--------------------------------------------------------------------------------
ORCHESTRATOR VERIFICATION PROTOCOL
--------------------------------------------------------------------------------

- pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}
- pnpm tsgo --noEmit
- pnpm test
- PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-durable.RED.test.ts
- PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-priority.RED.test.ts
- PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-dlq.RED.test.ts

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

Every AC must have the exact command in its evidence gate. Primary AC: AC-1.

- AC-1: `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-durable.RED.test.ts`
- AC-2: `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:run-all`
- AC-3: `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-priority.RED.test.ts`
- AC-4: `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-dlq.RED.test.ts`

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

- Name: red-test-generator
- Rationale: Owns the live RED suite that locks the queue contract before implementation.
- Pairing: Pair with mastra-implementer on realistic seeded fixtures and with mastra-reviewer on the final evidence bundle.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

### AC-1

- Artifact: `stdout`
- `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-durable.RED.test.ts`

### AC-2

- Artifact: `stdout`
- `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:run-all`

### AC-3

- Artifact: `db_query`
- `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-priority.RED.test.ts`

### AC-4

- Artifact: `stdout`
- `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-dlq.RED.test.ts`

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

- The suite is live-service only and uses seeded data for every boundary case.
- Each boundary case asserts the intended kill-9, inventory, priority, and DLQ behavior.
- No mock, static, or no-op proof remains in the RED coverage.

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

- Depends on: None
- Blocks: queue-1, queue-2, queue-3, queue-5
- Parallel: None

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

Topological order: queue-4 → queue-1 → queue-2 → queue-3 → queue-5.

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1
--------------------------------------------------------------------------------

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "queue-4",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "red_durable_effect_seed": {
      "description": "Seeded effect key and job payload for kill-9 boundary coverage on real Postgres.",
      "seed_method": "public_api",
      "records": [
        "effect key=red-kill9-1",
        "payload {n:1}",
        "outbox/inbox tables exist"
      ]
    },
    "cron_inventory_16": {
      "description": "16-job registry for RED all-fire coverage.",
      "seed_method": "migration_fixture",
      "records": [
        "16 job definitions registered",
        "Postgres job_runs table empty at start"
      ]
    },
    "dlq_poison_seed": {
      "description": "Poison job seed for RED DLQ coverage.",
      "seed_method": "migration_fixture",
      "records": [
        "poison job key=red-poison-1",
        "max_attempts=3"
      ]
    },
    "priority_lane_seed": {
      "description": "Mixed priority jobs for RED priority coverage.",
      "seed_method": "public_api",
      "records": [
        "background mission",
        "interactive chat job"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a seeded durable effect job and its queue key exist in real Postgres WHEN the RED suite kills the worker at commit/dispatch/ack boundaries THEN the suite captures exactly one observable side effect plus one auditable dedupe record, never zero and never two",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-durable.RED.test.ts",
      "maps_to_ac": null,
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "queue service + Postgres",
        "negative_control": {
          "would_fail_if": [
            "test file has syntax error so zero tests are collected",
            "stub implementation makes tests pass green without RED",
            "empty test body always passes",
            "mock Postgres used instead of real",
            "static hardcoded pass"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "red_durable_effect_seed",
            "action": {
              "actor": "operator",
              "steps": [
                "enqueue seeded effect",
                "kill -9 before commit",
                "re-run same key"
              ]
            },
            "end_state": {
              "must_observe": [
                "`test 'kill-9 boundaries exactly-once' status: failed`",
                "`failed >= 1`",
                "`effect_count === 1` and `outbox_count === 1` and `inbox_dedupe_count === 1` asserted"
              ],
              "must_not_observe": [
                "`passed: 1` with empty implementation",
                "`0 tests collected`",
                "empty RED suite"
              ]
            }
          },
          {
            "start_ref": "red_durable_effect_seed",
            "action": {
              "actor": "operator",
              "steps": [
                "enqueue seeded effect",
                "kill -9 after commit before enqueue",
                "re-run same key"
              ]
            },
            "end_state": {
              "must_observe": [
                "`test 'kill-9 boundaries exactly-once' status: failed`",
                "`failed >= 1`",
                "`effect_count === 1` and `outbox_count === 1` and `inbox_dedupe_count === 1` asserted"
              ],
              "must_not_observe": [
                "`passed: 1` with empty implementation",
                "`0 tests collected`",
                "empty RED suite"
              ]
            }
          },
          {
            "start_ref": "red_durable_effect_seed",
            "action": {
              "actor": "operator",
              "steps": [
                "enqueue seeded effect",
                "kill -9 after dispatch before ack",
                "re-run same key"
              ]
            },
            "end_state": {
              "must_observe": [
                "`test 'kill-9 boundaries exactly-once' status: failed`",
                "`failed >= 1`",
                "`effect_count === 1` and `outbox_count === 1` and `inbox_dedupe_count === 1` asserted"
              ],
              "must_not_observe": [
                "`passed: 1` with empty implementation",
                "`0 tests collected`",
                "empty RED suite"
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
      "description": "GIVEN the legacy 16-job inventory is seeded WHEN the RED suite runs the all-jobs coverage pass THEN all 16 migrated jobs are exercised against real Postgres and each former Convex side effect is observed",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:run-all",
      "maps_to_ac": null,
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "queue service + Postgres",
        "negative_control": {
          "would_fail_if": [
            "disconnect causes collection failure not assertion fail",
            "stub always passes",
            "empty inventory",
            "mock jobs:run-all",
            "static hardcoded 16"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "cron_inventory_16",
            "action": {
              "actor": "operator",
              "steps": [
                "run holo jobs:run-all"
              ]
            },
            "end_state": {
              "must_observe": [
                "`jobs_fired === 16` assertion present in RED suite",
                "`failed >= 1` against mainline missing migration",
                "`side_effect_rows >= 16` asserted against Postgres"
              ],
              "must_not_observe": [
                "`0 tests collected`",
                "empty run accepted as green",
                "mock-only proof"
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
      "description": "GIVEN interactive and background jobs are both seeded WHEN the RED suite dequeues a mixed queue THEN interactive work is selected before background missions",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-priority.RED.test.ts",
      "maps_to_ac": null,
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "queue service + Postgres",
        "negative_control": {
          "would_fail_if": [
            "disconnect skips test",
            "stub green path",
            "empty queue accepted",
            "mock priority",
            "static order"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "priority_lane_seed",
            "action": {
              "actor": "worker",
              "steps": [
                "load background mission",
                "load interactive chat job",
                "dequeue"
              ]
            },
            "end_state": {
              "must_observe": [
                "`dequeue_order[0] === \"interactive\"` assertion present",
                "`failed >= 1` against missing priority lane"
              ],
              "must_not_observe": [
                "`0 tests collected`",
                "empty priority suite",
                "background-first accepted"
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
      "description": "GIVEN a poison job seed exists with bounded retries WHEN the RED suite forces retries past the cap THEN the job lands in the dead-letter path and is not silently dropped",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-dlq.RED.test.ts",
      "maps_to_ac": null,
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "queue service + Postgres",
        "negative_control": {
          "would_fail_if": [
            "disconnect hides DLQ",
            "stub always succeeds",
            "empty DLQ accepted",
            "mock dead letter",
            "static hardcoded pass"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "dlq_poison_seed",
            "action": {
              "actor": "worker",
              "steps": [
                "run job until retries exceed cap"
              ]
            },
            "end_state": {
              "must_observe": [
                "`dlq_count === 1` assertion present",
                "`job.status === \"dead_letter\"` assertion present",
                "`failed >= 1` against missing DLQ path"
              ],
              "must_not_observe": [
                "`0 tests collected`",
                "silent drop accepted",
                "empty DLQ suite"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Killing at each queue boundary is covered by the RED suite",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-durable.RED.test.ts",
      "maps_to_ac": "AC-1",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The all-16-fire path is covered by the RED suite",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:run-all",
      "maps_to_ac": "AC-2",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Priority ordering is covered by the RED suite",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-priority.RED.test.ts",
      "maps_to_ac": "AC-3",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Dead-letter coverage is present in the RED suite",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/RED/queue-dlq.RED.test.ts",
      "maps_to_ac": "AC-4",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    }
  ]
}
-->
</details>
