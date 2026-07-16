# Red-Hat Review Report (Fresh Independent — Post H1–H5)

**Report Date**: 2026-07-16T04:59:57Z  
**Target**: Sprint 8 — Role Router, Local-First and Degraded Modes  
**Path**: `.spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes/`  
**Codebase**: `integration/orch-s08-role-router-20260715T-current` @ `ff9cf348ce101c490ec9055325fa7d4a6fd0d4a1`  
**Reviewed By**: mastra-reviewer, security-reviewer, code-reviewer (+ gate-pre-check + orchestrator structural re-verify)  
**Mode**: Independent adversarial re-review after completed REDHAT-FIX H1–H5 — **no product code modified**  
**Not a substitute**: Prior cycle2 CLEAN report (`red-hat-2026-07-16T04-51-43Z-sprint08-cycle2.md`) and `sprint-goal-state.json` were **not** treated as proof. Every prior HIGH was re-checked against merged source, tests, evidence, and human-gate logs.

---

## Explicit Severity Verdict

# **CLEAN**

| Class | Count | Blocks completion? |
|-------|------:|--------------------|
| CRITICAL | 0 | — |
| **HIGH** | **0** (prior H1–H5 **CLOSED**; no new consensus HIGH) | **NO** |
| MEDIUM | 5 residual | Advisory |
| LOW | 5 residual | Advisory |

**Severity gate:** any CRITICAL or HIGH finding blocks completion; MEDIUM/LOW are advisory.

**Bottom line:** Fresh independent review re-verifies that REDHAT-FIX H1–H5 closed the five prior blocking findings on current product code. Live `PLATFORM_IT=1` re-runs of H1/H3/H4 choke suites, gate honesty inventory, structural compat agent, and never-cloud suites pass at HEAD. Human gate cycle2 logs remain honest and executable. Residual risks (estimate-vs-actual spend gaming, fetch-only capture, ≥1 structural path only, head-pin hygiene) are advisory and do **not** reopen H1–H5.

**Agent panel split:** mastra-reviewer **CLEAN** · code-reviewer **CLEAN** · security-reviewer **BLOCKED** on a *new* estimate-vs-actual residual (not prior H1–H5). Consolidation: residual scored **MEDIUM** (single-agent HIGH elevation; outside original H5 AC list; `maxOutputTokens: 32` bounds output; spend still metered). See “Agent Contradictions.”

---

## Executive Summary

Sprint 08 post-remediation delivers a real, non-stubbed local-first inference control plane: shared never-cloud choke (`assertEscapeNotDegraded`) on both escape entry points, durable Postgres `degraded_mode` for multi-process refuse, hard budget pre-check with `SELECT … FOR UPDATE` reserve + fail-closed post-escape ledger write, ≥1 production `resolveModel`→`createFleetChatModel` path on the compat agent, and an honest human gate rewritten to `infer:call` + labeled PLATFORM_IT suites (no mission greenwash).

This review re-proved those controls from source + live tests + cycle2 human logs rather than accepting cycle2’s CLEAN stamp. Prior HIGH H1–H5 are **CLOSED**. No new consensus HIGH remains.

---

## Gate Pre-Check (skill-emitted, deterministic)

### Executability (SPRINT.md Human Test Deliverable steps)

| Step | Documented entry point | Exists? | Finding |
|------|------------------------|---------|---------|
| 1 | **[CLI]** `holo infer:call --role divergent --json` | **YES** — `holo.ts` `case 'infer:call'` | OK |
| 2 | **[SUITE]** `PLATFORM_IT=1 vitest` zero-cloud suite pair | **YES** — labeled suite; files present | OK |
| 3 | **[CLI]** divergent + convergent `infer:call` | **YES** | OK |
| 4 | **[CLI]** `infer:call --escape --cost 999` | **YES** | OK |
| 5 | **[CLI]** `infer:call --escape --highStakes` within budget | **YES** | OK |
| 6 | **[SUITE]** degraded transition + resume vitest | **YES** — labeled suite; not mission fiction | OK |
| 7 | **[CLI]** `holo verify:no-provider-refs` | **YES** — `case 'verify:no-provider-refs'` | OK |

**No HIGH auto-findings** for missing entry points. Mission CLI is explicitly out of scope (Sprint 15) and not required as an executable step.

### Evidence (sprint claims complete)

