# S-REWRITE-03: Rewire Subscriptions + feed + whats-new + settings cluster to Zero
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
Rewire the subscriptions/feed/whats-new/settings cluster from convex/react to Zero/Hono per the approved client-data-contract, preserving theme/a11y/ScreenLayout and creating no new screen files.

## Background
Rewire the subscriptions/feed/whats-new/settings cluster from convex/react to Zero/Hono per the approved client-data-contract, preserving theme/a11y/ScreenLayout and creating no new screen files. This is Sprint 24 (UC-SYNC-01; UC-SYNC-01, T-SYNC-001, T-SYNC-002, T-SYNC-019). The Zero provider, `app/zero/schema.ts`, and `app/zero/queries.ts` already exist from Sprint 20; the approved call-site→target mapping lives in `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml` from Sprint 21. This sprint *rewires existing surfaces in place* — it does not create new screens.

## Specification
- **Objective:** Rewire the subscriptions/feed/whats-new/settings cluster from convex/react to Zero/Hono per the approved client-data-contract, preserving theme/a11y/ScreenLayout and creating no new screen files.
- **Success state:** Feed list, subscription settings, whats-new reports, subscription toggle, and social posts all read/write via Zero/Hono against seeded Postgres; zero convex/react imports remain.

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
### AC-1: Feed list loads via Zero query [PRIMARY]
- **GIVEN:** 5 feed items are seeded via `holo seed:e2e --reset`
- **WHEN:** the user opens the What's New feed
- **THEN:** the 5 seeded feed items appear via Zero
- **Test tier:** `e2e`
- **Verification service:** `Zero+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/subscriptions/feed-loads.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero+seeded Postgres`
  - **Negative control — would fail if:
    - disconnect — Postgres not seeded
    - empty — Zero returns no items
    - stub — list from a hardcoded array
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-feed`:
    - actor: `user`
    - step: open the What's New feed
    - MUST observe:
      - `5` feed items rendered (matches the `5` seeded)
      - each item shows a non-empty `title`/`summary`
      - list bound to a Zero `useQuery`
    - MUST NOT observe:
      - the `Nothing new` empty state (`0` items)
      - a `convex/react` `useQuery` import
### AC-2: Subscription settings load via Zero query [PRIMARY]
- **GIVEN:** a seeded subscription exists
- **WHEN:** the user opens subscription settings
- **THEN:** the seeded subscription rows load via Zero with their toggle state
- **Test tier:** `e2e`
- **Verification service:** `Zero+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/subscriptions/settings-loads.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero+seeded Postgres`
  - **Negative control — would fail if:
    - disconnect — Postgres not seeded
    - empty — Zero returns no rows
    - stub — settings from hardcoded state
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-subscriptions`:
    - actor: `user`
    - step: open subscription settings
    - MUST observe:
      - `>=1` subscription row rendered via Zero
      - each row shows an `enabled` toggle reflecting its seeded state
      - settings bound to a Zero `useQuery`
    - MUST NOT observe:
      - the `No subscriptions` empty state (`0` rows)
      - a `convex/react` `useQuery` import
### AC-3: Whats-new reports load via Zero query [PRIMARY]
- **GIVEN:** a seeded whats-new report exists
- **WHEN:** the user opens a whats-new report
- **THEN:** the report content loads via Zero
- **Test tier:** `e2e`
- **Verification service:** `Zero+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/subscriptions/whats-new-loads.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero+seeded Postgres`
  - **Negative control — would fail if:
    - disconnect — Postgres not seeded
    - empty — Zero returns no rows
    - stub — report from hardcoded content
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-subscriptions`:
    - actor: `user`
    - step: open a whats-new report
    - MUST observe:
      - the report `title` and non-empty `body` render via Zero
      - report bound to a Zero `useQuery`
    - MUST NOT observe:
      - a `Report not found` fallback for a present report (`0` body)
      - a `convex/react` `useQuery` import
### AC-4: Subscription toggle updates via Zero mutator
- **GIVEN:** a seeded subscription is shown
- **WHEN:** the user toggles a subscription
- **THEN:** the new enabled state persists via the Zero mutator within the 5s SLO
- **Test tier:** `e2e`
- **Verification service:** `Zero mutator+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/subscriptions/toggle-works.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero mutator+seeded Postgres`
  - **Negative control — would fail if:
    - stub — toggle is local-only
    - mock — mutator faked without a write
    - disconnect — mutator not wired
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-subscriptions`:
    - actor: `user`
    - step: toggle a subscription's enabled switch
    - MUST observe:
      - the row's `enabled` flag flips to the new boolean
      - Postgres row `enabled` matches within the `5s` SLO
      - mutator is a Zero mutator, not a `convex/react` `useMutation`
    - MUST NOT observe:
      - toggle reverts (not persisted)
      - no row change in Postgres (`0` updates)
      - a `convex/react` `useMutation` import
