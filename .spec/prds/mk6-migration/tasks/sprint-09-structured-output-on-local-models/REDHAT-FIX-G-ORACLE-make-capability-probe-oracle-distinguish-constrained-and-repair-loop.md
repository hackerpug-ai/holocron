# REDHAT-FIX-G-ORACLE — Make capability-probe oracle distinguish constrained and repair-loop roles via real support probing

## What this does

probeJsonSchemaSupport uses generateObject with response_format:json_schema to test REAL backend constrained-decoding support; the convergent role correctly reports supportsJsonSchema:false, mode:repair and the divergent role reports supportsJsonSchema:true, mode:constrained; the gate step 1 oracle resolves correctly.

Provides: resolveModel(role) → createFleetChatModel(resolved) → generateObject({ schema: PROBE_SCHEMA, model: fleetModel }) → success means supportsJsonSchema:true (constrained); failure with json_schema-rejection (400/422) means supportsJsonSchema:false (repair, no error); failure with transport error means supportsJsonSchema:false (repair, error recorded)..

## Why

- MUST Replace `generateText` with `generateObject({ schema: PROBE_SCHEMA, model })` in probeJsonSchemaSupport — this sends `response_format: { type: "json_schema" }` on the wire so the backend either accepts (constrained) or rejects (repair-loop) at the protocol level, not just whether the model can emit JSON-like text
- MUST Detect json_schema support by whether the REAL generateObject call SUCCEEDS (backend accepts response_format:json_schema and returns a schema-conformant object) vs FAILS (backend rejects response_format:json_schema with a 400/422/unsupported error) — NOT by whether the model can produce parseable JSON text
- MUST Make the convergent role report `supportsJsonSchema: false, mode: "repair"` (the endpoint that does NOT support json_schema constrained decoding) and the divergent role report `supportsJsonSchema: true, mode: "constrained"` — this resolves the gate step 1 oracle mismatch (struct-2 AC-1 MUST_OBSERVE: 'convergent: json_schema NOT supported (repair-loop mode)')
- MUST Distinguish a transport-level error (timeout, connection refused → fail-closed to repair mode, as today) from a json_schema-rejection (backend returns 400/422 specifically because response_format:json_schema is unsupported → supportsJsonSchema: false, mode: repair). A timeout is NOT evidence of json_schema support one way or the other — fail-closed to repair, but record the error
- MUST Write RED evidence FIRST: a test that runs probeRoleCapability('convergent') against the real fleet and FAILS because the current probe uses generateText (all roles report constrained); then GREEN after switching to generateObject (convergent reports repair-loop)
- NEVER Use generateText for the probe — it only tests whether the model can emit JSON-like text, which ALL LLMs can; it cannot detect backend-level response_format:json_schema support
- NEVER Return supportsJsonSchema:true based on text-parsing alone — the probe must test the ACTUAL response_format:json_schema wire protocol
- NEVER Mock the fleet, the model, or generateObject in the probe — real fleet call required
- NEVER Hard-code which role is convergent vs divergent — the probe must DETECT it dynamically via the real generateObject response
- STRICTLY Every generateObject call goes through resolveModel(role) → createFleetChatModel — never bypass the router
- STRICTLY PLATFORM_IT=1 for all integration tests — real fleet, real response_format:json_schema probing
- STRICTLY Depends on REDHAT-FIX-H1 (generateObject path must exist in extract-structured.ts for the probe result to be consumable)

## How to verify

- rg -c 'generateObject' services/platform/src/inference/probe-capability.ts → >= 1
- rg -c 'generateText' services/platform/src/inference/probe-capability.ts → 0
- PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts → Exit 0
- pnpm tsgo --noEmit → Exit 0
- pnpm biome check . → Exit 0

## Scope

