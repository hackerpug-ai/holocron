# S-REWRITE-01: Rewire Chat + conversations cluster to Zero/Hono
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
Rewire every Chat + conversations screen/component from convex/react hooks to Zero reactive queries and Zero mutators / Hono commands per the approved client-data-contract, preserving existing theme/a11y/ScreenLayout and creating no new screen files.

## Background
Rewire every Chat + conversations screen/component from convex/react hooks to Zero reactive queries and Zero mutators / Hono commands per the approved client-data-contract, preserving existing theme/a11y/ScreenLayout and creating no new screen files. This is Sprint 24 (UC-SYNC-01; UC-SYNC-01, T-SYNC-001, T-SYNC-002, T-SYNC-019). The Zero provider, `app/zero/schema.ts`, and `app/zero/queries.ts` already exist from Sprint 20; the approved call-site→target mapping lives in `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml` from Sprint 21. This sprint *rewires existing surfaces in place* — it does not create new screens.

## Specification
- **Objective:** Rewire every Chat + conversations screen/component from convex/react hooks to Zero reactive queries and Zero mutators / Hono commands per the approved client-data-contract, preserving existing theme/a11y/ScreenLayout and creating no new screen files.
- **Success state:** The drawer conversation list, rename/delete, chat thread, message soft-delete, agent cancel, and chat composer send all read/write through Zero/Hono against seeded Postgres; zero convex/react imports remain in the cluster.

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
### AC-1: Drawer conversation list loads via Zero query [PRIMARY]
- **GIVEN:** 3 conversations are seeded in Postgres via `holo seed:e2e --reset` and the app is cold-booted
- **WHEN:** the user opens the drawer chat list
- **THEN:** the list shows 3 conversation rows (matching the 3 seeded) via Zero, not the empty state
- **Test tier:** `e2e`
- **Verification service:** `Zero+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/chat/drawer-loads-seeded.yml on a named iOS Simulator after `holo seed:e2e --reset``
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero+seeded Postgres`
  - **Negative control — would fail if:
    - disconnect — Postgres not seeded / Zero socket down
    - empty — Zero query returns no rows
    - stub — list still calls convex/react useQuery
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-conversations`:
    - actor: `user`
    - step: open the drawer chat list
    - MUST observe:
      - `3` conversation rows rendered (matches the `3` seeded)
      - each row shows a non-empty `title` and `lastMessage`
      - the list is bound to a Zero `useQuery`, not a static array
    - MUST NOT observe:
      - the `No conversations yet` empty state (`0` rows)
      - a `convex/react` `useQuery` import
### AC-2: Conversation rename reflects via Zero mutator within the 5s SLO [PRIMARY]
- **GIVEN:** a seeded conversation is open in the drawer
- **WHEN:** the user renames it to 'Sprint Planning' via the rename dialog
- **THEN:** the new title 'Sprint Planning' reflects on the row within the 5s SLO via the Zero mutator and the row count stays 3 (no duplicate)
- **Test tier:** `e2e`
- **Verification service:** `Zero mutator+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/chat/rename-reflects.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero mutator+seeded Postgres`
  - **Negative control — would fail if:
    - stub — rename is a local-only no-op not persisted
    - mock — mutator mocked to return success without writing
    - disconnect — Zero mutator not wired
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-conversations`:
    - actor: `user`
    - step: open rename dialog on one conversation
    - step: enter 'Sprint Planning' and confirm
    - MUST observe:
      - the renamed row's `title` updates to `Sprint Planning`
      - row count stays `3` (`1` changed, `0` added)
      - Postgres row `title` matches within the `5s` SLO
    - MUST NOT observe:
      - the previous `title` value persists (`0` updates applied)
      - a duplicate row (count `4`)
      - a `convex/react` `useMutation` import
### AC-3: Chat thread loads messages via Zero query [PRIMARY]
- **GIVEN:** a seeded conversation with >=3 messages is open
- **WHEN:** the user opens the conversation thread
- **THEN:** the thread renders the >=3 seeded messages via Zero in order
- **Test tier:** `e2e`
- **Verification service:** `Zero+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/chat/thread-loads.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Zero+seeded Postgres`
  - **Negative control — would fail if:
    - disconnect — Postgres not seeded
    - empty — Zero returns no messages
    - stub — thread rendered from a hardcoded array
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-conversation-with-messages`:
    - actor: `user`
    - step: open the conversation thread
    - MUST observe:
      - `>=3` message bubbles rendered in order via Zero
      - each bubble shows a non-empty `text` field
      - thread bound to a Zero `useQuery`
    - MUST NOT observe:
      - the `No messages` empty state (`0` bubbles)
      - a `convex/react` `useQuery` import