| Artifact | Status |
|----------|--------|
| `sprint-goal-state.json` | `met: true`, tasks 10/10, gate/e2e/human_test pass, `redhat_fixes_landed: [H1..H5]` |
| `gate-results.json` | `verdict: pass`, `steps_executed == steps_passed == steps_total == 7` |
| `gate-verification.json` | `verdict: PASS` |
| `e2e-verification.json` | `PASS`, 20 files / 78 tests |
| Freshness vs product code | Gate/e2e head `c4ea92f…` (last product merge for H1–H5). Commits after that to tip `ff9cf34` are **docs only** (gate evidence, cycle2 report, goal-state pins). Product claims remain valid at tip. |
| Honesty | `mission_cli_documented: false`, `suite_steps_labeled: true`; inventory suite green |

**Auto-findings (source: gate-pre-check):** none HIGH. Residual head-pin inconsistency noted under MEDIUM process findings (not a product dual-path / greenwash reopen).

---

## Prior HIGH Status (independent re-verify)

| ID | Status | Consensus | Independent proof at this review |
|----|--------|-----------|----------------------------------|
| **H1** Escape dual-path | **CLOSED** | 3/3 | Shared `assertEscapeNotDegraded` in `escape-degraded-guard.ts:121-128`; called from `resolve-model.ts:261-262` and `budget-ledger.ts:708` **before** Anthropic; CLI only `runBudgetedEscape` (`holo.ts:1296-1310`); only `createAnthropic` at `budget-ledger.ts:733`. Live: `infer-escape-degraded-choke` 6/6 pass. Evidence: `redhat-fix-h1-AC-1-…json` refuse + `anthropicCount:0`. |
| **H2** Gate greenwash | **CLOSED** | 3/3 | SPRINT steps 1–7 = CLI / labeled SUITE only; no `holo mission` as executable step; `HUMAN-GATE.md` forbids greenwash; inventory 5/5 pass (cycle2 log + this review re-run). Gate steps use `surface: cli|suite`. Step logs real (fleet resolve, over-budget block, live Anthropic POST on step5). |
| **H3** Structural local-first | **CLOSED** | 3/3 | `compat/cells/agent.ts:96-120` `resolveModel` → `createFleetChatModel`; production caller count ≥1 outside `resolve-model.ts`. Live: `infer-structural-compat-agent` 5/5 pass (fleetHits, anthropicCount:0). Evidence: `redhat-fix-h3-green.json`. |
| **H4** Process-only degraded | **CLOSED** | 3/3 | Durable `SELECT degraded_state FROM degraded_mode` (`escape-degraded-guard.ts:85-93`); process OR DB; fail-closed on missing/error. Live: `infer-degraded-durable-escape` 5/5 pass — processFlag false + DB degraded → refuse + anthropicCount:0. |
| **H5** Soft/gameable budget | **CLOSED** (stated ACs) | 3/3 on ACs | Reject `estimatedCostUsd <= 0` (`budget-ledger.ts:511-524`; CLI `holo.ts:1241-1258`); `SELECT … FOR UPDATE` + reserve (`491-577`); shared `resolveEffectiveCeiling`; fail-closed `BudgetLedgerWriteError` after generate (`767-780`). Live: AC-1/2/3/6 pass this session; AC-4/5 require Anthropic key (absent in this shell) but cycle2 step5 + `redhat-fix-h5-AC-4/AC-5` evidence show live path. |

---

## Live re-test results (this review session)

| Suite | Result | Notes |
|-------|--------|-------|
| `infer-escape-degraded-choke.test.ts` | **PASS** (6) | H1 process-degraded never-cloud |
| `infer-degraded-durable-escape.test.ts` | **PASS** (5) | H4 DB-degraded process-flag-false |
| `infer-structural-compat-agent.test.ts` | **PASS** (5) | H3 structural wiring |
| `infer-gate-honesty-inventory.test.ts` | **PASS** (5) | H2 honesty |
| `infer-budget-hard-precheck.test.ts` AC-1/2/3/6 | **PASS** | H5 non-Anthropic ACs |
| `infer-budget-hard-precheck.test.ts` AC-4/5 | **ENV FAIL** (not code fail) | `ANTHROPIC_API_KEY` unset in this shell; hard-fail by design. Prior cycle2 human step5 + evidence prove live. |
| `infer-router-zero-cloud` + `infer-red-degraded-no-cloud` + `infer-degraded-no-cloud` | **PASS** (14) | Default + degraded never-cloud |

Human gate cycle2 artifact spot-check:

