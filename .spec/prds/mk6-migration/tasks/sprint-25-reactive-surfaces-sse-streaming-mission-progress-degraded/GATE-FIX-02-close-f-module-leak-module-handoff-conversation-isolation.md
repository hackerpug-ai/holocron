# GATE-FIX-02 — Close F-MODULE-LEAK / NO_ORACLE_MODULE_STATE_ISOLATION (HIGH) — key ModuleStreamHandoff by conversationId and filter restore-on-mount so A→B navigation cannot paint A's stream into B
> Status: Backlog
> Sprint: [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 20 min
> Type: FEATURE
> Priority: P0
> Effort: S
> Proposed by: react-native-ui-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint25-reactive-20260726T055500Z.md#F-MODULE-LEAK`
> Reviewer: react-native-ui-reviewer

## Outcome

`ModuleStreamHandoff` carries `conversationId`; persist stamps it; restore-on-mount and ChatScreen handoff consumers refuse mismatched `conversationId`; integration oracle sets handoff for `conv-A` (text `REPLY-FROM-A`), mounts/reads as `conv-B`, asserts B snapshot remains idle / empty of `REPLY-FROM-A` (or scoped get is null); same-conversation remount still restores; `s-reactive-01` + `redhat-fix-04` AC-1 green; `.tmp/sprint-25/gate-fix-02-red.log` + `path.json` recorded; optional mutation dropping filter kills the isolation test.

## Background

- **Source finding:** `.spec/reviews/red-hat-sprint25-reactive-20260726T055500Z.md#F-MODULE-LEAK` / `NO_ORACLE_MODULE_STATE_ISOLATION` (HIGH, 2-reviewer consensus — cycle 6)
- **PRD refs:** UC-SYNC-02, T-SYNC-006
- **Capability:** CAP-SYNC-01
- **Agent rationale:** Owns `hooks/use-resumable-sse-stream.ts` `ModuleStreamHandoff` singleton (:441-493, restore-on-mount :1132-1140) and `app/(drawer)/chat/[conversationId].tsx` handoff consumer / `useResumableSSEStream` call site (:152, :269-311). Sibling isolation pattern already lives on the same chat screen (`modulePendingUser` / `moduleLocalTurn`). Reviewer: react-native-ui-reviewer.
- GATE-FIX-01 introduced three module-level mutable singletons for remount survival. Two are correctly keyed by `conversationId`; `moduleStreamHandoff` is not.
- TQ Mutant G: dropping `modulePendingUser.conversationId` filter → byte-identical suite (71 pass) — zero tests mount chat with two different `conversationId`s.
- Blast: A→B navigation mid/after stream restores A's handoff into B; B paints A's reply until B's next outbound message (`connect()` → `clearModuleStreamHandoff`).
- Primary expansion: **react-native-ui-planner**; backend boundary enrichments from **mastra-planner**.
- [mastra-planner boundary] FREEZE — SSE event types remain `token` | `terminal` | `blocked` | `error` (Sprint 18).
- [mastra-planner boundary] FREEZE — Monotonic seq; `Last-Event-ID` → `afterSeq`; `listChatEvents` filters `seq > afterSeq` in `chat-runs.ts`. DO NOT rewrite server endpoints.
- [mastra-planner boundary] FREEZE — Client `assemblyRef.current.lastSeq` remains the sole resume cursor; site A (XHR onError) and site B (`setOnline`) stay load-bearing.
- [mastra-planner boundary] CLIENT-ONLY — `moduleStreamHandoff` is remount survival, NOT a server concept. Adding `conversationId` MUST NOT change server contract, Zero schema, or Postgres tables.
- [mastra-planner boundary] AUTHORITY — Durable `chat_messages` row remains authoritative; handoff is optimistic overlay only.
- [mastra-planner boundary] RESTORE SEMANTICS — `restoreFromHandoff` may re-open SSE for streaming|reconnecting with `Last-Event-ID = handoff.lastSeq` ONLY when `handoff.conversationId` matches active conversation.
- [mastra-planner boundary] GATE-FIX-01 NON-REGRESSION — Never clear handoff solely because a different conversation mounted; mismatch filter skips restore; handoff remains for A remount.
- [mastra-planner boundary] PRODUCT FREEZE — Do not re-open REDHAT-FIX-09/10/11; `services/platform/**` write-prohibited.
- [mastra-planner boundary] SCREEN CONSUMERS — Any `getModuleStreamHandoff()` paint path in `[conversationId].tsx` (~:269-311) MUST also match `conversationId`; filter-only at restore-on-mount is insufficient if the screen still paints `handoff.text` into B's `moduleLocalTurn`.

## Critical Constraints

### MUST
- MUST add `conversationId: string` to `export type ModuleStreamHandoff`
- MUST persist `conversationId` in `persistModuleStreamHandoff` / moduleStreamHandoff write path
- MUST pass `conversationId` from ChatScreen (`useLocalSearchParams`) into `useResumableSSEStream` / `createResumableSseController` options (or equivalent production wiring)
- MUST filter restore-on-mount effect so `handoff.conversationId !== currentConversationId` never calls `restoreFromHandoff`
- MUST filter ChatScreen handoff consumer (`getModuleStreamHandoff` / `handoff.text` path ~:269-311) by `conversationId` parity with `modulePendingUser`
- MUST keep GATE-FIX-01 remount survival: same-conversation dispose→remount still restores `streamedText` + phase
- MUST extend `s-reactive-01` (or NEW `gate-fix-02-module-handoff-isolation.test.ts`) with two-conversation isolation scenario using real module singleton + real `createResumableSseController` / restore path
- MUST capture RED evidence under `.tmp/sprint-25/gate-fix-02-red.log` + `gate-fix-02-path.json` before claiming green
- MUST leave `redhat-fix-04` AC-1 and existing `s-reactive-01` suite green
- MUST keep mismatched handoff resident (do not `clearModuleStreamHandoff` on A→B navigation) so A remount survival still works

### NEVER
- NEVER leave `moduleStreamHandoff` unscoped by `conversationId` while restore-on-mount still auto-restores
- NEVER mock isolation so `conversationId` is never checked (e.g. test only asserts type has field without exercising restore filter)
- NEVER remove GATE-FIX-01 remount survival (module handoff must still survive dispose for SAME conversation)
- NEVER reopen closed REDHAT-FIX-09/10/11 product paths or edit `services/platform/**`
- NEVER clear handoff on every unmount in a way that breaks same-conversation remount survival unless path B is explicitly chosen and documented
- NEVER claim green without a failing RED log on the isolation test against unfixed code
- NEVER restore A's `lastSeq` / `openEventSource` into conversation B on mismatch
- NEVER claim isolation closed with only the existing single-conversation handoff test

### STRICTLY
- STRICTLY preferred remediation (a): `conversationId` on type + persist + restore filter + ChatScreen pass-through — match sibling `modulePendingUser` pattern
- STRICTLY PRIMARY AC `test_tier=integration` exercising real `moduleStreamHandoff` state
- STRICTLY `flow_ref` UC-SYNC-02 on PRIMARY AC
- STRICTLY `tdd_mode` red_first: RED test proves A handoff leaks into B on HEAD; GREEN asserts B does not restore
- STRICTLY `moduleStreamHandoff` remains client-only remount overlay; durable `chat_messages` is authoritative

## Specification

**Objective:** Close cycle-6 HIGH F-MODULE-LEAK / NO_ORACLE_MODULE_STATE_ISOLATION by keying GATE-FIX-01's `moduleStreamHandoff` singleton with `conversationId` and filtering restore-on-mount (and ChatScreen handoff consumers) so navigating conversation A→B mid/after stream cannot paint A's reply into B, while preserving same-conversation remount survival and the frozen SSE/backend resume contract.

**Success state:** `ModuleStreamHandoff` carries `conversationId`; persist records it; restore-on-mount and ChatScreen consumers refuse mismatched `conversationId`; integration oracle sets handoff for `conv-A` (text `REPLY-FROM-A`), mounts/reads as `conv-B`, asserts B snapshot remains idle/empty of `REPLY-FROM-A` (or scoped get is null); same-conversation remount still restores; `s-reactive-01` + `redhat-fix-04` AC-1 green; `.tmp/sprint-25/gate-fix-02-red.log` + `path.json` recorded; optional mutation dropping filter kills the isolation test; zero `services/platform/**` edits.

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** module-stream-handoff-conversation-isolation, two-conversation-handoff-oracle
- **Consumes:** GATE-FIX-01-module-handoff-remount-survival, resumable-sse-chat-client, resumable-sse-backend
- **Boundary contracts:**
  - PRIMARY defect: `ModuleStreamHandoff` type at `hooks/use-resumable-sse-stream.ts:441-449` has NO `conversationId`; singleton at :458; `persistModuleStreamHandoff` (:470-493) does not record it; restore-on-mount (:1132-1140) restores unconditionally for any idle controller.
  - PREFERRED remediation (a): add `conversationId` to type; thread into controller/hook options; record on persist; filter at restore-on-mount; ChatScreen passes `conversationId` from route params.
  - SECONDARY consumer leak: `[conversationId].tsx:269-311` reads `getModuleStreamHandoff()` and uses `handoff.text` without filter — MUST also scope.
  - SIBLING PATTERN: `modulePendingUser` / `moduleLocalTurn` filter at :247-249, :317, :349.
  - FREEZE (mastra): SSE types, `Last-Event-ID`/`afterSeq`, site A/B reconnect, durable authority, no platform edits.

## Acceptance Criteria

### AC-1: Two-conversation module handoff isolation [PRIMARY]
- **Description:** GIVEN `moduleStreamHandoff` seeded for conversation A with unique text `REPLY-FROM-A` (and `conversationId='conv-A'` after the type fix), and a fresh idle controller (or restore-on-mount path) scoped for conversation B WHEN the production restore path runs for B THEN B does NOT restore A's handoff: B snapshot remains phase `idle` (or non-restored), streamedText does not contain `REPLY-FROM-A`, and/or conversation-scoped get for B returns null; stored handoff still has `conversationId === 'conv-A'`; handoff not cleared by B mount
- **Test tier:** `integration` · **Verification service:** `real moduleStreamHandoff singleton + createResumableSseController / production restore path` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-02|two-conversation|isolation' || pnpm vitest run tests/integration/gate-fix-02-module-handoff-isolation.test.ts -t 'AC-1|isolation'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** stub — test reimplements filter in harness and never imports production restore-on-mount / getModuleStreamHandoff, empty — no handoff seeded; asserts only that idle stays idle without A→B cross-seed, mock — module singleton mocked so conversationId is never read from production state, static — only asserts TypeScript type shape without executing restore path, disconnect — suite skipped / not run treated as pass
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `handoff-conversation-b-isolation`: actor `cli_user`
    - **Steps:**
      - import hooks/use-resumable-sse-stream production module
      - clearModuleStreamHandoff()
      - createResumableSseController with conversationId='conv-A' (or seed handoff object with conversationId='conv-A')
      - restoreFromHandoff handoff-conversation-a (text REPLY-FROM-A, phase complete) so module singleton persists
      - dispose A controller; assert getModuleStreamHandoff() not null and conversationId==='conv-A' and text contains REPLY-FROM-A
      - createResumableSseController with conversationId='conv-B' OR invoke production restore-on-mount filter as B
      - Assert B getSnapshot().streamedText does not contain REPLY-FROM-A and phase is idle (or restore skipped)
    - **MUST observe:**
      - `stored module handoff.conversationId equals 'conv-A'`
      - `stored module handoff.text contains 'REPLY-FROM-A'`
      - `B controller snapshot.phase equals 'idle'`
      - `count of 'REPLY-FROM-A' in B streamedText equals 0`
    - **MUST NOT observe:**
      - `empty/start signature: B snapshot.streamedText contains 'REPLY-FROM-A'`
      - `B snapshot.phase equals 'complete' with runId equals 'run-handoff-A'`

### AC-2: Same-conversation remount survival non-regression (GATE-FIX-01)
- **Description:** GIVEN a ModuleStreamHandoff for conversation A with non-empty assembled text has been restored into an A-scoped controller and the controller is disposed WHEN a new A-scoped controller restores from the surviving module handoff (same conversationId) THEN A still restores: snapshot.phase matches handoff phase (e.g. complete), snapshot.streamedText contains the original reply, runId/durableMessageId match; reset clears module handoff
- **Test tier:** `integration` · **Verification service:** `createResumableSseController + moduleStreamHandoff remount path` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-01: module stream handoff survives dispose|GATE-FIX-02.*same-conversation|remount'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — handoff cleared on dispose so remount has nothing to restore, static — GATE-FIX-01 remount test deleted without replacement, stub — asserts only clearModuleStreamHandoff export exists, mock — restoreFromHandoff no-op that greenwashes snapshot without module singleton
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `handoff-same-conversation-remount`: actor `cli_user`
    - **Steps:**
      - Extend existing GATE-FIX-01 handoff test (~s-reactive-01-resumable-sse.test.ts:349-392) to include conversationId='conv-A' on handoff and controller options
      - restoreFromHandoff on ctrlA; assert snapshot complete + text
      - dispose; getModuleStreamHandoff() not null with conversationId==='conv-A'
      - ctrl2 A-scoped restoreFromHandoff(handoff); assert streamedText restored
      - ctrl2.reset(); assert getModuleStreamHandoff() null
    - **MUST observe:**
      - `post-dispose getModuleStreamHandoff() is not null with conversationId equals 'conv-A'`
      - `handoff.conversationId equals 'conv-A'`
      - `ctrl2.getSnapshot().streamedText contains 'REPLY-FROM-A'`
      - `ctrl2.getSnapshot().phase equals 'complete'`
    - **MUST NOT observe:**
      - `empty/start signature: post-dispose getModuleStreamHandoff() equals null`
      - `ctrl2 streamedText equals empty string after restoreFromHandoff`

### AC-3: Type + persist + production restore filter + sibling pattern parity
- **Description:** GIVEN production sources hooks/use-resumable-sse-stream.ts and app/(drawer)/chat/[conversationId].tsx after the fix WHEN implementer inspects ModuleStreamHandoff, persistModuleStreamHandoff, restore-on-mount effect, ChatScreen hook options, and handoff consumer THEN conversationId is on the type and persist path; restore-on-mount filters by conversationId; ChatScreen passes conversationId into the hook; handoff consumer filters by conversationId with sibling parity to modulePendingUser.conversationId === conversationId
- **Test tier:** `integration` · **Verification service:** `source contract + vitest isolation suite` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm biome check hooks/use-resumable-sse-stream.ts 'app/(drawer)/chat/[conversationId].tsx' && rg -n 'conversationId' hooks/use-resumable-sse-stream.ts 'app/(drawer)/chat/[conversationId].tsx' && pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-02|handoff|isolation'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** static — conversationId only added to type, never written on persist, empty — restore-on-mount still unconditional (no conversationId compare), stub — ChatScreen never passes conversationId so filter always mismatches or is undefined-bypass, mock — consumer still uses unscoped getModuleStreamHandoff().text for local-turn paint
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `handoff-conversation-a`: actor `cli_user`
    - **Steps:**
      - Confirm export type ModuleStreamHandoff includes conversationId: string
      - Confirm persistModuleStreamHandoff assigns conversationId onto moduleStreamHandoff
      - Confirm useResumableSSEStream / CreateResumableSseControllerOptions accept conversationId
      - Confirm restore-on-mount effect compares handoff.conversationId to options/current conversationId before restoreFromHandoff
      - Confirm ChatScreen useResumableSSEStream({ ..., conversationId }) wiring from useLocalSearchParams
      - Confirm handoff consumer at local-turn sync filters handoff.conversationId === conversationId (sibling pattern)
      - Run isolation + remount tests
    - **MUST observe:**
      - `ModuleStreamHandoff type field 'conversationId' match count >= 1`
      - `persistModuleStreamHandoff writes conversationId equals 'conv-A' on A controller`
      - `restore-on-mount source match count >= 1 for 'handoff.conversationId' comparison before restoreFromHandoff`
      - `ChatScreen useResumableSSEStream call includes 'conversationId' prop with match count >= 1`
    - **MUST NOT observe:**
      - `empty/start signature: restore-on-mount still only checks snap.phase without 'conversationId'`
      - `persistModuleStreamHandoff object literal missing 'conversationId' key (match count equals 0)`

### AC-4: Non-regression + RED evidence + optional filter-drop mutation kill
- **Description:** GIVEN isolation suite exists and production filter is implemented WHEN full s-reactive-01 suite and redhat-fix-04 AC-1 run; RED log captured from pre-fix isolation failure; optional mutant drops conversationId filter THEN s-reactive-01 exit 0; redhat-fix-04 AC-1 exit 0; .tmp/sprint-25/gate-fix-02-red.log exists proving isolation failed on unfixed code; path.json recorded; optional mutation.log shows mutant exit != 0; no services/platform/** edits; site A/B Last-Event-ID resume paths intact
- **Test tier:** `integration` · **Verification service:** `vitest non-regression + TDD evidence files` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts && pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1' && test -f .tmp/sprint-25/gate-fix-02-red.log && test -f .tmp/sprint-25/gate-fix-02-path.json`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — red.log missing or empty, static — path.json claims green without RED, stub — red.log hand-written without real vitest failure, disconnect — redhat-fix-04 AC-1 skipped, mock — mutation probe only mutates test file not production filter
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `mutant-drop-conversationid-filter`: actor `cli_user`
    - **Steps:**
      - Before fix (or with filter temporarily removed): run isolation test → capture failing output to .tmp/sprint-25/gate-fix-02-red.log
      - Write .tmp/sprint-25/gate-fix-02-path.json with path A (preferred remediation)
      - Implement fix; run s-reactive-01 full file exit 0
      - Run redhat-fix-04 -t 'AC-1' exit 0
      - Optional: drop conversationId filter only → re-run isolation → exit != 0; restore; log gate-fix-02-mutation.log
    - **MUST observe:**
      - `.tmp/sprint-25/gate-fix-02-red.log file size > 0 and contains isolation 'AssertionError' or 'FAIL'`
      - `.tmp/sprint-25/gate-fix-02-path.json path field equals 'A'`
      - `s-reactive-01-resumable-sse.test.ts exit code equals 0 after fix`
      - `redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1' exit code equals 0`
    - **MUST NOT observe:**
      - `empty/start signature: red.log file size equals 0 or only success output`
      - `s-reactive-01 suite exit code equals 1 after fix`

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Handoff seeded for conv-A with REPLY-FROM-A does not restore into conv-B controller (B idle / count of REPLY-FROM-A in B text equals 0) | AC-1 | `pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-02|two-conversation|isolation' || pnpm vitest run tests/integration/gate-fix-02-module-handoff-isolation.test.ts -t 'AC-1|isolation'` |
| TC-2 | Stored ModuleStreamHandoff after A seed has conversationId equal to 'conv-A' and text contains REPLY-FROM-A | AC-1 | `pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-02|two-conversation|isolation' || pnpm vitest run tests/integration/gate-fix-02-module-handoff-isolation.test.ts -t 'AC-1|isolation'` |
| TC-3 | Same-conversation dispose→remount still restores streamedText and phase for conv-A (GATE-FIX-01 non-regression) | AC-2 | `pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-01: module stream handoff survives dispose|GATE-FIX-02.*same-conversation|remount'` |
| TC-4 | Production ModuleStreamHandoff type, persist path, restore-on-mount, and ChatScreen consumer all carry/filter conversationId with sibling parity | AC-3 | `rg -n 'conversationId' hooks/use-resumable-sse-stream.ts && rg -n 'useResumableSSEStream\\(' -A6 'app/(drawer)/chat/[conversationId].tsx' && pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-02|handoff|isolation'` |
| TC-5 | s-reactive-01 full suite and redhat-fix-04 AC-1 remain green; gate-fix-02-red.log + path.json exist | AC-4 | `pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts && pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1' && test -f .tmp/sprint-25/gate-fix-02-red.log && test -f .tmp/sprint-25/gate-fix-02-path.json` |
| TC-6 | Optional: dropping conversationId restore filter causes isolation test to fail (mutant killed) | AC-4 | `test -f .tmp/sprint-25/gate-fix-02-mutation.log && rg -E 'KILLED|exit_nonzero|exit=[1-9]|failures=[1-9]' .tmp/sprint-25/gate-fix-02-mutation.log` |

## Fixtures

### `handoff-conversation-a`
- **seed_method:** `public_api`
- **description:** ModuleStreamHandoff snapshot for conversation A after a completed (or live) stream turn. Unique marker text must be observable if incorrectly restored into B.
  - conversationId = 'conv-A'
  - runId = 'run-handoff-A'
  - durableMessageId = 'durable-handoff-A'
  - lastSeq >= 1
  - text contains unique marker 'REPLY-FROM-A'
  - tokenCount >= 1
  - phase in HANDOFF_ACTIVE_PHASES ('complete' preferred for pure unit path without SSE)
  - updatedAt = Date.now()

### `handoff-conversation-b-isolation`
- **seed_method:** `public_api`
- **description:** Two-conversation isolation scenario: module handoff seeded for A, B-scoped controller / restore-on-mount path exercises production filter. Real module singleton + createResumableSseController — not a reimplemented filter in the test harness alone.
  - clearModuleStreamHandoff() at start
  - seed handoff for conv-A via restoreFromHandoff on A-scoped controller (or persist path) then dispose A
  - create B-scoped controller with conversationId='conv-B' (or invoke production restore filter as B)
  - assert B does not apply REPLY-FROM-A
  - assert handoff.conversationId field present on stored module snapshot

### `handoff-same-conversation-remount`
- **seed_method:** `public_api`
- **description:** GATE-FIX-01 non-regression: handoff for conv-A survives dispose and restores into a new A-scoped controller.
  - conversationId = 'conv-A' on handoff and controller options
  - dispose keeps module handoff
  - second controller restoreFromHandoff (or production restore path) reapplies streamedText containing original reply
  - reset clears module handoff

### `mutant-drop-conversationid-filter`
- **seed_method:** `cli`
- **description:** Optional temporary production edit: remove conversationId inequality check at restore-on-mount (and/or stop writing conversationId on persist). Isolation suite MUST fail under mutant; restore after probe.
  - mutant site: hooks/use-resumable-sse-stream.ts restore-on-mount filter (~:1132-1140 post-fix)
  - optional second site: persistModuleStreamHandoff omits conversationId
  - correct path exit 0; mutant path exit != 0 failures >= 1
  - log .tmp/sprint-25/gate-fix-02-mutation.log

## Reading List

- `.spec/reviews/red-hat-sprint25-reactive-20260726T055500Z.md:56-86,166-169` — F-MODULE-LEAK evidence, blast radius, preferred remediation (a), Mutant G survival, GATE-FIX-02 recommendation
- `hooks/use-resumable-sse-stream.ts:441-493` — ModuleStreamHandoff type (missing conversationId), moduleStreamHandoff singleton, get/clear/persist helpers
- `hooks/use-resumable-sse-stream.ts:517-520,562-584,920-930,946-969,1104-1140` — CreateResumableSseControllerOptions, persistHandoff, connect clears handoff, restoreFromHandoff, useResumableSSEStream restore-on-mount unconditional effect
- `hooks/use-resumable-sse-stream.ts:880-917` — Site A XHR onError + Site B setOnline Last-Event-ID resume — FREEZE; do not break
- `app/(drawer)/chat/[conversationId].tsx:85-107,152-155,247-311,349` — Sibling modulePendingUser/moduleLocalTurn conversationId isolation; useResumableSSEStream call site; unscoped getModuleStreamHandoff in local-turn sync
- `tests/integration/s-reactive-01-resumable-sse.test.ts:349-392` — GATE-FIX-01 single-conversation handoff remount test — extend with conversationId + add two-conversation isolation
- `tests/integration/redhat-fix-04-production-hook-reconnect.test.ts:1-50` — Non-regression target for AC-1 reconnect suite
- `services/platform/src/http/chat-runs.ts` — READ-ONLY SSE seq / listChatEvents afterSeq filter — FREEZE boundary
- `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/GATE-FIX-01-restore-chat-assistant-message-latest-after-stream.md` — GATE-FIX-01 intent: remount survival must not be destroyed by isolation fix

## Guardrails

### WRITE-ALLOWED
- `hooks/use-resumable-sse-stream.ts` (MODIFY — conversationId on ModuleStreamHandoff; persist; CreateResumableSseControllerOptions / UseResumableSSEStreamOptions; restore-on-mount filter; optional scoped getModuleStreamHandoff)
- `app/(drawer)/chat/[conversationId].tsx` (MODIFY — pass conversationId into useResumableSSEStream; filter handoff consumer ~:269-311 by conversationId)
- `tests/integration/s-reactive-01-resumable-sse.test.ts` (MODIFY — extend GATE-FIX-01 handoff test with conversationId; add two-conversation isolation case)
- `tests/integration/gate-fix-02-module-handoff-isolation.test.ts` (NEW — optional cleaner split for isolation oracle)
- `.tmp/sprint-25/gate-fix-02-red.log`
- `.tmp/sprint-25/gate-fix-02-path.json`
- `.tmp/sprint-25/gate-fix-02-mutation.log` (optional)
- `hooks/use-resumable-sse-stream.ts` (TEMPORARY mutation probe only — MUST restore; no permanent product regression)

### WRITE-PROHIBITED
- `services/platform/**` — product freeze; client-only isolation fix
- `services/platform/src/http/chat-runs.ts` — SSE afterSeq / finalize FREEZE
- `app/zero/schema.ts` — Zero schema FREEZE (handoff is not durable state)
- Reopening closed REDHAT-FIX-09 / REDHAT-FIX-10 / REDHAT-FIX-11 product paths
- Removing GATE-FIX-01 remount survival (dispose must still leave same-conversation handoff)
- Mocking isolation so conversationId is never checked in production code under test
- Clearing moduleStreamHandoff on every unmount without documenting path B and preserving same-conversation remount proof
- Diluting estimate with WEAK_ORACLE_SELECT_LATEST_AGENT before isolation RED/GREEN is proven
- Hand-writing green gate-results or fake red.log without real vitest failure output
- Changing SSE event types or Last-Event-ID header semantics

## Design / Pattern

- **References:** `.spec/reviews/red-hat-sprint25-reactive-20260726T055500Z.md#F-MODULE-LEAK`, `hooks/use-resumable-sse-stream.ts:441-493`, `hooks/use-resumable-sse-stream.ts:1132-1140`, `app/(drawer)/chat/[conversationId].tsx:247-249`
- **Pattern:** Module-level remount snapshot keyed and filtered by conversationId (optimistic module state isolation) — mirror modulePendingUser
- **Pattern source:** `app/(drawer)/chat/[conversationId].tsx:247-249` (modulePendingUser.conversationId === conversationId); :317, :349 moduleLocalTurn filters
- **Anti-pattern:** moduleStreamHandoff without conversationId key or restore filter; unscoped handoff.text paint into foreign conversation; mock-only isolation oracle; clear-on-unmount that re-breaks GATE-FIX-01; restoring A's lastSeq into B's openEventSource; rewriting server SSE for a client singleton leak
- **Note:** Preferred path (a): ModuleStreamHandoff.conversationId + filter at restore-on-mount + ChatScreen passes conversationId + consumer filter
- **Note:** Optional API: getModuleStreamHandoff(conversationId?: string) returns null on mismatch — keeps callers safe by default
- **Note:** Controller must know conversationId at persist time: add to UseResumableSSEStreamOptions / CreateResumableSseControllerOptions (cleanest)
- **Note:** Escape (b) clear-on-unmount / (c) runId match only if (a) blocked — record path B/C in path.json; preferred is (a)
- **Note:** WEAK_ORACLE_SELECT_LATEST_AGENT is optional stretch only after isolation proof; not required for this 20-min task

## Verification Gates

- **RED evidence (isolation fails on unfixed code):** `test -f .tmp/sprint-25/gate-fix-02-red.log && rg -E 'FAIL|AssertionError|failed|×|exit' .tmp/sprint-25/gate-fix-02-red.log` → expected: red.log contains real isolation failure evidence from vitest
- **Two-conversation isolation oracle:** `pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-02|two-conversation|isolation' || pnpm vitest run tests/integration/gate-fix-02-module-handoff-isolation.test.ts -t 'AC-1|isolation'` → expected: Exit 0 after fix; B does not restore REPLY-FROM-A
- **Same-conversation remount non-regression:** `pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-01: module stream handoff survives dispose'` → expected: Exit 0
- **Full s-reactive-01 suite:** `pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts` → expected: Exit 0
- **redhat-fix-04 AC-1 non-regression:** `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1'` → expected: Exit 0
- **Lint touched RN files:** `pnpm biome check hooks/use-resumable-sse-stream.ts 'app/(drawer)/chat/[conversationId].tsx' tests/integration/s-reactive-01-resumable-sse.test.ts` → expected: Exit 0
- **Path JSON:** `test -f .tmp/sprint-25/gate-fix-02-path.json && jq -e '.path=="A" or .path=="B" or .path=="C"' .tmp/sprint-25/gate-fix-02-path.json` → expected: path A preferred; B/C only if documented escape
- **Optional mutation kill:** `test -f .tmp/sprint-25/gate-fix-02-mutation.log && rg -E 'KILLED|exit_nonzero|exit=[1-9]|failures=[1-9]' .tmp/sprint-25/gate-fix-02-mutation.log` → expected: Optional: filter-drop mutant killed
- **No services/platform product edits:** `git diff --name-only -- services/platform | wc -l` → expected: 0 for this task's worktree changes

## Agent Assignment

- **Implementer:** react-native-ui-implementer
- **Rationale:** Owns hooks/use-resumable-sse-stream.ts ModuleStreamHandoff singleton (:441-493, restore-on-mount :1132-1140) and app/(drawer)/chat/[conversationId].tsx handoff consumer / useResumableSSEStream call site (:152, :269-311). Sibling isolation pattern already lives on the same chat screen (modulePendingUser / moduleLocalTurn). Test surface is tests/integration/s-reactive-01-resumable-sse.test.ts GATE-FIX-01 handoff remount suite — pure RN client, not platform/Postgres.
- **Reviewer:** react-native-ui-reviewer
- **Proposed by:** react-native-ui-planner

## Coding Standards

- brain/docs/TDD-METHODOLOGY.md
- RULES.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- brain/docs/TESTING-HIERARCHY.md

## Dependencies

- **depends_on:** GATE-FIX-01
- **blocks:** —

## Notes

- Cycle-6 only actionable product blocker on RN axis after REDHAT-FIX-09/10/11 closed.
- TQ Mutant G proved zero tests mount chat with two conversationIds — this task is the missing oracle.
- Secondary consumer leak at [conversationId].tsx:270 (handoff?.text without filter) must be closed or isolation is incomplete even with restore filter.
- WEAK_ORACLE_SELECT_LATEST_AGENT is optional ~10 min stretch — only if isolation RED/GREEN already done; not part of PRIMARY success_state.
- RED first: on HEAD, two-conversation test MUST fail (B restores REPLY-FROM-A) — that is the NO_ORACLE_MODULE_STATE_ISOLATION survival signature.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "handoff-conversation-a": {
      "description": "ModuleStreamHandoff snapshot for conversation A after a completed stream turn with unique marker REPLY-FROM-A.",
      "seed_method": "public_api",
      "records": [
        "conversationId = 'conv-A'",
        "runId = 'run-handoff-A'",
        "durableMessageId = 'durable-handoff-A'",
        "lastSeq >= 1",
        "text contains unique marker 'REPLY-FROM-A'",
        "tokenCount >= 1",
        "phase equals 'complete'",
        "updatedAt = Date.now()"
      ]
    },
    "handoff-conversation-b-isolation": {
      "description": "Two-conversation isolation: module handoff seeded for A, B-scoped controller/restore path exercises production filter.",
      "seed_method": "public_api",
      "records": [
        "clearModuleStreamHandoff() at start",
        "seed handoff for conv-A with text REPLY-FROM-A then dispose A",
        "create B-scoped controller with conversationId equals 'conv-B'",
        "assert B streamedText does not contain REPLY-FROM-A",
        "assert handoff.conversationId equals 'conv-A'"
      ]
    },
    "handoff-same-conversation-remount": {
      "description": "GATE-FIX-01 non-regression: handoff for conv-A survives dispose and restores into new A-scoped controller.",
      "seed_method": "public_api",
      "records": [
        "conversationId equals 'conv-A' on handoff and controller options",
        "dispose keeps module handoff non-null",
        "second controller restoreFromHandoff reapplies streamedText containing REPLY-FROM-A",
        "reset clears module handoff to null"
      ]
    },
    "mutant-drop-conversationid-filter": {
      "description": "Optional temporary production edit: remove conversationId inequality check at restore-on-mount.",
      "seed_method": "cli",
      "records": [
        "mutant site restore-on-mount filter dropped",
        "correct path exit code equals 0",
        "mutant path exit code != 0 with failures >= 1",
        "log path .tmp/sprint-25/gate-fix-02-mutation.log"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "UC-SYNC-02",
      "description": "GIVEN moduleStreamHandoff seeded for conversation A with unique text REPLY-FROM-A WHEN production restore path runs for conversation B THEN B does not restore A's handoff (B snapshot idle / count of REPLY-FROM-A in B text equals 0) and stored handoff.conversationId equals 'conv-A'",
      "verify": "pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-02|two-conversation|isolation' || pnpm vitest run tests/integration/gate-fix-02-module-handoff-isolation.test.ts -t 'AC-1|isolation'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real moduleStreamHandoff singleton + createResumableSseController / production restore path",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub", "empty", "mock", "static", "disconnect"]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "handoff-conversation-b-isolation",
            "action": {
              "actor": "cli_user",
              "steps": [
                "seed A handoff REPLY-FROM-A",
                "restore as B",
                "assert no leak"
              ]
            },
            "end_state": {
              "must_observe": [
                "stored module handoff.conversationId equals 'conv-A'",
                "stored module handoff.text contains 'REPLY-FROM-A'",
                "B controller snapshot.phase equals 'idle'",
                "count of 'REPLY-FROM-A' in B streamedText equals 0"
              ],
              "must_not_observe": [
                "empty/start signature: B snapshot.streamedText contains 'REPLY-FROM-A'",
                "B snapshot.phase equals 'complete' with runId equals 'run-handoff-A'"
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
      "flow_ref": "UC-SYNC-02",
      "description": "GIVEN handoff for conversation A with non-empty text WHEN controller disposes and a new A-scoped controller restores THEN same-conversation remount survival still works (streamedText + phase restored; reset clears handoff)",
      "verify": "pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-01: module stream handoff survives dispose|GATE-FIX-02.*same-conversation|remount'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "createResumableSseController + moduleStreamHandoff remount path",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["empty", "static", "stub", "mock"]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "handoff-same-conversation-remount",
            "action": {
              "actor": "cli_user",
              "steps": ["restore A", "dispose", "restore A again"]
            },
            "end_state": {
              "must_observe": [
                "post-dispose getModuleStreamHandoff() is not null with conversationId equals 'conv-A'",
                "handoff.conversationId equals 'conv-A'",
                "ctrl2.getSnapshot().streamedText contains 'REPLY-FROM-A'",
                "ctrl2.getSnapshot().phase equals 'complete'"
              ],
              "must_not_observe": [
                "empty/start signature: post-dispose getModuleStreamHandoff() equals null",
                "ctrl2 streamedText equals empty string after restoreFromHandoff"
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
      "flow_ref": "UC-SYNC-02",
      "description": "GIVEN production sources after fix WHEN inspected THEN ModuleStreamHandoff + persist carry conversationId; restore-on-mount filters; ChatScreen passes conversationId; handoff consumer filters with sibling parity to modulePendingUser",
      "verify": "pnpm biome check hooks/use-resumable-sse-stream.ts 'app/(drawer)/chat/[conversationId].tsx' && rg -n 'conversationId' hooks/use-resumable-sse-stream.ts 'app/(drawer)/chat/[conversationId].tsx'",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "source contract + vitest isolation suite",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["static", "empty", "stub", "mock"]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "handoff-conversation-a",
            "action": {
              "actor": "cli_user",
              "steps": ["confirm type/persist/filter/ChatScreen wiring"]
            },
            "end_state": {
              "must_observe": [
                "ModuleStreamHandoff type field 'conversationId' match count >= 1",
                "persistModuleStreamHandoff writes conversationId equals 'conv-A' on A controller",
                "restore-on-mount source match count >= 1 for 'handoff.conversationId' comparison before restoreFromHandoff",
                "ChatScreen useResumableSSEStream call includes 'conversationId' prop with match count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: restore-on-mount still only checks snap.phase without 'conversationId'",
                "persistModuleStreamHandoff object literal missing 'conversationId' key (match count equals 0)"
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
      "flow_ref": "UC-SYNC-02",
      "description": "GIVEN isolation suite and production filter WHEN s-reactive-01 + redhat-fix-04 AC-1 run and RED evidence captured THEN suites green; gate-fix-02-red.log + path.json exist; optional filter-drop mutant killed",
      "verify": "pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts && pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1' && test -f .tmp/sprint-25/gate-fix-02-red.log && test -f .tmp/sprint-25/gate-fix-02-path.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest non-regression + TDD evidence files",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["empty", "static", "stub", "disconnect", "mock"]
        },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "mutant-drop-conversationid-filter",
            "action": {
              "actor": "cli_user",
              "steps": ["capture RED", "implement", "non-regression"]
            },
            "end_state": {
              "must_observe": [
                ".tmp/sprint-25/gate-fix-02-red.log file size > 0 and contains isolation 'AssertionError' or 'FAIL'",
                ".tmp/sprint-25/gate-fix-02-path.json path field equals 'A'",
                "s-reactive-01-resumable-sse.test.ts exit code equals 0 after fix",
                "redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1' exit code equals 0"
              ],
              "must_not_observe": [
                "empty/start signature: red.log file size equals 0 or only success output",
                "s-reactive-01 suite exit code equals 1 after fix"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Handoff seeded for conv-A with REPLY-FROM-A does not restore into conv-B controller",
      "maps_to_ac": "AC-1",
      "verify": "pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-02|two-conversation|isolation' || pnpm vitest run tests/integration/gate-fix-02-module-handoff-isolation.test.ts -t 'AC-1|isolation'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Stored handoff has conversationId 'conv-A' and text REPLY-FROM-A",
      "maps_to_ac": "AC-1",
      "verify": "pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-02|two-conversation|isolation' || pnpm vitest run tests/integration/gate-fix-02-module-handoff-isolation.test.ts -t 'AC-1|isolation'"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Same-conversation remount survival still restores text+phase",
      "maps_to_ac": "AC-2",
      "verify": "pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-01: module stream handoff survives dispose|GATE-FIX-02.*same-conversation|remount'"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Production type/persist/restore/ChatScreen consumer all conversationId-scoped",
      "maps_to_ac": "AC-3",
      "verify": "rg -n 'conversationId' hooks/use-resumable-sse-stream.ts && pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts -t 'GATE-FIX-02|handoff|isolation'"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Non-regression suites green + RED evidence files present",
      "maps_to_ac": "AC-4",
      "verify": "pnpm vitest run tests/integration/s-reactive-01-resumable-sse.test.ts && pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1' && test -f .tmp/sprint-25/gate-fix-02-red.log && test -f .tmp/sprint-25/gate-fix-02-path.json"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Optional filter-drop mutant kills isolation oracle",
      "maps_to_ac": "AC-4",
      "verify": "test -f .tmp/sprint-25/gate-fix-02-mutation.log && rg -E 'KILLED|exit_nonzero|exit=[1-9]|failures=[1-9]' .tmp/sprint-25/gate-fix-02-mutation.log"
    }
  ]
}
-->
