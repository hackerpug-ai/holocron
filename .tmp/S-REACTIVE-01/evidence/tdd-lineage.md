# S-REACTIVE-01 TDD Lineage

## Base SHA
7dc40a0f4e7a556bde5cf8fed4393ea9c7fde037

## RED-against-start
Command: `pnpm exec vitest run tests/integration/s-reactive-01-resumable-sse.test.ts`
Result: 11 failed | 5 passed (Maestro yml files created first; hook/wiring absent)
Evidence: `.tmp/S-REACTIVE-01/red/ac-all-red-against-start.txt`

Negative control (would fail if):
- AC-1: hook absent / no EventSource / no token event types
- AC-2/AC-4: no Last-Event-ID / applyTokenEvent accepts duplicates
- AC-3: no reconcileThreadMessages / multiple agent bubbles
- AC-5: no cancel path to POST /api/chat-runs/:id/cancel

## GREEN
Command: same vitest file after implementation
Result: 16 passed
Evidence: `.tmp/S-REACTIVE-01/green/ac-all-green.txt`

| AC | Test | RED | GREEN |
|----|------|-----|-------|
| AC-1 | hook EventSource + token events + maestro token-streaming.yml | fail (hook missing) | pass |
| AC-2 | Last-Event-ID + applyTokenEvent dedupe + reconnect flow | fail | pass |
| AC-3 | reconcileThreadMessages exactly-one + chat history overlay | fail | pass |
| AC-4 | applyTokenEvent gap-fill seq>lastSeq + Last-Event-ID header | fail | pass |
| AC-5 | cancel POST path + cancelled phase + maestro cancel-stops-stream.yml | fail | pass |

## Maestro e2e (real device)
Simulator iPhone 17 booted present. Full Maestro against live seed+platform not executed in this session
(requires Metro + platform + seeded Postgres + app install). Flows authored at:
- `.maestro/reactive/token-streaming.yml`
- `.maestro/reactive/reconnect-exactly-once.yml`
- `.maestro/reactive/exactly-one-final-message.yml`
- `.maestro/reactive/last-event-id-gap-fill.yml`
- `.maestro/reactive/cancel-stops-stream.yml`

## Implementation
- hooks/use-resumable-sse-stream.ts (NEW) — real `eventsource` EventSource, Last-Event-ID, state machine
- hooks/use-chat-history.ts — reconcile streaming overlay with Zero durable rows
- components/chat/ChatThread.tsx — streamPhase / reconnecting indicator / e2e oracles
- app/(drawer)/chat/[conversationId].tsx — wire connect/cancel/overlay

No EventSource mocks. No new screen files. No convex/react.
