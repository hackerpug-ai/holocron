# REDHAT-FIX-S28R2-H4 — Mandatory PITR sentinel cut proof (HIGH-4)

> Status: ⬜ Pending · Agent: devops-engineer · Priority: P0  
> Source: red-hat-20260729T051314Z HIGH-4 · TDD: red_first  

## Outcome
D05-02 pause/promote integration tests must **require** `pitr_sentinel` before/after cut (before present ≥1, after present =0). No `pending` soft-pass when the table is absent. Seed path must ensure sentinel rows land in the restorable WAL window for live PLATFORM_IT.

## MUST
- MUST fail the test if `pitr_sentinel` is missing after a successful restore when seed claimed success
- MUST assert COUNT(before)≥1 and COUNT(after)=0 on both pause and promote paths
- MUST harden seed so sentinel table+rows exist in the backup/WAL used for the suite  
- NEVER leave silent pending-pass for missing sentinel  

## ACs
### AC-1 Pause path mandatory sentinel cut
### AC-2 Promote path mandatory sentinel cut  
### AC-3 Seed fails closed if sentinel cannot be established before restore  

## VERIFY
`PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts`

## WRITE-ALLOWED
`services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts`, seed helpers if needed, optional restore test hooks

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"REDHAT-FIX-S28R2-H4","requirements":[{"id":"AC-1"},{"id":"AC-2"},{"id":"AC-3"}],"tdd_mode":"red_first"}
-->
