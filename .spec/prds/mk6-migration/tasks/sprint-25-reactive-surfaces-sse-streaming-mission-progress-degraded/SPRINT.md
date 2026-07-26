---
sequence: 25
timeline: Phase 5 — Client Rewrite
status: Completed
planned_from_roadmap_sha: ebc5bd0985f9913b834c4a05223c7ece7c7aae8afd8c170bd57b58c2b580537a
planned_from_source_sha: 0277653e07e6e0f40ebeeb92b959913f07e3230c
source_kind: git-head
planned_at: 2026-07-24T19:52:54Z
---

# Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded

**Sequence:** 25
**Timeline:** Phase 5 — Client Rewrite
**Status:** Completed
> Progress: 17/17 tasks completed · updated 2026-07-26T05:32:56Z
> Status-Note: goal met — 17/17 tasks · human gate 5/5
**Proposed by:** react-native-ui-planner
**Milestone:** — (`sprint-25`)
**Branch:** `mk6-reactive-surfaces`
**PR:** —

## Overview

Sprint 25 is the **reactive-surfaces** sprint — it makes the surfaces that depended on Convex reactivity feel live on the new stack: resumable token streaming over SSE, live mission/research progress driven by Zero-synced Postgres rows, p95 cross-surface propagation within the declared sync SLO, and a graceful "local fleet unavailable" degraded state in chat. It closes **UC-SYNC-02** and the three SYNC test criteria it owns — T-SYNC-005, T-SYNC-006, T-SYNC-007 — plus T-INFER-015 (clear unavailable state in chat).

**What is already proven before this sprint.** Sprint 18 built the resumable SSE backend — `POST /api/chat-runs` returns a monotonic persisted event sequence, `Last-Event-ID` replay delivers only unobserved events, and gap-fill then Zero reconciliation make the durable message authoritative. Sprint 15/17 wrote the mission/research progress rows the client must surface, and Sprint 04 stood up the `zero_pub` publication + uuid replica identity the RN client reactively syncs (vectors excluded). Sprint 24 rewrote the app off Convex onto Zero/Hono — the Zero provider, `app/zero/schema.ts`, `app/zero/queries.ts`, the chat cluster, and the SSE/Hono send path all exist. Sprint 21's `13-client-data-contract.yaml` is the approved per-call-site mapping.

**What this sprint does.** It is a **client-side reactivity** sprint — it consumes the surfaces that already exist, it does not rebuild them. (1) **S-REACTIVE-01** — a resumable SSE chat-streaming client that reconnects after a mid-stream drop (airplane mode) and reconciles to *exactly one* final assistant message matching its Zero-synced durable row, with no duplicated tokens. (2) **S-REACTIVE-02** — live mission/research progress bound to Zero-synced Postgres rows so a progress bar advances live as the workflow reaches iteration 3/5. (3) **S-REACTIVE-03** — a cross-surface p95 Maestro journey proving an MCP-gateway document update reflects on the app within the 5s SLO via Zero. (4) **S-REACTIVE-04** — a degraded "local fleet unavailable" state in chat that surfaces a clear message instead of a spinner hang. (5) **S-REACTIVE-05** — a reviewer pass over streaming/reconciliation/degraded correctness + accessibility.

The gate is one un-fakeable outcome: after disconnecting mid-stream and reconnecting, a streamed chat reply reconciles to exactly one final assistant message matching its Zero-synced row with no duplicated tokens. The sprint owns one capability-chain segment: **CAP-SYNC-01** (resumable SSE + Zero-durable reconciliation, live mission progress, p95 ≤ 5s cross-surface propagation).

> **Dependency caveat (advisor, non-blocking).** Sprint 25 depends on Sprint 24 (🟠 In flight) for the rewired chat cluster and Zero provider it consumes. This JIT expansion is planned against Sprint 24's current committed state (`0277653e`); if the Sprint 24 rewrite drifts on the SSE-client seam or the `app/zero/{schema,queries}.ts` shape, re-run `/kb-sprint-tasks-plan --sprint 25 --only S-REACTIVE-01,S-REACTIVE-02 --overwrite` to refresh those two tasks.

## Human Testing Gate

