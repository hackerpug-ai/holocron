# queue-1 — Mastra native schedule + pg-boss (graphile-worker fallback) leased queue — retries/backoff/DLQ/priority
> Status: ✅ Completed
> Cycle: 1
> Commit: 67c6244116aacea1080b4ff5371f0e5750c51218
> Reviewer: mastra-reviewer+conductor-qa(gate-pass-8/8-verified)
> Completed: 2026-07-17T21:51:28Z
> Sprint: [Sprint 11 — Scheduler and Durable Queue](./SPRINT.md)
> Agent: mastra-implementer
> Estimate: 240 minutes
> Type: INFRA
> Proposed By: mastra-planner
> TDD_MODE: shared
> RED_GREEN_REQUIRED: no

## What this does

The queue can lease real jobs, prioritize interactive work, back off retries, move poison jobs to DLQ, and report real readiness through the stack.

## Why

Sprint 11 sits on the real Postgres/launchd stack built in Sprints 01/04/05. The current service still exposes a process-local queue adapter and an honest disabled scheduler slot; this task replaces that with a real leased queue plus queue health and priority/DLQ primitives.

## How to verify

- `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}`
- `pnpm tsgo --noEmit`
- `pnpm test`

## Scope

Writes: services/platform/src/** · services/platform/deploy/launchd/** · services/platform/tests/integration/** · tests/integration/service/**

Prohibited: .spec/** · .tmp/** · unrelated product surfaces outside the queue stack

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: queue-1 — Mastra native schedule + pg-boss (graphile-worker fallback) leased queue — retries/backoff/DLQ/priority
================================================================================

TASK_TYPE: INFRA
STATUS: Backlog
PRIORITY: P0
EFFORT: M (240 minutes)
AGENT: implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE: shared
RED_GREEN_REQUIRED: no
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

The queue can lease real jobs, prioritize interactive work, back off retries, move poison jobs to DLQ, and report real readiness through the stack.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- MUST use a real Postgres-backed lease store and queue state; NEVER leave the process-local adapter or /usr/bin/true placeholder as the production path.
- MUST keep interactive work ahead of background missions and record retries/backoff/DLQ outcomes; NEVER silently drop poison work.
- STRICTLY surface queue readiness through the stack and CLI; NEVER report a fake healthy queue or hide the scheduler slot.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1: interactive work dequeues before background missions and the lease records priority/fencing metadata [PRIMARY]
- [ ] AC-2: the job is written to the dead-letter path with terminal outcome and no silent drop
- [ ] AC-3: the queue is reported by real readiness probes instead of the process-local adapter and the scheduler slot is no longer a fake placeholder
- [ ] `pnpm tsgo --noEmit` is clean and the exact verification gates below pass
- [ ] Only SCOPE.writeAllowed files are modified

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

Sprint 11 sits on the real Postgres/launchd stack built in Sprints 01/04/05. The current service still exposes a process-local queue adapter and an honest disabled scheduler slot; this task replaces that with a real leased queue plus queue health and priority/DLQ primitives.

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective:** Build the durable queue runtime and scheduler wiring on real Postgres, with priority lanes, retry/backoff, and dead-letter handling.

**Success state:** The queue can lease real jobs, prioritize interactive work, back off retries, move poison jobs to DLQ, and report real readiness through the stack.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

Each AC is a requirement with a stable ID. Behavioral ACs carry a real seeded scenario.

### AC-1 — PRIMARY

**GIVEN:** interactive and background jobs are seeded in the durable queue

**WHEN:** the live queue leases work

**THEN:** interactive work dequeues before background missions and the lease records priority/fencing metadata

- **Test tier:** `integration`
- **Verification service:** queue service + Postgres
- **Unit-test justification:** Not applicable
- **Flow ref:** `UC-PLAT-03`
- **TDD state:** `none`
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run services/platform/tests/integration/queue-priority.test.ts`

**Scenario**

**Start ref:** `priority_lane_seed` (fixture defined below)
**Negative control:** would fail if disconnect, stub, empty, mock, static
**Evidence:** stdout (capture required: yes)
- Case 1 — actor: worker; action: enqueue background mission → enqueue interactive chat job → dequeue both
  - MUST observe: interactive job dequeues first · priority metadata recorded
  - MUST NOT observe: background first · static FIFO proof

### AC-2

**GIVEN:** a poison job seed exists with bounded retries

**WHEN:** the queue exhausts retry/backoff

**THEN:** the job is written to the dead-letter path with terminal outcome and no silent drop

- **Test tier:** `integration`
- **Verification service:** queue service + Postgres
- **Unit-test justification:** Not applicable
- **Flow ref:** `UC-PLAT-03`
- **TDD state:** `none`
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run services/platform/tests/integration/queue-dlq.test.ts`

**Scenario**

**Start ref:** `dlq_poison_seed` (fixture defined below)
**Negative control:** would fail if disconnect, stub, empty, mock, static
**Evidence:** stdout (capture required: yes)
- Case 1 — actor: worker; action: execute poison job until retry budget is exceeded
  - MUST observe: dead-letter row written · retry state persisted
  - MUST NOT observe: silent drop · retry counter reset

### AC-3

**GIVEN:** the stack boots from launchd on the mini or laptop

**WHEN:** the operator runs stack status after startup

**THEN:** the queue is reported by real readiness probes instead of the process-local adapter and the scheduler slot is no longer a fake placeholder

- **Test tier:** `integration`
- **Verification service:** queue service + launchd
- **Unit-test justification:** Not applicable
- **Flow ref:** `UC-PLAT-03`
- **TDD state:** `none`
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts stack status`

**Scenario**

**Start ref:** `scheduler_placeholder_stack` (fixture defined below)
**Negative control:** would fail if disconnect, stub, empty, mock, static
**Evidence:** stdout (capture required: yes)
- Case 1 — actor: operator; action: run holo stack up → run holo stack status
  - MUST observe: queue readiness measured from live backend · scheduler no longer hard-coded to /usr/bin/true
  - MUST NOT observe: queue not started · fake healthy scheduler

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Boolean criterion | Maps to | Exact verify command |
|----|-------------------|----------|----------------------|
| TC-1 | Interactive jobs beat background jobs in the live queue | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run services/platform/tests/integration/queue-priority.test.ts` |
| TC-2 | Retry/backoff reaches a DLQ in real Postgres | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run services/platform/tests/integration/queue-dlq.test.ts` |
| TC-3 | Launchd wiring and status reflect the live queue backend | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts stack status` |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

| Path | Lines / section | Focus |
|------|------------------|-------|
| `/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/04-uc-plat.md` | 45-52 | UC-PLAT-03 scheduler + durable queue acceptance criteria |
| `/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md` | 33-37 | queue semantics: at-least-once execution with exactly-once observable effects |
| `/Users/inference1/Projects/holocron/services/platform/src/http/health.ts` | 1-35, 127-145 | current process-local queue adapter and readiness probing seam to replace |

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

**WRITE-ALLOWED**

- services/platform/src/**
- services/platform/deploy/launchd/**
- services/platform/tests/integration/**
- tests/integration/service/**

**WRITE-PROHIBITED**

- .spec/**
- .tmp/**
- unrelated product surfaces outside the queue stack
- Any file not explicitly listed as write-allowed

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

**Reference:** services/platform/src/http/health.ts:1-35,127-145 + services/platform/src/index.ts:57-123

**Source:** /Users/inference1/Projects/holocron/services/platform/src/http/health.ts:1-35,127-145; /Users/inference1/Projects/holocron/services/platform/src/index.ts:57-123

**Anti-pattern:** ProcessLocalQueue, /usr/bin/true launchd targets, or any status path that can only be proven by stubbing.

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

- References: None — backend task
- Pattern: none — backend task
- Pattern source: N/A
- Notes: No UI/design artifact; queue runtime and launchd wiring only.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS
--------------------------------------------------------------------------------

- Use real Postgres queue state and preserve interactive priority.
- Keep DLQ and retry state auditable in Postgres.
- Do not remove the current scheduler placeholder until the real target is wired in the stack.

For each AC, follow RED → GREEN → REFACTOR when TDD_MODE is not skipped. The orchestrator independently verifies RED failure and GREEN success. Do not write implementation during RED.

--------------------------------------------------------------------------------
ORCHESTRATOR VERIFICATION PROTOCOL
--------------------------------------------------------------------------------

- pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}
- pnpm tsgo --noEmit
- pnpm test
- PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run services/platform/tests/integration/queue-priority.test.ts
- PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run services/platform/tests/integration/queue-dlq.test.ts
- PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts stack status

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

Every AC must have the exact command in its evidence gate. Primary AC: AC-1.

- AC-1: `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run services/platform/tests/integration/queue-priority.test.ts`
- AC-2: `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run services/platform/tests/integration/queue-dlq.test.ts`
- AC-3: `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts stack status`

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

- Name: mastra-implementer
- Rationale: Owns the runtime queue plumbing, scheduler wiring, and Postgres-backed lease semantics.
- Pairing: Pair with red-test-generator on boundary fixtures and with mastra-reviewer on the final sign-off bundle.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

### AC-1

- Artifact: `stdout`
- `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run services/platform/tests/integration/queue-priority.test.ts`

### AC-2

- Artifact: `db_query`
- `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run services/platform/tests/integration/queue-dlq.test.ts`

### AC-3

- Artifact: `stdout`
- `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts stack status`

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

- Queue readiness is measured from the live backend, not a process-local shim.
- Priority and DLQ outcomes are recorded in Postgres and visible in the CLI/test evidence.
- No /usr/bin/true scheduler placeholder remains on the production path.

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

- Depends on: queue-4
- Blocks: queue-2, queue-3, queue-5
- Parallel: None

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

Topo: queue-4 → queue-1 → queue-2 → queue-3 → queue-5.

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1
--------------------------------------------------------------------------------

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "queue-1",
  "tdd_mode": "shared",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "priority_lane_seed": {
      "description": "Mixed interactive/background workload for priority lane proof against real Postgres queue tables.",
      "seed_method": "public_api",
      "records": [
        "background mission job priority=10 key=bg-1",
        "interactive chat job priority=100 key=ix-1",
        "lease metadata columns priority,fence_token"
      ]
    },
    "dlq_poison_seed": {
      "description": "Poison job that must exhaust retry/backoff and enter DLQ in real Postgres.",
      "seed_method": "migration_fixture",
      "records": [
        "poison payload key=poison-1",
        "retry cap max_attempts=3",
        "dead-letter path table queue_dead_letters"
      ]
    },
    "scheduler_placeholder_stack": {
      "description": "Booted stack with current honest-disabled scheduler slot and process-local queue adapter.",
      "seed_method": "cli",
      "records": [
        "holo stack status output",
        "launchd plist scheduler Program=/usr/bin/true placeholder"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN interactive and background jobs are seeded in the durable queue WHEN the live queue leases work THEN interactive work dequeues before background missions and the lease records priority/fencing metadata",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run services/platform/tests/integration/queue-priority.test.ts",
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
            "queue is disconnected from Postgres",
            "stub returns static FIFO order",
            "empty queue always dequeues nothing",
            "mock priority always 0",
            "static hardcoded interactive-first without lease rows"
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
                "enqueue background mission",
                "enqueue interactive chat job",
                "dequeue both"
              ]
            },
            "end_state": {
              "must_observe": [
                "`dequeue_order[0] === \"interactive\"`",
                "`lease.priority === 100`",
                "`lease.fence_token` is non-empty string"
              ],
              "must_not_observe": [
                "`dequeue_order[0] === \"background\"`",
                "`effect_count === 0`",
                "empty dequeue"
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
      "description": "GIVEN a poison job seed exists with bounded retries WHEN the queue exhausts retry/backoff THEN the job is written to the dead-letter path with terminal outcome and no silent drop",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run services/platform/tests/integration/queue-dlq.test.ts",
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
            "disconnect from Postgres drops poison silently",
            "stub always marks success",
            "empty DLQ table accepted as pass",
            "mock retry never increments",
            "static hardcoded dead_letter without rows"
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
                "execute poison job until retry budget is exceeded"
              ]
            },
            "end_state": {
              "must_observe": [
                "`dlq_count === 1`",
                "`job.status === \"dead_letter\"`",
                "`retry_count >= 3`"
              ],
              "must_not_observe": [
                "`dlq_count === 0`",
                "silent drop",
                "empty dead-letter table"
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
      "description": "GIVEN the stack boots from launchd on the mini or laptop WHEN the operator runs stack status after startup THEN the queue is reported by real readiness probes instead of the process-local adapter and the scheduler slot is no longer a fake placeholder",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts stack status",
      "maps_to_ac": null,
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "queue service + launchd",
        "negative_control": {
          "would_fail_if": [
            "disconnect hides queue backend",
            "stub reports ready without probe",
            "empty status payload accepted",
            "mock healthy scheduler",
            "static hardcoded ready:true"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "scheduler_placeholder_stack",
            "action": {
              "actor": "operator",
              "steps": [
                "run holo stack up",
                "run holo stack status"
              ]
            },
            "end_state": {
              "must_observe": [
                "`queue.backend` matches /pg-boss|graphile-worker/",
                "`scheduler.placeholder === false`",
                "`queue.ready === true`"
              ],
              "must_not_observe": [
                "`queue.backend === \"process-local\"`",
                "`scheduler.program === \"/usr/bin/true\"`",
                "empty readiness payload"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Interactive jobs beat background jobs in the live queue",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run services/platform/tests/integration/queue-priority.test.ts",
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
      "description": "Retry/backoff reaches a DLQ in real Postgres",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run services/platform/tests/integration/queue-dlq.test.ts",
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
      "description": "Launchd wiring and status reflect the live queue backend",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts stack status",
      "maps_to_ac": "AC-3",
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
