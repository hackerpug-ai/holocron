# S-REACTIVE-01: Resumable SSE chat streaming client with exactly-once durable reconciliation
> Status: Backlog

- **Sprint:** [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
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
A resumable SSE chat-streaming client that reconnects after a mid-stream network drop (airplane mode) and reconciles to exactly one final assistant message matching its Zero-synced durable row, with zero duplicated tokens.

## Background
This is Sprint 25 (UC-SYNC-02; T-SYNC-006) — the gate-core client-reactivity task. Sprint 18 built the resumable SSE backend: `POST /api/chat-runs` returns a monotonic persisted event sequence + `runId`; `GET /api/chat-runs/:id/events` (`services/platform/src/http/hono-app.ts:228-256`, `services/platform/src/http/chat-runs.ts`) streams sequenced SSE events with four real event types — **`token`** (`{token:string}`), **`terminal`** (`{status:'completed'|'failed', text?, error?}`), **`blocked`** (`{code:'CHAT_PROCESSOR_BLOCKED', message, processorId?}`), and **`error`** (`{code:'CHAT_RUN_NOT_FOUND'}`) — each carrying a monotonic `seq` (the SSE `id`); the `Last-Event-ID` header is parsed as `afterSeq` and replays only `WHERE seq > afterSeq`; the stream closes when the run reaches `completed`/`blocked`/`failed`; the durable `chat_messages` row (`durable_message_id` on `chat_runs`, written in `finalizeChatRun()`) is authoritative. Sprint 24 rewired the chat cluster onto Zero/Hono (`app/zero/schema.ts`, `app/zero/queries.ts` `chatMessagesByConversation`, `app/(drawer)/chat/[conversationId].tsx`, `components/chat/ChatThread.tsx`). This task extends the existing chat thread with a resumable `EventSource` hook and ONE unified state machine — it does not create new screens and does not rebuild the backend.

## Specification
- **Objective:** Implement a resumable SSE chat-streaming client that reconnects after a mid-stream drop and reconciles to exactly one final assistant message matching its Zero-synced durable row, with zero duplicate tokens.
- **Success state:** The user sends a message; the reply streams token-by-token over the real SSE socket; toggling airplane mode mid-stream for 3s then restoring resumes via `Last-Event-ID` replay (only `seq > afterSeq`), delivering zero duplicate tokens; on the `terminal` event the thread shows exactly one final message matching the `chat_messages` row. Reads via Zero `useQuery`; live stream via a new resumable `EventSource` hook.

## Critical Constraints
### MUST
- MUST reuse the existing chat thread `app/(drawer)/chat/[conversationId].tsx` and `components/chat/ChatThread.tsx`; NO new screen files
- MUST implement ONE unified chat-thread state machine (`idle`/`streaming`/`reconnecting`/`complete`/`cancelled`) consumed by the existing chat thread — transitions are state mutations, never nav pushes
- MUST honor the real backend SSE contract: event types `token`/`terminal`/`blocked`/`error`, monotonic `seq` as `Last-Event-ID`, durable `chat_messages` row authoritative
- MUST seed via the real entrypoint `holo seed:e2e --reset` and observe concrete counts over Zero — never view-injection
- MUST preserve react-native-paper `Text`/components and semantic theme tokens; include accessibility labels + `testID` on interactive elements
### NEVER
- NEVER create a new screen file (e.g. `ChatStreamingScreen.tsx`)
- NEVER add a new `convex/react` import (`useQuery`/`useMutation`/`useAction`)
- NEVER hardcode theme colors/spacing/typography
- NEVER replay all events on reconnect (causes duplicate tokens) — always send `Last-Event-ID`
- NEVER mock the `EventSource` or SSE events
### STRICTLY
- STRICTLY every behavioral AC is proven via real seeded Postgres + Zero on a Maestro e2e flow against a named iOS Simulator — never a mocked store
- STRICTLY the PRIMARY AC (reconnect exactly-once) is `test_tier: e2e`, `tier: visible`, bound to UC-SYNC-02
- STRICTLY the resumable SSE hook reads `Last-Event-ID` from the last `seq`, and the client reconciles streamed tokens to the durable Zero row (zero duplicates)

## Capability Chain
- **Touches:** CAP-SYNC-01
- **Provides:** `resumable-sse-chat-client`
- **Consumes:** `resumable-sse-backend` (Sprint 18), `zero-durable-message` (Sprint 24)
- **Boundary contracts:** `GET /api/chat-runs/:id/events` emits `token`/`terminal`/`blocked`/`error` with monotonic `seq`; `Last-Event-ID`→`afterSeq` replays only `seq > afterSeq`; the Zero `chat_messages` row (`durable_message_id`) is authoritative; `POST /api/chat-runs/:id/cancel` aborts an in-flight stream

## Acceptance Criteria
### AC-1: Reply streams token-by-token over the real SSE socket
- **GIVEN:** a seeded 'Streaming' conversation with `>=1` prior message exists via `holo seed:e2e --reset`
- **WHEN:** the user sends a message from the composer
- **THEN:** `>=1` SSE `token` events stream over the real socket, each appending to a single in-progress assistant bubble
- **Test tier:** `e2e` · **Verification service:** `resumable SSE+Zero+seeded Postgres` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `maestro test .maestro/reactive/token-streaming.yml on a named iOS Simulator after holo seed:e2e --reset`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** disconnect — `POST /api/chat-runs` not wired or Hono down; stub — tokens from a hardcoded array, no real SSE socket; mock — `EventSource` mocked to emit a canned string with no durable row
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `user`; steps: type a message, tap send → MUST observe `>=1` SSE `token` events (each a `data:` line with a `{token}` payload), each token appends to a single in-progress bubble (count `1`), the bubble text grows until the `terminal` event; MUST NOT observe `0` SSE token events (empty), multiple assistant bubbles (`>1`), or the full reply appearing instantly (`0` token-by-token buildup)

### AC-2: Mid-stream airplane-mode reconnect resumes with ZERO duplicate tokens [PRIMARY]
- **GIVEN:** a chat reply is streaming token-by-token over SSE
- **WHEN:** the user toggles airplane mode for 3s mid-stream then restores
- **THEN:** the stream resumes via `Last-Event-ID` replay (only `seq > afterSeq`), yielding ZERO duplicate tokens in the final message
- **Test tier:** `e2e` · **Verification service:** `resumable SSE+Zero+seeded Postgres` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `maestro test .maestro/reactive/reconnect-exactly-once.yml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** disconnect — reconnect replays ALL events from `seq=0` (duplicates); stub — reconnect resumes from a cached array, no `Last-Event-ID` header; mock — `EventSource` mocked to replay all events; empty — `Last-Event-ID` not sent on reconnect
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `user`; steps: send a `>=5`-token reply, wait for 2-3 tokens, airplane ON 3s, airplane OFF, wait to complete → MUST observe the stream resumes (`>0` new tokens), `0` duplicate tokens (count `==` unique), the final text matches the Zero `chat_messages.content`, exactly `1` final bubble; MUST NOT observe duplicate token strings (e.g. `FourFour`), `>1` bubbles, a spinner with no message (`0` messages), or the stream stalling at `3` tokens (`0` new)

### AC-3: Exactly one final assistant message matching the durable Zero row [PRIMARY]
- **GIVEN:** a chat reply completes streaming (`terminal` event received)
- **WHEN:** the thread renders the final state
- **THEN:** the thread shows EXACTLY ONE final assistant message matching the durable `chat_messages` row (`role='agent'`, content byte-equal)
- **Test tier:** `e2e` · **Verification service:** `Zero+seeded Postgres` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `maestro test .maestro/reactive/exactly-one-final-message.yml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** disconnect — durable row not written to Postgres; empty — Zero query returns no row; stub — thread shows a hardcoded string with no durable row; mock — `terminal` faked, no real `chat_messages` row
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `user`; steps: send a message, wait for completion → MUST observe exactly `1` final bubble, the bubble text equals the Zero `chat_messages.content` (diff `== 0`), the Zero query returns `1` row with `role='agent'`, the bubble count stays `1` after the `complete` transition; MUST NOT observe `0` bubbles (empty thread), `>1` final bubbles, a spinner with no message (`0`), or the bubble text differing from the Zero row (`>0`)

### AC-4: Last-Event-ID gap-fill delivers only unobserved events
- **GIVEN:** a client reconnects with `Last-Event-ID=3`
- **WHEN:** the SSE server replays events
- **THEN:** only events with `seq > 3` are delivered; missing tokens are gap-filled without duplication
- **Test tier:** `e2e` · **Verification service:** `resumable SSE+Zero+seeded Postgres` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `maestro test .maestro/reactive/last-event-id-gap-fill.yml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** disconnect — `Last-Event-ID` not sent on reconnect; stub — gap-fill is a no-op; mock — server mocked to replay all events from `seq=0`; empty — reconnect starts a new stream without gap-fill
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `user`; steps: send a `>=8`-token reply, wait for 3 tokens (`id:3`), airplane ON 3s, airplane OFF (reconnect `Last-Event-ID=3`), wait to complete → MUST observe tokens with `seq > 3` delivered (`4,5,6…`), `0` tokens with `seq <= 3` duplicated, final token count `==` server total, Zero `chat_messages.content` equals assembled text (diff `== 0`); MUST NOT observe tokens `1-3` reappearing (`>0` duplicates), fewer tokens than expected (`<` total), or `0` unique tokens (empty)

### AC-5: Cancel finalizes the partial turn via the Hono cancel command
- **GIVEN:** an assistant reply is streaming token-by-token
- **WHEN:** the user taps cancel
- **THEN:** streaming stops, the partial turn is finalized via `POST /api/chat-runs/:id/cancel`, no further tokens
- **Test tier:** `e2e` · **Verification service:** `Hono cancel command+seeded Postgres` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `maestro test .maestro/reactive/cancel-stops-stream.yml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** stub — cancel is a no-op, streaming continues; disconnect — `POST /api/chat-runs/:id/cancel` not wired; empty — cancel does not transition state; mock — cancel mocked to succeed without calling the server
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `user`; steps: send a `>=8`-token reply, wait for 3-4 tokens, tap cancel → MUST observe `0` further SSE tokens after cancel, the state transitions to `cancelled`, the partial message persists (tokens `1-4`), the cancel `POST` was dispatched (not mocked); MUST NOT observe `>0` further tokens, the partial message disappearing (`0`), or the state remaining `streaming`

## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Token streaming over SSE delivers `>=1` data token events | AC-1 | `maestro test .maestro/reactive/token-streaming.yml` |
| TC-2 | Mid-stream airplane-mode reconnect resumes via `Last-Event-ID` with zero duplicate tokens | AC-2 | `maestro test .maestro/reactive/reconnect-exactly-once.yml` |
| TC-3 | Thread shows exactly one final assistant message matching the durable Zero row | AC-3 | `maestro test .maestro/reactive/exactly-one-final-message.yml` |
| TC-4 | `Last-Event-ID` replay delivers only unobserved events (gap-fill) | AC-4 | `maestro test .maestro/reactive/last-event-id-gap-fill.yml` |
| TC-5 | Cancel during stream finalizes the partial turn | AC-5 | `maestro test .maestro/reactive/cancel-stops-stream.yml` |
| TC-6 | Type check clean | AC-2 | `pnpm tsc --noEmit` |
| TC-7 | Lint pass | AC-2 | `pnpm lint` |
| TC-8 | Scenario fakeability | AC-2 | `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REACTIVE-01.json` |

## Reading List
- `RULES.md` — RN conventions (react-native-paper `Text`, semantic theme tokens, `testID`, `ScreenLayout` for `(drawer)/`)
- `.spec/prds/mk6-migration/08-uc-sync.md` — UC-SYNC-02 (resumable SSE + Zero-durable reconciliation)
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — T-SYNC-006
- `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml` — approved call-site→target mapping
- `tasks/sprint-18-chat-redesign-native-tool-loop-resumable-sse/chat-2-resumable-sse.md` — the SSE backend contract this client consumes
- `tasks/sprint-24-full-rn-app-rewrite-off-convex-onto-zero/S-REWRITE-01-rewire-chat-conversations-cluster-to-zero-hono.md` — the Zero chat seam + output shape
- `services/platform/src/http/hono-app.ts` (the SSE route, ~L228-256; reads `Last-Event-ID`, streams `id=seq`, closes on terminal)
- `services/platform/src/http/chat-runs.ts` (`appendEvent` monotonic `seq`; `listChatEvents` `WHERE seq > afterSeq`; `finalizeChatRun` writes the durable `chat_messages` row)
- `app/zero/schema.ts` (`chatMessages` table) · `app/zero/queries.ts` (`chatMessagesByConversation`)
- `app/(drawer)/chat/[conversationId].tsx` (MODIFY) · `components/chat/ChatThread.tsx` (MODIFY) · `hooks/use-chat-history.ts` (MODIFY) · `hooks/use-resumable-sse-stream.ts` (NEW)

## Guardrails
**Write allowed:**
- `app/(drawer)/chat/[conversationId].tsx (MODIFY)`
- `components/chat/ChatThread.tsx (MODIFY)`
- `hooks/use-chat-history.ts (MODIFY)`
- `hooks/use-resumable-sse-stream.ts (NEW)`
- `app/zero/queries.ts (MODIFY if a new query is needed)`
**Write prohibited:**
- Any new sibling screen file (e.g. `ChatStreamingScreen.tsx`)
- Any new `convex/react` import
- Hardcoded theme colors/spacing/typography; data seeded by view-injection
- Replaying all events on reconnect (omit `Last-Event-ID`); mocking the `EventSource`

## Design
**References:** `./SPRINT.md`; `.spec/prds/mk6-migration/08-uc-sync.md`; `tasks/sprint-18-*/chat-2-resumable-sse.md`; `tasks/sprint-24-*/S-REWRITE-01-*.md`
**Interaction notes:**
- ONE unified chat-thread state machine: `idle` → `streaming` → (`reconnecting` → `streaming`)* → `complete`/`cancelled`; transitions are state mutations, never nav pushes.
- Honor the real SSE contract: event types `token` (`{token}`), `terminal` (`{status, text?}`), `blocked` (`{code, message}`), `error` (`{code}`); each carries monotonic `seq` (SSE `id`); `Last-Event-ID` → `afterSeq` replays only `seq > afterSeq`.
- The durable Zero `chat_messages` row is authoritative; the SSE stream is the live preview. On `terminal`, reconcile streamed tokens to exactly one final row.
- State-driven UI: `idle` composer; `streaming` in-progress bubble + cursor; `reconnecting` indicator; `complete` final message; `cancelled` partial message.
**Pattern:** Zero `useQuery` (`chatMessagesByConversation`) for the durable list + a new `useResumableSSEStream` hook for the live token stream, reconciled to exactly one final message.
**Pattern source:** `app/zero/queries.ts`; `services/platform/src/http/chat-runs.ts`; `services/platform/src/http/hono-app.ts`.
**Anti-pattern:** replaying all events on reconnect (duplicate tokens); a per-state sibling `ChatStreamingScreen.tsx`; mocking the `EventSource`; multiple final bubbles; a spinner left after completion.

## Verification Gates
- **Token streaming over SSE** — `maestro test .maestro/reactive/token-streaming.yml` → Exit 0
- **Reconnect reconciles to exactly one final message, zero dup tokens (PRIMARY)** — `maestro test .maestro/reactive/reconnect-exactly-once.yml` → Exit 0
- **Exactly one final message matching Zero row** — `maestro test .maestro/reactive/exactly-one-final-message.yml` → Exit 0
- **Last-Event-ID gap-fill replay** — `maestro test .maestro/reactive/last-event-id-gap-fill.yml` → Exit 0
- **Cancel stops stream** — `maestro test .maestro/reactive/cancel-stops-stream.yml` → Exit 0
- **Type check clean** — `pnpm tsc --noEmit` → Exit 0
- **Lint pass** — `pnpm lint` → Exit 0
- **Scenario fakeability** — `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REACTIVE-01.json` → Exit 0

## Agent Assignment
- **Agent:** `react-native-ui-implementer` — owns the RN state/network layer this SSE client extends
- **Reviewer:** `react-native-ui-reviewer` — adversarial theme/a11y/contract + Zero/SSE-wiring review

## Evidence Gates
- RED-against-start for every behavioral AC (tdd_mode `red_first`): `True`
- Real-services (seeded Postgres + Zero + fleet/SSE, Maestro e2e) proof required: `True`
- Fakeability: `validate_scenario.py` exit 0 on every behavioral AC (independently re-verified)

## Review Criteria
- The client honors the backend SSE event types (`token`/`terminal`/`blocked`/`error`) and `Last-Event-ID` replay — zero fabricated event names
- Reconnect yields zero duplicate tokens; exactly one final message matches the durable Zero row
- Theme tokens / a11y / `testID` / `ScreenLayout` preserved (no hardcoded values, no new screen files)
- Zero `convex/react` on the path

## Dependencies
- **Depends on:** none
- **Blocks:** S-REACTIVE-03, S-REACTIVE-05

## Coding Standards
- `RULES.md` — RN conventions (react-native-paper `Text`, semantic theme, `testID`, `ScreenLayout`)
- `brain/docs/kanban/TASK-TEMPLATE.md`; `brain/docs/TDD-METHODOLOGY.md`

## Notes
- Generated by /kb-sprint-tasks-plan on 2026-07-24. Proposed by `react-native-ui-planner`; consolidated by the orchestrator (schema normalization + mastra backend-contract precision + scenario hardening + stable AC-N/TC-N ID assignment). `validate_scenario.py` exit 0 on this task's contract.
- PRD refs: UC-SYNC-02, T-SYNC-006.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-REACTIVE-01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-streaming-conversation": {
      "description": "the 'Streaming' conversation seeded by holo seed:e2e --reset, with a durable message thread ready for streaming replies",
      "seed_method": "public_api",
      "records": [
        "1 'Streaming' conversation exists in Postgres with >=1 prior message",
        "the conversation has a non-empty conversation_id",
        "Zero query chatMessagesByConversation returns >=1 message for this conversation"
      ]
    }
  },
  "requirements": [
    {"id":"AC-1","type":"acceptance_criterion","primary":false,"description":"GIVEN a seeded 'Streaming' conversation with >=1 prior message exists via holo seed:e2e --reset WHEN the user sends a message from the composer THEN >=1 SSE token events stream over the real socket, each appending to a single in-progress assistant bubble","verify":"maestro test .maestro/reactive/token-streaming.yml","maps_to_ac":null,"scenario":{"tier":"visible","test_tier":"e2e","verification_service":"resumable SSE+Zero+seeded Postgres","topology":"single-node","negative_control":{"would_fail_if":["stub — tokens from a hardcoded array, no real SSE socket","disconnect — POST /api/chat-runs not wired or Hono server down","mock — EventSource mocked to emit a canned string with no durable row"]},"evidence":{"artifact_type":"screenshot","required_capture":true},"cases":[{"start_ref":"seeded-streaming-conversation","action":{"actor":"user","steps":["type 'What is two plus two?' in the chat composer","tap the send button"]},"end_state":{"must_observe":[">=1 SSE `token` events received (each a `data:` line with a `{token}` payload)","each token appends to a single in-progress assistant bubble (assistant bubble count `1`)","the bubble text grows character-by-character until the `terminal` event"],"must_not_observe":["`0` SSE token events (no streaming — empty)","multiple assistant bubbles for one reply (count `>1`)","the full reply appearing instantly with `0` token-by-token buildup"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":true,"description":"GIVEN a chat reply is streaming token-by-token over SSE WHEN the user toggles airplane mode for 3s mid-stream then restores THEN the stream resumes via Last-Event-ID replay (only seq > afterSeq), yielding ZERO duplicate tokens","verify":"maestro test .maestro/reactive/reconnect-exactly-once.yml","maps_to_ac":null,"scenario":{"tier":"visible","test_tier":"e2e","verification_service":"resumable SSE+Zero+seeded Postgres","topology":"single-node","negative_control":{"would_fail_if":["disconnect — reconnect replays ALL events from seq=0, duplicating tokens","stub — reconnect resumes from a cached array, no real Last-Event-ID header","mock — EventSource mocked to replay all events on reconnect","empty — Last-Event-ID header not sent on reconnect"]},"evidence":{"artifact_type":"screenshot","required_capture":true},"cases":[{"start_ref":"seeded-streaming-conversation","action":{"actor":"user","steps":["send a message that triggers a streaming reply (>=5 tokens)","wait for 2-3 tokens to appear","toggle airplane mode ON for 3 seconds","toggle airplane mode OFF (restore connectivity)","wait for the stream to resume and complete"]},"end_state":{"must_observe":["the stream resumes after reconnect (new tokens arrive, count `>0`)","`0` duplicate tokens in the final assistant message (token count `==` unique token count)","the final message text matches the durable Zero-synced `chat_messages.content` row","exactly `1` final assistant bubble"],"must_not_observe":["duplicate token strings appearing (e.g. `FourFour` instead of `Four`)","multiple assistant bubbles for one reply (count `>1`)","a spinner with no message after completion (count `0` messages)","the stream not resuming (stalled at `3` tokens, `0` new tokens)"]}}]}},
    {"id":"AC-3","type":"acceptance_criterion","primary":true,"description":"GIVEN a chat reply completes streaming (terminal event received) WHEN the thread renders the final state THEN the thread shows EXACTLY ONE final assistant message matching the durable Zero chat_messages row (role='agent', content byte-equal)","verify":"maestro test .maestro/reactive/exactly-one-final-message.yml","maps_to_ac":null,"scenario":{"tier":"visible","test_tier":"e2e","verification_service":"Zero+seeded Postgres","topology":"single-node","negative_control":{"would_fail_if":["disconnect — durable row not written to Postgres","empty — Zero query returns no row for the message","stub — thread shows a hardcoded string with no durable row","mock — terminal event faked, no real chat_messages row written"]},"evidence":{"artifact_type":"screenshot","required_capture":true},"cases":[{"start_ref":"seeded-streaming-conversation","action":{"actor":"user","steps":["send a message from the chat composer","wait for the streaming reply to complete (terminal event received)"]},"end_state":{"must_observe":["`1` final assistant message bubble rendered (count exactly `1`)","the bubble text equals the Zero `chat_messages.content` value (diff `== 0`)","the Zero query returns `1` row with `role='agent'`","the bubble count stays `1` after the state transitions to `complete`"],"must_not_observe":["`0` assistant message bubbles (empty thread)","more than `1` final assistant bubble for the reply","a spinner with no message (count `0` messages)","the bubble text differing from the Zero row (diff `>0`)"]}}]}},
    {"id":"AC-4","type":"acceptance_criterion","primary":false,"description":"GIVEN a client reconnects with Last-Event-ID=3 WHEN the SSE server replays events THEN only events with seq > 3 are delivered and missing tokens are gap-filled without duplication","verify":"maestro test .maestro/reactive/last-event-id-gap-fill.yml","maps_to_ac":null,"scenario":{"tier":"visible","test_tier":"e2e","verification_service":"resumable SSE+Zero+seeded Postgres","topology":"single-node","negative_control":{"would_fail_if":["disconnect — Last-Event-ID header not sent on reconnect","stub — gap-fill is a no-op, missing tokens never arrive","mock — server mocked to replay all events from seq=0","empty — reconnect starts a new stream without gap-fill"]},"evidence":{"artifact_type":"screenshot","required_capture":true},"cases":[{"start_ref":"seeded-streaming-conversation","action":{"actor":"user","steps":["send a message that triggers a streaming reply (>=8 tokens)","wait for 3 tokens to arrive (note the seq id, e.g. id:3)","toggle airplane mode ON for 3 seconds","toggle airplane mode OFF (trigger reconnect with Last-Event-ID=3)","wait for the stream to complete"]},"end_state":{"must_observe":["tokens with `seq > 3` are delivered (seq `4,5,6...`)","`0` tokens with `seq <= 3` are duplicated","the final message token count `==` the server total token event count","the Zero `chat_messages.content` equals the assembled streamed text (diff `== 0`)"],"must_not_observe":["tokens `1-3` reappear after reconnect (`>0` duplicates)","the final message has fewer tokens than expected (gap-fill failed, count `<` total)","`0` unique tokens in the final message (empty)"]}}]}},
    {"id":"AC-5","type":"acceptance_criterion","primary":false,"description":"GIVEN an assistant reply is streaming token-by-token WHEN the user taps cancel THEN streaming stops, the partial turn is finalized via POST /api/chat-runs/:id/cancel, and no further tokens arrive","verify":"maestro test .maestro/reactive/cancel-stops-stream.yml","maps_to_ac":null,"scenario":{"tier":"visible","test_tier":"e2e","verification_service":"Hono cancel command+seeded Postgres","topology":"single-node","negative_control":{"would_fail_if":["stub — cancel is a no-op, streaming continues","disconnect — POST /api/chat-runs/:id/cancel not wired","empty — cancel button does not trigger state transition","mock — cancel mocked to succeed without calling the server"]},"evidence":{"artifact_type":"screenshot","required_capture":true},"cases":[{"start_ref":"seeded-streaming-conversation","action":{"actor":"user","steps":["send a message that triggers a streaming reply (>=8 tokens)","wait for 3-4 tokens to arrive","tap the cancel button"]},"end_state":{"must_observe":["`0` further SSE token events after cancel (stream stops)","the state machine transitions to the `cancelled` state","the partial message persists (showing tokens `1-4`)","the `POST /api/chat-runs/:id/cancel` was dispatched (not mocked)"],"must_not_observe":["streaming continues after cancel (`>0` further tokens)","the partial message disappears (count `0` tokens shown)","the state remains in the `streaming` state (not `cancelled`)"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"Token streaming over SSE delivers >=1 data token events","verify":"maestro test .maestro/reactive/token-streaming.yml","maps_to_ac":"AC-1"},
    {"id":"TC-2","type":"test_criterion","description":"Mid-stream airplane-mode reconnect resumes via Last-Event-ID with zero duplicate tokens","verify":"maestro test .maestro/reactive/reconnect-exactly-once.yml","maps_to_ac":"AC-2"},
    {"id":"TC-3","type":"test_criterion","description":"Thread shows exactly one final assistant message matching the durable Zero row","verify":"maestro test .maestro/reactive/exactly-one-final-message.yml","maps_to_ac":"AC-3"},
    {"id":"TC-4","type":"test_criterion","description":"Last-Event-ID replay delivers only unobserved events (gap-fill)","verify":"maestro test .maestro/reactive/last-event-id-gap-fill.yml","maps_to_ac":"AC-4"},
    {"id":"TC-5","type":"test_criterion","description":"Cancel during stream finalizes the partial turn","verify":"maestro test .maestro/reactive/cancel-stops-stream.yml","maps_to_ac":"AC-5"},
    {"id":"TC-6","type":"test_criterion","description":"Type check clean","verify":"pnpm tsc --noEmit","maps_to_ac":"AC-2"},
    {"id":"TC-7","type":"test_criterion","description":"Lint pass","verify":"pnpm lint","maps_to_ac":"AC-2"},
    {"id":"TC-8","type":"test_criterion","description":"Scenario fakeability validation","verify":"python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REACTIVE-01.json","maps_to_ac":"AC-2"}
  ]
}
-->