**Gate:** After disconnecting mid-stream and reconnecting, a streamed chat reply reconciles to exactly one final assistant message matching its Zero-synced row with no duplicated tokens.

## Human Test Deliverable

1. Run `./bin/holo seed:e2e --reset` (or `pnpm seed:e2e`) — seeds the 'Streaming' conversation.
   - **Cold-checkout path:** prefer repo-relative `./bin/holo` or `pnpm seed:e2e` / `pnpm exec holo`. Do **not** rely on bare PATH `holo` alone — `~/.local/bin/holo` may be a stub that only implements `verify:no-convex-client` and returns exit 127 for `seed:e2e`.
2. Send 'Summarize the seeded doc' — the assistant reply streams token-by-token.
3. Toggle airplane mode mid-stream for 3s then restore — the stream resumes without duplicated tokens.
4. Wait for completion — the thread shows exactly one final assistant message matching the Zero row.
5. Start a research mission — the progress bar advances live as the workflow reaches iteration 3/5.
6. Update a seeded doc via the MCP gateway — the app reflects the new title within 5s via Zero.
7. Stop the local fleet then send a message — chat shows 'local fleet unavailable', not a spinner hang.

## Tasks

| ID | Title | Agent | Estimate |
|----|-------|-------|----------|
| S-REACTIVE-01 | Resumable SSE chat streaming client with exactly-once durable reconciliation | react-native-ui-implementer | 360 min |
| S-REACTIVE-02 | Live mission/research progress via Zero-synced Postgres rows | react-native-ui-implementer | 150 min |
| S-REACTIVE-03 | Cross-surface p95 journey: MCP doc update reflects on app within 5s | red-test-generator | 150 min |
| S-REACTIVE-04 | Degraded 'local fleet unavailable' state in chat (no hang) | react-native-ui-implementer | 120 min |
| S-REACTIVE-05 | Reviewer pass: streaming/reconciliation/degraded correctness + a11y | react-native-ui-reviewer | 120 min |
| REDHAT-FIX-01 | Fix fictional 'Streaming' seed conversation — referenced 4× in contract/gate/flow, 0× in `seed-e2e.ts`, masked by `optional: true` | react-native-ui-implementer | 60 min |
| REDHAT-FIX-02 | Land the real production writer for `research_sessions.current_iteration`, or retitle S-REACTIVE-02/T-SYNC-005 to disclose the engine-trigger gap and drop "as the workflow reaches" gate language | react-native-ui-implementer | 90 min |
| REDHAT-FIX-03 | Strengthen the PRIMARY gate oracle (SSE reconnect exactly-once) — mutation probe shows commenting out `Last-Event-ID` resume or resetting `assemblyRef` on reconnect still passes 22/22; add flows/tests that capture `streamLastSeq`/`streamTokenCount`, compare streamed text to the Zero row, and count agent bubbles | react-native-ui-implementer | 90 min |
| REDHAT-FIX-04 | Fix REDHAT-FIX-03's mutation test — `redhat-fix-03-sse-reconnect-wiring.test.ts`'s `runReconnectWiring` harness reimplements the reconnect flow in a local variable instead of exercising the production `useResumableSSEStream` hook; the assemblyRef-reset mutant against production code at `hooks/use-resumable-sse-stream.ts:608,712` still survives. Render the real hook (`@testing-library/react-hooks` + a real `http.createServer` SSE stub) or extract+test `openEventSource` directly | react-native-ui-implementer | 90 min |
| REDHAT-FIX-05 | Re-run the full 5-step human gate against HEAD and produce a fresh `gate-results.json` (current one is missing/deleted; `GATE-RESULTS.md` still documents the pre-fix run `s25-ht-20260725T155918Z` from 15:59:18Z, 3h34m before REDHAT-FIX completion) | react-native-ui-implementer | 45 min |
| REDHAT-FIX-06 | Restore the broken TDD evidence chain — commit `.tmp/sprint-25/redhat-fix-{01,02}-path.json` + RED evidence logs at the TC-5-mandated paths (currently only exist in stale `.kb-run-sprint/worktrees/REDHAT-FIX-0{1,2,3}/.tmp/` dirs, or at the wrong path for REDHAT-FIX-02), so TC-5 verify commands pass on a cold checkout | react-native-ui-implementer | 45 min |
| REDHAT-FIX-07 | Copy REDHAT-FIX-04's evidence files (`redhat-fix-04-path.json`, `redhat-fix-04-production-mutation.log`, `redhat-fix-04-red.log`) from `.kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/` to the primary checkout's `.tmp/sprint-25/` and commit them (or re-run `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` on the primary checkout, which self-generates the files), so REDHAT-FIX-04's own TC-5 verify command passes on a cold checkout | react-native-ui-implementer | 15 min |
| REDHAT-FIX-08 | Fix the `holo` PATH stub — `/Users/inference1/.local/bin/holo` implements ONLY `verify:no-convex-client`; every other command including `seed:e2e` returns exit 127 `unknown command`. Wire the primary-checkout `holo` binary to dispatch to `services/platform/src/cli/holo.ts` (as the worktree dispatchers already do) so gate step 1 (`holo seed:e2e --reset`) is re-runnable on a cold checkout. Then re-run the full 5-step gate against HEAD and commit a fresh `gate-results.json` (the last one was deleted mid an aborted re-run that hit the broken stub) | react-native-ui-implementer | 30 min |
| REDHAT-FIX-09 | Close NO_ORACLE_IDEMPOTENCY (CRITICAL) — the research-progress writer's concurrency guard (`research/progress.ts`) has zero test coverage. Add an integration test that fires two concurrent `advanceResearchSessionIteration` calls against the same seeded session and asserts exactly one succeeds (`currentIteration === previousIteration + 1`) and the other returns `ok:false, errorCode:'RESEARCH_SESSION_UPDATE_FAILED'` — this is the only thing standing between the sprint and a silent production double-increment | react-native-ui-implementer | 30 min |
| REDHAT-FIX-10 | Close F-E2 (HIGH) — cycle-4's mutation probe only proved the dual-site reconnect mutant is killed; a single-site-A (XHR onError retry) mutant survives with zero coverage. Add an integration test scenario that drives the XHR-onError reconnect path without calling `setOnline(false)`, OR extend the mutation-probe log format to record single-site-A as a separately documented mutant | react-native-ui-implementer | 45 min |
| REDHAT-FIX-11 | Close F-TEXT-DIFF-ORACLE (HIGH) — S-REACTIVE-01 AC-3's "content byte-equal" claim is unverified; no oracle compares rendered assistant text to the Zero durable row content. Add a maestro oracle doing that comparison, OR explicitly downgrade AC-3's contract text from "content byte-equal" to "exactly one bubble; content coordination deferred" with a tracked follow-up task | react-native-ui-implementer | 30 min |
| GATE-FIX-01 | Restore chat-assistant-message-latest after stream (human gate step 2) | react-native-ui-implementer | 60 min |

