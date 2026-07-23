# S-REWRITE-04: Rewire Research + assimilate + improvements + toolbelt + notifications cluster
> Status: Backlog

- **Sprint:** [Sprint 24: Full RN App Rewrite off Convex onto Zero](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `L`
- **Estimate:** `300 minutes`
- **Agent:** `react-native-ui-implementer`
- **Reviewer:** `react-native-ui-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
Rewire the research/assimilate/improvements/toolbelt/notifications cluster from convex/react to Zero/Hono per the approved client-data-contract, preserving theme/a11y/ScreenLayout and creating no new screen files.

## Background
Rewire the research/assimilate/improvements/toolbelt/notifications cluster from convex/react to Zero/Hono per the approved client-data-contract, preserving theme/a11y/ScreenLayout and creating no new screen files. This is Sprint 24 (UC-SYNC-01; UC-SYNC-01, T-SYNC-001, T-SYNC-002, T-SYNC-019). The Zero provider, `app/zero/schema.ts`, and `app/zero/queries.ts` already exist from Sprint 20; the approved call-site→target mapping lives in `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml` from Sprint 21. This sprint *rewires existing surfaces in place* — it does not create new screens.

## Specification
- **Objective:** Rewire the research/assimilate/improvements/toolbelt/notifications cluster from convex/react to Zero/Hono per the approved client-data-contract, preserving theme/a11y/ScreenLayout and creating no new screen files.
- **Success state:** Research session, research progress, improvements list/edit, assimilation session, toolbelt add, and notifications all read/write via Zero/Hono against seeded Postgres; zero convex/react imports remain.

## Critical Constraints
### MUST
- MUST rewire every `convex/react` hook in the cluster (`useQuery`/`useMutation`/`useAction`) to its approved Zero query, Zero mutator, or Hono command target per `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml`
- MUST preserve the existing semantic theme tokens, accessibility labels, `testID` convention, and `ScreenLayout` wrappers — no visual change
- MUST seed reads via the real entrypoint `holo seed:e2e --reset` and observe the declared counts (3 conversations / 12 documents / 5 feed items) over Zero
### NEVER
- NEVER create a new screen file — rewrite the existing screens/components/hooks in place
- NEVER add any new `convex/react` import
- NEVER hardcode theme colors/spacing/typography or seed data by view-injection
### STRICTLY
- STRICTLY every behavioral AC is proven via real seeded Postgres + Zero on a Maestro e2e flow against a named iOS Simulator — never a mocked store
- STRICTLY the PRIMARY AC is test_tier `e2e` bound to a UC-SYNC-01 flow

## Capability Chain
- **Touches:** CAP-SYNC-01, CAP-CUT-01

## Acceptance Criteria
### AC-1: Research session loads via Zero query [PRIMARY]
- **GIVEN:** a seeded research session exists
- **WHEN:** the user opens a research session
- **THEN:** the session and its progress load via Zero
- **Test tier:** `e2e`
- **Verification service:** `Zero+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/research/session-loads.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero+seeded Postgres`
  - **Negative control — would fail if:
    - disconnect — Postgres not seeded
    - empty — Zero returns no rows
    - stub — session from hardcoded state
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-research`:
    - actor: `user`
    - step: open a research session
    - MUST observe:
      - the session `title`/`status` render via Zero
      - research `progress` (stage/iteration) reflects the seeded state
      - session bound to a Zero `useQuery`
    - MUST NOT observe:
      - a `Session not found` fallback for a present session (`0` status)
      - a `convex/react` `useQuery` import
### AC-2: Improvements list loads via Zero query [PRIMARY]
- **GIVEN:** seeded improvement rows exist
- **WHEN:** the user opens improvements
- **THEN:** the seeded improvements load via Zero
- **Test tier:** `e2e`
- **Verification service:** `Zero+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/research/improvements-loads.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero+seeded Postgres`
  - **Negative control — would fail if:
    - disconnect — Postgres not seeded
    - empty — Zero returns no rows
    - stub — list from a hardcoded array
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-improvements`:
    - actor: `user`
    - step: open the improvements screen
    - MUST observe:
      - `>=1` improvement row rendered via Zero
      - each row shows a non-empty `title`/`status`
      - list bound to a Zero `useQuery`
    - MUST NOT observe:
      - the `No improvements` empty state (`0` rows)
      - a `convex/react` `useQuery` import
### AC-3: Improvement edit persists via Zero mutator
- **GIVEN:** a seeded improvement is open
- **WHEN:** the user edits and saves an improvement
- **THEN:** the change persists via the Zero mutator and reflects within the 5s SLO
- **Test tier:** `e2e`
- **Verification service:** `Zero mutator+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/research/improvement-edit.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero mutator+seeded Postgres`
  - **Negative control — would fail if:
    - stub — edit is local-only
    - mock — mutator faked without a write
    - disconnect — mutator not wired
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-improvements`:
    - actor: `user`
    - step: open an improvement edit sheet
    - step: change a field and save
    - MUST observe:
      - the edited `field` reflects the new value in the UI
      - Postgres row matches the new value within the `5s` SLO
      - mutator is a Zero mutator, not a `convex/react` `useMutation`
    - MUST NOT observe:
      - edit reverts (not persisted)
      - no row change in Postgres (`0` updates)
      - a `convex/react` `useMutation` import
### AC-4: Assimilation session loads via Zero query
- **GIVEN:** a seeded assimilation session exists
- **WHEN:** the user opens assimilate
- **THEN:** the assimilation plan loads via Zero
- **Test tier:** `e2e`
- **Verification service:** `Zero+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/research/assimilate-loads.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero+seeded Postgres`
  - **Negative control — would fail if:
    - disconnect — Postgres not seeded
    - empty — Zero returns no rows
    - stub — plan from hardcoded content
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-research`:
    - actor: `user`
    - step: open the assimilate session
    - MUST observe:
      - the assimilation plan card renders via Zero with non-empty `content`
      - session bound to a Zero `useQuery`
    - MUST NOT observe:
      - the `No plan` empty state (`0` content)
      - a `convex/react` `useQuery` import
### AC-5: Toolbelt add persists via Zero mutator
- **GIVEN:** the user is on the toolbelt add screen
- **WHEN:** the user adds a toolbelt entry
- **THEN:** the entry persists via the Zero mutator and appears in the list
- **Test tier:** `e2e`
- **Verification service:** `Zero mutator+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/research/toolbelt-add.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero mutator+seeded Postgres`
  - **Negative control — would fail if:
    - stub — add is a no-op
    - mock — mutator faked without a write
    - disconnect — mutator not wired
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-research`:
    - actor: `user`
    - step: open toolbelt add
    - step: submit a new entry
    - MUST observe:
      - `1` new toolbelt row in Postgres (count increases by `1`)
      - the list count increases by `1`
      - mutator is a Zero mutator, not a `convex/react` `useMutation`
    - MUST NOT observe:
      - no new row persisted (count unchanged / `0` added)
      - a `convex/react` `useMutation` import
### AC-6: No convex/react imports remain in the research cluster [PRIMARY]
- **GIVEN:** all research-cluster files have been rewired
- **WHEN:** the verifier scans the cluster roots
- **THEN:** zero convex/react imports remain and the cluster reads through the Zero seam
- **Test tier:** `integration`
- **Verification service:** `holo verify:no-convex-client`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `holo verify:no-convex-client --roots 'app/(drawer)/research,app/(drawer)/improvements,app/(drawer)/toolbelt.tsx,app/assimilate,app/toolbelt,components/ResearchProgress.tsx,components/assimilate,components/improvements,hooks/useResearchSession.ts,hooks/use-agent-activity.ts,hooks/use-notifications.ts'`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `holo verify:no-convex-client`
  - **Negative control — would fail if:
    - stub — verifier not implemented
    - empty — cluster not yet rewired
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `seeded-research`:
    - actor: `cli_user`
    - step: run `holo verify:no-convex-client --roots 'app/(drawer)/research,app/(drawer)/improvements,app/(drawer)/toolbelt.tsx,app/assimilate,app/toolbelt,components/ResearchProgress.tsx,components/ResearchProgressWithConvex.tsx,components/assimilate,components/improvements,hooks/useResearchSession.ts,hooks/use-agent-activity.ts,hooks/use-notifications.ts,hooks/use-whats-new-feed.ts,hooks/use-subscription-feed.ts'`
    - MUST observe:
      - `0` `convex/react` import lines in the cluster
      - cluster hooks import from `app/zero/queries` (`>=1` Zero import)
    - MUST NOT observe:
      - any `from 'convex/react'` line (`>0` hits)
      - any `useQuery`/`useMutation` from convex/react
## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Research session loads via Zero | AC-1 | `maestro test .maestro/research/session-loads.yml` |
| TC-2 | Improvements list loads via Zero | AC-2 | `maestro test .maestro/research/improvements-loads.yml` |
| TC-3 | Improvement edit persists via Zero mutator | AC-3 | `maestro test .maestro/research/improvement-edit.yml` |
| TC-4 | Assimilation session loads via Zero | AC-4 | `maestro test .maestro/research/assimilate-loads.yml` |
| TC-5 | Toolbelt add persists via Zero mutator | AC-5 | `maestro test .maestro/research/toolbelt-add.yml` |
| TC-6 | Zero convex/react imports in the research cluster | AC-6 | `holo verify:no-convex-client --roots 'app/(drawer)/research,app/(drawer)/improvements,app/(drawer)/toolbelt.tsx,app/assimilate,app/toolbelt,components/ResearchProgress.tsx,components/assimilate,components/improvements,hooks/useResearchSession.ts,hooks/use-agent-activity.ts,hooks/use-notifications.ts'` |

## Reading List
- `RULES.md` (RN conventions: react-native-paper `Text`, semantic theme tokens, `testID`, `ScreenLayout` for `(drawer)/`)
- `.spec/prds/mk6-migration/08-uc-sync.md` — UC-SYNC-01 (the contract every cluster serves)
- `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml` — the approved call-site→target mapping this task executes
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — T-SYNC-001/002/004/019 rows
- `app/zero/schema.ts`, `app/zero/queries.ts` — the Zero seam + existing queries/mutators to reuse
- `app/(drawer)/research/[sessionId].tsx` (MODIFY)
- `app/(drawer)/improvements.tsx` (MODIFY)
- `app/(drawer)/improvements/[requestId].tsx` (MODIFY)
- `app/(drawer)/toolbelt.tsx` (MODIFY)
- `app/assimilate/[sessionId].tsx` (MODIFY)
- `app/toolbelt/add.tsx` (MODIFY)

## Guardrails
**Write allowed:**
- `app/(drawer)/research/[sessionId].tsx (MODIFY)`
- `app/(drawer)/improvements.tsx (MODIFY)`
- `app/(drawer)/improvements/[requestId].tsx (MODIFY)`
- `app/(drawer)/toolbelt.tsx (MODIFY)`
- `app/assimilate/[sessionId].tsx (MODIFY)`
- `app/toolbelt/add.tsx (MODIFY)`
- `components/ResearchProgress.tsx (MODIFY)`
- `components/ResearchProgressWithConvex.tsx (MODIFY)`
- `components/assimilate/AssimilationPlanCard.tsx (MODIFY)`
- `components/improvements/ImprovementSubmitSheet.tsx (MODIFY)`
- `hooks/useResearchSession.ts (MODIFY)`
- `hooks/use-agent-activity.ts (MODIFY)`
- `hooks/use-notifications.ts (MODIFY)`
- `hooks/use-whats-new-feed.ts (MODIFY)`
- `hooks/use-subscription-feed.ts (MODIFY)`
**Write prohibited:**
- Any new sibling screen file (e.g. `<Variant>Screen.tsx`) — rewrite in place
- Any new `convex/react` import (`useQuery`/`useMutation`/`useAction`)
- Hardcoded theme colors/spacing/typography; data seeded by view-injection

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
- **TC-1** — `Research session loads via Zero`
  - command: `maestro test .maestro/research/session-loads.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-2** — `Improvements list loads via Zero`
  - command: `maestro test .maestro/research/improvements-loads.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-3** — `Improvement edit persists via Zero mutator`
  - command: `maestro test .maestro/research/improvement-edit.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-4** — `Assimilation session loads via Zero`
  - command: `maestro test .maestro/research/assimilate-loads.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-5** — `Toolbelt add persists via Zero mutator`
  - command: `maestro test .maestro/research/toolbelt-add.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-6** — `Zero convex/react imports in the research cluster`
  - command: `holo verify:no-convex-client --roots 'app/(drawer)/research,app/(drawer)/improvements,app/(drawer)/toolbelt.tsx,app/assimilate,app/toolbelt,components/ResearchProgress.tsx,components/assimilate,components/improvements,hooks/useResearchSession.ts,hooks/use-agent-activity.ts,hooks/use-notifications.ts'`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **Type check clean** — `pnpm tsc --noEmit` → Exit 0
- **Lint pass** — `pnpm lint` → Exit 0
- **Scenario fakeability** — `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REWRITE-04.json` → Exit 0

## Agent Assignment
- **Agent:** `react-native-ui-implementer` — owns the React Native state/network layer this cluster rewrites
- **Reviewer:** `react-native-ui-reviewer` — adversarial theme/a11y/contract + Zero-wiring review

## Evidence Gates
- RED-against-start for every behavioral AC (tdd_mode `red_first`): `True`
- Real-services (seeded Postgres + Zero, Maestro e2e) proof required: `True`
- Fakeability: `validate_scenario.py` exit 0 on every behavioral AC (independently re-verified)

## Review Criteria
- Every read in the cluster comes from a Zero `useQuery`; every write from a Zero mutator or Hono command — zero `convex/react` on the path
- Theme tokens / a11y / `ScreenLayout` preserved (no hardcoded values, no new screen files)
- Each call-site matches its approved target in `13-client-data-contract.yaml`
- Every behavioral AC's scenario passes `validate_scenario.py` with zero CRITICAL/HIGH

## Dependencies
- **Depends on:** none
- **Blocks:** S-REWRITE-05, S-REWRITE-06

## Coding Standards
- `RULES.md` — RN conventions (react-native-paper `Text`, semantic theme, `testID`, `ScreenLayout`)
- `brain/docs/kanban/TASK-TEMPLATE.md`; `brain/docs/TDD-METHODOLOGY.md`

## Notes
- Generated by /kb-sprint-tasks-plan on 2026-07-23. Proposed by `react-native-ui-planner`; consolidated by the orchestrator (schema normalization + scenario rendering + stable AC-N/TC-N ID assignment). `validate_scenario.py` exit 0 on this task's contract.
- PRD refs: UC-SYNC-01, T-SYNC-001, T-SYNC-002, T-SYNC-019.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-REWRITE-04",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-research": {
      "description": "A seeded research session + improvements, seeded by `holo seed:e2e --reset`, reactive over Zero",
      "seed_method": "public_api",
      "records": [
        ">=1 research session row",
        ">=1 improvement row",
        ">=1 toolbelt entry"
      ]
    },
    "seeded-improvements": {
      "description": "Seeded improvement rows for the improvements sheet",
      "seed_method": "public_api",
      "records": [
        ">=1 improvement row with editable status"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN: a seeded research session exists WHEN: the user opens a research session THEN: the session and its progress load via Zero",
      "verify": "maestro test .maestro/research/session-loads.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect \u2014 Postgres not seeded",
            "empty \u2014 Zero returns no rows",
            "stub \u2014 session from hardcoded state"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-research",
            "action": {
              "actor": "user",
              "steps": [
                "open a research session"
              ]
            },
            "end_state": {
              "must_observe": [
                "the session `title`/`status` render via Zero",
                "research `progress` (stage/iteration) reflects the seeded state",
                "session bound to a Zero `useQuery`"
              ],
              "must_not_observe": [
                "a `Session not found` fallback for a present session (`0` status)",
                "a `convex/react` `useQuery` import"
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
      "description": "GIVEN: seeded improvement rows exist WHEN: the user opens improvements THEN: the seeded improvements load via Zero",
      "verify": "maestro test .maestro/research/improvements-loads.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect \u2014 Postgres not seeded",
            "empty \u2014 Zero returns no rows",
            "stub \u2014 list from a hardcoded array"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-improvements",
            "action": {
              "actor": "user",
              "steps": [
                "open the improvements screen"
              ]
            },
            "end_state": {
              "must_observe": [
                "`>=1` improvement row rendered via Zero",
                "each row shows a non-empty `title`/`status`",
                "list bound to a Zero `useQuery`"
              ],
              "must_not_observe": [
                "the `No improvements` empty state (`0` rows)",
                "a `convex/react` `useQuery` import"
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
      "description": "GIVEN: a seeded improvement is open WHEN: the user edits and saves an improvement THEN: the change persists via the Zero mutator and reflects within the 5s SLO",
      "verify": "maestro test .maestro/research/improvement-edit.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero mutator+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 edit is local-only",
            "mock \u2014 mutator faked without a write",
            "disconnect \u2014 mutator not wired"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-improvements",
            "action": {
              "actor": "user",
              "steps": [
                "open an improvement edit sheet",
                "change a field and save"
              ]
            },
            "end_state": {
              "must_observe": [
                "the edited `field` reflects the new value in the UI",
                "Postgres row matches the new value within the `5s` SLO",
                "mutator is a Zero mutator, not a `convex/react` `useMutation`"
              ],
              "must_not_observe": [
                "edit reverts (not persisted)",
                "no row change in Postgres (`0` updates)",
                "a `convex/react` `useMutation` import"
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
      "description": "GIVEN: a seeded assimilation session exists WHEN: the user opens assimilate THEN: the assimilation plan loads via Zero",
      "verify": "maestro test .maestro/research/assimilate-loads.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect \u2014 Postgres not seeded",
            "empty \u2014 Zero returns no rows",
            "stub \u2014 plan from hardcoded content"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-research",
            "action": {
              "actor": "user",
              "steps": [
                "open the assimilate session"
              ]
            },
            "end_state": {
              "must_observe": [
                "the assimilation plan card renders via Zero with non-empty `content`",
                "session bound to a Zero `useQuery`"
              ],
              "must_not_observe": [
                "the `No plan` empty state (`0` content)",
                "a `convex/react` `useQuery` import"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN: the user is on the toolbelt add screen WHEN: the user adds a toolbelt entry THEN: the entry persists via the Zero mutator and appears in the list",
      "verify": "maestro test .maestro/research/toolbelt-add.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero mutator+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 add is a no-op",
            "mock \u2014 mutator faked without a write",
            "disconnect \u2014 mutator not wired"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-research",
            "action": {
              "actor": "user",
              "steps": [
                "open toolbelt add",
                "submit a new entry"
              ]
            },
            "end_state": {
              "must_observe": [
                "`1` new toolbelt row in Postgres (count increases by `1`)",
                "the list count increases by `1`",
                "mutator is a Zero mutator, not a `convex/react` `useMutation`"
              ],
              "must_not_observe": [
                "no new row persisted (count unchanged / `0` added)",
                "a `convex/react` `useMutation` import"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN: all research-cluster files have been rewired WHEN: the verifier scans the cluster roots THEN: zero convex/react imports remain and the cluster reads through the Zero seam",
      "verify": "holo verify:no-convex-client --roots 'app/(drawer)/research,app/(drawer)/improvements,app/(drawer)/toolbelt.tsx,app/assimilate,app/toolbelt,components/ResearchProgress.tsx,components/assimilate,components/improvements,hooks/useResearchSession.ts,hooks/use-agent-activity.ts,hooks/use-notifications.ts'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo verify:no-convex-client",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 verifier not implemented",
            "empty \u2014 cluster not yet rewired"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-research",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo verify:no-convex-client --roots 'app/(drawer)/research,app/(drawer)/improvements,app/(drawer)/toolbelt.tsx,app/assimilate,app/toolbelt,components/ResearchProgress.tsx,components/ResearchProgressWithConvex.tsx,components/assimilate,components/improvements,hooks/useResearchSession.ts,hooks/use-agent-activity.ts,hooks/use-notifications.ts,hooks/use-whats-new-feed.ts,hooks/use-subscription-feed.ts'`"
              ]
            },
            "end_state": {
              "must_observe": [
                "`0` `convex/react` import lines in the cluster",
                "cluster hooks import from `app/zero/queries` (`>=1` Zero import)"
              ],
              "must_not_observe": [
                "any `from 'convex/react'` line (`>0` hits)",
                "any `useQuery`/`useMutation` from convex/react"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Research session loads via Zero",
      "verify": "maestro test .maestro/research/session-loads.yml",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Improvements list loads via Zero",
      "verify": "maestro test .maestro/research/improvements-loads.yml",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Improvement edit persists via Zero mutator",
      "verify": "maestro test .maestro/research/improvement-edit.yml",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Assimilation session loads via Zero",
      "verify": "maestro test .maestro/research/assimilate-loads.yml",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Toolbelt add persists via Zero mutator",
      "verify": "maestro test .maestro/research/toolbelt-add.yml",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Zero convex/react imports in the research cluster",
      "verify": "holo verify:no-convex-client --roots 'app/(drawer)/research,app/(drawer)/improvements,app/(drawer)/toolbelt.tsx,app/assimilate,app/toolbelt,components/ResearchProgress.tsx,components/assimilate,components/improvements,hooks/useResearchSession.ts,hooks/use-agent-activity.ts,hooks/use-notifications.ts'",
      "maps_to_ac": "AC-6"
    }
  ]
}
-->