Writes: services/platform/src/inference/probe-capability.ts (MODIFY — replace generateText with generateObject in probeJsonSchemaSupport; add json_schema-rejection vs transport-error distinction) · tests/integration/service/struct-boot-probe.test.ts (MODIFY — assert generateObject path; assert convergent=repair/divergent=constrained oracle; add error-distinction test) · .tmp/redhat-fix-g-oracle*/** (NEW evidence)

Prohibited: services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/resolve-model.ts · services/platform/src/inference/extract-structured.ts · services/platform/src/mastra.ts · services/platform/src/cli/holo.ts

<details>
<summary>▾ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-G-ORACLE — Make capability-probe oracle distinguish constrained and repair-loop roles via real support probing
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (90 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-reviewer
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
probeJsonSchemaSupport uses generateObject with response_format:json_schema to test REAL backend constrained-decoding support; the convergent role correctly reports supportsJsonSchema:false, mode:repair and the divergent role reports supportsJsonSchema:true, mode:constrained; the gate step 1 oracle resolves correctly.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Replace `generateText` with `generateObject({ schema: PROBE_SCHEMA, model })` in probeJsonSchemaSupport — this sends `response_format: { type: "json_schema" }` on the wire so the backend either accepts (constrained) or rejects (repair-loop) at the protocol level, not just whether the model can emit JSON-like text
- MUST Detect json_schema support by whether the REAL generateObject call SUCCEEDS (backend accepts response_format:json_schema and returns a schema-conformant object) vs FAILS (backend rejects response_format:json_schema with a 400/422/unsupported error) — NOT by whether the model can produce parseable JSON text
- MUST Make the convergent role report `supportsJsonSchema: false, mode: "repair"` (the endpoint that does NOT support json_schema constrained decoding) and the divergent role report `supportsJsonSchema: true, mode: "constrained"` — this resolves the gate step 1 oracle mismatch (struct-2 AC-1 MUST_OBSERVE: 'convergent: json_schema NOT supported (repair-loop mode)')
- MUST Distinguish a transport-level error (timeout, connection refused → fail-closed to repair mode, as today) from a json_schema-rejection (backend returns 400/422 specifically because response_format:json_schema is unsupported → supportsJsonSchema: false, mode: repair). A timeout is NOT evidence of json_schema support one way or the other — fail-closed to repair, but record the error
- MUST Write RED evidence FIRST: a test that runs probeRoleCapability('convergent') against the real fleet and FAILS because the current probe uses generateText (all roles report constrained); then GREEN after switching to generateObject (convergent reports repair-loop)
- NEVER Use generateText for the probe — it only tests whether the model can emit JSON-like text, which ALL LLMs can; it cannot detect backend-level response_format:json_schema support
- NEVER Return supportsJsonSchema:true based on text-parsing alone — the probe must test the ACTUAL response_format:json_schema wire protocol
- NEVER Mock the fleet, the model, or generateObject in the probe — real fleet call required
- NEVER Hard-code which role is convergent vs divergent — the probe must DETECT it dynamically via the real generateObject response
- STRICTLY Every generateObject call goes through resolveModel(role) → createFleetChatModel — never bypass the router
- STRICTLY PLATFORM_IT=1 for all integration tests — real fleet, real response_format:json_schema probing
- STRICTLY Depends on REDHAT-FIX-H1 (generateObject path must exist in extract-structured.ts for the probe result to be consumable)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: probeJsonSchemaSupport uses generateObject({ schema: PROBE_SCHEMA, model }) — NOT generateText; response_format:json_schema sent on the wire (flow_ref T-INFER-009)
- [ ] AC-2: probeRoleCapability('convergent') against the real fleet returns supportsJsonSchema:false, mode:repair (the endpoint that rejects response_format:json_schema) (flow_ref T-INFER-009)
- [ ] AC-3: probeRoleCapability('divergent') against the real fleet returns supportsJsonSchema:true, mode:constrained (the endpoint that accepts response_format:json_schema) (flow_ref T-INFER-009)
- [ ] AC-4: the probe distinguishes json_schema-rejection (400/422 unsupported → repair mode) from transport errors (timeout/refused → repair mode + error field recorded) (flow_ref T-INFER-010)
- [ ] PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts green + pnpm tsgo --noEmit clean + pnpm biome check . clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 GIVEN probe-capability.ts at services/platform/src/inference/probe-capability.ts WHEN calling probeJsonSchemaSupport against a resolved fleet role THEN generateObject({ schema: PROBE_SCHEMA, model }) is used — NOT generateText; response_format:json_schema is sent on the wire (PRIMARY) (flow_ref T-INFER-009)
  GIVEN: probe-capability.ts after replacing generateText with generateObject in probeJsonSchemaSupport
  WHEN:  calling probeRoleCapability('divergent') against the real fleet and grepping probe-capability.ts for the call type
  THEN:  generateObject is used (grep count >= 1); generateText is NOT used in the probe path (grep count 0); response_format:json_schema is on the wire
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: probe-capability-implementation · evidence: stdout
    NEGATIVE_CONTROL: would fail if the probe keeps generateText (all roles report constrained — the RED state), generateObject is stubbed to return a fake valid object, the probe parses text instead of using the schema-validated object path, the fleet is mocked, response_format:json_schema is not actually sent on the wire
    CASE start_ref=probe-capability-implementation · actor=fleet
      ACTION: Start the real fleet at :4545 (PLATFORM_IT=1)
      ACTION: Run probeRoleCapability('divergent') against the real fleet
      ACTION: Grep probe-capability.ts for generateObject usage
      ACTION: Grep probe-capability.ts for generateText usage in the probe call site
      MUST_OBSERVE: rg count for 'generateObject' in probe-capability.ts >= 1 | rg count for 'generateText' in probe-capability.ts == 0 (in the probe call site) | probe returns a RoleCapability with supportsJsonSchema boolean | fleetCount >= 1 (real fleet call made)
      MUST_NOT_OBSERVE: rg count for 'generateText' >= 1 in the probe call site | probe uses /health proxy | probe returns a static cached value | fleetCount == 0 (mocked)

AC-2 GIVEN the convergent fleet role (the endpoint that does NOT support response_format:json_schema constrained decoding) WHEN calling probeRoleCapability('convergent') against the real fleet THEN the probe returns supportsJsonSchema:false, mode:repair because the REAL generateObject call with response_format:json_schema is rejected by the backend (flow_ref T-INFER-009)
  GIVEN: the convergent role in the Fleet Role Manifest, which maps to an endpoint that does not support response_format:json_schema
  WHEN:  calling probeRoleCapability('convergent') against the real fleet after the generateObject switch
  THEN:  RoleCapability.supportsJsonSchema == false AND RoleCapability.mode == 'repair'
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: probe-capability-implementation · evidence: stdout
    NEGATIVE_CONTROL: would fail if the probe uses generateText (convergent falsely reports constrained — the RED state / gate oracle mismatch), the probe hard-codes convergent as constrained, generateObject is stubbed, the fleet is mocked to always accept json_schema
    CASE start_ref=probe-capability-implementation · actor=fleet
      ACTION: Start the real fleet at :4545 (PLATFORM_IT=1)
      ACTION: Run probeRoleCapability('convergent') against the real fleet
      ACTION: Assert the returned RoleCapability
      MUST_OBSERVE: RoleCapability.supportsJsonSchema == false | RoleCapability.mode == 'repair' | RoleCapability.role == 'convergent'
      MUST_NOT_OBSERVE: supportsJsonSchema == true (the false-positive from generateText probe — the RED state) | mode == 'constrained' for convergent

AC-3 GIVEN the divergent fleet role (the endpoint that DOES support response_format:json_schema constrained decoding) WHEN calling probeRoleCapability('divergent') against the real fleet THEN the probe returns supportsJsonSchema:true, mode:constrained because the REAL generateObject call with response_format:json_schema succeeds (flow_ref T-INFER-009)
  GIVEN: the divergent role in the Fleet Role Manifest, which maps to an endpoint that supports response_format:json_schema
  WHEN:  calling probeRoleCapability('divergent') against the real fleet after the generateObject switch
  THEN:  RoleCapability.supportsJsonSchema == true AND RoleCapability.mode == 'constrained'
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: probe-capability-implementation · evidence: stdout
    NEGATIVE_CONTROL: would fail if the probe uses generateText and cannot detect real support, generateObject is stubbed to always fail (divergent falsely reports repair), the fleet is mocked to always reject json_schema
    CASE start_ref=probe-capability-implementation · actor=fleet
      ACTION: Start the real fleet at :4545 (PLATFORM_IT=1)
      ACTION: Run probeRoleCapability('divergent') against the real fleet
      ACTION: Assert the returned RoleCapability
      MUST_OBSERVE: RoleCapability.supportsJsonSchema == true | RoleCapability.mode == 'constrained' | RoleCapability.role == 'divergent'
      MUST_NOT_OBSERVE: supportsJsonSchema == false for divergent (false-negative) | mode == 'repair' for divergent

AC-4 GIVEN a probe that may encounter either a json_schema-rejection (backend returns 400/422 for unsupported response_format) or a transport error (timeout/connection refused) WHEN the probe catches an error THEN it distinguishes the two: json_schema-rejection → supportsJsonSchema:false, mode:repair (no error field); transport error → supportsJsonSchema:false, mode:repair WITH error field recording the transport failure (flow_ref T-INFER-010)
  GIVEN: probeJsonSchemaSupport with generateObject error handling
  WHEN:  the generateObject call throws (either json_schema-rejection or transport error)
  THEN:  json_schema-rejection errors (400/422/unsupported response_format) → supportsJsonSchema:false, mode:repair, error undefined; transport errors (timeout/ECONNREFUSED) → supportsJsonSchema:false, mode:repair, error:string
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: probe-capability-implementation · evidence: stdout
    NEGATIVE_CONTROL: would fail if all errors are treated identically (no distinction between json_schema-rejection and transport error), a transport error is reported as supportsJsonSchema:false without an error field (ambiguous — could be a real rejection or a dead endpoint), a json_schema-rejection sets the error field (misleading — the endpoint is reachable, it just doesn't support json_schema)
    CASE start_ref=probe-capability-implementation · actor=fleet
      ACTION: Call probeRoleCapability('convergent') — the backend rejects response_format:json_schema (json_schema-rejection path)
      ACTION: Assert supportsJsonSchema:false, mode:repair, and error is undefined or null (the endpoint is reachable, it just rejects json_schema)
      ACTION: Simulate a transport error (unreachable endpoint via a bad manifestPath or stopped fleet) — assert supportsJsonSchema:false, mode:repair, AND error field is set to the transport error message
      MUST_OBSERVE: json_schema-rejection: supportsJsonSchema==false, mode=='repair', error is undefined/null | transport error: supportsJsonSchema==false, mode=='repair', error contains the transport failure message
      MUST_NOT_OBSERVE: json_schema-rejection sets the error field (misleading) | transport error omits the error field (ambiguous — could be a real rejection) | transport error reports supportsJsonSchema:true

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [probeJsonSchemaSupport uses generateObject (not generateText)] (maps_to_ac AC-1)
- TC-2 [convergent role reports supportsJsonSchema:false, mode:repair against real fleet] (maps_to_ac AC-2)
- TC-3 [divergent role reports supportsJsonSchema:true, mode:constrained against real fleet] (maps_to_ac AC-3)
- TC-4 [Probe distinguishes json_schema-rejection (no error field) from transport error (error field set)] (maps_to_ac AC-4)
- TC-5 [All existing struct-boot-probe tests pass + typecheck + lint clean] (maps_to_ac AC-1)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/inference/probe-capability.ts (MODIFY — replace generateText with generateObject in probeJsonSchemaSupport; add json_schema-rejection vs transport-error distinction)
- tests/integration/service/struct-boot-probe.test.ts (MODIFY — assert generateObject path; assert convergent=repair/divergent=constrained oracle; add error-distinction test)
- .tmp/redhat-fix-g-oracle*/** (NEW evidence)
writeProhibited: services/platform/src/fleet/manifest.ts · services/platform/src/fleet/manifest.schema.ts · services/platform/src/inference/resolve-model.ts · services/platform/src/inference/extract-structured.ts · services/platform/src/mastra.ts · services/platform/src/cli/holo.ts

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/inference/probe-capability.ts 79-127
   - focus: probeJsonSchemaSupport — the function to fix; replace generateText (line 89-106) with generateObject({ schema: PROBE_SCHEMA, model }); distinguish error types in the catch block (line 124-126)
