# Red-Hat Review Report — Cycle 4

**Report Date**: 2026-07-25T22:54:36Z
**Target**: Sprint 25 — Reactive Surfaces: SSE Streaming, Mission Progress, Degraded (`sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded`)
**Sprint Status Reviewed**: `In Progress` (SPRINT.md:15) · status line claims "5/5 tasks completed · updated 2026-07-25T22:44:10Z" · **NO `sprint-goal-state.json`** (sprint is NOT formally claiming `goal:complete`)
**HEAD reviewed**: `addea0fce5d09996ae949d5c234110478106fd31` (cycle-3 HEAD was `fc24bf68`)
**Reviewed By**: `mastra-reviewer`, `react-native-ui-reviewer`, `test-quality-reviewer` (standing seat)
**Test-reality lens**: ran (IMPLEMENTED mode) — production-code mutation probe re-executed against HEAD `addea0fce` in an isolated worktree; **both cycle-3 H3 mutants still KILLED** at the cycle-4 HEAD (the load-bearing re-verification)
**Prior cycles re-audited**: `.spec/reviews/red-hat-sprint25-reactive-20260725T211242Z.md` (cycle 3 — narrow NEEDS_FIXES, sole blocker G-3 partial on REDHAT-FIX-04), `.spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md` (cycle 2), `.spec/reviews/red-hat-sprint25-reactive-20260725T165851Z.md` (cycle 1)
**Verdict**: **NEEDS_FIXES — narrow.** The cycle-3 single blocker (G-3 partial recurrence on REDHAT-FIX-04) is **GENUINELY CLOSED** by REDHAT-FIX-07 (`5fe64018`). The sprint's PRIMARY behavioral claim (zero-dup-token reconnect) **HOLDS** at HEAD `addea0fce` — both load-bearing mutants KILLED in an independent production-code probe. **However**, a **NEW HIGH executability defect (F-E1)** blocks the unqualified close: gate step 1 (`holo seed:e2e --reset`) is not re-runnable on a cold clone as documented, and the canonical `gate-results.json` is currently **MISSING** from the working tree (rotated to `.prev.json` during an in-flight re-run that died at step 1 with `holo: unknown command: seed:e2e` exit 127). One PATH/install fix + gate re-run (or `git checkout HEAD -- gate-results.json .gate-evidence/step-1-seed.log`) closes it.

---

## Executive Summary

Cycle 3 closed the sprint's hardest problem (H3 production-code mutation kill) and left exactly one blocker: REDHAT-FIX-04's TC-5 evidence existed only in the worktree. REDHAT-FIX-07 (`5fe64018`) delivered exactly what its MUST clauses required — copy the three contract-path files (`redhat-fix-04-{path.json,production-mutation.log,red.log}`) to `.tmp/sprint-25/` AND dual-write durable copies under `.gate-evidence/tdd/`, with PATH-A preserved, mutation-kill honesty intact, and zero product-code edits. **G-3 is closed.** REDHAT-FIX-07's scope is exhaustively clean: 6 evidence files touched, zero `services/`/`hooks/`/`app/`/test files.

The cycle-4 standing seat re-probed both H3 mutants against HEAD `addea0fce` in an isolated worktree (`/var/folders/hw/.../T/opencode/redhat-cycle4-probe`): correct path exit 0; **Mutant A** (assemblyRef-reset wipe at `use-resumable-sse-stream.ts:740`+`:765`) → exit 1, `AssertionError: expected null to be '3'` → **KILLED**; **Mutant B** (Last-Event-ID header-drop at `:323`) → exit 1 → **KILLED**; restoration exit 0 (no baseline anomaly). Probe worktree removed; primary checkout clean. **H3 stays CLOSED.** Two independent production-code probes (the standing seat's at `addea0fce` and the implementer's worktree log at `a1c4a26d`) now agree across two cycles.

**However, a NEW HIGH executability blocker (F-E1) emerged on independent verification — and was missed by cycle 3.** The operator's PATH `holo` (`/Users/inference1/.local/bin/holo`, a ~1KB bash stub) implements ONLY `verify:no-convex-client`; every other command — including `seed:e2e` — returns `holo: unknown command: …` exit 127. The real command lives in `services/platform/src/cli/holo.ts:1793` (case `'seed:e2e'`) and is exposed by the worktree dispatcher at `.kb-run-sprint/worktrees/REDHAT-FIX-05/bin/holo` (which `exec`s `bun services/platform/src/cli/holo.ts "$@"`). The cycle-3 "fresh gate" (`gate-results.prev.json`, `run_id:s25-ht-20260725T203604Z`) silently used that worktree dispatcher via a PATH override (`step-2-4-reconnect.log:1`). A post-cycle-3 re-run attempt at `2026-07-25T22:44:51Z` used the primary stub and **died at step 1** (`.gate-evidence/s25-ht-20260725T224451Z/step1.log`: `holo: unknown command: seed:e2e`, `step1.exit` 127). The re-run was abandoned mid-flight, leaving `gate-results.json` DELETED in the working tree (only `.prev.json` remains) and `step-1-seed.log` overwritten with the failure output. `GATE-RESULTS.md` still cites `run_id:s25-ht-20260725T203604Z` as fresh evidence — now stale relative to the working tree.

The sprint has NOT claimed `goal:complete` (no `sprint-goal-state.json`), so per the skill's [2.5] EVIDENCE clause the missing `gate-results.json` is **dormant** — not a lifecycle blocker. But [2.5] EXECUTABILITY **always runs**: gate step 1's documented command (`holo seed:e2e --reset`) does not resolve on a cold checkout. This is a HIGH-severity auto-finding, independently corroborated by all three reviewers. The behavioral evidence (H1/H2/H3/S-REACTIVE-03/SSE backend) remains sound; the defect is purely in the human-gate re-runnability surface.

**Cycle-4 bottom line**: cycle-3's blocker is gone; a new executability blocker takes its place. The sprint is one PATH/install fix + gate re-run away from unqualified close. Without that fix, the gate evidence cannot survive cold-clone scrutiny.

---

## HIGH Confidence Findings (3+ Agents Agree, or Mutation-Backed)

