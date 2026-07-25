# Red-Hat Review Report — Cycle 3

**Report Date**: 2026-07-25T21:12:42Z
**Target**: Sprint 25 — Reactive Surfaces: SSE Streaming, Mission Progress, Degraded (`sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded`)
**Sprint Status Reviewed**: `In Progress` (SPRINT.md:15) · status line claims "5/5 tasks completed · updated 2026-07-25T21:00:22Z" · NO `sprint-goal-state.json` (sprint is not formally claiming `goal:complete`) · fresh `gate-results.json` EXISTS (`run_id:s25-ht-20260725T203604Z`, written `2026-07-25T20:56:17Z`, 5/5 pass — post-dates all REDHAT-FIX commits)
**Reviewed By**: `mastra-reviewer`, `react-native-ui-reviewer`, `test-quality-reviewer` (standing seat)
**Test-reality lens**: ran (IMPLEMENTED mode) — mutation probe re-executed against HEAD `fc24bf68` in an isolated worktree; **both cycle-2 H3 mutants now KILLED in production code** (the load-bearing result)
**Prior cycle re-audited**: `.spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md` (cycle 2 — verdict NEEDS_FIXES, H3-NOT-CLOSED + G-2 + G-3) and `.spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md` (cycle 1)
**Verdict**: **NEEDS_FIXES — narrow.** The cycle-2 CRITICAL **H3-NOT-CLOSED is GENUINELY CLOSED** by REDHAT-FIX-04 (production-code mutation probe, independently re-verified). **G-2 is CLOSED** (fresh gate). **G-3 is PARTIALLY CLOSED** — the defect recurred on REDHAT-FIX-04 itself: its TC-5 evidence files exist only in the worktree, not at the contract-mandated `.tmp/sprint-25/` path, so the cycle-2 closer's own verify command fails on a cold checkout. One trivial copy-and-commit away from unqualified close.

---

## Executive Summary

Cycle 2 demanded that the sprint's PRIMARY gate claim — "zero duplicate tokens after mid-stream reconnect" — be backed by a test that exercises the **production** `useResumableSSEStream` hook, not a reimplementation. REDHAT-FIX-04 delivered exactly that: the implementer extracted `createResumableSseController` as a production unit (with the React hook reduced to a thin adapter at `use-resumable-sse-stream.ts:894-944`), the new integration test imports and drives that production unit against a real `http.createServer` SSE stub, and **both load-bearing mutants are KILLED in production code** — `assemblyRef.current = { lastSeq: 0, ... }` wiped before the reconnect sites at `:740` and `:764` produces `AssertionError: expected null to be '3'` (exit 1, 1 failure); the `Last-Event-ID` header-drop at `:323` likewise fails. The test-quality-reviewer standing seat re-probed both mutants in an isolated worktree off HEAD `fc24bf68` and independently confirmed the kills; two independent production-code probes (the reviewer's and the implementer's worktree log) now agree, with no baseline anomaly. **H3-NOT-CLOSED is closed.** S-REACTIVE-01 AC-2 (the sprint's PRIMARY AC) upgrades FAIL → PASS.

**However, the cycle is not unqualified-green.** G-3 — the cycle-2 finding that REDHAT-FIX task evidence files must exist at the `.tmp/sprint-25/` contract path on a cold checkout — recurs on REDHAT-FIX-04 itself: `redhat-fix-04-path.json`, `redhat-fix-04-production-mutation.log`, and `redhat-fix-04-red.log` exist only at the worktree alt path `.kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/`. REDHAT-FIX-06 (which closed this defect class for REDHAT-FIX-01/02) did not cover REDHAT-FIX-04. REDHAT-FIX-04's own TC-5 verify command fails on a cold checkout. The underlying mutation evidence is honest and sound — this is a process/evidence-hygiene defect, not a test-reality defect, and the fix is a three-file copy-and-commit.

Two further findings compound: (1) **M5 regressed** — REDHAT-FIX-04's own test file introduces a NEW typecheck error (`tests/integration/redhat-fix-04-production-hook-reconnect.test.ts(121,1): error TS2322`, `NodeXMLHttpRequest` doesn't satisfy the DOM `XMLHttpRequest` interface), bringing the total from 153 → 154; (2) **M-H2-LIVE** remains open — the sprint title's "Mission Progress" half and gate step-3's "advances live as the workflow reaches iteration 3/5" overclaim (the gate evidence shows Maestro → `advance-research-iteration.js` → a `:8765` test-harness server driving the writer, not engine-driven mid-run progression; zero new production call sites since cycle 2; five overclaim sites un-footnoted). These do not block H3 but should be resolved before formal sprint close.

---

## HIGH Confidence Findings (3+ Agents Agree, or Mutation-Backed)

