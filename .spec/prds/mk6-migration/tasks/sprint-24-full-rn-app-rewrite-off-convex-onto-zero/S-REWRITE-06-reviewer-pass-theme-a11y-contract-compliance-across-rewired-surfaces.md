# S-REWRITE-06: Reviewer pass: theme/a11y/contract compliance across rewired surfaces
> Status: Backlog

- **Sprint:** [Sprint 24: Full RN App Rewrite off Convex onto Zero](./SPRINT.md)
- **Task Type:** `REVIEW`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `M`
- **Estimate:** `150 minutes`
- **Agent:** `react-native-ui-reviewer`
- **Reviewer:** `code-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `skipped`
- **RED/GREEN Required:** `no`

## Outcome
Adversarially review every rewired surface for theme-token compliance, accessibility, mobile patterns (ScreenLayout/touch targets), and client-data-contract compliance; write a review artifact with per-category PASS/FAIL + file:line findings.

## Background
Adversarially review every rewired surface for theme-token compliance, accessibility, mobile patterns (ScreenLayout/touch targets), and client-data-contract compliance; write a review artifact with per-category PASS/FAIL + file:line findings. This is Sprint 24 (UC-SYNC-01; UC-SYNC-01, T-SYNC-019). The Zero provider, `app/zero/schema.ts`, and `app/zero/queries.ts` already exist from Sprint 20; the approved call-site→target mapping lives in `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml` from Sprint 21. This sprint *rewires existing surfaces in place* — it does not create new screens.

## Specification
- **Objective:** Adversarially review every rewired surface for theme-token compliance, accessibility, mobile patterns (ScreenLayout/touch targets), and client-data-contract compliance; write a review artifact with per-category PASS/FAIL + file:line findings.
- **Success state:** A review artifact is written with PASS verdicts across theme/a11y/mobile-patterns/contract, `holo verify:client-contract` passes, and every FAIL has an actionable file:line:column finding.

## Critical Constraints
### MUST
- MUST produce a review artifact with per-category (theme / a11y / mobile-patterns / contract) `PASS`/`FAIL` verdicts and actionable `file:line:column` findings
- MUST run `holo verify:client-contract` and report the result
### NEVER
- NEVER modify source under `app/`/`components/`/`hooks/`/`screens/` — this is a review-only task
- NEVER rubber-stamp a category without running its grep/command
### STRICTLY
- STRICTLY every check is backed by a real grep/command output captured in the artifact

## Capability Chain
- **Touches:** N/A

## Acceptance Criteria
### AC-1: Theme-token compliance verified across all rewired surfaces [PRIMARY]
- **GIVEN:** all cluster files are rewired
- **WHEN:** the reviewer greps for hardcoded theme value
- **THEN:** zero hardcoded colors/spacing/typography remain; all use the semantic theme tokens
- **Test tier:** `review`
- **Verification service:** `static analysis`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `grep -rn '#[0-9a-fA-F]\{6\}' app/ components/ hooks/ screens/ --include='*.tsx' | grep -v 'theme\.' | wc -l  (expect 0)`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `static analysis`
  - **Negative control — would fail if:
    - stub — reviewer skips theme check
    - mock — grep mocked
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `rewired-cluster-files`:
    - actor: `cli_user`
    - step: grep app/components/hooks/screens for hardcoded hex colors and numeric spacing outside theme tokens
    - MUST observe:
      - `0` hardcoded `#RRGGBB` colors outside theme context
      - `0` hardcoded numeric `padding`/`margin`/`fontSize` outside tokens
      - all colors resolve to `theme.colors.*` tokens (`>=1` token reference per file)
    - MUST NOT observe:
      - a hardcoded `#RRGGBB` color (baseline is `0` such colors)
      - a numeric `padding: 16` outside `theme.spacing`
### AC-2: Accessibility + ScreenLayout compliance verified [PRIMARY]
- **GIVEN:** all (drawer)/ screens are rewired
- **WHEN:** the reviewer checks each (drawer)/ screen
- **THEN:** every (drawer)/ screen wraps content in ScreenLayout and interactive elements carry testID + a11y labels
- **Test tier:** `review`
- **Verification service:** `static analysis`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `test "$(grep -l 'ScreenLayout' app/\(drawer\)/*.tsx | wc -l)" -eq "$(find 'app/(drawer)/' -name '*.tsx' | wc -l)"`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `static analysis`
  - **Negative control — would fail if:
    - stub — reviewer skips a11y check
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `rewired-cluster-files`:
    - actor: `cli_user`
    - step: grep (drawer)/ screens for ScreenLayout usage and testID on interactive elements
    - MUST observe:
      - `100%` of `(drawer)/` screens wrap content in `ScreenLayout`
      - every interactive element has a `{screen}-{component}-{element}` `testID`
    - MUST NOT observe:
      - a `(drawer)/` screen rendering a bare View (`0` ScreenLayout)
      - an interactive element with no `testID`
