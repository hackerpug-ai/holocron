# Red-Hat Review Report — Sprint 25 (Cycle 5)

**Report Date**: 2026-07-26T00:12:44Z
**Target**: Sprint 25 — Reactive Surfaces: SSE Streaming, Mission Progress, Degraded
**Sprint Path**: `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/`
**HEAD Reviewed**: `29c05990eb877751d089d052b2b07f00d3aa3fb3` (cycle-4 HEAD was `addea0fce`)
**Reviewed By**: `react-native-ui-reviewer`, `mastra-reviewer`, `mcp-reviewer`, `test-quality-reviewer` (standing seat)
**Test-reality lens**: ran (IMPLEMENTED mode — 5 mutants probed across 2 load-bearing functions, live Postgres where applicable)
**Verdict**: **NEEDS_FIXES — narrow.** All 4 prior-cycle blockers (H3 / G-2 / G-3 / F-E1) **CONFIRMED CLOSED** at HEAD `29c05990`. **3 new findings** emerged from this cycle's independent re-mutation-probe and oracle audit (1 CRITICAL, 2 HIGH), all empirically backed. The sprint is **one targeted integration test + one maestro oracle (or AC-text downgrade) + one reconnect-path coverage test** away from unqualified close.

---

## Executive Summary

Cycle 5 is the **closure-verification cycle**: REDHAT-FIX-08 (the cycle-4 blocker) landed cleanly, the gate was re-run fresh on HEAD (`s25-ht-20260725T234444Z`, 5/5 pass), and the cycle-4 panel's load-bearing claims were independently re-verified via fresh mutation probes against HEAD. All four prior blockers held. However, the deeper independent probing this cycle surfaced **three new defects** that prior cycles missed because their mutation probes were ambiguously scoped (F-E2: cycle-4's dual-site wipe conflated two distinct reconnect paths) or targeted only the SSE hook (NO_ORACLE_IDEMPOTENCY: the research-progress writer's concurrency guard has zero coverage) or accepted bubble-count as proof of content equality (F-TEXT-DIFF-ORACLE: AC-3's "byte-equal" claim is unverified). None regressed from cycle 4 — they are newly discovered. The backend axis (mastra-reviewer) and the MCP slice (mcp-reviewer) both returned **unqualified APPROVE**; the RN axis and the test-reality lens returned **NEEDS_FIXES** on the three new findings. The 6 prior-cycle advisory findings (M-H2-LIVE / M3+M6 / M5 / F-ORACLE-MISMATCH / L-S05-STALE / L-L5 et al.) remain non-blocking and unchanged.

---

## Gate Pre-Check (deterministic — `.spec/prds/.../SPRINT.md` "Human Testing Gate")

The sprint CLAIMS COMPLETE (`gate-results.json` verdict:pass). All four sub-checks ran:

