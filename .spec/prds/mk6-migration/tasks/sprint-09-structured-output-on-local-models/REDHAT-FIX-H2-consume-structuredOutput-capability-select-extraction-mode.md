# REDHAT-FIX-H2 — Consume Fleet Role Manifest `structuredOutput` capability when selecting extraction mode

## What this does

Close red-hat H2: `extractStructured` never reads the Fleet Role Manifest `structuredOutput` flag. The probe computes `constrained` vs `repair` mode per role, but that mode is never consumed — every role takes the same code path regardless of capability. Import the manifest via `resolveModel` (which already exposes `resolved.structuredOutput`), read the flag, and select constrained-decode vs repair-loop strategy before the repair loop. When `structuredOutput: true`, use `generateObject` with `response_format: json_schema` (constrained mode). When `structuredOutput: false`, fall back to text generation + Zod validation repair loop (repair mode).

Provides: structuredOutput-flag-driven mode selection in extractStructured; constrained-decode path (generateObject with json_schema) for roles that support it; repair-loop-only path for roles that don't.

## Why

- MUST Read `resolved.structuredOutput` (already available on ResolvedModel from resolveModel) inside extractStructured
- MUST Select constrained-decode mode (generateObject with response_format json_schema) when structuredOutput=true
- MUST Select repair-loop mode (text generation + Zod parse + bounded repair) when structuredOutput=false
- MUST Log the selected mode so the operator can verify mode selection via CLI output
- MUST Keep Zod re-validation in BOTH modes — Zod is truth regardless of mode
- NEVER Bypass the structuredOutput flag — always check it before selecting strategy
- NEVER Assume constrained decoding succeeded without Zod re-validation — double validation is the invariant
- NEVER Remove the repair loop for repair-mode roles — they still need bounded retry
- STRICTLY The mode is derived from the manifest flag, NOT from a runtime probe or heuristic
- STRICTLY constrained mode and repair mode share the same typed terminal outcomes (ExtractionFailedError / BlockedError)
- Grounded in: UC-INFER-03, T-INFER-008, T-INFER-009, CAP-INF-01

## How to verify