### AC-3: Client-data-contract compliance verified [PRIMARY]
- **GIVEN:** all Zero queries/mutators are implemented
- **WHEN:** the reviewer runs `holo verify:client-contract`
- **THEN:** every legacy call site maps to its approved target with the declared offline/optimistic/conflict/rejection/identifier behavior
- **Test tier:** `review`
- **Verification service:** `holo verify:client-contract`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `holo verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `holo verify:client-contract`
  - **Negative control — would fail if:
    - stub — verifier skipped
    - disconnect — verifier not run
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `rewired-cluster-files`:
    - actor: `cli_user`
    - step: run `holo verify:client-contract` against the approved contract + inventory
    - MUST observe:
      - `holo verify:client-contract` exit `0`
      - `105/105` call sites mapped (`0` unmapped surfaces)
    - MUST NOT observe:
      - exit code `1` (an unmapped surface; expected `0` unmapped)
      - an unmapped call site in the output
### AC-4: Review artifact written with PASS/FAIL verdicts [PRIMARY]
- **GIVEN:** all checks are complete
- **WHEN:** the reviewer compiles findings
- **THEN:** a review artifact is written with theme/a11y/contract sections and per-category PASS/FAIL + file:line findings
- **Test tier:** `review`
- **Verification service:** `file artifact`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `test -f .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json && jq -e '.categories | length >= 3' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `file artifact`
  - **Negative control — would fail if:
    - stub — reviewer skips artifact creation
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `rewired-cluster-files`:
    - actor: `cli_user`
    - step: write the review artifact
    - step: assert the required sections and verdicts
    - MUST observe:
      - the artifact file exists with `>=3` category sections
      - each section has an explicit `PASS`/`FAIL` verdict
    - MUST NOT observe:
      - no artifact file (`0` sections)
      - a section with no verdict
## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Zero hardcoded theme values in cluster files | AC-1 | `grep -rn '#[0-9a-fA-F]\{6\}' app/ components/ hooks/ screens/ --include='*.tsx' | grep -v 'theme\.' | wc -l  (expect 0)` |
| TC-2 | All (drawer)/ screens use ScreenLayout | AC-2 | `test "$(grep -l 'ScreenLayout' app/\(drawer\)/*.tsx | wc -l)" -eq "$(find 'app/(drawer)/' -name '*.tsx' | wc -l)"` |
| TC-3 | Client contract passes with zero unmapped surfaces | AC-3 | `holo verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json` |
| TC-4 | Review artifact exists with PASS/FAIL verdicts | AC-4 | `test -f .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json && jq -e '.categories | length >= 3' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json` |

## Reading List
- `RULES.md` (RN conventions: react-native-paper `Text`, semantic theme tokens, `testID`, `ScreenLayout` for `(drawer)/`)
- `.spec/prds/mk6-migration/08-uc-sync.md` — UC-SYNC-01 (the contract every cluster serves)
- `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml` — the approved call-site→target mapping this task executes
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — T-SYNC-001/002/004/019 rows
- `app/zero/schema.ts`, `app/zero/queries.ts` — the Zero seam + existing queries/mutators to reuse

## Guardrails
**Write allowed:**
- `.spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json (NEW)`
**Write prohibited:**
- Any modify under `app/`/`components/`/`hooks/`/`screens/` (review-only)
- A PASS verdict with no command output backing it

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
- **TC-1** — `Zero hardcoded theme values in cluster files`
  - command: `grep -rn '#[0-9a-fA-F]\{6\}' app/ components/ hooks/ screens/ --include='*.tsx' | grep -v 'theme\.' | wc -l  (expect 0)`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-2** — `All (drawer)/ screens use ScreenLayout`
  - command: `test "$(grep -l 'ScreenLayout' app/\(drawer\)/*.tsx | wc -l)" -eq "$(find 'app/(drawer)/' -name '*.tsx' | wc -l)"`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-3** — `Client contract passes with zero unmapped surfaces`
  - command: `holo verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-4** — `Review artifact exists with PASS/FAIL verdicts`
  - command: `test -f .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json && jq -e '.categories | length >= 3' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **Type check clean** — `pnpm tsc --noEmit` → Exit 0
- **Lint pass** — `pnpm lint` → Exit 0
- **Scenario fakeability** — `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REWRITE-06.json` → Exit 0

## Agent Assignment
- **Agent:** `react-native-ui-reviewer` — owns the React Native state/network layer this cluster rewrites
- **Reviewer:** `code-reviewer` — adversarial theme/a11y/contract + Zero-wiring review

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
- **Depends on:** S-REWRITE-01, S-REWRITE-02, S-REWRITE-03, S-REWRITE-04, S-REWRITE-05
- **Blocks:** none

## Coding Standards
- `RULES.md` — RN conventions (react-native-paper `Text`, semantic theme, `testID`, `ScreenLayout`)
- `brain/docs/kanban/TASK-TEMPLATE.md`; `brain/docs/TDD-METHODOLOGY.md`

