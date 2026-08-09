# S31-FE-01 — Bound every chat-path request and stream with a deadline that terminates in degraded

**PROPOSED-BY:** react-native-ui-planner · **Sprint:** sprint-31-migration-integrity-remediation · **Template:** TASK-TEMPLATE v5.2

## What this does
Gives every chat-path HTTP call and the SSE transport a deadline, so a platform that accepts the connection and then stalls ends in the existing `degraded` state instead of hanging forever.

## Why
`hooks/use-resumable-sse-stream.ts:96` sets `xhr.timeout = 0` and six chat-path fetches carry no `AbortController`, no signal, and no timeout. On an accept-then-stall the app sits in `streaming`/`reconnecting` indefinitely with the composer disabled, and reconnect recurses with no attempt cap. UC-SYNC-02 AC-2 needs a reachable terminal state.

## How to verify
Run `bash .maestro/reactive/run-deadline-stall-terminates.sh` against the real stall harness: `chat-degraded-banner` appears within the first-byte deadline and the composer re-enables. `maestro test .maestro/chat/send-streams.yml` must still pass unchanged.

## Scope
Touches `hooks/use-resumable-sse-stream.ts`, `app/(drawer)/chat/[conversationId].tsx`, one new stall harness and one new Maestro flow. No new UI, no new phase, no retry-curve tuning.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-FE-01 - Bound every chat-path request and stream with a deadline that terminates in degraded
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M
AGENT:      implementer=react-native-ui-implementer | reviewer=react-native-ui-reviewer
PROPOSED-BY: react-native-ui-planner
ESTIMATE:   150 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-SYNC-01
PRD_REFS:   08-uc-sync.md UC-SYNC-02 AC-2 · 01-scope.md:40 · 01-scope.md:45 · 01-scope.md:77 · 01-scope.md:79

RUNTIME_COMMANDS:
  test:      pnpm test:unit ; PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/6 ACs complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, <=30 words — observable success)
--------------------------------------------------------------------------------

Every chat-path request and the SSE stream carry a deadline whose expiry lands in the existing `degraded` phase, so no stall can hang the composer forever.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER add a ChatStreamPhase member, a new testID, a new error component, a spinner, a countdown, or new iconography. The terminal presentation is the EXISTING banner at components/chat/ChatThread.tsx:434-450 with its warning-surface tokens and accessibilityRole='alert'.
- NEVER inline user-facing failure prose at a call site; the copy comes from the exported SURFACE_UNAVAILABLE_MESSAGE constant (precedent hooks/use-resumable-sse-stream.ts:158) or a sibling constant in the same block.
- NEVER tune the retry curve. Adaptive backoff, jitter, and connection-quality heuristics are explicitly Out of Scope (01-scope.md:77); the criterion is that a terminal state is REACHED, not the curve shape.
- NEVER copy AbortController wiring into each of the six call sites. Rule of 2: extract ONE shared helper and apply it to hooks/use-resumable-sse-stream.ts:641, :749, :993, :1037 and app/(drawer)/chat/[conversationId].tsx:198, :630.
- NEVER let the idle watchdog ignore SSE keepalives. parseSseBlock (:56) returns null for comment frames, so the watchdog must rearm on byte delivery inside flush(), before parsing, or a healthy quiet stream is killed.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] A healthy send streams to completion with 0 deadline firings and no degraded banner — AC-1 (PRIMARY)
- [ ] An accept-then-stall origin drives the app to `chat-degraded-banner` and re-enables the composer — AC-2
- [ ] A keepalive-only stream survives 2x the idle window and applies the late token — AC-3
- [ ] Reconnect terminates at the configured cap with `degraded` and 0 further attempts — AC-4
- [ ] All six chat-path calls honour one exported constants block — AC-6
- [ ] pnpm test:unit + PLATFORM_IT=1 pnpm test:integration pass; pnpm tsgo --noEmit and pnpm biome check . clean
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Healthy stream is unaffected by the new deadlines [PRIMARY]
  GIVEN: real Postgres, zero-cache and Mastra up, seeded conversation open on the iOS Simulator
  WHEN:  the operator sends a message and the platform streams a normal reply
  THEN:  the reply completes with 0 deadline firings and no degraded banner

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  maestro-ios-simulator + real Mastra on 4111 + real Postgres + real zero-cache on 4848
  TDD_STATE:     none
  TEST_FILE:     .maestro/chat/send-streams.yml
  TEST_FUNCTION: send-streams

  SCENARIO:
    START_REF:        seeded-chat-conversation
    NEGATIVE_CONTROL: would fail if the platform stream is stubbed with a static canned body, the bubble is a mock, or zero-cache is disconnected
    EVIDENCE:         screenshot
    CASES:
      - ACTION:           launchApp, openLink the seeded conversation, send 'Summarise the seeded document', wait for chat-assistant-message-latest
        MUST_OBSERVE:     `chat-assistant-message-latest` renders >=20 characters of live assistant prose; `chat-agent-busy-false` resolves to 1 node
        MUST_NOT_OBSERVE: `chat-degraded-banner` visible 0 times; `chat-loading-inline` visible 0 times