- [ ] **H3 → CLOSED: The assemblyRef-reset mutant is now KILLED in production code by REDHAT-FIX-04.** | Severity: (closure of cycle-2 CRITICAL)
      The implementer extracted `createResumableSseController` (`hooks/use-resumable-sse-stream.ts:430-880`) as the production unit owning the `assemblyRef` and `openEventSource` reconnect path; `useResumableSSEStream` is now a thin React adapter (`:894-944`) that delegates `connect`/`cancel`/`setOnline`/`subscribe` to it — **no parallel reimplementation remains** (the REDHAT-FIX-03 anti-pattern is gone). `tests/integration/redhat-fix-04-production-hook-reconnect.test.ts:131-134` imports the production factory and reads `controller.assemblyRef.current.{text,tokenCount,lastSeq}` directly (test `:311,380-381`). **Independent mutation probe** (test-quality-reviewer, isolated worktree off HEAD `fc24bf68`): correct path `pnpm vitest run ... -t 'AC-1'` → **exit 0** (1 passed); assemblyRef-reset mutant at production `:740`+`:764` → **exit 1, 1 failure** (`AssertionError: expected null to be '3'` at test:370 — the wiped `assemblyRef.current.lastSeq` propagated to `buildSseResumeHeaders` as 0, the XHR polyfill sent no `Last-Event-ID` header, the stub recorded `null`); header-drop mutant at production `:323` → **exit 1, 1 failure**; restoration → **exit 0**. Two independent production-code probes (reviewer's at `fc24bf68`; implementer's worktree log at base `a1c4a26d`) agree; **no baseline anomaly this cycle** (cycle-2 L-SF3 resolved). Probe worktree removed; primary checkout clean.
      **Agents**: test-quality-reviewer (HIGH, mutation-backed — the decisive evidence); react-native-ui-reviewer (HIGH — ran AC-1 on primary checkout, traced production call graph, read worktree mutation log); mastra-reviewer (implicit — backend `chat-runs.ts` afterSeq contract non-regressed, `git diff eed11919..fc24bf68` empty).
      **Net**: S-REACTIVE-01 AC-2 (PRIMARY) FAIL → **PASS**. S-REACTIVE-01 AC-4 (Last-Event-ID gap-fill) PARTIAL → **PASS**.

- [ ] **G-2 → CLOSED: Fresh gate run exists and post-dates all REDHAT-FIX commits.** | Severity: (closure of cycle-2 CRITICAL process)
      `gate-results.json` EXISTS with `run_id:s25-ht-20260725T203604Z`, `written_at:2026-07-25T20:56:17Z`, `verdict:pass`, `steps_executed:5, steps_passed:5`. The run is **3h23m AFTER** the latest REDHAT-FIX merge (`fc24bf68` at `2026-07-25T17:17Z`-ish task-add, with REDHAT-FIX-04/05/06 merges across the afternoon). The cycle-2 defect (`gate-results.json` missing, `GATE-RESULTS.md` citing the pre-fix `s25-ht-20260725T155918Z`) is resolved. `GATE-RESULTS.md` now cites the new `run_id`.
      **Agents**: test-quality-reviewer (HIGH — verified freshness + content); react-native-ui-reviewer (HIGH — `run_id` cross-checked); mastra-reviewer (HIGH — gate-3 evidence substantiation audited separately, see M-H2-LIVE).
      **Caveat**: see M-MAESTRO-RECONNECT below — the gate step-2 *reconnect* oracle is weak (reconnecting-indicator optional + WARNED), but this is no longer load-bearing for H3 now that the integration test carries the claim with production-code mutant kills.

