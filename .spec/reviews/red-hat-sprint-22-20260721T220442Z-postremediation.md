# Red-Hat Review Report — Sprint 22 Post-Remediation (REDHAT-FIX-1..5)

**Report Date**: 2026-07-21T22:04:42Z
**Target**: Sprint 22 — All Agentic Pipelines as Templates/Agents (`.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents`)
**Reviewed SHA**: `5d424120976d3546ef4f68338878f2c554779b49` (main HEAD; working-tree drift limited to gate-evidence JSON/log files — no source drift; `git status` shows `M` on `step5.log`, `gate-results.json`, `e2e-verification.json`, `sprint-goal-state.json` only)
**Reviewed By**: `mastra-reviewer` (FIX-1/4/5), `mcp-reviewer` (FIX-2/3 + gate state), orchestrator (independent source audit + live test execution) + deterministic gate pre-check (skill-emitted)
**Prior Report**: `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md` (verdict BLOCK: C-1, C-2, H-1, H-2, H-3)
**Verdict**: ⚠️ **CONDITIONAL PASS — all five prior CRITICAL/HIGH findings are verifiably RESOLVED in code and by live test execution, but the human-testing gate attestation is STALE (deterministic HIGH auto-finding): the gate was never re-run after the remediations it was explicitly deferred for. Re-run the gate fresh, commit the updated evidence, and repair the contradictory goal-state bookkeeping before this sprint is marked verified-complete.**

## Executive Summary

Every prior CRITICAL/HIGH issue from the 18:30Z report was re-verified from source and by executing the remediation suites against real Postgres + the real fleet on the reviewed SHA. The fixes are genuine, not greenwashed: research retrieve really calls `rrfHybridSearch` and fails closed on empty corpus / embed-down (C-1); all six CLI default idempotency keys are pure functions of template+params with entropy only behind `--fresh` (C-2); `holo infer:trace <id>` is a real dispatched command sourcing durable `inference_telemetry`, and gate step-6 evidence now shows the real argv (H-1); bare standing subscriptions complete unattended via PATH-A search or an honest below-floor provisional with `researchAdmitted:false` surfaced, and the step-5 flake is diagnosed (H-2); a behavioral GREEN suite with concrete field oracles and a real fleet-DOWN fail-closed test now exist, and the global `unhandledRejection` swallow is env-gated (H-3). All five suites pass (`20/20` tests across five files, serial execution; typecheck clean). **However**, `gate-results.json` (cycle 17:58:33Z) and `sprint-goal-state.json` (`met:true`, 17:59:18Z) predate every REDHAT-FIX source commit (21:05–21:46Z) — the "gate re-attestation post all REDHAT-FIX-* remediations" that all five task files deferred to never happened, and the goal-state's redhat section still attests "no additional HIGH findings requiring REDHAT-FIX", contradicting the five completed remediation tasks.

## Prior-Finding Resolution Verdicts