| Step | Log fidelity |
|------|----------------|
| 1 | fleet `:4545`, `provider:fleet`, `anthropicCount:0` |
| 2 | 13 zero-cloud tests pass |
| 3 | divergent 35B-A3B / convergent 27B model revisions |
| 4 | `BUDGET_EXCEEDED`, `anthropicCount:0` |
| 5 | real Anthropic POST `api.anthropic.com/v1/messages`, ledgerId, tokens/cost |
| 6 | degraded transition + auto-resume suite pass |
| 7 | zero banned factories / direct-provider refs |

---

## HIGH Confidence Findings (3+ Agents Agree)

**None open.** Prior H1–H5 all **CLOSED** with 3-agent agreement on closure.

---

## MEDIUM Confidence Findings (2 Agents Agree or consolidated residual)

- [ ] **M1 — Estimate-only hard gate; micro-positive estimate can under-reserve actual spend** | Severity: **MEDIUM** (security elevated HIGH — see debates)  
      Agents: security-reviewer (HIGH), consolidated MEDIUM by panel  
      Evidence: `runBudgetedEscape` reserves caller `estimatedCostUsd` then bills actual usage (`budget-ledger.ts:711-749`) with `maxOutputTokens: 32` but uncapped input prompt; CLI accepts any `--cost > 0` (`holo.ts:1233-1258`).  
      Scope note: **Outside original H5 AC list** (≤0 reject, FOR UPDATE reserve, ceiling source, fail-closed ledger — all PASS). Residual budget integrity hardening, not dual-path never-cloud.  
      Fix direction: floor estimate from prompt tokens / min cost; true-up after usage; or reject oversized escape prompts.

- [ ] **M2 — `resolveModel(allowEscape)` is soft pre-check without transactional reserve / forced logEscape**  
      Agents: security-reviewer, code-reviewer, mastra-reviewer  
      Evidence: `resolve-model.ts:281-288` `assertBudget` without `reserve:true`; library caller can build Anthropic client after resolve. CLI production path uses `runBudgetedEscape` only (safe).  
      Impact: budget metering dual-path for **library** importers — not never-cloud (degraded choke still applies).

- [ ] **M3 — Network capture is `globalThis.fetch` only**  
      Agents: security-reviewer, mastra-reviewer  
      Evidence: `infer-network-capture.ts`, CLI wrap in `holo.ts:1262-1286`. Adequate for current AI-SDK Bun path (step5 captured real POST); not transport-universal.

- [ ] **M4 — Structural local-first still ≥1 path (compat agent), not universal enforcement**  
      Agents: code-reviewer, mastra-reviewer  
      Evidence: single production `createFleetChatModel` caller (`agent.ts:106`). Meets H3 AC; residual CAP-INF-01 “every call site” remains later-sprint work.

- [ ] **M5 — Head / evidence pin hygiene**  
      Agents: mastra-reviewer, code-reviewer  
      Evidence: gate/e2e head `c4ea92f` vs goal-state `fe68b62` vs tip `ff9cf34` (docs-only delta). H5 verification summary metadata claims `hasAnthropicKey:false` while AC-4/5 evidence show live Anthropic. Process hygiene only — does not invalidate product remediation at tip.

---

## LOW Confidence Findings (Single Agent / Hygiene)

- [ ] **L1** — `skipDurableRead` option exists (`escape-degraded-guard.ts:39,113`) with no production callers — future footgun.  
- [ ] **L2** — H4 “multi-process” proof is same-process process-flag-false + DB seed (real durable SELECT); no CLI child with **only** DB degraded. Functional CLOSE; proof label slightly overclaims.  
- [ ] **L3** — `getProcessSpentUsd()` always 0 (legacy no-op; Postgres is SoT).  
- [ ] **L4** — SPRINT frontmatter still `status: In Progress` while goal-state `met:true`; task DONE WHEN checkboxes still `[ ]`.  
- [ ] **L5** — `verify:no-provider-refs` still bans only Flash/Pro/Ultra factories; `brain/docs/ANTI-STUB-REVIEW.md` absent in worktree.

---

## Agent Contradictions & Debates

| Topic | Agent A | Agent B | Assessment |
|-------|---------|---------|------------|
| Overall verdict | mastra + code-reviewer: **CLEAN** | security: **BLOCKED** (new HIGH-1) | **CLEAN** for completion of H1–H5 remediation. Security residual is real but (a) not prior H1–H5 reopen, (b) not 3-agent consensus HIGH, (c) output capped at 32 tokens, (d) actual spend still ledger-metered. Track as **M1**. |
| H5 closed? | All: stated ACs **CLOSED** | security: residual actual≫estimate | Prior H5 **CLOSED**; new residual M1. |
| H4 multi-process proof strength | code: same-process simulation | mastra: functional path correct | **CLOSED** on code path; L2 proof-label caveat. |
| Library stub quality | All: **not stubbed** | — | Agreement: real Postgres + real network capture. |

