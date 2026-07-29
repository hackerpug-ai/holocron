# GATE-FIX-S28R3-QA4 — Baseline-only fresh-target, policy Action semantics, step2 GATE_RUN_ID

> Status: ✅ Implemented  

> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer  
> Reviewer: code-reviewer + product-manager  
> Priority: P0  
> Source: `.spec/reviews/red-hat-20260729T095141Z-sprint-28-final-sha-dbb5c37b1.md` (NEEDS-FIXES CRITICAL=1 HIGH=2 MEDIUM=1)  
> Reviewed SHA: `dbb5c37b1a2ae6cf0a635bc1a508080acc66c656`  
> Goal: `.spec/orchestrate/s28-20260728T231409Z-codex-gate-fix-s28r3-qa4-goal.md`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

Close every CRITICAL/HIGH/MEDIUM in the Terra review. Preserve **DEPENDENCY-S28-R2-RO**. Never fabricate keys, weaken six-step claims, hand-edit green verdicts, or claim 6/6.

## Findings → fixes

| ID | Sev | Fix |
|----|-----|-----|
| C-1 | CRITICAL | Fresh-target: reject/ignore `--source-blob-root`/`HOLO_BLOB_ROOT`; no `hashLocalBlobStore` of live source; blob expected from R2 recovery baseline only; still hash restored target |
| H-1 | HIGH | Parse every Allow `Action`/`NotAction`/`Resource`/`NotResource`; reject NotAction/NotResource/s3:*/writes; only ListBucket/GetBucketLocation on bucket + GetObject on exact prefix |
| H-2 | HIGH | Step2: `assert-gate-run-id` before mkdir/logs; evidence under `.tmp/.../${GATE_RUN_ID}/`; regenerate HUMAN-GATE; unset/malformed no side effects |
| M-1 | MEDIUM | Full-run recorder writes contract-shaped report; assert POSTGRES/LEDGER/BLOB parity + baseline binding; negative: exit 0 without report fields fails |

## MUST

### C-1
- Runner: if fresh-target path, refuse `--source-blob-root` with clear error OR force ignore + do not pass to child.
- `fire-drill.ts` when `freshTarget`: do not call `hashLocalBlobStore(sourceBlobRoot)`; require baseline blob_manifest; expected parity from baseline; hash restored blobDir for after.
- Tests: readable supplied source tree never traversed (instrumentation or fail if readdir called); missing baseline still fails closed.

### H-1
- `prove-isolation.sh` Python: for each Allow, if NotAction or NotResource present → fail; Action set must be subset of allowlist; each action paired with correct resource class.
- Negatives: NotAction, NotResource, s3:*, separate Allow with PutObject; exact-only green.

### H-2
- gate-plan step2 starts with `bash scripts/assert-gate-run-id.sh` then mkdir under run-id path; tee logs under that path.
- Regenerate HUMAN-GATE.
- Tests include step 2 in no-side-effect loop for unset/malformed.

### M-1
- Recorder/full-run: write parity-report.json with required true fields + baseline_id/key.
- Assert those fields; negative recorder omits field → test/runner fails.

## NEVER
Fabricate R2_RESTORE · ambient RW as RO · weaken step4/5/6 · Sprint 27 / .tmp/D05-* / surface 137 · green gate-results hand-write

## VERIFY
```bash
bash -n scripts/run-fire-drill-on-fresh-target.sh scripts/prove-isolation.sh scripts/assert-gate-run-id.sh
bash scripts/render-human-gate-from-plan.sh
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa4-gate-fix.test.ts
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa3-gate-fix.test.ts
pnpm tsgo --noEmit
```

## WRITE-ALLOWED
scripts/run-fire-drill-on-fresh-target.sh, prove-isolation.sh, render-human-gate-from-plan.sh  
services/platform/src/backup/fire-drill.ts, cli/holo.ts if needed  
gate-plan.json, HUMAN-GATE.md, SPRINT.md (task row only)  
tests sprint28-s28r3-qa4-gate-fix.test.ts (NEW) + qa3 updates  
Terra report red-hat-20260729T095141Z  
.tmp/GATE-FIX-S28R3-QA4/**

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA4","source_review":"red-hat-20260729T095141Z-sprint-28-final-sha-dbb5c37b1.md","reviewed_sha":"dbb5c37b1a2ae6cf0a635bc1a508080acc66c656","requirements":[{"id":"AC-C1","primary":true},{"id":"AC-H1","primary":true},{"id":"AC-H2","primary":true},{"id":"AC-M1"}],"tdd_mode":"red_first","residual_preserved":"DEPENDENCY-S28-R2-RO"}
-->
