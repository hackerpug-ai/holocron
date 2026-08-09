# S31-FE-04 — Delete the screen-level second reconciler and its module-level mutable globals

**PROPOSED-BY:** react-native-ui-planner · **Sprint:** sprint-31-migration-integrity-remediation · **Template:** TASK-TEMPLATE v5.2

## What this does
Removes the second, weaker message-merge implemented on the chat screen along with its two module-level mutable globals, leaving `reconcileThreadMessages` as the single reconciliation algorithm.

## Why
Reconciliation runs twice with unequal algorithms and the weaker one runs LAST, so it decides what the user sees. Its state lives in module singletons that persist across remount and across conversation switches, so conversation B can inherit conversation A's turn. UC-SYNC-02 AC-2 describes the sound algorithm only.

## How to verify
`bash .maestro/reactive/run-conversation-switch-no-leak.sh` — send in conversation A, navigate to B, and A's marker text must be absent from B. Four unit regressions over `reconcileThreadMessages` cover the optimistic bubble, replay, prefix collision, and identity.

## Scope
Touches `app/(drawer)/chat/[conversationId].tsx`, `hooks/use-resumable-sse-stream.ts`, `hooks/use-chat-history.ts` and the e2e seed. No rendering change is intended.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-FE-04 - Delete the screen-level second reconciler and its module-level mutable globals
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P1
EFFORT:     M
AGENT:      implementer=react-native-ui-implementer | reviewer=react-native-ui-reviewer
PROPOSED-BY: react-native-ui-planner
ESTIMATE:   180 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-SYNC-01
PRD_REFS:   08-uc-sync.md UC-SYNC-02 AC-2

RUNTIME_COMMANDS:
  test:      pnpm test:unit ; PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/6 ACs complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, <=30 words — observable success)
--------------------------------------------------------------------------------

The chat screen renders whatever reconcileThreadMessages returns, holds no module-level mutable turn state, and leaks nothing between conversations.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER introduce a replacement module-level mutable variable, a module-scoped Map keyed by conversation id, or any other singleton in the screen. Module singletons persist across unmount/remount AND across conversation switches — that is the defect being removed, not the mechanism to reuse.
- NEVER key message identity on content equality (:259-264, :326-331) or a content prefix (:341). A 24-character prefix collides on any two messages sharing an opening phrase; use a client-generated id.
- NEVER change a testID, add a component, or alter the degraded/error presentation. This is a data-path change with no intended visual delta; if a failure surface appears it must be the existing banner at components/chat/ChatThread.tsx:434-450.
- NEVER let reconcileThreadMessages become impure — no module reads, no side effects, and no Date.now() feeding identity (its display-only new Date() at :393 may stay).
- NEVER delete a compensating branch without first proving it redundant. UNIT_TEST_JUSTIFIED applies to AC-1/AC-2/AC-3 only: they target a pure array-in/array-out reducer with 0 I/O, and the real-service integration is covered by AC-4, AC-5 and AC-6.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Navigating conversation A to B leaks 0 messages between them — AC-4 (PRIMARY)
- [ ] An optimistic bubble plus its durable row yields exactly 1 bubble — AC-1
- [ ] Replayed events at or below lastSeq change nothing — AC-2
- [ ] Two messages sharing a 24-character prefix stay 2 distinct bubbles — AC-3
- [ ] A live send yields 1 user bubble and 1 assistant bubble — AC-5
- [ ] pnpm test:unit + PLATFORM_IT=1 pnpm test:integration pass; pnpm tsgo --noEmit and pnpm biome check . clean
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-4: Switching conversations leaks no state between them [PRIMARY]
  GIVEN: two seeded conversations with distinguishable content and a healthy stack
  WHEN:  the operator sends in A, lets it complete, then navigates to B
  THEN:  B shows only B messages and its composer is enabled

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  maestro-ios-simulator + real Postgres + real zero-cache on 4848 + real Mastra on 4111
  TDD_STATE:     none
  TEST_FILE:     .maestro/reactive/conversation-switch-no-leak.yml
  TEST_FUNCTION: conversation-switch-no-leak

  SCENARIO:
    START_REF:        two-conversations-seeded
    NEGATIVE_CONTROL: would fail if the module globals are left in place so B inherits A state, the thread renders mocked rows, or B is a static shell
    EVIDENCE:         screenshot
    CASES:
      - ACTION:           openLink A, send 'ZZTOPMARKER conversation A probe', wait for chat-agent-busy-false, openLink B
        MUST_OBSERVE:     conversation B seeded message text renders with >=10 characters; `chat-agent-busy-false` resolves to 1 node on B
        MUST_NOT_OBSERVE: 'ZZTOPMARKER conversation A probe' appears 0 times in B; `chat-loading-inline` visible 0 times on B

