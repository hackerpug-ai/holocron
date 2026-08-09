# S31-OPS-05: Make ci-fast green and ci-integration schedulable

> **Task ID:** S31-OPS-05
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** OPS · **Priority:** P0 · **Effort:** S · **Estimate:** 50 min
> **PROPOSED-BY:** `devops-engineer`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog

**Capabilities:** CAP-INF-01 (gate substrate), UC-PLAT-04
**PRD refs:** UC-PLAT-04 · R27 (full blind-spot rewrite deferred until this lands stable)

## What this does

Brings `.github/workflows/ci-fast.yml` to a reliable green on main and makes `ci-integration.yml` schedulable (workflow_dispatch and/or schedule) on the self-hosted holocron runner without fork execution, so Sprint 31 gates have a lane that can fail closed.

## Why

R27 records CI blind spots, but promotion of the larger rewrite waits until ci-fast is green and ci-integration is schedulable and stable for one sprint. Without a green fast lane and a runnable integration lane, verifier teeth and PLATFORM_IT proofs cannot be enforced in CI.

## How to verify

- `gh workflow run ci-fast.yml` (or push) completes quality job green on this branch once fixes land.
- `ci-integration.yml` contains `workflow_dispatch:` and/or `schedule:`; fork-safety job still fails closed for forks.
- `pnpm typecheck && pnpm lint && pnpm test:unit` exit 0 locally matching the workflow.

## Scope

Workflow YAML + the minimal product/test fixes required to make the existing ci-fast commands green. Does not implement the full zero-orphan lane guard rewrite (R27 deferred work).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-OPS-05 - ci-fast green + ci-integration schedulable
================================================================================

TASK_TYPE:  OPS
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S
AGENT:      implementer=devops-engineer | reviewer=devops-engineer
PROPOSED-BY: devops-engineer
ESTIMATE:   50 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-INF-01
PRD_REFS:   UC-PLAT-04 · R27

RUNTIME_COMMANDS:
  test:      pnpm test:unit
  typecheck: pnpm typecheck
  lint:      pnpm lint

PROGRESS: 0/4 ACs complete

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------

ci-fast is green on the fixed tree and ci-integration can be dispatched on self-hosted runners safely.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- NEVER remove fork-safety fail-closed from ci-integration.
- NEVER disable typecheck/lint to force green.
- NEVER expand scope into full orphan-file lane rewrite (R27 deferred).
- NEVER put secrets in workflow files.
- NEVER mark ci-integration green via skip of PLATFORM_IT-required suites without a non-zero fail (align with R36 spirit).

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] pnpm typecheck, lint, test:unit exit 0 — AC-1 (PRIMARY)
- [ ] ci-fast.yml still runs those three on push/PR — AC-2
- [ ] ci-integration.yml has workflow_dispatch and/or schedule — AC-3
- [ ] fork-safety job still exits 1 for fork PRs — AC-4

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

AC-1: Local ci-fast commands green [PRIMARY]
  GIVEN: clean install at task branch tip
  WHEN:  pnpm typecheck && pnpm lint && pnpm test:unit
  THEN:  all three exit 0

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-05-ci-lanes.test.ts
  TEST_FUNCTION: localCiFastCommandsExitZero

  SCENARIO:
    START_REF:        repo_head
    NEGATIVE_CONTROL: would fail if typecheck error ignored | --passWithNoTests hiding empty suite as only success without units existing
    EVIDENCE:         stdout
    CASES:
      - ACTION: run the three commands as subprocesses
        MUST_OBSERVE: typecheck exit 0 · lint exit 0 · test:unit exit 0
        MUST_NOT_OBSERVE: non-zero typecheck · lint errors unfixed · test:unit crash

AC-2: ci-fast workflow invokes the three commands
  GIVEN: .github/workflows/ci-fast.yml
  WHEN:  parsed
  THEN:  steps include pnpm typecheck, pnpm lint, and unit test script

  TEST_TIER:             unit
  unit_test_justified: static workflow YAML assertion
  VERIFICATION_SERVICE:  filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-05-ci-lanes.test.ts
  TEST_FUNCTION: ciFastWorkflowHasQualitySteps

AC-3: ci-integration is schedulable
  GIVEN: .github/workflows/ci-integration.yml
  WHEN:  parsed for on:
  THEN:  workflow_dispatch and/or schedule present in addition to pull_request

  TEST_TIER:             unit
  unit_test_justified: static workflow YAML assertion
  VERIFICATION_SERVICE:  filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-05-ci-lanes.test.ts
  TEST_FUNCTION: ciIntegrationSchedulable