---

## AC Verdict Summary (REDHAT-FIX tasks)

| Task | AC-1 | AC-2 | AC-3 | AC-4 | AC-5 | Overall |
|------|------|------|------|------|------|---------|
| REDHAT-FIX-H1 | ✅ | ✅ | ✅ | ✅ | ✅ | **PASS** |
| REDHAT-FIX-H2 | ✅ | ✅ | ✅ | ✅ | ✅ | **PASS** |
| REDHAT-FIX-H3 | ✅ | ✅ | ✅ | ✅ | ✅ | **PASS** |
| REDHAT-FIX-H4 | ✅ | ✅ | ✅ | ✅ | ✅ | **PASS** |
| REDHAT-FIX-H5 | ✅ | ✅ | ✅ | ✅* | ✅* | **PASS** (*AC-4/5 live evidence from cycle2 + artifacts; this shell lacked Anthropic key for re-run) |

---

## Stub Findings

| Check | Result |
|-------|--------|
| Fake-success / TODO stubs on choke paths | **None** |
| Mocked generateText / stub Postgres for never-cloud proofs | **None** on H1–H5 suites |
| Hard-coded `anthropicCount:0` without capture | Tests use `installNetworkCapture`; refuse evidence shows empty `networkRows` |
| `__testOnly_forceLogEscapeFailure` | Test-only fault injection for AC-4 — required, not production stub |
| Dead `createFleetChatModel` | **Closed** — production caller in `agent.ts:106` |

---

## Recommendations by Category

1. **Gaps (advisory)**  
   - Optional follow-up: min honest estimate / prompt-size floor for escape (M1).  
   - Force `runBudgetedEscape` (or reserve+logEscape) for any library escape generate (M2).  
   - One true CLI multi-process DB-only degraded spawn (L2).

2. **Risks**  
   - Fetch-only capture → document limit; optional broader HTTP instrumentation later (M3).  
   - Structural local-first remains one path — keep later sprints wiring all reasoning call sites (M4).

3. **Assumptions**  
   - Do not assume “hard ceiling” means actual spend cannot exceed a dishonest micro-estimate without further work (M1).  
   - Do not assume all Mastra agents use `createFleetChatModel` — only the wired compat path is proven.

4. **Process**  
   - Re-pin gate/e2e/goal heads to a single tip after freeze (M5).  
   - Align SPRINT status frontmatter and task checkbox hygiene with `met:true` (L4).

---

## Agent Reports (Summary)

- **mastra-reviewer**: H1–H5 CLOSED; CLEAN; residuals M1-ish only as hygiene (head drift, proof labels).  
- **security-reviewer**: H1/H4 CLOSED; H5 ACs CLOSED; **new HIGH** estimate-vs-actual → would BLOCK; MED library soft pre-check + fetch capture.  
- **code-reviewer**: H1–H5 CLOSED; CLEAN; residuals MEDIUM process/proof/structural thinness.  
- **gate-pre-check**: 7/7 steps executable; complete claim backed by fresh cycle2 pass; no HIGH auto-findings.

---

## Metadata

- **Agents**: mastra-reviewer, security-reviewer, code-reviewer (read-only); orchestrator structural + live PLATFORM_IT re-verify  
- **Confidence Framework**: HIGH (3+ agents), MEDIUM (2 agents or consolidated residual), LOW (1 agent / hygiene)  
- **Report Generated**: 2026-07-16T04:59:57Z  
- **Product HEAD**: `ff9cf348ce101c490ec9055325fa7d4a6fd0d4a1`  
- **Product merge for H1–H5 + honest re-gate**: `c4ea92fc606e5c3745f51e57bbc8b48d0ead2b7e` (docs-only after)  
- **Mode**: no product code modified  
- **Next Steps**: **Approve / converge** — no REDHAT-FIX reopen required for H1–H5. Optionally schedule advisory budget true-up (M1) as a non-blocking follow-up.

---

## Explicit Verdict Line

```
VERDICT: CLEAN
PRIOR_HIGH_H1_H5: CLOSED
NEW_CONSENSUS_HIGH: 0
BLOCKS_COMPLETION: NO
```
