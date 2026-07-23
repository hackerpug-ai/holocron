# S-REWRITE-05: `holo verify:no-convex-client` gate (grep-verified, wired to CI)
> Status: Backlog

- **Sprint:** [Sprint 24: Full RN App Rewrite off Convex onto Zero](./SPRINT.md)
- **Task Type:** `INFRA`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `S`
- **Estimate:** `90 minutes`
- **Agent:** `red-test-generator`
- **Reviewer:** `mastra-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `skipped`
- **RED/GREEN Required:** `no`

## Outcome
Ship an un-fakeable `holo verify:no-convex-client` operator command that greps app/components/hooks/screens for convex/react imports, fails closed on any hit, and is wired into CI.

## Background
Ship an un-fakeable `holo verify:no-convex-client` operator command that greps app/components/hooks/screens for convex/react imports, fails closed on any hit, and is wired into CI. This is Sprint 24 (UC-SYNC-01; UC-SYNC-01, T-SYNC-001). The Zero provider, `app/zero/schema.ts`, and `app/zero/queries.ts` already exist from Sprint 20; the approved call-site→target mapping lives in `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml` from Sprint 21. This sprint *rewires existing surfaces in place* — it does not create new screens.

## Specification
- **Objective:** Ship an un-fakeable `holo verify:no-convex-client` operator command that greps app/components/hooks/screens for convex/react imports, fails closed on any hit, and is wired into CI.
- **Success state:** The gate exits 0 on a clean tree, exits non-zero naming the offending file on a stray import, and runs on every PR touching app/ so a regression can't merge.

## Critical Constraints
### MUST
- MUST scan `app/`, `components/`, `hooks/`, `screens/` for `convex/react` imports and fail closed (non-zero) on any hit, naming the offending `file:line`
- MUST wire `holo verify:no-convex-client` into CI as a required check on PRs touching `app/`
### NEVER
- NEVER exit 0 when a stray `convex/react` import is present (un-fakeable)
- NEVER mock the scanner or skip roots
### STRICTLY
- STRICTLY prove the gate fails closed by seeding a stray `import … from 'convex/react'` line and asserting non-zero exit + `file:line`

## Capability Chain
- **Touches:** CAP-CUT-01

## Acceptance Criteria
### AC-1: Gate scans the approved roots for convex/react imports [PRIMARY]
- **GIVEN:** the command exists
- **WHEN:** the operator runs `holo verify:no-convex-client`
- **THEN:** it scans app/, components/, hooks/, screens/ for `convex/react` imports and reports the roots covered
- **Test tier:** `integration`
- **Verification service:** `holo CLI`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `holo verify:no-convex-client --print-roots`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `holo CLI`
  - **Negative control — would fail if:
    - stub — command not implemented
    - disconnect — scanner not wired
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `clean-app-roots`:
    - actor: `cli_user`
    - step: run `holo verify:no-convex-client`
    - MUST observe:
      - command reports `4` scanned roots (app, components, hooks, screens)
      - exit code `0` on a clean tree
    - MUST NOT observe:
      - a silent no-op command (`0` roots reported)
      - empty help text
### AC-2: Gate fails closed on any convex/react hit [PRIMARY]
- **GIVEN:** a stray `from 'convex/react'` import is present in a scanned root
- **WHEN:** the operator runs the gate
- **THEN:** it exits non-zero naming the offending file and line
- **Test tier:** `integration`
- **Verification service:** `holo CLI`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `services/platform/src/cli/commands/__tests__/verify-no-convex-client.test.ts (seed a stray import, assert non-zero exit + file:line)`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `holo CLI`
  - **Negative control — would fail if:
    - stub — scanner returns 0 regardless
    - static — gate always exits 0
    - mock — scanner mocked
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `app-with-stray-import`:
    - actor: `cli_user`
    - step: inject one `import { useQuery } from 'convex/react'` line into a scanned root
    - step: run `holo verify:no-convex-client`
    - MUST observe:
      - exit code `1` (non-zero)
      - output names the offending `file:line`
    - MUST NOT observe:
      - exit code `0` (gate passed a stray import — un-fakeable failure)
      - a generic error with `0` file:line detail
### AC-3: Gate wired into CI [PRIMARY]
- **GIVEN:** a PR touches app/
- **WHEN:** CI runs the gate
- **THEN:** the gate runs as a required check on PRs touching app/ and blocks merge on failure
- **Test tier:** `integration`
- **Verification service:** `GitHub Actions`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `actionlint .github/workflows/*.yml && grep -R "verify:no-convex-client" .github/workflows/`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `GitHub Actions`
  - **Negative control — would fail if:
    - stub — step not added
    - disconnect — workflow not wired
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `clean-app-roots`:
    - actor: `background_job`
    - step: open a PR touching app/
    - step: observe the CI workflow
    - MUST observe:
      - the workflow has a `verify:no-convex-client` step
      - the step is a `required` gating check
    - MUST NOT observe:
      - the gate absent from the workflow (`0` steps)
      - a non-blocking step
## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Gate scans the approved roots and reports them | AC-1 | `holo verify:no-convex-client --print-roots` |
| TC-2 | Gate fails closed on a seeded stray import | AC-2 | `services/platform/src/cli/commands/__tests__/verify-no-convex-client.test.ts (seed a stray import, assert non-zero exit + file:line)` |
| TC-3 | Gate wired as a required CI check on app/ PRs | AC-3 | `actionlint .github/workflows/*.yml && grep -R "verify:no-convex-client" .github/workflows/` |

## Reading List
- `RULES.md` (RN conventions: react-native-paper `Text`, semantic theme tokens, `testID`, `ScreenLayout` for `(drawer)/`)
- `.spec/prds/mk6-migration/08-uc-sync.md` — UC-SYNC-01 (the contract every cluster serves)
- `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml` — the approved call-site→target mapping this task executes
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — T-SYNC-001/002/004/019 rows
- `app/zero/schema.ts`, `app/zero/queries.ts` — the Zero seam + existing queries/mutators to reuse
- `services/platform/src/cli/holo.ts` (MODIFY)

## Guardrails
**Write allowed:**
- `services/platform/src/cli/holo.ts (MODIFY)`
- `services/platform/src/cli/commands/verify-no-convex-client.ts (NEW)`
- `services/platform/src/cli/commands/__tests__/verify-no-convex-client.test.ts (NEW)`
**Write prohibited:**
- A gate that exits 0 on a stray `convex/react` import
- A mocked/non-scanning verifier
- A non-required CI step

## Design
**References:**
- `./SPRINT.md`; `.spec/prds/mk6-migration/08-uc-sync.md`; `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml`
**Interaction notes:**
- Preserve existing theme/a11y/`ScreenLayout` — NO visual redesign; this is a data-plane rewiring (Convex→Zero).
- Reuse the Zero hooks already proven in the Sprint 20 cold-boot vertical; do not introduce a parallel data layer.
**Pattern:** Zero reactive `useQuery` for reads + Zero mutator / Hono command for writes, bound to `app/zero/{schema,queries}.ts`.
**Pattern source:** `app/zero/queries.ts`, `app/_layout.tsx` (Zero provider, Sprint 20).
**Anti-pattern:** seeding list data by injecting rows into the view; a per-variant sibling screen file; leaving a `convex/react` import on the path.

## Verification Gates
- **TC-1** — `Gate scans the approved roots and reports them`
  - command: `holo verify:no-convex-client --print-roots`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-2** — `Gate fails closed on a seeded stray import`
  - command: `services/platform/src/cli/commands/__tests__/verify-no-convex-client.test.ts (seed a stray import, assert non-zero exit + file:line)`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-3** — `Gate wired as a required CI check on app/ PRs`
  - command: `actionlint .github/workflows/*.yml && grep -R "verify:no-convex-client" .github/workflows/`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **Type check clean** — `pnpm tsc --noEmit` → Exit 0
- **Lint pass** — `pnpm lint` → Exit 0
- **Scenario fakeability** — `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REWRITE-05.json` → Exit 0

## Agent Assignment
- **Agent:** `red-test-generator` — owns the React Native state/network layer this cluster rewrites
- **Reviewer:** `mastra-reviewer` — adversarial theme/a11y/contract + Zero-wiring review

## Evidence Gates
- RED-against-start for every behavioral AC (tdd_mode `skipped`): `False`
- Real-services (seeded Postgres + Zero, Maestro e2e) proof required: `True`
- Fakeability: `validate_scenario.py` exit 0 on every behavioral AC (independently re-verified)

## Review Criteria
- Every read in the cluster comes from a Zero `useQuery`; every write from a Zero mutator or Hono command — zero `convex/react` on the path
- Theme tokens / a11y / `ScreenLayout` preserved (no hardcoded values, no new screen files)
- Each call-site matches its approved target in `13-client-data-contract.yaml`
- Every behavioral AC's scenario passes `validate_scenario.py` with zero CRITICAL/HIGH

## Dependencies
- **Depends on:** S-REWRITE-01, S-REWRITE-02, S-REWRITE-03, S-REWRITE-04
- **Blocks:** S-REWRITE-06

## Coding Standards
- `RULES.md` — RN conventions (react-native-paper `Text`, semantic theme, `testID`, `ScreenLayout`)
- `brain/docs/kanban/TASK-TEMPLATE.md`; `brain/docs/TDD-METHODOLOGY.md`

## Notes
- Generated by /kb-sprint-tasks-plan on 2026-07-23. Proposed by `react-native-ui-planner`; consolidated by the orchestrator (schema normalization + scenario rendering + stable AC-N/TC-N ID assignment). `validate_scenario.py` exit 0 on this task's contract.
- PRD refs: UC-SYNC-01, T-SYNC-001.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-REWRITE-05",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "clean-app-roots": {
      "description": "All target roots (app/, components/, hooks/, screens/) free of convex/react imports after rewrites",
      "seed_method": "public_api",
      "records": [
        "grep for `convex/react` across app/components/hooks/screens returns 0 hits"
      ]
    },
    "app-with-stray-import": {
      "description": "A clone of the app roots with one deliberately injected `from 'convex/react'` import line (negative control)",
      "seed_method": "public_api",
      "records": [
        "exactly 1 `convex/react` import line present in a scanned root"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN: the command exists WHEN: the operator runs `holo verify:no-convex-client` THEN: it scans app/, components/, hooks/, screens/ for `convex/react` imports and reports the roots covered",
      "verify": "holo verify:no-convex-client --print-roots",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 command not implemented",
            "disconnect \u2014 scanner not wired"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "clean-app-roots",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo verify:no-convex-client`"
              ]
            },
            "end_state": {
              "must_observe": [
                "command reports `4` scanned roots (app, components, hooks, screens)",
                "exit code `0` on a clean tree"
              ],
              "must_not_observe": [
                "a silent no-op command (`0` roots reported)",
                "empty help text"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN: a stray `from 'convex/react'` import is present in a scanned root WHEN: the operator runs the gate THEN: it exits non-zero naming the offending file and line",
      "verify": "services/platform/src/cli/commands/__tests__/verify-no-convex-client.test.ts (seed a stray import, assert non-zero exit + file:line)",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 scanner returns 0 regardless",
            "static \u2014 gate always exits 0",
            "mock \u2014 scanner mocked"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "app-with-stray-import",
            "action": {
              "actor": "cli_user",
              "steps": [
                "inject one `import { useQuery } from 'convex/react'` line into a scanned root",
                "run `holo verify:no-convex-client`"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code `1` (non-zero)",
                "output names the offending `file:line`"
              ],
              "must_not_observe": [
                "exit code `0` (gate passed a stray import \u2014 un-fakeable failure)",
                "a generic error with `0` file:line detail"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN: a PR touches app/ WHEN: CI runs the gate THEN: the gate runs as a required check on PRs touching app/ and blocks merge on failure",
      "verify": "actionlint .github/workflows/*.yml && grep -R \"verify:no-convex-client\" .github/workflows/",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "GitHub Actions",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 step not added",
            "disconnect \u2014 workflow not wired"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "clean-app-roots",
            "action": {
              "actor": "background_job",
              "steps": [
                "open a PR touching app/",
                "observe the CI workflow"
              ]
            },
            "end_state": {
              "must_observe": [
                "the workflow has a `verify:no-convex-client` step",
                "the step is a `required` gating check"
              ],
              "must_not_observe": [
                "the gate absent from the workflow (`0` steps)",
                "a non-blocking step"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Gate scans the approved roots and reports them",
      "verify": "holo verify:no-convex-client --print-roots",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Gate fails closed on a seeded stray import",
      "verify": "services/platform/src/cli/commands/__tests__/verify-no-convex-client.test.ts (seed a stray import, assert non-zero exit + file:line)",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Gate wired as a required CI check on app/ PRs",
      "verify": "actionlint .github/workflows/*.yml && grep -R \"verify:no-convex-client\" .github/workflows/",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