| Sub-check | Result | Evidence |
|-----------|--------|----------|
| **Executability** | ✅ PASS | `./bin/holo` dispatches to `services/platform/src/cli/holo.ts:1793` `case 'seed:e2e'`; all 5 Maestro flows + helper scripts exist under `.maestro/reactive/` (`reconnect-exactly-once.yml`, `research-progress-advances.yml`, `cross-surface-sync-slo.yml`, `degraded-no-hang.yml`); `pnpm seed:e2e` script in `package.json` |
| **Oracle provability** | ✅ PASS | All oracles resolve in source: "Streaming conversation" → `seed-e2e.ts:575`; `SURFACE_UNAVAILABLE_MESSAGE` → `degraded-mode-controller.ts:36`; `ROLE_UNAVAILABLE` → `resolve-model.ts:96`; `current_iteration` UPDATE → `research/progress.ts:120`; `chat-assistant-bubble-count` testID → `ChatThread.tsx:462`; `1/5`/`2/5`/`3/5` → rendered by research progress binding |
| **Non-empty result** | ✅ PASS | All 5 `.gate-evidence/step-*.log` files non-empty (2522 / 5770 / 2990 / 6583 / 3925 B); oracles matched (Streaming seed confirmed, conversations:5, ROLE_UNAVAILABLE envelope, 1/5→2/5→3/5 transitions) |
| **Evidence freshness** | ⚠️ ADVISORY | `gate-results.json` mtime `17:54:13` is **14s older** than HEAD `29c05990` (`17:54:27`). HEAD is a pure status-sync commit (`chore(sprint-25): status sync — REDHAT-FIX-08 completed`) touching only `SPRINT.md` + `REDHAT-FIX-08-*.md` — no source code, no behavioral change. The gate landed in the same merge commit `88bfcb65` as the REDHAT-FIX-08 source. **Not a HIGH auto-finding** (the rule's intent — "gate ran after the last behavioral change" — is satisfied); flag as MEDIUM process hygiene: status-sync commits should not post-date the gate artifact. |

**Gate pre-check auto-findings**: 0 HIGH. 1 MEDIUM advisory (freshness hygiene).

---

## HIGH Confidence Findings (3+ Reviewers Agree)

### [CLOSED × 4] All prior-cycle blockers verified closed at HEAD `29c05990`

- [x] **H3 — SSE reconnect exactly-once mutant killed** (cycles 3, 4, 5)
  Agents: mastra-reviewer, test-quality-reviewer, react-native-ui-reviewer (with F-E2 caveat)
  Evidence: cycle-5 independent production-code mutation probe at HEAD `29c05990` — Mutant A (assemblyRef wipe at `use-resumable-sse-stream.ts:740`+`:764`) → exit 1, `AssertionError: expected null to be '3'` at `redhat-fix-04-production-hook-reconnect.test.ts:370`; Mutant B (Last-Event-ID header-drop at `:323`) → exit 1; Mutant E (tokenCount frozen) → exit 1. All three mutants killed via the production hook test, not a parallel harness. **(Note: F-E2 below narrows H3's closure scope — the dual-site mutant is killed, but a single-site-A mutant survives. H3's core claim holds; the coverage perimeter is smaller than cycle-4 framed.)**

- [x] **G-2 — Fresh `gate-results.json` post-dates all REDHAT-FIX commits**
  Agents: mastra-reviewer, test-quality-reviewer, react-native-ui-reviewer, mcp-reviewer
  Evidence: `gate-results.json` verdict:pass, 5/5 steps, run_id `s25-ht-20260725T234444Z`, written_at `2026-07-25T23:44:44Z`. Run_id is **not** any of the 3 stale forbidden IDs. All evidence logs non-empty. Gate was re-run after REDHAT-FIX-08 landed (cycle-4's "in-flight re-run died mid-flight" failure mode did not recur).

- [x] **G-3 — TDD evidence chain intact on cold checkout**
  Agents: test-quality-reviewer (primary), mastra-reviewer, react-native-ui-reviewer
  Evidence: All 7 contract-mandated files exist at `.tmp/sprint-25/`, are **git-tracked** (would survive a cold clone), non-empty, and content-honest: `redhat-fix-01-{path.json,red.log}`, `redhat-fix-02-{path.json,red.log}`, `redhat-fix-04-{path.json,red.log,production-mutation.log}`. REDHAT-FIX-07's fix held; cycle-3's recurrence did not repeat.

- [x] **F-E1 — `./bin/holo` cold-checkout dispatch resolved**
  Agents: mastra-reviewer, react-native-ui-reviewer, test-quality-reviewer
  Evidence: `bin/holo:34-49` resolves `$ROOT/services/platform/src/cli/holo.ts` and `exec`s through with real exit codes; bare `./bin/holo` exits 0 under `set -o pipefail` (REDHAT-FIX-08 AC-1); worktree-aware NODE_PATH fallback for `services/platform/node_modules`. Independent cold-checkout probe (`env PATH="/usr/bin:/bin:/usr/local/bin:$HOME/.bun/bin" ./bin/holo 2>&1 | rg -q seed:e2e`) → exit 0. SPRINT.md:40-41 documents the PATH-stub footnote. Cycle-4's failure mode (`~/.local/bin/holo` returning 127 for `seed:e2e`) is no longer reachable via the documented command.

- [x] **H2 — Research-progress writer wired into real engine paths (strengthened)**
  Agents: mastra-reviewer (primary), test-quality-reviewer
  Evidence: `advanceResearchSessionIteration` at `services/platform/src/research/progress.ts:55-153` is called from **3 production sites**: `mission/cycle.ts:613` (inside `runMissionCycle`, the real mission-engine executor), `observability/mission-research.ts:442,454` (inside `runResearchMission`), and `cli/holo.ts:3844,3849` (`holo research:advance-iteration` CLI). The gate's Maestro harness `.maestro/reactive/advance-server.py:67-85` now shells out to the production CLI writer (`bun services/platform/src/cli/holo.ts research:advance-iteration`), not a raw `psql UPDATE`. **NOT a parallel simulation harness.** (Residual overclaim M-H2-LIVE below is about pacing semantics, not writer reality.)

---

## MEDIUM Confidence Findings (Empirically-Backed Single-Reviewer OR 2-Reviewer Consensus)

> **Note on confidence scoring**: The skill's framework scores HIGH=3+, MEDIUM=2, LOW=1. This panel has 4 reviewers with non-overlapping domains, so single-reviewer findings that are **empirically backed** (mutation probe with live Postgres, file:line oracle audit) carry stronger evidentiary weight than a typical single-reviewer opinion. Such findings are scored MEDIUM here with a `(probe-backed)` tag and would be HIGH if the framework weighted evidence quality over reviewer count.

### 🆕 [CRITICAL → probe-backed] `NO_ORACLE_IDEMPOTENCY` — Research-progress writer's concurrency guard has ZERO test coverage
**Agents**: test-quality-reviewer (standing seat) — `(probe-backed, live Postgres)`
**Severity**: CRITICAL (test-reality)
**Evidence**:
The standing seat ran Mutant D at HEAD `29c05990` with `PLATFORM_IT=1` against live Postgres at `postgres://127.0.0.1:5432/holocron_nonprod`:
- Removed `AND COALESCE(current_iteration, 0) = ${previousIteration}` from the UPDATE WHERE clause at `services/platform/src/research/progress.ts:127` (the sole concurrency-safety mechanism — makes two concurrent mission cycles collide with `UPDATE_FAILED (0 rows)` instead of both writing `current_iteration=2`).
- Ran `vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts` → **7 passed**, exit 0. The ONLY test that imports `progress.ts` stayed green.
- Also confirmed survive against `tests/integration/s-reactive-02-research-progress-zero.test.ts` (7/7) and `tests/integration/redhat-fix-04-production-hook-reconnect.test.ts` (3/3).
- Tree restored via `git checkout`; SHAs match HEAD (`fadde28a` progress.ts).

**Why it matters**: This guard is the **only thing** preventing two simultaneous mission cycles from silently double-incrementing `current_iteration`. The Maestro gate flow asserts sequential `1/5 → 2/5 → 3/5` progression, so it also wouldn't catch a guard regression. A future refactor that removes the guard → silent double-increment in production, UI jumps, **no test fails**. This is precisely the weak-oracle defect class the standing seat exists to catch (per the warehouse analysis cited in the skill: 6,891 scenario violations, of which 2,157 are WEAK_ORACLE).

**Remediation**: Add one integration test firing two concurrent `advanceResearchSessionIteration` calls against the same seeded session:
```ts
const [a, b] = await Promise.all([
  mod.advanceResearchSessionIteration({ sessionId }),
  mod.advanceResearchSessionIteration({ sessionId }),
]);
// Exactly one succeeds with currentIteration === previousIteration + 1
// The other returns ok:false, errorCode: 'RESEARCH_SESSION_UPDATE_FAILED'
```
**Estimated effort**: ~30 min (seeds + one test). This is the cycle's most actionable blocker.

---

### 🆕 [HIGH → probe-backed] `F-E2` — SSE reconnect site A (XHR onError retry) has zero coverage
**Agents**: react-native-ui-reviewer — `(probe-backed, in-session mutation)`
**Severity**: HIGH
**Evidence**:
The RN reviewer ran a fresh mutation probe at HEAD `29c05990`:
- **Probe 1** (wipe ONLY site A — XHR onError retry at `use-resumable-sse-stream.ts:740`): injected `assemblyRef.current = { lastSeq: 0, text: '', tokenCount: 0 }` before the site-A `openEventSource(...)` call. `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1'` → **1 passed | 2 skipped**. 🚨 **MUTANT SURVIVES.**
- **Probe 2** (wipe BOTH site A `:740` AND site B `:764`): same command → **1 failed**, `AssertionError: expected null to be '3'` at test:370. ✅ Mutant killed (matches cycle-4 log).

**Root cause**: `redhat-fix-04-production-hook-reconnect.test.ts:314-321` drives reconnect via `controller.setOnline(false)` → `setOnline(true)`, which exercises ONLY site B (the NetInfo online handler at line 764). Site A (the XHR-onError retry at line 736-744) fires when the SSE socket itself dies without NetInfo detecting offline — a genuinely different production path (backend-side socket death, common in production). The Maestro reconnect flow uses airplane mode → also exercises only site B.

**Implication**: The cycle-4 mutation log (`.tmp/sprint-25/redhat-fix-04-production-mutation.log`) records `production-assembly-reset KILLED` without specifying single-site vs dual-site wipe — the kill claim was **unfalsifiable from the artifact**. A future regression introducing `assemblyRef.current = { lastSeq: 0, ... }` before the site-A `openEventSource` call would slip through all current gates with the "zero duplicate tokens" claim intact.

**Remediation**: Add an integration test scenario that destroys the stub server's response stream mid-flight WITHOUT calling `setOnline(false)` — e.g., `stubServer.destroyConnection()` mid-token, then assert the production retry fires and `Last-Event-ID` is sent. **OR** extend the mutation probe to log single-site-A wipe as a separate documented mutant.

---

### 🆕 [HIGH] `F-TEXT-DIFF-ORACLE` — S-REACTIVE-01 AC-3 "content byte-equal" claim is unverified
**Agents**: react-native-ui-reviewer
**Severity**: HIGH
**Evidence**:
S-REACTIVE-01 AC-3 (task:80): *"the thread shows EXACTLY ONE final assistant message matching the durable `chat_messages` row (`role='agent'`, content byte-equal)"*

| Oracle surface | What it asserts | What it misses |
|----------------|-----------------|----------------|
| `.maestro/reactive/reconnect-exactly-once.yml:84,88` | `chat-assistant-message-latest` visible + `chat-assistant-bubble-count-1` visible | No content comparison |
| `.maestro/reactive/exactly-one-final-message.yml:112,116` | `chat-assistant-message-latest` visible | No content comparison |
| `redhat-fix-04-production-hook-reconnect.test.ts:373` | `snap.streamedText === UNIQUE_TEXT` | `UNIQUE_TEXT` is what the **stub server** emitted — no real Zero durable row, no comparison against one |

A regression where streamed preview text is `"OneTwoThreeFourFive"` but the durable row content is `"Completely different text"` would **PASS** all current oracles. Bubble count ≠ content equality.

**Remediation**: Either (a) add a maestro assertion that captures the rendered assistant bubble text and compares it to the Zero-synced durable row content (e.g., a debug testID like `chat-durable-content-hash-${hash}` asserted equal to `chat-streamed-content-hash-${hash}`), or (b) explicitly downgrade S-REACTIVE-01 AC-3 contract text from "content byte-equal" to "exactly one bubble; content coordination deferred to follow-up" with a tracked task.

---

### [Carried × 4] Prior-cycle advisory findings — unchanged, non-blocking

- **M-H2-LIVE (MEDIUM, refined narrower)** — S-REACTIVE-02 AC-1 "as the workflow reaches iteration 3/5" at `SPRINT.md:45`, `GATE-RESULTS.md` step 3, `gate-results.json` step-3 `text`, `ROADMAP.md:1445`. Cycle-5 confirmed the writer IS production-wired (mastra-reviewer verified 3 call sites) AND the gate exercises it via `holo research:advance-iteration` (not raw psql for +1 advances). The residual overclaim is **engine pacing**: `runMissionCycle` has no auto-scheduler / HTTP `/api/missions/:id/cycle` endpoint (CLI-only), and `runResearchMission` walks 1→5 in one synchronous WAL replay burst on terminal admission. Live paced progression during a single running mission without manual CLI intervention is unproven. **Fix**: footnote the 5 overclaim sites OR add the auto-scheduler.

- **M3 + M6 (MEDIUM, unchanged)** — Duplicate `chat-degraded-banner` / `chat-degraded-message` testIDs across `app/(drawer)/chat/[conversationId].tsx:651,656` AND `components/chat/ChatThread.tsx:336,345`. Both render conditionally on `streamPhase === 'degraded'`. TestID uniqueness violation; Maestro's `notVisible` flakes in render races. S-REACTIVE-04 AC-3 stays PARTIAL.

- **M5 (MEDIUM, unchanged)** — `pnpm tsc --noEmit` reports **154 errors** including the TS2322 cluster from REDHAT-FIX-04 (`NodeXMLHttpRequest` missing DOM properties at `tests/integration/redhat-fix-04-production-hook-reconnect.test.ts:121`). S-REACTIVE-01 TC-6/TC-7 literally claim `pnpm tsc --noEmit → Exit 0`. **Fix**: cast `NodeXMLHttpRequest as unknown as typeof XMLHttpRequest`, add missing DOM properties, OR narrow TC-6/TC-7 to reactive-surface source files.

- **F-ORACLE-MISMATCH (MEDIUM, unchanged)** — `GATE-RESULTS.md:12` and `gate-results.json` step-2 `text` document "Summarize the seeded doc" but `.maestro/reactive/reconnect-exactly-once.yml:135` actually sends `"Write a detailed multi-sentence answer about the number five with at least eight words."`. Doc/flow disagreement.

---

### [Cycle-5 additional MEDIUM findings — single-reviewer, advisory]

- **M-MAESTRO-RECONNECT (MEDIUM, react-native-ui-reviewer)** — `.gate-evidence/step-2-4-reconnect.log:75-78` shows `chat-reconnecting-indicator` WARNED (never rendered). Airplane mode was toggled at log:73 AFTER `chat-stream-last-seq-at-least-3` already fired at log:69 — the deterministic 5-token stream likely completed before the toggle. The maestro reconnect flow does not prove a mid-stream disconnect was detected via the UI. Combined with F-E2, the entire "mid-stream reconnect" claim rests on the integration test, which itself only covers site B.

- **WEAK_ORACLE_DEDUP_INTEGRATION (MEDIUM, test-quality-reviewer, probe-backed)** — Mutant C (removed `applyTokenEvent` dedup at `use-resumable-sse-stream.ts:295`) **SURVIVES** `redhat-fix-04` integration test (3/3 pass) because the test's SSE stub honors `Last-Event-ID` and never sends duplicate seqs. The dedup IS killed at the unit level (`s-reactive-01-resumable-sse.test.ts` → 1 failed). The PRIMARY gate claim "no duplicated tokens" has two defenses — header (Mutant B killed) and client dedup (Mutant C killed only at unit, survives integration). A regression in the server's `seq > afterSeq` filter would leave the client dedup as the sole safety net, and the integration test wouldn't catch a dedup regression.

- **M-ORACLE-FLOOR (MEDIUM, mcp-reviewer)** — The p95 timing cluster (1255–1272 ms, 17 ms variance over 5 iterations) reflects Maestro's `extendedWaitUntil` poll cadence (~1000 ms) + `runScript` dispatch overhead, **not** actual Zero push latency (likely 50–300 ms on localhost). The oracle is **conservative in the honest direction** (t1 overestimates reflect time, so no false passes), but a latency regression from 100 ms → 1000 ms would be invisible. Acceptable for a gate oracle; a stronger signal would tighten the poll interval or correlate with Zero keepalive timestamps.

- **L-S05-STALE (MEDIUM, unchanged)** — `S-REACTIVE-05...md:52,64` annotations cite now-closed reasons (`seed-e2e.ts:500 seeds only Alpha/Beta/Gamma` — false since H1 closed; `ChatThread.tsx:288,297` — now `:336,345`; assemblyRef mutant "INFERRED, NOT MEASURED" — closed by REDHAT-FIX-04 production probe). Annotations actively misleading.

- **NEGATIVE_PATH_GAP_SSE_5XX (MEDIUM, test-quality-reviewer)** — No reconnect test forces the stub to `writeHead(500/503)` on the reconnect request. Every test simulates either airplane mode or a clean `res.end()` mid-stream. A server-side 5xx during reconnect (the most common real-world failure mode) is untested.

- **NEGATIVE_PATH_GAP_SLOW_FLEET (MEDIUM, test-quality-reviewer)** — `isFleetUnavailableFailure` matches `ROLE_UNAVAILABLE` / `:4545 ECONNREFUSED` / empty stream. The slow-trickle case (fleet up, responding, but stalled mid-stream — partial failure vs total) is not asserted. Degraded detection is binary.

---

## LOW Confidence Findings (Single-Reviewer, Advisory)

- **L-L5 (carried, mcp+mastra consensus)** — `services/platform/src/mcp/executor.ts:780,783,791` `UPDATE documents SET title/content/is_public` omits `updated_at = now()`. WAL replication fires (title change is in WAL stream), but `ORDER BY updated_at` queries / caches keyed on `updated_at` will lie. Defense-in-depth — does not affect the current oracle (which matches on title text).
- **L-L8 (carried)** — `hooks/use-resumable-sse-stream.ts:190-205` `isFleetUnavailableFailure` regex-tests a concatenated blob via `/ROLE_UNAVAILABLE/i.test(blob)` rather than `envelope.code === 'ROLE_UNAVAILABLE'`. Works today; fragile to envelope shape changes.
- **L-M1 (carried)** — No `holo stack stop fleet` verb. `SPRINT.md` step 7 documents "Stop the local fleet"; gate uses `run-degraded-no-hang.sh:42-91 kill_port_listeners` shell function (real, but not canonical CLI).
- **L-M7 (carried)** — `chat-runs.ts:264-272 shouldUseDeterministicChatStream` masks the real model path on `holocron_nonprod` when `HOLO_CHAT_FLEET_ONLY !== '1'`. Undocumented outside inline comment; operator footgun.
- **L-NO-WWW-AUTH (mcp-reviewer, deliberate-design)** — `scoped-key.ts:132-135,140` returns 401 without `WWW-Authenticate` header. Per mcp-reviewer rubric, HTTP/Streamable MCP transport "should" advertise it. **Deliberate**: personal-app control plane over Tailscale, bearer-key auth (not OAuth 2.1 + PKCE). RULES.md:74 explicitly waives production hardening.
- **L-NO-TOOL-ANNOTATIONS (mcp-reviewer)** — `gateway.ts:15-20` registers tools without MCP `annotations` field (`destructiveHint`, `readOnlyHint`, `idempotentHint`). `update_document` is destructive + idempotent. Defense-in-depth / client-hint only.
- **L-SCHEMA-ROUGH-EDGE (mcp-reviewer)** — `documents.ts:18` `documentId: z.string().min(1)` instead of `z.string().uuid()`. Malformed UUIDs fail at Postgres `::uuid` cast (fail-closed), just with a less-clean envelope.

---

## Agent Contradictions & Debates

| Topic | Agent A | Agent B | Assessment |
|-------|---------|---------|------------|
| **H3 / REDHAT-FIX-04 AC-2 status** | mastra-reviewer + test-quality-reviewer: **PASS** (both mutants A+B killed via dual-site wipe probe) | react-native-ui-reviewer: **PARTIAL** (single-site-A wipe survives; cycle-4 probe was misleadingly scoped) | **Both technically correct.** The dual-site mutant IS killed (mastra + TQ proved it independently). The single-site-A mutant survives (RN proved it). The disagreement is whether "production mutant killed" means "the specific dual-site mutant that was probed" (PASS) or "all load-bearing production mutants" (PARTIAL). **Resolution**: H3's core claim holds; F-E2 opens site A as a separate, narrower gap. The cycle-4 mutation log was ambiguous about scope — recommend extending the log format to record which site(s) each mutant wiped. |
| **REDHAT-FIX-02 / S-REACTIVE-02 AC-1 status** | mastra-reviewer: **PASS** (writer wired into 3 production call sites — `mission/cycle.ts:613`, `observability/mission-research.ts:442,454`, `cli/holo.ts:3844`) | test-quality-reviewer: **PARTIAL↓** (NO_ORACLE_IDEMPOTENCY — guard has zero test coverage) | **Different axes, both correct.** REDHAT-FIX-02's ACs are about wiring reality (PASS). S-REACTIVE-02's AC-1 includes a behavioral oracle claim that has a coverage gap (PARTIAL). The writer exists and is exercised; the *guard* is untested. |
| **M-H2-LIVE severity** | mastra-reviewer: MEDIUM, refined narrower than cycle 4 (writer exercised by gate via production CLI) | test-quality-reviewer: still open (harness-driven pacing) | **Consensus MEDIUM.** The writer IS real and production-wired; the gate DOES exercise it via `holo research:advance-iteration`. The residual overclaim is engine pacing semantics (no auto-scheduler), not writer reality. |

---

## Recommendations by Category

### Gaps (must-close for unqualified sprint close)

1. **NO_ORACLE_IDEMPOTENCY (CRITICAL)** — Add one integration test firing two concurrent `advanceResearchSessionIteration` calls against the same seeded session; assert exactly one succeeds with `currentIteration === previousIteration + 1` and the other returns `ok:false, errorCode: 'RESEARCH_SESSION_UPDATE_FAILED'`. **~30 min.** This is the cycle's most actionable and most load-bearing blocker — it's the only thing standing between the sprint and a silent production double-increment.
2. **F-E2 (HIGH)** — Add an integration test scenario that drives the XHR-onError reconnect path (site A) without calling `setOnline(false)`. **OR** extend the mutation probe log format to record single-site-A wipe as a separate documented mutant. **~45 min.**
3. **F-TEXT-DIFF-ORACLE (HIGH)** — Add a maestro oracle comparing rendered assistant text to the Zero durable row content, **OR** explicitly downgrade S-REACTIVE-01 AC-3 contract text from "content byte-equal" to "exactly one bubble; content coordination deferred" with a tracked follow-up task. **~30 min implement / 5 min rescope.**

### Risks (advisory, non-blocking — track for future hardening sprint)

4. **M-H2-LIVE** — Footnote the 5 "as the workflow reaches" overclaim sites, or add a `runMissionCycle` auto-scheduler / HTTP `/api/missions/:id/cycle` endpoint.
5. **M3 + M6** — Namespace the duplicate testIDs (`chat-degraded-banner-thread` vs `-footer`) or remove one render site.
6. **M5** — Fix the 154 typecheck errors (or narrow TC-6/TC-7 scope).
7. **F-ORACLE-MISMATCH** — Align `GATE-RESULTS.md` step-2 text with the actual Maestro flow prompt.
8. **L-S05-STALE** — Refresh stale annotations in `S-REACTIVE-05...md`.
9. **M-MAESTRO-RECONNECT** — Tighten the reconnect flow to toggle airplane mid-stream before the deterministic stream completes (will require breaking the deterministic stream OR running against a real fleet).
10. **WEAK_ORACLE_DEDUP_INTEGRATION** — Extend the `redhat-fix-04` SSE stub with a "malicious replay" mode that resends `seq ≤ afterSeq` on reconnect.
11. **NEGATIVE_PATH_GAP_SSE_5XX** — Add a 5xx-on-reconnect test scenario.
12. **NEGATIVE_PATH_GAP_SLOW_FLEET** — Add a slow-trickle-fleet degraded test.
13. **M-ORACLE-FLOOR** — Tighten Maestro poll interval OR correlate with Zero keepalive timestamps.
14. **L-L5** — Add `, updated_at = now()` to the 3 document UPDATE statements in `executor.ts`.
15. **L-M7** — Document the `HOLO_CHAT_FLEET_ONLY` / `HOLO_E2E` / `HOLO_CHAT_DETERMINISTIC_STREAM` env vars in operator docs.

### Assumptions (track for future validation)

16. `runMissionCycle` is the only production site that paces research progress +1 per cycle — based on `rg runMissionCycle` returning only the definition + 2 call sites. A deeper scheduler/queue audit would fully validate (if a scheduler exists, M-H2-LIVE dissolves).
17. The cycle-5 mutation probes are representative of a true cold-clone run — worktrees symlinked primary `node_modules`; the correct-path exit 0 + both mutants exit 1 + restoration exit 0 pattern strongly suggests soundness, but a true CI cold-clone run would be stronger.
18. `gate-results.json run_id s25-ht-20260725T234444Z` reflects a real Maestro run (simulator UDID `C79BF38C-D353-46A2-A1ED-CCA6D68E1B04`, iPhone 17 iOS 26.5, per-step COMPLETED markers). No reviewer re-drove the gate this cycle (read-only red-team pass).

### Contradictions (resolution documented above)

19. H3 PASS-vs-PARTIAL — F-E2 resolves the ambiguity by reframing: H3's core mutant (dual-site) is killed; site-A coverage is a separate gap.
20. REDHAT-FIX-02 PASS-vs-PARTIAL — different axes (wiring vs test coverage); both correct.

---

## Agent Reports (Summary)

- **`react-native-ui-reviewer`** (RN client reactivity lens — primary brief): **NEEDS_FIXES — narrow.** 2 new HIGH findings (F-E2, F-TEXT-DIFF-ORACLE) via independent mutation probe + oracle audit. AC-2 and AC-3 downgraded PASS→PARTIAL on S-REACTIVE-01 + S-REACTIVE-05 AC-2. All other behavioral claims hold at HEAD. (14 findings total: 2 new HIGH, 6 MEDIUM, 6 LOW.)

- **`mastra-reviewer`** (backend/engine/contract lens): **APPROVE — unqualified, backend-axis.** Cycle-4 F-E1 genuinely closed. REDHAT-FIX-02 production-wired to 3 real engine call sites (not a simulation harness). H3 re-verified at HEAD via independent production mutation probe (both mutants killed). Backend non-regression cycle-4→cycle-5 DEFINITIVE (empty diff on 7+1 frozen surfaces). 10 advisory findings, all carried/non-regressed. (10 findings: all MEDIUM/LOW advisory.)

- **`mcp-reviewer`** (MCP-gateway p95 slice lens): **APPROVE.** The p95 SLO claim is the easiest to fake, and it is NOT faked. Real `@modelcontextprotocol/sdk` `McpServer` over `WebStandardStreamableHTTPServerTransport`; real JSON-RPC `tools/call` envelope; Postgres write inside executor (no DB bypass); p95 oracle observes RN UI via XCTest matcher (not DB poll); 4× margin (1272 ms vs 5000 ms SLO). Slice frozen since prior mcp-reviewer pass (`git diff` empty). (5 findings: 1 MEDIUM, 4 LOW.)

- **`test-quality-reviewer`** (standing seat — test-reality lens): **NEEDS_FIXES — narrow.** 1 new CRITICAL (NO_ORACLE_IDEMPOTENCY — guard has zero coverage, proved via live-Postgres mutation probe), 2 new MEDIUM (WEAK_ORACLE_DEDUP_INTEGRATION, NEGATIVE_PATH_GAP_SLOW_FLEET), 1 new MEDIUM (NEGATIVE_PATH_GAP_SSE_5XX). 5 mutants probed across 2 load-bearing functions; 4 KILLED, 1 SURVIVED (CRITICAL). All 4 prior blockers confirmed closed; gate evidence fresh and cold-checkout-rerunnable. (12 findings: 1 new CRITICAL, 3 new MEDIUM, 8 carried.)

---

## Metadata

- **Agents**:
  - `react-native-ui-reviewer` — RN surfaces: `useResumableSSEStream` hook, chat cluster, Zero reactive hooks, degraded banner, a11y. Tools: Glob/Grep/Read/Bash/Task/Write.
  - `mastra-reviewer` — Backend surfaces: SSE endpoint, `research/progress.ts` writer, mission-engine wiring, degraded envelope, Zero publication, `bin/holo`. Tools: Glob/Grep/Read/Bash/Task/Write.
  - `mcp-reviewer` — MCP-gateway document-update path (gate step 4 / S-REACTIVE-03). Tools: Glob/Grep/Read/Bash/Task/Write.
  - `test-quality-reviewer` (standing seat) — Test reality: oracle strength (mutation), seed/fixture reality, negative-path coverage, TDD evidence chain. Tools: Glob/Grep/Read/Bash/Task/Write.
- **Confidence Framework**: HIGH (3+ reviewers agree or consensus closure), MEDIUM (2 reviewers OR single-reviewer probe-backed), LOW (single-reviewer opinion).
- **Report Generated**: 2026-07-26T00:12:44Z
- **Duration**: ~15m (4-agent parallel dispatch + consolidation)
- **Gate Pre-Check**: 0 HIGH auto-findings; 1 MEDIUM advisory (evidence-freshness hygiene — status-sync commit post-dates gate by 14s, no behavioral change).
- **Cycle**: 5 of 5 (user-approved cap extension from 4 in cycle 4).
- **Next Steps**:
  1. **Block unqualified close** until NO_ORACLE_IDEMPOTENCY, F-E2, F-TEXT-DIFF-ORACLE are addressed (estimated 1.5–2 hours total).
  2. **Recommended**: spawn REDHAT-FIX-09 (close NO_ORACLE_IDEMPOTENCY — highest ROI, ~30 min), REDHAT-FIX-10 (close F-E2 — site-A reconnect coverage, ~45 min), REDHAT-FIX-11 (close F-TEXT-DIFF-ORACLE — maestro content oracle OR AC-text downgrade, ~30 min).
  3. **OR** accept the 3 new findings as advisory (they are all test-reality gaps, not behavioral regressions) and close the sprint with a tracked follow-up. This is defensible — the sprint's behavioral claims hold; the gaps are in the test net's mesh size, not the implementation. The standing seat's charter is precisely to surface these, but they are not behavioral blockers.
  4. Do NOT re-litigate: H1, H2, H3, S-REACTIVE-03, REDHAT-FIX-01/02/05/06/07/08 closures — all hold at HEAD `29c05990` across 4-reviewer consensus.

---

## Source Coverage

- Sprint: `.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/`
- Prior cycles: `.spec/reviews/red-hat-sprint25-reactive-20260725T{165851,195015,211242,225400}Z.md`
- Production code: `hooks/use-resumable-sse-stream.ts`, `app/(drawer)/chat/[conversationId].tsx`, `components/chat/ChatThread.tsx`, `app/zero/{schema,queries}.ts`, `services/platform/src/http/{chat-runs,hono-app}.ts`, `services/platform/src/research/progress.ts`, `services/platform/src/mission/cycle.ts`, `services/platform/src/observability/mission-research.ts`, `services/platform/src/inference/{degraded-mode-controller,resolve-model,telemetry}.ts`, `services/platform/src/db/seed-e2e.ts`, `services/platform/src/cli/holo.ts`, `services/platform/src/mcp/{gateway,executor}.ts`, `bin/holo`
- Tests: `tests/integration/redhat-fix-{02,04}-*.test.ts`, `tests/integration/s-reactive-{01,02,04}-*.test.ts`, `services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts`
- Gate: `.maestro/reactive/*.yml` + `helpers/*`, `.gate-evidence/step-*.log`, `gate-results.json`, `GATE-RESULTS.md`
- TDD evidence: `.tmp/sprint-25/redhat-fix-{01,02,04}-{path.json,red.log,production-mutation.log}`