- [x] **G-3 → CLOSED: REDHAT-FIX-07 restored REDHAT-FIX-04's TC-5 evidence at the contract-mandated `.tmp/sprint-25/` path on the primary checkout.** | Severity: (closure of cycle-3 sole blocker)
  **TC-5 verify** (`test -f .tmp/sprint-25/redhat-fix-04-red.log && test -f .tmp/sprint-25/redhat-fix-04-production-mutation.log && test -f .tmp/sprint-25/redhat-fix-04-path.json && jq -e '.path=="A"' .tmp/sprint-25/redhat-fix-04-path.json`) → **exit 0** on the primary checkout, no worktree dependency. Durable copies under `.spec/prds/.../.gate-evidence/tdd/redhat-fix-04-*` are byte-identical to the primary `.tmp/sprint-25/` copies. `path.json` is `{"path":"A","task":"REDHAT-FIX-04"}` (PATH-A preserved). `production-mutation.log` retains honest kill evidence (`correct mode=unmutated exit=0 failures=0`, `production-assembly-reset KILLED`, `AssertionError: expected null to be '3'` at test:370). `redhat-fix-04-red.log` non-empty. REDHAT-FIX-07 commit `5fe64018` touched **only** 6 evidence files (zero product/test/doc code). The cycle-3 "trivial copy-and-commit" prediction was correct.
  **Agents**: react-native-ui-reviewer (HIGH — ran TC-5 on primary, exit 0; byte-identical durable copies confirmed); mastra-reviewer (HIGH — `git show --stat 5fe64018` scope-clean, 6 evidence files only); test-quality-reviewer (HIGH — independent TC-5 run + content audit).

- [x] **H3 → STILL CLOSED at HEAD `addea0fce`: both load-bearing mutants KILLED in independent production-code probe.** | Severity: (re-verification of cycle-3 closure)
  The standing seat re-probed both mutants in an isolated worktree off HEAD `addea0fce`. **Correct path**: `pnpm vitest run tests/integration/redhat-fix-04-production-hook-reconnect.test.ts -t 'AC-1'` → exit 0 (1 passed, 2 skipped). **Mutant A** (assemblyRef-reset wipe at production `use-resumable-sse-stream.ts:740`+`:765`) → exit 1, `AssertionError: expected null to be '3'` at test:370 — **KILLED**. **Mutant B** (Last-Event-ID header-drop at production `:323`) → exit 1, same assertion — **KILLED**. Restoration → exit 0 (no baseline anomaly). Production sites are the **same** cycle-3 sites (file untouched between `fc24bf68` and `addea0fce`). Probe worktree removed; `git status --porcelain hooks/use-resumable-sse-stream.ts` empty at exit.
  **Agents**: test-quality-reviewer (HIGH — mutation-backed, the decisive evidence); react-native-ui-reviewer (HIGH — `git diff fc24bf68..addea0fce -- hooks/use-resumable-sse-stream.ts` EMPTY); mastra-reviewer (implicit — backend SSE contract non-regressed).
  **Net**: S-REACTIVE-01 AC-2 (PRIMARY), REDHAT-FIX-04 AC-1/AC-2 stay **PASS**.

