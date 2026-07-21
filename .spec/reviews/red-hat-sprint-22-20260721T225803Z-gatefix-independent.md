# Red-Hat Review Report — Sprint 22 GATE-FIX & Fresh Human-Gate Evidence (Independent)

**Report Date**: 2026-07-21T22:58:03Z
**Target**: Sprint 22 — All Agentic Pipelines as Templates/Agents (`.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents`)
**Reviewed SHA**: `60cabdfc054550ff4142e2be1203783006ac1dca` (`main` HEAD — verified: `git merge-base --is-ancestor 60cabdfc HEAD` and HEAD **is** 60cabdfc)
**Gate evidence under review**: `.gate-evidence/2026-07-21T22:42:16Z` (run_id `2026-07-21T22:42:16Z`, `reviewed_sha` in gate-results == reviewed SHA)
**Reviewed By**: independent red-hat reviewer (read-only; no source, task, evidence, or git mutations; no commits)
**Scope**: GATE-FIX `infer:trace` mission-run-ID resolution (commit `cf91abad`, merged by `60cabdfc`) + soundness of the fresh 7-step human-gate evidence.

## Executive Summary

The GATE-FIX is correct, minimal, and fail-closed: `loadInferTrace` now resolves the same `holocron_nonprod` identity the mission engine always writes to, the mission run UUID remains the primary public id, and unknown ids still hard-fail. I independently re-verified the fix against the live database at the reviewed SHA (AC-1 and AC-2 equivalents, both pass). The fresh 7-step gate evidence is sound: every step's command-fidelity hash matches the plan, every exit/regex oracle recomputes green from the raw logs, the evidence is newer than the newest source commit, the verifier provenance is genuine, and the historical fail archive is intact. Findings are non-blocking hygiene items: missing durable regression-suite run artifacts, stale goal-state/SPRINT status, uncommitted gate artifacts, and several weak oracles. **Verdict: PASS.**

## Independent Verification Performed (not trusting any claimed artifact)

| Check | Method | Result |
|---|---|---|
| Reviewed SHA is main HEAD | `git rev-parse HEAD` + `merge-base --is-ancestor` | ✅ HEAD == `60cabdfc` |
| GATE-FIX root cause | `mission/runtime.ts:3571` uses `resolveHolocronNonprodDatabaseUrl`; pre-fix `infer-trace.ts` defaulted `preferHolocron→holocron` | ✅ root cause real |
| Fix correctness | read `infer-trace.ts` diff at `cf91abad`; `databaseUrl()` now delegates to `resolveHolocronNonprodDatabaseUrl`; explicit ambient `DATABASE_URL` pointing at a wrong catalog now **loudly refuses** instead of silently NOT_FOUND | ✅ sound, safer than before |
| AC-1 (live probe) | `env -u DATABASE_URL bun run …/holo.ts infer:trace 019f86d9-1d11-722a-946d-29c8d39434bb --json` | ✅ exit 0, `ok:true`, 2 `modelCalls`, both `provider:"fleet"`, 0 anthropic, traceId matches step 4 |
| AC-2 (live probe) | same command with UUID `00000000-…-00aa` | ✅ exit 1, `ok:false`, `code:"INFER_TRACE_NOT_FOUND"`, no invented rows |
| AC-3 (no substitute) | recomputed `cmd_sha` for all 7 steps = sha256(plan `literal_cmd`) vs log `@@GATE-META` header | ✅ 7/7 command-fidelity OK; step 7 literal command contains `infer:trace` |
| AC-4 (archive intact) | grep historic `.gate-evidence/2026-07-21T22:12:30Z/step7.log` | ✅ `INFER_TRACE_NOT_FOUND` ×1, historic runId ×3 |
| Oracle recompute (all 7) | applied each `expect_log_regex` / `expect_not_log_regex` to each raw `stepN.log` + checked `.exit` files and `@@GATE-EXIT=0@@` trailers | ✅ 7/7 recompute PASS (pos≥1, neg=0, exit=0) |
| Chained evidence | step 7 runId `019f86d9-…` appears in step4.log (`"runId"` top-level) and step 7 traceId `mission:1dfedf8d-…` == step 4 traceId | ✅ chained, not fabricated |
| Step 6 sub-workflow claim | `subworkflowCalls:["evidence-research"]` + `publishedAt` + `documentId` in step6.log; independent `infer:trace` on sub-run `019f86da-2fab-…` | ✅ sub-run has 2 real fleet calls, both success |
| Verifier provenance | `gate-verification.json` `method:…@26bc4324425e` == sha256(first 12) of `~/.agents/skills/kb-run-human-tests/references/verify-gate-evidence.sh` | ✅ genuine (see L-3) |
| Freshness | gate-results.json 16:47:01 local > merge `60cabdfc` 16:31:56 local > newest task file 16:31 local; verification written 22:47:41Z, 40s after results | ✅ fresh, not stale |
| Product tree at HEAD | `git status --porcelain -- services/ packages/ src/` | ✅ clean (only `.spec/` evidence + untracked `.pi-subagents/` dirty) |
| Regression test quality | read `gate-fix-s22-infer-trace-runid.test.ts` — real CLI-level (`runHolo`), unsets `DATABASE_URL`, asserts fleet≥1 / anthropic=0 / fail-closed / archive | ✅ real, not theatre (see M-1) |

