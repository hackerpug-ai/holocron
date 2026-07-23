# S-REWRITE-02: Rewire Documents + articles + narration cluster; re-point share URL
> Status: Backlog

- **Sprint:** [Sprint 24: Full RN App Rewrite off Convex onto Zero](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `L`
- **Estimate:** `360 minutes`
- **Agent:** `react-native-ui-implementer`
- **Reviewer:** `react-native-ui-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
Rewire the Documents/articles/narration cluster from convex/react to Zero/Hono and re-point the share-URL builder in app/document/[id].tsx at the Mastra /article/ host, preserving theme/a11y/ScreenLayout and creating no new screen files.

## Background
Rewire the Documents/articles/narration cluster from convex/react to Zero/Hono and re-point the share-URL builder in app/document/[id].tsx at the Mastra /article/ host, preserving theme/a11y/ScreenLayout and creating no new screen files. This is Sprint 24 (UC-SYNC-01; UC-SYNC-01, T-SYNC-001, T-SYNC-002, T-SYNC-004, T-SYNC-019). The Zero provider, `app/zero/schema.ts`, and `app/zero/queries.ts` already exist from Sprint 20; the approved call-site→target mapping lives in `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml` from Sprint 21. This sprint *rewires existing surfaces in place* — it does not create new screens.

## Specification
- **Objective:** Rewire the Documents/articles/narration cluster from convex/react to Zero/Hono and re-point the share-URL builder in app/document/[id].tsx at the Mastra /article/ host, preserving theme/a11y/ScreenLayout and creating no new screen files.
- **Success state:** Articles list/detail, article import, narration playback, and share-URL generation all run via Zero/Hono against seeded Postgres; the share URL targets the Mastra host with no .convex.cloud->.convex.site rewrite; zero convex/react imports remain.

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
- **Touches:** CAP-SYNC-01, CAP-CUT-01, CAP-PUB-01

## Acceptance Criteria
### AC-1: Articles list loads via Zero query [PRIMARY]
- **GIVEN:** 12 documents are seeded via `holo seed:e2e --reset`
- **WHEN:** the user opens Articles
- **THEN:** the 12 seeded documents load via Zero grouped by category
- **Test tier:** `e2e`
- **Verification service:** `Zero+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/articles/list-loads.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero+seeded Postgres`
  - **Negative control — would fail if:
    - disconnect — Postgres not seeded
    - empty — Zero returns no documents
    - stub — list from a hardcoded array
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-documents`:
    - actor: `user`
    - step: open the Articles screen
    - MUST observe:
      - `12` document cards rendered (matches the `12` seeded)
      - cards grouped under `>=1` `category` header
      - list bound to a Zero `useQuery`
    - MUST NOT observe:
      - the `No documents` empty state (`0` cards)
      - a `convex/react` `useQuery` import
### AC-2: Article detail loads via Zero query [PRIMARY]
- **GIVEN:** a seeded document exists
- **WHEN:** the user opens a document detail
- **THEN:** the document title and content load via Zero
- **Test tier:** `e2e`
- **Verification service:** `Zero+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/articles/detail-loads.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero+seeded Postgres`
  - **Negative control — would fail if:
    - disconnect — Postgres not seeded
    - empty — Zero returns no rows
    - stub — detail from hardcoded content
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-documents`:
    - actor: `user`
    - step: tap a document card to open detail
    - MUST observe:
      - the document `title` and non-empty `content` render via Zero
      - detail bound to a Zero `useQuery`
    - MUST NOT observe:
      - a `Document not found` fallback for a present doc (`0` content)
      - a `convex/react` `useQuery` import
### AC-3: Share URL points to the Mastra /article/ host (CAP-PUB-01) [PRIMARY]
- **GIVEN:** a seeded public document is open in app/document/[id].tsx
- **WHEN:** the user taps Share
- **THEN:** the generated URL points at the Mastra /article/ host and contains no .convex.site rewrite
- **Test tier:** `e2e`
- **Verification service:** `Mastra /article/ host`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/articles/share-url-mastra.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Mastra /article/ host`
  - **Negative control — would fail if:
    - stub — builder returns a hardcoded .convex.site URL
    - disconnect — builder not rewired
  - **Evidence:** artifact `api_response`, required_capture=True
  - **Case 1** — start_ref `seeded-public-doc`:
    - actor: `user`
    - step: open a public document
    - step: tap Share
    - MUST observe:
      - the URL host is the Mastra host with an `/article/<token>` path
      - the URL contains `0` `.convex.site` segments
    - MUST NOT observe:
      - a URL ending in `.convex.site` (`>0` segments)
      - a URL ending in `.convex.cloud`
      - a `convex/react` hook on the path
### AC-4: Article import creates a document via Zero mutator
- **GIVEN:** the user is on the import modal
- **WHEN:** the user imports a valid article
- **THEN:** a new document is created via the Zero mutator and appears in the list
- **Test tier:** `e2e`
- **Verification service:** `Zero mutator+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/articles/import-works.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero mutator+seeded Postgres`
  - **Negative control — would fail if:
    - stub — import is a no-op
    - mock — mutator faked without a write
    - disconnect — mutator not wired
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-documents`:
    - actor: `user`
    - step: open the import modal
    - step: submit a valid article URL
    - MUST observe:
      - `1` new `documents` row in Postgres (count increases by `1`)
      - the list count increases by `1`
      - mutator is a Zero mutator, not a `convex/react` `useMutation`
    - MUST NOT observe:
      - no new row persisted (count unchanged / `0` added)
      - a `convex/react` `useMutation` import
### AC-5: Narration playback loads via Zero query
- **GIVEN:** a seeded document with narration exists
- **WHEN:** the user taps Play
- **THEN:** the narration audio loads via Zero and plays
- **Test tier:** `e2e`
- **Verification service:** `Zero+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/articles/narration-plays.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero+seeded Postgres`
  - **Negative control — would fail if:
    - disconnect — Postgres not seeded
    - stub — player from a hardcoded URI
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-documents`:
    - actor: `user`
    - step: open a document with narration
    - step: tap Play
    - MUST observe:
      - the audio player shows a `playing` state with a numeric `duration`
      - audio URI resolves from the Zero-backed `file_objects` row
    - MUST NOT observe:
      - a disabled Play control with `0` duration
      - a `convex/react` `useQuery` import
### AC-6: No convex/react imports remain in the documents cluster [PRIMARY]
- **GIVEN:** all documents-cluster files have been rewired
- **WHEN:** the verifier scans the documents-cluster roots
- **THEN:** zero convex/react imports remain and the cluster reads through the Zero seam
- **Test tier:** `integration`
- **Verification service:** `holo verify:no-convex-client`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `holo verify:no-convex-client --roots 'app/articles.tsx,app/articles,app/document,components/ArticleCard.tsx,components/articles'`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `holo verify:no-convex-client`
  - **Negative control — would fail if:
    - stub — verifier not implemented
    - empty — cluster not yet rewired
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `seeded-documents`:
    - actor: `cli_user`
    - step: run `holo verify:no-convex-client --roots 'app/articles.tsx,app/articles/[id].tsx,app/document/[id].tsx,components/ArticleCard.tsx,components/articles/ArticleImportModal.tsx'`
    - MUST observe:
      - `0` `convex/react` import lines in the cluster
      - cluster hooks import from `app/zero/queries` (`>=1` Zero import)
    - MUST NOT observe:
      - any `from 'convex/react'` line (`>0` hits)
      - any `useQuery`/`useMutation` from convex/react
## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Articles list loads the 12 seeded documents via Zero | AC-1 | `maestro test .maestro/articles/list-loads.yml` |
| TC-2 | Article detail loads via Zero | AC-2 | `maestro test .maestro/articles/detail-loads.yml` |
| TC-3 | Share URL points to the Mastra /article/ host | AC-3 | `maestro test .maestro/articles/share-url-mastra.yml` |
| TC-4 | Article import creates a document via Zero mutator | AC-4 | `maestro test .maestro/articles/import-works.yml` |
| TC-5 | Narration playback loads via Zero | AC-5 | `maestro test .maestro/articles/narration-plays.yml` |
| TC-6 | Zero convex/react imports in the documents cluster | AC-6 | `holo verify:no-convex-client --roots 'app/articles.tsx,app/articles,app/document,components/ArticleCard.tsx,components/articles'` |

## Reading List
- `RULES.md` (RN conventions: react-native-paper `Text`, semantic theme tokens, `testID`, `ScreenLayout` for `(drawer)/`)
- `.spec/prds/mk6-migration/08-uc-sync.md` — UC-SYNC-01 (the contract every cluster serves)
- `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml` — the approved call-site→target mapping this task executes
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — T-SYNC-001/002/004/019 rows
- `app/zero/schema.ts`, `app/zero/queries.ts` — the Zero seam + existing queries/mutators to reuse
- `app/articles.tsx` (MODIFY)
- `app/articles/[id].tsx` (MODIFY)
- `app/document/[id].tsx` (MODIFY)
- `components/ArticleCard.tsx` (MODIFY)
- `components/articles/ArticleImportModal.tsx` (MODIFY)

## Guardrails
**Write allowed:**
- `app/articles.tsx (MODIFY)`
- `app/articles/[id].tsx (MODIFY)`
- `app/document/[id].tsx (MODIFY)`
- `components/ArticleCard.tsx (MODIFY)`
- `components/articles/ArticleImportModal.tsx (MODIFY)`
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
- **TC-1** — `Articles list loads the 12 seeded documents via Zero`
  - command: `maestro test .maestro/articles/list-loads.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-2** — `Article detail loads via Zero`
  - command: `maestro test .maestro/articles/detail-loads.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-3** — `Share URL points to the Mastra /article/ host`
  - command: `maestro test .maestro/articles/share-url-mastra.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-4** — `Article import creates a document via Zero mutator`
  - command: `maestro test .maestro/articles/import-works.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-5** — `Narration playback loads via Zero`
  - command: `maestro test .maestro/articles/narration-plays.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-6** — `Zero convex/react imports in the documents cluster`
  - command: `holo verify:no-convex-client --roots 'app/articles.tsx,app/articles,app/document,components/ArticleCard.tsx,components/articles'`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **Type check clean** — `pnpm tsc --noEmit` → Exit 0
- **Lint pass** — `pnpm lint` → Exit 0
- **Scenario fakeability** — `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REWRITE-02.json` → Exit 0

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
- PRD refs: UC-SYNC-01, T-SYNC-001, T-SYNC-002, T-SYNC-004, T-SYNC-019.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-REWRITE-02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-documents": {
      "description": "12 documents seeded by `holo seed:e2e --reset`, grouped by category, reactive over Zero",
      "seed_method": "public_api",
      "records": [
        "12 documents exist in Postgres after `holo seed:e2e --reset`",
        "documents carry a `category` field used for grouping",
        ">=1 document is marked public with a valid share token"
      ]
    },
    "seeded-public-doc": {
      "description": "One seeded public document with a share token",
      "seed_method": "public_api",
      "records": [
        "one document with is_public=true and a share_token pointing at the Mastra /article/ host"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN: 12 documents are seeded via `holo seed:e2e --reset` WHEN: the user opens Articles THEN: the 12 seeded documents load via Zero grouped by category",
      "verify": "maestro test .maestro/articles/list-loads.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect \u2014 Postgres not seeded",
            "empty \u2014 Zero returns no documents",
            "stub \u2014 list from a hardcoded array"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-documents",
            "action": {
              "actor": "user",
              "steps": [
                "open the Articles screen"
              ]
            },
            "end_state": {
              "must_observe": [
                "`12` document cards rendered (matches the `12` seeded)",
                "cards grouped under `>=1` `category` header",
                "list bound to a Zero `useQuery`"
              ],
              "must_not_observe": [
                "the `No documents` empty state (`0` cards)",
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
      "description": "GIVEN: a seeded document exists WHEN: the user opens a document detail THEN: the document title and content load via Zero",
      "verify": "maestro test .maestro/articles/detail-loads.yml",
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
            "stub \u2014 detail from hardcoded content"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-documents",
            "action": {
              "actor": "user",
              "steps": [
                "tap a document card to open detail"
              ]
            },
            "end_state": {
              "must_observe": [
                "the document `title` and non-empty `content` render via Zero",
                "detail bound to a Zero `useQuery`"
              ],
              "must_not_observe": [
                "a `Document not found` fallback for a present doc (`0` content)",
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
      "description": "GIVEN: a seeded public document is open in app/document/[id].tsx WHEN: the user taps Share THEN: the generated URL points at the Mastra /article/ host and contains no .convex.site rewrite",
      "verify": "maestro test .maestro/articles/share-url-mastra.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Mastra /article/ host",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 builder returns a hardcoded .convex.site URL",
            "disconnect \u2014 builder not rewired"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-public-doc",
            "action": {
              "actor": "user",
              "steps": [
                "open a public document",
                "tap Share"
              ]
            },
            "end_state": {
              "must_observe": [
                "the URL host is the Mastra host with an `/article/<token>` path",
                "the URL contains `0` `.convex.site` segments"
              ],
              "must_not_observe": [
                "a URL ending in `.convex.site` (`>0` segments)",
                "a URL ending in `.convex.cloud`",
                "a `convex/react` hook on the path"
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
      "description": "GIVEN: the user is on the import modal WHEN: the user imports a valid article THEN: a new document is created via the Zero mutator and appears in the list",
      "verify": "maestro test .maestro/articles/import-works.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero mutator+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 import is a no-op",
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
            "start_ref": "seeded-documents",
            "action": {
              "actor": "user",
              "steps": [
                "open the import modal",
                "submit a valid article URL"
              ]
            },
            "end_state": {
              "must_observe": [
                "`1` new `documents` row in Postgres (count increases by `1`)",
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
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN: a seeded document with narration exists WHEN: the user taps Play THEN: the narration audio loads via Zero and plays",
      "verify": "maestro test .maestro/articles/narration-plays.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect \u2014 Postgres not seeded",
            "stub \u2014 player from a hardcoded URI"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-documents",
            "action": {
              "actor": "user",
              "steps": [
                "open a document with narration",
                "tap Play"
              ]
            },
            "end_state": {
              "must_observe": [
                "the audio player shows a `playing` state with a numeric `duration`",
                "audio URI resolves from the Zero-backed `file_objects` row"
              ],
              "must_not_observe": [
                "a disabled Play control with `0` duration",
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
      "description": "GIVEN: all documents-cluster files have been rewired WHEN: the verifier scans the documents-cluster roots THEN: zero convex/react imports remain and the cluster reads through the Zero seam",
      "verify": "holo verify:no-convex-client --roots 'app/articles.tsx,app/articles,app/document,components/ArticleCard.tsx,components/articles'",
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
            "start_ref": "seeded-documents",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo verify:no-convex-client --roots 'app/articles.tsx,app/articles/[id].tsx,app/document/[id].tsx,components/ArticleCard.tsx,components/articles/ArticleImportModal.tsx'`"
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
      "description": "Articles list loads the 12 seeded documents via Zero",
      "verify": "maestro test .maestro/articles/list-loads.yml",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Article detail loads via Zero",
      "verify": "maestro test .maestro/articles/detail-loads.yml",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Share URL points to the Mastra /article/ host",
      "verify": "maestro test .maestro/articles/share-url-mastra.yml",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Article import creates a document via Zero mutator",
      "verify": "maestro test .maestro/articles/import-works.yml",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Narration playback loads via Zero",
      "verify": "maestro test .maestro/articles/narration-plays.yml",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Zero convex/react imports in the documents cluster",
      "verify": "holo verify:no-convex-client --roots 'app/articles.tsx,app/articles,app/document,components/ArticleCard.tsx,components/articles'",
      "maps_to_ac": "AC-6"
    }
  ]
}
-->
