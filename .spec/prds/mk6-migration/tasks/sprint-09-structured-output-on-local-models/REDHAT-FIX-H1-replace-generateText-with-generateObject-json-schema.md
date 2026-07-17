# REDHAT-FIX-H1 — Replace free-text `generateText` with `generateObject` + `json_schema` constrained decoding

## What this does

Close red-hat H1 (CRITICAL): the sprint's core value proposition — json_schema constrained decoding → Zod re-validation → bounded repair — was never delivered because `extractStructured` and `probeJsonSchemaSupport` use `generateText` (plain text generation with a JSON-flavored prompt string) instead of `generateObject` with `responseFormat: json_schema`. Switch both code paths to `generateObject({ schema, model })` from the `ai` SDK, which sends `response_format: { type: "json_schema" }` on the wire and enables token-level schema enforcement on backends that support it (llama.cpp grammar, vLLM guided decoding via LiteLLM).

Provides: generateObject-based constrained decoding in extractStructured; generateObject-based probe in probeJsonSchemaSupport; response_format json_schema on the wire; real token-level schema enforcement when the backend supports it.

## Why

- MUST Replace `generateText` with `generateObject({ schema, model })` from the `ai` SDK in `extractStructured` — sends `response_format: { type: "json_schema" }` on the wire
- MUST Replace `generateText` with `generateObject({ schema: PROBE_SCHEMA, model })` in `probeJsonSchemaSupport`
- MUST Keep the bounded repair loop intact — `generateObject` failures (schema validation at the model layer) still enter the repair loop
- MUST Keep Zod re-validation after `generateObject` returns — Zod is truth, not the model's internal schema enforcement
- MUST Run against the real fleet at `:4545` — no mock models, no endpointOverride
- MUST Write RED evidence showing the current `generateText` path produces free-text output (no constrained decoding), then GREEN after switching to `generateObject`
- NEVER Fall back to `generateText` when `generateObject` is available — constrained decoding is the sprint's core value proposition
- NEVER Accept model output without Zod validation even when `generateObject` enforces schema — double-validation is the invariant
- NEVER Stub `generateObject` to return fake valid objects — real model calls required
- STRICTLY Every `generateObject` call goes through `resolveModel(role)` → `createFleetChatModel` — never bypass the router
- STRICTLY PLATFORM_IT=1 for all integration tests — real fleet, real schema enforcement
- STRICTLY RED evidence under `.tmp/redhat-fix-h1*` showing pre-fix `generateText` usage and post-fix `generateObject` with `response_format: json_schema`
- Grounded in: UC-INFER-03, T-INFER-008, CAP-INF-01

## How to verify

