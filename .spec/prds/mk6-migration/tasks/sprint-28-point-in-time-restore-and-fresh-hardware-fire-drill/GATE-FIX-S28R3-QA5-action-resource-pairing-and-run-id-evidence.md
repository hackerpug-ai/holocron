# GATE-FIX-S28R3-QA5 — Exact action/resource pairing + run-ID-scoped steps 3–5 + no Docker false-green

> Status: ⬜ Pending  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer  
> Reviewer: code-reviewer + product-manager  
> Priority: P0  
> Source: `.spec/reviews/red-hat-20260729T101625Z-sprint-28-final-sha-a2109d8d27e.md` (NEEDS-FIXES HIGH=2 MEDIUM=1)  
> Reviewed SHA: `a2109d8d27e9eac0862a69e0fd6651b81aa8db78`  
> Goal: `.spec/orchestrate/s28-20260728T231409Z-codex-gate-fix-s28r3-qa5-goal.md`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

Close both HIGH and the MEDIUM finding without weakening the six-step gate. Preserve **DEPENDENCY-S28-R2-RO**. Never fabricate keys or claim 6/6.

## Findings → fixes

| ID | Sev | Fix |
|----|-----|-----|
| H-1 | HIGH | Per Allow statement: bucket actions only with exact bucket ARN; GetObject only with exact prefix object ARN; reject mixed action+resource classes in one statement |
| H-2 | HIGH | Step3 evidence under `.tmp/REDHAT-FIX-S28R3/${GATE_RUN_ID}/`; steps 4–5 read only that run's parity-report; regenerate HUMAN-GATE; two-run contamination negatives |
| M-1 | MEDIUM | Full-run report-contract tests must not `return` green when Docker missing; fail/skip-explicit or no-Docker runner seam |

## MUST

### H-1
In `prove-isolation.sh` Python Allow loop, after classifying resources:
- If any bucket action (ListBucket/GetBucketLocation) and any object ARN in same statement → error
- If GetObject and any bucket-level ARN in same statement → error  
- Bucket actions require bucket ARN present and **no** object ARNs
- GetObject requires object ARN present and **no** bucket ARNs
- Keep all existing rejections (NotAction, NotResource, s3:*, writes, wrong bucket, bare /*, off-prefix)
- Tests: mixed List+GetObject with both resource classes fails; List-only with object ARN fails; GetObject-only with bucket ARN fails; split exact policy (two Allows) still PASSes

### H-2
gate-plan step3 after assert-gate-run-id:
```
EVID=.tmp/REDHAT-FIX-S28R3/${GATE_RUN_ID}
mkdir -p "$EVID"
# provision log, fire-drill log, attestation, report all under $EVID/
# STAGING_ROOT may remain under EVID/fresh-restore
```
Steps 4–5: `assert-gate-run-id` then `test -f .tmp/REDHAT-FIX-S28R3/${GATE_RUN_ID}/parity-report.json` + jq.
Regenerate HUMAN-GATE.
Tests: two GATE_RUN_IDs; report from A cannot satisfy B; foreign report path fails.

### M-1
- Remove silent `if (!dockerAvailable()) return;` green for M-1 report contract tests
- Prefer: no-Docker unit/integration that invokes runner with resolve-only fake host + HOLO_CLI recorder (already works without full docker for some paths) OR `it.skip` with explicit reason that doesn't count as pass — best: extract report validation into testable pure path and/or use dockerAvailable() throw/skip via vitest skip that surfaces as skipped not passed
- Prefer assert: when PLATFORM_IT=1 and !docker, `throw new Error('docker required for M-1 report contract')` so suite fails closed, OR run no-docker contract seam that always executes
- Goal prefers no-Docker contract seam + separate Docker IT

## NEVER
Weaken six-step claims · fabricate R2_RESTORE · hand-write gate-results · Sprint 27 / .tmp/D05-* / surface 137

## VERIFY
```bash
bash -n scripts/prove-isolation.sh scripts/run-fire-drill-on-fresh-target.sh
bash scripts/render-human-gate-from-plan.sh
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa5-gate-fix.test.ts
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa4-gate-fix.test.ts
pnpm tsgo --noEmit
```

## WRITE-ALLOWED
scripts/prove-isolation.sh, render-human-gate-from-plan.sh  
gate-plan.json, HUMAN-GATE.md, SPRINT.md (task row)  
tests sprint28-s28r3-qa5-gate-fix.test.ts (NEW) + qa4 updates  
Terra report red-hat-20260729T101625Z  
.tmp/GATE-FIX-S28R3-QA5/**

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA5","source_review":"red-hat-20260729T101625Z-sprint-28-final-sha-a2109d8d27e.md","reviewed_sha":"a2109d8d27e9eac0862a69e0fd6651b81aa8db78","requirements":[{"id":"AC-H1","primary":true},{"id":"AC-H2","primary":true},{"id":"AC-M1"}],"tdd_mode":"red_first","residual_preserved":"DEPENDENCY-S28-R2-RO"}
-->
