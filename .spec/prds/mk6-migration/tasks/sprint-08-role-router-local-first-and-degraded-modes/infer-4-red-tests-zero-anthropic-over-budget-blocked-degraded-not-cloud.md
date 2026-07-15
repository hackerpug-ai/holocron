# infer-4 — RED tests: zero-Anthropic default path, over-budget escape blocked, degraded-not-cloud

## What this does

Generate RED test suite that proves the local-first invariant with un-fakeable network assertions: zero Anthropic on default path, over-budget escapes blocked, and degraded-mode never falls back to cloud

Provides: RED test suite for local-first invariant, Network assertion tests, Over-budget escape blocked test, Degraded-mode-not-cloud test.


## Why

- MUST Every RED test uses real network capture (no mocked fetch)
- MUST Every RED test uses real Postgres (PLATFORM_IT=1)
- MUST Every RED test uses real fleet endpoints (no stubbed resolveModel)
- MUST Network assertions check for api.anthropic.com hosts (concrete observable)
- NEVER Mock network capture to always return zero cloud requests
- NEVER Stub resolveModel to return fake endpoints
- NEVER Use allowEscape=true in tests that verify default path
- NEVER Create tests that pass without real seeded behavior
- STRICTLY All tests use real Postgres (PLATFORM_IT=1)
- STRICTLY All network captures use real fetch/HTTP (no mocks)
- STRICTLY All RED tests observed failing against empty/disconnected state before GREEN
- STRICTLY Integration tests run against real Mastra server (mastra dev)

- Grounded in: UC-INFER-01, UC-INFER-04, UC-INFER-05

## How to verify

- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-zero-cloud.test.ts` → Non-zero exit with resolveModel undefined or network assertion violation
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-*.test.ts` → Exit 0 with network-capture row count = 0 for host api.anthropic.com
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: tests/integration/service/infer-red-*.test.ts (NEW)

Prohibited: Any test that mocks network capture - reason: Must use real network assertions · Any test that stubs resolveModel - reason: Must test real router


