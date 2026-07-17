# queue-5 — Review durable-effect contract
> Status: Backlog
> Sprint: [Sprint 11 — Scheduler and Durable Queue](./SPRINT.md)
> Agent: mastra-reviewer
> Estimate: 90 minutes
> Type: CHORE
> Proposed By: mastra-planner
> TDD_MODE: skipped
> RED_GREEN_REQUIRED: no

## What this does

The reviewer can trace the durable queue behavior from PRD → code → tests → live evidence and sign off without unresolved contract gaps.

## Why

This is the final human review pass. It ties the implemented queue, outbox/inbox, and migration work back to the PRD, runtime contract, and human gate, and it should only go green when the evidence bundle is complete.

## How to verify

- `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}`
- `pnpm tsgo --noEmit`
- `pnpm test`

## Scope

Writes: services/platform/src/** · services/platform/tests/** · tests/integration/service/**

Prohibited: .spec/** · .tmp/** · any implementation changes during the review pass

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: queue-5 — Review durable-effect contract
================================================================================

TASK_TYPE: CHORE
STATUS: Backlog
PRIORITY: P0
EFFORT: M (90 minutes)
AGENT: implementer=mastra-reviewer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE: skipped
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

The reviewer can trace the durable queue behavior from PRD → code → tests → live evidence and sign off without unresolved contract gaps.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- MUST review the live evidence bundle and the final code paths; NEVER sign off from a stubbed or inferred state.
- MUST confirm the exact lint, typecheck, test, jobs:list, jobs:run-all, and queue:audit commands are present and match the captured outputs; STRICTLY reject stale artifacts.
- NEVER alter implementation behavior in this pass; keep it evidence-only and sign off only on the contract review.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1: the durable-effect contract is signed off with no unresolved gaps between PRD, runtime contract, code, and evidence [PRIMARY]
- [ ] `pnpm tsgo --noEmit` is clean and the exact verification gates below pass
- [ ] Only SCOPE.writeAllowed files are modified

--------------------------------------------------------------------------------
BACKGROUND
--------------------------------------------------------------------------------

This is the final human review pass. It ties the implemented queue, outbox/inbox, and migration work back to the PRD, runtime contract, and human gate, and it should only go green when the evidence bundle is complete.

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

**Objective:** Perform the final durable-effect contract review and gate the sprint for human signoff.

**Success state:** The reviewer can trace the durable queue behavior from PRD → code → tests → live evidence and sign off without unresolved contract gaps.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

Each AC is a requirement with a stable ID. Behavioral ACs carry a real seeded scenario.

### AC-1 — PRIMARY

**GIVEN:** the queue implementation, red tests, and live evidence all exist in the repo

**WHEN:** the reviewer runs the canonical verification bundle and inspects the queue code paths

**THEN:** the durable-effect contract is signed off with no unresolved gaps between PRD, runtime contract, code, and evidence

- **Test tier:** `integration`
- **Verification service:** null
- **Unit-test justification:** Not applicable
- **Flow ref:** `UC-PLAT-03`
- **TDD state:** `none`
- **Verify:** `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files} && pnpm tsgo --noEmit && pnpm test && PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:list && PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts queue:audit <key>`

**Scenario**

**Start ref:** `review_evidence_bundle` (fixture defined below)
**Negative control:** would fail if disconnect, stub, empty, mock, static
**Evidence:** file_artifact (capture required: yes)
- Case 1 — actor: operator; action: run pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files} → run pnpm tsgo --noEmit → run pnpm test → inspect jobs:list and queue:audit outputs
  - MUST observe: all evidence captures present · no stale scheduler placeholder in the reviewed surfaces
  - MUST NOT observe: mock-only proof · missing audit evidence

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Boolean criterion | Maps to | Exact verify command |
|----|-------------------|----------|----------------------|
| TC-1 | Review signoff requires the full verification bundle and live evidence | AC-1 | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files} && pnpm tsgo --noEmit && pnpm test && PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:list && PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts queue:audit <key>` |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

| Path | Lines / section | Focus |
|------|------------------|-------|
| `/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/04-uc-plat.md` | 45-52 | UC-PLAT-03 queue contract and human gate |
| `/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md` | 33-37 | exactly-once observable effects and fencing requirements |
| `/Users/inference1/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md` | 29-34 | e2e/integration criteria that feed the sprint gate |
| `/Users/inference1/Projects/holocron/services/platform/src/cli/holo.ts` | 136-167 | command surface used in the review evidence bundle |

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

**WRITE-ALLOWED**

- services/platform/src/**
- services/platform/tests/**
- tests/integration/service/**

**WRITE-PROHIBITED**

- .spec/**
- .tmp/**
- any implementation changes during the review pass
- Any file not explicitly listed as write-allowed

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

**Reference:** services/platform/src/cli/__tests__/stack-supervisor.test.ts:78-124 + services/platform/src/cli/__tests__/launchd-and-embed-health.test.ts:72-95 + services/platform/src/cli/holo.ts:136-167

**Source:** /Users/inference1/Projects/holocron/services/platform/src/cli/__tests__/stack-supervisor.test.ts:78-124; /Users/inference1/Projects/holocron/services/platform/src/cli/__tests__/launchd-and-embed-health.test.ts:72-95; /Users/inference1/Projects/holocron/services/platform/src/cli/holo.ts:136-167

**Anti-pattern:** Approval without recorded command output, or a review that ignores the scheduler placeholder and queue-audit evidence.

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

- References: None — backend task
- Pattern: none — backend task
- Pattern source: N/A
- Notes: No design artifact; this is the final evidence-and-contract review.

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS
--------------------------------------------------------------------------------

- Read the evidence bundle end-to-end before sign-off.
- Reject any stale scheduler-placeholder or mock-only queue proof.
- Sign off only if the live commands and the code paths tell the same story.

For each AC, follow RED → GREEN → REFACTOR when TDD_MODE is not skipped. The orchestrator independently verifies RED failure and GREEN success. Do not write implementation during RED.

--------------------------------------------------------------------------------
ORCHESTRATOR VERIFICATION PROTOCOL
--------------------------------------------------------------------------------

- pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}
- pnpm tsgo --noEmit
- pnpm test
- PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:list
- PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts queue:audit <key>
- PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:run-all

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

Every AC must have the exact command in its evidence gate. Primary AC: AC-1.

- AC-1: `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files} && pnpm tsgo --noEmit && pnpm test && PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:list && PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts queue:audit <key>`

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

- Name: mastra-reviewer
- Rationale: Owns the final contract review and sign-off bundle.
- Pairing: Pair with mastra-implementer for the evidence source of truth and with red-test-generator for the failure matrix.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

### AC-1

- Artifact: `stdout`
- `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}`
- `pnpm tsgo --noEmit`
- `pnpm test`
- `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:list`
- `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts queue:audit <key>`

--------------------------------------------------------------------------------
REVIEW CRITERIA
--------------------------------------------------------------------------------

- The evidence bundle is complete and matches the PRD/runtime contract.
- No scheduler-placeholder or mock-only proof remains in the reviewed surfaces.
- The durable-effect contract is traceable from code to CLI output to live service evidence.

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

- Depends on: queue-1, queue-2, queue-3, queue-4
- Blocks: None
- Parallel: None

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

Review only; do not change implementation behavior in this task.

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1
--------------------------------------------------------------------------------

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "queue-5",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "review_evidence_bundle": {
      "description": "Captured lint/type/test/job/audit outputs for the final sign-off pass.",
      "seed_method": "cli",
      "records": [
        "biome output",
        "tsgo output",
        "test output",
        "jobs:list output",
        "queue:audit output"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the queue implementation, red tests, and live evidence all exist in the repo WHEN the reviewer runs the canonical verification bundle and inspects the queue code paths THEN the durable-effect contract is signed off with no unresolved gaps between PRD, runtime contract, code, and evidence",
      "verify": "pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files} && pnpm tsgo --noEmit && pnpm test && PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:list && PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts queue:audit <key>",
      "maps_to_ac": null,
      "satisfied": null,
      "evidence": null,
      "remediation": null,
      "last_evaluated_cycle": null,
      "last_evaluated_commit": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": null,
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
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "review_evidence_bundle",
            "action": {
              "actor": "operator",
              "steps": [
                "run pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files}",
                "run pnpm tsgo --noEmit",
                "run pnpm test",
                "inspect jobs:list and queue:audit outputs"
              ]
            },
            "end_state": {
              "must_observe": [
                "all evidence captures present",
                "no stale scheduler placeholder in the reviewed surfaces"
              ],
              "must_not_observe": [
                "mock-only proof",
                "missing audit evidence"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Review signoff requires the full verification bundle and live evidence",
      "verify": "pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error {staged_files} && pnpm tsgo --noEmit && pnpm test && PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts jobs:list && PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test bun services/platform/src/cli/holo.ts queue:audit <key>",
      "maps_to_ac": "AC-1",
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
