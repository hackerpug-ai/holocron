# service-4 — RED tests: unkeyed→401, wrong-scope→403, keyed→200, shared-schema identity, /health

## What this does

Author the RED test suite that proves each Sprint 05 gate FAILS against the absent/stubbed start state before the implementation makes it pass — the negative-control backbone that makes the 401/403/200 boundary, shared-schema identity, and /health readiness un-fakeable.

Provides: red-test-suite, negative-controls.

## Why

- A gate is only real if the test fails when the behavior is absent. These five tests are written against service-1/2/3's no-middleware / no-registry / stubbed-probe start states and must go RED first.
- They are the determinism seam: no mocks, no view-injection — they drive the real booted service and assert concrete HTTP codes / `===` identity / readiness booleans.
- Grounded in: T-PLAT-005/006/007, brain/docs/TESTING-HIERARCHY.md, brain/docs/TDD-METHODOLOGY.md, and the sprint-04 schema-5 RED-suite pattern.

## How to verify

- RED phase: `PLATFORM_IT=1 pnpm vitest run tests/integration/service-*.test.ts` → exits nonzero (all five tests fail before service-1/2/3 implementation).
- GREEN phase (after service-1/2/3 land): same command → Exit 0.
- `pnpm tsgo --noEmit` clean · `pnpm biome check tests/integration/` clean.

## Scope

Writes: `tests/integration/service/unkeyed-401.test.ts (NEW)` · `tests/integration/service/wrong-scope-403.test.ts (NEW)` · `tests/integration/service/keyed-200.test.ts (NEW)` · `tests/integration/service/schema-identity.test.ts (NEW)` · `tests/integration/service/health-readiness.test.ts (NEW)`.
Prohibited: `services/platform/src/** (implementation is service-1/2/3)` · `convex/** (read-only legacy)` · `app/** (not this sprint)`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: service-4 — RED tests: unkeyed→401, wrong-scope→403, keyed→200, shared-schema identity, /health
================================================================================

TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=red-test-generator | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: True)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 5 — Mastra Service and Scoped-Key Auth](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run tests/integration/service/
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Five integration tests exist that each FAIL (RED) against service-1/2/3's absent/stubbed start state and PASS (GREEN) once the real behavior is present — capturing RED evidence first and asserting concrete HTTP codes, `===` schema identity, and readiness booleans, with no mocks.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST write one RED test per Sprint 05 gate (unkeyed-401, wrong-scope-403, keyed-200, schema-identity, health-readiness)
- MUST drive the REAL booted service (PLATFORM_IT=1) — no mocked DB, no mocked fleet, no mocked Hono
- MUST assert concrete values (HTTP 401/403/200, `===` identity, readiness booleans), never "renders/works"
- MUST capture RED evidence (the failing run output) before any GREEN run
- NEVER use a mock HTTP client, mock Postgres, or stubbed middleware in these tests
- NEVER assert below the rendered surface (no internal-function assertions that pass without the real service)
- NEVER mark a RED test GREEN by weakening the assertion (lowering a code, swapping `===` for deep-equal)
- STRICTLY each test must FAIL when its gate's behavior is absent and PASS only when present
- STRICTLY the RED run must exit nonzero before service-1/2/3 implementation

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: unkeyed-401 RED test fails before middleware, passes after (asserts HTTP 401)
- [ ] AC-2: wrong-scope-403 RED test fails before scope check, passes after (asserts HTTP 403)
- [ ] AC-3: keyed-200 RED test fails with stubbed validation, passes with real (asserts HTTP 200)
- [ ] AC-4: schema-identity RED test fails with duplicates, passes without (asserts `===` identity)
- [ ] AC-5: health-readiness RED test fails with stubbed probes, passes with real (asserts the 3 readiness booleans)
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check tests/integration/` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (RED→GREEN — each gate proven by a failing test against the start state)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] RED: unkeyed→401 fails when middleware bypassed (flow_ref T-PLAT-007)
  GIVEN the Mastra service is booted WITHOUT scoped-key middleware applied
  WHEN  the unkeyed-401 test runs
  THEN  it FAILS (RED) before middleware exists and PASSES after — asserting HTTP 401
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: none
  SCENARIO — start_ref: mastra_service_no_middleware · evidence: stdout
    NEGATIVE_CONTROL: would fail if middleware bypassed; test does not assert HTTP 401; the required object/config is absent or a no-op stub
    MUST_OBSERVE: RED run exits nonzero (code 1+) before middleware is added; after middleware, unkeyed-401 test passes (exit code 0); test asserts HTTP 401 status code
    MUST_NOT_OBSERVE: RED test exits code 0 before implementation (false pass); test asserts 0 things (no HTTP 401); static stub passes with no real check

AC-2 RED: wrong-scope→403 fails when scope check missing (flow_ref T-PLAT-007)
  GIVEN the Mastra service is booted WITHOUT scope enforcement
  WHEN  the wrong-scope-403 test runs
  THEN  it FAILS (RED) before the scope check exists and PASSES after — asserting HTTP 403
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: none
  SCENARIO — start_ref: mastra_service_no_scope_check · evidence: stdout
    NEGATIVE_CONTROL: would fail if middleware missing scope enforcement; test does not assert HTTP 403; the required object/config is absent or a no-op stub
    MUST_OBSERVE: RED run exits nonzero (code 1+) before scope check is added; after impl, wrong-scope-403 test passes (exit code 0); test asserts HTTP 403 status code
    MUST_NOT_OBSERVE: RED test exits code 0 before implementation; test asserts 0 things (no HTTP 403); static stub passes

AC-3 RED: keyed→200 fails when key validation stubbed (flow_ref T-PLAT-007)
  GIVEN the Mastra service is booted with STUBBED key validation (always valid)
  WHEN  the keyed-200 test runs
  THEN  it FAILS (RED) with stubbed validation and PASSES with real validation — asserting HTTP 200
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: none
  SCENARIO — start_ref: mastra_service_stubbed_key_validation · evidence: stdout
    NEGATIVE_CONTROL: would fail if test does not fail with stubbed validation; test passes without a real key store; test does not assert HTTP 200; the required object/config is absent or a no-op stub
    MUST_OBSERVE: RED run exits nonzero (code 1+) with stubbed key validation; real validation => keyed-200 test passes (exit code 0); test asserts HTTP 200 status code
    MUST_NOT_OBSERVE: RED test exits code 0 with stubbed validation; test asserts 0 things (no HTTP 200); static HTTP 200 with no key check

AC-4 RED: shared-schema identity fails when duplicate validation exists (flow_ref T-PLAT-006)
  GIVEN the shared tool registry has a duplicate `.parse()` layer (MCP re-parses schemas)
  WHEN  the schema-identity test runs
  THEN  it FAILS (RED) while duplicates exist and PASSES once deduped — asserting `===` identity
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: none
  SCENARIO — start_ref: registry_with_duplicate_validation · evidence: stdout
    NEGATIVE_CONTROL: would fail if test does not fail with duplicates; test passes without checking `===` equality; test does not assert schema identity; the required object/config is absent or a no-op stub
    MUST_OBSERVE: RED run exits nonzero (code 1+) while duplicate validation exists; dedup => schema-identity test passes (exit code 0); test asserts === identity (exactly 1 shared schema instance)
    MUST_NOT_OBSERVE: RED test exits code 0 with duplicates present; test asserts deep-equality instead of === (0 identity); static stub passes

AC-5 RED: /health fails when probes are stubbed (flow_ref T-PLAT-005)
  GIVEN `/health` returns a static response WITHOUT probing
  WHEN  the health-readiness test runs
  THEN  it FAILS (RED) with stubbed probes and PASSES with real probes — asserting the 3 readiness booleans
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-service · TDD_STATE: none
  SCENARIO — start_ref: health_with_stubbed_probes · evidence: stdout
    NEGATIVE_CONTROL: would fail if test does not fail with stubbed probes; test passes with a static response; test does not assert real readiness; the required object/config is absent or a no-op stub
    MUST_OBSERVE: RED run exits nonzero (code 1+) with stubbed /health probes; real probes => health-readiness test passes (exit code 0); test asserts db.ready==true AND fleet.ready==true AND queue.ready==true (3 booleans)
    MUST_NOT_OBSERVE: RED test exits code 0 with stubbed probes; test asserts 0 things; static {status:ok} passes with 0 real probes

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- tests/integration/service/unkeyed-401.test.ts (NEW)
- tests/integration/service/wrong-scope-403.test.ts (NEW)
- tests/integration/service/keyed-200.test.ts (NEW)
- tests/integration/service/schema-identity.test.ts (NEW)
- tests/integration/service/health-readiness.test.ts (NEW)
writeProhibited: services/platform/src/** (implementation is service-1/2/3), convex/** (read-only legacy), app/** (not this sprint)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/tasks/sprint-04-provision-postgres-and-domain-schema/schema-5-red-tests-negative-controls.md:1-200 [RED test methodology + negative-control patterns]
2. brain/docs/TESTING-HIERARCHY.md:1-100 [integration/E2E requirements, no mocking]
3. brain/docs/TDD-METHODOLOGY.md:1-60 [RED→GREEN→REFACTOR]
4. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:24-27 [T-PLAT-005/006/007 acceptance criteria]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- red-tests-fail: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/` → exits nonzero (RED phase, before service-1/2/3)
- green-tests-pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/` (after service-1/2/3) → Exit 0
- typecheck: `pnpm tsgo --noEmit` → Exit 0
- lint: `pnpm biome check tests/integration/` → Exit 0

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: each test drives the REAL booted service (no mocks); each asserts a concrete value (HTTP code / `===` / booleans); each goes RED against the absent/stubbed start before GREEN; RED evidence captured; no test passes without the real behavior present.
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: service-1 · service-2 · service-3 (these define the gates the RED tests prove) · sprint-01 (PLATFORM_IT harness + holo CLI)
Blocks: service-5

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "service-4",
  "proposed_by": "mastra-planner",
  "tdd_mode": "skipped",
  "verification_policy": { "requires_tests": false, "requires_red_evidence": false, "requires_seeded_evidence": true },
  "fixtures": {
    "mastra_service_no_middleware": { "description": "Mastra service booted WITHOUT scoped-key middleware applied", "seed_method": "public_api", "records": ["Mastra service running", "Hono app listening", "no middleware registered"] },
    "mastra_service_no_scope_check": { "description": "Mastra service with middleware but scope check not implemented", "seed_method": "public_api", "records": ["middleware exists", "scope check returns true (stubbed)"] },
    "mastra_service_stubbed_key_validation": { "description": "Mastra service with stubbed key validation (always valid)", "seed_method": "public_api", "records": ["middleware exists", "key validation stubbed (no-op)"] },
    "registry_with_duplicate_validation": { "description": "Shared tool registry with duplicate .parse() layer in MCP gateway", "seed_method": "public_api", "records": ["registry exists", "MCP gateway re-parses tool schemas"] },
    "health_with_stubbed_probes": { "description": "/health endpoint returns static response without real probes", "seed_method": "public_api", "records": ["/health exists", "returns {status:'ok'} without checks"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "flow_ref": "T-PLAT-007", "description": "GIVEN service without middleware WHEN unkeyed-401 test runs THEN fails before middleware, passes when unkeyed returns 401", "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/unkeyed-401.test.ts", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-007", "negative_control": { "would_fail_if": ["Middleware bypassed", "Test does not assert 401 status", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "stdout", "required_capture": true }, "cases": [ { "start_ref": "mastra_service_no_middleware", "action": { "actor": "test_runner", "steps": ["run unkeyed-401 test (RED)", "add middleware", "run unkeyed-401 test (GREEN)"] }, "end_state": { "must_observe": ["RED run exits nonzero (code 1+) before middleware is added", "after middleware, unkeyed-401 test passes (exit code 0)", "test asserts HTTP 401 status code"], "must_not_observe": ["RED test exits code 0 before implementation (false pass)", "test asserts 0 things (no HTTP 401)", "static stub passes with no real check"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "flow_ref": "T-PLAT-007", "description": "GIVEN service without scope check WHEN wrong-scope-403 test runs THEN fails before scope check, passes when wrong-scope returns 403", "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/wrong-scope-403.test.ts", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-007", "negative_control": { "would_fail_if": ["Middleware missing scope enforcement", "Test does not assert 403 status", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "stdout", "required_capture": true }, "cases": [ { "start_ref": "mastra_service_no_scope_check", "action": { "actor": "test_runner", "steps": ["run wrong-scope-403 test (RED)", "add scope check", "run wrong-scope-403 test (GREEN)"] }, "end_state": { "must_observe": ["RED run exits nonzero (code 1+) before scope check is added", "after impl, wrong-scope-403 test passes (exit code 0)", "test asserts HTTP 403 status code"], "must_not_observe": ["RED test exits code 0 before implementation", "test asserts 0 things (no HTTP 403)", "static stub passes"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "flow_ref": "T-PLAT-007", "description": "GIVEN service with stubbed validation WHEN keyed-200 test runs THEN fails when stubbed, passes when correct key returns 200", "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/keyed-200.test.ts", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-007", "negative_control": { "would_fail_if": ["Test does not fail with stubbed validation", "Test passes without real key store", "Test does not assert 200 status", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "stdout", "required_capture": true }, "cases": [ { "start_ref": "mastra_service_stubbed_key_validation", "action": { "actor": "test_runner", "steps": ["run keyed-200 test (RED, stubbed)", "add real validation", "run keyed-200 test (GREEN)"] }, "end_state": { "must_observe": ["RED run exits nonzero (code 1+) with stubbed key validation", "real validation => keyed-200 test passes (exit code 0)", "test asserts HTTP 200 status code"], "must_not_observe": ["RED test exits code 0 with stubbed validation", "test asserts 0 things (no HTTP 200)", "static HTTP 200 with no key check"] } } ] } },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "flow_ref": "T-PLAT-006", "description": "GIVEN registry with duplicates WHEN schema-identity test runs THEN fails when duplicates exist, passes when schemas ===", "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/schema-identity.test.ts", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-006", "negative_control": { "would_fail_if": ["Test does not fail with duplicates", "Test passes without checking === equality", "Test does not assert schema identity", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "stdout", "required_capture": true }, "cases": [ { "start_ref": "registry_with_duplicate_validation", "action": { "actor": "test_runner", "steps": ["run schema-identity test (RED, duplicates)", "remove duplicate layer", "run schema-identity test (GREEN)"] }, "end_state": { "must_observe": ["RED run exits nonzero (code 1+) while duplicate validation exists", "dedup => schema-identity test passes (exit code 0)", "test asserts === identity (exactly 1 shared schema instance)"], "must_not_observe": ["RED test exits code 0 with duplicates present", "test asserts deep-equality instead of === (0 identity)", "static stub passes"] } } ] } },
    { "id": "AC-5", "type": "acceptance_criterion", "primary": false, "flow_ref": "T-PLAT-005", "description": "GIVEN /health stubbed WHEN health-readiness test runs THEN fails when probes stubbed, passes when DB/fleet/queue probed", "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/health-readiness.test.ts", "maps_to_ac": null,
      "scenario": { "tier": "visible", "test_tier": "integration", "verification_service": "mastra-service", "flow_ref": "T-PLAT-005", "negative_control": { "would_fail_if": ["Test does not fail with stubbed probes", "Test passes with static response", "Test does not assert real readiness", "the required object/config is absent or a no-op stub"] }, "evidence": { "artifact_type": "stdout", "required_capture": true }, "cases": [ { "start_ref": "health_with_stubbed_probes", "action": { "actor": "test_runner", "steps": ["run health-readiness test (RED, stubbed)", "add real DB/fleet/queue probes", "run health-readiness test (GREEN)"] }, "end_state": { "must_observe": ["RED run exits nonzero (code 1+) with stubbed /health probes", "real probes => health-readiness test passes (exit code 0)", "test asserts db.ready==true AND fleet.ready==true AND queue.ready==true (3 booleans)"], "must_not_observe": ["RED test exits code 0 with stubbed probes", "test asserts 0 things", "static {status:ok} passes with 0 real probes"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "description": "Unkeyed-401 test fails when middleware is bypassed", "maps_to_ac": "AC-1", "verify": "unkeyed-401 test fails without scoped-key middleware" },
    { "id": "TC-2", "type": "test_criterion", "description": "Wrong-scope-403 test fails when scope check is missing", "maps_to_ac": "AC-2", "verify": "wrong-scope-403 test fails without scope enforcement" },
    { "id": "TC-3", "type": "test_criterion", "description": "Keyed-200 test fails when key validation is stubbed", "maps_to_ac": "AC-3", "verify": "keyed-200 test fails with stubbed key validation" },
    { "id": "TC-4", "type": "test_criterion", "description": "Schema-identity test fails when duplicates exist", "maps_to_ac": "AC-4", "verify": "schema-identity test fails with duplicate validation" },
    { "id": "TC-5", "type": "test_criterion", "description": "Health-readiness test fails when probes are stubbed", "maps_to_ac": "AC-5", "verify": "health-readiness test fails with stubbed probes" }
  ]
}
-->
</details>
