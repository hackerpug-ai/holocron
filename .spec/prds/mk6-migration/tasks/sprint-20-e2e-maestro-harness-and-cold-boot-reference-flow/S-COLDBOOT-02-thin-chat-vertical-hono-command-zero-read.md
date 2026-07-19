# S-COLDBOOT-02 — Prove the thin chat vertical cold-boot round-trip: send via the Hono /api/chat-runs command, read the durable message back via a Zero subscription against real Postgres + fleet
> Status: Backlog
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 210 min
> Type: FEATURE
> Priority: P0
> Proposed by: react-native-ui-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Verify and harden the thin chat vertical so a cold-booted, Convex-free RN client sends a message via the Hono /api/chat-runs command and observes the durable, fleet-generated reply arrive over the Zero subscription — closing CAP-SYNC-01 (committed PG write reaches the client) and the CAP-CUT-01 cold-boot reference gate.

**Success state:** On a named iOS Simulator, an operator types 'Sprint 20 reference-flow ping', taps send, and within the SLO sees a chat-assistant-message rendered from a Zero-synced durable Postgres row; an integration test proves the same message literal is queryable via chatMessagesByConversation against the real replica, not the response body.

## Background

- **Specialist rationale:** Owns the RN reference chat screen's send/subscribe wiring (`app/(drawer)/chat/reference.tsx`) and the Zero query used to observe durable messages; authors the RN-facing integration + e2e proof. The backend chat-runs route already exists and is reviewer-verified.
- **Planning rationale:** Per audit, `app/(drawer)/chat/reference.tsx` already sends via `POST /api/chat-runs` and reads via `useZeroQuery(chatMessagesByConversation(...))` (~80% built). An existing test `services/platform/tests/integration/sprint20-chat-zero-boundary.test.ts` already proves the Hono write reaches Postgres on the Zero-published surface, but not that the client reads it back reactively, nor that a real fleet-generated agent reply arrives. This task's remaining work is the cold-boot round-trip proof (client read-side + real agent completion), not a rebuild.
- **How to verify (human):** Launch the reference build cold-booted per S-COLDBOOT-01, send "Sprint 20 reference-flow ping" via the Maestro flow, observe `chat-assistant-message` render, and confirm the row is independently queryable via a real zero-cache read (not the POST response body).
- **Scope:** `app/(drawer)/chat/reference.tsx` (harden send/subscribe), `app/zero/queries.ts` (only if additional columns are needed for the assertion), and a new durable-via-Zero integration test. Does NOT touch `services/platform/src/http/chat-runs.ts` (already implemented/reviewed) or the Zero schema.
- **PRD refs:** UC-SYNC-02, UC-SYNC-01, T-SYNC-001, T-SYNC-002, CAP-SYNC-01, CAP-CUT-01

## Critical Constraints

### MUST
- MUST prove the PRIMARY via a real Maestro round-trip on a named iOS Simulator against a REAL fleet + real Postgres + real zero-cache — never a mocked route, stubbed store, or local dev shortcut
- MUST render the thread from the Zero subscription (chatMessagesByConversation), not painted from the fetch/poll response body
- MUST observe the durable user message and agent reply as Zero-synced Postgres rows, proving the sync hop (CAP-SYNC-01), not just an HTTP 200

### NEVER
- NEVER assert only that the POST returned a runId — that is fakeable without the durable write or the Zero sync
- NEVER introduce a convex/react hook on the chat send/subscribe path
- NEVER seed chat_messages by direct DB insert for the e2e proof — the message must originate from the real send action through the Hono command

### STRICTLY
- STRICTLY assert a concrete named message literal (e.g. "Sprint 20 reference-flow ping") appears in the synced thread, and exclude the empty-thread (0-row) start signature

## Specification

**Objective:** Verify and harden the thin chat vertical so a cold-booted, Convex-free RN client sends a message via the Hono /api/chat-runs command and observes the durable, fleet-generated reply arrive over the Zero subscription — closing CAP-SYNC-01 and the CAP-CUT-01 cold-boot reference gate.

**Success state:** On a named iOS Simulator, an operator types 'Sprint 20 reference-flow ping', taps send, and within the SLO sees a chat-assistant-message rendered from a Zero-synced durable Postgres row; an integration test proves the same message literal is queryable via chatMessagesByConversation against the real replica, not the response body.