AC-1: Optimistic bubble and its durable row yield exactly one bubble
  GIVEN: an optimistic entry with a client id and a durable row with the same content
  WHEN:  reconcileThreadMessages runs with both
  THEN:  exactly one user bubble results, keyed by the durable id

  TEST_TIER:             unit — UNIT_TEST_JUSTIFIED: pure array-in/array-out reducer with 0 I/O; real-Zero behavior is AC-5
  VERIFICATION_SERVICE:  null (pure logic)
  TDD_STATE:     none
  TEST_FILE:     tests/unit/reconcile-thread-messages.test.ts
  TEST_FUNCTION: optimistic bubble collapses into durable row

AC-2: Replayed events with seq at or below lastSeq are ignored
  GIVEN: an overlay assembled to lastSeq 7
  WHEN:  events with seq 3, 5 and 7 are replayed
  THEN:  content and array length are unchanged

  TEST_TIER:             unit — UNIT_TEST_JUSTIFIED: pure reducer over event objects with 0 I/O; the live replay path is covered by .maestro/reactive/reconnect-exactly-once.yml
  VERIFICATION_SERVICE:  null (pure logic)
  TDD_STATE:     none
  TEST_FILE:     tests/unit/reconcile-thread-messages.test.ts
  TEST_FUNCTION: replayed events below lastSeq are ignored

AC-3: Two messages sharing a 24-character prefix stay distinct
  GIVEN: two durable messages identical through character 24
  WHEN:  reconcileThreadMessages runs with an active overlay
  THEN:  both survive as distinct entries with their own ids

  TEST_TIER:             unit — UNIT_TEST_JUSTIFIED: pure function over arrays with 0 I/O; the rendered equivalent is AC-5
  VERIFICATION_SERVICE:  null (pure logic)
  TDD_STATE:     none
  TEST_FILE:     tests/unit/reconcile-thread-messages.test.ts
  TEST_FUNCTION: prefix collision keeps messages distinct

AC-5: A live send yields one user bubble and one assistant bubble
  GIVEN: a seeded conversation holding the prefix-colliding pair and the screen merge deleted
  WHEN:  the operator sends a message and the run completes
  THEN:  1 bubble for the sent message, 1 assistant bubble, and both colliding messages stay distinct

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  maestro-ios-simulator + real Mastra on 4111 + real Postgres + real zero-cache on 4848
  TDD_STATE:     none
  TEST_FILE:     .maestro/chat/send-streams.yml
  TEST_FUNCTION: send-streams-prefix-collision

AC-6: Remount mid-run rehydrates through the hook snapshot, not a screen global
  GIVEN: a run mid-stream and the globals deleted
  WHEN:  the screen unmounts and remounts
  THEN:  the turn is restored with 0 foreign conversation state present

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  maestro-ios-simulator + real Mastra streaming on 4111
  TDD_STATE:     none
  TEST_FILE:     .maestro/reactive/conversation-switch-no-leak.yml
  TEST_FUNCTION: remount-rehydrate

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- app/(drawer)/chat/[conversationId].tsx (MODIFY — delete :92, :107, :247, :254-269, :272-316, :319-348, :352-439)
- hooks/use-resumable-sse-stream.ts (MODIFY — extend reconcileThreadMessages only)
- hooks/use-chat-history.ts (MODIFY)
- .maestro/reactive/conversation-switch-no-leak.yml (NEW)
- .maestro/reactive/run-conversation-switch-no-leak.sh (NEW)
- tests/unit/reconcile-thread-messages.test.ts (NEW)
- tests/integration/s31-fe-04-single-reconciler.test.ts (NEW)
- services/platform seed helpers (MODIFY — only to add the prefix-colliding message pair)

