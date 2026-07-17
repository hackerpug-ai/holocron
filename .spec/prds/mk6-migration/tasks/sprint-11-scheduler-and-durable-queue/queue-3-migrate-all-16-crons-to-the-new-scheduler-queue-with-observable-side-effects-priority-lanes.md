# queue-3 — Migrate all 16 crons to the new scheduler/queue with observable side-effects + priority lanes
> Status: Backlog
> Sprint: [Sprint 11 — Scheduler and Durable Queue](./SPRINT.md)
> Agent: mastra-implementer
> Estimate: 300 minutes
> Type: MIGRATION
> Proposed By: mastra-planner
> TDD_MODE: shared
> RED_GREEN_REQUIRED: no

## What this does

All 16 scheduled jobs fire on real Postgres, jobs:list shows the 7/4/1/3→1/1 inventory split, and interactive jobs still dequeue before background work.

## Why

The 16 Convex-era scheduled jobs still need a faithful migration onto the new scheduler/queue surface. The PRD, E2E criteria, and current CLI/stack wiring all point at the same missing seam: the job inventory and job runner commands do not yet exist.

## How to verify

- `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}`
- `pnpm tsgo --noEmit`
- `pnpm test`

## Scope

Writes: services/platform/src/** · services/platform/deploy/launchd/** · services/platform/tests/integration/** · tests/integration/service/**

Prohibited: .spec/** · .tmp/** · any migration that changes the 16-job inventory without an audit mapping

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: queue-3 — Migrate all 16 crons to the new scheduler/queue with observable side-effects + priority lanes
================================================================================

TASK_TYPE: MIGRATION
STATUS: Backlog
PRIORITY: P0
EFFORT: M (300 minutes)
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

All 16 scheduled jobs fire on real Postgres, jobs:list shows the 7/4/1/3→1/1 inventory split, and interactive jobs still dequeue before background work.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- MUST preserve all 16 migrated job identities and observable side effects; NEVER collapse or drop a job without explicit inventory accounting.
- MUST keep interactive chat/research ahead of standing or background work; NEVER let background jobs starve or preempt interactive work.
- STRICTLY expose job inventory and run-all behavior through the CLI; NEVER hide migration success behind a one-off manual check.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1: all 16 migrated jobs fire and each former Convex side effect is observed in Postgres [PRIMARY]
- [ ] AC-2: jobs:list shows 16 entries mapped to 7 janitor sweeps, 4 workflows, 1 consumer, 3→1 backfill, and 1 digest
- [ ] AC-3: interactive chat/research jobs still dequeue before standing/background work
- [ ] `pnpm tsgo --noEmit` is clean and the exact verification gates below pass
- [ ] Only SCOPE.writeAllowed files are modified

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

The 16 Convex-era scheduled jobs still need a faithful migration onto the new scheduler/queue surface. The PRD, E2E criteria, and current CLI/stack wiring all point at the same missing seam: the job inventory and job runner commands do not yet exist.

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective:** Move every legacy cron to the new scheduler/queue and expose their execution through job inventory and run-all commands.

**Success state:** All 16 scheduled jobs fire on real Postgres, jobs:list shows the 7/4/1/3→1/1 inventory split, and interactive jobs still dequeue before background work.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

Each AC is a requirement with a stable ID. Behavioral ACs carry a real seeded scenario.

### AC-1 — PRIMARY

**GIVEN:** the 16 legacy jobs are seeded for the migration pass

**WHEN:** the operator runs the one-shot migration job inventory pass

**THEN:** all 16 migrated jobs fire and each former Convex side effect is observed in Postgres

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
  - MUST observe: 16 jobs fired · former Convex side effects observed in Postgres
  - MUST NOT observe: missed job · mocked side effect

### AC-2

**GIVEN:** the 16 migrated jobs are inventory-seeded with lane metadata

**WHEN:** the operator asks for the inventory

**THEN:** jobs:list shows 16 entries mapped to 7 janitor sweeps, 4 workflows, 1 consumer, 3→1 backfill, and 1 digest

- **Test tier:** `integration`
- **Verification service:** queue service + Postgres
- **Unit-test justification:** Not applicable
- **Flow ref:** `UC-PLAT-03`
- **TDD state:** `none`
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:list`

**Scenario**

**Start ref:** `cron_inventory_16` (fixture defined below)
**Negative control:** would fail if disconnect, stub, empty, mock, static
**Evidence:** stdout (capture required: yes)
- Case 1 — actor: operator; action: run holo jobs:list
  - MUST observe: 16 jobs listed · 7 janitor sweeps · 4 workflows · 1 consumer · 3→1 backfill · 1 digest
  - MUST NOT observe: missing inventory row · collapsed job classes

### AC-3

**GIVEN:** interactive and background jobs are both seeded after migration

**WHEN:** the queue is dequeued under mixed load

**THEN:** interactive chat/research jobs still dequeue before standing/background work

- **Test tier:** `integration`
- **Verification service:** queue service + Postgres
- **Unit-test justification:** Not applicable
- **Flow ref:** `UC-PLAT-03`
- **TDD state:** `none`
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/jobs-priority.test.ts`

**Scenario**

**Start ref:** `mixed_priority_load` (fixture defined below)
**Negative control:** would fail if disconnect, stub, empty, mock, static
**Evidence:** stdout (capture required: yes)
- Case 1 — actor: worker; action: load background mission → load interactive chat job → dequeue
  - MUST observe: interactive job dequeues first
  - MUST NOT observe: background first · unordered dequeue

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Boolean criterion | Maps to | Exact verify command |
|----|-------------------|----------|----------------------|
| TC-1 | All 16 migrated jobs fire on real Postgres | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:run-all` |
| TC-2 | Jobs inventory reports the 7/4/1/3→1/1 split | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:list` |
| TC-3 | Interactive work dequeues before background work | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/jobs-priority.test.ts` |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

| Path | Lines / section | Focus |
|------|------------------|-------|
| `/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/04-uc-plat.md` | 45-52 | UC-PLAT-03 and the 16-job migration acceptance criteria |
| `/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md` | 29-34 | T-PLAT-009 through T-PLAT-011 real-service criteria |
| `/Users/inference1/Projects/holocron/services/platform/src/cli/holo.ts` | 136-167 | CLI surface that will gain jobs:list and jobs:run-all |
| `/Users/inference1/Projects/holocron/services/platform/src/stack/supervisor.ts` | 350-381 | current scheduler-skipped wiring that the migration replaces |

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
- any migration that changes the 16-job inventory without an audit mapping
- Any file not explicitly listed as write-allowed

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

**Reference:** services/platform/src/cli/holo.ts:136-167 + services/platform/src/stack/supervisor.ts:350-381 + services/platform/src/stack/probes.ts:261-269

**Source:** /Users/inference1/Projects/holocron/services/platform/src/cli/holo.ts:136-167; /Users/inference1/Projects/holocron/services/platform/src/stack/supervisor.ts:350-381; /Users/inference1/Projects/holocron/services/platform/src/stack/probes.ts:261-269

**Anti-pattern:** Leaving the scheduler as /usr/bin/true, or hiding the migrated jobs behind a worker pool with no explicit jobs:list inventory.

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

- References: None — backend task
- Pattern: none — backend task
- Pattern source: N/A
- Notes: No design artifact; migration and queue routing only.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS
--------------------------------------------------------------------------------

- Keep the 16-job surface explicit and auditable.
- Tag jobs so interactive work always wins the shared queue.
- Make the new job inventory command reflect the exact 7/4/1/3→1/1 split.

For each AC, follow RED → GREEN → REFACTOR when TDD_MODE is not skipped. The orchestrator independently verifies RED failure and GREEN success. Do not write implementation during RED.

--------------------------------------------------------------------------------
ORCHESTRATOR VERIFICATION PROTOCOL
--------------------------------------------------------------------------------

- pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}
- pnpm tsgo --noEmit
- pnpm test
- PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:run-all
- PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:list
- PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/jobs-migration.test.ts

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

Every AC must have the exact command in its evidence gate. Primary AC: AC-1.

- AC-1: `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:run-all`
- AC-2: `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:list`
- AC-3: `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/jobs-priority.test.ts`

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

- Name: mastra-implementer
- Rationale: Owns the cron-to-scheduler migration and the job inventory surface.
- Pairing: Pair with red-test-generator on the coverage cases and with mastra-reviewer on the job mapping evidence.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

### AC-1

- Artifact: `db_query`
- `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:run-all`

### AC-2

- Artifact: `stdout`
- `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:list`

### AC-3

- Artifact: `stdout`
- `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/jobs-priority.test.ts`

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

- All 16 migrated jobs fire against real Postgres.
- The inventory surface reports the exact job-class split required by the sprint gate.
- Interactive jobs remain ahead of background work under mixed load.

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

- Depends on: queue-1, queue-2, queue-4
- Blocks: queue-5
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
  "task_id": "queue-3",
  "tdd_mode": "shared",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "cron_inventory_16": {
      "description": "Legacy cron inventory with every migrated job represented once.",
      "seed_method": "sql_migration",
      "records": [
        "16 jobs",
        "7 janitor sweeps",
        "4 workflows",
        "1 consumer",
        "3→1 backfill",
        "1 digest"
      ]
    },
    "mixed_priority_load": {
      "description": "Background and interactive jobs loaded together for ordering proof.",
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
      "description": "GIVEN the 16 legacy jobs are seeded for the migration pass WHEN the operator runs the one-shot migration job inventory pass THEN all 16 migrated jobs fire and each former Convex side effect is observed in Postgres",
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
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
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
                "16 jobs fired",
                "former Convex side effects observed in Postgres"
              ],
              "must_not_observe": [
                "missed job",
                "mocked side effect"
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
      "description": "GIVEN the 16 migrated jobs are inventory-seeded with lane metadata WHEN the operator asks for the inventory THEN jobs:list shows 16 entries mapped to 7 janitor sweeps, 4 workflows, 1 consumer, 3→1 backfill, and 1 digest",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:list",
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
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
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
                "run holo jobs:list"
              ]
            },
            "end_state": {
              "must_observe": [
                "16 jobs listed",
                "7 janitor sweeps",
                "4 workflows",
                "1 consumer",
                "3→1 backfill",
                "1 digest"
              ],
              "must_not_observe": [
                "missing inventory row",
                "collapsed job classes"
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
      "description": "GIVEN interactive and background jobs are both seeded after migration WHEN the queue is dequeued under mixed load THEN interactive chat/research jobs still dequeue before standing/background work",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/jobs-priority.test.ts",
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
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mixed_priority_load",
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
                "interactive job dequeues first"
              ],
              "must_not_observe": [
                "background first",
                "unordered dequeue"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "All 16 migrated jobs fire on real Postgres",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:run-all",
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
      "description": "Jobs inventory reports the 7/4/1/3→1/1 split",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:list",
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
      "description": "Interactive work dequeues before background work",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/jobs-priority.test.ts",
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
