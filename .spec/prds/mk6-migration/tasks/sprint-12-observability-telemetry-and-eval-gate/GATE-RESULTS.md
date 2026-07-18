# Gate Results: sprint-12-observability-telemetry-and-eval-gate

## ✅ VERIFIED — recomputed `pass` == claimed `pass`; 8/8 recomputed; 0 discrepancies
**proof:** `.spec/prds/mk6-migration/tasks/sprint-12-observability-telemetry-and-eval-gate/gate-verification.json`

- **Date / Run ID:** 2026-07-18T05-38-49Z (**secret-free re-run**; supersedes rejected 2026-07-18T05-25-21Z)
- **Sprint:** sprint-12-observability-telemetry-and-eval-gate (Observability, Telemetry and Eval Gate)
- **Main HEAD:** `af5e93cd63ce2ac3bb6a8d404ab94f31449cf4ef`
- **Environment:** real Postgres `127.0.0.1:5432/holocron`; self-hosted Langfuse `http://127.0.0.1:3100`; local fleet `http://127.0.0.1:4545`; real Anthropic for escape path
- **Secret handling:** Langfuse + Anthropic credentials supplied **only via process environment** (never in `literal_cmd` or step logs). `secret-leak-scan` on this run’s canonical artifacts: **ZERO_SECRET_MATCHES=true**
- **Realization:** `holo` is not on PATH — each step driven as `DATABASE_URL=postgres://127.0.0.1:5432/holocron bun services/platform/src/cli/holo.ts <sub>`
- **UI driver:** none (operator-CLI only)
- **Evidence dir:** `.spec/prds/mk6-migration/tasks/sprint-12-observability-telemetry-and-eval-gate/.gate-evidence/2026-07-18T05-38-49Z/`
- **Parent QA package:** `.tmp/sprint-12-observability-telemetry-and-eval-gate/parent-qa-2026-07-18T05-38-49Z/`
- **Historical prior claim preserved:** `gate-results.prev.json`
- **Closure / QA acceptance:** **NOT authorized / NOT accepted for close.** ROADMAP untouched. Independent audit of this package still required.

## Summary

| Result | Count |
|--------|-------|
| ✅ Pass | 8 |
| ❌ Fail | 0 |
| 🔧 Wiring Gap | 0 |

**Verdict: `pass` (verified)** — all 8 literal operator steps executed against real services; `verify-gate-evidence.sh` recomputed 8/8 with 0 discrepancies.

## Per-Step Results

| # | Gate step | Method | Result | Evidence | Log |
|---|-----------|--------|--------|----------|-----|
| 1 | `holo mission run research` → Langfuse | real-cli | ✅ pass | `langfuseExportOk=true`, exportedEvents present, exit 0 | step1.log |
| 2 | `holo telemetry:tail --run-id <mission>` | real-cli | ✅ pass | count ≥ 1 for mission run, exit 0 | step2.log |
| 3 | `holo evals:run --sample known-good` | real-cli | ✅ pass | score in 0.8–0.9 band, exit 0 | step3.log |
| 4 | `holo evals:ci --fixture deliberately-bad` | real-cli | ✅ pass | `failureReason=threshold_regression`, exit 1 | step4.log |
| 5 | `holo evals:ci --fixture known-good` | real-cli | ✅ pass | verdict=passed, exit 0 | step5.log |
| 6 | `holo evals:ci --fixture deterministic-invariant-regression` (H1-R) | real-cli | ✅ pass | rawJudgeScore=score=0.82 ≥ 0.8, meetsThreshold=true, `deterministic_invariant_failure` / required-citation, exit 1; dual direct/PIPESTATUS=1 | step6.log + parent-qa h1r-* |
| 7 | `holo evals:ci --fixture invalid-config` | real-cli | ✅ pass | invalid threshold fail-closed, exit 1 | step7.log |
| 8 | `holo evals:drift --dataset research_v1` | real-cli | ✅ pass | datasetVersion=research_v1, exit 0 | step8.log |

## H1-R live proof (step 6 + dual capture)

| Assertion | Live value |
|-----------|------------|
| rawJudgeScore | 0.82 |
| emitted score | 0.82 |
| raw == emitted | true |
| score ≥ 0.8 | true |
| meetsThreshold | true |
| failureReason | `deterministic_invariant_failure` |
| deterministicFailures | required-citation |
| direct `$?` | 1 |
| `PIPESTATUS[0]` | 1 |
| fixture citation-free | true |

## CLI escape vs telemetry wrapper (documented)

See `parent-qa-…/cli-vs-withTelemetry.md`:

| Path | Ledger | Telemetry row | Correlation |
|------|--------|---------------|-------------|
| CLI `infer:call --escape` → `runBudgetedEscape` | yes | **no** | ledger-only |
| AC-3 `runBudgetedEscapeWithTelemetry` | yes | **yes** + `budget_ledger_id` | **joinedBy=`budget_ledger_id`** |

Parent QA proves fail-closed CLI (exit 1, anthropicCount=0), CLI green ledger write, **and** live AC-3 cross-ledger correlation via integration suite (H2 path preserved).

## Supporting parent-required checks

| Check | Result | Evidence |
|-------|--------|----------|
| build/typecheck | PASS (`tsgo --noEmit` EC 0) | `parent-qa-…/build-typecheck-lint.txt` |
| lint (biome scoped) | PASS (warnings only, EC 0) | same |
| `evals-ci-gate` integration | 6/6 passed | `parent-qa-…/integration-suite.txt` |
| `inference-telemetry` (H2) | 6/6 passed | same |
| `observability-traces` | 4/4 passed | same |
| `evals-versioning` | 5/5 passed | same |
| `mission-telemetry` | 1/1 passed | same |
| H-1 / H-1-R / H-2 ancestry | all required SHAs ancestors of HEAD | `parent-qa-…/evidence-ancestry-manifests.txt` |
| H-1-R / H-2 manifests | `sha256sum -c` OK | same |
| Secret leak scan (incl. Langfuse) | **ZERO matches** on canonical artifacts | `parent-qa-…/secret-leak-scan.txt` |
| Escape fail-closed (clean env) | exit 1, anthropicCount=0 | `escape-fail-closed-strict.*` |
| Escape green (key provisioned) | exit 0, real Anthropic + ledger id | `escape-green.*` |
| Live telemetry↔budget_ledger | joinedBy=`budget_ledger_id` | `AC-3-budgeted-escape.live.json` |

## Verification

```json
{"verified":true,"claimed_verdict":"pass","recomputed_verdict":"pass","steps_planned":8,"steps_recomputed":8,"discrepancies":[]}
```

## Failures
None.

## Wiring Gaps
None.

## What this does / does not authorize

| Item | Status |
|------|--------|
| Human testing gate (secret-free evidence) | **PASS (verified)** |
| Secret-leak requirement (incl. Langfuse) | **PASS (zero matches)** |
| Parent live QA package | **READY FOR INDEPENDENT AUDIT** |
| QA accepted for close | **NO** |
| ROADMAP edit | **not performed** |
| Sprint close | **not declared** |

## Parent-controlled close authorization

- QA accepted: **YES** (secret-free package audited by `.tmp/sprint-12-independent-qa-audit-20260718T060000Z.md`)
- Closure authorized: **YES** by `prd-20260716T192354Z-14461843`
- Sprint close: **YES**
- ROADMAP edited by this close: **NO**