AC-2: Accept-then-stall terminates in the existing degraded phase
  GIVEN: the client pointed at an origin that accepts then writes 0 body bytes
  WHEN:  the operator sends a message and the first-byte deadline elapses
  THEN:  the existing chat-degraded-banner renders and the composer re-enables

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  maestro-ios-simulator + scripts/e2e/stall-sse-server.py on 4599
  TDD_STATE:     none
  TEST_FILE:     .maestro/reactive/deadline-stall-terminates.yml
  TEST_FUNCTION: deadline-stall-terminates

AC-3: Keepalive-only healthy stream survives the idle watchdog
  GIVEN: an origin emitting only SSE comment keepalives, then 1 token after two idle windows
  WHEN:  the stream runs longer than one idle window with 0 data events
  THEN:  the stream is not terminated and the late token is applied

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  vitest integration lane PLATFORM_IT=1 + real keepalive origin on 4599
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-01-chat-deadlines.test.ts
  TEST_FUNCTION: keepalive rearms idle watchdog

AC-4: Reconnection is capped and terminates rather than recursing forever
  GIVEN: an origin dropping every connection immediately after headers
  WHEN:  the client exhausts the configured reconnect cap
  THEN:  the machine settles in degraded and the origin connection counter stops rising

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  vitest integration lane PLATFORM_IT=1 + real dropping origin on 4599
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-01-chat-deadlines.test.ts
  TEST_FUNCTION: reconnect cap terminates

AC-5: Hard-down platform and stall converge across iOS and Android signatures
  GIVEN: holocron-mastra stopped so the run-create POST fails at connect
  WHEN:  the operator sends a message
  THEN:  the same degraded terminal state is reached as for a stall

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  vitest integration lane + launchd-stopped holocron-mastra on 4111
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-01-chat-deadlines.test.ts
  TEST_FUNCTION: ios ontimeout and android status-0 converge

AC-6: One constants block governs every chat-path deadline
  GIVEN: CHAT_NETWORK_DEADLINES overridden to 800ms
  WHEN:  all six chat-path calls run against a non-responding origin
  THEN:  every one settles within 1300ms

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  vitest integration lane PLATFORM_IT=1 + real non-responding origin on 4599
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-01-chat-deadlines.test.ts
  TEST_FUNCTION: all chat-path calls honour the shared deadline constants

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- hooks/use-resumable-sse-stream.ts (MODIFY)
- app/(drawer)/chat/[conversationId].tsx (MODIFY)
- scripts/e2e/stall-sse-server.py (NEW)
- .maestro/reactive/deadline-stall-terminates.yml (NEW)
- .maestro/reactive/run-deadline-stall-terminates.sh (NEW)
- tests/integration/s31-fe-01-chat-deadlines.test.ts (NEW)

