# GATE-FIX-01 — Restore chat-assistant-message-latest after stream complete (human gate step 2)
> Status: ✅ Completed
> Cycle: 1
> Reviewer: product-manager+technical
> Completed: 2026-07-26T05:32:56Z
> Sprint: [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 60 min
> Type: FEATURE
> Priority: P0
> Effort: M
> Proposed by: kb-run-sprint human-test gate
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Reviewer: react-native-ui-reviewer

## Outcome

`maestro test .maestro/reactive/reconnect-exactly-once.yml` (via `run-reconnect-exactly-once.sh`) exits 0 on HEAD; after stream + airplane mid-stream restore, `chat-assistant-message-latest` is visible with exactly one final assistant bubble; no dups. Full 5-step human gate produces fresh `gate-results.json` verdict pass.

## Background

After REDHAT-FIX-09/10/11 landed (dual-lens APPROVED), human-gate step 2 (reconnect exactly-once) consistently fails:

- Stream starts (token oracles / optional Stop)
- Airplane mid-stream + restore
- Stop not visible (terminal)
- **FAIL:** `chat-assistant-message-latest` not visible

DB shows durable `role=agent` row written; UI often shows only seed + user bubble. Seed assistant text may be visible without the success testID. Integration suites for FIX-09/10 pass; client diff since pre-wave is only FIX-11 oracle prep (`durableMessages` prop + content-byte-equal helpers + Maestro PATH-A asserts on `exactly-one-final-message.yml`).

## MUST
- MUST restore green `run-reconnect-exactly-once.sh` exit 0
- MUST keep bubble-count==1 / no full-replay dups oracles
- MUST produce fresh gate-results.json 5/5 pass after fix
- MUST not re-open NO_ORACLE_IDEMPOTENCY / F-E2 closed work
- MUST keep PATH-B honesty on S-REACTIVE-01 AC-3 (content byte-equal deferred) unless PATH-A Maestro content equality is green

## NEVER
- NEVER mark gate pass without running the real Maestro reconnect flow
- NEVER stub chat-assistant-message-latest onto seed during a live incomplete turn
- NEVER hand-write gate-results.json

## Acceptance Criteria

### AC-1: reconnect-exactly-once green [PRIMARY]
- **Verify:** `bash .maestro/reactive/run-reconnect-exactly-once.sh` exit 0
- **MUST observe:** chat-assistant-message-latest visible after mid-stream airplane restore; chat-assistant-bubble-count-1; no OneTwoThreeOneTwoThree dups

### AC-2: full human gate 5/5
- **Verify:** fresh gate-results.json verdict pass, steps_passed==5, new run_id, non-empty step logs

### AC-3: non-regression
- **Verify:** PLATFORM_IT FIX-09 concurrency still green; vitest redhat-fix-04 site-A still green
