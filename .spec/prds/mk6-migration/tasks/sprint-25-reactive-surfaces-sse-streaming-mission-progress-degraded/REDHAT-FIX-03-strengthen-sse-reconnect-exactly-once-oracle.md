# REDHAT-FIX-03 — Strengthen the PRIMARY gate oracle (SSE reconnect exactly-once) — mutation probe shows commenting out Last-Event-ID resume or resetting assemblyRef on reconnect still passes 22/22; add flows/tests that capture streamLastSeq/streamTokenCount, compare streamed text to the Zero row, and count agent bubbles
> Status: ⬜ Pending
> Sprint: [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
> Agent: react-native-ui-implementer
> Reviewer: react-native-ui-reviewer
> Estimate: 90 min
> Type: FEATURE
> Priority: P0
> Effort: M
> Proposed by: react-native-ui-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md#H3`

## Outcome

Real-socket integration test fails if Last-Event-ID omitted or assemblyRef wiped; Maestro captures numeric lastSeq/tokenCount; poll cannot sole-greenwash reconnect AC.

## Background

- **Finding:** .spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md#H3
- **Red-hat report:** `.spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md`
- **Why it matters:** Unqualified Sprint 25 gate 5/5 pass is blocked until H1/H2/H3 are closed.
- **PRD refs:** UC-SYNC-02, T-SYNC-006
- **Capability:** CAP-SYNC-01

## Critical Constraints

### MUST
- MUST add integration test over real http.createServer SSE stub: emit tokens 1-3, disconnect, assert reconnect Last-Event-ID: 3, re-emit, assert unique concat and tokenCount == unique count
- MUST strengthen Maestro reconnect-exactly-once.yml to capture numeric streamLastSeq/streamTokenCount and assert agent bubble count == 1
- MUST kill mutants: drop Last-Event-ID header assignment; reset assemblyRef on reconnect
- MUST address M2 poll fallback (instrument/disable under test) so SSE path is proven

### NEVER
- NEVER leave reconnect-exactly-once.yml asserting only chat-stream-last-seq visibility with value unchecked
- NEVER mock EventSource/XHR so headers are unobservable in the new test
- NEVER rely solely on static rg /Last-Event-ID/ source-match tests

### STRICTLY
- STRICTLY PRIMARY AC test_tier integration/e2e, flow_ref UC-SYNC-02
- STRICTLY final agent bubble count == 1 and assembled text has 0 full-replay duplicates
- STRICTLY tdd_mode red_first: evidence that current suite is green under header-drop mutant before new test

## Specification

**Objective:** Close H3 by measuring reconnect exactly-once (Last-Event-ID + assembly continuity + unique token count + single bubble) with mutation-resistant coverage.

**Success state:** Real-socket integration test fails if Last-Event-ID omitted or assemblyRef wiped; Maestro captures numeric lastSeq/tokenCount; poll cannot sole-greenwash reconnect AC.

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** mutation-resistant-sse-reconnect-oracle
- **Consumes:** resumable-sse-chat-client, honest-streaming-seed-oracle
- **Boundary contracts:**
- PRIMARY gate: mid-stream disconnect+reconnect → exactly one final assistant message matching Zero row, 0 duplicate tokens
- ChatThread exposes streamLastSeq/streamTokenCount testIDs — capture values, not only visibility
- Last-Event-ID at use-resumable-sse-stream.ts:422-423; polling fallback :675-734 can greenwash (M2)

## Acceptance Criteria

### AC-1: Reconnect sends Last-Event-ID and unique assembly [PRIMARY]
- **GIVEN:** http.createServer SSE stub emits tokens seq 1-3 then disconnects
- **WHEN:** client reconnects and receives remaining tokens
- **THEN:** Last-Event-ID equals 3; final text unique concat; tokenCount equals unique count
- **Test tier:** `integration` · **Verification service:** `real http SSE stub + client assembly` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts -t 'AC-1'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** disconnect — Last-Event-ID omitted, stub — assemblyRef reset, empty — tokenCount 0, mock, poll-only
  - **Evidence:** artifact `api_response`, required_capture=True
  - **Case 1** — start_ref `sse-stub-reconnect-run`: actor `cli_user`
    - **Steps:**
    - Start http.createServer SSE stub
    - Open client; receive tokens seq 1-3
    - Simulate disconnect
    - Reconnect; capture request headers
    - Receive remaining tokens; assert unique concat + tokenCount
    - **MUST observe:**
    - `reconnect request header Last-Event-ID equals '3'`
    - `final assembled text equals unique token concatenation (e.g. 'OneTwoThreeFourFive')`
    - `tokenCount == 5 (unique token count)`
    - `duplicate seq applications == 0 (applyTokenEvent ignores seq <= lastSeq)`
    - **MUST NOT observe:**
    - `empty/start signature: Last-Event-ID header missing on reconnect`
    - `final text with duplicated prefix (e.g. 'OneTwoThreeOneTwoThree')`
    - `tokenCount > unique tokens (e.g. tokenCount == 8)`

### AC-2: Documented mutants are killed [PRIMARY]
- **GIVEN:** header-drop and assemblyRef-reset mutant scenarios
- **WHEN:** new suite runs mutant branches
- **THEN:** each mutant fails >=1 assertion; correct wiring exit 0
- **Test tier:** `integration` · **Verification service:** `mutation-style wiring tests` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts -t 'AC-2-mutation'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** static — suite green under header-drop, empty — no header capture, stub — only pure applyTokenEvent retested
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `sse-stub-reconnect-run`: actor `cli_user`
    - **Steps:**
    - Run header-drop branch → expect failure
    - Run assembly-reset branch → expect failure
    - Run correct wiring → expect pass
    - Write .tmp/sprint-25/redhat-fix-03-mutation.log
    - **MUST observe:**
    - `header-drop branch assertion failure count >= 1`
    - `assembly-reset branch assertion failure count >= 1`
    - `correct wiring exit code == 0`
    - `mutation.log line count >= 2 (failed mutant cases recorded)`
    - **MUST NOT observe:**
    - `empty/start signature: all three scenarios pass (failure count == 0)`
    - `only static source string match for Last-Event-ID without runtime header capture`

### AC-3: Maestro captures numeric lastSeq/tokenCount and one bubble
- **GIVEN:** ChatThread exposes streamLastSeq/streamTokenCount testIDs
- **WHEN:** Maestro reconnect-exactly-once completes mid-stream airplane reconnect
- **THEN:** numeric lastSeq >= 3 and tokenCount >= 3 captured; final agent bubble count == 1
- **Test tier:** `e2e` · **Verification service:** `Maestro + Zero + seeded Postgres + named iOS Simulator` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** empty — only unchecked last-seq visibility, stub — no token-count assert, disconnect — 0 new tokens, mock
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `user`
    - **Steps:**
    - holo seed:e2e --reset
    - Send multi-token streaming message
    - Wait until stream-token-count-at-least-3
    - Airplane ON 3s then OFF; wait complete
    - Capture stream-last-seq-N and stream-token-count-N labels
    - Assert chat-assistant-message-latest single final agent bubble
    - **MUST observe:**
    - `numeric streamLastSeq N >= 3 after resume`
    - `numeric streamTokenCount N >= 3`
    - `final agent bubble count == 1 (chat-assistant-message-latest)`
    - `Maestro exit code == 0`
    - **MUST NOT observe:**
    - `empty/start signature: chat-stream-last-seq visible with value-unchecked only`
    - `final agent bubble count > 1 for the turn`
    - `stream stalls with 0 new tokens after restore`

### AC-4: Poll fallback cannot sole-greenwash broken Last-Event-ID
- **GIVEN:** reconnecting-phase poll at use-resumable-sse-stream.ts:675-734
- **WHEN:** suite runs with poll disabled/instrumented
- **THEN:** broken Last-Event-ID fails; correct path records SSE resume marker
- **Test tier:** `integration` · **Verification service:** `hook instrumentation + SSE stub` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts -t 'AC-4-poll-instrumentation'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** poll-only greenwash, empty — no instrumentation, stub
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `sse-stub-reconnect-run`: actor `cli_user`
    - **Steps:**
    - Disable or instrument poll fallback under test
    - Break Last-Event-ID → expect fail
    - Restore correct header → expect pass with SSE path marker
    - **MUST observe:**
    - `broken Last-Event-ID under instrumented mode: assertion failure count >= 1`
    - `correct Last-Event-ID pass with resumeTransport equals 'sse' (or sse marker match count >= 1)`
    - `poll disabled flag == 1 OR provenance equals 'sse' on success path`
    - **MUST NOT observe:**
    - `empty/start signature: broken Last-Event-ID still passes via poll finalText only (failure count == 0)`
    - `M2 unaddressed with instrumentation flag count == 0`

### AC-5: Streamed text matches durable row; one agent message
- **GIVEN:** completed reconnect turn
- **WHEN:** compare assembled text to durable chat_messages
- **THEN:** content diff == 0 and agent message count == 1
- **Test tier:** `integration` · **Verification service:** `resumable SSE+Postgres durable row` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `PLATFORM_IT=1 pnpm vitest run tests/integration/s-reactive-01-eventsource-live.test.ts tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts -t 'AC-5'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** disconnect — durable row missing, empty — 0 agent rows, stub, duplicate — 2 agent rows
  - **Evidence:** artifact `api_response`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `cli_user`
    - **Steps:**
    - Complete streaming run with mid-stream resume
    - Read durable chat_messages content for durableMessageId
    - Compare to assembled stream text; count agent messages
    - **MUST observe:**
    - `assembled text equals durable content (diff == 0)`
    - `agent message count for the turn == 1`
    - `tokenCount == unique tokens applied (e.g. tokenCount == 5)`
    - **MUST NOT observe:**
    - `empty/start signature: durable agent rows count == 0`
    - `content diff > 0`
    - `agent bubble count > 1 for the turn`


## Test Criteria

| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Reconnect Last-Event-ID equals 3 and unique assembly | AC-1 | `pnpm vitest run tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts -t 'AC-1'` |
| TC-2 | Header-drop and assembly-reset mutants fail (>=1 assertion each) | AC-2 | `pnpm vitest run tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts -t 'AC-2-mutation'` |
| TC-3 | Maestro captures lastSeq>=3 tokenCount>=3 bubble count==1 | AC-3 | `holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml` |
| TC-4 | Poll cannot sole-greenwash broken Last-Event-ID | AC-4 | `pnpm vitest run tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts -t 'AC-4-poll-instrumentation'` |
| TC-5 | Durable row content diff==0; agent count==1 | AC-5 | `PLATFORM_IT=1 pnpm vitest run tests/integration/s-reactive-01-eventsource-live.test.ts tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts` |
| TC-6 | Existing pure-function s-reactive-01 suite still green | AC-1 | `pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts` |

## Reading List

- `.spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md:31-48` — H3 + M2
- `hooks/use-resumable-sse-stream.ts:415-424` — Last-Event-ID header
- `hooks/use-resumable-sse-stream.ts:277-289` — applyTokenEvent
- `hooks/use-resumable-sse-stream.ts:673-734` — poll fallback M2
- `components/chat/ChatThread.tsx:337-382` — streamLastSeq/tokenCount testIDs
- `.maestro/reactive/reconnect-exactly-once.yml:all` — weak oracles
- `tests/integration/s-reactive-01-resumable-sse.test.ts:all` — mutation survivors

## Guardrails

### WRITE-ALLOWED
- hooks/use-resumable-sse-stream.ts (MODIFY — instrument poll/resume; preserve Last-Event-ID)
- components/chat/ChatThread.tsx (MODIFY only if extra oracles needed)
- app/(drawer)/chat/[conversationId].tsx (MODIFY only if wiring props)
- .maestro/reactive/reconnect-exactly-once.yml
- .maestro/reactive/last-event-id-gap-fill.yml
- tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts (NEW)
- tests/integration/s-reactive-01-resumable-sse.test.ts (MODIFY if shared helpers)
- tests/integration/s-reactive-01-eventsource-live.test.ts (optional)
- S-REACTIVE-01-resumable-sse-chat-streaming-client-exactly-once-reconciliation.md (footnotes)
- .tmp/sprint-25/redhat-fix-03-mutation.log

### WRITE-PROHIBITED
- services/platform/src/http/chat-runs.ts — backend contract proven
- services/platform/src/db/seed-e2e.ts — H1
- .maestro/reactive/advance-server.py — H2
- Mocking EventSource with canned strings that skip real headers
- Other REDHAT-FIX-0{1,2} task files

## Design

- **References:** `./SPRINT.md`, `red-hat#H3`, `S-REACTIVE-01`, `use-resumable-sse-stream.ts:415-424`, `ChatThread.tsx:337-352`
- **Pattern:** HTTP SSE stub records Last-Event-ID; assembly continues from lastSeq; Maestro captures numeric oracles; mutants killed
- **Pattern source:** red-hat H3 fix recommendation
- **Anti-pattern:** assertVisible last-seq unchecked; static rg Last-Event-ID; poll-only finalText greenwash
- **Interaction notes:**
- Pure applyTokenEvent already strong — must exercise reconnect wiring
- Prefer test flag disableStatusPollFallback over deleting poll in prod without analysis

## Agent Assignment

- **Agent:** `react-native-ui-implementer`
- **Rationale:** Owns use-resumable-sse-stream reconnect wiring, ChatThread numeric oracles, Maestro reconnect-exactly-once, mutant-killing integration tests.
- **Reviewer:** `react-native-ui-reviewer`
- **Proposed by:** `react-native-ui-planner` (plus cross-specialist enrichments at consolidation: react-native-ui-planner + mastra-planner)

## Agent Instructions

1. RED first: redhat-fix-03-sse-reconnect-wiring.test.ts AC-1/AC-2 that fail without runtime header capture. Capture red log.
2. Extract buildSseResumeHeaders(lastSeq) if needed for Node harness.
3. Add mutant-kill AC-2/AC-3 branches; instrument poll (AC-4); strengthen Maestro (AC-3).
4. Coordinate Streaming non-optional with REDHAT-FIX-01. Do not implement H1/H2 product fixes here.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| NEW wiring suite | `pnpm vitest run tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts` | Exit 0; fails under mutants |
| S-REACTIVE-01 non-regression | `pnpm vitest run tests/integration/s-reactive-01*.ts` | Exit 0 |
| Maestro reconnect | `holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml` | Exit 0; numeric oracles |
| mutation evidence | `test -f .tmp/sprint-25/redhat-fix-03-mutation.log` | file exists |

## Dependencies

- **depends_on:** S-REACTIVE-01, REDHAT-FIX-01
- **blocks:** S-REACTIVE-05

## Review Criteria

- Every AC/TC stable; behavioral ACs pass `validate_scenario` with 0 CRITICAL
- Red-hat finding closed (PATH-A production truth or PATH-B honest re-scope)
- Writes only under WRITE-ALLOWED
- RED evidence captured under `.tmp/sprint-25/`

## Notes

- Mastra enrichment: backend afterSeq is sound — do not re-litigate hono-app; focus client wiring.
- Test file name: tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-03",
  "proposed_by": "react-native-ui-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "sse-stub-reconnect-run": {
      "description": "Node http.createServer SSE stub with sequenced tokens and header capture on reconnect",
      "seed_method": "cli",
      "records": [
        "emits tokens seq 1-3 then disconnect",
        "reconnect must send Last-Event-ID: 3",
        "final unique tokenCount deterministic"
      ]
    },
    "seeded-streaming-conversation": {
      "description": "Conversation for Maestro after holo seed:e2e --reset (depends on REDHAT-FIX-01 PATH-A when available)",
      "seed_method": "public_api",
      "records": [
        "ChatThread exposes chat-stream-last-seq and chat-stream-token-count"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN SSE stub tokens 1-3 then disconnect WHEN client reconnects THEN Last-Event-ID equals 3 and tokenCount equals unique count",
      "verify": "pnpm vitest run tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real http SSE stub + client assembly",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect \u2014 Last-Event-ID omitted",
            "stub \u2014 assemblyRef reset",
            "empty \u2014 tokenCount 0",
            "mock",
            "poll-only"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sse-stub-reconnect-run",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Start http.createServer SSE stub",
                "Open client; receive tokens seq 1-3",
                "Simulate disconnect",
                "Reconnect; capture request headers",
                "Receive remaining tokens; assert unique concat + tokenCount"
              ]
            },
            "end_state": {
              "must_observe": [
                "reconnect request header Last-Event-ID equals '3'",
                "final assembled text equals unique token concatenation (e.g. 'OneTwoThreeFourFive')",
                "tokenCount == 5 (unique token count)",
                "duplicate seq applications == 0 (applyTokenEvent ignores seq <= lastSeq)"
              ],
              "must_not_observe": [
                "empty/start signature: Last-Event-ID header missing on reconnect",
                "final text with duplicated prefix (e.g. 'OneTwoThreeOneTwoThree')",
                "tokenCount > unique tokens (e.g. tokenCount == 8)"
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
      "description": "GIVEN documented mutants WHEN suite runs THEN header-drop fails and assembly-reset fails and correct wiring exit code == 0",
      "verify": "pnpm vitest run tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts -t 'AC-2-mutation'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "mutation-style wiring tests",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static \u2014 suite green under header-drop",
            "empty \u2014 no header capture",
            "stub \u2014 only pure applyTokenEvent retested"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sse-stub-reconnect-run",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run header-drop branch \u2192 expect failure",
                "Run assembly-reset branch \u2192 expect failure",
                "Run correct wiring \u2192 expect pass",
                "Write .tmp/sprint-25/redhat-fix-03-mutation.log"
              ]
            },
            "end_state": {
              "must_observe": [
                "header-drop branch assertion failure count >= 1",
                "assembly-reset branch assertion failure count >= 1",
                "correct wiring exit code == 0",
                "mutation.log line count >= 2 (failed mutant cases recorded)"
              ],
              "must_not_observe": [
                "empty/start signature: all three scenarios pass (failure count == 0)",
                "only static source string match for Last-Event-ID without runtime header capture"
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
      "description": "GIVEN ChatThread oracles WHEN Maestro reconnect completes THEN streamLastSeq >= 3, streamTokenCount >= 3, agent bubbles == 1",
      "verify": "holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Maestro + Zero + seeded Postgres + named iOS Simulator",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 only unchecked last-seq visibility",
            "stub \u2014 no token-count assert",
            "disconnect \u2014 0 new tokens",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-streaming-conversation",
            "action": {
              "actor": "user",
              "steps": [
                "holo seed:e2e --reset",
                "Send multi-token streaming message",
                "Wait until stream-token-count-at-least-3",
                "Airplane ON 3s then OFF; wait complete",
                "Capture stream-last-seq-N and stream-token-count-N labels",
                "Assert chat-assistant-message-latest single final agent bubble"
              ]
            },
            "end_state": {
              "must_observe": [
                "numeric streamLastSeq N >= 3 after resume",
                "numeric streamTokenCount N >= 3",
                "final agent bubble count == 1 (chat-assistant-message-latest)",
                "Maestro exit code == 0"
              ],
              "must_not_observe": [
                "empty/start signature: chat-stream-last-seq visible with value-unchecked only",
                "final agent bubble count > 1 for the turn",
                "stream stalls with 0 new tokens after restore"
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
      "description": "GIVEN poll fallback WHEN instrumented suite runs THEN broken Last-Event-ID fails (poll cannot sole-bailout)",
      "verify": "pnpm vitest run tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts -t 'AC-4-poll-instrumentation'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "hook instrumentation + SSE stub",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "poll-only greenwash",
            "empty \u2014 no instrumentation",
            "stub"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sse-stub-reconnect-run",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Disable or instrument poll fallback under test",
                "Break Last-Event-ID \u2192 expect fail",
                "Restore correct header \u2192 expect pass with SSE path marker"
              ]
            },
            "end_state": {
              "must_observe": [
                "broken Last-Event-ID under instrumented mode: assertion failure count >= 1",
                "correct Last-Event-ID pass with resumeTransport equals 'sse' (or sse marker match count >= 1)",
                "poll disabled flag == 1 OR provenance equals 'sse' on success path"
              ],
              "must_not_observe": [
                "empty/start signature: broken Last-Event-ID still passes via poll finalText only (failure count == 0)",
                "M2 unaddressed with instrumentation flag count == 0"
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
      "description": "GIVEN completed reconnect WHEN comparing assembly to durable row THEN content diff == 0 and agent count == 1",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/s-reactive-01-eventsource-live.test.ts tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts -t 'AC-5'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "resumable SSE+Postgres durable row",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect \u2014 durable row missing",
            "empty \u2014 0 agent rows",
            "stub",
            "duplicate \u2014 2 agent rows"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-streaming-conversation",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Complete streaming run with mid-stream resume",
                "Read durable chat_messages content for durableMessageId",
                "Compare to assembled stream text; count agent messages"
              ]
            },
            "end_state": {
              "must_observe": [
                "assembled text equals durable content (diff == 0)",
                "agent message count for the turn == 1",
                "tokenCount == unique tokens applied (e.g. tokenCount == 5)"
              ],
              "must_not_observe": [
                "empty/start signature: durable agent rows count == 0",
                "content diff > 0",
                "agent bubble count > 1 for the turn"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Reconnect Last-Event-ID equals 3 and unique assembly",
      "verify": "pnpm vitest run tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Header-drop and assembly-reset mutants fail (>=1 assertion each)",
      "verify": "pnpm vitest run tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts -t 'AC-2-mutation'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Maestro captures lastSeq>=3 tokenCount>=3 bubble count==1",
      "verify": "holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Poll cannot sole-greenwash broken Last-Event-ID",
      "verify": "pnpm vitest run tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts -t 'AC-4-poll-instrumentation'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Durable row content diff==0; agent count==1",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/s-reactive-01-eventsource-live.test.ts tests/integration/redhat-fix-03-sse-reconnect-wiring.test.ts",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Existing pure-function s-reactive-01 suite still green",
      "verify": "pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->