- `rg -c 'generateObject' services/platform/src/inference/extract-structured.ts` → ≥1
- `rg -c 'generateObject' services/platform/src/inference/probe-capability.ts` → ≥1
- `rg -c 'generateText' services/platform/src/inference/extract-structured.ts` → 0 (no generateText calls in the extraction path)
- `rg -c 'generateText' services/platform/src/inference/probe-capability.ts` → 0 (no generateText calls in the probe path)
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts tests/integration/service/struct-explicit-fail.test.ts tests/integration/service/struct-tripwire-blocked.test.ts tests/integration/service/struct-boot-probe.test.ts` → Exit 0
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/inference/extract-structured.ts (MODIFY — replace generateText with generateObject in the repair loop) · services/platform/src/inference/probe-capability.ts (MODIFY — replace generateText with generateObject in probeJsonSchemaSupport) · tests/integration/service/struct-repair-loop.test.ts (MODIFY — assert generateObject path) · tests/integration/service/struct-explicit-fail.test.ts (MODIFY — assert generateObject path) · tests/integration/service/struct-boot-probe.test.ts (MODIFY — assert generateObject in probe) · .tmp/redhat-fix-h1*/** (NEW evidence)

Prohibited: services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/resolve-model.ts · services/platform/src/mastra.ts

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H1 — Replace free-text `generateText` with `generateObject` + `json_schema` constrained decoding
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (180 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-reviewer (red-hat review H1)
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: true)
CAPABILITY: CAP-INF-01
SPRINT:     [Sprint 9 — Structured Output on Local Models](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
extractStructured uses `generateObject({ schema, model })` which sends `response_format: { type: "json_schema" }` on the wire; probeJsonSchemaSupport uses `generateObject` for the probe call; the bounded repair loop and Zod re-validation remain intact; all integration tests pass against the real fleet.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Replace `generateText` with `generateObject({ schema, model })` from the `ai` SDK in `extractStructured`
- MUST Replace `generateText` with `generateObject({ schema: PROBE_SCHEMA, model })` in `probeJsonSchemaSupport`
- MUST Keep the bounded repair loop intact — `generateObject` failures still enter the repair loop
- MUST Keep Zod re-validation after `generateObject` returns — Zod is truth, not the model's internal schema enforcement
- MUST Run against the real fleet at `:4545` — no mock models, no endpointOverride
- MUST Write RED evidence showing the current `generateText` path produces free-text output (no constrained decoding), then GREEN after switching to `generateObject`
- NEVER Fall back to `generateText` when `generateObject` is available
- NEVER Accept model output without Zod validation even when `generateObject` enforces schema
- NEVER Stub `generateObject` to return fake valid objects — real model calls required
- STRICTLY Every `generateObject` call goes through `resolveModel(role)` → `createFleetChatModel`
- STRICTLY PLATFORM_IT=1 for all integration tests
- STRICTLY RED evidence under `.tmp/redhat-fix-h1*`

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: extractStructured uses `generateObject({ schema, model })` — `response_format: json_schema` on the wire (flow_ref T-INFER-008)
- [ ] AC-2: probeJsonSchemaSupport uses `generateObject` for the probe call (flow_ref T-INFER-009)
- [ ] AC-3: bounded repair loop still functions — `generateObject` schema validation failure enters repair, exhaustion throws ExtractionFailedError (flow_ref T-INFER-008)
- [ ] AC-4: zero `generateText` calls in extract-structured.ts and probe-capability.ts (flow_ref T-INFER-010)
- [ ] `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-*.test.ts` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 extractStructured uses generateObject with schema parameter — sends response_format json_schema on the wire (PRIMARY) (flow_ref T-INFER-008)
  GIVEN: extractStructured pipeline at services/platform/src/inference/extract-structured.ts
  WHEN:  calling extractStructured(simpleSchema, 'Hello World count 5 tags ai local', 'divergent') against real fleet
  THEN:  generateObject({ schema, model }) is called — NOT generateText; response_format: json_schema sent on the wire; Zod re-validation passes; result is schema-valid
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: struct-1-implementation · evidence: stdout
    NEGATIVE_CONTROL: would fail if implementation keeps generateText, generateObject is stubbed, schema enforcement is skipped, Zod validation is removed, fleet is mocked
    CASE[0] start_ref=struct-1-implementation · actor=fleet
      ACTION: Run extractStructured with simpleSchema against real fleet → Capture network traffic → Grep extract-structured.ts for generateObject usage
      MUST_OBSERVE: grep count for 'generateObject' in extract-structured.ts >= 1 | grep count for 'generateText' in extract-structured.ts = 0 | extractStructured returns {title: string, count: number, tags: string[]} matching simpleSchema | fleetCount >= 1
      MUST_NOT_OBSERVE: grep count for 'generateText' >= 1 in extraction path | extractStructured returns free-text | Zod validation skipped | fleetCount = 0

AC-2 probeJsonSchemaSupport uses generateObject with PROBE_SCHEMA (flow_ref T-INFER-009)
  GIVEN: probe-capability.ts at services/platform/src/inference/probe-capability.ts
  WHEN:  calling probeRoleCapability('divergent') against real fleet
  THEN:  probeJsonSchemaSupport uses generateObject({ schema: PROBE_SCHEMA, model }) — NOT generateText
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: struct-2-implementation · evidence: stdout
    NEGATIVE_CONTROL: would fail if probe keeps generateText, generateObject is stubbed, probe returns true without real call
    CASE[0] start_ref=struct-2-implementation · actor=fleet
      ACTION: Run probeRoleCapability('divergent') → Grep probe-capability.ts for generateObject usage
      MUST_OBSERVE: grep count for 'generateObject' in probe-capability.ts >= 1 | grep count for 'generateText' in probe-capability.ts = 0 | probe returns RoleCapability with supportsJsonSchema boolean
      MUST_NOT_OBSERVE: grep count for 'generateText' >= 1 in probe path | probe uses /health proxy | probe returns static cached value

AC-3 bounded repair loop still functions with generateObject (flow_ref T-INFER-008)
  GIVEN: extractStructured with generateObject + repair loop
  WHEN:  model returns schema-invalid output via generateObject (or generateObject throws)
  THEN:  repair loop runs (attempts 1..MAX_REPAIR_ATTEMPTS), exhaustion throws ExtractionFailedError with attempts=3
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: struct-1-implementation · evidence: stdout
    NEGATIVE_CONTROL: would fail if repair loop removed, exhaustion doesn't throw typed error, repair loop is unbounded
    CASE[0] start_ref=struct-1-implementation · actor=fleet
      ACTION: Run extractStructured with alwaysFailingSchema against real fleet → Verify ExtractionFailedError thrown
      MUST_OBSERVE: ExtractionFailedError with code 'EXTRACTION_FAILED' thrown | error.attempts = MAX_REPAIR_ATTEMPTS (3) | error contains schemaErrors array
      MUST_NOT_OBSERVE: silent return of invalid object | unbounded loop | generic Error thrown

AC-4 zero generateText calls in extraction and probe paths (flow_ref T-INFER-010)
  GIVEN: extract-structured.ts and probe-capability.ts after fix
  WHEN:  grepping for generateText
  THEN:  zero matches in extraction and probe call sites (comments may reference it but no actual calls)
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: struct-1-implementation · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if generateText is still used in extraction path or probe path
    CASE[0] start_ref=struct-1-implementation · actor=reviewer
      ACTION: Grep extract-structured.ts for generateText usage → Grep probe-capability.ts for generateText usage
      MUST_OBSERVE: grep count for 'generateText' in extract-structured.ts = 0 | grep count for 'generateText' in probe-capability.ts = 0
      MUST_NOT_OBSERVE: grep returns >= 1 for 'generateText' in either file

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [generateObject used in extract-structured.ts] (maps_to_ac AC-1)
- TC-2 [generateObject used in probe-capability.ts] (maps_to_ac AC-2)
- TC-3 [repair loop bounded and throws ExtractionFailedError on exhaustion] (maps_to_ac AC-3)
- TC-4 [zero generateText calls in extraction and probe paths] (maps_to_ac AC-4)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/inference/extract-structured.ts (MODIFY — replace generateText with generateObject)
- services/platform/src/inference/probe-capability.ts (MODIFY — replace generateText with generateObject)
- tests/integration/service/struct-repair-loop.test.ts (MODIFY)
- tests/integration/service/struct-explicit-fail.test.ts (MODIFY)
- tests/integration/service/struct-boot-probe.test.ts (MODIFY)
- .tmp/redhat-fix-h1*/** (NEW evidence)
writeProhibited: services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/resolve-model.ts · services/platform/src/mastra.ts

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/inference/extract-structured.ts lines 130-195
   - focus: The repair loop — replace generateText with generateObject at lines 135-148
2. services/platform/src/inference/probe-capability.ts lines 71-119
   - focus: probeJsonSchemaSupport — replace generateText with generateObject at lines 80-98
3. services/platform/src/inference/resolve-model.ts lines 100-130
   - focus: createFleetChatModel — how the fleet model is created (passes through to generateObject)
4. tests/integration/service/struct-repair-loop.test.ts lines 1-50
   - focus: Test structure for repair-loop assertions

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- generateObject used: `rg -c 'generateObject' services/platform/src/inference/extract-structured.ts` → ≥1
- generateText removed from extraction: `rg -c 'generateText' services/platform/src/inference/extract-structured.ts` → 0
- generateText removed from probe: `rg -c 'generateText' services/platform/src/inference/probe-capability.ts` → 0
- Integration tests pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-*.test.ts` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: resolveModel(role) → createFleetChatModel(resolved) → generateObject({ schema, model: fleetModel }) → Zod.parse() → return or repair
- pattern_source: struct-1 DESIGN NOTES line 200, AI SDK generateObject docs
- anti_pattern: generateText with JSON-flavored prompt string — no token-level schema enforcement, model can output arbitrary text
- agent_rationale: Core pipeline fix — the sprint's entire value proposition (constrained decoding) was not delivered. Must switch to generateObject which sends response_format: json_schema on the wire.
- REDHAT-FIX-H2 depends on this (structuredOutput flag consumption assumes generateObject path exists)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: struct-1, struct-2, struct-3 (all completed) · Blocks: REDHAT-FIX-H2, REDHAT-FIX-G-ORACLE

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H1",
  "proposed_by": "mastra-reviewer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "struct-1-implementation": {
      "description": "Current extractStructured implementation from struct-1",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/inference/extract-structured.ts exists with generateText at line 135",
        "extractStructured function with MAX_REPAIR_ATTEMPTS=3 repair loop",
        "ExtractionFailedError and BlockedError typed errors defined"
      ]
    },
    "struct-2-implementation": {
      "description": "Current probe implementation from struct-2",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/inference/probe-capability.ts exists with generateText at line 81",
        "probeJsonSchemaSupport function defined",
        "probeRoleCapability function defined"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN extractStructured pipeline WHEN calling against real fleet THEN generateObject({ schema, model }) is used — NOT generateText; response_format json_schema on the wire; Zod re-validation passes",
      "verify": "rg -c 'generateObject' services/platform/src/inference/extract-structured.ts && rg -c 'generateText' services/platform/src/inference/extract-structured.ts | grep -c '0'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-008",
        "negative_control": {
          "would_fail_if": ["implementation keeps generateText", "generateObject is stubbed", "schema enforcement is skipped", "Zod validation is removed", "fleet is mocked"]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "struct-1-implementation",
            "action": {
              "actor": "fleet",
              "steps": ["Run extractStructured with simpleSchema against real fleet", "Capture network traffic", "Grep extract-structured.ts for generateObject usage"]
            },
            "end_state": {
              "must_observe": ["grep count for 'generateObject' in extract-structured.ts >= 1", "grep count for 'generateText' in extract-structured.ts = 0", "extractStructured returns {title, count, tags} matching simpleSchema", "fleetCount >= 1"],
              "must_not_observe": ["grep count for 'generateText' >= 1 in extraction path", "extractStructured returns free-text", "Zod validation skipped", "fleetCount = 0"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN probe-capability.ts WHEN calling probeRoleCapability THEN probeJsonSchemaSupport uses generateObject — NOT generateText",
      "verify": "rg -c 'generateObject' services/platform/src/inference/probe-capability.ts && rg -c 'generateText' services/platform/src/inference/probe-capability.ts | grep -c '0'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-009",
        "negative_control": {
          "would_fail_if": ["probe keeps generateText", "generateObject is stubbed", "probe returns true without real call", "probe uses /health proxy", "probe returns static cached value"]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "struct-2-implementation",
            "action": {
              "actor": "fleet",
              "steps": ["Run probeRoleCapability('divergent')", "Grep probe-capability.ts for generateObject usage"]
            },
            "end_state": {
              "must_observe": ["grep count for 'generateObject' in probe-capability.ts >= 1", "grep count for 'generateText' in probe-capability.ts = 0", "probe returns RoleCapability with supportsJsonSchema boolean"],
              "must_not_observe": ["grep count for 'generateText' >= 1 in probe path", "probe uses /health proxy", "probe returns static cached value"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN extractStructured with generateObject WHEN model returns schema-invalid output THEN repair loop runs and exhaustion throws ExtractionFailedError",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-explicit-fail.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-008",
        "negative_control": {
          "would_fail_if": ["repair loop removed", "exhaustion doesn't throw typed error", "repair loop is unbounded", "silent return of invalid object"]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "struct-1-implementation",
            "action": {
              "actor": "fleet",
              "steps": ["Run extractStructured with alwaysFailingSchema against real fleet", "Verify ExtractionFailedError thrown"]
            },
            "end_state": {
              "must_observe": ["ExtractionFailedError with code EXTRACTION_FAILED thrown", "error.attempts = 3", "error contains schemaErrors array"],
              "must_not_observe": ["silent return of invalid object", "unbounded loop", "generic Error thrown"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN extract-structured.ts and probe-capability.ts after fix WHEN grepping for generateText THEN zero matches in extraction and probe call sites",
      "verify": "rg -c 'generateText' services/platform/src/inference/extract-structured.ts services/platform/src/inference/probe-capability.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "negative_control": {
          "would_fail_if": ["generateText is still used in extraction path", "generateText is still used in probe path"]
        },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "struct-1-implementation",
            "action": {
              "actor": "reviewer",
              "steps": ["Grep extract-structured.ts for generateText", "Grep probe-capability.ts for generateText"]
            },
            "end_state": {
              "must_observe": ["grep count for 'generateText' in extract-structured.ts = 0", "grep count for 'generateText' in probe-capability.ts = 0"],
              "must_not_observe": ["grep returns >= 1 for 'generateText' in either file"]
            }
          }
        ]
      }
    },
    { "id": "TC-1", "type": "test_criterion", "description": "generateObject used in extract-structured.ts", "verify": "rg -c 'generateObject' services/platform/src/inference/extract-structured.ts", "maps_to_ac": "AC-1" },
    { "id": "TC-2", "type": "test_criterion", "description": "generateObject used in probe-capability.ts", "verify": "rg -c 'generateObject' services/platform/src/inference/probe-capability.ts", "maps_to_ac": "AC-2" },
    { "id": "TC-3", "type": "test_criterion", "description": "Repair loop bounded and throws ExtractionFailedError on exhaustion", "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-explicit-fail.test.ts", "maps_to_ac": "AC-3" },
    { "id": "TC-4", "type": "test_criterion", "description": "Zero generateText calls in extraction and probe paths", "verify": "rg -c 'generateText' services/platform/src/inference/extract-structured.ts services/platform/src/inference/probe-capability.ts", "maps_to_ac": "AC-4" }
  ]
}
-->
</details>
