# queue-2 — Transactional outbox/inbox + idempotency keys + fencing consumer (exactly-once observable effects)
> Status: Backlog
> Sprint: [Sprint 11 — Scheduler and Durable Queue](./SPRINT.md)
> Agent: mastra-implementer
> Estimate: 240 minutes
> Type: FEATURE
> Proposed By: mastra-planner
> TDD_MODE: shared
> RED_GREEN_REQUIRED: no

## What this does

A kill-9 at each queue boundary still leaves exactly one committed side effect and one auditable outbox/inbox trail, with fencing token and idempotency key recorded.

## Why

The runtime contract already requires exactly-once observable effects via a transactional outbox/inbox, stable idempotency keys, and a fenced consumer. The existing evidence seed/revise code paths prove the repo already favors DB-authoritative mutation patterns.

## How to verify

- `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}`
- `pnpm tsgo --noEmit`
- `pnpm test`

## Scope

Writes: services/platform/src/** · services/platform/tests/integration/** · tests/integration/service/**

Prohibited: .spec/** · .tmp/** · any shortcut that degrades exactly-once semantics to at-least-once without audit

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: queue-2 — Transactional outbox/inbox + idempotency keys + fencing consumer (exactly-once observable effects)
================================================================================

TASK_TYPE: FEATURE
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

A kill-9 at each queue boundary still leaves exactly one committed side effect and one auditable outbox/inbox trail, with fencing token and idempotency key recorded.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- MUST write the outbox entry and stable idempotency key in the same domain transaction; NEVER split them across transactions.
- MUST record a fencing token and terminal outcome for each effect; NEVER use lease count alone as the dedupe boundary.
- STRICTLY prove the kill-9 boundaries against real Postgres and the live service; NEVER rely on mocks, stubs, or a synthetic happy path.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1: exactly one observable side effect and one auditable outbox/inbox dedupe record remain, never zero and never two [PRIMARY]
- [ ] AC-2: one outbox entry, one inbox dedupe outcome, and the fencing token are all visible
- [ ] `pnpm tsgo --noEmit` is clean and the exact verification gates below pass
- [ ] Only SCOPE.writeAllowed files are modified

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

The runtime contract already requires exactly-once observable effects via a transactional outbox/inbox, stable idempotency keys, and a fenced consumer. The existing evidence seed/revise code paths prove the repo already favors DB-authoritative mutation patterns.

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective:** Implement the durable-effect contract so one seeded job always yields one observable side effect plus one auditable dedupe record, even across process death.

**Success state:** A kill-9 at each queue boundary still leaves exactly one committed side effect and one auditable outbox/inbox trail, with fencing token and idempotency key recorded.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

Each AC is a requirement with a stable ID. Behavioral ACs carry a real seeded scenario.

### AC-1 — PRIMARY

**GIVEN:** a seeded durable-effect job exists with a stable idempotency key

**WHEN:** the worker is SIGKILLed at commit, dispatch, and ack boundaries and then replayed

**THEN:** exactly one observable side effect and one auditable outbox/inbox dedupe record remain, never zero and never two

- **Test tier:** `integration`
- **Verification service:** queue service + Postgres
- **Unit-test justification:** Not applicable
- **Flow ref:** `UC-PLAT-03`
- **TDD state:** `none`
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/queue-exactly-once.test.ts`

**Scenario**

**Start ref:** `seeded_durable_effect` (fixture defined below)
**Negative control:** would fail if disconnect, stub, empty, mock, static
**Evidence:** stdout (capture required: yes)
- Case 1 — actor: worker; action: enqueue seeded effect → kill -9 before commit → re-run same key
  - MUST observe: exactly one observable effect · one outbox entry · one inbox dedupe record
  - MUST NOT observe: zero effects · duplicate effects
- Case 2 — actor: worker; action: enqueue seeded effect → kill -9 after commit before enqueue → re-run same key
  - MUST observe: exactly one observable effect · one outbox entry · one inbox dedupe record
  - MUST NOT observe: partial effect · duplicate effects
- Case 3 — actor: worker; action: enqueue seeded effect → kill -9 after dispatch before ack → re-run same key
  - MUST observe: exactly one observable effect · one outbox entry · one inbox dedupe record
  - MUST NOT observe: duplicate ack · silent drop

### AC-2

**GIVEN:** the same seeded key is available for audit after replay

**WHEN:** the operator runs the audit command

**THEN:** one outbox entry, one inbox dedupe outcome, and the fencing token are all visible

- **Test tier:** `integration`
- **Verification service:** Postgres
- **Unit-test justification:** Not applicable
- **Flow ref:** `UC-PLAT-03`
- **TDD state:** `none`
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts queue:audit <key>`

**Scenario**

**Start ref:** `seeded_durable_effect` (fixture defined below)
**Negative control:** would fail if disconnect, stub, empty, mock, static
**Evidence:** stdout (capture required: yes)
- Case 1 — actor: operator; action: run holo queue:audit <key>
  - MUST observe: one outbox entry · one inbox dedupe outcome · fencing token recorded
  - MUST NOT observe: missing audit row · ambiguous dedupe state

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Boolean criterion | Maps to | Exact verify command |
|----|-------------------|----------|----------------------|
| TC-1 | Kill before commit preserves exactly one observable effect | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/queue-exactly-once.test.ts` |
| TC-2 | Kill after commit/before enqueue preserves exactly one observable effect | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/queue-exactly-once.test.ts --boundary=after-commit` |
| TC-3 | Kill after dispatch/before ack preserves exactly one observable effect | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/queue-exactly-once.test.ts --boundary=after-dispatch` |
| TC-4 | Audit output exposes outbox, inbox, and fencing metadata | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts queue:audit <key>` |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

| Path | Lines / section | Focus |
|------|------------------|-------|
| `/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/04-uc-plat.md` | 45-52 | UC-PLAT-03 queue + durable-effect acceptance criteria |
| `/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md` | 33-37 | outbox/inbox contract and fencing metadata |
| `/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/04-api-design.md` | 40-44 | idempotency, dedup, and final reconciliation contract |

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

**WRITE-ALLOWED**

- services/platform/src/**
- services/platform/tests/integration/**
- tests/integration/service/**

**WRITE-PROHIBITED**

- .spec/**
- .tmp/**
- any shortcut that degrades exactly-once semantics to at-least-once without audit
- Any file not explicitly listed as write-allowed

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

**Reference:** services/platform/src/db/evidence/seed.ts:56-180 + services/platform/src/db/evidence/revise.ts:1-119 + services/platform/src/inference/embed-run.ts:74-140

**Source:** /Users/inference1/Projects/holocron/services/platform/src/db/evidence/seed.ts:56-180; /Users/inference1/Projects/holocron/services/platform/src/db/evidence/revise.ts:1-119; /Users/inference1/Projects/holocron/services/platform/src/inference/embed-run.ts:74-140

**Anti-pattern:** Writing the side effect in one transaction and the dedupe/audit row in another, or treating lease acquisition as exactly once.

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

- References: None — backend task
- Pattern: none — backend task
- Pattern source: N/A
- Notes: No design artifact; durability contract only.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS
--------------------------------------------------------------------------------

- Keep the effect writes atomic and replay-safe.
- Expose the fencing token and dedupe rows in the audit command.
- Make every boundary-case replay easy to seed and inspect against real Postgres.

For each AC, follow RED → GREEN → REFACTOR when TDD_MODE is not skipped. The orchestrator independently verifies RED failure and GREEN success. Do not write implementation during RED.

--------------------------------------------------------------------------------
ORCHESTRATOR VERIFICATION PROTOCOL
--------------------------------------------------------------------------------

- pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}
- pnpm tsgo --noEmit
- pnpm test
- PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/queue-exactly-once.test.ts
- PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts queue:audit <key>

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

Every AC must have the exact command in its evidence gate. Primary AC: AC-1.

- AC-1: `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/queue-exactly-once.test.ts`
- AC-2: `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts queue:audit <key>`

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

- Name: mastra-implementer
- Rationale: Owns the atomic effect contract and the fenced consumer that makes it auditable.
- Pairing: Pair with red-test-generator on the kill-9 fixtures and with mastra-reviewer on the audit trail wording.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

### AC-1

- Artifact: `db_query`
- `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/queue-exactly-once.test.ts`

### AC-2

- Artifact: `stdout`
- `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts queue:audit <key>`

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

- Each replay boundary leaves exactly one side effect and one dedupe record.
- The audit command exposes outbox, inbox, and fencing metadata for the same key.
- No duplicate, partial, or silent-drop case remains unaccounted for.

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

- Depends on: queue-1, queue-4
- Blocks: queue-3, queue-5
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
  "task_id": "queue-2",
  "tdd_mode": "shared",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded_durable_effect": {
      "description": "A single seeded job key whose side effect is intentionally replay-safe on real Postgres.",
      "seed_method": "public_api",
      "records": [
        "seeded effect key=effect-kill9-1",
        "domain payload {n:1}",
        "outbox row pending",
        "inbox dedupe empty at start",
        "fencing token column present"
      ]
    },
    "queue_audit_key": {
      "description": "Stable key for queue:audit output and replay checks.",
      "seed_method": "cli",
      "records": [
        "audit key=effect-kill9-1",
        "outbox entry expected count 1",
        "inbox outcome expected count 1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a seeded durable-effect job exists with a stable idempotency key WHEN the worker is SIGKILLed at commit, dispatch, and ack boundaries and then replayed THEN exactly one observable side effect and one auditable outbox/inbox dedupe record remain, never zero and never two",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/queue-exactly-once.test.ts",
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
            "disconnect loses the committed effect",
            "stub always returns success without rows",
            "empty effect table accepted as exactly-once",
            "mock dedupe without inbox row",
            "static hardcoded effect_count=1"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_durable_effect",
            "action": {
              "actor": "worker",
              "steps": [
                "enqueue seeded effect",
                "kill -9 before commit",
                "re-run same key"
              ]
            },
            "end_state": {
              "must_observe": [
                "`effect_count === 1`",
                "`outbox_count === 1`",
                "`inbox_dedupe_count === 1`",
                "`fence_token` is non-empty"
              ],
              "must_not_observe": [
                "`effect_count === 0`",
                "`effect_count === 2`",
                "empty outbox"
              ]
            }
          },
          {
            "start_ref": "seeded_durable_effect",
            "action": {
              "actor": "worker",
              "steps": [
                "enqueue seeded effect",
                "kill -9 after commit before enqueue",
                "re-run same key"
              ]
            },
            "end_state": {
              "must_observe": [
                "`effect_count === 1`",
                "`outbox_count === 1`",
                "`inbox_dedupe_count === 1`",
                "`fence_token` is non-empty"
              ],
              "must_not_observe": [
                "`effect_count === 0`",
                "`effect_count === 2`",
                "empty outbox"
              ]
            }
          },
          {
            "start_ref": "seeded_durable_effect",
            "action": {
              "actor": "worker",
              "steps": [
                "enqueue seeded effect",
                "kill -9 after dispatch before ack",
                "re-run same key"
              ]
            },
            "end_state": {
              "must_observe": [
                "`effect_count === 1`",
                "`outbox_count === 1`",
                "`inbox_dedupe_count === 1`",
                "`fence_token` is non-empty"
              ],
              "must_not_observe": [
                "`effect_count === 0`",
                "`effect_count === 2`",
                "empty outbox"
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
      "description": "GIVEN the same seeded key is available for audit after replay WHEN the operator runs the audit command THEN one outbox entry, one inbox dedupe outcome, and the fencing token are all visible",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts queue:audit <key>",
      "maps_to_ac": null,
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres",
        "negative_control": {
          "would_fail_if": [
            "disconnect omits audit rows",
            "stub fabricates audit without DB",
            "empty audit accepted",
            "mock fence_token constant",
            "static hardcoded one-entry report"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_durable_effect",
            "action": {
              "actor": "operator",
              "steps": [
                "run holo queue:audit <key>"
              ]
            },
            "end_state": {
              "must_observe": [
                "`outbox_count === 1`",
                "`inbox_dedupe_count === 1`",
                "`fence_token` is non-empty",
                "`holo queue:audit` prints key=effect-kill9-1"
              ],
              "must_not_observe": [
                "`outbox_count === 0`",
                "`inbox_dedupe_count === 0`",
                "empty audit output"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Kill before commit preserves exactly one observable effect",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/queue-exactly-once.test.ts",
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
      "description": "Kill after commit/before enqueue preserves exactly one observable effect",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/queue-exactly-once.test.ts --boundary=after-commit",
      "maps_to_ac": "AC-1",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Kill after dispatch/before ack preserves exactly one observable effect",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test pnpm vitest run tests/integration/service/queue-exactly-once.test.ts --boundary=after-dispatch",
      "maps_to_ac": "AC-1",
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Audit output exposes outbox, inbox, and fencing metadata",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts queue:audit <key>",
      "maps_to_ac": "AC-2",
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
