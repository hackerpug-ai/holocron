# etl-2 — Vector regeneration + catalog-derived reconciliation report + NULL-FK audit gates

> Status: Planned · Sprint: 14 · Agent: mastra-implementer · Proposed By: mastra-planner

## Outcome

ETL-time vector regeneration uses the real local fleet and the canonical `embed()` seam; catalog-derived reconciliation reports source counts, formulas, approved exceptions, checksums/samples, FK results, and zero unexplained variance.

## Acceptance Criteria

### AC-1 — resumable complete vector regeneration
`holo etl:vectors` regenerates passages from source text, never copies legacy vectors, writes non-null `vector(1024)` values with model/version metadata, guarantees ≥1 passage for every non-empty document, checks unit norm, proves the live fleet endpoint and past-8K retrieval, and resumes with `WHERE embedding IS NULL`/safe leases after interruption.
**VERIFY:** real fleet run and SQL dimension/non-null/norm query; fleet-down negative control pauses/fails closed.

### AC-2 — catalog-derived reconciliation report
`holo etl:reconcile` emits a versioned machine-readable report containing every source count, expected-target formula, merge/drop/regenerate approval, checksum/sample, retained-object manifest result, and FK result; it exits nonzero on any unexplained variance.
**VERIFY:** current fixture green and seeded count/approval drift red.

### AC-3 — NULL-FK and status gates
`holo etl:fk-audit` checks every migrated FK and nullable relationship according to catalog rules, distinguishes approved nullable fields from broken references, and returns `orphans=0` only when all constraints pass.
**VERIFY:** orphan fixture exits 1; clean real database exits 0.

## Test Criteria

- **TC-1 integration:** real fleet embedding produces exactly 1024 dimensions, no null embedding, ≥1 passage per non-empty document, unit-norm checks, and the past-8K retrieval assertion.
- **TC-2 negative:** missing/short fleet response never creates a fabricated vector or green result.
- **TC-3 integration:** seeded reconciliation variance and NULL-FK orphan each fail independently.

## Guardrails

No copied vectors, cloud embedder, silent exception, or count-only “green” report. Reconciliation output is machine-readable, source-catalog revisioned, and includes checksums/samples and approved-exception IDs.

<!-- REQUIREMENT-CONTRACT v1
{"requirements":[{"id":"AC-1","kind":"acceptance","tier":"integration","description":"resumable real 1024-dim vector regeneration","verification":"fleet + SQL sanity"},{"id":"AC-2","kind":"acceptance","tier":"integration","description":"catalog-derived zero variance","verification":"green and seeded variance CLI runs"},{"id":"AC-3","kind":"acceptance","tier":"integration","description":"NULL-FK/status gate","verification":"clean and orphan fixtures"},{"id":"TC-1","kind":"test","tier":"integration","description":"real fleet vector dimension/non-null"},{"id":"TC-2","kind":"test","tier":"integration","description":"fleet failure fail-closed"},{"id":"TC-3","kind":"test","tier":"integration","description":"variance and orphan negatives"}]}
-->
