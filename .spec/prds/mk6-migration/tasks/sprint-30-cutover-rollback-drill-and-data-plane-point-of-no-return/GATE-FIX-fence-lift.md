# GATE-FIX-fence-lift: Durable fence lift must disarm sticky process.env
> Status: ✅ Completed
> Commit: 7ffa75db08819705b1e9c707a92411cd6a3542d7
> Reviewer: product-manager+test-quality-reviewer
> Completed: 2026-08-07T07:36:05Z

> **Task ID:** GATE-FIX-fence-lift
> **Sprint:** [Sprint 30 — Cutover Rollback Drill and Data-Plane PONR](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Type:** FIX
> **Priority:** P0
> Status: In Progress

## Source

Human-gate `gate-results.json` run `20260807T071500Z`:

- **Step 4 FAIL** — `cutover:enable-writes --json` → `CONVEX_ESCAPE_HATCH_DIVERGED` (first runs) then after watermark refresh → `FIRST_WRITE_FAILED` HTTP **423** `migration_read_only` despite durable `HOLO_MIGRATION_READ_ONLY: "0"`.
- **Step 5 FAIL** — cascade: no PONR row → `cutover:rollback-repoint` still succeeds (`repointed:true`) instead of `POST_PONR_INELIGIBLE`.

## Root cause (proven)

`isMigrationReadOnly()` in `services/platform/src/cutover/soak-fence.ts`:

1. process.env truthy (`'1'`/`'true'`) → **armed** (returns early)
2. durable secrets truthy → armed
3. else disarmed

Production/server boot loads secrets into `process.env` via `applyConsolidatedSecretsToEnv` when the fence was `'1'`. That sticky env value **never updates** when another process (`cutover:enable-writes` CLI) writes durable `'0'` to the mounted `secrets.yaml`.

Repro (host):

```
setMigrationReadOnlyEnv('1')  // sticky server boot
// durable file written to "0" by CLI
isMigrationReadOnly() === true  // BUG — still armed
```

`writeDurableMigrationReadOnly('0')` only mutates durable + the **CLI** process env; the serving process keeps env=`1` and keeps returning HTTP 423.

R2-C01 correctly made durable `'1'` override env `'0'` for **arm**. The inverse — durable `'0'` must **disarm** sticky env `'1'` — is required for `cutover:enable-writes` / UC-SYNC-04 PONR.

## Acceptance Criteria

- [x] **AC-1** GIVEN sticky `process.env.HOLO_MIGRATION_READ_ONLY='1'` AND durable secrets `HOLO_MIGRATION_READ_ONLY='0'` WHEN `isMigrationReadOnly()` is called THEN it returns `false`.
- [x] **AC-2** GIVEN `process.env='0'` AND durable `'1'` WHEN `isMigrationReadOnly()` THEN `true` (R2-C01 arm path unchanged).
- [x] **AC-3** GIVEN a pre-existing serving process that booted with fence armed (sticky env `1`) WHEN `cutover:enable-writes` lifts durable to `0` THEN `POST /api/documents` returns HTTP 201 (not 423) and a `data_plane_ponr` row is recorded (or `already_recorded` if prior PONR).
- [x] **AC-4** After land, human gate steps 4 and 5 are re-runnable to green (enable-writes ok; post-PONR rollback-repoint refuses with `POST_PONR_INELIGIBLE`).

## Implementation guidance

**Preferred semantics** (minimal change, preserves R2-C01):

```ts
export function isMigrationReadOnly(env = process.env): boolean {
  const durable = readDurableMigrationReadOnly(env);
  // Explicit durable lift wins over sticky process.env (enable-writes / PONR).
  if (durable === '0' || durable === 'false') return false;
  if (isTruthyFenceValue(env[MIGRATION_READ_ONLY_ENV])) return true;
  if (isTruthyFenceValue(durable)) return true;
  return false;
}
```

Update the file header comment to document durable-lift disarm.

**Files:**

- `services/platform/src/cutover/soak-fence.ts` — fix `isMigrationReadOnly`
- Add/extend unit or integration test proving AC-1 + AC-2 (and ideally AC-3 via existing sprint30 PONR harness)
- Do **not** weaken CONVEX_ESCAPE_HATCH_DIVERGED or PONR latch behavior

**Verify:**

```bash
# unit/integration for sticky-env lift
cd services/platform && bun test  # or targeted vitest for soak-fence / sprint30-ponr

# optional live: against a server booted with fence=1 using current worktree code
HOLO_VERIFY_BASE_URL=http://127.0.0.1:<port> bun services/platform/src/cli/holo.ts cutover:enable-writes --json
```

## Negative controls

- MUST NOT: allow env `'1'` to re-arm after durable explicit `'0'` without rewriting durable.
- MUST NOT: break R2-C01 (durable `'1'` still arms when env is `'0'`).
- MUST NOT: cache fence state at module load.

## Evidence

Store under `.tmp/GATE-FIX-fence-lift/`.
