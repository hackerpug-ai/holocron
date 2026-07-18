# etl-6 — Verify export completeness and migration integrity

> Status: Planned · Sprint: 14 · Agent: convex-reviewer · Proposed By: convex-planner

## Outcome

Independently verify that the migration consumes the complete Convex export and source catalog, every intentional drop/merge/regenerate/archive has approval, every retained object has parity evidence, and the ETL report is not a self-certified proxy.

## Acceptance Criteria

### AC-1 — source completeness
Compare export manifest/table/field/storage inventory to the catalog and ETL report; any missing source relation, field, object, or unmapped disposition is blocking.
**VERIFY:** completeness CLI/report and seeded missing-entry fixture exit nonzero.

### AC-2 — independent integrity review
Recompute target counts/formulas, map checksums, FK/null audit, status violations, vector sanity, and blob manifest parity from raw Postgres/filesystem evidence; reviewer report names all commands and sources.
**VERIFY:** independent report has zero unexplained variance and no CRITICAL/HIGH finding.

### AC-3 — provenance and replay proof
Confirm archive/catalog hashes, reachable implementation commits, preserved rejected runs, and a second immutable-archive run with stable map/blob counts and no duplicates.
**VERIFY:** provenance audit and replay evidence are hash-bound to HEAD.

## Test Criteria

- **TC-1:** missing catalog entry is detected independently.
- **TC-2:** altered ETL report cannot pass without matching raw evidence.
- **TC-3:** replay produces stable map/blob/checksum results.

## Guardrails

Reviewer must not rely on implementer summaries, green test-suite proxy, or claimed counts; must inspect raw export, Postgres queries, blob bytes, and commit ancestry. Do not modify implementation during review.

<!-- REQUIREMENT-CONTRACT v1
{"requirements":[{"id":"AC-1","kind":"acceptance","tier":"integration","description":"complete catalog/export coverage","verification":"independent inventory report"},{"id":"AC-2","kind":"acceptance","tier":"integration","description":"independent raw integrity review","verification":"recomputed counts/FK/vector/blob evidence"},{"id":"AC-3","kind":"acceptance","tier":"integration","description":"hash-bound provenance/replay","verification":"archive/catalog/HEAD audit"},{"id":"TC-1","kind":"test","tier":"integration","description":"missing source detection"},{"id":"TC-2","kind":"test","tier":"integration","description":"report forgery rejection"},{"id":"TC-3","kind":"test","tier":"integration","description":"stable replay"}]}
-->