writeProhibited:
- components/chat/ChatThread.tsx — read-only here; S31-FE-02 owns the banner
- components/ui/** — no new or modified primitives
- services/platform/** — no server-side change
- app/zero/** — no schema or query change
- Any file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First)
--------------------------------------------------------------------------------

✅ Always:
- Route every deadline expiry through applyFleetFailureEnvelope so the terminal state is the existing `degraded` phase.
- Read every timeout from the exported CHAT_NETWORK_DEADLINES block; no numeric literals at call sites.
- Rearm the idle watchdog inside flush() on byte delivery, before parseSseBlock.
- Handle iOS `ontimeout` and Android `onerror` with `status === 0` in one handler with no platform branch in phase logic.
- Clear every timer in early-return paths and in dispose().

⚠️ Ask First:
- Changing any reconnect delay value (curve tuning is Out of Scope; only the cap is in scope).
- Adding a new npm dependency for timers, abort, or SSE.
- Altering the composer-disable predicate at app/(drawer)/chat/[conversationId].tsx:1045.
- Changing the SSE resume/Last-Event-ID header contract.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- hooks/use-resumable-sse-stream.ts (MODIFY): CHAT_NETWORK_DEADLINES block, the shared deadline helper, first-byte + idle watchdogs, reconnect cap
- app/(drawer)/chat/[conversationId].tsx (MODIFY): hydrate GET at :198 and create POST at :630 wired to the shared helper
- scripts/e2e/stall-sse-server.py (NEW): real stall / keepalive / drop-after-headers origin
- tests/integration/s31-fe-01-chat-deadlines.test.ts (NEW): AC-3 through AC-6
- .maestro/reactive/deadline-stall-terminates.yml + run-deadline-stall-terminates.sh (NEW): AC-2 evidence

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

  Always: show the actual failure output.
  Never:  write implementation code in RED.

### GREEN PHASE (after orchestrator VERIFY_RED passes)
  WRITE:  MINIMAL code to pass
  RUN:    the AC's TEST_FILE
  VERIFY: the test PASSES
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
   - Focus: the canonical degraded-banner presentation — warning-surface classNames, accessibilityRole='alert', chat-degraded-message inside, deliberately NO ActivityIndicator. Reuse verbatim; add nothing.

2. hooks/use-resumable-sse-stream.ts
   - Lines: 41-58, 60-143, 145-230
   - Focus: parseSseBlock returning null for keepalives (:56); openProgressiveSse with xhr.timeout = 0 (:96) and flush() (:79); the frozen ChatStreamPhase union (:145), SURFACE_UNAVAILABLE_MESSAGE (:158) and applyFleetFailureEnvelope (:212) — the single reduction the deadlines must join.

3. hooks/use-resumable-sse-stream.ts
   - Lines: 528-570, 630-660, 740-760, 895-1000, 1030-1045
   - Focus: reconnectDelayMs as the existing test-overridable knob (:545); the four unbounded fetches at :641, :749, :993, :1037; the uncapped reconnect re-entry at :904-910.

4. app/(drawer)/chat/[conversationId].tsx
   - Lines: 176-220, 626-680, 1035-1055
   - Focus: the hydrate GET at :198 inside a setInterval poll; the create POST at :630 with its enterDegradedFromEnvelope reduction at :657-669; the composer lock at :1045 and the insets.bottom wrapper at :970.

5. .maestro/reactive/degraded-no-hang.yml + .maestro/reactive/run-degraded-no-hang.sh
   - Lines: 1-60 and 1-35
   - Focus: the dev-client launch preamble and openLink retry ladder to reach chat-screen; the fail-closed harness pattern that exits non-zero BEFORE Maestro.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED evidence — TDD_STATE shows each test went red before green.
Gate 2: One test per AC.
Gate 3: pnpm test:unit and PLATFORM_IT=1 pnpm test:integration exit 0.
Gate 4: pnpm tsgo --noEmit exits 0.
Gate 5: pnpm biome check . exits 0.
Gate 6: git diff --name-only ⊆ SCOPE.writeAllowed.
Gate 7: AC-1 is e2e; no PRIMARY unit test.
Gate 8: validate_scenario.py exits 0 on the PRIMARY scenario; the captured screenshot shows the seeded MUST_OBSERVE values, and the AC-2 test was watched FAIL against a build with the deadline removed before it went green.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Retry-curve tuning: adaptive backoff, jitter, connection-quality heuristics (01-scope.md:77 — future hardening)
- Any new error UI, illustration, or retry affordance (01-scope.md:79)
- Collapsing the duplicate degraded banner — S31-FE-02 owns that
- Offline-first operation without zero-cache (01-scope.md:78)

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** xhr.timeout = 0 at hooks/use-resumable-sse-stream.ts:96; six chat-path fetches with no AbortController; reconnect re-enters at :904-910 with no attempt counter; `degraded` reachable only via an isFleetUnavailableFailure envelope match at :191-206.

**Gap:** an accept-then-stall has no terminal state — the machine sits in streaming/reconnecting forever with the composer disabled at :1045.

--------------------------------------------------------------------------------
REVIEW (for react-native-ui-reviewer)
--------------------------------------------------------------------------------

Must pass (<=5, evidence-gate-backed):
- One test per AC; tests verify behavior not implementation
- RED evidence present in TDD_STATE history
- Minimal implementation; no gold-plating
- Pattern consistent with READING LIST [PRIMARY PATTERN] — banner reused verbatim, 0 new testIDs
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Should verify (<=5, judgment):
- Exactly one shared deadline helper covers all six call sites; 0 numeric timeout literals remain
- The idle watchdog rearms on keepalive frames, verified by AC-3 rather than by inspection
- Timers are cleared on dispose and in every early return
- iOS/Android stall signatures reduce identically with no platform branch in phase logic
- The composer becomes usable again on every terminal path

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: none
Blocks:     S31-FE-07 (supplies the terminating deadline the offline-contract flow waits on)
Parallel:   S31-FE-02, S31-FE-04, S31-FE-05, S31-FE-06

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-FE-01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-chat-conversation": {
      "description": "Real Postgres seeded through the platform CLI; conversation id 00000000-0000-4000-8000-0000000000e1 with durable chat_messages rows replicated over zero-cache",
      "seed_method": "cli",
      "records": [
        "conversations: 1 row id=00000000-0000-4000-8000-0000000000e1",
        "chat_messages: >=2 durable rows for that conversation"
      ]
    },
    "stalling-sse-origin": {
      "description": "Real local HTTP listener started by scripts/e2e/stall-sse-server.py --mode stall that accepts the TCP connection, writes SSE headers, then writes 0 further bytes and holds the socket open",
      "seed_method": "cli",
      "records": [
        "listener bound on 127.0.0.1:4599",
        "response headers written: 1",
        "body bytes written: 0"
      ]
    },
    "keepalive-only-sse-origin": {
      "description": "Real local HTTP listener started by scripts/e2e/stall-sse-server.py --mode keepalive emitting only ': keepalive' comment frames every 500ms, then 1 real token event with seq 1",
      "seed_method": "cli",
      "records": [
        "keepalive comment frames: 8 over 4000ms",
        "data events before t=4000ms: 0",
        "token event seq=1 emitted at t=4200ms"
      ]
    },
    "dropping-sse-origin": {
      "description": "Real local HTTP listener started by scripts/e2e/stall-sse-server.py --mode drop-after-headers that closes each connection immediately after headers and records an inbound connection counter",
      "seed_method": "cli",
      "records": [
        "inbound connection counter starts at 0",
        "each connection closed after headers"
      ]
    },
    "platform-stopped": {
      "description": "holocron-mastra booted out via launchctl so port 4111 refuses connections; Postgres and zero-cache remain running",
      "seed_method": "cli",
      "records": [
        "curl 127.0.0.1:4111 exits 7 connection refused",
        "postgres up: 1",
        "zero-cache keepalive on 4848: ok"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a healthy real stack and the seeded conversation open on the iOS Simulator WHEN the operator sends a chat message THEN the reply streams to completion with 0 deadline firings and no degraded banner",
      "verify": "maestro test .maestro/chat/send-streams.yml",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-01-AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator + real Mastra on 4111 + real Postgres + real zero-cache on 4848",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the platform stream is stubbed with a static canned body",
            "the assistant bubble is a mock with no live tokens",
            "zero-cache is disconnected"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-chat-conversation",
            "action": {
              "actor": "user",
              "steps": [
                "launchApp on the named iOS Simulator using the .maestro/reactive/degraded-no-hang.yml dev-client preamble",
                "openLink MAESTRO_CHAT_URL for conversation 00000000-0000-4000-8000-0000000000e1",
                "tapOn id 'chat-input-field' and inputText 'Summarise the seeded document'",
                "tapOn id 'chat-input-send-button'",
                "extendedWaitUntil id 'chat-assistant-message-latest' visible timeout 90000"
              ]
            },
            "end_state": {
              "must_observe": [
                "`chat-assistant-message-latest` renders >=20 characters of live assistant prose",
                "`chat-agent-busy-false` resolves to 1 node after the run completes",
                "`chat-stream-phase` oracle reports a value other than `degraded`"
              ],
              "must_not_observe": [
                "`chat-degraded-banner` visible 0 times during the run",
                "`chat-reconnecting-indicator` visible 0 times after completion",
                "`chat-loading-inline` visible 0 times"
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
      "description": "GIVEN the client pointed at an origin that accepts then stalls WHEN the operator sends a message and the first-byte deadline elapses THEN the existing chat-degraded-banner renders and the composer re-enables",
      "verify": "bash .maestro/reactive/run-deadline-stall-terminates.sh",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-01-AC-2",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator + scripts/e2e/stall-sse-server.py on 4599",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the deadline is removed so the stream stays in streaming forever",
            "the banner is a static shell rendered unconditionally",
            "the origin is mocked instead of a real stalled socket"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stalling-sse-origin",
            "action": {
              "actor": "user",
              "steps": [
                "start scripts/e2e/stall-sse-server.py --mode stall and assert it is listening on 127.0.0.1:4599",
                "launchApp with platformUrl pointed at 127.0.0.1:4599",
                "openLink MAESTRO_CHAT_URL for conversation 00000000-0000-4000-8000-0000000000e1",
                "tapOn id 'chat-input-field', inputText 'Ping a stalled origin', tapOn id 'chat-input-send-button'",
                "extendedWaitUntil id 'chat-degraded-banner' visible timeout equal to CHAT_NETWORK_DEADLINES.sseFirstByteDeadlineMs plus 5000"
              ]
            },
            "end_state": {
              "must_observe": [
                "literal text 'Local fleet unavailable — running in reduced mode' rendered 1 time",
                "`chat-degraded-banner` resolves to 1 node",
                "`chat-agent-busy-false` resolves to 1 node"
              ],
              "must_not_observe": [
                "`chat-reconnecting-indicator` visible 0 times after the deadline",
                "`stop-generating-button` visible 0 times after the deadline",
                "0 new testIDs absent from the pre-task codebase are introduced"
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
      "description": "GIVEN an origin emitting only SSE comment keepalives WHEN the idle window elapses twice THEN the stream is not terminated and the late token is applied",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'keepalive rearms idle watchdog'",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-01-AC-3",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest integration lane PLATFORM_IT=1 + scripts/e2e/stall-sse-server.py --mode keepalive on 4599",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the idle watchdog ignores keepalives and kills a healthy stream",
            "the origin is a stub emitting nothing",
            "the token event is hardcoded in the test instead of read from the socket"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "keepalive-only-sse-origin",
            "action": {
              "actor": "system",
              "steps": [
                "start scripts/e2e/stall-sse-server.py --mode keepalive on 127.0.0.1:4599",
                "createResumableSseController with platformUrl 127.0.0.1:4599 and CHAT_NETWORK_DEADLINES.sseIdleDeadlineMs overridden to 1500",
                "call connect with runId and durableMessageId",
                "let the origin emit 8 keepalive comment frames over 4000ms",
                "let the origin emit 1 token event with id 1 and data 'late'",
                "read getSnapshot at t=4000 and again after the token"
              ]
            },
            "end_state": {
              "must_observe": [
                "getSnapshot().phase == 'streaming' at t=4000ms",
                "getSnapshot().streamedText contains 'late' after the token arrives",
                "getSnapshot().lastSeq == 1"
              ],
              "must_not_observe": [
                "getSnapshot().phase == 'degraded' at t=4000ms is observed 0 times",
                "getSnapshot().error is non-null 0 times before the origin closes"
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
      "description": "GIVEN an origin that drops every connection after headers WHEN the reconnect cap is exhausted THEN the machine settles in degraded and issues no further attempts",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'reconnect cap terminates'",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-01-AC-4",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest integration lane PLATFORM_IT=1 + scripts/e2e/stall-sse-server.py --mode drop-after-headers on 4599",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the reconnect loop is unchanged and recurses without a cap",
            "the connection counter is stubbed instead of read from the real listener",
            "the controller is mocked"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "dropping-sse-origin",
            "action": {
              "actor": "system",
              "steps": [
                "start scripts/e2e/stall-sse-server.py --mode drop-after-headers on 127.0.0.1:4599 with a connection counter",
                "createResumableSseController with reconnectDelayMs 50 and the shipped CHAT_NETWORK_DEADLINES.reconnectMaxAttempts value",
                "call connect and wait for the phase to settle",
                "sample the origin connection counter, wait 3x the maximum reconnect delay, sample it again"
              ]
            },
            "end_state": {
              "must_observe": [
                "getSnapshot().phase == 'degraded' after the cap is exhausted",
                "getSnapshot().degradedMessage == 'Local fleet unavailable — running in reduced mode'",
                "origin connection counter == CHAT_NETWORK_DEADLINES.reconnectMaxAttempts and identical across both samples"
              ],
              "must_not_observe": [
                "the connection counter increases between the 2 samples 0 times",
                "getSnapshot().phase == 'reconnecting' at the second sample is observed 0 times"
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
      "description": "GIVEN holocron-mastra stopped so the run-create POST fails at connect WHEN the operator sends a message THEN the same degraded terminal state is reached as for a stall",
      "verify": "maestro test .maestro/reactive/degraded-no-hang.yml",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-01-AC-5",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator + launchd-stopped holocron-mastra on 4111",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the failure path is stubbed to always return degraded regardless of input",
            "the platform is still running so nothing fails",
            "the reduction is mocked"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "platform-stopped",
            "action": {
              "actor": "user",
              "steps": [
                "launchctl bootout holocron-mastra and assert curl 127.0.0.1:4111 exits 7",
                "launchApp and openLink MAESTRO_CHAT_URL for conversation 00000000-0000-4000-8000-0000000000e1",
                "tapOn id 'chat-input-field', inputText 'Ping a stopped platform', tapOn id 'chat-input-send-button'",
                "extendedWaitUntil id 'chat-degraded-banner' visible timeout 20000"
              ]
            },
            "end_state": {
              "must_observe": [
                "`chat-degraded-banner` resolves to 1 node rendering 'Local fleet unavailable — running in reduced mode'",
                "`chat-agent-busy-false` resolves to 1 node",
                "`chat-input` accepts focus after the banner appears"
              ],
              "must_not_observe": [
                "the composer stays disabled 0 seconds beyond the deadline plus 5000ms",
                "`chat-reconnecting-indicator` visible 0 times past the reconnect cap"
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
      "description": "GIVEN CHAT_NETWORK_DEADLINES overridden to 800ms WHEN all six chat-path HTTP calls run against a non-responding origin THEN every one aborts within the overridden deadline",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'all chat-path calls honour the shared deadline constants'",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-01-AC-6",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest integration lane PLATFORM_IT=1 + scripts/e2e/stall-sse-server.py --mode stall on 4599",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "a hardcoded numeric timeout literal remains at any call site so the override is ignored",
            "the fetches are mocked",
            "the origin responds instead of stalling"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stalling-sse-origin",
            "action": {
              "actor": "system",
              "steps": [
                "import CHAT_NETWORK_DEADLINES and override every member to 800",
                "exercise the run-create POST, the finalText hydrate GET, the status-poll GET, both resume fetches, and the cancel POST against 127.0.0.1:4599",
                "record wall-clock milliseconds to settle for each of the 6 calls"
              ]
            },
            "end_state": {
              "must_observe": [
                "all 6 chat-path calls settle within 1300ms",
                "each settled call reduces through applyFleetFailureEnvelope with isDegraded == true",
                "grep for a numeric timeout literal at the 6 call sites returns 0 matches"
              ],
              "must_not_observe": [
                "0 of the 6 calls remain pending at 5000ms",
                "a numeric timeout literal at any of the 6 call sites is found 0 times"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": ".maestro/chat/send-streams.yml passes with chat-degraded-banner never visible",
      "verify": "maestro test .maestro/chat/send-streams.yml",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "chat-degraded-banner becomes visible within sseFirstByteDeadlineMs plus 5000ms against the stalling origin",
      "verify": "bash .maestro/reactive/run-deadline-stall-terminates.sh",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "chat-agent-busy-false is visible after chat-degraded-banner appears against the stalling origin",
      "verify": "bash .maestro/reactive/run-deadline-stall-terminates.sh",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "controller phase equals streaming after 2x the overridden idle deadline with only keepalives arriving",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'keepalive rearms idle watchdog'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "the late token is applied and lastSeq equals 1",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'keepalive rearms idle watchdog'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "the origin connection counter equals reconnectMaxAttempts and is unchanged after 3x the maximum reconnect delay",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'reconnect cap terminates'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "getSnapshot().phase equals degraded after reconnect-cap exhaustion",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'reconnect cap terminates'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "the shared reducer returns an identical FleetFailureTransition for an ontimeout-shaped and an onerror-status-0-shaped input",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'ios ontimeout and android status-0 converge'",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "ChatStreamPhase declares exactly the 6 members idle, streaming, reconnecting, complete, cancelled, degraded",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'ChatStreamPhase union is frozen'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "all 6 chat-path calls settle within 1300ms with the deadline constants overridden to 800ms",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'all chat-path calls honour the shared deadline constants'",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "pnpm biome check . exits 0",
      "verify": "pnpm biome check .",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "pnpm tsgo --noEmit exits 0",
      "verify": "pnpm tsgo --noEmit",
      "maps_to_ac": "AC-6"
    }
  ]
}
-->

</details>
