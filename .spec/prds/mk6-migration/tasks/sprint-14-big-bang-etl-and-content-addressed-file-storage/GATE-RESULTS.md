# Sprint 14 Human Gate — RESTATED (S31-CX-06)

**Original verification date:** 2026-07-18  
**Source:** `5f52896757017256d38ec242dc59a80194a6ce8c`  
**Restated:** 2026-08-09 by S31-CX-06 (ETL provenance honesty)

## Scope (honest)

Sprint 14 proved the **ETL pipeline mechanism** on a **fixture-scope** export:

| Fact | Value |
|------|-------|
| `stageRowCount` | **104** (fixture-scope run) |
| `idMapCount` | 104 |
| `fileObjectCount` | 1 |
| Scope | **fixture-scope mechanism** — **not** a production full-corpus load |

Primary operator artifacts (`convex-prod-export.zip`, `.tmp/sprint-14-human-gate-20260718/*`) were **not retained** in the repo. Archive digests also disagree across `gate-plan.json` / `gate-results.json` / `gate-verification.json` (three differing hashes), so the original “production export” framing is not re-derivable.

## What was actually proven

| Step | Result |
|------|--------|
| Native Convex export ETL | PASS — **fixture-scope** `stageRowCount=104`, 104 stable IDs, 1 file object (**mechanism** only) |
| Reconciliation | PASS — zero unexplained variance on the 104-row fixture-scope corpus |
| FK audit | PASS — 0 orphans on the fixture-scope load |
| Vector regeneration | PASS — real fleet 1024-dim/unit-norm probe on the fixture-scope path |
| Blob verification | PASS — retained object parity + HTTP Range 206 on the single fixture object |
| Idempotent rerun | PASS — fixture-scope counts stable |
| Upload lifecycle | PASS — image streamed init/put/finalize mechanism |

## What was **not** proven here

- A production **full-corpus** load into Postgres  
- UC-DATA-05 AC-1 row-count authority for the live corpus  

Those were proven later by **Sprint 29** cutover ETL: **13,801** rows loaded (`documents` = 1623), with surviving committed evidence under  
`.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/20260805T185338Z/`  
(`parityHash` prefix `0a12d2059b…`).

**Primary evidence pointer (UC-DATA-05 AC-1):**  
[`../sprint-31-migration-integrity-remediation/uc-data-05-ac1-primary-evidence.json`](../sprint-31-migration-integrity-remediation/uc-data-05-ac1-primary-evidence.json)

Machine-readable restatement: `gate-results.json` (this directory). Historical `gate-plan.json` / `gate-verification.json` remain as original operator records and are not deleted.