## Acceptance Criteria

### AC-1: Cold-boot round-trip: sent message yields a Zero-synced assistant reply [PRIMARY]
**GIVEN:** the cold-booted Convex-free app on a named iOS Simulator with a seeded empty reference conversation and a live fleet + Postgres + zero-cache
**WHEN:** the operator types 'Sprint 20 reference-flow ping' and taps send via the Maestro reference flow
**THEN:** a chat-assistant-message appears in the thread within 240s and a reference-chat-reply screenshot is captured, with the thread never stuck empty
**VERIFY:** `MAESTRO_APP_ID=$MAESTRO_APP_ID env -u EXPO_PUBLIC_CONVEX_URL maestro test --format junit --output .tmp/maestro-reference-flow/coldboot-02.xml .e2e/maestro/reference-flow.yaml`
**TEST_TIER:** e2e
**VERIFICATION_SERVICE:** maestro+expo+zero+postgres+fleet
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "maestro+expo+zero+postgres+fleet",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "the /api/chat-runs command is a no-op",
      "the durable message is never written to Postgres",
      "zero-cache is disconnected so the reply never syncs to the client",
      "the thread reads from the POST response body instead of the Zero subscription",
      "the assistant reply is a static shell"
    ]
  },
  "evidence": { "artifact_type": "screenshot", "required_capture": true },
  "cases": [
    {
      "start_ref": "coldboot_app",
      "action": { "actor": "user", "steps": ["tapOn chat-input-field", "inputText 'Sprint 20 reference-flow ping'", "tapOn chat-input-send-button", "wait for chat-assistant-message"] },
      "end_state": {
        "must_observe": ["testID \"chat-assistant-message\" visible within 240000ms", "the sent user message 'Sprint 20 reference-flow ping' rendered in the thread", "screenshot \"reference-chat-reply\" showing a non-empty assistant bubble"],
        "must_not_observe": ["thread stuck on testID \"chat-loading-inline\"", "testID \"error-banner\" visible", "empty thread signature: 0 message bubbles"]
      }
    }
  ]
}
```

### AC-2: Durable message is observable via the Zero query, not the response body
**GIVEN:** a real Postgres + zero-cache + seeded empty reference conversation
**WHEN:** a chat run is created via POST /api/chat-runs with msg 'Sprint 20 reference-flow ping' and the run reaches completed
**THEN:** the chatMessagesByConversation Zero query against the Postgres replica returns a user row with that exact content and an agent row with non-empty content
**VERIFY:** `pnpm test:integration -- services/platform/tests/integration/sprint20-reference-zero-durable.test.ts`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** zero+postgres+fleet
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "zero+postgres+fleet",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "the durable write is skipped (row never persisted)",
      "the assertion reads the POST response body instead of querying via the Zero replica",
      "zero-cache disconnected from the replication slot",
      "the agent row content is empty"
    ]
  },
  "evidence": { "artifact_type": "db_query", "required_capture": true },
  "cases": [
    {
      "start_ref": "reference_conversation",
      "action": { "actor": "api_client", "steps": ["POST /api/chat-runs {requestId, msg:'Sprint 20 reference-flow ping', conversationId:<REFERENCE_CONVERSATION_ID>}", "poll GET /api/chat-runs/:id until completed", "read chatMessagesByConversation(<REFERENCE_CONVERSATION_ID>) via the Zero replica"] },
      "end_state": {
        "must_observe": ["a chat_messages row role='user' content='Sprint 20 reference-flow ping'", "a chat_messages row role='agent' with content length > 0", "row count for the conversation >= 2"],
        "must_not_observe": ["0 rows for the conversation", "empty thread signature", "content read from the HTTP response body only"]
      }
    }
  ]
}
```