| Prior finding | Severity (prior) | Status | Evidence |
|---|---|---|---|
| **C-1** — gather stages scaffold; CAP-EMB-01 never wired | CRITICAL | ✅ **RESOLVED (PATH-A)** | `runtime.ts:727-762` — unseeded `builtin.research-retrieve@1` calls `rrfHybridSearch`, returns `retrievalMethod:'rrf'`; `runtime.ts:717-720,732-735,739-742,751-754` — fail-closed `MISSION_RETRIEVAL_UNAVAILABLE` / `MISSION_RETRIEVE_EMPTY`; `mapRrfHitsToEvidenceGateInput` assigns honest below-floor grade 2 / entailment 0.5 (`runtime.ts:359-362`) — no always-admissible fabrication; suite `redhat-fix-1-cap-emb-retrieve.test.ts` 4/4 PASS (live, seeded MCP corpus) |
| **C-2** — `Date.now()` in default idempotency keys | CRITICAL | ✅ **RESOLVED** | `cli/mission-idempotency-key.ts:54-97` — pure `defaultMissionIdempotencyKey` (override > base > `--fresh` suffix); six base formulas match the STRICTLY table exactly; all six `holo.ts` call sites (3975, 4021, 4070, 4120, 4157, 4234) pass correct params; `rg 'Date.now\(\)' holo.ts` → only L2059 (unrelated `infer:degraded` instrumentation); suite `redhat-fix-2-cli-idempotency-defaults.test.ts` 4/4 PASS (double-invoke same runId, count=1, `--fresh` distinct) |
| **H-1 / GATE-1** — `holo infer:trace` fictional; step 6 substitute | HIGH | ✅ **RESOLVED** | `holo.ts:233` (help) + `holo.ts:1947-1997` (`case 'infer:trace'`); `inference/infer-trace.ts:98-151` sources durable `inference_telemetry` via `listInferenceTelemetry`; unknown id → exit≠0 `INFER_TRACE_NOT_FOUND`; `.gate-evidence/step6.log:2` CMD is literally `holo.ts infer:trace 019f868d-… --json` with `provider:"fleet"`, `endpoint:"http://127.0.0.1:4545/v1"`, zero `anthropic`; suite `redhat-fix-3-infer-trace.test.ts` 4/4 PASS |
| **H-2** — subscriptions needs `--claims`; step-5 flake | HIGH | ✅ **RESOLVED** | `runtime.ts:1435-1444` — no more `MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED` default; `resolveStandingResearchEvidence` (426-466) prefers RRF, falls back to honest below-floor provisional (`buildStandingProvisionalEvidence` grade 1 / 0.1, 381-419); child `suspended` accepted **with `researchAdmitted:false` honestly surfaced** (1478-1483; step5.log shows it); pipes-3 negative control updated (`pipeline-templates.test.ts:384-427`); flake root cause recorded (`.tmp/sprint-22/redhat-fix-4-flake-diagnosis.json` — claims-required vs claims-override, not environmental); updated `step5.log` CMD has no `--claims`; suite `redhat-fix-4-subscriptions-no-claims.test.ts` 4/4 PASS |
| **H-3** — existence-only tests; fleet-down untested; swallow | HIGH | ✅ **RESOLVED** | `redhat-fix-5-behavioral-green-fleet-down.test.ts` — GREEN asserts concrete `role`/`endpoint`/`fleetManifestVersion` from real probe + behavioral oracles (`documentType:'daily-briefing'`, `headlines.length>=3`, shop `products[0].price!==null`); fleet-DOWN kills a **real** ephemeral HTTP server (no mock of `probeRoleHealth`/executors) and asserts `MISSION_FLEET_PROBE_UNAVAILABLE` fail-closed; `holo.ts:36-51` swallow now gated behind `PLATFORM_PG_DOWN_NEG=1`/`HOLO_SWALLOW_STORAGE_REJECTIONS=1`; `fleet/manifest.json` degradation declarations unchanged; suite 4/4 PASS |

**Live test execution on reviewed SHA (orchestrator-run, `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod`, real fleet at 127.0.0.1:4545):**

| Suite | Result |
|---|---|
| redhat-fix-1-cap-emb-retrieve | ✅ 4/4 |
| redhat-fix-2-cli-idempotency-defaults | ✅ 4/4 |
| redhat-fix-3-infer-trace | ✅ 4/4 |
| redhat-fix-4-subscriptions-no-claims | ✅ 4/4 |
| redhat-fix-5-behavioral-green-fleet-down | ✅ 4/4 |
| `pnpm typecheck` (tsgo --noEmit) | ✅ exit 0 |

## Gate Pre-Check Findings (skill-emitted, deterministic — source: `gate-pre-check`)

- [ ] **GATE-R1 — human testing gate unverified: gate-results.json is stale relative to all remediation source commits** | Severity: **HIGH** | Confidence: **HIGH**
  `gate-results.json` attests cycle `2026-07-21T17:58:33Z` (`steps_executed 6/6, verdict pass`); the newest source commit is `5d424120` at `2026-07-21T21:46:31Z` (earliest fix `f41a75a5` 21:05Z). The sprint claims complete (`sprint-goal-state.json` `met:true`, 17:59:18Z) but the freshness clause (gate newer than newest source commit) is **violated by ~3.5h**. This is not hypothetical: all five REDHAT-FIX task files explicitly state *"Do not re-run the full human gate here; gate re-attestation is post all REDHAT-FIX-\* remediations"* — that re-attestation never occurred. The 17:58 cycle being attested is precisely the cycle in which step 6 was a substitute command and step 5 required `--claims`. Two evidence logs (`step6.log` committed at 21:22Z inside the FIX-3 merge; `step5.log` re-run at 21:36Z but **uncommitted**) were individually refreshed with correct post-fix argv, but the gate was never re-run end-to-end and `gate-results.json`/`e2e-verification.json` were never regenerated. Remediation: run `/kb-run-human-tests` fresh against the current main checkout, regenerate `gate-results.json` + `e2e-verification.json`, commit all evidence, then update `sprint-goal-state.json`.
