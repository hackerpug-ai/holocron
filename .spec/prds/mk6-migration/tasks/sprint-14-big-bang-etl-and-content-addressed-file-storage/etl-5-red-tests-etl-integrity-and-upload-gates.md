# etl-5 — RED tests for ETL integrity and upload gates

> Status: Completed · Sprint: 14 · Agent: red-test-generator · Proposed By: red-test-generator

## Outcome

Write failing, scenario-backed tests before implementation for zero variance, NULL-FK=0, 1024-dim regenerated vectors, blob parity/Range, immutable-archive idempotency, and upload no-orphan behavior. Tests must exercise the real service seam in green and have seeded negative controls.

## Acceptance Criteria

### AC-1 — real gate entrypoints exist
Tests and documented CLI invocations cover all seven Sprint 14 human steps against a real immutable export archive without mocks substituting Postgres, fleet, filesystem, or Hono.
**VERIFY:** RED-start run proves missing etl/blob/upload surfaces fail; scenario contracts validate.

### AC-2 — negative controls have teeth
Seeded variance, orphan FK, wrong vector dimension, byte/hash mismatch, duplicate replay, and upload mismatch each produce nonzero/failure evidence rather than skip-to-green.
**VERIFY:** each negative command has exit/status assertion and zero false-pass check.

### AC-3 — deterministic evidence
Fixtures are immutable/hashed, generated IDs and expected formulas are stable, and each test records raw output, exit, and source fixture revision.
**VERIFY:** two runs have equal evidence fingerprints where determinism is required.

## Test Criteria

- **TC-1 RED:** run tests at the pre-implementation base and capture named missing-surface failures.
- **TC-2 GREEN:** after implementation, the real Postgres/fleet/blob/Hono backend gate suite passes; Sprint 26 owns the RN e2e portion of T-DATA-021.
- **TC-3 negative:** all seeded controls fail for the intended reason.

## Guardrails

No synthetic “all green” fixtures, mocks of external services, test-only production branches, or assertions that only inspect string presence. Keep fixtures free of secrets and preserve rejected evidence.

<!-- REQUIREMENT-CONTRACT v1
{"requirements":[{"id":"AC-1","kind":"acceptance","tier":"integration","description":"real gate coverage","verification":"RED and green CLI contracts"},{"id":"AC-2","kind":"acceptance","tier":"integration","description":"negative controls fail closed","verification":"seeded exits/statuses"},{"id":"AC-3","kind":"acceptance","tier":"integration","description":"deterministic provenance evidence","verification":"fixture/evidence fingerprints"},{"id":"TC-1","kind":"test","tier":"integration","description":"RED against start"},{"id":"TC-2","kind":"test","tier":"integration","description":"real-service GREEN"},{"id":"TC-3","kind":"test","tier":"integration","description":"negative controls"}]}
-->