- [ ] **G-3 → PARTIAL: REDHAT-FIX-06 closed the defect for fix-01/02, but it RECURRED on REDHAT-FIX-04 itself.** | Severity: **High (process)**
      `.tmp/sprint-25/redhat-fix-01-path.json` and `redhat-fix-02-path.json` now EXIST at the contract path (REDHAT-FIX-06 did its job for those). BUT `.tmp/sprint-25/redhat-fix-04-path.json`, `redhat-fix-04-production-mutation.log`, and `redhat-fix-04-red.log` are **MISSING** on the primary checkout — they exist only at `.kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/`. REDHAT-FIX-04's own TC-5 verify command (`test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path=="A"'`) → **exit 1 FAIL on a cold checkout**. This is the exact "generated in worktree, never copied home" anti-pattern cycle-2 G-3 flagged. The underlying evidence IS sound (the alt-path `redhat-fix-04-production-mutation.log` shows `correct exit=0 failures=0` / `production-assembly-reset exit=1 failures=1` / `KILLED`, no baseline anomaly — corroborating the standing seat's independent probe); it is simply not at the contract-mandated location.
      **Agents**: test-quality-reviewer (HIGH — TC-5 executed on cold checkout, fails; alt-path evidence confirmed sound but mislocated); react-native-ui-reviewer (HIGH — independently confirmed the three files missing on primary).
      **Fix**: `cp .kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/redhat-fix-04-{path.json,production-mutation.log,red.log} .tmp/sprint-25/ && git add .tmp/sprint-25/redhat-fix-04-* && git commit`, OR run `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` once on the primary checkout (the suite self-generates the files).

- [ ] **Backend non-regression CONFIRMED across all frozen surfaces.** | Severity: (positive)
      `git diff eed11919..fc24bf68` (cycle-2 HEAD → cycle-3 HEAD) is **EMPTY** for: `services/platform/src/http/chat-runs.ts` (SSE backend, `seq > afterSeq` replay at `:618-621` intact), `services/platform/src/research/progress.ts` (H2 writer, PATH-A intact), `services/platform/src/db/seed-e2e.ts` (H1 Streaming seed at `:544-576` intact), `services/platform/src/mcp/executor.ts` (S-REACTIVE-03 p95, strongest surface, non-regressed), plus `observability/mission-research.ts` and `mission/cycle.ts` (the M-H2-LIVE call sites). REDHAT-FIX-04/05/06 correctly scoped themselves to the cycle-2 blockers: `hooks/use-resumable-sse-stream.ts` (RN H3 fix), test files, `.tmp/` evidence, and PNG screenshots. **Zero backend `services/platform/src/` changes** in the cycle-2.5/3 fix commits.
      **Agents**: mastra-reviewer (HIGH — git-diff definitive on all 6 files); react-native-ui-reviewer + test-quality-reviewer (implicit — out of direct scope, no contradiction).

---

## MEDIUM Confidence Findings (2 Agents Agree)

- [ ] **M-H2-LIVE (OPEN, strengthened): "live as the workflow reaches iteration 3/5" overclaims — gate evidence is harness-driven, not engine-driven.** | Severity: High
      Cycle 2 predicted the gate would need "a human to manually invoke the CLI 3 times." The fresh gate does exactly that — scripted into Maestro. `step-5-research.log` shows: `Run advance-research-iteration.js → Assert "1/5" → Run advance-research-iteration.js → Assert "2/5" → Run advance-research-iteration.js → Assert "3/5"`. `advance-research-iteration.js:18-19` does `http.get('http://127.0.0.1:8765/advance/${target}/${maxIter}')` — a **local test-harness server** (port 8765) that wraps the production writer. `rg "advance-server|8765" services/platform/src/` returns ZERO production references (only disclaiming comments). The log has **no timestamps** — no wall-clock proof of live progression vs instantaneous harness pokes. The two production call paths remain as cycle 2 described: `runResearchMission` terminal burst (`mission-research.ts:448-462`, 4 awaits in a tight loop at terminal admission → UI sees `1/5 → 5/5` in one WAL replay) and `runMissionCycle` (`cycle.ts:613`, +1 per manual CLI trigger, no auto-scheduler, no HTTP `/api/missions/:id/cycle` endpoint). **Zero new production invocation paths since cycle 2.** The overclaim phrase appears un-footnoted in 5 places: `SPRINT.md:36,44`, `GATE-RESULTS.md:9`, `gate-results.json` step-3 `text`, `ROADMAP.md:1445`. Production comment at `mission-research.ts:450` actively defends the overclaim ("engine-backed, not a harness jump") — directly contradicted by the gate evidence.
      **Agents**: mastra-reviewer (HIGH — git-blame + gate-log + advance-research-iteration.js source, triple-evidenced); test-quality-reviewer (implicit — gate-provability clause for step 5; the discrete `1/5 → 2/5 → 3/5` observations are artifacts of intervening manual steps).
      **Fix**: either (a) footnote the 5 overclaim sites with "writer proven; live engine-driven advancement pending automatic mission-cycle scheduling — gate exercises the writer via a test harness, not the engine," OR (b) add an end-to-end integration test (`runMissionCycle → advanceResearchSessionIteration` with live Postgres assertion + wall-clock timestamps), OR (c) wire an auto-scheduler/HTTP endpoint that drives `runMissionCycle` during a running mission.

- [ ] **M5-REGRESSED: `pnpm typecheck` now 154 errors (was 153); the NEW error is IN reactive code, introduced by REDHAT-FIX-04.** | Severity: Medium (process)
      `tests/integration/redhat-fix-04-production-hook-reconnect.test.ts(121,1): error TS2322` — the `NodeXMLHttpRequest` polyfill assigned to `globalThis.XMLHttpRequest` doesn't conform to the DOM `XMLHttpRequest` interface (missing `response`, `responseType`, `responseURL`, `responseXML`, +17 properties). The other 153 errors remain clustered in `services/platform/src/{mission,queue,tools,uploads}` (pre-existing, outside reactive surfaces). REDHAT-FIX-04 introduced this regression in its own test file. Cycle-2 M5 noted TC-6/TC-7 text in S-REACTIVE-01 still says `pnpm tsc --noEmit → Exit 0` unconditionally — still literal FAIL by the letter of the TC.
      **Agents**: react-native-ui-reviewer (MEDIUM — ran typecheck, counted errors, isolated the new one to REDHAT-FIX-04's test).
      **Fix**: cast via `globalThis.XMLHttpRequest = NodeXMLHttpRequest as unknown as typeof XMLHttpRequest` OR add the missing DOM properties to the polyfill OR narrow TC-6/TC-7 to reactive-surface source files only.

- [ ] **M3 + M6 (OPEN, compound): duplicate degraded-banner testIDs + recovery oracle.** | Severity: Medium
      `app/(drawer)/chat/[conversationId].tsx:651,656` AND `components/chat/ChatThread.tsx:336,345` BOTH still render `chat-degraded-banner`/`chat-degraded-message` conditionally on `streamPhase === 'degraded'`. Maestro's `assertNotVisible`/`notVisible` resolves on whichever XCTest finds first; in a render race where one banner clears and the other persists, the recovery assertion flakes. Violates the testID uniqueness rule. M6 partially improved since cycle 2: `.maestro/reactive/degraded-recovery.yml` now uses testID-based `extendedWaitUntil: notVisible: id: chat-degraded-banner` (45s timeout) + hard-required `chat-assistant-message-latest` (90s timeout) — stronger than cycle-2's string-based oracle — but still compounds with M3 (the duplicate testID means `notVisible` requires BOTH to clear). Net: S-REACTIVE-04 AC-3 (recovery when fleet returns) remains PARTIAL.
      **Agents**: react-native-ui-reviewer (HIGH — rg-verified duplicates at both files; M6 improvement confirmed); test-quality-reviewer (implicit — NEG_OBSERVE_WEAK carried).
      **Fix**: deduplicate the testIDs (one canonical banner in `ChatThread.tsx`, remove from `[conversationId].tsx` OR namespace them `chat-degraded-banner-thread` vs `-footer`).

- [ ] **L-S05-STALE (OPEN, actively misleading): S-REACTIVE-05 AC-1/AC-2 annotations still cite now-closed reasons.** | Severity: Medium (doc hygiene)
      `S-REACTIVE-05...md:52` still reads `- [ ] **PARTIAL** [RED-TEAM 2026-07-25]` citing "seed-e2e.ts:500 seeds only Alpha/Beta/Gamma" (FALSE — H1 closed by REDHAT-FIX-01, Streaming seed at `:544-576`) and stale line numbers "ChatThread.tsx:288,297" (now `:336,345`). `S-REACTIVE-05...md:64` still reads `- [ ] **PARTIAL** [RED-TEAM 2026-07-25]` citing "INFERRED, NOT MEASURED" for the assemblyRef mutant (NOW CLOSED by REDHAT-FIX-04's production-code probe) and `chat-reconnecting-indicator WARNED`. The only remaining valid reason is M3 (duplicate testIDs). Annotations are actively misleading — a future reviewer reading them would re-litigate closed surfaces.
      **Agents**: react-native-ui-reviewer (MEDIUM — verified the stale text).
      **Fix**: refresh both annotations to PASS (or PARTIAL-with-only-M3-remaining); update line numbers.

---

## LOW Confidence Findings (Single Agent)

- [ ] **M-MAESTRO-RECONNECT: The Maestro reconnect oracle is weak — but no longer load-bearing for H3.** | Severity: Medium (downgraded from would-be HIGH)
      `.gate-evidence/step-2-4-reconnect.log:135-138` — `Assert that (Optional) id: chat-reconnecting-indicator is visible... WARNED` / `Warning: Assertion is false`. The reconnecting indicator NEVER rendered in the gate run. Combined with the airplane-mode timing (enabled AFTER `token-count-at-least-3` at log:128, with the deterministic 5-token stream on `holocron_nonprod` per L-M7), the stream likely reached terminal before the toggle — the gate does not prove a mid-stream disconnect was detected + a reconnect happened via the UI. The numeric testIDs ARE real (`ChatThread.tsx:409,431,441,462` — value-bearing 1px opacity-0.01 Views, XCTest-discoverable), but "at-least-3" is a threshold not a delta, so full-replay duplication would not be caught. **However**, this is no longer the H3 evidence path: REDHAT-FIX-04's integration test now carries the "zero duplicate tokens" claim with production-code mutant kills. The Maestro flow serves as a smoke test for final bubble count + Streaming seed visibility.
      **Agent**: react-native-ui-reviewer (MEDIUM) + test-quality-reviewer (MEDIUM, UX-layer).
      **Fix (optional, non-blocking)**: tighten the Maestro flow to assert a `last-seq`/`token-count` DELTA across airplane mode (capture pre/post values, assert post > pre), and make `chat-reconnecting-indicator` non-optional OR remove it if the client doesn't reliably enter `reconnecting` phase on `holocron_nonprod`.

- [ ] **L-M1: "Stop the local fleet" gate step 7 still has no human-executable verb.** | Severity: Medium (ergonomics; behavior real)
      `run-degraded-no-hang.sh` still does `kill_port_listeners 4545` + `kill -9 "$p"` + a "fleet reaper" background loop. No `holo fleet stop` / `holo stack stop fleet` verb exists. SPRINT.md step 7 "Stop the local fleet" remains non-human-executable as written.
      **Agent**: react-native-ui-reviewer (carried from cycle 1).

- [ ] **L-M7: Deterministic chat-token stream masks real model path on `holocron_nonprod`.** | Severity: Low (documented acceptance missing)
      `chat-runs.ts:237` (`emitDeterministicTokenStream`), `:264-272` (`shouldUseDeterministicChatStream`), `:298,339,348` (call sites). Still gates on `isHolocronNonprodDatabaseUrl(databaseUrl) && process.env.HOLO_CHAT_FLEET_ONLY !== '1'`. Inline comment at `:268` is the only documentation; the formal "documented acceptance" cycle 2 requested is still missing. File untouched by REDHAT-FIX-04/05/06.
      **Agent**: mastra-reviewer (carried).

- [ ] **L-L5: `documents.updated_at` not bumped in `update_document`.** | Severity: Low
      `mcp/executor.ts:780` (`UPDATE documents SET title = ...`), `:783` (`SET content = ...`), `:791` (`SET is_public, share_token`) — none include `updated_at = now()`. Inconsistent: the SAME file correctly bumps `updated_at` in 7 other update paths (`:157,277,465,477,491,500,562`) — the document path is the lone omission. WAL replication fires but `ORDER BY updated_at` / caches keyed on `updated_at` will lie.
      **Agent**: mastra-reviewer (carried).

- [ ] **L-L8: `isFleetUnavailableFailure` regex-over-prose (partially improved, still not structured).** | Severity: Low
      `use-resumable-sse-stream.ts:190-204`: concatenates `envelope.{error,message,code,status,text}` into a blob then runs 8 regex tests. `envelope.code` IS folded in but via `/ROLE_UNAVAILABLE/i.test(blob)`, NOT `envelope.code === 'ROLE_UNAVAILABLE'`. REDHAT-FIX-04 touched this file but only for mutation-test wiring; the regex was not upgraded.
      **Agent**: mastra-reviewer (carried).

---

## Agent Contradictions & Debates

| Topic | Agent A | Agent B | Assessment / Resolution |
|-------|---------|---------|------------|
| **H3 closure verdict (the cycle's load-bearing question)** | (no contradiction this cycle) | test-quality-reviewer: H3 CLOSED — independent production-code probe at `fc24bf68`, both mutants KILLED with exit 1 + assertion traces; react-native-ui-reviewer: H3 CLOSED — ran AC-1 on primary, traced production call graph, read worktree mutation log | **UNANIMOUS — cycle-2 contradiction RESOLVED.** Cycle 2's contradiction (RN-reviewer trusted the self-generated mutation log; standing seat's production probe refuted it) does not recur. This cycle the implementer extracted a real production unit, the test exercises it, and two independent production-code probes agree. The cycle-2 lesson held: the standing seat's production-code mutation probe is the decisive evidence. |
| **G-3 scope** | (no contradiction) | test-quality-reviewer + react-native-ui-reviewer: G-3 recurs on REDHAT-FIX-04 (fix-01/02 closed by REDHAT-FIX-06; fix-04 evidence still in worktree) | **UNANIMOUS.** REDHAT-FIX-06's scope was literally `fix-01,fix-02` (per its title); fix-04 evidence was never in its scope. Trivial remediation. |
| **"Live progress" semantic** | (no contradiction — carries from cycle 2) | mastra-reviewer: M-H2-LIVE OPEN/strengthened — gate evidence is harness-driven (`advance-research-iteration.js` → `:8765` test server), not engine-driven; zero new production call sites | **Stands as M-H2-LIVE.** The writer is real (H2 closed, non-regressed); the "as the workflow reaches" language overclaims. Backend-seat verdict: S-REACTIVE-02 AC-1 PARTIAL. |
| **Gate step-2 credit** | react-native-ui-reviewer + test-quality-reviewer: Maestro reconnect oracle WEAK (reconnecting-indicator WARNED, airplane post-complete) | mastra-reviewer + test-quality-reviewer: gate step-2 PASSES because the integration test (REDHAT-FIX-04) now carries the H3 claim; Maestro is smoke-only | **Resolved: gate step-2 PASS, but on the strength of the integration test, not the Maestro flow.** M-MAESTRO-RECONNECT documented as a non-blocking LOW for future oracle strengthening. |

---

## Recommendations by Category

1. **Gaps (must-close blocker — single item)**:
   - **G-3 partial**: copy `redhat-fix-04-{path.json,production-mutation.log,red.log}` from `.kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/` to `.tmp/sprint-25/` and commit. OR run `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` once on the primary checkout (the suite self-generates the files at the correct paths). This is the **only** blocker between the current state and an unqualified sprint close.

2. **Risks (should-fix before formal close)**:
   - **M5 regression**: fix the `NodeXMLHttpRequest` typecheck error in REDHAT-FIX-04's test file (cast or add missing DOM properties), OR narrow S-REACTIVE-01 TC-6/TC-7 to reactive-surface source files. 154 errors → 153.
   - **M-H2-LIVE**: footnote the 5 overclaim sites (`SPRINT.md:36,44`, `GATE-RESULTS.md:9`, `gate-results.json` step-3 `text`, `ROADMAP.md:1445`) with "writer proven; live engine-driven advancement pending automatic mission-cycle scheduling — gate exercises the writer via a test harness." OR add the end-to-end integration test. Also correct the production comment at `mission-research.ts:450` that defends the overclaim.
   - **M3 + M6**: deduplicate `chat-degraded-banner`/`chat-degraded-message` testIDs between `[conversationId].tsx:651,656` and `ChatThread.tsx:336,345`; resolves S-REACTIVE-04 AC-3 PARTIAL.
   - **L-S05-STALE**: refresh S-REACTIVE-05 AC-1/AC-2 annotations — the cited reasons are closed; update to PASS or PARTIAL-with-only-M3.

3. **Assumptions (challenge accepted)**:
   - The sprint title's "Mission Progress" half remains defensible under PATH-A (writer exists, non-regressed), but "as the workflow reaches iteration 3/5" overclaims until an auto-scheduler or HTTP cycle endpoint exists. Either deliver the scheduler or footnote.
   - The Maestro PRIMARY-gate oracle for reconnect is weak (reconnecting-indicator optional + WARNED; airplane-mode possibly post-complete), but the H3 claim has legitimately migrated to the integration test — this is an acceptable test-strategy shift, not a gap, provided the integration test is maintained.

4. **Contradictions (resolved above)**:
   - H3 verdict: unanimous CLOSED (cycle-2 contradiction does not recur).
   - Gate step-2 credit: PASS on the strength of the integration test, not the Maestro flow.
   - "Live progress": real writer, unproven live advancement (M-H2-LIVE).

---

## Confirmed PASS Verdicts (do NOT re-litigate in cycle 4)

These surfaces are backend-real, survived adversarial re-verification across 2–3 cycles, and should not be re-opened:

- **H1 (Streaming seed)** — `seed-e2e.ts:544-576` + `seed-e2e.test.ts:85`. Three-cycle consensus. Real PATH-A fix. Non-regressed (`git diff` empty).
- **H2 (research-iteration writer)** — `research/progress.ts:55-153` + 3 production callers. Three-cycle consensus. Real PATH-A fix. Non-regressed. (Live-advancement semantic flagged separately as M-H2-LIVE.)
- **H3 (SSE reconnect exactly-once)** — **NEWLY CLOSED THIS CYCLE.** `createResumableSseController` production extraction + `redhat-fix-04-production-hook-reconnect.test.ts` + production-code mutation kill (assemblyRef-reset + header-drop, exit 1 each, independent worktree probe at `fc24bf68`).
- **S-REACTIVE-03 (cross-surface p95)** — strongest surface from cycle 1; `executor.ts` untouched by REDHAT-FIX commits (`git diff` empty).
- **SSE backend contract** — `chat-runs.ts` `seq > afterSeq` replay + `finalizeChatRun` durable row; non-regressed (`git diff` empty across all REDHAT-FIX commits).
- **Pure-function `buildSseResumeHeaders`** — Mutant A (header-drop) killed via direct import; retained as necessary-but-not-sufficient alongside the production-hook coverage.
- **M2 (poll greenwash)** — `disableStatusPollFallback` wired (`:435,505`), exercised under test (`test:298`).

---

## AC Verdict TABLE (cross-reviewer consolidation)

| Task | AC | Verdict | Basis |
|------|----|---------|-------|
| **S-REACTIVE-01** | AC-1 streams token-by-token | PASS | H1 closed + SSE contract intact (non-regressed) |
| | AC-2 [PRIMARY] mid-stream reconnect, 0 dup tokens | **PASS** (↑ from cycle-2 FAIL) | H3 CLOSED by REDHAT-FIX-04 production-code mutation kill |
| | AC-3 exactly one final message matching Zero row | PASS | Maestro `chat-assistant-bubble-count-1` COMPLETED; `ChatThread.tsx:462` emits value-bearing testID |
| | AC-4 Last-Event-ID gap-fill | **PASS** (↑ from PARTIAL) | Production wiring now tested via extracted controller; pure-function mutant-A retained |
| | AC-5 cancel finalizes | PASS | carried |
| **S-REACTIVE-02** | AC-1 [PRIMARY] progress bar advances live to 3/5 | **PARTIAL** (unchanged) | Writer real + non-regressed (H2 closed); live semantic UNPROVEN (M-H2-LIVE — gate evidence is harness-driven) |
| | AC-2 zero_pub binding | PASS | non-regressed |
| | AC-3 mobile compliance | PASS | unchanged |
| **S-REACTIVE-03** | AC-1 [PRIMARY] MCP doc update within 5s | PASS | strongest surface; non-regressed (`executor.ts` untouched) |
| | AC-2 p95 over ≥5 iterations | PASS | L1 self-attestation nuance persists (Low) |
| **S-REACTIVE-04** | AC-1 [PRIMARY] fleet-down degraded msg, no hang | PASS | M1 ergonomics caveat |
| | AC-2 inferred from failure envelope | PASS | unchanged |
| | AC-3 [PRIMARY] recovery when fleet returns | **PARTIAL** (unchanged) | M3 + M6 compound (duplicate testIDs; oracle strengthened but flake risk) |
| **S-REACTIVE-05** | AC-1 [PRIMARY] review artifact | **PARTIAL** | L-S05-STALE: annotations cite now-closed reasons; actively misleading |
| | AC-2 [PRIMARY] streaming reconnect re-verified | **PASS** (↑ from PARTIAL) | REDHAT-FIX-04 production-code mutation evidence |
| **REDHAT-FIX-01** | AC-1..AC-4 | PASS | H1 closed (3-cycle consensus) |
| **REDHAT-FIX-02** | AC-1 production writer PATH-A | PASS | H2 closed; non-regressed |
| | AC-2 Zero binding non-regression | PASS | unchanged |
| | AC-3 source audit writer | PASS | 3 greppable production UPDATE call sites |
| | AC-4 fail-closed | PROBE_BLOCKED | itLive skipped (PLATFORM_IT); not re-run this cycle |
| | TC-5 path.json exists | PASS | REDHAT-FIX-06 restored at `.tmp/sprint-25/` |
| **REDHAT-FIX-03** | AC-1 reconnect sends Last-Event-ID:3 | PASS (non-authoritative) | superseded by REDHAT-FIX-04 production coverage |
| | AC-2 [PRIMARY] mutants killed | PASS (superseded) | REDHAT-FIX-03 harness killed local variable; REDHAT-FIX-04 closes the production mutant |
| | AC-3 Maestro numeric oracles | PASS | genuine improvement; retained |
| | AC-4 poll cannot greenwash | PASS | `disableStatusPollFallback` exercised |
| | AC-5 durable row diff==0 | PROBE_BLOCKED | itLive skipped |
| **REDHAT-FIX-04** | AC-1 production reconnect Last-Event-ID==3 | **PASS** | Independent worktree probe: correct exit 0; `reconnectLastEventId==='3'`, `tokenCount===5`, `resumeTransport==='sse'` |
| | AC-2 [PRIMARY] production mutant killed | **PASS** | assemblyRef-reset exit 1 (`AssertionError: expected null to be '3'`); header-drop exit 1 |
| | AC-3 pure + fix-03 non-regression | PASS | both suites green (27 passed + 2 passed) |
| | AC-4 poll cannot greenwash | PASS | `disableStatusPollFallback=true` wired + asserted |
| | AC-5 TDD evidence | **FAIL** | `.tmp/sprint-25/redhat-fix-04-{path.json,production-mutation.log,red.log}` MISSING on cold checkout (G-3 partial recurrence); exist only in worktree |
| | TC-5 path.json/mutation.log at `.tmp/sprint-25/` | **FAIL** | same — TC verify command exit 1 on cold checkout |
| **REDHAT-FIX-05** | fresh gate-results.json | PASS | G-2 closed; 5/5 pass, post-dates all REDHAT-FIX commits |
| **REDHAT-FIX-06** | fix-01/02 path.json + RED logs | PASS | restored at `.tmp/sprint-25/` |
| | fix-04 evidence (scope gap) | **FAIL** | REDHAT-FIX-06 scope was `fix-01,fix-02` only; fix-04 evidence left in worktree |

**Completion Gate**: REDHAT-FIX-04 AC-5 + TC-5 FAIL (G-3 partial) → **needs-revision**. One trivial copy-and-commit closes it. All behavioral ACs are PASS or PROBE_BLOCKED; the only cold-checkout failure is an evidence-location defect on the cycle-2 closer's own task.

---

## Agent Reports (Summary)

- **mastra-reviewer**: REQUEST CHANGES (narrow) — backend non-regression is clean across all 6 frozen files (`git diff eed11919..fc24bf68` empty for `chat-runs.ts`, `progress.ts`, `seed-e2e.ts`, `executor.ts`, `mission-research.ts`, `cycle.ts`). M-H2-LIVE OPEN/strengthened: the writer is real + non-regressed, but the gate step-3 evidence is harness-driven (`advance-research-iteration.js` → `:8765` test server), not engine-driven; zero new production call sites since cycle 2; 5 overclaim sites un-footnoted; production comment at `mission-research.ts:450` actively defends the overclaim. L-M7 / L-L5 / L-L8 carried (all open, file:line confirmed). S-REACTIVE-02 AC-1 PARTIAL.

- **react-native-ui-reviewer**: APPROVED_WITH_FOOTNOTES (upgraded from cycle-2's overridden verdict) — REDHAT-FIX-04's extraction is GENUINE: `useResumableSSEStream` is a thin adapter over `createResumableSseController`; the test imports and exercises the production unit; the mutation probe targets real production reconnect sites (`:740`, `:764`), not a harness local variable. H3 CLOSED. Ran AC-1 on primary checkout (1 passed). NEW findings: M5 regressed (154 typecheck errors, +1 from REDHAT-FIX-04's own test file `TS2322`); M3 still open (duplicate testIDs); M6 partially improved; L-S05-STALE open (annotations cite closed reasons); L-M1 open (fleet-stop verb). G-3 partial for REDHAT-FIX-04 confirmed.

- **test-quality-reviewer (standing seat)**: APPROVED on H3 (the cycle's load-bearing question); NEEDS_FIXES only on G-3 partial. Mutation probe re-executed against HEAD `fc24bf68` in an isolated worktree: correct path exit 0; assemblyRef-reset mutant at production `:740,:764` → exit 1, 1 failure (`AssertionError: expected null to be '3'`); header-drop mutant at production `:323` → exit 1, 1 failure; restoration exit 0. Two independent production-code probes (reviewer's + implementer's worktree log) agree; no baseline anomaly. Production-code exercise verified (test imports production factory, reads `assemblyRef.current` directly, real `http.createServer` SSE stub, `disableStatusPollFallback=true`). G-3 partial recurrence on REDHAT-FIX-04 (TC-5 fails on cold checkout; alt-path evidence sound but mislocated). Probe worktree removed; primary checkout clean.

---

## Metadata

- **Agents**:
  - `mastra-reviewer` — backend/contract lens (Glob, Grep, Read, Bash)
  - `react-native-ui-reviewer` — RN client/reactivity/a11y lens (Glob, Grep, Read, Bash)
  - `test-quality-reviewer` — standing seat, IMPLEMENTED mode, production-code mutation probe in isolated worktree (full tool access)
- **Driver pre-check findings merged**: G-2 CLOSED (gate fresh, 5/5 pass); G-3 PARTIAL (fix-01/02 path.json present; fix-04 path.json/mutation.log/red.log MISSING); gate step-2 reconnect oracle weak (reconnecting-indicator optional + WARNED); all 5 gate steps reference real entry points (executability OK). Source: `gate-pre-check`.
- **ANTI-STUB-REVIEW.md**: NOT present in this project (`brain/docs/ANTI-STUB-REVIEW.md` absent); reviewers applied the embedded adversarial methodology (AC enumeration, gate-provability, stub-pattern grep recipes) from first principles per the skill's ORACLE PROVABILITY clause.
- **Confidence Framework**: HIGH (3+ agents, or mutation-backed, or independently verified at file:line); MEDIUM (2 agents or single strong source); LOW (single agent). Mutation-backed findings carry an extra evidentiary tier and override self-annotation trust.
- **Report Generated**: 2026-07-25T21:12:42Z
- **Duration**: ~14m (3 reviewers in parallel; ~8m driver pre-check + probe dispatch + consolidation)
- **Tree state at exit**: probe worktree removed (`git worktree list` clean); primary checkout has only pre-existing dirty files (`.spec/orchestrate/*.json`, `.env.bak`); production `hooks/use-resumable-sse-stream.ts` diff empty (mutants restored).
- **Next Steps**:
  1. **Copy REDHAT-FIX-04 evidence home** (G-3 partial — the only blocker): `cp .kb-run-sprint/worktrees/REDHAT-FIX-04/.tmp/sprint-25/redhat-fix-04-{path.json,production-mutation.log,red.log} .tmp/sprint-25/ && git add .tmp/sprint-25/redhat-fix-04-* && git commit -m "fix(sprint-25): restore REDHAT-FIX-04 TDD evidence at TC-5 path (G-3)"`. Then re-run the cycle-3 standing-seat probe on the primary checkout to confirm TC-5 passes.
  2. **Fix M5 regression**: cast `NodeXMLHttpRequest` to satisfy the DOM interface in REDHAT-FIX-04's test (or narrow S-REACTIVE-01 TC-6/TC-7 to reactive source files).
  3. **Footnote M-H2-LIVE**: add the one-line footnote to `SPRINT.md:36,44`, `GATE-RESULTS.md:9`, `gate-results.json` step-3 `text`, `ROADMAP.md:1445`; correct the production comment at `mission-research.ts:450`.
  4. **Refresh L-S05-STALE**: update S-REACTIVE-05 AC-1/AC-2 annotations to PASS (or PARTIAL-with-only-M3).
  5. **(Optional, non-blocking)** Deduplicate degraded-banner testIDs (M3+M6) to lift S-REACTIVE-04 AC-3 PARTIAL → PASS.
  6. **(Optional, non-blocking)** Strengthen the Maestro reconnect oracle (M-MAESTRO-RECONNECT) to assert a `last-seq`/`token-count` delta across airplane mode.

**Cycle-3 bottom line**: The cycle-2 CRITICAL H3-NOT-CLOSED is **genuinely closed** by real production-code mutation evidence — not the illusion of mutation testing. The sprint's PRIMARY gate claim now has teeth. The only remaining blocker is a trivial evidence-hygiene copy (G-3 partial recurrence on REDHAT-FIX-04). Once that lands, the sprint is eligible for unqualified close.