AC-4: Fork safety remains fail-closed
  GIVEN: ci-integration.yml fork-safety job
  WHEN:  inspected
  THEN:  fork PRs take a job that exits 1 with fail-closed message

  TEST_TIER:             unit
  unit_test_justified: static workflow YAML assertion
  VERIFICATION_SERVICE:  filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-05-ci-lanes.test.ts
  TEST_FUNCTION: forkSafetyFailClosed

--------------------------------------------------------------------------------
FIXTURES
--------------------------------------------------------------------------------

repo_head — task branch worktree

--------------------------------------------------------------------------------
SCOPE
--------------------------------------------------------------------------------

writeAllowed:
- .github/workflows/ci-fast.yml (MODIFY)
- .github/workflows/ci-integration.yml (MODIFY — schedule/dispatch only + keep fork safety)
- Minimal product/test files required to clear typecheck/lint/unit failures (MODIFY — list in PR)
- services/platform/tests/integration/sprint31-ops-05-ci-lanes.test.ts (NEW)
- package.json scripts only if unit script path broken (MODIFY)

writeProhibited:
- Full R27 orphan-file lane rewrite
- Removing PLATFORM_IT requirements from integration proofs
- Disabling actionlint

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. .github/workflows/ci-fast.yml
2. .github/workflows/ci-integration.yml
3. 08-technical-risks.md R27
4. docs/ci/ if present
5. package.json test:unit / typecheck scripts

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Adding bun:test lane and zero-orphan guard (R27 promotion)
- Maestro / RN e2e in CI
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-OPS-05",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "repo_head": {
      "description": "Task branch worktree with workflows",
      "seed_method": "public_api",
      "records": [
        "ci-fast.yml present",
        "ci-integration.yml present"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "Local ci-fast commands green",
      "verify": "pnpm typecheck && pnpm lint && pnpm test:unit",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "typecheck error ignored",
          "lint skipped",
          "unit crash ignored"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "repo_head",
          "action": {
            "actor": "cli_user",
            "steps": [
              "run pnpm typecheck",
              "run pnpm lint",
              "run pnpm test:unit"
            ]
          },
          "end_state": {
            "must_observe": [
              "typecheck exit 0",
              "lint exit 0",
              "test:unit exit 0"
            ],
            "must_not_observe": [
              "non-zero typecheck",
              "lint errors left unfixed",
              "test:unit crash"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "ci-fast workflow invokes the three commands",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-05-ci-lanes.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "empty fixture",
          "mock-only harness",
          "hardcoded pass",
          "skip under PLATFORM_IT=1"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "repo_head",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-2",
              "Assert prose AC: ci-fast workflow invokes the three commands"
            ]
          },
          "end_state": {
            "must_observe": [
              "ci-fast workflow invokes the three commands"
            ],
            "must_not_observe": [
              "verify command skipped",
              "PRIMARY without real dependency"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "ci-integration is schedulable",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-05-ci-lanes.test.ts",
      "tier": "visible",
      "test_tier": "unit",
      "verification_service": "filesystem",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "no workflow_dispatch",
          "no schedule",
          "pull_request only"
        ]
      },
      "evidence": {
        "artifact_type": "file_artifact",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "repo_head",
          "action": {
            "actor": "cli_user",
            "steps": [
              "parse ci-integration.yml on: triggers"
            ]
          },
          "end_state": {
            "must_observe": [
              "workflow_dispatch or schedule present",
              "fork-safety fail-closed job remains"
            ],
            "must_not_observe": [
              "fork PRs allowed on self-hosted without check",
              "only pull_request with no dispatch/schedule"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "Fork safety remains fail-closed",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-05-ci-lanes.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "empty fixture",
          "mock-only harness",
          "hardcoded pass",
          "skip under PLATFORM_IT=1"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "repo_head",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-4",
              "Assert prose AC: Fork safety remains fail-closed"
            ]
          },
          "end_state": {
            "must_observe": [
              "Fork safety remains fail-closed"
            ],
            "must_not_observe": [
              "verify command skipped",
              "PRIMARY without real dependency"
            ]
          }
        }
      ]
    }
  ]
}
-->

</details>

---

**Report to:** team-lead once ci-fast is green and integration is dispatchable.