### AC-4: Chat composer send streams a reply via Hono command [PRIMARY]
- **GIVEN:** a seeded conversation thread is open
- **WHEN:** the user sends a message from the composer
- **THEN:** the message is sent via the Hono chat command and the assistant reply streams back via SSE; no convex/react useAction on the path
- **Test tier:** `e2e`
- **Verification service:** `Hono command+SSE+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/chat/send-streams.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Hono command+SSE+seeded Postgres`
  - **Negative control — would fail if:
    - disconnect — Hono command not wired
    - stub — reply is a hardcoded string not from the fleet
    - mock — SSE faked without a durable row
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-conversation-with-messages`:
    - actor: `user`
    - step: type a message in the composer
    - step: press send
    - MUST observe:
      - `>=1` new `messages` row in Postgres (count increases by `1`)
      - `>=1` `data:` SSE token event from the fleet specialist
      - the sent `body` renders as a new user bubble
    - MUST NOT observe:
      - `0` streamed SSE tokens
      - a `convex/react` `useAction` import
      - no persisted message row (count unchanged)
### AC-5: Agent cancel stops the in-flight stream via Hono command
- **GIVEN:** an assistant reply is streaming
- **WHEN:** the user taps cancel
- **THEN:** streaming stops and the partial turn is finalized via the Hono cancel command; no convex/react on the path
- **Test tier:** `e2e`
- **Verification service:** `Hono command+seeded Postgres`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `maestro test .maestro/chat/cancel-works.yml`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `e2e` · **Topology:** `single-node`
  - **Verification service:** `Hono command+seeded Postgres`
  - **Negative control — would fail if:
    - stub — cancel is a no-op
    - disconnect — cancel command not wired
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-conversation-with-messages`:
    - actor: `user`
    - step: while a reply is streaming, tap the cancel control
    - MUST observe:
      - `0` further SSE tokens after cancel
      - the turn row reaches a terminal `status` (e.g. `cancelled`)
      - cancel dispatched via the Hono command (`POST`, not a convex action)
    - MUST NOT observe:
      - streaming continues (`>0` further tokens after cancel)
      - a `convex/react` `useAction` import (no effect)
### AC-6: No convex/react imports remain in the chat cluster [PRIMARY]
- **GIVEN:** all chat-cluster files have been rewired
- **WHEN:** the verifier scans the chat-cluster roots for convex/react imports
- **THEN:** zero `convex/react` import statements remain and the cluster reads through the Zero seam
- **Test tier:** `integration`
- **Verification service:** `holo verify:no-convex-client`
- **Flow ref:** `UC-SYNC-01`
- **Verify:** `holo verify:no-convex-client --roots 'app/(drawer)/chat,components/chat,hooks/use-chat-history.ts,hooks/use-agent-activity.ts'`
- **Scenario:**
  - **Tier:** `visible` · **Test tier:** `integration` · **Topology:** `single-node`
  - **Verification service:** `holo verify:no-convex-client`
  - **Negative control — would fail if:
    - stub — verifier not implemented
    - empty — cluster not yet rewired
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `seeded-conversations`:
    - actor: `cli_user`
    - step: run `holo verify:no-convex-client --roots app/(drawer)/chat components/chat hooks/use-chat-history.ts hooks/use-agent-activity.ts`
    - MUST observe:
      - `0` `convex/react` import lines in the cluster
      - cluster hooks import from `app/zero/queries` (`>=1` Zero import)
    - MUST NOT observe:
      - any `from 'convex/react'` line (`>0` hits)
      - any `useQuery`/`useMutation`/`useAction` from convex/react
## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Drawer loads the 3 seeded conversations via Zero | AC-1 | `maestro test .maestro/chat/drawer-loads-seeded.yml on a named iOS Simulator after `holo seed:e2e --reset`` |
| TC-2 | Conversation rename reflects within the 5s SLO via the Zero mutator | AC-2 | `maestro test .maestro/chat/rename-reflects.yml` |
| TC-3 | Chat thread loads the seeded messages via Zero | AC-3 | `maestro test .maestro/chat/thread-loads.yml` |
| TC-4 | Composer send streams an assistant reply via the Hono command | AC-4 | `maestro test .maestro/chat/send-streams.yml` |
| TC-5 | Agent cancel stops the in-flight stream | AC-5 | `maestro test .maestro/chat/cancel-works.yml` |
| TC-6 | Zero convex/react imports in the chat cluster | AC-6 | `holo verify:no-convex-client --roots 'app/(drawer)/chat,components/chat,hooks/use-chat-history.ts,hooks/use-agent-activity.ts'` |