- [x] **F-E1 (NEW — HIGH executability defect): the human gate step 1 (`holo seed:e2e --reset`) is NOT re-runnable on a cold clone as documented.** | Severity: **High**
  `/Users/inference1/.local/bin/holo` (the operator's PATH binary, ~1KB) is a bash stub implementing **ONLY** `verify:no-convex-client`; every other invocation returns `holo: unknown command: $cmd` exit 127. Verified directly:
  ```
  $ which holo
  /Users/inference1/.local/bin/holo
  $ holo --help          → holo: unknown command: --help
  $ holo seed:e2e --reset → holo: unknown command: seed:e2e   (exit 127)
  ```
  The real `seed:e2e` is registered at `services/platform/src/cli/holo.ts:1793` (`case 'seed:e2e'`) and is correctly wired in `package.json` (`"seed:e2e": "bun services/platform/src/cli/holo.ts seed:e2e --reset"`). It's exposed by the worktree dispatcher `.kb-run-sprint/worktrees/REDHAT-FIX-05/bin/holo` (which `exec`s `bun …/holo.ts "$@"`) — committed by REDHAT-FIX-03 (`a38c5dca`) but **not installed to PATH**. The cycle-3 "fresh gate" (`gate-results.prev.json`) silently worked around this via a PATH override (`step-2-4-reconnect.log:1`: `holo=/Users/inference1/Projects/holocron/.kb-run-sprint/worktrees/REDHAT-FIX-05/bin/holo`). The post-cycle-3 re-run at `2026-07-25T22:44:51Z` used the primary stub and **died at step 1** (`.gate-evidence/s25-ht-20260725T224451Z/step1.log`: 66 bytes, `holo: unknown command: seed:e2e`; `step1.exit`: 127). `SPRINT.md:40`, `GATE-RESULTS.md:9` (step 1), and `gate-results.prev.json` step-1 `text` all document `holo seed:e2e --reset` verbatim with no PATH footnote.
  **Agents**: react-native-ui-reviewer (HIGH — independently reproduced; PATH binary read); mastra-reviewer (HIGH — `holo.ts:1793` registration confirmed; in-flight `s25-ht-20260725T224451Z` failure traced); test-quality-reviewer (HIGH — `gate-results.json` deletion + `step-1-seed.log` overwrite corroborate). **Skill [2.5] EXECUTABILITY auto-finding** (source: `gate-pre-check`).
  **Why HIGH (not CRITICAL)**: the platform CLI works; the worktree dispatcher faithfully delegates; workarounds are trivial (`./bin/holo` or `pnpm seed:e2e`). **Why HIGH (not MEDIUM)**: it **blocks cold-clone re-verification** of the entire sprint gate — the central artifact of cycle-3's G-2 closure. A future reviewer cloning the repo would conclude "gate is broken" without the PATH context.
  **Fix (any one)**: (a) replace `/Users/inference1/.local/bin/holo` with the worktree dispatcher (or symlink: `ln -sf $REPO/.kb-run-sprint/worktrees/REDHAT-FIX-05/bin/holo /Users/inference1/.local/bin/holo`); (b) update `SPRINT.md:40` + `GATE-RESULTS.md` step-1 text + `gate-results.json` step-1 text to `./bin/holo seed:e2e --reset` (or `pnpm seed:e2e`) with a one-line footnote explaining the PATH stub's scope; (c) add a `holo` shim to `node_modules/.bin/` via `package.json "bin"` and have SPRINT.md use `pnpm exec holo seed:e2e --reset`.

- [x] **G-2-REGRESSED (process concern): the canonical `gate-results.json` is MISSING from the working tree.** | Severity: **High (process)**
  `git status --porcelain` shows `D …/gate-results.json` (uncommitted deletion). Only `gate-results.prev.json` remains. The post-cycle-3 re-run at `22:44:51Z` overwrote `step-1-seed.log` with the F-E1 failure (was a 60-line passing log, now a 2-line `holo: unknown command` failure) and left the `s25-ht-20260725T224451Z/` directory as the only fresh evidence (containing `step1.log` + `step1.exit`, no further steps). `GATE-RESULTS.md` still cites `run_id:s25-ht-20260725T203604Z` (verdict pass, 5/5) as fresh — **the doc is stale relative to the working tree**. The sprint has NOT claimed `goal:complete` (no `sprint-goal-state.json`), so per the skill's [2.5] EVIDENCE clause this is **dormant** — not a lifecycle blocker — but the cycle-3 G-2 closure citation no longer matches the canonical artifact.
  **Agents**: test-quality-reviewer (HIGH — git status + step1.log + step1.exit concur); mastra-reviewer (HIGH — corroborated); react-native-ui-reviewer (HIGH — corroborated).
  **Fix (either)**: (a) `git checkout HEAD -- .spec/.../gate-results.json .spec/.../.gate-evidence/step-1-seed.log` to restore the cycle-3 evidence; OR (b) re-run the full gate end-to-end with the correct `./bin/holo` after F-E1 is remediated, producing a fresh `gate-results.json` post-dating REDHAT-FIX-07.

- [x] **Backend non-regression DEFINITIVE across cycle-3→cycle-4.** | Severity: (positive)
  `git diff fc24bf68..addea0fce` is **EMPTY** (0 diff lines per file) for all 6 frozen surfaces: `services/platform/src/http/chat-runs.ts` (SSE backend, `seq > afterSeq` replay intact), `services/platform/src/research/progress.ts` (H2 writer, PATH-A intact), `services/platform/src/db/seed-e2e.ts` (H1 Streaming seed at `:541-576`), `services/platform/src/mcp/executor.ts` (S-REACTIVE-03 p95), `services/platform/src/observability/mission-research.ts`, `services/platform/src/mission/cycle.ts`. The 4 commits between the two HEADs (`142e4b1a`, `5fe64018`, `b99d73b7`, `addea0fc`) are all evidence/chore/status — **zero `services/platform/src/` changes**. Cycle-3 confirmed-PASS surfaces (H1/H2/H3/S-REACTIVE-03/SSE backend/pure-function `buildSseResumeHeaders`/M2) all hold.
  **Agents**: mastra-reviewer (DEFINITIVE — exhaustive `git diff --stat` per file); react-native-ui-reviewer + test-quality-reviewer (implicit — out of direct scope, no contradiction).

---

## MEDIUM Confidence Findings (2 Agents Agree)

- [ ] **M-H2-LIVE (OPEN, unchanged): "live as the workflow reaches iteration 3/5" overclaims — gate evidence is harness-driven, not engine-driven.** | Severity: High
  Zero production invocations of the `:8765` test-harness server (`rg -n '8765|advance-server|advance-research-iteration' services/platform/src/` returns only 2 **disclaiming comments** at `mission-research.ts:441` and `cli/holo.ts:3814`). The two production call paths remain as cycle 3 described: (1) `runResearchMission` terminal burst at `observability/mission-research.ts:448-462` — a tight synchronous `for` loop that walks 1→5 AT terminal admission (UI sees one WAL replay burst, not paced advancement); (2) `runMissionCycle` at `mission/cycle.ts:613` — +1 per **manual CLI trigger**, no auto-scheduler, no HTTP `/api/missions/:id/cycle` endpoint. The gate evidence (`.gate-evidence/step-5-research.log`) is harness-driven: each `1/5 → 2/5 → 3/5` transition is bracketed by a `Run advance-research-iteration.js` step (the `:8765` test server wrapping the production writer); the log has **no timestamps** — no wall-clock proof of paced progression. The overclaim phrase "as the workflow reaches iteration 3/5" appears un-footnoted in 5 sites: `SPRINT.md:44`, `GATE-RESULTS.md:14` (step 3), `ROADMAP.md:1445`, `gate-results.prev.json` step-3 `text`, and `mission-research.ts:450` (production comment **actively defending** the overclaim: "engine-backed, not a harness jump"). Standing seat concession: `tests/integration/s-reactive-02-research-progress-zero.test.ts:44-110` has **NO_ORACLE** for the production writer — first 6 tests are pure static regex (would pass if `progress.ts` was deleted); the 7th does its own `psql UPDATE` bypassing the writer. **S-REACTIVE-02 AC-1 PARTIAL.**
  **Agents**: mastra-reviewer (HIGH — triple-evidenced: zero prod `:8765` refs + 5 overclaim sites + harness-driven gate log); test-quality-reviewer (HIGH — NO_ORACLE concession for production writer; gate log harness-driven).
  **Fix**: (a) footnote the 5 overclaim sites + correct `mission-research.ts:450`; OR (b) add an end-to-end integration test exercising the production writer with live Postgres assertion + wall-clock timestamps; OR (c) wire an auto-scheduler / HTTP `/api/missions/:id/cycle` endpoint.

- [ ] **M3 + M6 (OPEN, unchanged): duplicate `chat-degraded-banner` / `chat-degraded-message` testIDs across two files.** | Severity: Medium
  `rg "chat-degraded-(banner|message)"` returns **4 hits across 2 files**: `app/(drawer)/chat/[conversationId].tsx:651,656` AND `components/chat/ChatThread.tsx:336,345` — both render the identical testIDs conditionally on `streamPhase === 'degraded'`. Violates the testID uniqueness rule. Maestro's `extendedWaitUntil: notVisible: id: chat-degraded-banner` (45s timeout, M6-improved from cycle 2) resolves on whichever XCTest finds first; in a render race where one banner clears and the other persists, the recovery assertion flakes. **S-REACTIVE-04 AC-3 PARTIAL.**
  **Agents**: react-native-ui-reviewer (HIGH — rg-verified all 4 sites); test-quality-reviewer (HIGH — corroborated).
  **Fix**: deduplicate the testIDs (namespace as `chat-degraded-banner-thread` vs `-footer` OR remove one site).

- [ ] **M5-REGRESSED (OPEN, unchanged): `pnpm typecheck` reports 154 errors (was 153).** | Severity: Medium (process)
  The new TS2322 error at `tests/integration/redhat-fix-04-production-hook-reconnect.test.ts(121,1)` (`NodeXMLHttpRequest` missing `response`, `responseType`, `responseURL`, `responseXML`, +17 DOM properties) is **still present**. REDHAT-FIX-07's MUST/STRICTLY clauses explicitly scoped it to evidence-hygiene only (task contract line 227: "M5 typecheck regression in the FIX-04 test file is OUT OF SCOPE for this chore") — no typecheck fix landed, consistent with cycle-3's prediction. The other 153 errors cluster in `services/platform/src/{mission,queue,tools,uploads}` (pre-existing, outside reactive surfaces). S-REACTIVE-01 TC-6/TC-7 text still says `pnpm tsc --noEmit → Exit 0` unconditionally — literal FAIL by the letter of the TC.
  **Agents**: react-native-ui-reviewer (MEDIUM — ran typecheck, counted 154, isolated new error); test-quality-reviewer (MEDIUM — corroborated).
  **Fix**: cast `NodeXMLHttpRequest as unknown as typeof XMLHttpRequest` OR add the missing DOM properties to the polyfill OR narrow S-REACTIVE-01 TC-6/TC-7 to reactive-surface source files.

- [ ] **F-ORACLE-MISMATCH (NEW — MEDIUM): gate step 2 documents "Summarize the seeded doc" but the Maestro flow sends different text.** | Severity: Medium (documentation-truth)
  `GATE-RESULTS.md:12` and `gate-results.prev.json` step-2 `text` both read: *"Send 'Summarize the seeded doc'; stream tokens; airplane mid-stream…"*. **The actual Maestro flow sends different text**: `.gate-evidence/step-2-4-reconnect.log:111` shows `Input text Write a detailed multi-sentence answer about the number five with at least eight words.... COMPLETED`. A future reviewer re-running the gate with "Summarize the seeded doc" would not match the recorded flow.
  **Agents**: test-quality-reviewer (MEDIUM — sole finder; log:111 vs doc:12 mismatch).
  **Fix**: update the doc text to match the executed flow, OR update the `.maestro/reactive/reconnect-exactly-once.yml` flow to send the documented text.

- [ ] **L-S05-STALE (OPEN, unchanged): S-REACTIVE-05 AC-1/AC-2 annotations cite now-closed reasons.** | Severity: Medium (doc hygiene)
  `S-REACTIVE-05...md:52` still reads `- [ ] **PARTIAL** [RED-TEAM 2026-07-25]` citing `seed-e2e.ts:500 seeds only Alpha/Beta/Gamma` (FALSE — H1 closed by REDHAT-FIX-01; Streaming seed now at `seed-e2e.ts:541-576`) and stale line numbers `ChatThread.tsx:288,297` (NOW `:336,345`). `S-REACTIVE-05...md:64` still cites `INFERRED, NOT MEASURED` for the assemblyRef mutant (CLOSED by REDHAT-FIX-04 production-code probe). Annotations actively misleading — a future reviewer would re-litigate closed surfaces.
  **Agents**: react-native-ui-reviewer (MEDIUM — verified the stale text + line numbers).
  **Fix**: refresh both annotations to PASS (or PARTIAL-with-only-M3-remaining for AC-1).

---

## LOW Confidence Findings (Single Agent, Carried)

- [ ] **L-M1 (OPEN): "Stop the local fleet" gate step 7 has no human-executable verb.** | Severity: Medium (ergonomics; behavior real)
  `run-degraded-no-hang.sh:42` defines a real `kill_port_listeners()` shell function (wraps `lsof -nP -iTCP:$port -sTCP:LISTEN -t` + `kill`/`kill -9` + a "fleet reaper" background loop) — so the gate runs. But `rg "holo (stack|fleet )" services/platform/src/cli/` shows only `holo stack up|down|status` — **NO `holo stack stop fleet` verb exists.** SPRINT.md step 7 remains non-human-executable as written. Behavior is real (`SURFACE_UNAVAILABLE_MESSAGE` envelope surfaces correctly); only the verb is missing.
  **Agent**: react-native-ui-reviewer (carried from cycle 1); test-quality-reviewer (corroborated: "FUNCTION REAL, VERB ABSENT").

- [ ] **L-M7 (OPEN): deterministic chat-token stream masks real model path on `holocron_nonprod`.** | Severity: Low
  `services/platform/src/http/chat-runs.ts:264-272` (`shouldUseDeterministicChatStream`), `:237` (`emitDeterministicTokenStream`), call sites at `:298,339,348`. Gates on `isHolocronNonprodDatabaseUrl(databaseUrl) && process.env.HOLO_CHAT_FLEET_ONLY !== '1'`. Inline comment at `:268` is the only documentation; formal "documented acceptance" still missing. File untouched by REDHAT-FIX-04/05/06/07.
  **Agent**: mastra-reviewer (carried).

- [ ] **L-L5 (OPEN): `documents.updated_at` not bumped in `update_document`.** | Severity: Low
  `services/platform/src/mcp/executor.ts:780` (`UPDATE documents SET title = …`), `:783` (`SET content = …`), `:791` (`SET is_public, share_token`) — none include `updated_at = now()`. The same file correctly bumps `updated_at` in 7 other update paths (`:157,277,465,477,491,500,562`); the document path is the lone omission. WAL replication fires but `ORDER BY updated_at` / caches keyed on `updated_at` will lie. `executor.ts` non-regressed (`git diff` empty).
  **Agent**: mastra-reviewer (carried).

- [ ] **L-L8 (OPEN, partially improved): `isFleetUnavailableFailure` regex-over-prose.** | Severity: Low
  `hooks/use-resumable-sse-stream.ts:190-205`: concatenates `envelope.{error,message,code,status,text}` into a blob then runs 8 regex tests. `envelope.code` IS folded in but via `/ROLE_UNAVAILABLE/i.test(blob)`, NOT `envelope.code === 'ROLE_UNAVAILABLE'`. REDHAT-FIX-04 touched this file for mutation-test wiring only; the regex was not upgraded.
  **Agent**: mastra-reviewer (carried).

- [ ] **M-MAESTRO-RECONNECT (OPEN, non-blocking): Maestro reconnect oracle weak — no longer load-bearing for H3.** | Severity: Medium (downgraded)
  `.gate-evidence/step-2-4-reconnect.log:135-138` — `Assert that (Optional) id: chat-reconnecting-indicator is visible... WARNED` / `Warning: Assertion is false`. The reconnecting indicator NEVER rendered in the gate run. Combined with the airplane-mode timing (enabled AFTER `token-count-at-least-3` at log:128, with the deterministic 5-token stream on `holocron_nonprod` per L-M7), the stream likely reached terminal before the toggle — the gate does not prove a mid-stream disconnect was detected + a reconnect happened via the UI. The numeric testIDs ARE real (`ChatThread.tsx:409,441,462` — value-bearing 1px opacity-0.01 Views, XCTest-discoverable), but "at-least-3" is a threshold not a delta, so full-replay duplication would not be caught. **No longer load-bearing for H3**: REDHAT-FIX-04's integration test carries the "zero duplicate tokens" claim with production-code mutant kills. The Maestro flow serves as a smoke test for final bubble count + Streaming seed visibility.
  **Agent**: react-native-ui-reviewer (carried).

---

## Agent Contradictions & Debates

| Topic | Agent A | Agent B | Assessment / Resolution |
|-------|---------|---------|------------|
| **F-E1 severity characterization** | react-native-ui-reviewer: HIGH — "blocks cold-clone re-verification of the entire sprint gate" | mastra-reviewer: HIGH — "doesn't block backend close, blocks human-gate close" | **Resolved: HIGH, with axis scoping.** All three agree on HIGH severity. mastra-reviewer correctly notes the backend/contract axis is independently closeable (zero product-code defect); F-E1 specifically blocks the **human-gate** close (the gate cannot be re-run as documented). The consolidator treats F-E1 as a sprint-close blocker while acknowledging the backend axis is clean. |
| **G-2 regression classification** | test-quality-reviewer: "REGRESSED from CLOSED back to BROKEN" | mastra-reviewer: "in-flight gate run; `gate-results.json` rotated to `.prev.json` during re-run" | **Resolved: dormant per [2.5] EVIDENCE clause, but stale doc.** The sprint has NOT claimed `goal:complete` (no `sprint-goal-state.json`), so per the skill's [2.5] clause the missing `gate-results.json` is NOT a lifecycle blocker — but `GATE-RESULTS.md` citation is stale relative to the working tree. Remediation: either `git checkout HEAD -- gate-results.json .gate-evidence/step-1-seed.log` to restore cycle-3 evidence, OR re-run the gate cleanly after F-E1. |
| **F-E1 root cause: stub vs dispatcher** | react-native-ui-reviewer: "PATH binary is a 38-line stub implementing only `verify:no-convex-client`" | mastra-reviewer: "PATH binary is a 132-line bash stub" | **Resolved: stub size is ~1KB (file listing: 1008 bytes); line count differs by accounting (with/without blank lines). Both agree the stub implements only `verify:no-convex-client` and returns `unknown command` exit 127 for everything else. Root cause is the install/dispatcher gap, not the stub size.** |
| **H3 verdict (the cycle's load-bearing question)** | (no contradiction this cycle) | test-quality-reviewer: H3 CLOSED at `addea0fce` (both mutants KILLED); react-native-ui-reviewer + mastra-reviewer: H3 CLOSED (non-regressed) | **UNANIMOUS — H3 stays CLOSED.** The cycle-2/cycle-3 contradiction (RN-reviewer trusted self-generated mutation log; standing seat's production probe refuted it, then confirmed closure) does not recur. The implementer's extraction + the standing seat's two-cycle independent production probes now agree. |
| **REDHAT-FIX-07 scope** | (no contradiction) | all 3 reviewers: scope clean — 6 evidence files, zero product/test/doc code | **UNANIMOUS.** Commit `5fe64018` accurately describes its diff. |

---

## Recommendations by Category

1. **Gaps (must-close blocker — single new item)**:
   - **F-E1 (HIGH executability)**: replace `/Users/inference1/.local/bin/holo` with the worktree dispatcher pattern (one-line symlink: `ln -sf $REPO/.kb-run-sprint/worktrees/REDHAT-FIX-05/bin/holo /Users/inference1/.local/bin/holo`), OR update `SPRINT.md:40` + `GATE-RESULTS.md` step-1 text + `gate-results.json` step-1 text to `./bin/holo seed:e2e --reset` (or `pnpm seed:e2e`) with a one-line footnote. This is the **only** blocker between the current state and an unqualified sprint close. Combined with G-2-REGRESSED remediation below.

2. **Risks (should-fix before formal close)**:
   - **G-2-REGRESSED**: `git checkout HEAD -- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/step-1-seed.log` to restore the cycle-3 evidence, OR re-run the full gate end-to-end with `./bin/holo` once F-E1 is remediated, producing a fresh `gate-results.json` post-dating REDHAT-FIX-07.
   - **M-H2-LIVE**: footnote the 5 overclaim sites (`SPRINT.md:44`, `GATE-RESULTS.md:14`, `ROADMAP.md:1445`, `gate-results.json` step-3 `text`, `mission-research.ts:450`) with "writer proven; live engine-driven advancement pending automatic mission-cycle scheduling — gate exercises the writer via a test harness." OR add the end-to-end integration test. Also correct the production comment at `mission-research.ts:450` that defends the overclaim.
   - **M5 regression**: fix the `NodeXMLHttpRequest` typecheck error in REDHAT-FIX-04's test file (cast or add missing DOM properties), OR narrow S-REACTIVE-01 TC-6/TC-7 to reactive-surface source files. 154 errors → 153.
   - **M3 + M6**: deduplicate `chat-degraded-banner`/`chat-degraded-message` testIDs between `[conversationId].tsx:651,656` and `ChatThread.tsx:336,345`; resolves S-REACTIVE-04 AC-3 PARTIAL → PASS.
   - **F-ORACLE-MISMATCH**: correct the gate step-2 documentation mismatch — either update `GATE-RESULTS.md:12` + `gate-results.json` step-2 text to match the actual Maestro input text, OR update `.maestro/reactive/reconnect-exactly-once.yml` to send the documented "Summarize the seeded doc".
   - **L-S05-STALE**: refresh S-REACTIVE-05 AC-1/AC-2 annotations — the cited reasons are closed; update to PASS or PARTIAL-with-only-M3.

3. **Assumptions (challenge accepted)**:
   - The sprint title's "Mission Progress" half remains defensible under PATH-A (writer exists, non-regressed), but "as the workflow reaches iteration 3/5" overclaims until an auto-scheduler or HTTP cycle endpoint exists. Either deliver the scheduler or footnote (M-H2-LIVE).
   - The Maestro PRIMARY-gate oracle for reconnect is weak (reconnecting-indicator optional + WARNED; airplane-mode possibly post-complete), but the H3 claim has legitimately migrated to the integration test — this is an acceptable test-strategy shift, not a gap, provided the integration test is maintained.

4. **Contradictions (resolved above)**:
   - H3 verdict: unanimous CLOSED at `addea0fce`.
   - F-E1 severity: unanimous HIGH; axis-scoped (backend clean, human-gate blocked).
   - G-2 classification: dormant per [2.5] (no `goal:complete`), but stale doc citation.
   - "Live progress": real writer, unproven live advancement (M-H2-LIVE).

---

## Confirmed PASS Verdicts (do NOT re-litigate in cycle 5)

These surfaces are backend-real, survived adversarial re-verification across 3–4 cycles, and should not be re-opened:

- **H1 (Streaming seed)** — `services/platform/src/db/seed-e2e.ts:541-576` + `seed-e2e.test.ts:85`. Four-cycle consensus. Real PATH-A fix. Non-regressed (`git diff fc24bf68..addea0fce` empty).
- **H2 (research-iteration writer)** — `services/platform/src/research/progress.ts:55-153` + 3 production callers. Four-cycle consensus. Real PATH-A fix. Non-regressed. (Live-advancement semantic flagged separately as M-H2-LIVE.)
- **H3 (SSE reconnect exactly-once)** — re-verified **this cycle** at HEAD `addea0fce`. `createResumableSseController` production extraction + `redhat-fix-04-production-hook-reconnect.test.ts` + production-code mutation kill (assemblyRef-reset + header-drop, exit 1 each, independent worktree probe at `addea0fce`).
- **S-REACTIVE-03 (cross-surface p95)** — strongest surface from cycle 1; `services/platform/src/mcp/executor.ts` untouched by any REDHAT-FIX commit (`git diff fc24bf68..addea0fce` empty).
- **SSE backend contract** — `services/platform/src/http/chat-runs.ts` `seq > afterSeq` replay + `finalizeChatRun` durable row; non-regressed (`git diff fc24bf68..addea0fce` empty).
- **Pure-function `buildSseResumeHeaders`** — Mutant A (header-drop) killed via direct import; retained as necessary-but-not-sufficient alongside the production-hook coverage.
- **M2 (poll greenwash)** — `disableStatusPollFallback` wired (`use-resumable-sse-stream.ts:435,505`), exercised under test (`test:298`).
- **G-3 (REDHAT-FIX-04 TC-5 cold-checkout evidence)** — **CLOSED this cycle** by REDHAT-FIX-07 (`5fe64018`).

---

## AC Verdict TABLE (cross-reviewer consolidation)

| Task | AC | Cycle-3 | Cycle-4 | Basis |
|------|----|---------|---------|-------|
| **S-REACTIVE-01** | AC-1 streams token-by-token | PASS | **PASS** | non-regressed; SSE contract intact |
| | AC-2 [PRIMARY] mid-stream reconnect, 0 dup tokens | PASS | **PASS** | H3 re-verified at `addea0fce` — both mutants KILLED |
| | AC-3 exactly one final message matching Zero row | PASS | **PASS** | Maestro `chat-assistant-bubble-count-1` COMPLETED; `ChatThread.tsx:462` value-bearing testID intact |
| | AC-4 Last-Event-ID gap-fill | PASS | **PASS** | production wiring via extracted controller unchanged |
| | AC-5 cancel finalizes | PASS | **PASS** | carried |
| **S-REACTIVE-02** | AC-1 [PRIMARY] progress bar advances live to 3/5 | PARTIAL | **PARTIAL** (unchanged) | Writer real + non-regressed (H2); live semantic UNPROVEN (M-H2-LIVE — harness-driven gate; NO_ORACLE for production writer) |
| | AC-2 zero_pub binding | PASS | **PASS** | non-regressed |
| | AC-3 mobile compliance | PASS | **PASS** | unchanged |
| **S-REACTIVE-03** | AC-1 [PRIMARY] MCP doc update within 5s | PASS | **PASS** | strongest surface; non-regressed (`executor.ts` untouched) |
| | AC-2 p95 over ≥5 iterations | PASS | **PASS** | L1 self-attestation nuance persists (Low) |
| **S-REACTIVE-04** | AC-1 [PRIMARY] fleet-down degraded msg, no hang | PASS | **PASS** | M1 ergonomics caveat (L-M1 open) |
| | AC-2 inferred from failure envelope | PASS | **PASS** | unchanged |
| | AC-3 [PRIMARY] recovery when fleet returns | PARTIAL | **PARTIAL** (unchanged) | M3 + M6 compound (duplicate testIDs; oracle strengthened but flake risk) |
| **S-REACTIVE-05** | AC-1 [PRIMARY] review artifact | PARTIAL | **PARTIAL** | L-S05-STALE: annotations cite now-closed reasons; actively misleading |
| | AC-2 [PRIMARY] streaming reconnect re-verified | PASS | **PASS** | cycle-4 production-code mutation evidence at `addea0fce` |
| **REDHAT-FIX-01** | AC-1..AC-4 | PASS | **PASS** | H1 closed (4-cycle consensus) |
| **REDHAT-FIX-02** | AC-1 production writer PATH-A | PASS | **PASS** | H2 closed; non-regressed |
| | AC-2 Zero binding non-regression | PASS | **PASS** | unchanged |
| | AC-3 source audit writer | PASS | **PASS** | 3 greppable production UPDATE call sites |
| | AC-4 fail-closed | PROBE_BLOCKED | **PROBE_BLOCKED** | itLive skipped (PLATFORM_IT); not re-run this cycle |
| | TC-5 path.json exists | PASS | **PASS** | REDHAT-FIX-06 restored at `.tmp/sprint-25/` |
| **REDHAT-FIX-03** | AC-1 reconnect sends Last-Event-ID:3 | PASS (non-authoritative) | **PASS** (superseded) | superseded by REDHAT-FIX-04 production coverage |
| | AC-2 [PRIMARY] mutants killed | PASS (superseded) | **PASS** (superseded) | REDHAT-FIX-03 harness killed local variable; REDHAT-FIX-04 closes the production mutant |
| | AC-3 Maestro numeric oracles | PASS | **PASS** | genuine improvement; retained |
| | AC-4 poll cannot greenwash | PASS | **PASS** | `disableStatusPollFallback` exercised |
| | AC-5 durable row diff==0 | PROBE_BLOCKED | **PROBE_BLOCKED** | itLive skipped |
| **REDHAT-FIX-04** | AC-1 production reconnect Last-Event-ID==3 | PASS | **PASS** | cycle-4 standing-seat probe: correct exit 0; `reconnectLastEventId==='3'`, `tokenCount===5`, `resumeTransport==='sse'` |
| | AC-2 [PRIMARY] production mutant killed | PASS | **PASS** | cycle-4 probe at `addea0fce`: assemblyRef-reset exit 1 + header-drop exit 1 |
| | AC-3 pure + fix-03 non-regression | PASS | **PASS** | both suites green (27 passed + 2 passed) |
| | AC-4 poll cannot greenwash | PASS | **PASS** | `disableStatusPollFallback=true` wired + asserted |
| | AC-5 TDD evidence | FAIL (cycle 3) | **PASS** (↑) | G-3 CLOSED — REDHAT-FIX-07 restored at `.tmp/sprint-25/` |
| | TC-5 path.json/mutation.log at `.tmp/sprint-25/` | FAIL (cycle 3) | **PASS** (↑) | TC verify exit 0 on cold checkout |
| **REDHAT-FIX-05** | fresh gate-results.json | PASS (cycle 3) | **⚠️ REGRESSED** | `gate-results.json` MISSING (working-tree deletion); `gate-results.prev.json` only; dormant per [2.5] but stale doc |
| **REDHAT-FIX-06** | fix-01/02 path.json + RED logs | PASS | **PASS** | restored at `.tmp/sprint-25/`; non-regressed |
| | fix-04 evidence (scope gap) | FAIL (cycle 3) | **PASS** (↑) | REDHAT-FIX-07 closed the recurrence |
| **REDHAT-FIX-07** | AC-1 [PRIMARY] TC-5 shell exits 0 on primary | n/a | **PASS** | `test -f …red.log && …mutation.log && …path.json && jq -e '.path=="A"'` → exit 0 |
| | AC-2 non-empty + content integrity | n/a | **PASS** | all 3 files non-empty; mutation.log contains production-assembly-reset kill + correct exit=0; durable copies byte-identical to primary |
| | AC-3 durable `.gate-evidence/tdd/` copies | n/a | **PASS** | committed under sprint `.gate-evidence/tdd/redhat-fix-04-*` |
| | AC-4 product freeze + procedure audit | n/a | **PASS** | frozen product files untouched; preferred worktree-copy procedure followed |

**Completion Gate**: F-E1 (HIGH executability) + G-2-REGRESSED → **needs-revision**. One PATH/install fix + gate re-run (or `git checkout HEAD -- gate-results.json .gate-evidence/step-1-seed.log`) closes both. All other behavioral ACs are PASS or PROBE_BLOCKED; all cycle-3 confirmed-PASS surfaces hold; advisory findings (M-H2-LIVE / M3+M6 / M5 / L-S05-STALE / F-ORACLE-MISMATCH) remain non-blocking but should land before formal sprint sign-off.

---

## Agent Reports (Summary)

- **mastra-reviewer**: **APPROVE — narrow (backend axis).** Backend non-regression DEFINITIVE (`git diff fc24bf68..addea0fce` empty for all 6 frozen files). REDHAT-FIX-07 scope CLEAN (`git show --stat 5fe64018` — 6 evidence files, zero product/test/doc code). G-3 closure verified (TC-5 exit 0 on primary; mutation.log content sound, `base_head=addea0fce`). M-H2-LIVE OPEN/strengthened (5 overclaim sites un-footnoted; production comment at `mission-research.ts:450` actively defends overclaim; gate log harness-driven with no timestamps; standing-seat NO_ORACLE concession for production writer). **F-E1 independently verified** (primary `holo` is a bash stub; in-flight `s25-ht-20260725T224451Z` failure traced). L-M7 / L-L5 / L-L8 carried (all open, file:line confirmed). S-REACTIVE-02 AC-1 PARTIAL. Backend-axis recommendation: **eligible for unqualified close**; F-E1 is a tooling/install defect (not backend code) that blocks the human-gate close.

- **react-native-ui-reviewer**: **NEEDS_FIXES — single new HIGH (F-E1) plus 3 carried advisories.** G-3 CLOSED (TC-5 exit 0; durable copies byte-identical; `path=="A"`). H3 stands non-regressed (`git diff fc24bf68..addea0fce -- hooks/use-resumable-sse-stream.ts app/zero/ 'app/(drawer)/chat/' components/chat/` EMPTY). Maestro numeric testIDs (`chat-stream-token-count-at-least-3` at `ChatThread.tsx:441`, `chat-stream-last-seq-at-least-3` at `:409`, `chat-assistant-bubble-count-1` at `:462`) all intact. F-E1 NEW: cold-clone reproducer fails (`/Users/inference1/.local/bin/holo` is a 38-line stub implementing only `verify:no-convex-client`); cycle-3 silently used worktree-binary env override (`step-2-4-reconnect.log:1`). M3+M6 OPEN (4 duplicate testID sites confirmed). M5 OPEN (154 typecheck errors; new TS2322 from REDHAT-FIX-04's test file still present). L-S05-STALE OPEN (annotations cite closed reasons).

- **test-quality-reviewer (standing seat)**: **NEEDS_FIXES — narrow.** H3 closure **HOLDS** at HEAD `addea0fce` — both load-bearing mutants KILLED in independent re-probe at `/var/folders/hw/.../T/opencode/redhat-cycle4-probe` (Mutant A: assemblyRef-reset wipe at `:740`+`:765` → exit 1, `AssertionError: expected null to be '3'`; Mutant B: header-drop at `:323` → exit 1; restoration exit 0; probe worktree removed; primary clean). REDHAT-FIX-07 AC-1..AC-4 PASS (TC-5 cold-checkout exit 0; durable copies committed; frozen product files untouched). **G-2 REGRESSED** (canonical `gate-results.json` DELETED in working tree; `step-1-seed.log` overwritten with F-E1 failure; only `gate-results.prev.json` remains; dormant per [2.5] but stale doc). **F-ORACLE-MISMATCH** found: gate step-2 documents "Summarize the seeded doc" but Maestro flow sends "Write a detailed multi-sentence answer about the number five..." (`step-2-4-reconnect.log:111`). S-REACTIVE-02 AC-1 NO_ORACLE conceded (test file does static regex + its own `psql` poke, would not detect production-writer deletion). M3 duplicate confirmed. M5 OPEN (154 errors). L-M1: `kill_port_listeners` is a real shell function but no `holo stack stop fleet` verb.

---

## Metadata

- **Agents**:
  - `mastra-reviewer` — backend/contract/engine lens (Glob, Grep, Read, Bash)
  - `react-native-ui-reviewer` — RN client/reactivity/a11y lens (Glob, Grep, Read, Bash)
  - `test-quality-reviewer` — standing seat, IMPLEMENTED mode, production-code mutation probe in isolated worktree (full tool access)
- **Driver pre-check findings merged (source: `gate-pre-check`)**:
  - **F-E1 (HIGH)** — gate step 1 (`holo seed:e2e --reset`) not executable as documented on primary cold checkout (exit 127); fresh attempt at `s25-ht-20260725T224451Z` died at step 1. Skill [2.5] EXECUTABILITY auto-finding; independently corroborated by all 3 reviewers.
  - **F-O1 (= M-H2-LIVE elevated)** — gate step 5 oracle ("as the workflow reaches iteration 3/5") does not resolve in production source — `:8765` test-harness server has zero production references; engine pacing unproven. Skill [2.5] ORACLE PROVABILITY auto-finding; reinforced by mastra-reviewer + test-quality-reviewer.
  - **F-EXEC-7 (= L-M1 carried)** — gate step 7 ("Stop the local fleet") has no human-executable `holo` verb; `kill_port_listeners` shell function is real but not canonical CLI.
  - **EVIDENCE clause (dormant)** — sprint has NOT claimed `goal:complete` (no `sprint-goal-state.json`); the missing `gate-results.json` is NOT a lifecycle blocker per [2.5], but the stale `GATE-RESULTS.md` citation is surfaced as G-2-REGRESSED (process concern, unanimous agent corroboration).
- **ANTI-STUB-REVIEW.md**: NOT present in this project (`brain/docs/ANTI-STUB-REVIEW.md` absent); reviewers applied the embedded adversarial methodology (AC enumeration, gate-provability, stub-pattern grep recipes) from first principles per the skill's ORACLE PROVABILITY clause.
- **Confidence Framework**: HIGH (3+ agents, or mutation-backed, or independently verified at file:line); MEDIUM (2 agents or single strong source); LOW (single agent). Mutation-backed findings carry an extra evidentiary tier and override self-annotation trust.
- **Report Generated**: 2026-07-25T22:54:36Z
- **Duration**: ~7m (3 reviewers in parallel; ~3m driver pre-check + ~4m probe dispatch + consolidation)
- **Tree state at exit**: probe worktree removed (`git worktree list` clean); primary checkout has pre-existing dirty files (`.spec/orchestrate/*.json`, `.env.bak*`) plus the cycle-4 working-tree churn (`gate-results.json` deleted, `step-1-seed.log` overwritten, `s25-ht-20260725T224451Z/` added) — all left as-is for the implementer to disposition. Production `hooks/use-resumable-sse-stream.ts` diff empty (mutants restored). One incidental churn: `.tmp/sprint-25/redhat-fix-04-production-mutation.log` self-regenerated by the standing seat's verify run (content-equivalent kill evidence, only timestamp/HEAD bumped) — orchestrator decision whether to commit; content is byte-equivalent in semantic content.
- **Next Steps**:
  1. **Fix F-E1 (the only must-close blocker)**: replace `/Users/inference1/.local/bin/holo` with the worktree dispatcher (one-line symlink), OR update `SPRINT.md:40` + `GATE-RESULTS.md` step-1 + `gate-results.json` step-1 text to `./bin/holo seed:e2e --reset` (or `pnpm seed:e2e`) with a one-line footnote explaining the PATH stub's scope.
  2. **Restore or re-run the gate (G-2-REGRESSED)**: `git checkout HEAD -- …/gate-results.json …/.gate-evidence/step-1-seed.log` to restore cycle-3 evidence, OR re-run the full gate end-to-end with `./bin/holo` post-F-E1.
  3. **Footnote M-H2-LIVE**: add the one-line footnote to the 5 overclaim sites; correct the production comment at `mission-research.ts:450`. OR add the end-to-end integration test exercising the production writer.
  4. **Fix M5 regression**: cast `NodeXMLHttpRequest` to satisfy the DOM interface in REDHAT-FIX-04's test (or narrow S-REACTIVE-01 TC-6/TC-7 to reactive source files).
  5. **Correct F-ORACLE-MISMATCH**: update gate step-2 documentation to match the actual Maestro input text, OR update the flow to send the documented text.
  6. **Refresh L-S05-STALE**: update S-REACTIVE-05 AC-1/AC-2 annotations to PASS (or PARTIAL-with-only-M3).
  7. **(Optional, non-blocking)** Deduplicate degraded-banner testIDs (M3+M6) to lift S-REACTIVE-04 AC-3 PARTIAL → PASS.
  8. **(Optional, non-blocking)** Strengthen the Maestro reconnect oracle (M-MAESTRO-RECONNECT) to assert a `last-seq`/`token-count` delta across airplane mode.

**Cycle-4 bottom line**: The cycle-3 blocker (G-3) is **genuinely closed** — REDHAT-FIX-07 delivered a clean evidence-only fix. The sprint's PRIMARY behavioral claim (zero-dup-token reconnect) **holds** at HEAD `addea0fce`, re-verified by an independent production-code mutation probe. **A new executability blocker (F-E1) takes G-3's place**: the human gate step 1 cannot be re-run on a cold clone as documented, and the canonical `gate-results.json` is currently missing from the working tree. One PATH/install fix + gate re-run (or `git checkout` to restore the cycle-3 evidence) closes it. The sprint is one tooling pass away from unqualified close.