- Executability/oracle clauses otherwise PASS on the current tree: step 6's documented command now exists and resolves to real fleet telemetry (oracle provable); step 5's documented command (bare subscriptions) now executes as documented (updated log).

## New Findings

### HIGH

- [ ] **R-1 — Gate attestation stale / full gate re-run missing** (see GATE-R1 above) | Confidence: **HIGH (deterministic + mcp-reviewer G-1)**

### MEDIUM

- [ ] **R-2 — `sprint-goal-state.json` internally contradictory; SPRINT.md header stale** | Confidence: **HIGH (mcp-reviewer G-2 + orchestrator)**
  `sprint-goal-state.json:43-49` redhat section: `"verdict":"pass", "high_findings_open":0, "no additional HIGH findings requiring REDHAT-FIX"` — flatly contradicted by the five REDHAT-FIX tasks that were queued from the 18:30Z report and are now marked `✅ Completed`. `SPRINT.md:14-16` still says `Status: In Progress … 5/10 tasks completed · red-hat remediation queued 2026-07-21T18:30:00Z` while commit `5d424120` is titled "status sync — REDHAT-FIX-1..5 completed on main". Any consumer reading goal-state as truth will conclude the sprint completed with zero red-hat findings. Fix in the same commit as the gate re-run.

### LOW

- [ ] **R-3 — `step5.log` (and whitespace-only edits to three gate JSONs) uncommitted** | Confidence: **HIGH**
  Working tree carries the corrected 21:36:53Z bare-subscriptions evidence as uncommitted modification. The committed `step5.log` at HEAD is the 21:25:10Z run from the REDHAT-FIX-4 **worktree** (`fleetManifestPath` points at `.worktrees/REDHAT-FIX-4/...` in the committed blob; the uncommitted version points at the main checkout). Commit the main-checkout evidence with the gate re-run.
- [ ] **R-4 — Ephemeral path/summary artifacts absent on main checkout** | Confidence: **HIGH (both reviewers)**
  `.tmp/sprint-22/redhat-fix-1-path.json` (FIX-1 AC-4 `test -f` gate) and `.tmp/sprint-22/redhat-fix-3-gate-step6.json` (FIX-3 AC-4 summary) do not exist here; the FIX-1 test's `beforeAll` recreates path.json so the vitest suite passes, but the standalone `test -f` gate fails on a cold checkout. `.tmp` is intentionally uncommitted — treat as bookkeeping gap, not code failure.
- [ ] **R-5 — First parallel vitest invocation failed 2 tests (lease fence); passes isolated and on re-run** | Confidence: **MEDIUM (orchestrator-reproduced)**
  First combined run of fix-1+2+3 files failed FIX-2 AC-1 (`MISSION_WHATSNEW_FAILED: lease renew failed: fence mismatch or missing run`) and FIX-3 AC-1 (report mission exit 1). Both files then passed in isolation (4/4 each) and a repeated parallel fix-2+fix-3 run passed 8/8. Transient first-run race against DB state left by the remediation worktrees (consistent with the class addressed by `b03a9167` "resilient template ensure"); non-deterministic suite behavior is a test-integrity smell worth watching — the H-2 lesson is that undiagnosed fail→pass flips hide real bugs. Non-blocking.
- [ ] **R-6 — `unhandledRejection` still logs-and-continues outside the env flag** | Confidence: **MEDIUM (mastra-reviewer N-2)**
  `holo.ts:50` prints `Unhandled rejection:` without exiting. The mission runtime fails closed independently (proven by the FIX-5 fleet-down test), so this is defense-in-depth only; a future unawaited infra rejection could still be log-masked.

## Prior Non-Blocking Findings — Status (unchanged, out of remediation scope)

