# Gate Results: sprint-08-role-router-local-first-and-degraded-modes

## ✗ FAIL — do not claim pass

**Proof:** `gate-verification.json` — `verified: False`; claimed `fail` == recomputed `fail` for overall fail, but D7 discrepancies remain so this is **not** a machine-verified pass.

| Field | Value |
|-------|-------|
| Run ID | `2026-07-16T06:03:44Z` |
| Finalized | `2026-07-16T06:09:03Z` |
| Verdict | **`fail`** |
| Steps | 6/7 passed (executed 7) |
| Exec surface | surface:321 (44B63766-C7FE-4F4D-A28E-11895C53D46A) |
| QA surface | D862D414-4C9B-4125-9B51-EF06DF420576 |
| Evidence | `/tmp/holocron-gate-sprint-08-role-router-local-first-and-degraded-modes-2026-07-16T06-03-44Z` |
| Log dir | `/Users/inference1/Projects/holocron/.kb-orchestrate/worktrees/orch-s08-role-router-20260715T-current/.tmp/sprint-08-role-router-local-first-and-degraded-modes/human-tests-qa-2026-07-16T06-03-44Z` |
| Adapter | long-safe `exec-step-long-safe.sh` |
| Secrets | `.env` sourced in-process only; no secret files |

## Blocking failure — Step 5 (AC-3 live escape)

| | |
|--|--|
| Result | **fail** |
| Expected | exit 0 and log matches /STEP5_PASS/ (live Anthropic escape within budget) |
| Actual | exit 1; ok=false; error=ESCAPE_FAILED; message=Failed after 3 attempts. Last error: AI_APICallError: Overloaded; anthropicCount=3 |
| Evidence | /tmp/holocron-gate-sprint-08-role-router-local-first-and-degraded-modes-2026-07-16T06-03-44Z/step5.log | /Users/inference1/Projects/holocron/.kb-orchestrate/worktrees/orch-s08-role-router-20260715T-current/.tmp/sprint-08-role-router-local-first-and-degraded-modes/human-tests-qa-2026-07-16T06-03-44Z/step5-escape.json | exit=1 | @@GATE-EXIT=1@@ | no STEP5_PASS |
| Hypothesis | HYPOTHESIS: Anthropic API capacity Overloaded during real live-escape (AC-3); path contacted api.anthropic.com three times |
| Remedy | HYPOTHESIS: re-run human gate when Anthropic is healthy; do not substitute ZAI for AC-3 live-escape proof; do not claim pass |

Real Anthropic path was exercised (`anthropicCount=3`); failure is provider **Overloaded**, not a skipped step or substituted command.

## Per-step

| # | Result | Evidence |
|---|--------|----------|
| 1 | **pass** | exit=0 STEP1_PASS=yes dur_ms=2838 |
| 2 | **pass** | exit=0 STEP2_PASS=yes dur_ms=3945 |
| 3 | **pass** | exit=0 STEP3_PASS=yes dur_ms=1848 |
| 4 | **pass** | exit=0 STEP4_PASS=yes dur_ms=2832 |
| 5 | **fail** | exit=1 STEP5_PASS=no dur_ms=11458 |
| 6 | **pass** | exit=0 STEP6_PASS=yes dur_ms=2082 |
| 7 | **pass** | exit=0 STEP7_PASS=yes dur_ms=1068 |

## Verification

```json
{
  "verified": false,
  "claimed_verdict": "fail",
  "recomputed_verdict": "fail",
  "steps_planned": 7,
  "steps_recomputed": 7
}
```

Discrepancy kinds: `['test-runner-invocation', 'test-runner-invocation']`
- D7 `test-runner-invocation` on steps 2 and 6 (documented PLATFORM_IT vitest suites per HUMAN-GATE / REDHAT-FIX-H2)
- Step 5 recomputes to **fail** (exit 1, no STEP5_PASS)

`assert-gate-verdict.sh`: rejects pass (`verdict-not-pass`) — correct.

## Sprint goal state

- `human_test.verdict`: **`fail`**
- `met`: **`False`**
- `gate.verdict`: **`FAIL`**
- Block reason: step5 AC-3 live Anthropic escape failed: Overloaded

## Explicit non-claims

- Do **not** treat this run as gate pass.
- Do **not** mark sprint DONE / met=true from these artifacts.
- Do **not** greenwash step 5 via ZAI or suite substitution.