### AC-5: Social posts load via Zero query
- **GIVEN:** seeded social posts exist
- **WHEN:** the user opens the social view
- **THEN:** the social posts load via Zero
- **Test tier:** `e2e`
- **Verification service:** `Zero+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/subscriptions/social-loads.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero+seeded Postgres`
  - **Negative control — would fail if:
    - disconnect — Postgres not seeded
    - empty — Zero returns no rows
    - stub — posts from a hardcoded array
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-subscriptions`:
    - actor: `user`
    - step: open the social posts view
    - MUST observe:
      - `>=1` social post rendered via Zero
      - each post shows non-empty `content`
      - view bound to a Zero `useQuery`
    - MUST NOT observe:
      - the `No posts` empty state (`0` posts)
      - a `convex/react` `useQuery` import
### AC-6: No convex/react imports remain in the subscriptions cluster [PRIMARY]
- **GIVEN:** all subscriptions-cluster files have been rewired
- **WHEN:** the verifier scans the cluster roots
- **THEN:** zero convex/react imports remain and the cluster reads through the Zero seam
- **Test tier:** `integration`
- **Verification service:** `holo verify:no-convex-client`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `holo verify:no-convex-client --roots 'app/subscriptions,app/(drawer)/whats-new,app/(drawer)/subscriptions,app/(drawer)/subscription-content,components/whats-new,components/settings'`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `holo verify:no-convex-client`
  - **Negative control — would fail if:
    - stub — verifier not implemented
    - empty — cluster not yet rewired
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `seeded-feed`:
    - actor: `cli_user`
    - step: run `holo verify:no-convex-client --roots 'app/subscriptions,app/(drawer)/whats-new,app/(drawer)/subscriptions,app/(drawer)/subscription-content,components/whats-new,components/settings'`
    - MUST observe:
      - `0` `convex/react` import lines in the cluster
      - cluster hooks import from `app/zero/queries` (`>=1` Zero import)
    - MUST NOT observe:
      - any `from 'convex/react'` line (`>0` hits)
      - any `useQuery`/`useMutation` from convex/react
## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Feed list loads the 5 seeded items via Zero | AC-1 | `maestro test .maestro/subscriptions/feed-loads.yml` |
| TC-2 | Subscription settings load via Zero | AC-2 | `maestro test .maestro/subscriptions/settings-loads.yml` |
| TC-3 | Whats-new reports load via Zero | AC-3 | `maestro test .maestro/subscriptions/whats-new-loads.yml` |
| TC-4 | Subscription toggle persists via Zero mutator | AC-4 | `maestro test .maestro/subscriptions/toggle-works.yml` |
| TC-5 | Social posts load via Zero | AC-5 | `maestro test .maestro/subscriptions/social-loads.yml` |
| TC-6 | Zero convex/react imports in the subscriptions cluster | AC-6 | `holo verify:no-convex-client --roots 'app/subscriptions,app/(drawer)/whats-new,app/(drawer)/subscriptions,app/(drawer)/subscription-content,components/whats-new,components/settings'` |

## Reading List
- `RULES.md` (RN conventions: react-native-paper `Text`, semantic theme tokens, `testID`, `ScreenLayout` for `(drawer)/`)
- `.spec/prds/mk6-migration/08-uc-sync.md` — UC-SYNC-01 (the contract every cluster serves)
- `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml` — the approved call-site→target mapping this task executes
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — T-SYNC-001/002/004/019 rows
- `app/zero/schema.ts`, `app/zero/queries.ts` — the Zero seam + existing queries/mutators to reuse
- `app/subscriptions/index.tsx` (MODIFY)
- `app/subscriptions/feed.tsx` (MODIFY)
- `app/subscriptions/settings.tsx` (MODIFY)
- `app/subscriptions/_layout.tsx` (MODIFY)
- `app/(drawer)/whats-new/index.tsx` (MODIFY)
- `app/(drawer)/whats-new/[reportId].tsx` (MODIFY)

## Guardrails
**Write allowed:**
- `app/subscriptions/index.tsx (MODIFY)`
- `app/subscriptions/feed.tsx (MODIFY)`
- `app/subscriptions/settings.tsx (MODIFY)`
- `app/subscriptions/_layout.tsx (MODIFY)`
- `app/(drawer)/whats-new/index.tsx (MODIFY)`
- `app/(drawer)/whats-new/[reportId].tsx (MODIFY)`
- `app/(drawer)/whats-new/social.tsx (MODIFY)`
- `app/(drawer)/subscriptions/feed.tsx (MODIFY)`
- `app/(drawer)/subscriptions/social.tsx (MODIFY)`
- `app/(drawer)/subscription-content/[groupKey].tsx (MODIFY)`
- `components/whats-new/SocialPostsListScreen.tsx (MODIFY)`
- `components/settings/SubscriptionSection.tsx (MODIFY)`
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
- **TC-1** — `Feed list loads the 5 seeded items via Zero`
  - command: `maestro test .maestro/subscriptions/feed-loads.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-2** — `Subscription settings load via Zero`
  - command: `maestro test .maestro/subscriptions/settings-loads.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-3** — `Whats-new reports load via Zero`
  - command: `maestro test .maestro/subscriptions/whats-new-loads.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-4** — `Subscription toggle persists via Zero mutator`
  - command: `maestro test .maestro/subscriptions/toggle-works.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-5** — `Social posts load via Zero`
  - command: `maestro test .maestro/subscriptions/social-loads.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-6** — `Zero convex/react imports in the subscriptions cluster`
  - command: `holo verify:no-convex-client --roots 'app/subscriptions,app/(drawer)/whats-new,app/(drawer)/subscriptions,app/(drawer)/subscription-content,components/whats-new,components/settings'`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **Type check clean** — `pnpm tsc --noEmit` → Exit 0