## Red-Hat Findings (cycle 1 — `.spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md`)

- **H1 → REDHAT-FIX-01** (Critical): fictional 'Streaming' conversation oracle.
- **H2 → REDHAT-FIX-02** (Critical): simulated research-progress writer, no production `current_iteration` write path.
- **H3 → REDHAT-FIX-03** (Critical): mutation-proven weak SSE reconnect oracle — regression-blind test suite on the sprint's PRIMARY gate claim.

## Red-Hat Findings (cycle 2 — `.spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md`)

- **H1, H2 CONFIRMED CLOSED** — real production code verified (seed conversation exists; `research/progress.ts` writer wired into `mission/cycle.ts` + `observability/mission-research.ts`).
- **H3-NOT-CLOSED → REDHAT-FIX-04** (Critical): REDHAT-FIX-03's own "mutation test" mutates a local test-harness variable, not the production `assemblyRef.current` — the mutant still survives against real production code.
- **G-2 → REDHAT-FIX-05** (Critical, process): no fresh gate run after the fixes landed; `gate-results.json` missing, `GATE-RESULTS.md` cites the stale pre-fix run.
- **G-3 → REDHAT-FIX-06** (High): TDD evidence chain (`path.json` + RED logs) broken on a cold checkout of the primary repo.