## GATE-FIX AC Verdict Table

| # | AC Item | Verdict | Evidence |
|---|---------|---------|----------|
| AC-1 | Mission runId resolves without ambient `DATABASE_URL` | ✅ PASS | gate step 7 + my live probe at `60cabdfc` (exit 0, 2 fleet calls) |
| AC-2 | Unknown id fails closed | ✅ PASS | my live probe: exit 1 `INFER_TRACE_NOT_FOUND` |
| AC-3 | Public id remains mission runId, no substitute command | ✅ PASS | step7 `command.sh` + cmd-fidelity hash match; `env -u DATABASE_URL` prefix is the stricter documented post-fix form |
| AC-4 | Historical QA fail evidence preserved | ✅ PASS | `2026-07-21T22:12:30Z/step7.log` intact with `INFER_TRACE_NOT_FOUND` |

## Findings

### Critical
*(none)*

### High
*(none)*

### Medium

- **M-1 — No durable record that the PLATFORM_IT regression suite was ever executed (RED→GREEN).** The GATE-FIX task requires `requires_red_evidence` + seeded evidence, and the test writes `gate-fix-s22-*.json` artifacts to `.tmp/sprint-22/` — **none exist** (only `redhat-fix-*` artifacts are present). Mitigations that keep this non-blocking: the preserved `2026-07-21T22:12:30Z` archive is an *organic* RED on the exact pre-fix code path (a real gate failure, arguably stronger than a synthetic test RED), and I independently confirmed GREEN behavior at the CLI surface (AC-1/AC-2 live probes). Recommendation: run `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/gate-fix-s22-infer-trace-runid.test.ts` in a safe window to complete the artifact trail (note: the suite can call `truncateMissionTables` on template conflict — I deliberately did **not** run it during this read-only review, as it would mutate the nonprod DB that backs this evidence).
- **M-2 — `sprint-goal-state.json` and SPRINT.md status are stale relative to the reviewed reality.** Goal-state (`updated_at` 17:59:18Z) predates the GATE-FIX commit (22:29Z), the failed 22:12Z gate, and the fresh 22:42Z pass; it still shows `human_test` 6/6 (pre-GATE-FIX shape) and `tasks.total: 5` (excludes REDHAT-FIX-1..5 and GATE-FIX). SPRINT.md header still reads "5/10 tasks completed · red-hat remediation queued". Downstream tooling reading goal-state sees a pre-remediation snapshot. The fresh `gate-results.json` itself satisfies the deterministic freshness rule (newer than newest commit), so this is status hygiene, not a gate hole — but it should be resynced at land.
- **M-3 — Fresh gate artifacts are uncommitted working-tree state.** `git status` shows `gate-results.json`, `gate-verification.json` (untracked-modified set includes `e2e-verification.json`, `sprint-goal-state.json`, root `.gate-evidence/step5.log`/`step6.log`) modified on top of `60cabdfc`. The reviewed product commit is clean, but the audit trail for this gate pass is not yet durable in git. The run stage should commit the evidence set with the land.

### Low

