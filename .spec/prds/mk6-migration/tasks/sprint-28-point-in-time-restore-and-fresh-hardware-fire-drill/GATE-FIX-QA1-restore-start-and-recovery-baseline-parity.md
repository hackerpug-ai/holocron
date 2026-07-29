# GATE-FIX-QA1 — Scratch Postgres start after PITR + recovery-baseline emit/select so fire-drill parity is honest

> Status: ⬜ Pending
> Sprint: [Sprint 28](./SPRINT.md)
> Agent: devops-engineer
> Reviewer: code-reviewer (technical) + product-manager (product lens)
> Estimate: 180 min
> Type: FEATURE
> Priority: P0
> Proposed By: kb-run-sprint (independent Terra High QA fail `20260729T042338Z`, verified)
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Human-gate product path is honest for run `20260729T042338Z` failure modes:

1. **Step 1** — after a successful pgBackRest restore into scratch, Postgres becomes queryable under `--target-action promote` (or fail-closed with a **named** outside-WAL / chain error that `must_observe_any` accepts). Never hang/wipe with only a truncated `archive-get` log and no named gate-matching error.
2. **Step 3** — fire-drill loads a recovery baseline whose `row_counts` / `ledger_sha256` / `restic_snapshot_id` are bound to a real backup+mirror cycle (not all-zero counts, not a non-existent restic prefix). `POSTGRES_PARITY_PASS` can be true when restored domain counts match that baseline.
3. **Steps 4–5** — inherit a truthful parity report (`LEDGER_CHECKSUM_MATCH`, `BLOB_PARITY_PASS` with `matched_objects >= 1`).

**Do not** edit `gate-plan.json`, hand-edit `gate-results.json` / `gate-verification.json`, or weaken gate assertions. Fix product code under `services/platform/src/backup/**` (+ tests). Preserve unrelated Sprint 27 and `.tmp` working tree changes; do not touch cmux surface 137.

## Evidence (immutable — do not rewrite)

- Run: `20260729T042338Z` · verdict **fail** (verified, zero discrepancies)
- `gate-results.json` — steps_passed 2/6; steps 1,3,4,5 fail
- `gate-verification.json` — `verified:true`, `recomputed_verdict:fail`, `discrepancies:[]`
- `.gate-evidence/20260729T042338Z/step1.log` — restore incomplete; Postgres failed to start on scratch (log shows truncated pgBackRest `archive-get` / wipe empty scratch)
- `.gate-evidence/20260729T042338Z/step3.log` — baseline_id `13513515879c239e…`, expected row counts all **0**, actual beliefs/sources/… **8/8/…**, ledger expected `25d6f40a…` vs actual `f0c73fcc…`, restic `Fatal: failed to find snapshot: no matching ID found for prefix "resticc5ms5egca88d4616ab"`
- Steps 4–5 fail solely because step3 parity report is false

## Root-cause diagnosis (implementer must verify, then fix product)

| Failure | Likely product bug | Product files |
|--------|---------------------|---------------|
| Step 1 start | `tryStartPostgres` (restore.ts) requires promote/`in_recovery=false` and fails closed on incomplete recovery / start timeout; fire-drill uses `skipStart` + looser `startRestoredPostgres`. Window slack may admit PITR targets beyond last archived WAL without mapping to **outside available WAL**. | `restore.ts` |
| Step 3 zeros / bad restic | Baseline **emit** allowed all-zero `row_counts` and a non-listable `restic_snapshot_id` into R2; **discovery** (`resolveFireDrillBaseline`) picks latest `target_timestamp <= drill target` without rejecting empty-count or missing-restic baselines. | `recovery-baseline.ts`, `fire-drill.ts`, hooks in `base-backup.ts` / `restic-mirror.ts` |

## Critical Constraints

