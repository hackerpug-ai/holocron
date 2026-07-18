# mission-5 — RED tests for contracts/runtime/commit and real-service failure controls

> Status: Completed · Sprint: 15 · Agent: red-test-generator · Proposed By: red-test-generator

## Outcome

Create RED-against-start tests and independently verify the complete Mission Engine against real Postgres, real subprocesses, the real service/auth boundary, and real fleet/telemetry seams. The gate must fail closed rather than skip or substitute mocks.

## Acceptance Criteria

### AC-1 — scenario-backed RED coverage
Before implementation, tests fail for missing contract/compiler/schema, run/resume, commit/replay, budget, CLI, and HTTP surfaces. Each scenario has deterministic setup, expected failure, and zero-pass false-positive evidence.

### AC-2 — real-service failure controls
The RED suite has real Postgres/subprocess/HTTP/fleet scenarios for unknown role/no-cloud fallback, unknown stage/schema, executable payload, lease race, SIGKILL, commit crash, replay conflict, budget exceeded, 401/403, and no partial row. Each fails for the intended reason rather than skipping.

### AC-3 — deterministic RED evidence
Each scenario records raw exit/status, database assertions, source/template hash, and a named missing-surface failure against the implementation start state. The test plan distinguishes pure compiler rejection cases from mandatory real-service cases.

## Test Criteria

- TC-1 RED: capture named missing-surface failures before implementation.
- TC-2 real-service failure controls: execute the Postgres/subprocess/HTTP/fleet negatives with no skip-to-green path.
- TC-3 deterministic evidence: capture named RED failures, raw outputs, and DB zero-write assertions.
- TC-4 handoff: provide the green/review task with the exact gate scenarios and provenance requirements.

## Guardrails

No synthetic “all green” fixtures, mocks of Postgres/fleet/subprocess durability, wholesale test-suite invocation as human proof, or silent skip when dependencies are unavailable. Test-only crash hooks must be deterministic and explicit; production paths remain fail closed. This task writes RED coverage only; it does not self-review or self-certify GREEN.

<!-- REQUIREMENT-CONTRACT v1
{"requirements":[{"id":"AC-1","kind":"acceptance","tier":"integration","description":"RED scenario coverage","verification":"start-state failing tests"},{"id":"AC-2","kind":"acceptance","tier":"integration","description":"real-service failure controls","verification":"Postgres/subprocess/HTTP/fleet negatives"},{"id":"AC-3","kind":"acceptance","tier":"integration","description":"deterministic RED evidence","verification":"raw output and zero-write assertions"},{"id":"TC-1","kind":"test","tier":"integration","description":"RED against start","verification":"named failures"},{"id":"TC-2","kind":"test","tier":"integration","description":"real failure controls","verification":"fail-closed outcomes"},{"id":"TC-3","kind":"test","tier":"integration","description":"deterministic evidence","verification":"raw outputs and DB assertions"},{"id":"TC-4","kind":"handoff","tier":"review","description":"gate handoff","verification":"exact scenarios and provenance"}]}
-->