### AC-3: Chat send/subscribe path is Convex-free and Hono-driven
**GIVEN:** the reference chat module tree (route + screen + Zero query)
**WHEN:** the send/subscribe source is grepped
**THEN:** there are zero convex/react hooks and the send path targets the Hono /api/chat-runs command with the Zero query as the read source
**VERIFY:** `! grep -Rq "convex/react" 'app/(drawer)/chat/reference.tsx' app/zero/ && grep -q "/api/chat-runs" 'app/(drawer)/chat/reference.tsx' && grep -q "chatMessagesByConversation" 'app/(drawer)/chat/reference.tsx'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** static-source-grep
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "static-source-grep",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "a convex/react hook is present on the chat path",
      "the send path uses a Convex mutation instead of the Hono command",
      "the read no longer uses the Zero query (disconnect)"
    ]
  },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "reference_conversation",
      "action": { "actor": "cli_user", "steps": ["grep -Rc \"convex/react\" 'app/(drawer)/chat/reference.tsx' app/zero/", "grep -c \"/api/chat-runs\" 'app/(drawer)/chat/reference.tsx'", "grep -c \"chatMessagesByConversation\" 'app/(drawer)/chat/reference.tsx'"] },
      "end_state": {
        "must_observe": ["convex/react match count 0", "\"/api/chat-runs\" present (count >= 1)", "\"chatMessagesByConversation\" present (count >= 1)"],
        "must_not_observe": ["any convex/react hook import on the chat path", "a Convex useMutation on the send path", "empty/start signature: convex/react match count 0 required but not asserted here"]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | Maestro cold-boot round-trip sends 'Sprint 20 reference-flow ping' and renders a chat-assistant-message with a captured screenshot, passing JUnit | AC-1 | `MAESTRO_APP_ID=$MAESTRO_APP_ID env -u EXPO_PUBLIC_CONVEX_URL maestro test --format junit --output .tmp/maestro-reference-flow/coldboot-02.xml .e2e/maestro/reference-flow.yaml` | happy_path |
| TC-2 | Integration test proves the sent message literal is queryable via chatMessagesByConversation against the real replica with an agent reply row, not the response body | AC-2 | `pnpm test:integration -- services/platform/tests/integration/sprint20-reference-zero-durable.test.ts` | integration |
| TC-3 | The chat send/subscribe path has zero convex/react and uses /api/chat-runs + chatMessagesByConversation | AC-3 | `! grep -Rq "convex/react" 'app/(drawer)/chat/reference.tsx' app/zero/ && grep -q "/api/chat-runs" 'app/(drawer)/chat/reference.tsx' && grep -q "chatMessagesByConversation" 'app/(drawer)/chat/reference.tsx'` | structural |

## Reading List

- `app/(drawer)/chat/reference.tsx` (1-129) — the already-built send-via-Hono + read-via-Zero screen; harden the round-trip proof and ensure the rendered thread is fed only by chatMessagesByConversation, never the poll response body
- `services/platform/src/http/chat-runs.ts` (1-60) — the Hono command contract (durable_message_id, role/status); READ-ONLY unless a durability gap is found
- `app/zero/queries.ts` (1-16) — chatMessagesByConversation direct ZQL builder; extend the projected columns only if the assertion needs role/content
- `services/platform/tests/integration/sprint20-chat-zero-boundary.test.ts` — existing boundary proof (write side) this task complements with the read-side + real fleet reply proof; do not duplicate
- `brain/docs/kanban/SCENARIO-CONTRACT-V1.md` (159-176) — Mobile + backend adapter rows

## Guardrails

### WRITE-ALLOWED
- app/(drawer)/chat/reference.tsx (MODIFY — harden send/subscribe, ensure thread is Zero-fed)
- app/zero/queries.ts (MODIFY — only if the durable assertion needs additional projected columns)
- services/platform/tests/integration/sprint20-reference-zero-durable.test.ts (NEW — durable-via-Zero integration proof)
- .e2e/maestro/reference-flow.yaml (MODIFY — only to strengthen the round-trip assertions/screenshot)
- .tmp/maestro-reference-flow/** (NEW — JUnit + screenshot output)

### WRITE-PROHIBITED
- services/platform/src/http/chat-runs.ts — the Hono command is already implemented and reviewer-verified; change only via an explicit Ask First if a durability gap is proven
- app/zero/schema.ts — schema is fixed for this sprint's thin surface
- convex/** — decommission is a later sprint
- app/_layout.tsx — provider swap is S-COLDBOOT-01's scope

### Boundaries
- **always:** Prove the round-trip against real fleet/Postgres/Zero, Render the thread only from the Zero subscription
- **ask_first:** Modifying services/platform/src/http/chat-runs.ts if a durability gap is found
- **never:** Rendering the thread from the POST response body, Seeding chat_messages by direct insert for the e2e proof

## Design

- **references:** (none — no design refs found for this PRD)
- **pattern:** Command-and-subscribe: authoritative write through a Hono POST, reactive read through a Zero useQuery subscription; the UI renders the subscription, not the command response
- **pattern_source:** app/(drawer)/chat/reference.tsx:29-79
- **anti_pattern:** Rendering the thread from the POST/poll response body (fakes the sync hop); asserting only HTTP 200/runId; seeding chat_messages by direct insert for the e2e proof

## Agent Assignment

- **implementer:** react-native-ui-implementer — owns the reference chat screen's send/subscribe wiring
- **reviewer:** react-native-ui-reviewer — verifies Zero-fed rendering, theme/testID compliance, and TDD evidence

## Verification Gates

- **AC-1 round-trip e2e:** RED against disconnected zero-cache first, then `MAESTRO_APP_ID=$MAESTRO_APP_ID env -u EXPO_PUBLIC_CONVEX_URL maestro test --format junit --output .tmp/maestro-reference-flow/coldboot-02.xml .e2e/maestro/reference-flow.yaml` → Exit 0 with JUnit pass + reference-chat-reply screenshot
- **AC-2 durable-via-Zero integration:** `pnpm test:integration -- services/platform/tests/integration/sprint20-reference-zero-durable.test.ts` → Exit 0; asserted user-message literal + non-empty agent row present in the Zero replica
- **AC-3 Convex-free chat path:** `! grep -Rq "convex/react" 'app/(drawer)/chat/reference.tsx' app/zero/` → Exit 0
- **Typecheck:** `pnpm tsgo --noEmit` → Exit 0
- **Lint:** `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error 'app/(drawer)/chat/reference.tsx' app/zero/queries.ts` → Exit 0
- **Scope compliance:** `git diff --name-only` → Subset of guardrails.write_allowed

## Coding Standards

- brain/docs/TESTING-HIERARCHY.md
- brain/docs/RED-FIRST-TEST-GATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- brain/docs/CAPABILITY-CHAIN-PLANNING.md
- RULES.md#react--react-native-rules

## Dependencies

- **depends_on:** S-COLDBOOT-01
- **blocks:** —

## Notes

An existing test `services/platform/tests/integration/sprint20-chat-zero-boundary.test.ts` already proves the Hono write persists on the Zero-published surface (write-side). This task's new `sprint20-reference-zero-durable.test.ts` complements it by proving the READ side (a real Zero query returns the row) and a real fleet-generated (non-tripwire) agent reply — do not duplicate the existing write-side proof.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-COLDBOOT-02",
  "proposed_by": "react-native-ui-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "reference_conversation": {
      "description": "One conversation row seeded in real Postgres via the platform public API/CLI with 0 chat_messages and agent_busy=false; its id is exported as EXPO_PUBLIC_REFERENCE_CONVERSATION_ID",
      "seed_method": "public_api",
      "records": [
        "conversations: id=<REFERENCE_CONVERSATION_ID>, agent_busy=false",
        "chat_messages: 0 rows for that conversation"
      ]
    },
    "coldboot_app": {
      "description": "The RN app cold-booted Convex-free per S-COLDBOOT-01 on a named iOS Simulator, reference chat thread empty, Zero/platform env pointed at the live fleet",
      "seed_method": "cli",
      "records": [
        "chat-screen visible",
        "chat-thread empty (0 message rows rendered)",
        "EXPO_PUBLIC_CONVEX_URL unset"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the cold-booted Convex-free app + seeded empty reference conversation + live fleet/Postgres/zero-cache WHEN the operator types 'Sprint 20 reference-flow ping' and taps send THEN a chat-assistant-message appears within 240s and a reference-chat-reply screenshot is captured",
      "verify": "MAESTRO_APP_ID=$MAESTRO_APP_ID env -u EXPO_PUBLIC_CONVEX_URL maestro test --format junit --output .tmp/maestro-reference-flow/coldboot-02.xml .e2e/maestro/reference-flow.yaml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro+expo+zero+postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the /api/chat-runs command is a no-op",
            "the durable message is never written to Postgres",
            "zero-cache is disconnected so the reply never syncs to the client",
            "the thread reads from the POST response body instead of the Zero subscription",
            "the assistant reply is a static shell"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "coldboot_app",
            "action": {
              "actor": "user",
              "steps": [
                "tapOn chat-input-field",
                "inputText 'Sprint 20 reference-flow ping'",
                "tapOn chat-input-send-button",
                "wait for chat-assistant-message"
              ]
            },
            "end_state": {
              "must_observe": [
                "testID \"chat-assistant-message\" visible within 240000ms",
                "the sent user message 'Sprint 20 reference-flow ping' rendered in the thread",
                "screenshot \"reference-chat-reply\" showing a non-empty assistant bubble"
              ],
              "must_not_observe": [
                "thread stuck on testID \"chat-loading-inline\"",
                "testID \"error-banner\" visible",
                "empty thread signature: 0 message bubbles"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN real Postgres + zero-cache + seeded empty conversation WHEN a chat run for 'Sprint 20 reference-flow ping' completes THEN chatMessagesByConversation returns a user row with that content and a non-empty agent row",
      "verify": "pnpm test:integration -- services/platform/tests/integration/sprint20-reference-zero-durable.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "zero+postgres+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the durable write is skipped (row never persisted)",
            "the assertion reads the POST response body instead of querying via the Zero replica",
            "zero-cache disconnected from the replication slot",
            "the agent row content is empty"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "reference_conversation",
            "action": {
              "actor": "api_client",
              "steps": [
                "POST /api/chat-runs {requestId, msg:'Sprint 20 reference-flow ping', conversationId:<REFERENCE_CONVERSATION_ID>}",
                "poll GET /api/chat-runs/:id until completed",
                "read chatMessagesByConversation(<REFERENCE_CONVERSATION_ID>) via the Zero replica"
              ]
            },
            "end_state": {
              "must_observe": [
                "a chat_messages row role='user' content='Sprint 20 reference-flow ping'",
                "a chat_messages row role='agent' with content length > 0",
                "row count for the conversation >= 2"
              ],
              "must_not_observe": [
                "0 rows for the conversation",
                "empty thread signature",
                "content read from the HTTP response body only"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN the reference chat module tree WHEN grepped THEN zero convex/react and the send path uses /api/chat-runs with chatMessagesByConversation as the read",
      "verify": "! grep -Rq \"convex/react\" 'app/(drawer)/chat/reference.tsx' app/zero/ && grep -q \"/api/chat-runs\" 'app/(drawer)/chat/reference.tsx' && grep -q \"chatMessagesByConversation\" 'app/(drawer)/chat/reference.tsx'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "static-source-grep",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "a convex/react hook is present on the chat path",
            "the send path uses a Convex mutation instead of the Hono command",
            "the read no longer uses the Zero query (disconnect)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "reference_conversation",
            "action": {
              "actor": "cli_user",
              "steps": [
                "grep -Rc \"convex/react\" 'app/(drawer)/chat/reference.tsx' app/zero/",
                "grep -c \"/api/chat-runs\" 'app/(drawer)/chat/reference.tsx'",
                "grep -c \"chatMessagesByConversation\" 'app/(drawer)/chat/reference.tsx'"
              ]
            },
            "end_state": {
              "must_observe": [
                "convex/react match count 0",
                "\"/api/chat-runs\" present (count >= 1)",
                "\"chatMessagesByConversation\" present (count >= 1)"
              ],
              "must_not_observe": [
                "any convex/react hook import on the chat path",
                "a Convex useMutation on the send path",
                "empty/start signature: convex/react match count 0 required but not asserted here"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Maestro round-trip renders chat-assistant-message and passes JUnit",
      "verify": "MAESTRO_APP_ID=$MAESTRO_APP_ID env -u EXPO_PUBLIC_CONVEX_URL maestro test --format junit --output .tmp/maestro-reference-flow/coldboot-02.xml .e2e/maestro/reference-flow.yaml",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Durable message queryable via Zero replica with agent reply",
      "verify": "pnpm test:integration -- services/platform/tests/integration/sprint20-reference-zero-durable.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Chat path Convex-free and Hono-driven",
      "verify": "! grep -Rq \"convex/react\" 'app/(drawer)/chat/reference.tsx' app/zero/ && grep -q \"/api/chat-runs\" 'app/(drawer)/chat/reference.tsx' && grep -q \"chatMessagesByConversation\" 'app/(drawer)/chat/reference.tsx'",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