### MUST
- MUST make `holo restore --pitr … --target-action promote` leave a queryable scratch postmaster when WAL can reach the target, **or** fail closed with a gate-matching named error (`outside available WAL` / `no base backup` / `backup chain missing` / secrets)
- MUST emit recovery baselines with real domain `row_counts` + SHA-256 `ledger_sha256` from the capture connection (not synthetic zeros when the capture DB has domain rows)
- MUST refuse to bind/upload a baseline whose `restic_snapshot_id` is not present in the configured restic repository (or strip/replace with a verified id before upload)
- MUST select (or require) a fire-drill baseline that is restic-restorable and parity-meaningful — never prefer a zero-count / missing-snapshot baseline over a valid one when both exist
- MUST cover with RED→GREEN integration tests under `services/platform/tests/integration/`
- MUST keep dual-lens review evidence under `.tmp/GATE-FIX-QA1/`

### NEVER
- NEVER edit `gate-plan.json` assertions or `literal_cmd`s
- NEVER hand-write `gate-results.json` / `gate-verification.json` or delete `.gate-evidence/20260729T042338Z/**`
- NEVER weaken fail-closed empty-chain / corrupt-chain behavior
- NEVER mock R2 / pgBackRest / restic / Postgres for GREEN proof of the product path
- NEVER commit unrelated Sprint 27 or `.tmp` dirt from the primary tree

### STRICTLY
- STRICTLY product path only: `services/platform/src/backup/**`, related CLI wiring if needed, integration tests, task evidence
- STRICTLY TDD: failing tests first (RED commit), then GREEN, then dual-lens, then orchestrator lands

## Acceptance Criteria

### AC-1 [PRIMARY] — Scratch Postgres starts (or named outside-WAL) after promote restore
**GIVEN** a real restorable R2 chain and `holo restore --pitr <in-or-edge window> --scratch <empty> --target-action promote`
**WHEN** restore finishes
**THEN** either `overall: OK` with queryable scratch (SELECT 1 / recovery complete), **or** non-zero exit whose log matches one of: `outside available WAL`, `no base backup available`, `backup chain missing`, `backup config missing secrets` — and never sole-observe `unknown flag: --pitr` or a wipe with only truncated archive-get text
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts` (+ any new GATE-FIX-QA1 start test) exit 0
**TEST_TIER:** integration · **FLOW_REF:** CAP-BAK-01 / T-PLAT-025
**NEGATIVE_CONTROL:** would fail if start always returns started:false after successful pgBackRest restore when WAL is available; would fail if outside-WAL is mislabeled only as "Postgres failed to start" without named gate language

### AC-2 — Baseline emit refuses zero-domain / missing-restic lies
**GIVEN** capture connection with non-zero domain rows and a restic repo with a real snapshot
**WHEN** `captureAndUploadRecoveryBaseline` / restic-mirror bind hook runs
**THEN** uploaded baseline has non-zero matching domain counts (when source has them), `ledger_sha256` 64-hex matching `computeLedgerSha256` of that source, and `restic_snapshot_id` that `restic snapshots` can resolve
**GIVEN** a fake restic id not in the repo **WHEN** bind is attempted **THEN** upload is refused (ok:false) — no R2 object with that id as binding
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-recovery-baseline.test.ts` (+ GATE-FIX-QA1 cases) exit 0
**TEST_TIER:** integration · **FLOW_REF:** CAP-BAK-01 / REDHAT-FIX-C5

### AC-3 — Fire-drill discovery prefers restorable, non-empty baseline
**GIVEN** R2 contains a zero-count / missing-restic baseline and a valid baseline with `target_timestamp <=` drill target
**WHEN** `resolveFireDrillBaseline` / `runFireDrill` runs without explicit baseline id
**THEN** the valid baseline is loaded (or discovery fails closed if none valid) — never POSTGRES_PARITY fail solely because expected counts are stale zeros from a junk baseline while restored rows match live domain state
**VERIFY:** unit/integration tests on discovery selection + `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill-baseline-consume.test.ts` exit 0
**TEST_TIER:** integration · **FLOW_REF:** CAP-BAK-01

### AC-4 — Typecheck + lint clean on touched paths
**VERIFY:** `pnpm tsgo --noEmit` exit 0; `pnpm biome check services/platform/src/backup/ services/platform/tests/integration/sprint28-*.ts` exit 0

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Promote restore yields started queryable PG or named outside-WAL | AC-1 | AC-1 VERIFY |
| TC-2 | Baseline emit refuses missing restic id; captures real counts/ledger | AC-2 | AC-2 VERIFY |
| TC-3 | Discovery does not select junk zero/missing-restic baseline over valid | AC-3 | AC-3 VERIFY |
| TC-4 | tsgo + biome clean | AC-4 | AC-4 VERIFY |