- `rg -c 'structuredOutput' services/platform/src/inference/extract-structured.ts` → ≥1
- `rg -c 'constrained\|repair' services/platform/src/inference/extract-structured.ts` → ≥2
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts tests/integration/service/struct-explicit-fail.test.ts` → Exit 0
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/inference/extract-structured.ts (MODIFY — read structuredOutput flag, select mode) · tests/integration/service/struct-repair-loop.test.ts (MODIFY — assert mode selection) · tests/integration/service/struct-explicit-fail.test.ts (MODIFY) · .tmp/redhat-fix-h2*/** (NEW evidence)

Prohibited: services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/resolve-model.ts · services/platform/src/mastra.ts

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H2 — Consume Fleet Role Manifest `structuredOutput` capability when selecting extraction mode
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (120 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-reviewer (red-hat review H2)
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
extractStructured reads `resolved.structuredOutput` from the Fleet Role Manifest (already resolved by resolveModel), selects constrained-decode (generateObject with json_schema) when true or repair-loop mode when false, and logs the selected mode. Both modes share typed terminal outcomes and Zod re-validation.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Read `resolved.structuredOutput` inside extractStructured before selecting strategy
- MUST Select constrained-decode mode when structuredOutput=true (uses generateObject with response_format json_schema)
- MUST Select repair-loop mode when structuredOutput=false (text generation + Zod parse + bounded repair)
- MUST Log the selected mode for operator visibility
- MUST Keep Zod re-validation in BOTH modes
- NEVER Bypass the structuredOutput flag
- NEVER Assume constrained decoding succeeded without Zod re-validation
- NEVER Remove the repair loop for repair-mode roles
- STRICTLY The mode is derived from the manifest flag, NOT from runtime probe or heuristic
- STRICTLY Both modes share the same typed terminal outcomes
- STRICTLY RED evidence under .tmp/redhat-fix-h2*

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: extractStructured reads resolved.structuredOutput and selects mode (PRIMARY) (flow_ref T-INFER-009)
- [ ] AC-2: constrained mode uses generateObject with response_format json_schema when structuredOutput=true (flow_ref T-INFER-008)
- [ ] AC-3: repair mode uses text generation + Zod parse + bounded repair when structuredOutput=false (flow_ref T-INFER-008)
- [ ] AC-4: Zod re-validation runs in both modes before returning result (flow_ref T-INFER-010)
- [ ] `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-*.test.ts` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------
AC-1 extractStructured reads resolved.structuredOutput and selects mode (PRIMARY) (flow_ref T-INFER-009)
  GIVEN: extractStructured pipeline after REDHAT-FIX-H1
  WHEN:  calling extractStructured with a role whose manifest structuredOutput=true
  THEN:  mode is selected as 'constrained'; generateObject path is used
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: struct-1-implementation · evidence: stdout
    NEGATIVE_CONTROL: would fail if structuredOutput flag is never read, mode selection is hardcoded, flag is ignored
    CASE[0] start_ref=struct-1-implementation · actor=fleet
      ACTION: Run extractStructured with divergent role (structuredOutput=true) → Grep for structuredOutput reference in extract-structured.ts
      MUST_OBSERVE: rg -c 'structuredOutput' in extract-structured.ts >= 1 | extractStructured completes successfully against real fleet | mode selection logic present (constrained or repair branch)
      MUST_NOT_OBSERVE: rg returns 0 for 'structuredOutput' | mode hardcoded without reading flag | no mode selection branch

AC-2 constrained mode uses generateObject with response_format json_schema when structuredOutput=true (flow_ref T-INFER-008)
  GIVEN: role with structuredOutput=true in manifest
  WHEN:  extractStructured selects constrained mode
  THEN:  generateObject({ schema, model }) is called with schema enforcement on the wire
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: struct-1-implementation · evidence: stdout
    NEGATIVE_CONTROL: would fail if constrained mode falls back to text generation, generateObject not used despite structuredOutput=true
    CASE[0] start_ref=struct-1-implementation · actor=fleet
      ACTION: Run extractStructured with divergent role → Verify generateObject path is used
      MUST_OBSERVE: result is schema-valid | fleetCount >= 1 | mode logged as 'constrained'
      MUST_NOT_OBSERVE: free-text generation used despite structuredOutput=true | mode not logged

AC-3 repair mode uses text generation + Zod parse + bounded repair when structuredOutput=false (flow_ref T-INFER-008)
  GIVEN: role with structuredOutput=false in manifest (or simulated)
  WHEN:  extractStructured selects repair mode
  THEN:  text generation + Zod parse + bounded repair loop is used; MAX_REPAIR_ATTEMPTS enforced
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: struct-1-implementation · evidence: stdout
    NEGATIVE_CONTROL: would fail if repair mode is not implemented, repair loop removed when structuredOutput=false
    CASE[0] start_ref=struct-1-implementation · actor=fleet
      ACTION: Run extractStructured with a role that has structuredOutput=false → Verify repair-loop path
      MUST_OBSERVE: MAX_REPAIR_ATTEMPTS enforced | mode logged as 'repair' | Zod parse in loop
      MUST_NOT_OBSERVE: generateObject used for repair-mode role | unbounded repair loop | no Zod parse

AC-4 Zod re-validation runs in both modes before returning result (flow_ref T-INFER-010)
  GIVEN: extractStructured with both modes
  WHEN:  model returns output in either mode
  THEN:  schema.parse(output) runs before returning — Zod is truth regardless of mode
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: struct-1-implementation · evidence: stdout
    NEGATIVE_CONTROL: would fail if Zod validation skipped in constrained mode, Zod validation removed from repair mode
    CASE[0] start_ref=struct-1-implementation · actor=fleet
      ACTION: Run extractStructured in both modes → Verify schema.parse called in both
      MUST_OBSERVE: schema.parse present in both mode branches | result passes Zod validation in both modes
      MUST_NOT_OBSERVE: schema.parse only in one mode branch | result returned without Zod validation

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [structuredOutput flag read in extract-structured.ts] (maps_to_ac AC-1)
- TC-2 [constrained mode uses generateObject] (maps_to_ac AC-2)
- TC-3 [repair mode uses text gen + Zod parse + bounded repair] (maps_to_ac AC-3)
- TC-4 [Zod re-validation in both modes] (maps_to_ac AC-4)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/inference/extract-structured.ts (MODIFY — read structuredOutput, select mode)
- tests/integration/service/struct-repair-loop.test.ts (MODIFY — assert mode selection)
- tests/integration/service/struct-explicit-fail.test.ts (MODIFY)
- .tmp/redhat-fix-h2*/** (NEW evidence)
writeProhibited: services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/resolve-model.ts · services/platform/src/mastra.ts

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/inference/extract-structured.ts lines 120-195
   - focus: Where to add structuredOutput check after resolveModel and before repair loop
2. services/platform/src/inference/resolve-model.ts lines 70-93
   - focus: ResolvedModel type — structuredOutput: boolean field at line 77
3. services/platform/src/fleet/manifest.schema.ts lines 37-51
   - focus: FleetRoleSchema — structuredOutput: z.boolean() at line 46
4. services/platform/src/inference/probe-capability.ts lines 140-144
   - focus: How the probe already computes mode from supportsJsonSchema

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- structuredOutput consumed: `rg -c 'structuredOutput' services/platform/src/inference/extract-structured.ts` → ≥1
- Mode selection present: `rg -c 'constrained\|repair' services/platform/src/inference/extract-structured.ts` → ≥2
- Integration tests pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-*.test.ts` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: resolveModel(role) → read resolved.structuredOutput → if true: generateObject({schema, model}) constrained → if false: generateText + Zod repair loop
- pattern_source: resolve-model.ts line 77 (structuredOutput on ResolvedModel), manifest.schema.ts line 46
- anti_pattern: Ignoring structuredOutput flag and always using the same path regardless of capability
- agent_rationale: The mode-selection logic the probe computes was never consumed — this wires the manifest flag into the pipeline's strategy selection.
- Depends on REDHAT-FIX-H1 (generateObject path must exist for constrained mode)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: REDHAT-FIX-H1 (generateObject path) · struct-1, struct-2 (completed) · Blocks: none

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H2",
  "proposed_by": "mastra-reviewer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "struct-1-implementation": {
      "description": "extractStructured implementation with generateObject from REDHAT-FIX-H1",
      "seed_method": "public_api",
      "records": [
        "extract-structured.ts uses generateObject",
        "resolveModel returns resolved.structuredOutput",
        "Fleet manifest has structuredOutput boolean per role"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN extractStructured WHEN calling with role THEN reads resolved.structuredOutput and selects mode",
      "verify": "rg -c 'structuredOutput' services/platform/src/inference/extract-structured.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-009",
        "negative_control": { "would_fail_if": ["structuredOutput flag is never read", "mode selection is hardcoded", "flag is ignored"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "struct-1-implementation",
            "action": { "actor": "fleet", "steps": ["Run extractStructured with divergent role", "Grep for structuredOutput reference"] },
            "end_state": {
              "must_observe": ["rg -c 'structuredOutput' in extract-structured.ts >= 1", "mode selection logic present"],
              "must_not_observe": ["rg returns 0 for structuredOutput", "mode hardcoded without reading flag"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN role with structuredOutput=true WHEN extractStructured selects constrained mode THEN generateObject with json_schema is used",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-008",
        "negative_control": { "would_fail_if": ["constrained mode falls back to text generation", "generateObject not used despite structuredOutput=true"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "struct-1-implementation",
            "action": { "actor": "fleet", "steps": ["Run extractStructured with divergent role", "Verify generateObject path"] },
            "end_state": {
              "must_observe": ["result is schema-valid", "fleetCount >= 1", "mode logged as constrained"],
              "must_not_observe": ["free-text generation used despite structuredOutput=true", "mode not logged"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN role with structuredOutput=false WHEN extractStructured selects repair mode THEN text generation + Zod parse + bounded repair used",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-explicit-fail.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-008",
        "negative_control": { "would_fail_if": ["repair mode not implemented", "repair loop removed when structuredOutput=false"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "struct-1-implementation",
            "action": { "actor": "fleet", "steps": ["Run extractStructured with structuredOutput=false role", "Verify repair-loop path"] },
            "end_state": {
              "must_observe": ["MAX_REPAIR_ATTEMPTS enforced", "mode logged as repair", "Zod parse in loop"],
              "must_not_observe": ["generateObject used for repair-mode role", "unbounded repair loop", "no Zod parse"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN extractStructured with both modes WHEN model returns output THEN schema.parse runs before returning in both modes",
      "verify": "rg -c 'schema.parse' services/platform/src/inference/extract-structured.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "flow_ref": "T-INFER-010",
        "negative_control": { "would_fail_if": ["Zod validation skipped in constrained mode", "Zod validation removed from repair mode"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "struct-1-implementation",
            "action": { "actor": "fleet", "steps": ["Run extractStructured in both modes", "Verify schema.parse in both"] },
            "end_state": {
              "must_observe": ["schema.parse present in both mode branches", "result passes Zod validation in both modes"],
              "must_not_observe": ["schema.parse only in one branch", "result returned without Zod validation"]
            }
          }
        ]
      }
    },
    { "id": "TC-1", "type": "test_criterion", "description": "structuredOutput flag read", "verify": "rg -c 'structuredOutput' services/platform/src/inference/extract-structured.ts", "maps_to_ac": "AC-1" },
    { "id": "TC-2", "type": "test_criterion", "description": "constrained mode uses generateObject", "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts", "maps_to_ac": "AC-2" },
    { "id": "TC-3", "type": "test_criterion", "description": "repair mode uses bounded repair", "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-explicit-fail.test.ts", "maps_to_ac": "AC-3" },
    { "id": "TC-4", "type": "test_criterion", "description": "Zod re-validation in both modes", "verify": "rg -c 'schema.parse' services/platform/src/inference/extract-structured.ts", "maps_to_ac": "AC-4" }
  ]
}
-->
</details>