2. services/platform/src/inference/probe-capability.ts 136-174
   - focus: probeRoleCapability — how the boolean flows into RoleCapability.mode; ensure the error field is set only for transport errors, not json_schema-rejections
3. services/platform/src/inference/resolve-model.ts 100-130
   - focus: createFleetChatModel — how the fleet model is created (passes through to generateObject); read-only to understand the model wiring
4. tests/integration/service/struct-boot-probe.test.ts 1-80
   - focus: Existing probe test structure — modify to assert generateObject path and the convergent=repair/divergent=constrained oracle
5. .spec/reviews/red-hat-2026-07-17T04-30-00Z.md 125-131
   - focus: G-ORACLE finding — the gate step 1 oracle mismatch this task fixes

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- rg -c 'generateObject' services/platform/src/inference/probe-capability.ts → >= 1
- rg -c 'generateText' services/platform/src/inference/probe-capability.ts → 0
- PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts → Exit 0
- pnpm tsgo --noEmit → Exit 0
- pnpm biome check . → Exit 0

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: resolveModel(role) → createFleetChatModel(resolved) → generateObject({ schema: PROBE_SCHEMA, model: fleetModel }) → success means supportsJsonSchema:true (constrained); failure with json_schema-rejection (400/422) means supportsJsonSchema:false (repair, no error); failure with transport error means supportsJsonSchema:false (repair, error recorded).
- pattern_source: REDHAT-FIX-H1 pattern (generateObject with response_format:json_schema); probe-capability.ts PROBE_SCHEMA (line 60-63); AI SDK generateObject docs
- anti_pattern: generateText with a JSON instruction prompt — only tests whether the model can emit JSON-like text (ALL LLMs can), NOT whether the backend supports response_format:json_schema constrained decoding. This is the exact bug: all 5 roles reported constrained because the probe couldn't distinguish real support.
- agent_rationale: The probe's job is to detect BACKEND-LEVEL response_format:json_schema support (does the endpoint accept or reject the wire parameter?), not MODEL-LEVEL JSON emission ability (can the model produce parseable JSON text?). generateText tests the latter (trivially true for all LLMs); generateObject with response_format:json_schema tests the former (the real constrained-decoding capability). After this fix, convergent (which doesn't support json_schema) correctly reports repair-loop mode, and divergent (which does) reports constrained mode — resolving the gate step 1 oracle. The error distinction (json_schema-rejection vs transport error) is important because a dead endpoint should not be confused with a json_schema-rejection — both fail-closed to repair, but the error field makes the root cause legible for debugging.
- Depends on: REDHAT-FIX-H1 · Blocks: REDHAT-FIX-H2

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: REDHAT-FIX-H1 · Blocks: REDHAT-FIX-H2

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-G-ORACLE",
  "proposed_by": "mastra-reviewer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "probe-capability-implementation": {
      "description": "The current probe-capability.ts implementation from struct-2 — uses generateText (line 89) with a JSON instruction prompt, so all roles report constrained. This is the start state (RED) for the oracle fix.",
      "seed_method": "public_api",
      "records": [
        "probeJsonSchemaSupport at line 79 uses generateText (line 89)",
        "PROBE_SCHEMA = z.object({ success: z.boolean(), message: z.string() }) at line 60",
        "probeRoleCapability maps the boolean to mode at line 153",
        "all 5 roles currently report supportsJsonSchema:true, mode:constrained (the false oracle)",
        "resolveModel and createFleetChatModel are the router path (unchanged)"
      ]
    },
    "fleet-roles-fixture": {
      "description": "The Fleet Role Manifest roles — divergent (supports json_schema) and convergent (does NOT support json_schema). Used to prove the oracle distinguishes them.",
      "seed_method": "public_api",
      "records": [
        "divergent role maps to an endpoint that accepts response_format:json_schema",
        "convergent role maps to an endpoint that rejects response_format:json_schema (400/422)",
        "the manifest is loaded via getFleetManifest() — probe probes each role's real endpoint"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "primary": true,
      "description": "GIVEN probe-capability.ts at services/platform/src/inference/probe-capability.ts WHEN calling probeJsonSchemaSupport against a resolved fleet role THEN generateObject({ schema: PROBE_SCHEMA, model }) is used — NOT generateText; response_format:json_schema is sent on the wire",
      "given": "probe-capability.ts after replacing generateText with generateObject in probeJsonSchemaSupport",
      "when": "calling probeRoleCapability('divergent') against the real fleet and grepping probe-capability.ts for the call type",
      "then": "generateObject is used (grep count >= 1); generateText is NOT used in the probe path (grep count 0); response_format:json_schema is on the wire",
      "flow_ref": "T-INFER-009",
      "test_tier": "integration",
      "verification_service": "litellm-fleet",
      "tdd_state": "red→green",
      "scenario": {
        "tier": "visible",
        "negative_control": {
          "would_fail_if": [
            "the probe keeps generateText (all roles report constrained — the RED state)",
            "generateObject is stubbed to return a fake valid object",
            "the probe parses text instead of using the schema-validated object path",
            "the fleet is mocked",
            "response_format:json_schema is not actually sent on the wire"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "probe-capability-implementation",
            "action": {
              "actor": "fleet",
              "steps": [
                "Start the real fleet at :4545 (PLATFORM_IT=1)",
                "Run probeRoleCapability('divergent') against the real fleet",
                "Grep probe-capability.ts for generateObject usage",
                "Grep probe-capability.ts for generateText usage in the probe call site"
              ]
            },
            "end_state": {
              "must_observe": [
                "rg count for 'generateObject' in probe-capability.ts >= 1",
                "rg count for 'generateText' in probe-capability.ts == 0 (in the probe call site)",
                "probe returns a RoleCapability with supportsJsonSchema boolean",
                "fleetCount >= 1 (real fleet call made)"
              ],
              "must_not_observe": [
                "rg count for 'generateText' >= 1 in the probe call site",
                "probe uses /health proxy",
                "probe returns a static cached value",
                "fleetCount == 0 (mocked)"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "AC-2",
      "primary": false,
      "description": "GIVEN the convergent fleet role (the endpoint that does NOT support response_format:json_schema constrained decoding) WHEN calling probeRoleCapability('convergent') against the real fleet THEN the probe returns supportsJsonSchema:false, mode:repair because the REAL generateObject call with response_format:json_schema is rejected by the backend",
      "given": "the convergent role in the Fleet Role Manifest, which maps to an endpoint that does not support response_format:json_schema",
      "when": "calling probeRoleCapability('convergent') against the real fleet after the generateObject switch",
      "then": "RoleCapability.supportsJsonSchema == false AND RoleCapability.mode == 'repair'",
      "flow_ref": "T-INFER-009",
      "test_tier": "integration",
      "verification_service": "litellm-fleet",
      "tdd_state": "red→green",
      "scenario": {
        "tier": "visible",
        "negative_control": {
          "would_fail_if": [
            "the probe uses generateText (convergent falsely reports constrained — the RED state / gate oracle mismatch)",
            "the probe hard-codes convergent as constrained",
            "generateObject is stubbed",
            "the fleet is mocked to always accept json_schema"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "probe-capability-implementation",
            "action": {
              "actor": "fleet",
              "steps": [
                "Start the real fleet at :4545 (PLATFORM_IT=1)",
                "Run probeRoleCapability('convergent') against the real fleet",
                "Assert the returned RoleCapability"
              ]
            },
            "end_state": {
              "must_observe": [
                "RoleCapability.supportsJsonSchema == false",
                "RoleCapability.mode == 'repair'",
                "RoleCapability.role == 'convergent'"
              ],
              "must_not_observe": [
                "supportsJsonSchema == true (the false-positive from generateText probe — the RED state)",
                "mode == 'constrained' for convergent"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "AC-3",
      "primary": false,
      "description": "GIVEN the divergent fleet role (the endpoint that DOES support response_format:json_schema constrained decoding) WHEN calling probeRoleCapability('divergent') against the real fleet THEN the probe returns supportsJsonSchema:true, mode:constrained because the REAL generateObject call with response_format:json_schema succeeds",
      "given": "the divergent role in the Fleet Role Manifest, which maps to an endpoint that supports response_format:json_schema",
      "when": "calling probeRoleCapability('divergent') against the real fleet after the generateObject switch",
      "then": "RoleCapability.supportsJsonSchema == true AND RoleCapability.mode == 'constrained'",
      "flow_ref": "T-INFER-009",
      "test_tier": "integration",
      "verification_service": "litellm-fleet",
      "tdd_state": "red→green",
      "scenario": {
        "tier": "visible",
        "negative_control": {
          "would_fail_if": [
            "the probe uses generateText and cannot detect real support",
            "generateObject is stubbed to always fail (divergent falsely reports repair)",
            "the fleet is mocked to always reject json_schema"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "probe-capability-implementation",
            "action": {
              "actor": "fleet",
              "steps": [
                "Start the real fleet at :4545 (PLATFORM_IT=1)",
                "Run probeRoleCapability('divergent') against the real fleet",
                "Assert the returned RoleCapability"
              ]
            },
            "end_state": {
              "must_observe": [
                "RoleCapability.supportsJsonSchema == true",
                "RoleCapability.mode == 'constrained'",
                "RoleCapability.role == 'divergent'"
              ],
              "must_not_observe": [
                "supportsJsonSchema == false for divergent (false-negative)",
                "mode == 'repair' for divergent"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "AC-4",
      "primary": false,
      "description": "GIVEN a probe that may encounter either a json_schema-rejection (backend returns 400/422 for unsupported response_format) or a transport error (timeout/connection refused) WHEN the probe catches an error THEN it distinguishes the two: json_schema-rejection → supportsJsonSchema:false, mode:repair (no error field); transport error → supportsJsonSchema:false, mode:repair WITH error field recording the transport failure",
      "given": "probeJsonSchemaSupport with generateObject error handling",
      "when": "the generateObject call throws (either json_schema-rejection or transport error)",
      "then": "json_schema-rejection errors (400/422/unsupported response_format) → supportsJsonSchema:false, mode:repair, error undefined; transport errors (timeout/ECONNREFUSED) → supportsJsonSchema:false, mode:repair, error:string",
      "flow_ref": "T-INFER-010",
      "test_tier": "integration",
      "verification_service": "litellm-fleet",
      "tdd_state": "red→green",
      "scenario": {
        "tier": "visible",
        "negative_control": {
          "would_fail_if": [
            "all errors are treated identically (no distinction between json_schema-rejection and transport error)",
            "a transport error is reported as supportsJsonSchema:false without an error field (ambiguous — could be a real rejection or a dead endpoint)",
            "a json_schema-rejection sets the error field (misleading — the endpoint is reachable, it just doesn't support json_schema)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "probe-capability-implementation",
            "action": {
              "actor": "fleet",
              "steps": [
                "Call probeRoleCapability('convergent') — the backend rejects response_format:json_schema (json_schema-rejection path)",
                "Assert supportsJsonSchema:false, mode:repair, and error is undefined or null (the endpoint is reachable, it just rejects json_schema)",
                "Simulate a transport error (unreachable endpoint via a bad manifestPath or stopped fleet) — assert supportsJsonSchema:false, mode:repair, AND error field is set to the transport error message"
              ]
            },
            "end_state": {
              "must_observe": [
                "json_schema-rejection: supportsJsonSchema==false, mode=='repair', error is undefined/null",
                "transport error: supportsJsonSchema==false, mode=='repair', error contains the transport failure message"
              ],
              "must_not_observe": [
                "json_schema-rejection sets the error field (misleading)",
                "transport error omits the error field (ambiguous — could be a real rejection)",
                "transport error reports supportsJsonSchema:true"
              ]
            }
          }
        ]
      },
      "type": "acceptance_criterion",
      "maps_to_ac": null
    },
    {
      "id": "TC-1",
      "description": "probeJsonSchemaSupport uses generateObject (not generateText)",
      "verify": "rg -c 'generateObject' services/platform/src/inference/probe-capability.ts → >= 1; rg -c 'generateText' services/platform/src/inference/probe-capability.ts → 0",
      "maps_to_ac": "AC-1",
      "type": "test_criterion"
    },
    {
      "id": "TC-2",
      "description": "convergent role reports supportsJsonSchema:false, mode:repair against real fleet",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts -t 'convergent'",
      "maps_to_ac": "AC-2",
      "type": "test_criterion"
    },
    {
      "id": "TC-3",
      "description": "divergent role reports supportsJsonSchema:true, mode:constrained against real fleet",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts -t 'divergent'",
      "maps_to_ac": "AC-3",
      "type": "test_criterion"
    },
    {
      "id": "TC-4",
      "description": "Probe distinguishes json_schema-rejection (no error field) from transport error (error field set)",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts -t 'error distinction'",
      "maps_to_ac": "AC-4",
      "type": "test_criterion"
    },
    {
      "id": "TC-5",
      "description": "All existing struct-boot-probe tests pass + typecheck + lint clean",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts && pnpm tsgo --noEmit && pnpm biome check .",
      "maps_to_ac": "AC-1",
      "type": "test_criterion"
    }
  ]
}
-->