writeProhibited:
- components/chat/ChatThread.tsx — rendering is unchanged; S31-FE-02 owns it
- components/ui/** — no new or modified primitives
- app/zero/schema.ts — no schema change
- services/platform/src/http/** — no route change
- Any new module-scoped mutable binding anywhere under app/

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First)
--------------------------------------------------------------------------------

✅ Always:
- Let the screen render the array useChatHistory returns, with no further merging.
- Key the optimistic entry on a collision-safe client-generated id, not a bare Date.now() string.
- Put any genuinely compensating case inside reconcileThreadMessages or the hook's conversation-scoped remount snapshot at :438-504.
- Delete dead code outright rather than commenting it out.
- Preserve the GATE-FIX-01 guards already encoded at :336-340 and :385.

⚠️ Ask First:
- Changing the reconcileThreadMessages signature beyond an optional third argument.
- Extending the e2e seed with anything beyond the prefix-colliding pair.
- Touching the hook's ModuleStreamHandoff lifecycle rather than reading from it.
- Any change that alters rendered output on the happy path.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- hooks/use-resumable-sse-stream.ts (MODIFY): reconcileThreadMessages accepts the optimistic entry keyed by client id — blocker file, use-chat-history imports it
- hooks/use-chat-history.ts (MODIFY): passes the optimistic entry through to the single reducer
- app/(drawer)/chat/[conversationId].tsx (MODIFY): both globals, the three effects, and the merge IIFE deleted
- tests/unit/reconcile-thread-messages.test.ts (NEW): AC-1, AC-2, AC-3 regressions
- .maestro/reactive/conversation-switch-no-leak.yml + run-conversation-switch-no-leak.sh (NEW): AC-4 and AC-6 evidence

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  READ:   the AC, existing tests, the READING LIST
  WRITE:  ONE test exercising GIVEN-WHEN-THEN
  RUN:    the AC's TEST_FILE
  VERIFY: the test FAILS (not errors — fails)
  RETURN: { phase: "RED", test_file, test_function, failure_output }

### GREEN PHASE (after orchestrator VERIFY_RED passes)
  WRITE:  MINIMAL code to pass
  RETURN: { phase: "GREEN", files_changed, test_output }

### REFACTOR PHASE (after orchestrator VERIFY_GREEN passes)
  WRITE:  improved code if needed; tests stay green
  RETURN: { phase: "REFACTOR", files_changed, still_passing }

## AFTER ALL ACs COMPLETE:
  Orchestrator dispatches react-native-ui-reviewer.

--------------------------------------------------------------------------------
READING LIST (max 5 files — canonical pattern first)
--------------------------------------------------------------------------------

1. components/chat/ChatThread.tsx [PRIMARY PATTERN]
   - Lines: 434-450
   - Focus: the canonical failure presentation, unchanged by this task. Read it so any surface that appears during the work reuses this banner and 0 new testIDs are introduced.

2. hooks/use-resumable-sse-stream.ts
   - Lines: 330-399, 438-526
   - Focus: reconcileThreadMessages — the surviving algorithm, including the GATE-FIX-01 comments at :336-340 and the empty-terminal-preview guard at :385; and ModuleStreamHandoff at :438-504, the deliberate conversation-scoped remount mechanism where handoff already belongs.

3. app/(drawer)/chat/[conversationId].tsx
   - Lines: 84-108, 246-348, 350-440
   - Focus: everything to delete — modulePendingUser (:92), moduleLocalTurn (:107), the three maintenance effects with their content equality at :259-264/:326-331 and the 24-character prefix at :341, and the render-time merge IIFE at :352-439 that runs last.

4. app/(drawer)/chat/[conversationId].tsx
   - Lines: 600-625
   - Focus: the send path populating both globals at :607-622, where the client id already exists as `pending-user-${Date.now()}` — replace with a collision-safe id and use it as the reconciliation key.

5. .maestro/reactive/exactly-one-final-message.yml + .maestro/reactive/degraded-no-hang.yml
   - Lines: 1-40 and 1-60
   - Focus: the existing exactly-once assertion flow that must keep passing, and the dev-client launch preamble to copy into the new no-leak flow.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED evidence — TDD_STATE shows each test went red before green.
Gate 2: One test per AC.
Gate 3: pnpm test:unit and PLATFORM_IT=1 pnpm test:integration exit 0.
Gate 4: pnpm tsgo --noEmit exits 0.
Gate 5: pnpm biome check . exits 0.
Gate 6: git diff --name-only ⊆ SCOPE.writeAllowed.
Gate 7: AC-4 (PRIMARY) is e2e; the three unit ACs each carry UNIT_TEST_JUSTIFIED.
Gate 8: validate_scenario.py exits 0 on the PRIMARY scenario; the AC-4 screenshot shows conversation B free of A's marker text, and AC-4 was watched FAIL against the pre-fix build (globals present) before it went green.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Any rendering or visual change — this is a data-path deletion
- The duplicate degraded banner — S31-FE-02 owns it
- Chat-path request deadlines — S31-FE-01 owns them
- Changing the SSE resume/Last-Event-ID contract

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** reconcileThreadMessages merges by SSE sequence id, then the screen re-merges on top using two module globals, content equality, and a 24-character prefix match.

**Gap:** the weaker algorithm runs last and decides what the user sees, and its state is a module singleton that survives remount and conversation switches.

--------------------------------------------------------------------------------
REVIEW (for react-native-ui-reviewer)
--------------------------------------------------------------------------------

Must pass (<=5, evidence-gate-backed):
- One test per AC; tests verify behavior not implementation
- RED evidence present in TDD_STATE history
- Minimal implementation; no gold-plating
- Pattern consistent with READING LIST [PRIMARY PATTERN] — 0 new testIDs, 0 visual delta
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Should verify (<=5, judgment):
- 0 module-scoped mutable bindings remain anywhere under app/
- Identity is established by id everywhere; 0 content-equality or prefix comparisons survive
- reconcileThreadMessages is still pure — no module reads, no side effects
- The optimistic client id is collision-safe within one millisecond
- Sending with the keyboard raised still scrolls the new bubble into view

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: none
Blocks:     none
Parallel:   S31-FE-01, S31-FE-02, S31-FE-05, S31-FE-06

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-FE-04",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "two-conversations-seeded": {
      "description": "Real Postgres seeded through the platform CLI with 2 distinct conversations whose message text is mutually distinguishable, both replicated over zero-cache",
      "seed_method": "cli",
      "records": [
        "conversations: 2 rows",
        "conversation A durable messages: >=2 rows",
        "conversation B durable messages: >=2 rows with text disjoint from A"
      ]
    },
    "prefix-colliding-messages": {
      "description": "Real Postgres seeded through the platform CLI with 2 durable messages identical through character 24 and divergent after",
      "seed_method": "cli",
      "records": [
        "chat_messages row m1 content 'Summarise the quarterly report for Q1'",
        "chat_messages row m2 content 'Summarise the quarterly report for Q2'",
        "shared prefix length: 24"
      ]
    },
    "reconciler-array-fixture": {
      "description": "Checked-in fixture arrays in tests/unit/reconcile-thread-messages.test.ts holding ChatMessage rows and StreamOverlay objects passed directly to the pure reducer with 0 network calls and 0 module reads",
      "seed_method": "migration_fixture",
      "records": [
        "durable array: 1 user row id 'srv-user-1'",
        "optimistic entry clientId 'cli-abc'",
        "overlay assembled to lastSeq 7 with text 'alpha beta gamma'",
        "prefix-collision pair m1 and m2"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN an optimistic pending-user entry with a client id and a durable row with the same content WHEN reconcileThreadMessages runs THEN exactly one user bubble results keyed by the durable id",
      "verify": "pnpm test:unit -t 'optimistic bubble collapses into durable row'",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-04-AC-1",
        "primary": false,
        "tier": "logic",
        "test_tier": "unit",
        "verification_service": null,
        "topology": "single-node",
        "unit_test_justified": true,
        "negative_control": {
          "would_fail_if": [
            "the reducer is a no-op that returns durable unchanged and drops nothing",
            "identity is hardcoded to content equality",
            "the optimistic entry is stubbed away before the call"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "reconciler-array-fixture",
            "action": {
              "actor": "system",
              "steps": [
                "build durable as 1 row id 'srv-user-1' content 'Summarise the quarterly report for Q1'",
                "build the optimistic entry with clientId 'cli-abc' and identical content",
                "call reconcileThreadMessages(durable, overlay, pending) and read the result array"
              ]
            },
            "end_state": {
              "must_observe": [
                "result.length == 1",
                "result[0].id == 'srv-user-1'",
                "result[0].content == 'Summarise the quarterly report for Q1'"
              ],
              "must_not_observe": [
                "2 user bubbles carrying the same content",
                "an element with id 'cli-abc' survives 0 times"
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
      "description": "GIVEN an overlay assembled to lastSeq 7 WHEN events with seq 3, 5 and 7 are replayed THEN content and array length are unchanged",
      "verify": "pnpm test:unit -t 'replayed events below lastSeq are ignored'",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-04-AC-2",
        "primary": false,
        "tier": "logic",
        "test_tier": "unit",
        "verification_service": null,
        "topology": "single-node",
        "unit_test_justified": true,
        "negative_control": {
          "would_fail_if": [
            "the seq guard is removed so replayed tokens are appended twice",
            "the assembled text is hardcoded",
            "the reducer is stubbed to return a constant"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "reconciler-array-fixture",
            "action": {
              "actor": "system",
              "steps": [
                "assemble the overlay from events seq 1 through 7 producing text 'alpha beta gamma'",
                "snapshot reconcileThreadMessages(durable, overlay)",
                "re-apply events with seq 3, seq 5 and seq 7",
                "re-run reconcileThreadMessages and compare against the snapshot"
              ]
            },
            "end_state": {
              "must_observe": [
                "post-replay assistant content == 'alpha beta gamma'",
                "post-replay array length == pre-replay array length",
                "overlay lastSeq == 7 after the replay"
              ],
              "must_not_observe": [
                "the duplicated substring 'gamma gamma' occurs 0 times",
                "a second element sharing the same durableMessageId appears 0 times"
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
      "description": "GIVEN two durable messages identical through character 24 WHEN reconcileThreadMessages runs with an active overlay THEN both survive as distinct entries",
      "verify": "pnpm test:unit -t 'prefix collision keeps messages distinct'",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-04-AC-3",
        "primary": false,
        "tier": "logic",
        "test_tier": "unit",
        "verification_service": null,
        "topology": "single-node",
        "unit_test_justified": true,
        "negative_control": {
          "would_fail_if": [
            "the deleted 24-character prefix match is reintroduced so one message is collapsed into the other",
            "content equality is used as identity",
            "the reducer is mocked"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "reconciler-array-fixture",
            "action": {
              "actor": "system",
              "steps": [
                "build durable as m1 content 'Summarise the quarterly report for Q1' and m2 content 'Summarise the quarterly report for Q2'",
                "call reconcileThreadMessages(durable, overlay) with the overlay targeting m2",
                "read the result array ids and contents"
              ]
            },
            "end_state": {
              "must_observe": [
                "result.length == 2",
                "1 element content ends with 'Q1'",
                "1 element content ends with 'Q2'"
              ],
              "must_not_observe": [
                "result.length == 1 occurs 0 times",
                "an element whose content was replaced by the other appears 0 times"
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
      "description": "GIVEN two seeded conversations and a healthy stack WHEN the operator sends in A then navigates to B THEN B shows only B messages and its composer is enabled",
      "verify": "bash .maestro/reactive/run-conversation-switch-no-leak.sh",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-04-AC-4",
        "primary": true,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator + real Postgres + real zero-cache on 4848 + real Mastra on 4111",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the module-level mutable globals are left in place so B inherits A state",
            "the thread renders mocked rows while zero-cache is disconnected",
            "conversation B is a static shell"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "two-conversations-seeded",
            "action": {
              "actor": "user",
              "steps": [
                "launchApp on the named iOS Simulator and openLink conversation A",
                "tapOn id 'chat-input-field', inputText 'ZZTOPMARKER conversation A probe', tapOn id 'chat-input-send-button'",
                "extendedWaitUntil id 'chat-agent-busy-false' visible timeout 90000",
                "openLink conversation B",
                "extendedWaitUntil the conversation B seeded message text is visible timeout 60000"
              ]
            },
            "end_state": {
              "must_observe": [
                "conversation B seeded message text renders with >=10 characters",
                "`chat-agent-busy-false` resolves to 1 node on conversation B",
                "`chat-input` on conversation B accepts focus"
              ],
              "must_not_observe": [
                "the literal text 'ZZTOPMARKER conversation A probe' appears 0 times in conversation B",
                "the conversation A assistant reply text appears 0 times in conversation B",
                "`chat-loading-inline` visible 0 times on conversation B"
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
      "description": "GIVEN a seeded conversation holding the prefix-colliding pair WHEN the operator sends a message and the run completes THEN one user bubble and one assistant bubble render and both colliding messages stay distinct",
      "verify": "maestro test .maestro/chat/send-streams.yml",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-04-AC-5",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator + real Mastra on 4111 + real Postgres + real zero-cache on 4848",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the screen-level merge is left in place so a duplicate optimistic bubble persists",
            "the assistant reply is a static canned string",
            "zero-cache is disconnected so no durable row lands"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "prefix-colliding-messages",
            "action": {
              "actor": "user",
              "steps": [
                "launchApp and openLink the conversation holding rows m1 and m2",
                "tapOn id 'chat-input-field', inputText 'QQPROBE single bubble check', tapOn id 'chat-input-send-button'",
                "extendedWaitUntil id 'chat-agent-busy-false' visible timeout 90000",
                "scroll the thread and capture the rendered bubbles"
              ]
            },
            "end_state": {
              "must_observe": [
                "the literal text 'QQPROBE single bubble check' renders exactly 1 time",
                "`chat-assistant-message-latest` carries >=20 characters of streamed reply text",
                "both 'Summarise the quarterly report for Q1' and 'Summarise the quarterly report for Q2' render as 2 separate bubbles"
              ],
              "must_not_observe": [
                "the literal text 'QQPROBE single bubble check' renders 2 times",
                "2 assistant bubbles exist for 1 run",
                "0 of the prefix-colliding messages is missing from the thread"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN a run mid-stream and the globals deleted WHEN the screen unmounts and remounts THEN the turn is restored through the hook remount snapshot with no foreign conversation state",
      "verify": "bash .maestro/reactive/run-conversation-switch-no-leak.sh",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-04-AC-6",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator + real Mastra streaming on 4111",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the remount snapshot is removed so the turn is lost on return",
            "the screen globals are reintroduced and leak across conversations",
            "the assistant bubble is a stub"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "two-conversations-seeded",
            "action": {
              "actor": "user",
              "steps": [
                "openLink conversation A and send 'RRPROBE remount check'",
                "while id 'chat-agent-busy-true' is visible, openLink conversation B",
                "immediately openLink conversation A again",
                "extendedWaitUntil id 'chat-assistant-message-latest' visible timeout 90000"
              ]
            },
            "end_state": {
              "must_observe": [
                "the literal text 'RRPROBE remount check' renders exactly 1 time in conversation A",
                "`chat-assistant-message-latest` carries >=1 character of the run assistant text",
                "`chat-agent-busy-false` resolves to 1 node once the run settles"
              ],
              "must_not_observe": [
                "conversation B seeded text appears 0 times inside conversation A",
                "2 assistant bubbles exist for the single run",
                "an empty assistant bubble steals `chat-assistant-message-latest` 0 times"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "reconcileThreadMessages with a durable user row and a same-content optimistic entry returns length 1 with the durable id",
      "verify": "pnpm test:unit -t 'optimistic bubble collapses into durable row'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "re-applying seq 3, 5 and 7 after lastSeq 7 leaves the assistant content string unchanged",
      "verify": "pnpm test:unit -t 'replayed events below lastSeq are ignored'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "re-applying seq 3, 5 and 7 after lastSeq 7 leaves the result array length unchanged",
      "verify": "pnpm test:unit -t 'replayed events below lastSeq are ignored'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "two durable messages with identical first 24 characters produce a result array of length 2 with both full contents present",
      "verify": "pnpm test:unit -t 'prefix collision keeps messages distinct'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "after sending in conversation A and navigating to B, the marker text ZZTOPMARKER conversation A probe is not visible in B",
      "verify": "bash .maestro/reactive/run-conversation-switch-no-leak.sh",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "after navigating to conversation B, the B seeded message text is visible",
      "verify": "bash .maestro/reactive/run-conversation-switch-no-leak.sh",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "after a completed send the text QQPROBE single bubble check appears exactly 1 time",
      "verify": "maestro test .maestro/chat/send-streams.yml",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "both prefix-colliding seeded messages are visible as 2 separate bubbles",
      "verify": "maestro test .maestro/chat/send-streams.yml",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "after navigating away mid-stream and back, the assistant bubble is present carrying the run text",
      "verify": "bash .maestro/reactive/run-conversation-switch-no-leak.sh",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "app/(drawer)/chat/[conversationId].tsx declares 0 module-level mutable bindings holding turn or message state",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'chat screen holds no module turn state'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": ".maestro/reactive/exactly-one-final-message.yml and .maestro/reactive/reconnect-exactly-once.yml both still pass",
      "verify": "maestro test .maestro/reactive/exactly-one-final-message.yml && maestro test .maestro/reactive/reconnect-exactly-once.yml",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "pnpm biome check . exits 0 and pnpm tsgo --noEmit exits 0",
      "verify": "pnpm biome check . && pnpm tsgo --noEmit",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->

</details>