<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: infer-4 — RED tests: zero-Anthropic default path, over-budget escape blocked, degraded-not-cloud
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (180 min)
AGENT:      red-test-generator
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: true)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 8 — Role Router, Local-First and Degraded Modes](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Generate RED test suite that proves the local-first invariant with un-fakeable network assertions: zero Anthropic on default path, over-budget escapes blocked, and degraded-mode never falls back to cloud
RED tests fail against empty router/stubbed fetch; GREEN tests pass with real resolveModel + real network capture; network assertions show concrete 0 api.anthropic.com; over-budget escape shows block; degraded mode shows no cloud

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Every RED test uses real network capture (no mocked fetch)
- MUST Every RED test uses real Postgres (PLATFORM_IT=1)
- MUST Every RED test uses real fleet endpoints (no stubbed resolveModel)
- MUST Network assertions check for api.anthropic.com hosts (concrete observable)
- NEVER Mock network capture to always return zero cloud requests
- NEVER Stub resolveModel to return fake endpoints
- NEVER Use allowEscape=true in tests that verify default path
- NEVER Create tests that pass without real seeded behavior
- STRICTLY All tests use real Postgres (PLATFORM_IT=1)
- STRICTLY All network captures use real fetch/HTTP (no mocks)
- STRICTLY All RED tests observed failing against empty/disconnected state before GREEN
- STRICTLY Integration tests run against real Mastra server (mastra dev)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: RED test suite proves zero Anthropic requests on default path with network assertion (flow_ref T-INFER-001)
- [ ] AC-2: RED test proves over-budget escape blocked before API call (flow_ref T-INFER-011)
- [ ] AC-3: RED test proves degraded mode never falls back to cloud (flow_ref T-INFER-014)
- [ ] AC-4: GREEN suite passes with full impl and real network captures (flow_ref T-INFER-001,T-INFER-011,T-INFER-014)
- [ ] `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-zero-cloud.test.ts` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 RED test suite proves zero Anthropic requests on default path with network assertion (flow_ref T-INFER-001)
  GIVEN: Empty router (no resolveModel impl); mocked network capture; test written
  WHEN:  Running RED test before resolveModel impl
  THEN:  Test FAILS with network assertion showing >0 api.anthropic.com or resolveModel undefined
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: empty-router · evidence: stdout
    NEGATIVE_CONTROL: would fail if Network assertion mocked; Test passes without real resolveModel; RED not observed against empty state
    MUST_OBSERVE: vitest exit code = 1; stderr contains 'resolveModel is not defined' or network assertion violation
    MUST_NOT_OBSERVE: vitest exit code = 0; Test passes without resolveModel impl

AC-2 RED test proves over-budget escape blocked before API call (flow_ref T-INFER-011)
  GIVEN: No budget ledger; test written
  WHEN:  Running RED test before checkBudget impl
  THEN:  Test FAILS with checkBudget undefined or budget_exceeded not recorded
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: no-budget-ledger · evidence: stdout
    NEGATIVE_CONTROL: would fail if Test passes without checkBudget; Budget mocked
    MUST_OBSERVE: vitest exit code = 1; stderr contains 'checkBudget is not defined' or 'budget_exceeded not recorded'
    MUST_NOT_OBSERVE: vitest exit code = 0; Test passes with no checkBudget

AC-3 RED test proves degraded mode never falls back to cloud (flow_ref T-INFER-014)
  GIVEN: No degraded controller; test written
  WHEN:  Running RED test before degraded impl
  THEN:  Test FAILS with degraded mode undefined or cloud fallback observed
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: no-degraded-controller · evidence: stdout
    NEGATIVE_CONTROL: would fail if Test passes without degraded controller (controller stubbed/empty); Cloud fallback not detected
    MUST_OBSERVE: vitest exit code = 1; stderr contains 'DegradedModeController is not defined' or 'api.anthropic.com reachable'
    MUST_NOT_OBSERVE: vitest exit code = 0; Test passes without controller

AC-4 GREEN suite passes with full impl and real network captures (flow_ref T-INFER-001,T-INFER-011,T-INFER-014)
  GIVEN: infer-1/2/3 complete; real fleet; real Postgres
  WHEN:  Running GREEN tests after impl
  THEN:  All tests PASS; network captures show 0 cloud on default; over-budget blocked; degraded no-cloud
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-fleet-manifest · evidence: stdout
    NEGATIVE_CONTROL: would fail if Tests pass with stubbed impl; Network capture mocked
    MUST_OBSERVE: vitest exit code = 0; vitest stdout contains 'N passed' where N ≥ 4; network-capture row count for host api.anthropic.com = 0
    MUST_NOT_OBSERVE: vitest exit code ≠ 0; network-capture row count for host api.anthropic.com > 0

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- tests/integration/service/infer-red-*.test.ts (NEW)
writeProhibited: Any test that mocks network capture - reason: Must use real network assertions, Any test that stubs resolveModel - reason: Must test real router

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/inference/resolve-model.ts lines 126-184
   - focus: resolveModel for network assertions
2. tests/integration/service/infer-router-zero-cloud.test.ts lines 1-50
   - focus: Network assertion pattern from infer-1
3. brain/docs/e2e-testing-rules/README.md lines 1-50
   - focus: RED test methodology
4. brain/docs/kanban/SCORING-RUBRIC-v1.md lines 395-410
   - focus: Fakeability Floor enforcement
5. services/platform/src/inference/budget-ledger.ts lines 1-50
   - focus: checkBudget for over-budget assertions

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED tests fail: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-zero-cloud.test.ts` → Non-zero exit with resolveModel undefined or network assertion violation
- GREEN tests pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-*.test.ts` → Exit 0 with network-capture row count = 0 for host api.anthropic.com
- Typecheck passes: `pnpm tsgo --noEmit` → Exit 0
- Lint passes: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- Tests assume infer-1/2/3 GREEN phase complete
- RED tests run against empty/disconnected state
- GREEN tests run against full impl
- pattern: RED: write test → run with empty impl → observe failure → GREEN: impl → run → observe pass
- pattern_source: brain/docs/e2e-testing-rules/README.md:1-50
- anti_pattern: Tests that pass without real impl or mock network capture

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: infer-1, infer-2, infer-3 · Blocks: infer-5

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "infer-4",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "empty-router": {
      "description": "No resolveModel impl; network capture mocked",
      "seed_method": "public_api",
      "records": [
        "resolveModel undefined",
        "fetch mocked to return empty capture"
      ]
    },
    "no-budget-ledger": {
      "description": "No checkBudget function; no budget_ledger table",
      "seed_method": "public_api",
      "records": [
        "checkBudget undefined",
        "budget_ledger table does not exist"
      ]
    },
    "no-degraded-controller": {
      "description": "No DegradedModeController; RoleUnavailableError uncaught",
      "seed_method": "public_api",
      "records": [
        "DegradedModeController undefined",
        "RoleUnavailableError propagates"
      ]
    },
    "seeded-fleet-manifest": {
      "description": "Fleet Role Manifest with divergent\u219235B-A3B, convergent\u219227B endpoints loaded",
      "seed_method": "public_api",
      "records": [
        "loadFleetManifest() returns manifest with roles",
        "divergent.litellmModelId = '35B-A3B'",
        "convergent.litellmModelId = '27B'"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN Empty router (no resolveModel impl); mocked network capture; test written WHEN Running RED test before resolveModel impl THEN Test FAILS with network assertion showing >0 api.anthropic.com or resolveModel undefined",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-zero-cloud.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Network assertion mocked",
            "Test passes without real resolveModel",
            "RED not observed against empty state"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty-router",
            "action": {
              "actor": "red-test-generator",
              "steps": [
                "Write test asserting 0 api.anthropic.com",
                "Run test with empty router",
                "Capture RED failure"
              ]
            },
            "end_state": {
              "must_observe": [
                "vitest exit code = 1",
                "stderr contains 'resolveModel is not defined' or network assertion violation"
              ],
              "must_not_observe": [
                "vitest exit code = 0",
                "Test passes without resolveModel impl"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN No budget ledger; test written WHEN Running RED test before checkBudget impl THEN Test FAILS with checkBudget undefined or budget_exceeded not recorded",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-over-budget.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Test passes without checkBudget",
            "Budget mocked"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "no-budget-ledger",
            "action": {
              "actor": "red-test-generator",
              "steps": [
                "Write test asserting escape blocked over budget",
                "Run with no checkBudget",
                "Capture RED failure"
              ]
            },
            "end_state": {
              "must_observe": [
                "vitest exit code = 1",
                "stderr contains 'checkBudget is not defined' or 'budget_exceeded not recorded'"
              ],
              "must_not_observe": [
                "vitest exit code = 0",
                "Test passes with no checkBudget"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN No degraded controller; test written WHEN Running RED test before degraded impl THEN Test FAILS with degraded mode undefined or cloud fallback observed",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-degraded-no-cloud.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Test passes without degraded controller (controller stubbed/empty)",
            "Cloud fallback not detected"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "no-degraded-controller",
            "action": {
              "actor": "red-test-generator",
              "steps": [
                "Write test asserting no cloud in degraded mode",
                "Run with no controller",
                "Capture RED failure"
              ]
            },
            "end_state": {
              "must_observe": [
                "vitest exit code = 1",
                "stderr contains 'DegradedModeController is not defined' or 'api.anthropic.com reachable'"
              ],
              "must_not_observe": [
                "vitest exit code = 0",
                "Test passes without controller"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN infer-1/2/3 complete; real fleet; real Postgres WHEN Running GREEN tests after impl THEN All tests PASS; network captures show 0 cloud on default; over-budget blocked; degraded no-cloud",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-*.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Tests pass with stubbed impl",
            "Network capture mocked"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-fleet-manifest",
            "action": {
              "actor": "red-test-generator",
              "steps": [
                "Run full GREEN suite",
                "Capture network assertions",
                "Verify budget records",
                "Verify degraded transitions"
              ]
            },
            "end_state": {
              "must_observe": [
                "vitest exit code = 0",
                "vitest stdout contains 'N passed' where N \u2265 4",
                "network-capture row count for host api.anthropic.com = 0"
              ],
              "must_not_observe": [
                "vitest exit code \u2260 0",
                "network-capture row count for host api.anthropic.com > 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "RED test fails before resolveModel impl",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-zero-cloud.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "RED test fails before checkBudget impl",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-over-budget.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "RED test fails before degraded controller impl",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-degraded-no-cloud.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "GREEN suite passes with full impl",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-red-*.test.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
</details>
