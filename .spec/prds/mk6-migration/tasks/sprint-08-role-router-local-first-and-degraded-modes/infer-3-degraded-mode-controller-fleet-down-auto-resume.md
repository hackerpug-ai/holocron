# infer-3 — Degraded-mode controller (fleet-down → defined reduced mode, auto-resume)

## What this does

Implement DegradedModeController that catches RoleUnavailableError from resolveModel, reads degradationAction from the Fleet Role Manifest, transitions to a defined reduced mode (research → sense-only; chat → surface-unavailable message), polls fleet endpoint health to detect return and auto-resume, and enforces never-cloud fallback

Provides: DegradedModeController, fleet-unavailable degradation transitions, health-probe polling and auto-resume, never-cloud enforcement.


## Why

- MUST DegradedModeController catches RoleUnavailableError from resolveModel
- MUST Controller reads degradationAction from Fleet Role Manifest (surface-unavailable|queue-and-retry|fail-closed)
- MUST Controller transitions to defined degraded mode and surfaces state to user
- MUST Health-probe polling detects endpoint return and triggers auto-resume
- MUST Degraded mode NEVER silently falls back to cloud — network capture proves api.anthropic.com = 0
- MUST Research mission degrades to sense-only (mode = 'sense-only', retry-queue for ASSAY/CHALLENGE steps)
- MUST Every AC uses real Postgres (PLATFORM_IT=1) and real fleet endpoints (no mock resolveModel)
- NEVER Allow degraded mode to silently fall back to cloud providers
- NEVER Permit auto-resume without health probe confirming endpoint return
- NEVER Skip degradationAction execution when RoleUnavailableError thrown
- NEVER Use mocked health probes that always return healthy
- STRICTLY All operations use real Postgres (PLATFORM_IT=1)
- STRICTLY All verification gates use real fleet endpoints (no endpointOverride in production path)
- STRICTLY Network assertions capture real traffic (no mocked fetch)
- STRICTLY Integration tests run against real Mastra server (mastra dev)

- Grounded in: UC-INFER-05

## How to verify

- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-*.test.ts` → Exit 0 with degraded-mode transitions verified and network capture showing 0 Anthropic requests in degraded mode
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/inference/degraded-mode-controller.ts (NEW) · services/platform/src/inference/resolve-model.ts (MODIFY) · services/platform/src/cli/holo.ts (MODIFY) · tests/integration/service/infer-degraded-*.test.ts (NEW)

Prohibited: Any code that silently falls back to cloud in degraded mode - reason: Never-cloud enforcement · Any mocked health probe that always returns healthy - reason: Must detect real endpoint status · Any stubbed RoleUnavailableError - reason: Must test real fleet failure


<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: infer-3 — Degraded-mode controller (fleet-down → defined reduced mode, auto-resume)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (180 min)
AGENT:      mastra-implementer
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
Implement DegradedModeController that catches RoleUnavailableError from resolveModel, reads degradationAction from the Fleet Role Manifest, transitions to a defined reduced mode (research → sense-only; chat → surface-unavailable message), polls fleet endpoint health to detect return and auto-resume, and enforces never-cloud fallback
Fleet endpoint down triggers RoleUnavailableError → DegradedModeController executes degradationAction → user sees surfaced state; health probe detects endpoint return → auto-resume to normal mode; network capture shows ZERO api.anthropic.com requests during degraded mode; research mission mode = 'sense-only' with retry-queue row count ≥ 2 for ASSAY/CHALLENGE

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST DegradedModeController catches RoleUnavailableError from resolveModel
- MUST Controller reads degradationAction from Fleet Role Manifest (surface-unavailable|queue-and-retry|fail-closed)
- MUST Controller transitions to defined degraded mode and surfaces state to user
- MUST Health-probe polling detects endpoint return and triggers auto-resume
- MUST Degraded mode NEVER silently falls back to cloud — network capture proves api.anthropic.com = 0
- MUST Research mission degrades to sense-only (mode = 'sense-only', retry-queue for ASSAY/CHALLENGE steps)
- MUST Every AC uses real Postgres (PLATFORM_IT=1) and real fleet endpoints (no mock resolveModel)
- NEVER Allow degraded mode to silently fall back to cloud providers
- NEVER Permit auto-resume without health probe confirming endpoint return
- NEVER Skip degradationAction execution when RoleUnavailableError thrown
- NEVER Use mocked health probes that always return healthy
- STRICTLY All operations use real Postgres (PLATFORM_IT=1)
- STRICTLY All verification gates use real fleet endpoints (no endpointOverride in production path)
- STRICTLY Network assertions capture real traffic (no mocked fetch)
- STRICTLY Integration tests run against real Mastra server (mastra dev)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Controller executes degradationAction on RoleUnavailableError (flow_ref T-INFER-014)
- [ ] AC-2: Health-probe polling detects endpoint return and auto-resumes (flow_ref T-INFER-016)
- [ ] AC-3: Degraded mode never silently falls back to cloud (flow_ref T-INFER-014)
- [ ] AC-4: Research mission degrades to sense-only mode (flow_ref T-INFER-014)
- [ ] `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-*.test.ts` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 Controller executes degradationAction on RoleUnavailableError (flow_ref T-INFER-014)
  GIVEN: Fleet Role Manifest loaded with divergent role (degradationAction = 'surface-unavailable'); Mastra service running; network capture active
  WHEN:  resolveModel('divergent') throws RoleUnavailableError due to endpoint down; DegradedModeController catches the error
  THEN:  Controller reads degradationAction = 'surface-unavailable', transitions degraded state to 'surface-unavailable', surfaces message 'Local fleet unavailable — running in reduced mode', network capture shows ZERO api.anthropic.com requests
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-degraded-mode · evidence: stdout
    NEGATIVE_CONTROL: would fail if DegradedModeController omitted so RoleUnavailableError propagates uncaught; degradationAction not read from manifest so default fallback to stub occurs; Network assertion mocked so cloud fallback undetected
    MUST_OBSERVE: RoleUnavailableError.code equals 'ROLE_UNAVAILABLE'; degraded-state field equals 'surface-unavailable'; stdout contains 'Local fleet unavailable — running in reduced mode'; network-capture row count for host api.anthropic.com = 0
    MUST_NOT_OBSERVE: network-capture row count for host api.anthropic.com > 0; degraded-state field equals 'normal' (0 degraded); RoleUnavailableError propagates without catch (uncaught error)

AC-2 Health-probe polling detects endpoint return and auto-resumes (flow_ref T-INFER-016)
  GIVEN: System in degraded mode (degraded-state = 'surface-unavailable'); fleet endpoint down; health probe polling active
  WHEN:  Fleet endpoint returns; health probe succeeds
  THEN:  Controller detects endpoint healthy, transitions degraded-state to 'normal', resumes normal routing, network capture shows fleet requests resume
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-degraded-mode · evidence: stdout
    NEGATIVE_CONTROL: would fail if Health probe skipped so auto-resume never triggers; Health probe mocked to always return unhealthy (static false); Endpoint status not verified before resume
    MUST_OBSERVE: degraded-state field transitions from 'surface-unavailable' to 'normal'; resume-state field equals 'normal'; resolveModel('divergent') returns fleet endpoint (contains ':4545'); fleet-log row count for :4545 endpoint ≥ 1 after resume
    MUST_NOT_OBSERVE: degraded-state remains 'surface-unavailable' (no resume); resume-state field equals 'surface-unavailable' (stuck degraded); resolveModel returns api.anthropic.com endpoint (cloud fallback)

AC-3 Degraded mode never silently falls back to cloud (flow_ref T-INFER-014)
  GIVEN: System in degraded mode; network capture active; fleet endpoint down
  WHEN:  Any reasoning call attempted during degraded mode
  THEN:  Network capture shows ZERO api.anthropic.com requests; all calls either surface 'unavailable' message or queue for retry
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-degraded-mode · evidence: api_response
    NEGATIVE_CONTROL: would fail if Degraded mode allows silent cloud fallback (static cloud route); Network assertion mocked so always returns zero (fake capture); Cloud fallback not detected by capture
    MUST_OBSERVE: network-capture row count for host api.anthropic.com = 0; Every request in capture contains host ending with ':4545' or fails fast with surfaced message; Stdout contains 'Local fleet unavailable' or queued retry message
    MUST_NOT_OBSERVE: network-capture row count for host api.anthropic.com > 0 (cloud leakage); Any request in capture contains host 'api.anthropic.com' (cloud present); Silent success without fleet routing (empty fleet log)

AC-4 Research mission degrades to sense-only mode (flow_ref T-INFER-014)
  GIVEN: Research mission running; fleet endpoint down; degraded mode active; retry-queue table exists
  WHEN:  RoleUnavailableError thrown during research mission ASSAY or CHALLENGE step
  THEN:  Mission mode = 'sense-only', retry-queue row count ≥ 2 for ASSAY/CHALLENGE steps, extraction state = 'running'
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-research-mission · evidence: db_query
    NEGATIVE_CONTROL: would fail if Research mission continues full execution in degraded mode (bypass); Retry-queue not populated for failed steps (empty queue); Mission mode not set to 'sense-only' (wrong mode)
    MUST_OBSERVE: mission mode field equals 'sense-only'; retry-queue row count for step_type in ('ASSAY','CHALLENGE') ≥ 2; extraction state field equals 'running'; degraded-state field equals 'surface-unavailable'
    MUST_NOT_OBSERVE: mission mode equals 'full' (0 degraded); retry-queue row count for step_type in ('ASSAY','CHALLENGE') = 0 (empty); extraction state equals 'failed' (stopped)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/inference/degraded-mode-controller.ts (NEW)
- services/platform/src/inference/resolve-model.ts (MODIFY)
- services/platform/src/cli/holo.ts (MODIFY)
- tests/integration/service/infer-degraded-*.test.ts (NEW)
writeProhibited: Any code that silently falls back to cloud in degraded mode - reason: Never-cloud enforcement, Any mocked health probe that always returns healthy - reason: Must detect real endpoint status, Any stubbed RoleUnavailableError - reason: Must test real fleet failure

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/inference/resolve-model.ts lines 126-184
   - focus: resolveModel router + RoleUnavailableError throwing
2. services/platform/src/fleet/manifest.ts lines 1-109
   - focus: Fleet Role Manifest + degradationAction field
3. services/platform/src/inference/degraded-mode-controller.ts lines 1-50
   - focus: DegradedModeController pattern (NEW file)
4. tests/integration/service/infer-degraded-*.test.ts lines 1-50
   - focus: Network assertion pattern from infer-1

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Integration tests pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-*.test.ts` → Exit 0 with degraded-mode transitions verified and network capture showing 0 Anthropic requests in degraded mode
- Typecheck passes: `pnpm tsgo --noEmit` → Exit 0
- Lint passes: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- Consumes RoleUnavailableError.degradationAction from infer-1 resolveModel
- Health-probe polling interval configurable (default 30s)
- Degraded state persisted to Postgres for cross-request consistency
- pattern: RoleUnavailableError catch → read degradationAction → transition mode → surface state → health probe → auto-resume
- pattern_source: services/platform/src/inference/degraded-mode-controller.ts:1-50
- anti_pattern: Silent cloud fallback in degraded mode or mocked health probes

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: infer-1 · Blocks: infer-4, infer-5

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "infer-3",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-degraded-mode": {
      "description": "Fleet Role Manifest loaded; degraded-mode controller active; network capture enabled",
      "seed_method": "public_api",
      "records": [
        "loadFleetManifest() returns manifest with divergent role degradationAction = 'surface-unavailable'",
        "DegradedModeController initialized and listening for RoleUnavailableError",
        "Network capture table active and empty"
      ]
    },
    "seeded-research-mission": {
      "description": "Research mission running with ASSAY/CHALLENGE steps; retry-queue table exists",
      "seed_method": "public_api",
      "records": [
        "mission state contains mode field = 'full'",
        "retry-queue table exists with 0 rows",
        "extraction state field = 'running'"
      ]
    },
    "seeded-fleet-manifest": {
      "description": "Fleet Role Manifest with divergent\u219235B-A3B endpoint and degradationAction loaded",
      "seed_method": "public_api",
      "records": [
        "loadFleetManifest() returns manifest with divergent role",
        "divergent.litellmModelId = '35B-A3B'",
        "divergent.degradationAction = 'surface-unavailable'",
        "divergent.healthProbe configured with path, method, timeoutMs, expectStatus"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN Fleet Role Manifest loaded with divergent role (degradationAction = 'surface-unavailable'); Mastra service running; network capture active WHEN resolveModel('divergent') throws RoleUnavailableError due to endpoint down; DegradedModeController catches the error THEN Controller reads degradationAction = 'surface-unavailable', transitions degraded state to 'surface-unavailable', surfaces message 'Local fleet unavailable \u2014 running in reduced mode', network capture shows ZERO api.anthropic.com requests",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-transition.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "DegradedModeController omitted so RoleUnavailableError propagates uncaught",
            "degradationAction not read from manifest so default fallback to stub occurs",
            "Network assertion mocked so cloud fallback undetected"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-degraded-mode",
            "action": {
              "actor": "operator",
              "steps": [
                "Take fleet endpoint down",
                "Call resolveModel('divergent') and capture RoleUnavailableError",
                "Verify degraded state transition",
                "Review network capture"
              ]
            },
            "end_state": {
              "must_observe": [
                "RoleUnavailableError.code equals 'ROLE_UNAVAILABLE'",
                "degraded-state field equals 'surface-unavailable'",
                "stdout contains 'Local fleet unavailable \u2014 running in reduced mode'",
                "network-capture row count for host api.anthropic.com = 0"
              ],
              "must_not_observe": [
                "network-capture row count for host api.anthropic.com > 0",
                "degraded-state field equals 'normal' (0 degraded)",
                "RoleUnavailableError propagates without catch (uncaught error)"
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
      "description": "GIVEN System in degraded mode (degraded-state = 'surface-unavailable'); fleet endpoint down; health probe polling active WHEN Fleet endpoint returns; health probe succeeds THEN Controller detects endpoint healthy, transitions degraded-state to 'normal', resumes normal routing, network capture shows fleet requests resume",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-resume.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Health probe skipped so auto-resume never triggers",
            "Health probe mocked to always return unhealthy (static false)",
            "Endpoint status not verified before resume"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-degraded-mode",
            "action": {
              "actor": "operator",
              "steps": [
                "Verify degraded-state = 'surface-unavailable'",
                "Bring fleet endpoint back up",
                "Wait for health probe interval",
                "Verify degraded-state = 'normal'",
                "Call resolveModel and confirm fleet routing"
              ]
            },
            "end_state": {
              "must_observe": [
                "degraded-state field transitions from 'surface-unavailable' to 'normal'",
                "resume-state field equals 'normal'",
                "resolveModel('divergent') returns fleet endpoint (contains ':4545')",
                "fleet-log row count for :4545 endpoint \u2265 1 after resume"
              ],
              "must_not_observe": [
                "degraded-state remains 'surface-unavailable' (no resume)",
                "resume-state field equals 'surface-unavailable' (stuck degraded)",
                "resolveModel returns api.anthropic.com endpoint (cloud fallback)"
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
      "description": "GIVEN System in degraded mode; network capture active; fleet endpoint down WHEN Any reasoning call attempted during degraded mode THEN Network capture shows ZERO api.anthropic.com requests; all calls either surface 'unavailable' message or queue for retry",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-no-cloud.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Degraded mode allows silent cloud fallback (static cloud route)",
            "Network assertion mocked so always returns zero (fake capture)",
            "Cloud fallback not detected by capture"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-degraded-mode",
            "action": {
              "actor": "operator",
              "steps": [
                "Verify system in degraded mode",
                "Attempt reasoning call with network capture enabled",
                "Review full network capture log"
              ]
            },
            "end_state": {
              "must_observe": [
                "network-capture row count for host api.anthropic.com = 0",
                "Every request in capture contains host ending with ':4545' or fails fast with surfaced message",
                "Stdout contains 'Local fleet unavailable' or queued retry message"
              ],
              "must_not_observe": [
                "network-capture row count for host api.anthropic.com > 0 (cloud leakage)",
                "Any request in capture contains host 'api.anthropic.com' (cloud present)",
                "Silent success without fleet routing (empty fleet log)"
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
      "description": "GIVEN Research mission running; fleet endpoint down; degraded mode active; retry-queue table exists WHEN RoleUnavailableError thrown during research mission ASSAY or CHALLENGE step THEN Mission mode = 'sense-only', retry-queue row count \u2265 2 for ASSAY/CHALLENGE steps, extraction state = 'running'",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-research-mission.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Research mission continues full execution in degraded mode (bypass)",
            "Retry-queue not populated for failed steps (empty queue)",
            "Mission mode not set to 'sense-only' (wrong mode)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-research-mission",
            "action": {
              "actor": "operator",
              "steps": [
                "Start research mission",
                "Take fleet endpoint down during ASSAY step",
                "Capture RoleUnavailableError",
                "Verify degraded transition",
                "Query retry-queue table",
                "Verify mission mode"
              ]
            },
            "end_state": {
              "must_observe": [
                "mission mode field equals 'sense-only'",
                "retry-queue row count for step_type in ('ASSAY','CHALLENGE') \u2265 2",
                "extraction state field equals 'running'",
                "degraded-state field equals 'surface-unavailable'"
              ],
              "must_not_observe": [
                "mission mode equals 'full' (0 degraded)",
                "retry-queue row count for step_type in ('ASSAY','CHALLENGE') = 0 (empty)",
                "extraction state equals 'failed' (stopped)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Controller catches RoleUnavailableError and executes degradationAction",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-transition.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Controller surfaces degraded state to user",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-transition.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Network capture shows zero cloud requests during degraded mode",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-transition.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Health probe polling detects endpoint return",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-resume.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Auto-resume transitions degraded-state to normal",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-resume.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Degraded mode network capture shows zero cloud",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-no-cloud.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Research mission transitions to sense-only",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-research-mission.test.ts",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "Retry-queue populated for ASSAY/CHALLENGE steps",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-research-mission.test.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
</details>