- **L-1 — Weak oracles on steps 2/3/6 and step 7's negative assertion.** Steps 2/3 assert only `"ok":true` (no former-output-shape field check — though the logs do contain substantive shapes: assimilate `architecture/patterns/evaluation`, shop `products`); step 6's alternation includes the literal `subscriptions`, which trivially matches `templateKey:"subscriptions"` anywhere in the log; step 7's `expect_not` omits `"provider":"anthropic"` and a `count>=1` floor (the actual log is clean — `count:2`, both fleet — so evidence is sound, but the oracle alone wouldn't catch a mixed-provider regression; the vitest suite does cover anthropic==0).
- **L-2 — gate-plan/gate-results narrative inaccuracy (runId extraction).** Both claim the step-7 runId was "extracted from step4's assayInstanceId/challengeInstanceId composite fields". step4.log contains a top-level `"runId": "019f86d9-…"` — extraction was direct. Harmless, but the note was written without reading the actual JSON.
- **L-3 — Verifier script drift across skill installs.** The artifact's `method` hash matches the `~/.agents`/opencode copy of `verify-gate-evidence.sh` (`26bc4324425e`); the `~/.claude` copy differs (`e3b376225206`, adds D4-native Maestro checks, 161 diff lines). The recompute logic exercised here (terminal steps) is identical in lineage and my independent recompute agrees, so provenance is genuine — but the two installs should be resynced.
- **L-4 — Step 6 semantics not asserted:** outer subscriptions run shows `usage.tokens: 0` and `researchAdmitted: false`. Verified the fleet work happened in the sub-workflow run (2 fleet calls on `019f86da-2fab-…`), and the deliverable only requires invoke+publish (both evidenced) — but `researchAdmitted:false` is unexplained in the evidence narrative and worth a product note.
- **L-5 — Scaffold gathers are honestly labeled (verified, not a finding of deception).** Step 1's `gatherProvenance: "Deterministic scaffolding…"` matches REDHAT-FIX-1's accepted PATH-A re-scope (`redhat-fix-1-path.json`: research retrieve wired to real RRF/CAP-EMB-01; whatsNew/shop/assimilate gathers stay scaffold with explicit provenance). The gate proves output shape + real fleet reasoning + real Postgres persistence for these pipelines — not live data substance. Confirmed SPRINT.md no longer claims CAP-EMB-01 composition beyond retrieval ("retrieval served by the local embed/search stack" — the retrieve path is the wired one).
- **L-6 — `loadInferTrace` empty-telemetry success (pre-existing, REDHAT-FIX-3 design):** a known mission run with zero telemetry returns `ok:true, modelCalls:[]`. Cannot greenwash this gate (step 7 oracle requires `"provider":"fleet"`), noted for completeness.

## Human Testing Gate — Deterministic Pre-Check (skill-emitted)

- **Executability**: all 7 steps are real-cli terminal steps; `services/platform/src/cli/holo.ts` exists at HEAD with `mission run`, `verify:no-shells`, and `infer:trace` subcommands (steps 1–7 all executed with exit 0 — entry points proven by execution). ✅
- **Oracle provability**: every oracle resolves in source — `documentType:"daily-briefing"` (whatsNew output schema), `reportKind`/`templateKey:"business-report"` (report template), `0 per-domain modules found` (`verify:no-shells` emitter), `subworkflowCalls` (subscriptions output), `"provider":"fleet"` (`infer-trace.ts` `mapModelCall` from durable `inference_telemetry`). ✅
- **Non-empty result**: 7/7 logs non-empty, oracles matched real output (recomputed independently). ✅
- **Evidence freshness (sprint claims complete)**: `gate-results.json` `verdict:"pass"`, `steps_executed == steps_total == 7`, newer than newest source commit. ✅ (with M-2/M-3 hygiene notes)
- **Pre-check auto-findings**: none.

## Recommendations

1. Land `60cabdfc` (already main HEAD) and commit the fresh gate evidence set + resynced `sprint-goal-state.json`/SPRINT.md status in the same land (M-2, M-3).
2. Run the GATE-FIX PLATFORM_IT suite once in a safe window to produce the `gate-fix-s22-*` artifact trail (M-1).
3. Tighten gate oracles next gate revision: step 7 add `expect_not: "provider"\s*:\s*"anthropic"` + count floor; steps 2/3 assert one former-shape field each; step 6 drop the trivially-true `subscriptions` alternation (L-1).
4. Resync the two `verify-gate-evidence.sh` installs (L-3).

## Final Verdict

**PASS** — reviewed at SHA `60cabdfc054550ff4142e2be1203783006ac1dca` (main HEAD).

The GATE-FIX `infer:trace` mission-run-ID resolution is correct, minimal, fail-closed, and independently live-verified; the fresh 7-step human-gate evidence in `.gate-evidence/2026-07-21T22:42:16Z` is sound (command fidelity, oracle recompute, chaining, freshness, and provenance all independently confirmed). All findings are Medium/Low hygiene items that do not block the land; the run stage should address M-2/M-3 when committing the land.

## Metadata

- **Reviewer mode**: independent, read-only (no source/task/evidence/git mutations; no commits; regression suite deliberately not executed — see M-1)
- **Live probes executed (read-only DB)**: `infer:trace` on fresh runId (exit 0, fleet×2), `infer:trace` on unknown UUID (exit 1, NOT_FOUND), `infer:trace` on subscriptions sub-run (fleet×2)
- **Prior reviews in chain**: `red-hat-sprint-22-20260721T183000Z.md` (C-1/C-2/H-1..H-3 findings), `red-hat-sprint-22-20260721T220442Z-postremediation.md`
- **Report Generated**: 2026-07-21T22:58:03Z
- **Next Steps**: Run stage may land; commit evidence + resync status files at land (M-2/M-3); schedule regression-suite artifact run (M-1).
