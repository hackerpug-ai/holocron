# struct-1 — Structured-output pipeline: json_schema → constrained decode → Zod re-validate → bounded repair → explicit fail
> Status: ✅ Completed
> Cycle: 1
> Commit: 60d2c1f
> Reviewer: mastra-reviewer (struct-4 APPROVED)
> Completed: 2026-07-17T03:04:40Z

## What this does

Implement extractStructured(schema, input, role): json_schema constrained decode → Zod re-validation → bounded repair loop → typed terminal fail. Composes resolveModel(role) from Sprint 08 — never bypassing the router or its default-deny escape.

Provides: extractStructured(schema, input, role) pipeline; typed terminal outcomes (valid / extraction_failed / blocked); the extraction seam Sprint 17 research and Sprint 22 pipelines compose

## Why

- MUST Use resolveModel(role) to get the fleet endpoint — never bypass the router
- MUST Check the Fleet Role Manifest structuredOutput flag to select constrained vs repair mode
- MUST Validate model output against the Zod schema before return — Zod.parse() is truth
- MUST Implement a bounded repair loop (MAX_REPAIR_ATTEMPTS=3) when validation fails
- MUST Surface typed terminal outcomes: ExtractionFailedError (exhausted repairs) and BlockedError (tripwire)
- MUST Run against the real fleet endpoint at :4545 — no mock models in integration tests
- NEVER Accept model output without Zod validation — silent invalid objects are banned
- NEVER Allow unbounded repair loops — must cap at MAX_REPAIR_ATTEMPTS
- NEVER Return success when validation fails — explicit failure only
- NEVER Bypass resolveModel(role) and call the fleet directly — the router is source of truth
- NEVER Stub generateObject() to return fake valid objects — real model calls required
- STRICTLY Every extraction call uses resolveModel(role) with allowEscape default-deny
- STRICTLY The repair loop calls the same role endpoint — never switch models mid-repair
- STRICTLY A tripwire during extraction surfaces BlockedError — no tool dispatch
- STRICTLY PLATFORM_IT=1 for all integration tests — real fleet, real Postgres, real schema validation
- Grounded in: UC-INFER-03 (T-INFER-008)

## How to verify

- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-pipeline-repair-loop.test.ts tests/integration/service/struct-explicit-fail.test.ts tests/integration/service/struct-tripwire-blocked.test.ts` → Exit 0 with 0 api.anthropic.com requests
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/inference/extract-structured.ts (NEW) — extractStructured pipeline + typed errors · services/platform/src/cli/holo.ts (MODIFY) — extract / extract:status commands

Prohibited: services/platform/src/fleet/manifest.ts - Sprint 01 deliverable, schema locked, services/platform/src/fleet/manifest.schema.ts - Sprint 01 deliverable, schema locked, services/platform/src/inference/resolve-model.ts - Sprint 08 router contract, extend never break, services/platform/src/mastra.ts - Sprint 05 compose root

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: struct-1 — Structured-output pipeline: json_schema → constrained decode → Zod re-validate → bounded repair → explicit fail
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (240 min)
AGENT:      mastra-implementer
PROPOSED-BY: mastra-planner
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
Implement extractStructured(schema, input, role) that produces schema-valid output via json_schema constrained decoding, Zod re-validation, and a bounded repair loop that fails explicitly past the cap
holo extract --schema Foo --input good returns a Zod-valid object; holo extract --fixture malformed-once repairs to valid; holo extract --fixture always-malformed fails explicitly with a typed terminal error; holo extract:status shows extraction_failed with no committed row

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Use resolveModel(role) to get the fleet endpoint — never bypass the router
- MUST Check the Fleet Role Manifest structuredOutput flag to select constrained vs repair mode
- MUST Validate model output against the Zod schema before return — Zod.parse() is truth
- MUST Implement a bounded repair loop (MAX_REPAIR_ATTEMPTS=3) when validation fails
- MUST Surface typed terminal outcomes: ExtractionFailedError (exhausted repairs) and BlockedError (tripwire)
- MUST Run against the real fleet endpoint at :4545 — no mock models in integration tests
- NEVER Accept model output without Zod validation — silent invalid objects are banned
- NEVER Allow unbounded repair loops — must cap at MAX_REPAIR_ATTEMPTS
- NEVER Return success when validation fails — explicit failure only
- NEVER Bypass resolveModel(role) and call the fleet directly — the router is source of truth
- NEVER Stub generateObject() to return fake valid objects — real model calls required
- STRICTLY Every extraction call uses resolveModel(role) with allowEscape default-deny

- STRICTLY The repair loop calls the same role endpoint — never switch models mid-repair

- STRICTLY A tripwire during extraction surfaces BlockedError — no tool dispatch

- STRICTLY PLATFORM_IT=1 for all integration tests — real fleet, real Postgres, real schema validation

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: returns Zod-valid object first try; WHEN calling with malformed-once fixture THEN bounded repair loop (≤3 attempts) repairs to valid; network shows :4545 only, zero cloud (flow_ref T-INFER-008)
- [ ] AC-2: throws ExtractionFailedError after MAX_REPAIR_ATTEMPTS (3); holo extract:status shows extraction_failed; no row committed (flow_ref T-INFER-008)
- [ ] AC-3: throws typed BlockedError; tool not dispatched; no unsafe commit (flow_ref T-INFER-008)
- [ ] AC-4: repair loop bounded ≤ MAX_REPAIR_ATTEMPTS (3); never switches models mid-repair; never reaches api.anthropic.com (flow_ref T-INFER-008)
- [ ] `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-pipeline-repair-loop.test.ts tests/integration/service/struct-explicit-fail.test.ts tests/integration/service/struct-tripwire-blocked.test.ts` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 returns Zod-valid object first try; WHEN calling with malformed-once fixture THEN bounded repair loop (≤3 attempts) repairs to valid; network shows :4545 only, zero cloud (PRIMARY) (flow_ref T-INFER-008)
  GIVEN: good input and fleet at :4545
  WHEN:  calling extractStructured() with Zod schema
  THEN:  returns Zod-valid object first try; WHEN calling with malformed-once fixture THEN bounded repair loop (≤3 attempts) repairs to valid; network shows :4545 only, zero cloud
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: seeded-fleet-structured · evidence: api_response
    NEGATIVE_CONTROL: would fail if extractStructured stubbed to return {name: "John", age: 30, city: "SF"} without calling fleet, repair loop bypassed so malformed result returned as-is, generateObject mocked to skip real fleet call, extractStructured is a no-op stub returning static default without real model call
    CASE[0] start_ref=seeded-fleet-structured · actor=api_client
      ACTION: Call extractStructured('good-input', z.object({name:z.string(),age:z.number(),city:z.string()}), 'divergent') → Verify return value validates against Zod schema → Review network capture for all hosts
      MUST_OBSERVE: Returned object equals {name: "John Doe", age: 30, city: "SF"} | Zod parse succeeds: FooSchema.parse(returned) returns object with age type = number | network-capture row count for host localhost:4545 >= 1 | network-capture row count for host api.anthropic.com = 0
      MUST_NOT_OBSERVE: Returned object has age = "thirty" (string) | Zod parse throws ZodError | network-capture row count for host api.anthropic.com > 0 | repair_loop_count = 0 (no repair attempted) | empty {} returned without calling the model
    CASE[1] start_ref=malformed-once-fixture · actor=api_client
      ACTION: Call extractStructured('malformed-once', z.object({name:z.string(),age:z.number(),city:z.string()}), 'divergent') → Verify repair loop runs ≤3 attempts → Verify final return value validates against Zod schema → Review network capture showing :4545 only
      MUST_OBSERVE: Repair loop runs exactly 2 attempts (1 malformed, 1 valid) | Final returned object equals {name: "John Doe", age: 30, city: "SF"} | network-capture row count for host localhost:4545 = 2 | network-capture row count for host api.anthropic.com = 0
      MUST_NOT_OBSERVE: Repair loop runs > 3 attempts | Final returned object has age = "thirty" (string) | network-capture contains request to api.anthropic.com | blank default object (stub signature) returned

AC-2 throws ExtractionFailedError after MAX_REPAIR_ATTEMPTS (3); holo extract:status shows extraction_failed; no row committed (flow_ref T-INFER-008)
  GIVEN: always-malformed fixture
  WHEN:  calling extractStructured() with Zod schema
  THEN:  throws ExtractionFailedError after MAX_REPAIR_ATTEMPTS (3); holo extract:status shows extraction_failed; no row committed
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: always-malformed-fixture · evidence: stdout
    NEGATIVE_CONTROL: would fail if Repair loop unbounded so runs forever until OOM or timeout, Error silently swallowed so invalid object committed to DB, ExtractionFailedError absent so generic Error thrown, holo extract:status shows success despite failure, extractStructured is a no-op stub returning static default without real model call
    CASE[0] start_ref=always-malformed-fixture · actor=api_client
      ACTION: Call extractStructured('always-malformed', z.object({name:z.string(),age:z.number(),city:z.string()}), 'divergent') → Catch and verify error type → Run holo extract:status and verify status → Verify no row committed to database
      MUST_OBSERVE: Thrown error is ExtractionFailedError with message containing 'MAX_REPAIR_ATTEMPTS' | Repair loop ran exactly 3 attempts | holo extract:status output contains 'extraction_failed' | Database query for committed rows returns 0
      MUST_NOT_OBSERVE: Repair loop ran < 3 attempts | Thrown error is generic Error without ExtractionFailedError type | holo extract:status output contains 'success' | Database query returns ≥1 committed row | no error thrown (empty result)

AC-3 throws typed BlockedError; tool not dispatched; no unsafe commit (flow_ref T-INFER-008)
  GIVEN: tripwire fixture
  WHEN:  calling extractStructured() and tripwire fires mid-extraction
  THEN:  throws typed BlockedError; tool not dispatched; no unsafe commit
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: tripwire-fixture · evidence: stdout
    NEGATIVE_CONTROL: would fail if Tripwire ignored so extraction proceeds with unsafe data, BlockedError absent so generic Error thrown, Tool dispatched despite tripwire, Unsafe data committed to database, extractStructured is a no-op stub returning static default without real model call
    CASE[0] start_ref=tripwire-fixture · actor=api_client
      ACTION: Call extractStructured('tripwire-input', z.object({name:z.string(),age:z.number()}), 'divergent') → Catch and verify error type → Verify tool was not dispatched → Verify no data committed to database
      MUST_OBSERVE: Thrown error is BlockedError with tripwire payload {reason: 'PII detected', retry: false, processorId: 'pii-detector'} | Tool dispatch log shows 0 dispatches | Database query for committed rows returns 0
      MUST_NOT_OBSERVE: Extraction proceeds despite tripwire | Tool dispatch log shows ≥1 dispatch | Database query returns ≥1 committed row | no tripwire handling (empty stub)

AC-4 repair loop bounded ≤ MAX_REPAIR_ATTEMPTS (3); never switches models mid-repair; never reaches api.anthropic.com (flow_ref T-INFER-008)
  GIVEN: malformed-once fixture
  WHEN:  calling extractStructured()
  THEN:  repair loop bounded ≤ MAX_REPAIR_ATTEMPTS (3); never switches models mid-repair; never reaches api.anthropic.com
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: malformed-once-fixture · evidence: api_response
    NEGATIVE_CONTROL: would fail if Repair loop unbounded so runs >3 attempts, Model switches mid-repair to fallback provider, api.anthropic.com requests made during repair, Repair loop exits on first failure without retry, extractStructured is a no-op stub returning static default without real model call
    CASE[0] start_ref=malformed-once-fixture · actor=api_client
      ACTION: Call extractStructured('malformed-once', z.object({name:z.string(),age:z.number()}), 'divergent') with MAX_REPAIR_ATTEMPTS=3 → Monitor repair loop iterations → Verify same role endpoint used for all attempts → Review network capture for all hosts
      MUST_OBSERVE: Repair loop iteration count = 2 | All requests use litellm model id "35B-A3B" | network-capture row count for host api.anthropic.com = 0 | returned.age === 30 (number type)
      MUST_NOT_OBSERVE: Repair loop runs > 3 attempts | Requests use different model ids mid-repair | network-capture contains request to api.anthropic.com | FooSchema.parse throws ZodError | returned.age === "thirty" (string type) | placeholder value (stub signature) returned

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [extractStructured returns Zod-valid object on good input first try] (maps_to_ac AC-1)
- TC-2 [extractStructured runs bounded repair loop ≤ MAX_REPAIR_ATTEMPTS on malformed input] (maps_to_ac AC-1)
- TC-3 [Network capture shows zero api.anthropic.com requests during extraction] (maps_to_ac AC-1)
- TC-4 [extractStructured throws ExtractionFailedError after MAX_REPAIR_ATTEMPTS on always-malformed] (maps_to_ac AC-2)
- TC-5 [holo extract:status shows extraction_failed after always-malformed failure] (maps_to_ac AC-2)
- TC-6 [extractStructured throws BlockedError when tripwire fires mid-extraction] (maps_to_ac AC-3)
- TC-7 [Tool not dispatched when tripwire fires during extraction] (maps_to_ac AC-3)
- TC-8 [Repair loop never switches models mid-repair] (maps_to_ac AC-4)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/inference/extract-structured.ts (NEW) — extractStructured pipeline + typed errors
- services/platform/src/cli/holo.ts (MODIFY) — extract / extract:status commands
writeProhibited: services/platform/src/fleet/manifest.ts - Sprint 01 deliverable, schema locked, services/platform/src/fleet/manifest.schema.ts - Sprint 01 deliverable, schema locked, services/platform/src/inference/resolve-model.ts - Sprint 08 router contract, extend never break, services/platform/src/mastra.ts - Sprint 05 compose root

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/inference/resolve-model.ts lines 126-184
   - focus: resolveModel(role,{allowEscape}) router pattern + health probe + cloud-refusal — the seam extractStructured composes
2. services/platform/src/fleet/manifest.schema.ts lines 1-91
   - focus: FleetRoleSchema Zod shape — healthProbe + structuredOutput/capability surface the probe reads
3. services/platform/src/cli/holo.ts lines 1-100
   - focus: holo command pattern — where extract / extract:status register

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Integration tests pass: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-pipeline-repair-loop.test.ts tests/integration/service/struct-explicit-fail.test.ts tests/integration/service/struct-tripwire-blocked.test.ts` → Exit 0 with 0 api.anthropic.com requests
- Typecheck passes: `pnpm tsgo --noEmit` → Exit 0
- Lint passes: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: resolveModel(role) → generateObject({schema, responseFormat: json_schema}) → Zod.parse() → on fail, bounded repair (same role) → ExtractionFailedError | BlockedError
- pattern_source: services/platform/src/inference/resolve-model.ts:126-184
- anti_pattern: z.any() schemas; unbounded retry; bypassing resolveModel; silent success on Zod failure
- agent_rationale: Core pipeline implementation requires Mastra/AI-SDK v6 expertise with Zod validation, LiteLLM structured output, and bounded repair-loop patterns against the real fleet
- composes resolveModel(role) from Sprint 08; owns the CAP-INF-01 extraction segment

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: none · Blocks: struct-3, struct-4

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "struct-1",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-fleet-structured": {
      "description": "Fleet Role Manifest loaded via loadFleetManifest() with divergent/convergent roles present at :4545",
      "seed_method": "public_api",
      "records": [
        "loadFleetManifest() returns manifest with roles divergent, convergent, judge, embed, rerank",
        "divergent.litellmModelId = '35B-A3B' with supportsJsonSchema = true",
        "convergent.litellmModelId = '27B' with supportsJsonSchema = false",
        "All roles have healthProbe.path, method, timeoutMs, expectStatus",
        "Fleet reachable at http://localhost:4545"
      ]
    },
    "good-input": {
      "description": "Valid extraction input for Zod schema",
      "seed_method": "cli",
      "records": [
        "Input text = 'Extract name: John Doe, age: 30, city: SF'",
        "Target schema = z.object({name: z.string(), age: z.number(), city: z.string()})"
      ]
    },
    "malformed-once-fixture": {
      "description": "Fleet --fixture malformed-once mode returns malformed JSON once then valid",
      "seed_method": "cli",
      "records": [
        "First generateObject call returns '{name: John, age: thirty, city: SF}' (malformed age)",
        "Second generateObject call returns '{name: John, age: 30, city: SF}' (valid)"
      ]
    },
    "always-malformed-fixture": {
      "description": "Fleet --fixture always-malformed mode always returns malformed JSON",
      "seed_method": "cli",
      "records": [
        "Every generateObject call returns '{name: John, age: thirty, city: SF}' (malformed age)"
      ]
    },
    "tripwire-fixture": {
      "description": "Fleet/processor fixture that trips an output tripwire during extraction",
      "seed_method": "cli",
      "records": [
        "Processor detects PII in output and trips tripwire",
        "Tripwire payload = {reason: 'PII detected', retry: false, processorId: 'pii-detector'}"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN good input and fleet at :4545 WHEN calling extractStructured() with Zod schema THEN returns Zod-valid object first try; WHEN calling with malformed-once fixture THEN bounded repair loop (≤3 attempts) repairs to valid; network shows :4545 only, zero cloud",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "extractStructured stubbed to return {name: \"John\", age: 30, city: \"SF\"} without calling fleet",
            "repair loop bypassed so malformed result returned as-is",
            "generateObject mocked to skip real fleet call",
            "extractStructured is a no-op stub returning static default without real model call"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-fleet-structured",
            "action": {
              "actor": "api_client",
              "steps": [
                "Call extractStructured('good-input', z.object({name:z.string(),age:z.number(),city:z.string()}), 'divergent')",
                "Verify return value validates against Zod schema",
                "Review network capture for all hosts"
              ]
            },
            "end_state": {
              "must_observe": [
                "Returned object equals {name: \"John Doe\", age: 30, city: \"SF\"}",
                "Zod parse succeeds: FooSchema.parse(returned) returns object with age type = number",
                "network-capture row count for host localhost:4545 >= 1",
                "network-capture row count for host api.anthropic.com = 0"
              ],
              "must_not_observe": [
                "Returned object has age = \"thirty\" (string)",
                "Zod parse throws ZodError",
                "network-capture row count for host api.anthropic.com > 0",
                "repair_loop_count = 0 (no repair attempted)",
                "empty {} returned without calling the model"
              ]
            }
          },
          {
            "start_ref": "malformed-once-fixture",
            "action": {
              "actor": "api_client",
              "steps": [
                "Call extractStructured('malformed-once', z.object({name:z.string(),age:z.number(),city:z.string()}), 'divergent')",
                "Verify repair loop runs ≤3 attempts",
                "Verify final return value validates against Zod schema",
                "Review network capture showing :4545 only"
              ]
            },
            "end_state": {
              "must_observe": [
                "Repair loop runs exactly 2 attempts (1 malformed, 1 valid)",
                "Final returned object equals {name: \"John Doe\", age: 30, city: \"SF\"}",
                "network-capture row count for host localhost:4545 = 2",
                "network-capture row count for host api.anthropic.com = 0"
              ],
              "must_not_observe": [
                "Repair loop runs > 3 attempts",
                "Final returned object has age = \"thirty\" (string)",
                "network-capture contains request to api.anthropic.com",
                "blank default object (stub signature) returned"
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
      "description": "GIVEN always-malformed fixture WHEN calling extractStructured() with Zod schema THEN throws ExtractionFailedError after MAX_REPAIR_ATTEMPTS (3); holo extract:status shows extraction_failed; no row committed",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-explicit-fail.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Repair loop unbounded so runs forever until OOM or timeout",
            "Error silently swallowed so invalid object committed to DB",
            "ExtractionFailedError absent so generic Error thrown",
            "holo extract:status shows success despite failure",
            "extractStructured is a no-op stub returning static default without real model call"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "always-malformed-fixture",
            "action": {
              "actor": "api_client",
              "steps": [
                "Call extractStructured('always-malformed', z.object({name:z.string(),age:z.number(),city:z.string()}), 'divergent')",
                "Catch and verify error type",
                "Run holo extract:status and verify status",
                "Verify no row committed to database"
              ]
            },
            "end_state": {
              "must_observe": [
                "Thrown error is ExtractionFailedError with message containing 'MAX_REPAIR_ATTEMPTS'",
                "Repair loop ran exactly 3 attempts",
                "holo extract:status output contains 'extraction_failed'",
                "Database query for committed rows returns 0"
              ],
              "must_not_observe": [
                "Repair loop ran < 3 attempts",
                "Thrown error is generic Error without ExtractionFailedError type",
                "holo extract:status output contains 'success'",
                "Database query returns ≥1 committed row",
                "no error thrown (empty result)"
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
      "description": "GIVEN tripwire fixture WHEN calling extractStructured() and tripwire fires mid-extraction THEN throws typed BlockedError; tool not dispatched; no unsafe commit",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Tripwire ignored so extraction proceeds with unsafe data",
            "BlockedError absent so generic Error thrown",
            "Tool dispatched despite tripwire",
            "Unsafe data committed to database",
            "extractStructured is a no-op stub returning static default without real model call"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "tripwire-fixture",
            "action": {
              "actor": "api_client",
              "steps": [
                "Call extractStructured('tripwire-input', z.object({name:z.string(),age:z.number()}), 'divergent')",
                "Catch and verify error type",
                "Verify tool was not dispatched",
                "Verify no data committed to database"
              ]
            },
            "end_state": {
              "must_observe": [
                "Thrown error is BlockedError with tripwire payload {reason: 'PII detected', retry: false, processorId: 'pii-detector'}",
                "Tool dispatch log shows 0 dispatches",
                "Database query for committed rows returns 0"
              ],
              "must_not_observe": [
                "Extraction proceeds despite tripwire",
                "Tool dispatch log shows ≥1 dispatch",
                "Database query returns ≥1 committed row",
                "no tripwire handling (empty stub)"
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
      "description": "GIVEN malformed-once fixture WHEN calling extractStructured() THEN repair loop bounded ≤ MAX_REPAIR_ATTEMPTS (3); never switches models mid-repair; never reaches api.anthropic.com",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Repair loop unbounded so runs >3 attempts",
            "Model switches mid-repair to fallback provider",
            "api.anthropic.com requests made during repair",
            "Repair loop exits on first failure without retry",
            "extractStructured is a no-op stub returning static default without real model call"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "malformed-once-fixture",
            "action": {
              "actor": "api_client",
              "steps": [
                "Call extractStructured('malformed-once', z.object({name:z.string(),age:z.number()}), 'divergent') with MAX_REPAIR_ATTEMPTS=3",
                "Monitor repair loop iterations",
                "Verify same role endpoint used for all attempts",
                "Review network capture for all hosts"
              ]
            },
            "end_state": {
              "must_observe": [
                "Repair loop iteration count = 2",
                "All requests use litellm model id \"35B-A3B\"",
                "network-capture row count for host api.anthropic.com = 0",
                "returned.age === 30 (number type)"
              ],
              "must_not_observe": [
                "Repair loop runs > 3 attempts",
                "Requests use different model ids mid-repair",
                "network-capture contains request to api.anthropic.com",
                "FooSchema.parse throws ZodError",
                "returned.age === \"thirty\" (string type)",
                "placeholder value (stub signature) returned"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "extractStructured returns Zod-valid object on good input first try",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "extractStructured runs bounded repair loop ≤ MAX_REPAIR_ATTEMPTS on malformed input",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Network capture shows zero api.anthropic.com requests during extraction",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "extractStructured throws ExtractionFailedError after MAX_REPAIR_ATTEMPTS on always-malformed",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-explicit-fail.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "holo extract:status shows extraction_failed after always-malformed failure",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-explicit-fail.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "extractStructured throws BlockedError when tripwire fires mid-extraction",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Tool not dispatched when tripwire fires during extraction",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "Repair loop never switches models mid-repair",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
</details>
