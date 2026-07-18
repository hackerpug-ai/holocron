# mission-6 — Full real gate, adversarial durability review, and closure evidence

> Status: Planned · Sprint: 15 · Agent: mastra-reviewer · Proposed By: mastra-reviewer

## Outcome

Independently validate the implemented Mission Engine against every Sprint 15 contract and drive the human gate to provenance-valid closure. This task is downstream-only: it does not author implementation or certify its own changes.

## Acceptance Criteria

### AC-1 — full real gate
Against real `holocron_nonprod`, real Bun subprocesses, the real authenticated Hono service, and a live fleet role endpoint, execute all seven gate steps. The gate proves typed output, exact template/compiler/registry/executor/schema/fleet-manifest/model-revision provenance, closed-DSL rejection, checkpointed SIGKILL resume, atomic commit rollback, idempotent replay, explicit budget termination, and RN status/steer/verdict persistence.

### AC-2 — adversarial review
Review source, migrations, tests, and raw evidence for serialized executable payloads, runtime DDL, placeholder responses, unpinned resume, lease bypass, duplicate commit/telemetry, cloud fallback, swallowed crash, scope drift from `04-api-design.md`, and fakeable/wholesale human-test evidence. Unknown role/unreachable fleet and malformed controls must fail closed.

### AC-3 — closure evidence
Produce `gate-plan.json`, `gate-results.json`, `gate-verification.json`, `GATE-RESULTS.md`, independent review, and a closure audit bound to the implementation source head and template/archive hashes. Closure is blocked on any CRITICAL/HIGH/MEDIUM finding, failed real dependency, missing raw step, or provenance mismatch.

## Test Criteria

- TC-1: all seven real gate commands execute sequentially and pass with raw outputs.
- TC-2: independent reviewer recomputes status from raw evidence and database observations.
- TC-3: negative controls remain fail-closed after GREEN.
- TC-4: task/sprint/roadmap status changes are committed only after review and gate verification.

## Guardrails

No self-review by the implementer, no synthetic evidence, no test-suite substitution for human steps, no waived fleet/auth/dependency failures, and no closure based solely on a child agent’s report.

<!-- REQUIREMENT-CONTRACT v1
{"requirements":[{"id":"AC-1","kind":"acceptance","tier":"integration","description":"full real gate","verification":"seven raw commands"},{"id":"AC-2","kind":"acceptance","tier":"review","description":"adversarial durability review","verification":"independent source/evidence review"},{"id":"AC-3","kind":"acceptance","tier":"review","description":"provenance-bound closure","verification":"gate artifacts and source hash"},{"id":"TC-1","kind":"test","tier":"integration","description":"real gate execution","verification":"sequential raw output"},{"id":"TC-2","kind":"test","tier":"review","description":"independent recomputation","verification":"review audit"},{"id":"TC-3","kind":"test","tier":"integration","description":"negative controls","verification":"fail closed"},{"id":"TC-4","kind":"test","tier":"review","description":"canonical closure","verification":"status commits"}]}
-->
