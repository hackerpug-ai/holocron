# S-REACTIVE-04: Degraded 'local fleet unavailable' state in chat (no hang)
> Status: Backlog

- **Sprint:** [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `M`
- **Estimate:** `120 minutes`
- **Agent:** `react-native-ui-implementer`
- **Reviewer:** `react-native-ui-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
Extend the chat-thread state machine with a `degraded` state that infers fleet-unavailable from the chat failure envelope and renders the exact `Local fleet unavailable — running in reduced mode` message within seconds — instead of a spinner hang.

## Background
This is Sprint 25 (UC-SYNC-02; T-INFER-015). Sprint 08 built the degraded-mode controller (`services/platform/src/inference/degraded-mode-controller.ts`): when the divergent role's `:4545` endpoint is unreachable, `resolveModel` throws `RoleUnavailableError`, the controller transitions to `surface-unavailable`, and surfaces `SURFACE_UNAVAILABLE_MESSAGE = 'Local fleet unavailable — running in reduced mode'` (line 36); it auto-resumes via a 30s health probe. **Contract reality (boundary note):** the `degraded_mode` table is **not** in `zero_pub` and there is **no HTTP endpoint** exposing the degraded snapshot — so the client **cannot** Zero-query it. The honest client path is to **infer** the degraded state from the chat failure envelope: when `POST /api/chat-runs` returns a fleet-unavailable error or the SSE stream emits a `terminal`/`error` signal indicating the fleet is down, the chat-thread state machine transitions to `degraded` and renders the exact message — it must NOT hang on a silent socket. (Optional follow-up, out of scope: adding `degraded_mode` to `zero_pub` or a `GET /api/degraded-state` endpoint would give a realtime signal.) This task extends S-REACTIVE-01's chat-thread state machine; it does not modify the backend and does not create new screens.

## Specification
- **Objective:** Extend the chat-thread state machine with a `degraded` state that infers fleet-unavailable from the chat failure envelope and renders the exact `SURFACE_UNAVAILABLE_MESSAGE`, with no spinner hang and clean recovery.
- **Success state:** With the inference fleet endpoint (`:4545`) taken down, sending a chat message shows `Local fleet unavailable — running in reduced mode` within ~5s — not a spinner hang; when the fleet returns, chat recovers to normal. Proven by Maestro e2e on a named iOS Simulator.

## Critical Constraints
### MUST
- MUST extend S-REACTIVE-01's chat-thread state machine with a `degraded` state
- MUST infer the degraded state from the chat failure envelope (`POST /api/chat-runs` error or SSE `terminal`/`error` signal) — the client cannot Zero-query `degraded_mode`
- MUST render the exact message `Local fleet unavailable — running in reduced mode` (`SURFACE_UNAVAILABLE_MESSAGE`)
- MUST surface the message within ~5s of the chat attempt — NOT a spinner hang
- MUST recover to `normal` when the fleet returns and the next chat succeeds
- MUST use react-native-paper `Text` with semantic theme tokens, `SafeAreaView`, and a `testID`
### NEVER
- NEVER hang on a spinner when the fleet is down (the user must see the message, not indefinite loading)
- NEVER Zero-query `degraded_mode` (not in `zero_pub`) or assume an HTTP endpoint exists (it does not)
- NEVER create a new screen file — modify the existing chat thread in place
- NEVER fall back to cloud (degraded mode surfaces unavailable, never a silent cloud call)
### STRICTLY
- STRICTLY `degraded_mode` is not in `zero_pub` and has no HTTP endpoint — the client infers from the chat failure envelope
- STRICTLY the message is the exact `SURFACE_UNAVAILABLE_MESSAGE` (`degraded-mode-controller.ts:36`)
- STRICTLY `tdd_mode red_first`: capture a failing Maestro flow showing the spinner hang before implementing the degraded state
- STRICTLY the fleet-down action is the same `:4545`-endpoint-down action Sprint 08 infer-3 uses (there is no `holo stack stop fleet` verb — see Verification Gates)

## Capability Chain
- **Touches:** CAP-SYNC-01
- **Provides:** `degraded-chat-state-no-hang`, `state-machine-degraded-extension`
- **Consumes:** `degraded-mode-controller-signal` (Sprint 08), `S-REACTIVE-01 chat-thread state machine`
- **Boundary contracts:** the degraded state is inferred from the chat failure envelope (not a Zero query / HTTP endpoint); the message is the exact `SURFACE_UNAVAILABLE_MESSAGE`; the client fails fast (no silent-socket hang); it recovers when the fleet returns

## Acceptance Criteria
### AC-1: Fleet-down → exact degraded message, no spinner hang [PRIMARY]
- **GIVEN:** a `seeded-streaming-conversation` exists and the fleet is running normally
- **WHEN:** the operator takes the inference fleet endpoint (`:4545`) down and the user sends a chat message
- **THEN:** the chat UI shows `Local fleet unavailable — running in reduced mode` within ~5s, NOT a spinner hang
- **Test tier:** `e2e` · **Verification service:** `Maestro + named iOS Simulator + real fleet-down + seeded Postgres` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `holo seed:e2e --reset && (fleet-down action) && maestro test .maestro/reactive/degraded-no-hang.yml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** disconnect — the error signal never reaches the client; stub — the degraded state is not wired to the state machine (spinner hangs forever); empty — the fleet was not actually stopped (no error signal emitted); mock — the Maestro flow fakes the message with no real fleet-down
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `operator`; steps: take the `:4545` fleet endpoint down, wait for unreachable, the user sends a chat message, observe the response within 5s → MUST observe the text `Local fleet unavailable — running in reduced mode` visible, appears within `5s`, no spinner/ActivityIndicator (spinner count `0`), Maestro exit `0`; MUST NOT observe a spinner running indefinitely (`>0` spins), no message after `10s`, or a generic message that is not the exact `SURFACE_UNAVAILABLE_MESSAGE`

### AC-2: Degraded state inferred from the chat failure envelope (not a Zero query)
- **GIVEN:** `degraded_mode` is not in `zero_pub` and has no HTTP endpoint
- **WHEN:** the chat thread receives a fleet-unavailable error from `POST /api/chat-runs` or an SSE `terminal`/`error` signal
- **THEN:** the state machine transitions to `degraded` and renders the exact message
- **Test tier:** `integration` · **Verification service:** `backend code grep + design-doc inspection` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `grep -n SURFACE_UNAVAILABLE_MESSAGE services/platform/src/inference/degraded-mode-controller.ts && grep -nE 'failure envelope|infer' design/interaction-notes.md`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** disconnect — the controller is not running or the signal not wired; stub — the state machine ignores the error signal; empty — `SURFACE_UNAVAILABLE_MESSAGE` is missing; mock — the design notes cite the wrong inference path
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `cli_user`; steps: grep the controller for `SURFACE_UNAVAILABLE_MESSAGE`, inspect the design notes for the failure-envelope inference path → MUST observe `SURFACE_UNAVAILABLE_MESSAGE = 'Local fleet unavailable — running in reduced mode'` (`degraded-mode-controller.ts:36`), the notes cite inference from the chat `failure envelope` (not a Zero query), the state machine transitions to `degraded` on the error signal, the UI message `==` the backend text; MUST NOT observe the notes citing a Zero query (`degraded_mode` is `not` in `zero_pub`), the state machine using an HTTP endpoint (`0` exist), or the message differing from the backend text (`>0`)

### AC-3: Degraded state recovers when the fleet returns [PRIMARY]
- **GIVEN:** the chat thread is in the `degraded` state and the fleet is down
- **WHEN:** the operator restores the fleet endpoint (`:4545`) and the user sends a new chat message
- **THEN:** the state machine transitions back to `normal`, the degraded message disappears, and the message sends
- **Test tier:** `e2e` · **Verification service:** `Maestro + named iOS Simulator + fleet restore` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `(fleet-restore action) && maestro test .maestro/reactive/degraded-recovery.yml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** disconnect — the controller does not detect the role available again; stub — the state machine is stuck in `degraded` (no recovery transition); empty — the restore action does not bring the role back
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-streaming-conversation`: actor `operator`; steps: confirm `degraded` active, restore the `:4545` endpoint, wait for reachable, the user sends a new message, observe return to normal → MUST observe the degraded message count drops to `0`, a new message sends (`1` reply), the state transitions back to `normal`, Maestro exit `0`; MUST NOT observe the degraded message persisting (`>0`), a new message failing (`0` replies), or a spinner during recovery (`>0`)

## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | The degraded message appears within ~5s after the fleet is down | AC-1 | `maestro test .maestro/reactive/degraded-no-hang.yml` |
| TC-2 | The message text exactly matches the backend `SURFACE_UNAVAILABLE_MESSAGE` | AC-2 | `grep -n SURFACE_UNAVAILABLE_MESSAGE services/platform/src/inference/degraded-mode-controller.ts` |
| TC-3 | The degraded state recovers when the fleet restarts | AC-3 | `maestro test .maestro/reactive/degraded-recovery.yml` |
| TC-4 | No spinner hang occurs in the degraded state | AC-1 | `maestro test .maestro/reactive/degraded-no-hang.yml` (assert no ActivityIndicator) |
| TC-5 | Type check clean + lint pass | AC-1 | `pnpm tsc --noEmit && pnpm lint` |
| TC-6 | Scenario fakeability | AC-1 | `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REACTIVE-04.json` |

## Reading List
- `services/platform/src/inference/degraded-mode-controller.ts:36` — `SURFACE_UNAVAILABLE_MESSAGE`; `:117-131` — `degraded_mode` state; auto-resume health probe
- `services/platform/src/db/schema/zero-pub.ts:158-199` — confirms `degraded_mode` is NOT in `zero_pub`
- `tasks/sprint-08-role-router-local-first-and-degraded-modes/infer-3-degraded-mode-controller-fleet-down-auto-resume.md` — the fleet-down (`:4545`) test action + `RoleUnavailableError` contract
- `app/(drawer)/chat/[conversationId].tsx` (MODIFY) — chat thread state machine extended with `degraded`
- `.spec/prds/mk6-migration/07-uc-infer.md` — T-INFER-015
- `RULES.md` — RN conventions (react-native-paper, theme tokens, `testID`, `SafeAreaView`)

## Guardrails
**Write allowed:**
- `app/(drawer)/chat/[conversationId].tsx (MODIFY)` — extend the state machine with `degraded`
- `components/chat/*` (MODIFY) — render the degraded message in place
- `hooks/useChatState.ts` or `hooks/use-resumable-sse-stream.ts` (MODIFY/NEW) — failure-envelope inference
- `.maestro/reactive/degraded-no-hang.yml (NEW)` · `.maestro/reactive/degraded-recovery.yml (NEW)`
**Write prohibited:**
- `services/platform/src/inference/*` — the backend signal already exists; do not modify
- `app/zero/*` — do not add `degraded_mode` (it is intentionally excluded); any new screen file
- A silent-socket hang; a Zero query for `degraded_mode`; a cloud fallback

## Design
**References:** `./SPRINT.md`; `.spec/prds/mk6-migration/07-uc-infer.md`; `tasks/sprint-08-*/infer-3-*.md`
**Interaction notes:**
- Backend signal source: `DegradedModeController` (`degraded-mode-controller.ts:117-131`); state `degraded_mode` (not in `zero_pub`, no HTTP endpoint); message `SURFACE_UNAVAILABLE_MESSAGE = 'Local fleet unavailable — running in reduced mode'` (line 36).
- Client inference path: trigger = chat failure envelope (`POST /api/chat-runs` fleet-unavailable error OR an SSE `terminal`/`error` signal); infer `degraded` from the error signal (cannot Zero-query); recover to `normal` when the fleet returns and the next chat succeeds.
- Follow-up (optional, out of scope): add `degraded_mode` to `zero_pub` or a `GET /api/degraded-state` endpoint for a realtime signal.
**Pattern:** chat-thread state machine `idle`/`streaming`/`reconnecting`/`complete`/`cancelled` extended with `degraded`; the SSE/HTTP error handler transitions to `degraded` and renders the exact `SURFACE_UNAVAILABLE_MESSAGE`.
**Pattern source:** `services/platform/src/inference/degraded-mode-controller.ts:36,328-381,439-488`; `hooks/use-resumable-sse-stream.ts` (S-REACTIVE-01).
**Anti-pattern:** waiting indefinitely on a silent socket; a client-side fleet health probe (bypasses the never-cloud guarantee); caching degraded state locally past auto-resume; Zero-querying `degraded_mode`.

## Verification Gates
- **Fleet-down → exact degraded message, no hang (PRIMARY)** — `holo seed:e2e --reset && (fleet-down action) && maestro test .maestro/reactive/degraded-no-hang.yml` → Exit 0
- **Degraded inferred from the chat failure envelope** — `grep -n SURFACE_UNAVAILABLE_MESSAGE services/platform/src/inference/degraded-mode-controller.ts` → Exit 0
- **Degraded recovers when the fleet returns** — `(fleet-restore action) && maestro test .maestro/reactive/degraded-recovery.yml` → Exit 0
- **Type check clean** — `pnpm tsc --noEmit` → Exit 0
- **Lint pass** — `pnpm lint` → Exit 0
- **Scenario fakeability** — `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REACTIVE-04.json` → Exit 0

> **Fleet-down action note:** there is no `holo stack stop fleet` verb (`holo stack` supports only `up`/`down`/`status`, and `holo stack down` is too coarse — it stops Postgres too). Take the **inference fleet endpoint (`:4545`) down** using the same harness action Sprint 08 infer-3 uses to trigger `RoleUnavailableError` (e.g. stop the fleet process / block `:4545`); restore it symmetrically for AC-3.

## Agent Assignment
- **Agent:** `react-native-ui-implementer` — owns the chat UI + state machine extension
- **Reviewer:** `react-native-ui-reviewer` — validates degraded correctness, message precision, recovery, a11y

## Evidence Gates
- RED-against-start for every behavioral AC (tdd_mode `red_first`): `True`
- Real-services (seeded Postgres + real fleet-down/restore, Maestro e2e) proof required: `True`
- Fakeability: `validate_scenario.py` exit 0 on every behavioral AC (independently re-verified)

## Review Criteria
- The degraded state is inferred from the chat failure envelope (not a Zero query / HTTP endpoint)
- The message is the exact `SURFACE_UNAVAILABLE_MESSAGE`; no spinner hang; clean recovery
- Theme tokens / `SafeAreaView` / `testID` / `ScreenLayout` preserved; zero `convex/react`; no cloud fallback

## Dependencies
- **Depends on:** S-REACTIVE-01 (extends its chat-thread state machine)
- **Blocks:** S-REACTIVE-03, S-REACTIVE-05

## Coding Standards
- `RULES.md` — RN conventions (react-native-paper, theme tokens, `testID`, `SafeAreaView`)
- `brain/docs/kanban/TASK-TEMPLATE.md`; `brain/docs/TDD-METHODOLOGY.md`

## Notes
- Generated by /kb-sprint-tasks-plan on 2026-07-24. Proposed by `react-native-ui-planner`; consolidated by the orchestrator (corrected the non-existent `holo stack stop fleet` to the real `:4545` fleet-down action per Sprint 08 infer-3; mastra degraded-contract precision — `degraded_mode` not in `zero_pub`, client infers from the chat failure envelope; `SURFACE_UNAVAILABLE_MESSAGE` exact text; canonical schema; scenario hardening; stable AC-N/TC-N IDs). `validate_scenario.py` exit 0 on this task's contract.
- PRD refs: UC-SYNC-02, T-INFER-015.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-REACTIVE-04",
  "tdd_mode": "red_first",
  "verification_policy": { "requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true },
  "fixtures": {
    "seeded-streaming-conversation": {
      "description": "A streaming conversation seeded via holo seed:e2e --reset for sending a chat message while the inference fleet is down",
      "seed_method": "public_api",
      "records": [
        "holo seed:e2e --reset creates a conversation and chat_messages rows",
        "the fleet is running initially (the divergent role :4545 endpoint is reachable)",
        "the chat UI is ready to send a message"
      ]
    },
    "fleet-endpoint-down": {
      "description": "The inference fleet endpoint (:4545) is taken down (the same fleet-down action Sprint 08 infer-3 uses to trigger RoleUnavailableError), so DegradedModeController surfaces SURFACE_UNAVAILABLE_MESSAGE",
      "seed_method": "recorded_external",
      "records": [
        "the divergent role :4545 endpoint becomes unreachable (fleet-down harness action)",
        "DegradedModeController detects the role unavailable (degraded-mode-controller.ts:117-131)",
        "a chat reasoning call returns a fleet-unavailable error / typed terminal signal",
        "SURFACE_UNAVAILABLE_MESSAGE = 'Local fleet unavailable — running in reduced mode'"
      ]
    }
  },
  "requirements": [
    {"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN a seeded-streaming-conversation exists and the fleet is running normally WHEN the operator takes the inference fleet endpoint (:4545) down and the user sends a chat message THEN the chat UI shows 'Local fleet unavailable — running in reduced mode' within ~5s, NOT a spinner hang","verify":"holo seed:e2e --reset && (fleet-down action) && maestro test .maestro/reactive/degraded-no-hang.yml","maps_to_ac":null,"scenario":{"tier":"visible","test_tier":"e2e","verification_service":"Maestro + named iOS Simulator + real fleet-down + seeded Postgres","topology":"single-node","negative_control":{"would_fail_if":["disconnect — the error signal never reaches the client","stub — the degraded state is not wired to the state machine (spinner hangs forever)","empty — the fleet was not actually stopped (no error signal emitted)","mock — the Maestro flow fakes the message with no real fleet-down"]},"evidence":{"artifact_type":"screenshot","required_capture":true},"cases":[{"start_ref":"seeded-streaming-conversation","action":{"actor":"operator","steps":["take the inference fleet endpoint (:4545) down","wait for the fleet to be unreachable","the user sends a chat message via the app UI","observe the chat thread response within 5s"]},"end_state":{"must_observe":["the text `Local fleet unavailable — running in reduced mode` is visible","the message appears within `5s` of sending the chat message","no spinner/ActivityIndicator is present (spinner count `0`)","Maestro exit code `0` with screenshot"],"must_not_observe":["a spinner/ActivityIndicator running indefinitely (hang signature, `>0` spins)","no message after `10s` (error signal not received)","a generic error message that is not the exact `SURFACE_UNAVAILABLE_MESSAGE` text"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":false,"description":"GIVEN degraded_mode is not in zero_pub and has no HTTP endpoint WHEN the chat thread receives a fleet-unavailable error from POST /api/chat-runs or an SSE terminal/error signal THEN the state machine transitions to degraded and renders the exact message","verify":"grep -n SURFACE_UNAVAILABLE_MESSAGE services/platform/src/inference/degraded-mode-controller.ts && grep -nE 'failure envelope|infer' design/interaction-notes.md","maps_to_ac":null,"scenario":{"tier":"visible","test_tier":"integration","verification_service":"backend code grep + design-doc inspection","topology":"single-node","negative_control":{"would_fail_if":["disconnect — the degraded-mode controller is not running or the signal not wired","stub — the state machine ignores the error signal","empty — the SURFACE_UNAVAILABLE_MESSAGE constant is missing","mock — the design notes cite the wrong inference path"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"seeded-streaming-conversation","action":{"actor":"cli_user","steps":["grep services/platform/src/inference/degraded-mode-controller.ts for SURFACE_UNAVAILABLE_MESSAGE","inspect the design notes for the failure-envelope inference path"]},"end_state":{"must_observe":["`SURFACE_UNAVAILABLE_MESSAGE = 'Local fleet unavailable — running in reduced mode'` (`degraded-mode-controller.ts:36`)","the design notes cite inference from the chat `failure envelope` (not a Zero query)","the state machine transitions to the `degraded` state on the error signal","the UI message string `==` the backend `SURFACE_UNAVAILABLE_MESSAGE` text"],"must_not_observe":["the design notes cite a Zero query (`degraded_mode` is `not` in zero_pub)","the state machine uses an HTTP endpoint (`0` exist)","the message differs from the backend text (diff `>0`)"]}}]}},
    {"id":"AC-3","type":"acceptance_criterion","primary":true,"description":"GIVEN the chat thread is in the degraded state and the fleet is down WHEN the operator restores the fleet endpoint (:4545) and the user sends a new chat message THEN the state machine transitions back to normal, the degraded message disappears, and the message sends","verify":"(fleet-restore action) && maestro test .maestro/reactive/degraded-recovery.yml","maps_to_ac":null,"scenario":{"tier":"visible","test_tier":"e2e","verification_service":"Maestro + named iOS Simulator + fleet restore","topology":"single-node","negative_control":{"would_fail_if":["disconnect — DegradedModeController does not detect the role available again","stub — the state machine is stuck in degraded (no recovery transition)","empty — the fleet restore action does not bring the role back"]},"evidence":{"artifact_type":"screenshot","required_capture":true},"cases":[{"start_ref":"seeded-streaming-conversation","action":{"actor":"operator","steps":["confirm the degraded state is active after the fleet-down","restore the fleet endpoint (:4545)","wait for the fleet to be reachable again","the user sends a new chat message","observe the chat thread return to normal"]},"end_state":{"must_observe":["the degraded message count drops to `0` on the chat thread","a new chat message sends successfully (`1` new assistant reply)","the state machine transitions back to the `normal` state","Maestro exit code `0` with screenshot"],"must_not_observe":["the degraded message persists after fleet restore (count `>0`)","a new message fails to send (`0` replies)","a spinner or hang during the recovery transition (spinner count `>0`)"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"The degraded message appears within ~5s after the fleet is down","verify":"maestro test .maestro/reactive/degraded-no-hang.yml","maps_to_ac":"AC-1"},
    {"id":"TC-2","type":"test_criterion","description":"The message text exactly matches the backend SURFACE_UNAVAILABLE_MESSAGE","verify":"grep -n SURFACE_UNAVAILABLE_MESSAGE services/platform/src/inference/degraded-mode-controller.ts","maps_to_ac":"AC-2"},
    {"id":"TC-3","type":"test_criterion","description":"The degraded state recovers when the fleet restarts","verify":"maestro test .maestro/reactive/degraded-recovery.yml","maps_to_ac":"AC-3"}
  ]
}
-->
