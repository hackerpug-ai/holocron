# Sprint 21 gate tombstone (S31-FE-06)

This file records **absences** only. It creates **0** gate evidence files and
back-fills **0** CI wiring. Sprint 21's human/CI gate for
`holo verify:client-contract` was never executed as specified.

## Recorded absences

### 1. No `.gate-evidence` directories under Sprint 21

Sprint 21 holds 0 .gate-evidence directories under
`.spec/prds/mk6-migration/tasks/sprint-21-client-data-contract/`.

### 2. No `gate-results.json` under Sprint 21

Sprint 21 holds 0 gate-results.json files under
`.spec/prds/mk6-migration/tasks/sprint-21-client-data-contract/`.

### 3. `verify:client-contract` never wired into CI workflows

`grep -rn verify:client-contract .github/workflows/` returns 0 matches
while S-CONTRACT-03 AC-5 requires it in `ci-fast.yml`. That wiring was never
landed; this tombstone does not add it (Out of Scope for S31-FE-06).

### 4. Empty negative fixture directory

`.tmp/client-contract/negative/` holds 0 files, so the Sprint 21 negative
controls TC-3 and TC-4 could not execute against real fixture inputs.

## What this tombstone deliberately does not do

- Does **not** create `gate-results.json` or any `.gate-evidence/` path.
- Does **not** edit `.github/workflows/**`.
- Does **not** seed `.tmp/client-contract/negative/**`.
- Does **not** claim the Sprint 21 gate passed.

## Successor authority (post S31-FE-06)

- RN Convex residue: `holo verify:no-convex-client`
- Frozen contract internal consistency: `holo verify:client-contract` against
  the FROZEN_HISTORICAL yaml (coordinates historical; not current source truth)
- Retired: `holo inventory:convex-callsites`