## Red-Hat Findings (cycle 3 — `.spec/reviews/red-hat-sprint25-reactive-20260725T211242Z.md`)

- **H3 CONFIRMED CLOSED** — production-code mutation probe independently re-verified; both load-bearing mutants killed against the real `useResumableSSEStream` hook.
- **G-2 CONFIRMED CLOSED** — fresh `gate-results.json` (5/5 pass) post-dates all REDHAT-FIX commits.
- **G-3 → REDHAT-FIX-07** (High, process): recurred on REDHAT-FIX-04 itself — its own evidence files exist only in the worktree, not the contract-mandated `.tmp/sprint-25/` path. Review's own words: "the only remaining blocker... trivial evidence-hygiene copy."
- Advisory (non-blocking per review): M-H2-LIVE ("as the workflow reaches" overclaim), M5-REGRESSED (new typecheck error from REDHAT-FIX-04), M3/M6 (duplicate testIDs), L-S05-STALE (stale doc annotations) — left for a future sprint, not gating this close.

## Red-Hat Findings (cycle 4 — `.spec/reviews/red-hat-sprint25-reactive-20260725T225400Z.md`)

- **G-3 CONFIRMED CLOSED** — REDHAT-FIX-07 restored the contract-path evidence files; H3 stays closed on independent re-probe at HEAD `addea0fce`.
- **F-E1 → REDHAT-FIX-08** (High, new): primary-checkout `holo` PATH is a stub missing `seed:e2e` — gate step 1 fails on a cold checkout (exit 127). A gate re-run attempt using this broken stub died mid-flight, deleting `gate-results.json` (only `.prev.json` remains). Cycle cap extended 3→4 (user-approved) to close this.

## Red-Hat Findings (cycle 5 — `.spec/reviews/red-hat-sprint25-reactive-20260726T001244Z.md`)

- **H3, G-2, G-3, F-E1 ALL CONFIRMED CLOSED** at HEAD `29c05990` — REDHAT-FIX-08 landed cleanly, fresh gate 5/5 pass, all prior claims independently re-verified via fresh mutation probes.
- **NO_ORACLE_IDEMPOTENCY → REDHAT-FIX-09** (Critical, new): research-progress writer's concurrency guard has zero test coverage — real silent-double-increment risk in production.
- **F-E2 → REDHAT-FIX-10** (High, new): SSE reconnect site A (XHR onError retry) has zero coverage — cycle-4's mutation probe was ambiguously scoped to only prove the dual-site mutant killed.
- **F-TEXT-DIFF-ORACLE → REDHAT-FIX-11** (High, new): S-REACTIVE-01 AC-3 "content byte-equal" claim is unverified. Cycle cap extended 4→5 (user-approved) to close these.

## Source Coverage

