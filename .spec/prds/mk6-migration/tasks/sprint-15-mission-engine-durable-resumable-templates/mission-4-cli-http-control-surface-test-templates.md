# mission-4 — CLI/HTTP control surface and deterministic test templates

> Status: Planned · Sprint: 15 · Agent: mastra-implementer · Proposed By: mastra-planner

## Outcome

Expose the Mission Engine through real CLI and authenticated Hono handlers, and provide committed deterministic templates/stages used by the human gate without migrating Sprint 17 research behavior.

## Acceptance Criteria

### AC-1 — CLI surfaces
Implement `holo mission template:register`, `holo mission run <template> --goal ... --idempotency-key ...`, `holo mission resume <run-id>`, and `holo mission status <run-id>`. JSON output contains persisted run ID/status/provenance/output/replay values; invalid input returns nonzero without a run row.

### AC-2 — authenticated HTTP surfaces
Replace mission placeholder responses with scoped real handlers for create/status/steer/verdict; resume remains a CLI/subprocess operation in Sprint 15. Per the API constitution, the RN API key is canonical for all `/api/missions*` routes; the control key may be retained as an administrative alias only if documented. Unkeyed requests return 401, wrong scopes return 403, valid callers read/write only their authorized run, and responses are derived from Postgres rather than canned JSON. Add real steer and verdict persistence tests.

### AC-3 — deterministic templates and real fleet proof
Commit `test.echo`, `test.sigkill`, and `test.budget` templates with code-owned stages, typed schemas, deterministic outputs, explicit checkpoint/crash controls, and no arbitrary executable config. Each gate template includes a real `resolveModel(role)`/fleet-manifest probe stage and fails closed on missing role, unreachable fleet, or cloud fallback. Keep existing `mission run research --goal` compatibility behavior intact.

## Test Criteria

- TC-1 RED: CLI and HTTP placeholders fail the real contract at start state.
- TC-2 CLI gate: register/run/status/resume/replay through real Bun CLI against `holocron_nonprod`.
- TC-3 HTTP security: real Hono requests prove 401/403/200 behavior and no canned data.
- TC-4 deterministic template: repeated runs produce identical typed output and provenance except run IDs/timestamps.

## Guardrails

Do not expose an unauthenticated mission control plane. Do not migrate the research template or implement full Fulcrum human-policy semantics here. Update the scoped-key tests/docs if the control alias remains; RN permission must match `04-api-design.md`. Do not accept raw stage definitions from CLI/HTTP as executable behavior.

<!-- REQUIREMENT-CONTRACT v1
{"requirements":[{"id":"AC-1","kind":"acceptance","tier":"integration","description":"real CLI surfaces","verification":"Bun CLI against Postgres"},{"id":"AC-2","kind":"acceptance","tier":"integration","description":"authenticated HTTP control","verification":"real 401/403/200 requests"},{"id":"AC-3","kind":"acceptance","tier":"integration","description":"deterministic gate templates","verification":"committed registry/template inspection"},{"id":"TC-1","kind":"test","tier":"integration","description":"RED placeholders","verification":"start-state failure"},{"id":"TC-2","kind":"test","tier":"integration","description":"CLI human gate","verification":"real commands"},{"id":"TC-3","kind":"test","tier":"integration","description":"HTTP authorization","verification":"real service requests"},{"id":"TC-4","kind":"test","tier":"integration","description":"deterministic output","verification":"repeated run comparison"}]}
-->
