# REDHAT-FIX-S28R2-H3 — Require distinct real read-only restore credentials (HIGH-3)

> Status: ⬜ Pending · Agent: devops-engineer · Priority: P0  
> Source: red-hat-20260729T051314Z HIGH-3 · TDD: red_first  

## Outcome
`provision-fresh-restore-target.sh` must **not** silently fall back to ambient backup RW `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`. Live provision requires distinct `R2_RESTORE_ACCESS_KEY_ID` + `R2_RESTORE_SECRET_ACCESS_KEY` (or explicit fail-closed). Placeholders only when explicitly allowed for isolation-shape dry drills.

## MUST
- MUST refuse live provision when `R2_RESTORE_*` missing unless `ALLOW_PLACEHOLDER_R2_RO=1` (shape-only) or documented non-live dry-run
- MUST never write ambient backup RW keys as `object-read-only` without distinct restore identity
- MUST fail closed when `REQUIRE_LIVE_R2_RO=1` and restore keys missing/equal to backup RW keys  

## ACs
### AC-1 Missing R2_RESTORE_* → non-zero exit (live path)
### AC-2 Distinct restore keys written to env file; ambient RW not substituted by default
### AC-3 Scripted/unit test of credential resolution logic  

## VERIFY
`bash -n scripts/provision-fresh-restore-target.sh`  
`PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fresh-target-creds.test.ts` (or shell-based test under services/platform/tests)

## WRITE-ALLOWED
`scripts/provision-fresh-restore-target.sh`, related tests, optional small helper script

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"REDHAT-FIX-S28R2-H3","requirements":[{"id":"AC-1"},{"id":"AC-2"},{"id":"AC-3"}],"tdd_mode":"red_first"}
-->
