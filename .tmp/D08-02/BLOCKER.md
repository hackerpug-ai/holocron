# D08-02 BLOCKER — Pre-deletion inventory authorization RED

## Gate (contract CRITICAL CONSTRAINT)

```
mkdir -p .tmp/D08-02
bun services/platform/src/cli/holo.ts verify:decommission-inventory --json \
  | tee .tmp/D08-02/decommission-inventory.pre-delete.json
jq -e '.ok == true and .unclassified_count == 0 and .sole_implementation_count == 0' \
  .tmp/D08-02/decommission-inventory.pre-delete.json
```

**Result:** FAIL CLOSED. No source deletion performed.

## Captured predicates

| field | required | actual |
|-------|----------|--------|
| ok | true | false |
| unclassified_count | 0 | 132 |
| sole_implementation_count | 0 | 2 |
| walked_file_count | (informational) | 260 |
| typecheck_blocker_count | (informational) | 0 |

## Sole-implementation hardcodes (stale vs platform ports)

`services/platform/src/mission/verify-decommission-inventory.ts` hardcodes:

- `convex/chat/specialists.ts`
- `convex/taskCrons.ts`

Platform replacements already exist (Sprint 31 ports):

- `services/platform/src/chat/specialists.ts` (UC-SVC-03 ported specialist table)
- `services/platform/src/queue/jobs-handlers/*` (16 cron side-effect ports, including task-timeout-worker from taskCrons)

S31-CX-05 tests still **assert** `ok=false` and `sole_implementation_count >= 2` — inventory was landed as a fail-closed scanner, not driven to green.

## Unclassified residue

132 files under `convex/` have no disposition rule (queries, validators, pure helpers, tests, etc.). Classifier only resolves:

- sole-implementation (hardcoded list)
- archive (.bak)
- infrastructure (_generated, tsconfig, README, convex.config)
- migrated-stub (body contains MIGRATED_TO_MISSION_ENGINE)
- runtime-fenced (migrationFence / fenced builders)
- drop (schema.ts only)

Everything else → unclassified → blocks deletion.

## Why D08-02 cannot self-unblock

SCOPE.writeAllowed does **not** include:

- `services/platform/src/mission/verify-decommission-inventory.ts` (classifier)

Only the inventory **test** is writeAllowed for post-removal behavior. Contract says fail closed before any deletion. Deleting `convex/` without green authorization would violate AC-1 and Sprint 32 hard-block language.

## Unblock condition

A pre-D08-02 / S31-CX-05 completion (or scoped inventory-green follow-up) must:

1. Clear or re-resolve `SOLE_IMPLEMENTATION_FILES` now that platform ports exist.
2. Add disposition rules so every remaining convex file classifies as an authorized-to-delete form (migrated-stub / runtime-fenced / infrastructure / archive / drop) — `unclassified_count=0`.
3. Update `verify-decommission-inventory.test.ts` expectations from RED refusal to green authorization (or post-tree-absent behavior).
4. Prove: `jq -e '.ok == true and .unclassified_count == 0 and .sole_implementation_count == 0'`.

Then re-dispatch D08-02 for archive + dependency/source cleanup + `verify:no-convex` GREEN.

## Evidence artifacts

- `.tmp/D08-02/decommission-inventory.pre-delete.json` — full refusal inventory
- `.tmp/D08-02/inventory-gate-summary.json` — compact predicates
- `.tmp/D08-02/inventory-gate-blocker-probe.txt` — probe transcript
