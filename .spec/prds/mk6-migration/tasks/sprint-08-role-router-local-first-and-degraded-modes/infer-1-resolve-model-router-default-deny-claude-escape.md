# infer-1 — resolveModel(role,{allowEscape}) router over fleet + default-deny Claude escape

## What this does

Implement resolveModel(role,{allowEscape}) router that enforces local-first by default, routes every reasoning call through the Fleet Role Manifest to LiteLLM :4545, and provides a default-deny Claude escape hatch that cannot silently drift back to cloud

Provides: resolveModel(role,{allowEscape}) router, default-deny Claude escape path, @ai-sdk/openai-compatible fleet wiring, holo infer:call operator command.


## Why

- MUST resolveModel(role,{allowEscape}) routes every reasoning call through the Fleet Role Manifest
- MUST resolveModel rejects unknown roles and unhealthy endpoints with fail-closed error (no silent fallback)
- MUST allowEscape=false (default) blocks ALL Anthropic requests regardless of budget
- MUST Router belts-and-suspenders: reject api.anthropic.com endpoints even if misconfigured in manifest
- MUST Every AC uses real Postgres (PLATFORM_IT=1) and real fleet endpoint (no mock resolveModel)
- NEVER Allow a call site to name a provider directly (claudeFlash/claudePro/claudeUltra factories banned)
- NEVER Permit an Anthropic request on the default path (allowEscape=false must block at router)
- NEVER Return a fake/stub endpoint — health probe must succeed or RoleUnavailableError thrown
- NEVER Silently fall back to cloud on fleet unavailability
- STRICTLY All operations use real Postgres (PLATFORM_IT=1)
- STRICTLY All verification gates use real fleet endpoints (no endpointOverride in production path)
- STRICTLY Network assertions capture real traffic (no mocked fetch)
- STRICTLY Integration tests run against real Mastra server (mastra dev)

- Grounded in: UC-INFER-01, UC-INFER-04

## How to verify

- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-*.test.ts tests/integration/service/infer-cli-infer-call.test.ts` → Exit 0 with network capture showing 0 Anthropic requests on default path
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0
- `bun services/platform/src/cli/holo.ts verify:no-provider-refs` → Exit 0 with 0 direct provider references found

## Scope

Writes: services/platform/src/inference/resolve-model.ts (MODIFY) · services/platform/src/inference/budget-ledger.ts (NEW) · services/platform/src/cli/holo.ts (MODIFY) · tests/integration/service/infer-router-*.test.ts (NEW) · tests/integration/service/infer-cli-infer-call.test.ts (NEW)

Prohibited: services/platform/src/fleet/manifest.ts - reason: Sprint 01 deliverable, modify only if manifest schema changes · services/platform/src/fleet/manifest.schema.ts - reason: Sprint 01 deliverable, schema locked · services/platform/src/mastra.ts - reason: Sprint 05 deliverable, modify only for compose root changes · Any file that introduces claudeFlash/claudePro/claudeUltra factories - reason: Direct provider references banned


<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: infer-1 — resolveModel(role,{allowEscape}) router over fleet + default-deny Claude escape
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Completed
PRIORITY:   P0
EFFORT:     M  (240 min)
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
Implement resolveModel(role,{allowEscape}) router that enforces local-first by default, routes every reasoning call through the Fleet Role Manifest to LiteLLM :4545, and provides a default-deny Claude escape hatch that cannot silently drift back to cloud
Every reasoning call site names a role (never a provider); the router resolves divergent/convergent/judge/embed/rerank to live fleet endpoints; allowEscape=false (default) blocks ALL Anthropic requests; allowEscape=true permits ONLY budgeted escapes (per infer-2); a network assertion during normal mission run proves zero Anthropic traffic; holo verify:no-provider-refs confirms no direct provider references exist

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST resolveModel(role,{allowEscape}) routes every reasoning call through the Fleet Role Manifest
- MUST resolveModel rejects unknown roles and unhealthy endpoints with fail-closed error (no silent fallback)
- MUST allowEscape=false (default) blocks ALL Anthropic requests regardless of budget
- MUST Router belts-and-suspenders: reject api.anthropic.com endpoints even if misconfigured in manifest
- MUST Every AC uses real Postgres (PLATFORM_IT=1) and real fleet endpoint (no mock resolveModel)
- NEVER Allow a call site to name a provider directly (claudeFlash/claudePro/claudeUltra factories banned)
- NEVER Permit an Anthropic request on the default path (allowEscape=false must block at router)
- NEVER Return a fake/stub endpoint — health probe must succeed or RoleUnavailableError thrown
- NEVER Silently fall back to cloud on fleet unavailability
- STRICTLY All operations use real Postgres (PLATFORM_IT=1)
- STRICTLY All verification gates use real fleet endpoints (no endpointOverride in production path)
- STRICTLY Network assertions capture real traffic (no mocked fetch)
- STRICTLY Integration tests run against real Mastra server (mastra dev)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Router routes all reasoning calls through Fleet Role Manifest with zero cloud on default path (flow_ref T-INFER-001)
- [ ] AC-2: Router rejects unknown roles and unhealthy endpoints fail-closed (flow_ref T-INFER-017)
- [ ] AC-3: Router implements default-deny Claude escape with allowEscape parameter (flow_ref T-INFER-011)
- [ ] AC-4: CLI operator command holo infer:call exercises router with role and escape flags (flow_ref T-INFER-003)
- [ ] `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-*.test.ts tests/integration/service/infer-cli-infer-call.test.ts` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 Router routes all reasoning calls through Fleet Role Manifest with zero cloud on default path (flow_ref T-INFER-001)
  GIVEN: Fleet Role Manifest loaded with divergent→35B-A3B, convergent→27B fleet endpoints; Mastra service running; network capture active
  WHEN:  Running holo mission run triage --goal 'X' and calling resolveModel('divergent') and resolveModel('convergent') from a reasoning step
  THEN:  Router resolves divergent to 35B-A3B litellm model id and convergent to 27B; network capture shows ZERO api.anthropic.com requests; fleet logs show N requests to :4545; holo verify:no-provider-refs reports zero direct provider references
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-fleet-manifest · evidence: api_response
    NEGATIVE_CONTROL: would fail if resolveModel stubbed to return fake endpoint without health probe; allowEscape check omitted so default path permits Anthropic; Network assertion mocked so always returns zero cloud traffic; Fleet manifest validation bypassed so unknown role accepted
    MUST_OBSERVE: resolveModel('divergent') returns litellmModelId = '35B-A3B'; resolveModel('convergent') returns litellmModelId = '27B'; network-capture row count for host api.anthropic.com = 0; fleet-log row count for :4545 endpoint ≥ 1; holo verify:no-provider-refs exits with code 0
    MUST_NOT_OBSERVE: network-capture row count for host api.anthropic.com > 0; resolveModel returns factory containing 'claudeFlash' or 'claudePro'; holo verify:no-provider-refs reports direct-provider count > 0

AC-2 Router rejects unknown roles and unhealthy endpoints fail-closed (flow_ref T-INFER-017)
  GIVEN: Fleet Role Manifest loaded; fleet endpoint down; network capture active
  WHEN:  Calling resolveModel('unknown-role') or resolveModel('divergent') with endpoint down
  THEN:  resolveModel('unknown-role') throws UnknownFleetRoleError; resolveModel('divergent') with endpoint down throws RoleUnavailableError with degradationAction; no Anthropic request made
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-fleet-manifest · evidence: stdout
    NEGATIVE_CONTROL: would fail if Unknown role stubbed/accepted so fallback to default model occurs; Health probe skipped so unhealthy endpoint returned; RoleUnavailableError absent so silent fallback to cloud occurs; Degradation action ignored so fallback to alternative provider
    MUST_OBSERVE: UnknownFleetRoleError.code equals 'UNKNOWN_FLEET_ROLE'; RoleUnavailableError.code equals 'ROLE_UNAVAILABLE'; RoleUnavailableError.degradationAction equals 'surface-unavailable' or 'queue-and-retry' or 'fail-closed'; network-capture row count for host api.anthropic.com = 0
    MUST_NOT_OBSERVE: resolveModel('unknown-role') returns model object; resolveModel('divergent') returns model when endpoint down; network-capture row count for host api.anthropic.com > 0

AC-3 Router implements default-deny Claude escape with allowEscape parameter (flow_ref T-INFER-011)
  GIVEN: Router loaded; network capture active; budget ledger (per infer-2) provisioned
  WHEN:  Calling resolveModel('divergent', {allowEscape: false}) and resolveModel('divergent', {allowEscape: true})
  THEN:  allowEscape=false blocks Anthropic even if budget OK; allowEscape=true permits Anthropic only if budget pre-check passes (per infer-2); network capture proves default-deny
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-fleet-manifest · evidence: stdout
    NEGATIVE_CONTROL: would fail if allowEscape=false check omitted so default path permits escape; allowEscape parameter bypassed with static value so no real role/escape parameters; Network assertion mocked so always shows zero cloud traffic
    MUST_OBSERVE: resolveModel allowEscape=false returns endpoint containing ':4545'; resolveModel allowEscape=true returns endpoint containing 'api.anthropic.com'; network-capture row count for allowEscape=false = 0; network-capture row count for allowEscape=true ≥ 1
    MUST_NOT_OBSERVE: resolveModel allowEscape=false returns endpoint containing 'api.anthropic.com'; network-capture row count for allowEscape=false > 0

AC-4 CLI operator command holo infer:call exercises router with role and escape flags (flow_ref T-INFER-003)
  GIVEN: Mastra service running; fleet manifest loaded; network capture active
  WHEN:  Running holo infer:call --role divergent, holo infer:call --role convergent, holo infer:call --escape
  THEN:  CLI resolves divergent to 35B-A3B, convergent to 27B; --escape flag triggers allowEscape=true; network capture shows Anthropic only with --escape; CLI outputs resolved model details
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-fleet-manifest · evidence: stdout
    NEGATIVE_CONTROL: would fail if CLI command not registered in holo.ts so command stub/empty; Argument parsing stubbed so no real role/escape parameters passed; Router call bypassed so app-layer mock instead of real resolveModel
    MUST_OBSERVE: stdout for --role divergent contains '35B-A3B'; stdout for --role convergent contains '27B'; stdout for --escape contains 'api.anthropic.com'; network-capture row count for host api.anthropic.com ≥ 1 for --escape run
    MUST_NOT_OBSERVE: stdout for --role divergent contains 'api.anthropic.com'; stdout for --role convergent contains 'api.anthropic.com'; network-capture row count for host api.anthropic.com = 0 for --escape

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/inference/resolve-model.ts (MODIFY)
- services/platform/src/inference/budget-ledger.ts (NEW)
- services/platform/src/cli/holo.ts (MODIFY)
- tests/integration/service/infer-router-*.test.ts (NEW)
- tests/integration/service/infer-cli-infer-call.test.ts (NEW)
writeProhibited: services/platform/src/fleet/manifest.ts - reason: Sprint 01 deliverable, modify only if manifest schema changes, services/platform/src/fleet/manifest.schema.ts - reason: Sprint 01 deliverable, schema locked, services/platform/src/mastra.ts - reason: Sprint 05 deliverable, modify only for compose root changes, Any file that introduces claudeFlash/claudePro/claudeUltra factories - reason: Direct provider references banned

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/fleet/manifest.ts lines 1-109
   - focus: Fleet Role Manifest loader + fail-closed validation pattern
2. services/platform/src/inference/resolve-model.ts lines 126-184
   - focus: resolveModel skeleton + health probe + cloud-refusal pattern
3. services/platform/src/inference/resolve-model.ts lines 155-162
   - focus: Cloud-refusal belt-and-suspenders (reject api.anthropic.com)
4. services/platform/src/fleet/manifest.schema.ts lines 1-91
   - focus: FleetRoleSchema Zod shape with healthProbe + degradationAction
5. services/platform/src/cli/holo.ts lines 1-100
   - focus: CLI command pattern for holo infer:call

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Integration tests pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-*.test.ts tests/integration/service/infer-cli-infer-call.test.ts` → Exit 0 with network capture showing 0 Anthropic requests on default path
- Typecheck passes: `pnpm tsgo --noEmit` → Exit 0
- Lint passes: `pnpm biome check .` → Exit 0
- No provider refs remain: `bun services/platform/src/cli/holo.ts verify:no-provider-refs` → Exit 0 with 0 direct provider references found

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- Budget ledger (infer-2) must be called before allowEscape=true proceeds
- Degraded-mode controller (infer-3) consumes RoleUnavailableError.degradationAction
- RED suite (infer-4) proves zero-cloud invariant with network assertions
- pattern: resolveModel(role,{allowEscape}) → health probe → cloud-refusal → @ai-sdk/openai-compatible or @ai-sdk/anthropic
- pattern_source: services/platform/src/inference/resolve-model.ts:126-184
- anti_pattern: Direct provider factories (claudeFlash/claudePro/claudeUltra) or per-call model string literals

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: none · Blocks: infer-2, infer-3, infer-4, infer-5

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "infer-1",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-fleet-manifest": {
      "description": "Fleet Role Manifest with divergent\u219235B-A3B, convergent\u219227B endpoints loaded via loadFleetManifest()",
      "seed_method": "public_api",
      "records": [
        "loadFleetManifest() returns manifest with roles divergent, convergent, judge, embed, rerank",
        "divergent.litellmModelId = '35B-A3B'",
        "convergent.litellmModelId = '27B'",
        "All roles have healthProbe.path, method, timeoutMs, expectStatus"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN Fleet Role Manifest loaded with divergent\u219235B-A3B, convergent\u219227B fleet endpoints; Mastra service running; network capture active WHEN Running holo mission run triage --goal 'X' and calling resolveModel('divergent') and resolveModel('convergent') from a reasoning step THEN Router resolves divergent to 35B-A3B litellm model id and convergent to 27B; network capture shows ZERO api.anthropic.com requests; fleet logs show N requests to :4545; holo verify:no-provider-refs reports zero direct provider references",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-zero-cloud.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "resolveModel stubbed to return fake endpoint without health probe",
            "allowEscape check omitted so default path permits Anthropic",
            "Network assertion mocked so always returns zero cloud traffic",
            "Fleet manifest validation bypassed so unknown role accepted"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-fleet-manifest",
            "action": {
              "actor": "operator",
              "steps": [
                "holo mission run triage --goal 'X' with network capture enabled",
                "Read network capture for api.anthropic.com hosts",
                "Query fleet logs for :4545 requests",
                "Run holo verify:no-provider-refs"
              ]
            },
            "end_state": {
              "must_observe": [
                "resolveModel('divergent') returns litellmModelId = '35B-A3B'",
                "resolveModel('convergent') returns litellmModelId = '27B'",
                "network-capture row count for host api.anthropic.com = 0",
                "fleet-log row count for :4545 endpoint \u2265 1",
                "holo verify:no-provider-refs exits with code 0"
              ],
              "must_not_observe": [
                "network-capture row count for host api.anthropic.com > 0",
                "resolveModel returns factory containing 'claudeFlash' or 'claudePro'",
                "holo verify:no-provider-refs reports direct-provider count > 0"
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
      "description": "GIVEN Fleet Role Manifest loaded; fleet endpoint down; network capture active WHEN Calling resolveModel('unknown-role') or resolveModel('divergent') with endpoint down THEN resolveModel('unknown-role') throws UnknownFleetRoleError; resolveModel('divergent') with endpoint down throws RoleUnavailableError with degradationAction; no Anthropic request made",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-fail-closed.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Unknown role accepted so fallback to default model occurs",
            "Health probe skipped so unhealthy endpoint returned",
            "RoleUnavailableError absent so silent fallback to cloud occurs",
            "Degradation action ignored so fallback to alternative provider"
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
              "actor": "operator",
              "steps": [
                "Call resolveModel('unknown-role') and capture error",
                "Take fleet endpoint down",
                "Call resolveModel('divergent') and capture error",
                "Verify network capture shows no cloud requests"
              ]
            },
            "end_state": {
              "must_observe": [
                "UnknownFleetRoleError.code equals 'UNKNOWN_FLEET_ROLE'",
                "RoleUnavailableError.code equals 'ROLE_UNAVAILABLE'",
                "RoleUnavailableError.degradationAction equals 'surface-unavailable' or 'queue-and-retry' or 'fail-closed'",
                "network-capture row count for host api.anthropic.com = 0"
              ],
              "must_not_observe": [
                "resolveModel('unknown-role') returns model object",
                "resolveModel('divergent') returns model when endpoint down",
                "network-capture row count for host api.anthropic.com > 0"
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
      "description": "GIVEN Router loaded; network capture active; budget ledger (per infer-2) provisioned WHEN Calling resolveModel('divergent', {allowEscape: false}) and resolveModel('divergent', {allowEscape: true}) THEN allowEscape=false blocks Anthropic even if budget OK; allowEscape=true permits Anthropic only if budget pre-check passes (per infer-2); network capture proves default-deny",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-default-deny.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "allowEscape=false check omitted so default path permits escape",
            "allowEscape parameter bypassed with static value so no real role/escape parameters",
            "Network assertion mocked so always shows zero cloud traffic"
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
              "actor": "operator",
              "steps": [
                "Call resolveModel('divergent', {allowEscape: false}) and capture result",
                "Call resolveModel('divergent', {allowEscape: true}) with sufficient budget and capture result",
                "Review network capture for Anthropic requests"
              ]
            },
            "end_state": {
              "must_observe": [
                "resolveModel allowEscape=false returns endpoint containing ':4545'",
                "resolveModel allowEscape=true returns endpoint containing 'api.anthropic.com'",
                "network-capture row count for allowEscape=false = 0",
                "network-capture row count for allowEscape=true \u2265 1"
              ],
              "must_not_observe": [
                "resolveModel allowEscape=false returns endpoint containing 'api.anthropic.com'",
                "network-capture row count for allowEscape=false > 0"
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
      "description": "GIVEN Mastra service running; fleet manifest loaded; network capture active WHEN Running holo infer:call --role divergent, holo infer:call --role convergent, holo infer:call --escape THEN CLI resolves divergent to 35B-A3B, convergent to 27B; --escape flag triggers allowEscape=true; network capture shows Anthropic only with --escape; CLI outputs resolved model details",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-cli-infer-call.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "CLI command not registered in holo.ts so command stub/empty",
            "Argument parsing stubbed so no real role/escape parameters passed",
            "Router call bypassed so app-layer mock instead of real resolveModel"
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
              "actor": "operator",
              "steps": [
                "Run holo infer:call --role divergent and capture output",
                "Run holo infer:call --role convergent and capture output",
                "Run holo infer:call --escape and capture output",
                "Review network capture for all three runs"
              ]
            },
            "end_state": {
              "must_observe": [
                "stdout for --role divergent contains '35B-A3B'",
                "stdout for --role convergent contains '27B'",
                "stdout for --escape contains 'api.anthropic.com'",
                "network-capture row count for host api.anthropic.com \u2265 1 for --escape run"
              ],
              "must_not_observe": [
                "stdout for --role divergent contains 'api.anthropic.com'",
                "stdout for --role convergent contains 'api.anthropic.com'",
                "network-capture row count for host api.anthropic.com = 0 for --escape"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Router resolves divergent role to 35B-A3B fleet model",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-zero-cloud.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Router resolves convergent role to 27B fleet model",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-zero-cloud.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Network capture shows zero Anthropic requests on default path",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-zero-cloud.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Router rejects unknown role with UnknownFleetRoleError",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-fail-closed.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Router throws RoleUnavailableError when endpoint unhealthy",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-fail-closed.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Router blocks Anthropic when allowEscape=false",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-default-deny.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Router permits Anthropic when allowEscape=true and budget OK",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-default-deny.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "holo infer:call --role divergent outputs 35B-A3B model",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-cli-infer-call.test.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
</details>