## Reading List
- `RULES.md` (RN conventions: react-native-paper `Text`, semantic theme tokens, `testID`, `ScreenLayout` for `(drawer)/`)
- `.spec/prds/mk6-migration/08-uc-sync.md` — UC-SYNC-01 (the contract every cluster serves)
- `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml` — the approved call-site→target mapping this task executes
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — T-SYNC-001/002/004/019 rows
- `app/zero/schema.ts`, `app/zero/queries.ts` — the Zero seam + existing queries/mutators to reuse
- `app/(drawer)/_layout.tsx` (MODIFY)
- `app/(drawer)/chat/[conversationId].tsx` (MODIFY)
- `components/chat/ChatPickerSheet.tsx` (MODIFY)
- `components/chat/MessageBubble.tsx` (MODIFY)
- `components/agent/ToolApprovalCard.tsx` (MODIFY)
- `hooks/use-chat-history.ts` (MODIFY)

## Guardrails
**Write allowed:**
- `app/(drawer)/_layout.tsx (MODIFY)`
- `app/(drawer)/chat/[conversationId].tsx (MODIFY)`
- `components/chat/ChatPickerSheet.tsx (MODIFY)`
- `components/chat/MessageBubble.tsx (MODIFY)`
- `components/agent/ToolApprovalCard.tsx (MODIFY)`
- `hooks/use-chat-history.ts (MODIFY)`
- `hooks/use-agent-activity.ts (MODIFY)`
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
- **TC-1** — `Drawer loads the 3 seeded conversations via Zero`
  - command: `maestro test .maestro/chat/drawer-loads-seeded.yml on a named iOS Simulator after `holo seed:e2e --reset``
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-2** — `Conversation rename reflects within the 5s SLO via the Zero mutator`
  - command: `maestro test .maestro/chat/rename-reflects.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-3** — `Chat thread loads the seeded messages via Zero`
  - command: `maestro test .maestro/chat/thread-loads.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-4** — `Composer send streams an assistant reply via the Hono command`
  - command: `maestro test .maestro/chat/send-streams.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-5** — `Agent cancel stops the in-flight stream`
  - command: `maestro test .maestro/chat/cancel-works.yml`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **TC-6** — `Zero convex/react imports in the chat cluster`
  - command: `holo verify:no-convex-client --roots 'app/(drawer)/chat,components/chat,hooks/use-chat-history.ts,hooks/use-agent-activity.ts'`
  - expected: Exit 0 (or the documented non-zero for negative controls)
- **Type check clean** — `pnpm tsc --noEmit` → Exit 0
- **Lint pass** — `pnpm lint` → Exit 0
- **Scenario fakeability** — `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REWRITE-01.json` → Exit 0

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
  "task_id": "S-REWRITE-01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-conversations": {
      "description": "3 conversations seeded by `holo seed:e2e --reset`, reactive over Zero",
      "seed_method": "public_api",
      "records": [
        "3 conversations exist in Postgres after `holo seed:e2e --reset`",
        "each conversation has a title, an id, and >=1 message row"
      ]
    },
    "seeded-conversation-with-messages": {
      "description": "One seeded conversation with a durable message thread",
      "seed_method": "public_api",
      "records": [
        "one conversation with >=3 messages in the messages table"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN: 3 conversations are seeded in Postgres via `holo seed:e2e --reset` and the app is cold-booted WHEN: the user opens the drawer chat list THEN: the list shows 3 conversation rows (matching the 3 seeded) via Zero, not the empty state",
      "verify": "maestro test .maestro/chat/drawer-loads-seeded.yml on a named iOS Simulator after `holo seed:e2e --reset`",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect \u2014 Postgres not seeded / Zero socket down",
            "empty \u2014 Zero query returns no rows",
            "stub \u2014 list still calls convex/react useQuery"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-conversations",
            "action": {
              "actor": "user",
              "steps": [
                "open the drawer chat list"
              ]
            },
            "end_state": {
              "must_observe": [
                "`3` conversation rows rendered (matches the `3` seeded)",
                "each row shows a non-empty `title` and `lastMessage`",
                "the list is bound to a Zero `useQuery`, not a static array"
              ],
              "must_not_observe": [
                "the `No conversations yet` empty state (`0` rows)",
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
      "description": "GIVEN: a seeded conversation is open in the drawer WHEN: the user renames it to 'Sprint Planning' via the rename dialog THEN: the new title 'Sprint Planning' reflects on the row within the 5s SLO via the Zero mutator and the row count stays 3 (no duplicate)",
      "verify": "maestro test .maestro/chat/rename-reflects.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero mutator+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 rename is a local-only no-op not persisted",
            "mock \u2014 mutator mocked to return success without writing",
            "disconnect \u2014 Zero mutator not wired"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-conversations",
            "action": {
              "actor": "user",
              "steps": [
                "open rename dialog on one conversation",
                "enter 'Sprint Planning' and confirm"
              ]
            },
            "end_state": {
              "must_observe": [
                "the renamed row's `title` updates to `Sprint Planning`",
                "row count stays `3` (`1` changed, `0` added)",
                "Postgres row `title` matches within the `5s` SLO"
              ],
              "must_not_observe": [
                "the previous `title` value persists (`0` updates applied)",
                "a duplicate row (count `4`)",
                "a `convex/react` `useMutation` import"
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
      "description": "GIVEN: a seeded conversation with >=3 messages is open WHEN: the user opens the conversation thread THEN: the thread renders the >=3 seeded messages via Zero in order",
      "verify": "maestro test .maestro/chat/thread-loads.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Zero+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect \u2014 Postgres not seeded",
            "empty \u2014 Zero returns no messages",
            "stub \u2014 thread rendered from a hardcoded array"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-conversation-with-messages",
            "action": {
              "actor": "user",
              "steps": [
                "open the conversation thread"
              ]
            },
            "end_state": {
              "must_observe": [
                "`>=3` message bubbles rendered in order via Zero",
                "each bubble shows a non-empty `text` field",
                "thread bound to a Zero `useQuery`"
              ],
              "must_not_observe": [
                "the `No messages` empty state (`0` bubbles)",
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
      "primary": true,
      "description": "GIVEN: a seeded conversation thread is open WHEN: the user sends a message from the composer THEN: the message is sent via the Hono chat command and the assistant reply streams back via SSE; no convex/react useAction on the path",
      "verify": "maestro test .maestro/chat/send-streams.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Hono command+SSE+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect \u2014 Hono command not wired",
            "stub \u2014 reply is a hardcoded string not from the fleet",
            "mock \u2014 SSE faked without a durable row"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-conversation-with-messages",
            "action": {
              "actor": "user",
              "steps": [
                "type a message in the composer",
                "press send"
              ]
            },
            "end_state": {
              "must_observe": [
                "`>=1` new `messages` row in Postgres (count increases by `1`)",
                "`>=1` `data:` SSE token event from the fleet specialist",
                "the sent `body` renders as a new user bubble"
              ],
              "must_not_observe": [
                "`0` streamed SSE tokens",
                "a `convex/react` `useAction` import",
                "no persisted message row (count unchanged)"
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
      "description": "GIVEN: an assistant reply is streaming WHEN: the user taps cancel THEN: streaming stops and the partial turn is finalized via the Hono cancel command; no convex/react on the path",
      "verify": "maestro test .maestro/chat/cancel-works.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Hono command+seeded Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 cancel is a no-op",
            "disconnect \u2014 cancel command not wired"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-conversation-with-messages",
            "action": {
              "actor": "user",
              "steps": [
                "while a reply is streaming, tap the cancel control"
              ]
            },
            "end_state": {
              "must_observe": [
                "`0` further SSE tokens after cancel",
                "the turn row reaches a terminal `status` (e.g. `cancelled`)",
                "cancel dispatched via the Hono command (`POST`, not a convex action)"
              ],
              "must_not_observe": [
                "streaming continues (`>0` further tokens after cancel)",
                "a `convex/react` `useAction` import (no effect)"
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
      "description": "GIVEN: all chat-cluster files have been rewired WHEN: the verifier scans the chat-cluster roots for convex/react imports THEN: zero `convex/react` import statements remain and the cluster reads through the Zero seam",
      "verify": "holo verify:no-convex-client --roots 'app/(drawer)/chat,components/chat,hooks/use-chat-history.ts,hooks/use-agent-activity.ts'",
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
            "start_ref": "seeded-conversations",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `holo verify:no-convex-client --roots app/(drawer)/chat components/chat hooks/use-chat-history.ts hooks/use-agent-activity.ts`"
              ]
            },
            "end_state": {
              "must_observe": [
                "`0` `convex/react` import lines in the cluster",
                "cluster hooks import from `app/zero/queries` (`>=1` Zero import)"
              ],
              "must_not_observe": [
                "any `from 'convex/react'` line (`>0` hits)",
                "any `useQuery`/`useMutation`/`useAction` from convex/react"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Drawer loads the 3 seeded conversations via Zero",
      "verify": "maestro test .maestro/chat/drawer-loads-seeded.yml on a named iOS Simulator after `holo seed:e2e --reset`",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Conversation rename reflects within the 5s SLO via the Zero mutator",
      "verify": "maestro test .maestro/chat/rename-reflects.yml",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Chat thread loads the seeded messages via Zero",
      "verify": "maestro test .maestro/chat/thread-loads.yml",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Composer send streams an assistant reply via the Hono command",
      "verify": "maestro test .maestro/chat/send-streams.yml",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Agent cancel stops the in-flight stream",
      "verify": "maestro test .maestro/chat/cancel-works.yml",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Zero convex/react imports in the chat cluster",
      "verify": "holo verify:no-convex-client --roots 'app/(drawer)/chat,components/chat,hooks/use-chat-history.ts,hooks/use-agent-activity.ts'",
      "maps_to_ac": "AC-6"
    }
  ]
}
-->
