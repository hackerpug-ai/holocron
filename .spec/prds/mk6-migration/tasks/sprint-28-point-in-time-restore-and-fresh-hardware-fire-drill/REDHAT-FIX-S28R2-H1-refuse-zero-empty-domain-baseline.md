# REDHAT-FIX-S28R2-H1 — Refuse zero/empty required-domain recovery baselines at emit (HIGH-1)

> Status: ⬜ Pending · Agent: devops-engineer · Priority: P0  
> Source: red-hat-20260729T051314Z HIGH-1 · TDD: red_first  

## Outcome
`buildRecoveryBaseline` / `captureAndUploadRecoveryBaseline` **must refuse** (throw / ok:false, no R2 upload) when required-domain row counts are empty or all-zero after capture attempt. Capture failure must not retain a zero map as a successful baseline.

## MUST
- MUST refuse emit when `baselineDomainRowTotal(row_counts) === 0` for required FIRE_DRILL domain tables (unless explicit `allowEmptyDomainBaseline: true` reserved for intentional empty-DB fixtures only)
- MUST fail closed when live capture throws and no non-zero counts exist
- NEVER upload all-zero domain baselines as ok:true  

## ACs
### AC-1 Refuse all-zero map
GIVEN rowCounts all zeros and capture also returns zeros or throws  
WHEN build/captureAndUpload runs without allowEmpty  
THEN error; uploaded=false  

### AC-2 Live non-zero still works
GIVEN live DB with domain rows  
WHEN capture runs  
THEN baseline has total > 0  

## VERIFY
`PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-gate-fix-qa1.test.ts services/platform/tests/integration/sprint28-recovery-baseline.test.ts -t 'zero|empty|refuse|capture'`

## WRITE-ALLOWED
`services/platform/src/backup/recovery-baseline.ts`, tests under `services/platform/tests/integration/sprint28-*.ts`, `.tmp/REDHAT-FIX-S28R2-H1/**` local only

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"REDHAT-FIX-S28R2-H1","requirements":[{"id":"AC-1"},{"id":"AC-2"}],"tdd_mode":"red_first"}
-->