- UC-SYNC-02
- T-SYNC-005, T-SYNC-006, T-SYNC-007, T-INFER-015
- `.spec/prds/mk6-migration/08-uc-sync.md`
- `.spec/prds/mk6-migration/07-uc-infer.md`
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md`
- `.spec/prds/mk6-migration/10-technical-requirements/13-client-data-contract.yaml`
- `.spec/prds/mk6-migration/README.md`

## Capability Coverage

- CAP-SYNC-01: resumable SSE + Zero-durable reconciliation, live mission progress, p95 ≤ 5s cross-surface propagation

## Blocks

- Blocks: Sprint 29
- Depends on: Sprint 08, Sprint 15, Sprint 18, Sprint 24

## Task Detail Files

Generated by /kb-sprint-tasks-plan on 2026-07-24T19:52:54Z (specialist proposal: react-native-ui-planner; backend-contract enrichments: mastra-planner). Avg quality ≥80/115; fakeability audit **0 CRITICAL / 0 HIGH** — `validate_scenario.py` exit 0 on every behavioral AC of all 5 tasks. Topological order: S-REACTIVE-01 ∥ S-REACTIVE-02 ∥ S-REACTIVE-04 (the three client features; 04 extends 01's chat-thread state machine) → S-REACTIVE-03 (cross-surface p95 journey over the three features) → S-REACTIVE-05 (review/closure gate).

- S-REACTIVE-01-resumable-sse-chat-streaming-client-exactly-once-reconciliation.md
- S-REACTIVE-02-live-research-progress-via-zero-synced-postgres-rows.md
- S-REACTIVE-03-cross-surface-p95-journey-mcp-doc-update-reflects-within-5s.md
- S-REACTIVE-04-degraded-local-fleet-unavailable-state-in-chat-no-hang.md
- S-REACTIVE-05-reviewer-pass-streaming-reconciliation-degraded-correctness-a11y.md


Updated by /kb-sprint-tasks-plan --only REDHAT-FIX-01,REDHAT-FIX-02,REDHAT-FIX-03 on 2026-07-25T17:17:09Z (specialists: react-native-ui-planner + mastra-planner; avg quality ≥108/115; fakeability audit **0 CRITICAL** — `validate_scenario.py` exit 0 on every behavioral AC).

- REDHAT-FIX-01-fix-fictional-streaming-seed-conversation.md
- REDHAT-FIX-02-research-sessions-current-iteration-writer-or-rescope.md
- REDHAT-FIX-03-strengthen-sse-reconnect-exactly-once-oracle.md

**Boundary notes folded in at consolidation (mastra-planner contract findings):**
- S-REACTIVE-01 consumes the real Sprint 18 SSE contract — event types `token`/`terminal`/`blocked`/`error`, monotonic `seq` (`Last-Event-ID`→`afterSeq`), durable `chat_messages` row authoritative.
- S-REACTIVE-02 is scoped to **research** progress (`research_sessions` is a `zero_pub` full-table member; `current_iteration`/`max_iterations`). **Mission progress is out of scope** — `mission_runs` is excluded from `zero_pub`; surfacing it is a follow-up gap.
- S-REACTIVE-04 infers the degraded state from the chat failure envelope — `degraded_mode` is NOT in `zero_pub` and has no HTTP endpoint; the exact message is `SURFACE_UNAVAILABLE_MESSAGE`; the fleet-down action is the `:4545`-endpoint-down harness action (there is no `holo stack stop fleet` verb).

Updated by /kb-sprint-tasks-plan --only REDHAT-FIX-04,REDHAT-FIX-05,REDHAT-FIX-06 on 2026-07-25T20:13:13Z (specialists: react-native-ui-planner + mastra-planner; avg quality 115/115; fakeability audit **0 CRITICAL** — `validate_scenario.py` exit 0 on every behavioral AC).

- REDHAT-FIX-04-fix-production-hook-mutation-test-assemblyref.md
- REDHAT-FIX-05-rerun-full-human-gate-fresh-gate-results.md
- REDHAT-FIX-06-restore-tdd-evidence-chain-path-json-red-logs.md

Updated by /kb-sprint-tasks-plan --only REDHAT-FIX-07 on 2026-07-25T21:24:51Z (specialists: react-native-ui-planner + mastra-planner; avg quality 115/115; fakeability audit **0 CRITICAL** — `validate_scenario.py` exit 0 on every behavioral AC).

- REDHAT-FIX-07-copy-redhat-fix-04-evidence-files-cold-checkout.md

Updated by /kb-sprint-tasks-plan --only REDHAT-FIX-08 on 2026-07-25T23:20:00Z (specialists: react-native-ui-planner + mastra-planner; avg quality 115/115; fakeability audit **0 CRITICAL** — `validate_scenario.py` exit 0 on every behavioral AC).

- REDHAT-FIX-08-fix-holo-path-stub-cold-checkout-gate-rerun.md

Updated by /kb-sprint-tasks-plan --only REDHAT-FIX-09,REDHAT-FIX-10,REDHAT-FIX-11 on 2026-07-26T02:21:56Z (specialists: react-native-ui-planner + mastra-planner; avg quality 115/115; fakeability audit **0 CRITICAL** — `validate_scenario.py` exit 0 on every behavioral AC). Agent correction: REDHAT-FIX-09 → mastra-implementer (backend concurrency oracle).

- REDHAT-FIX-09-close-no-oracle-idempotency-research-concurrency-guard.md
- REDHAT-FIX-10-close-f-e2-site-a-xhr-onerror-reconnect-coverage.md
- REDHAT-FIX-11-close-f-text-diff-oracle-content-byte-equal.md