- **Lint pass** — `pnpm lint` → Exit 0
- **Scenario fakeability** — `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REWRITE-03.json` → Exit 0

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
  "task_id": "S-REWRITE-03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-feed": {
      "description": "5 feed items seeded by `holo seed:e2e --reset`, reactive over Zero",
      "seed_method": "public_api",
      "records": [
        "5 feed items exist in Postgres after `holo seed:e2e --reset`"
      ]
    },
    "seeded-subscriptions": {
      "description": "Seeded subscription settings + whats-new reports",
      "seed_method": "public_api",
      "records": [
        ">=1 subscription row with a toggleable `enabled` flag",
        ">=1 whats-new report row"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN: 5 feed items are seeded via `holo seed:e2e --reset` WHEN: the user opens the What's New feed THEN: the 5 seeded feed items appear via Zero",
      "verify": "maestro test .maestro/subscriptions/feed-loads.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect \u2014 Postgres not seeded",
            "empty \u2014 Zero returns no items",
            "stub \u2014 list from a hardcoded array"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-feed",
            "action": {
              "actor": "user",
              "steps": [
                "open the What's New feed"
              ]
            },
            "end_state": {
              "must_observe": [
                "`5` feed items rendered (matches the `5` seeded)",
                "each item shows a non-empty `title`/`summary`",
                "list bound to a Zero `useQuery`"
              ],
              "must_not_observe": [
                "the `Nothing new` empty state (`0` items)",
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
      "description": "GIVEN: a seeded subscription exists WHEN: the user opens subscription settings THEN: the seeded subscription rows load via Zero with their toggle state",
      "verify": "maestro test .maestro/subscriptions/settings-loads.yml",
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
            "stub \u2014 settings from hardcoded state"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-subscriptions",
            "action": {
              "actor": "user",
              "steps": [
                "open subscription settings"
              ]
            },
            "end_state": {
              "must_observe": [
                "`>=1` subscription row rendered via Zero",
                "each row shows an `enabled` toggle reflecting its seeded state",
                "settings bound to a Zero `useQuery`"
              ],
              "must_not_observe": [
                "the `No subscriptions` empty state (`0` rows)",
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
      "primary": true,
      "description": "GIVEN: a seeded whats-new report exists WHEN: the user opens a whats-new report THEN: the report content loads via Zero",
      "verify": "maestro test .maestro/subscriptions/whats-new-loads.yml",
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
            "stub \u2014 report from hardcoded content"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-subscriptions",
            "action": {
              "actor": "user",
              "steps": [
                "open a whats-new report"
              ]
            },
            "end_state": {
              "must_observe": [
                "the report `title` and non-empty `body` render via Zero",
                "report bound to a Zero `useQuery`"
              ],
              "must_not_observe": [
                "a `Report not found` fallback for a present report (`0` body)",
                "a `convex/react` `useQuery` import"
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
      "description": "GIVEN: a seeded subscription is shown WHEN: the user toggles a subscription THEN: the new enabled state persists via the Zero mutator within the 5s SLO",
      "verify": "maestro test .maestro/subscriptions/toggle-works.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero mutator+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 toggle is local-only",
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
            "start_ref": "seeded-subscriptions",
            "action": {
              "actor": "user",
              "steps": [
                "toggle a subscription's enabled switch"
              ]
            },
            "end_state": {
              "must_observe": [
                "the row's `enabled` flag flips to the new boolean",
                "Postgres row `enabled` matches within the `5s` SLO",
                "mutator is a Zero mutator, not a `convex/react` `useMutation`"
              ],
              "must_not_observe": [
                "toggle reverts (not persisted)",
                "no row change in Postgres (`0` updates)",
                "a `convex/react` `useMutation` import"
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
      "description": "GIVEN: seeded social posts exist WHEN: the user opens the social view THEN: the social posts load via Zero",
      "verify": "maestro test .maestro/subscriptions/social-loads.yml",
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
            "stub \u2014 posts from a hardcoded array"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-subscriptions",
            "action": {
              "actor": "user",
              "steps": [
                "open the social posts view"
              ]
            },
            "end_state": {
              "must_observe": [
                "`>=1` social post rendered via Zero",
                "each post shows non-empty `content`",
                "view bound to a Zero `useQuery`"
              ],
              "must_not_observe": [
                "the `No posts` empty state (`0` posts)",
                "a `convex/react` `useQuery` import"
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
      "description": "GIVEN: all subscriptions-cluster files have been rewired WHEN: the verifier scans the cluster roots THEN: zero convex/react imports remain and the cluster reads through the Zero seam",
      "verify": "holo verify:no-convex-client --roots 'app/subscriptions,app/(drawer)/whats-new,app/(drawer)/subscriptions,app/(drawer)/subscription-content,components/whats-new,components/settings'",
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
            "start_ref": "seeded-feed",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo verify:no-convex-client --roots 'app/subscriptions,app/(drawer)/whats-new,app/(drawer)/subscriptions,app/(drawer)/subscription-content,components/whats-new,components/settings'`"
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
      "description": "Feed list loads the 5 seeded items via Zero",
      "verify": "maestro test .maestro/subscriptions/feed-loads.yml",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Subscription settings load via Zero",
      "verify": "maestro test .maestro/subscriptions/settings-loads.yml",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Whats-new reports load via Zero",
      "verify": "maestro test .maestro/subscriptions/whats-new-loads.yml",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Subscription toggle persists via Zero mutator",
      "verify": "maestro test .maestro/subscriptions/toggle-works.yml",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Social posts load via Zero",
      "verify": "maestro test .maestro/subscriptions/social-loads.yml",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Zero convex/react imports in the subscriptions cluster",
      "verify": "holo verify:no-convex-client --roots 'app/subscriptions,app/(drawer)/whats-new,app/(drawer)/subscriptions,app/(drawer)/subscription-content,components/whats-new,components/settings'",
      "maps_to_ac": "AC-6"
    }
  ]
}
-->