| ID | Status |
|---|---|
| M-1 (MCP live-Jina shop vs template catalog divergence) | OPEN — unchanged |
| M-2 (`--kind`→`uploadKind` coupling; `allowedKinds` duplication) | OPEN — unchanged |
| M-3 (28 `as never` casts in runtime.ts) | OPEN — unchanged |
| M-4 (`verify:no-shells` thin gate evidence) | OPEN — unchanged |
| M-5 (detail-step logs under ephemeral `.tmp`) | PARTIALLY addressed — `.gate-evidence/` copies now hold real content, but `gate-results.json detail_steps[].log` still points at `.tmp` paths |
| L-1 (pipes-1 SIGKILL→resume code-analysis-only) | OPEN — unchanged |

## Agent Contradictions & Debates

| Topic | mastra-reviewer | mcp-reviewer | Assessment |
|---|---|---|---|
| Subscriptions child `suspended` accepted as terminal-ok | Not a loophole — honest non-admit surfaced as `researchAdmitted:false`, publish proceeds | (not in scope) | Sustained as resolved: the task's own design clause authorizes completed-or-honest-suspend, output is truthful, and the document row is real. Watch item for Sprint 23 fulcrum seam: a standing subscription whose research never admits will publish low-substance digests indefinitely — acceptable for unattended operation, but the PRD should say so. |
| Missing `.tmp` path artifacts (R-4) | LOW bookkeeping | LOW bookkeeping (G-4) | Agreed; the behavioral suites self-heal the artifacts. |
| Overall verdict | APPROVE | NEEDS_FIXES (gate staleness only) | Consolidated as CONDITIONAL PASS: code fixes all verified; the gate-freshness auto-finding is deterministic and cannot be cleared by a green agent panel. |

## Recommendations

1. **Blocking for sprint-complete attestation (R-1/R-2/R-3, one commit):** run `/kb-run-human-tests` fresh on the current main checkout (all 6 steps; steps 5/6 now execute as documented), regenerate + commit `gate-results.json`, `e2e-verification.json`, `.gate-evidence/*` (including the pending `step5.log`), and rewrite `sprint-goal-state.json` so the redhat section reflects the 18:30Z findings and their remediation; sync the SPRINT.md header (10/10, remediation complete).
2. **Non-blocking:** fold R-4 (`test -f` on ephemeral path.json) into the vitest assertion or commit a copy under `.spec/`; consider `process.exitCode = 1` in the non-swallowed `unhandledRejection` branch (R-6); keep M-1..M-5/L-1 visible for Sprint 23 planning.
3. **Landing:** this review approves the remediation code at SHA `5d424120976d3546ef4f68338878f2c554779b49`. Per the landing note, the run stage owns any merge/land. The stale-gate finding governs the *sprint-complete attestation*, not the correctness of the five merged fix commits.

## Agent Reports (Summary)

- **mastra-reviewer** (FIX-1/4/5): Verdict APPROVE. All 12 ACs PASS (FIX-1 AC-4 PARTIAL on ephemeral artifact only). Confirmed honest below-floor evidence mapping, real fleet-DOWN test without mocks, updated pipes-3 negative control, plausible flake diagnosis. Findings: 2 LOW.
- **mcp-reviewer** (FIX-2/3 + gate state): Verdict NEEDS_FIXES (gate staleness). All FIX-2/FIX-3 ACs PASS (1 PARTIAL on missing summary artifact). Caught the stale gate attestation (G-1 HIGH), contradictory goal-state (G-2 MEDIUM), uncommitted step5.log (G-3 LOW), missing step6 summary (G-4 LOW).
- **orchestrator**: Independent source audit of all five fix paths; executed all five integration suites live (20/20 pass, serial) + parallel re-run (8/8) + typecheck (exit 0); reproduced and isolated the transient first-run lease-fence failure (R-5).

## Metadata

- **Agents**: mastra-reviewer, mcp-reviewer + orchestrator source/test verification + deterministic gate pre-check
- **Confidence Framework**: HIGH (deterministic or 2+ sources), MEDIUM (single source, verified), LOW (single source)
- **Reviewed SHA**: `5d424120976d3546ef4f68338878f2c554779b49` — cite this SHA for any land decision
- **Report Generated**: 2026-07-21T22:04:42Z
- **Landing note compliance**: read-only review — no source or task files modified, no branch/checkout mutation, no merge/push performed; uncommitted working-tree gate evidence left exactly as found
- **Next Steps**: Run fresh human-testing gate + bookkeeping repair commit (R-1/R-2/R-3), then the sprint's verified-complete attestation can be re-issued. The five REDHAT-FIX remediations themselves are approved as reviewed at `5d424120`.