## Notes
- Generated by /kb-sprint-tasks-plan on 2026-07-23. Proposed by `react-native-ui-planner`; consolidated by the orchestrator (schema normalization + scenario rendering + stable AC-N/TC-N ID assignment). `validate_scenario.py` exit 0 on this task's contract.
- PRD refs: UC-SYNC-01, T-SYNC-019.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-REWRITE-06",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "rewired-cluster-files": {
      "description": "All cluster files rewired (S-REWRITE-01..04 landed) and committed",
      "seed_method": "public_api",
      "records": [
        "all four clusters rewired to Zero/Hono"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN: all cluster files are rewired WHEN: the reviewer greps for hardcoded theme value THEN: zero hardcoded colors/spacing/typography remain; all use the semantic theme tokens",
      "verify": "grep -rn '#[0-9a-fA-F]\\{6\\}' app/ components/ hooks/ screens/ --include='*.tsx' | grep -v 'theme\\.' | wc -l  (expect 0)",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "static analysis",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 reviewer skips theme check",
            "mock \u2014 grep mocked"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "rewired-cluster-files",
            "action": {
              "actor": "cli_user",
              "steps": [
                "grep app/components/hooks/screens for hardcoded hex colors and numeric spacing outside theme tokens"
              ]
            },
            "end_state": {
              "must_observe": [
                "`0` hardcoded `#RRGGBB` colors outside theme context",
                "`0` hardcoded numeric `padding`/`margin`/`fontSize` outside tokens",
                "all colors resolve to `theme.colors.*` tokens (`>=1` token reference per file)"
              ],
              "must_not_observe": [
                "a hardcoded `#RRGGBB` color (baseline is `0` such colors)",
                "a numeric `padding: 16` outside `theme.spacing`"
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
      "description": "GIVEN: all (drawer)/ screens are rewired WHEN: the reviewer checks each (drawer)/ screen THEN: every (drawer)/ screen wraps content in ScreenLayout and interactive elements carry testID + a11y labels",
      "verify": "test \"$(grep -l 'ScreenLayout' app/\\(drawer\\)/*.tsx | wc -l)\" -eq \"$(find 'app/(drawer)/' -name '*.tsx' | wc -l)\"",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "static analysis",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 reviewer skips a11y check"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "rewired-cluster-files",
            "action": {
              "actor": "cli_user",
              "steps": [
                "grep (drawer)/ screens for ScreenLayout usage and testID on interactive elements"
              ]
            },
            "end_state": {
              "must_observe": [
                "`100%` of `(drawer)/` screens wrap content in `ScreenLayout`",
                "every interactive element has a `{screen}-{component}-{element}` `testID`"
              ],
              "must_not_observe": [
                "a `(drawer)/` screen rendering a bare View (`0` ScreenLayout)",
                "an interactive element with no `testID`"
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
      "description": "GIVEN: all Zero queries/mutators are implemented WHEN: the reviewer runs `holo verify:client-contract` THEN: every legacy call site maps to its approved target with the declared offline/optimistic/conflict/rejection/identifier behavior",
      "verify": "holo verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo verify:client-contract",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 verifier skipped",
            "disconnect \u2014 verifier not run"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "rewired-cluster-files",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo verify:client-contract` against the approved contract + inventory"
              ]
            },
            "end_state": {
              "must_observe": [
                "`holo verify:client-contract` exit `0`",
                "`105/105` call sites mapped (`0` unmapped surfaces)"
              ],
              "must_not_observe": [
                "exit code `1` (an unmapped surface; expected `0` unmapped)",
                "an unmapped call site in the output"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN: all checks are complete WHEN: the reviewer compiles findings THEN: a review artifact is written with theme/a11y/contract sections and per-category PASS/FAIL + file:line findings",
      "verify": "test -f .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json && jq -e '.categories | length >= 3' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "file artifact",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 reviewer skips artifact creation"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "rewired-cluster-files",
            "action": {
              "actor": "cli_user",
              "steps": [
                "write the review artifact",
                "assert the required sections and verdicts"
              ]
            },
            "end_state": {
              "must_observe": [
                "the artifact file exists with `>=3` category sections",
                "each section has an explicit `PASS`/`FAIL` verdict"
              ],
              "must_not_observe": [
                "no artifact file (`0` sections)",
                "a section with no verdict"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Zero hardcoded theme values in cluster files",
      "verify": "grep -rn '#[0-9a-fA-F]\\{6\\}' app/ components/ hooks/ screens/ --include='*.tsx' | grep -v 'theme\\.' | wc -l  (expect 0)",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "All (drawer)/ screens use ScreenLayout",
      "verify": "test \"$(grep -l 'ScreenLayout' app/\\(drawer\\)/*.tsx | wc -l)\" -eq \"$(find 'app/(drawer)/' -name '*.tsx' | wc -l)\"",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Client contract passes with zero unmapped surfaces",
      "verify": "holo verify:client-contract --contract .spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml --inventory .spec/prds/mk6-migration/10-technical-requirements/13-client-callsite-inventory.json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Review artifact exists with PASS/FAIL verdicts",
      "verify": "test -f .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json && jq -e '.categories | length >= 3' .spec/prds/mk6-migration/tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/review-artifact.json",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