## Guardrails

**WRITE-ALLOWED:**
- `services/platform/src/backup/restore.ts`
- `services/platform/src/backup/fire-drill.ts`
- `services/platform/src/backup/recovery-baseline.ts`
- `services/platform/src/backup/base-backup.ts` (hook only if needed)
- `services/platform/src/backup/restic-mirror.ts` (hook only if needed)
- `services/platform/src/backup/index.ts` (exports only if needed)
- `services/platform/tests/integration/sprint28-*.ts` (extend or add GATE-FIX-QA1 tests)
- `.tmp/GATE-FIX-QA1/**` evidence
- this task file (status only via sync-status — orchestrator)

**WRITE-PROHIBITED:**
- `gate-plan.json`, `gate-results.json`, `gate-verification.json`, `.gate-evidence/**`
- Unrelated Sprint 27 product paths not required for this fix
- Hand-edited SPRINT progress/status (orchestrator owns)

## Verification Gates

1. RED evidence: new/extended tests fail on pre-fix HEAD for the three bugs
2. GREEN: AC-1…AC-4 VERIFY exit 0 on real services where PLATFORM_IT requires them
3. Dual-lens APPROVED (product + technical)
4. Orchestrator lands on `main`; implementer never merges

## Dependencies

- depends_on: REDHAT-FIX-C5, REDHAT-FIX-H1, REDHAT-FIX-H2 (landed)
- blocks: independent human-gate re-pass for Sprint 28 (orchestrator will **not** run final QA in this cycle — land only)

## Implementation hints (non-binding)

1. **Start path:** Reuse / share fire-drill’s short socket dir + promote wait; when recovery ends before target, map to `outside available WAL` (named). Tighten PITR window to last archived WAL when known.
2. **Emit:** After building baseline, verify restic id via `restic snapshots --json` / `restic cat` before `uploadRecoveryBaseline`. Refuse all-zero domain map only when capture connection proves tables exist with COUNT>0 and counts were empty due to wrong DB — or always re-query domain tables at emit and fail if `missing_tables` non-empty for required set.
3. **Discovery:** Score candidates: reject if `restic_snapshot_id` not in repo (when restic reachable) or if all domain counts are 0 while a sibling candidate has counts>0; sort by `target_timestamp` among survivors.

## Runtime

```
test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-recovery-baseline.test.ts services/platform/tests/integration/sprint28-fire-drill-baseline-consume.test.ts services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts services/platform/tests/integration/sprint28-restore-fails-closed.test.ts
typecheck: pnpm tsgo --noEmit
lint:      pnpm biome check services/platform/src/backup/
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-QA1",
  "sprint": "sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill",
  "requirements": [
    {"id": "AC-1", "type": "AC", "text": "Scratch Postgres starts after promote restore or named outside-WAL fail-closed"},
    {"id": "AC-2", "type": "AC", "text": "Baseline emit captures real counts/ledger and refuses missing restic ids"},
    {"id": "AC-3", "type": "AC", "text": "Fire-drill discovery prefers restorable non-empty baseline"},
    {"id": "AC-4", "type": "AC", "text": "Typecheck and lint clean"},
    {"id": "TC-1", "type": "TC", "maps_to": "AC-1"},
    {"id": "TC-2", "type": "TC", "maps_to": "AC-2"},
    {"id": "TC-3", "type": "TC", "maps_to": "AC-3"},
    {"id": "TC-4", "type": "TC", "maps_to": "AC-4"}
  ],
  "tdd_mode": "red_first",
  "write_allowed": [
    "services/platform/src/backup/",
    "services/platform/tests/integration/sprint28-",
    ".tmp/GATE-FIX-QA1/"
  ],
  "write_prohibited": [
    "gate-plan.json",
    "gate-results.json",
    "gate-verification.json",
    ".gate-evidence/"
  ],
  "qa_run_id": "20260729T042338Z"
}
-->
