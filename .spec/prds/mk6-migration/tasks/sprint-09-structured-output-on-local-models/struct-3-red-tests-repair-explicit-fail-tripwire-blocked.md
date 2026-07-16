# struct-3 — RED tests: malformed→repair→valid, always-malformed→explicit-fail, tripwire→blocked

## What this does

Author the RED test suite (struct-repair-loop, struct-explicit-fail, struct-tripwire-blocked, struct-boot-probe) BEFORE struct-1/struct-2 implementation, proving the empty implementation goes RED with specific failure signatures (ReferenceError for missing fn/class, network assertion for a stub). RED writes tests ONLY.

Provides: four struct-*.test.ts RED tests that prove the never-silently-accept invariant bites; .tmp/struct-3-red-output.txt RED evidence for struct-4's TDD-cycle verification

## Why

- MUST Write the four RED test files BEFORE struct-1/struct-2 implementation — capture failures first
- MUST Each RED test targets a specific failure signature (ReferenceError for missing fn/class; network assertion for a stub)
- MUST Seed via real entrypoints (loadFleetManifest, real fleet fixtures) — never view-injection
- MUST Capture RED evidence to .tmp/struct-3-red-output.txt for the orchestrator + struct-4 review
- NEVER Write implementation code during the RED phase — RED writes tests ONLY
- NEVER Use mocked endpoints or endpointOverride — RED must prove the empty impl fails against the real seam
- NEVER Mark tests skip/todo to fake a RED
- NEVER Accept a GREEN pass without the missing implementation
- STRICTLY Every RED test carries a negative_control naming the stub/mock/bypass it catches
- STRICTLY RED evidence saved for struct-4's TDD-cycle verification
- STRICTLY PLATFORM_IT=1 so the RED runs against the real fleet contract
- Grounded in: UC-INFER-03 (T-INFER-010)

## How to verify

- `ls tests/integration/service/struct-*.test.ts | wc -l` → ≥4 files
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-*.test.ts 2>&1 | tee .tmp/struct-3-red-output.txt; echo $?` → Non-zero exit with FAIL output
- `test -f .tmp/struct-3-red-output.txt && grep -q 'RED state' .tmp/struct-3-red-output.txt` → Exit 0
- `git diff --name-only | grep -v '^tests/' | grep -v '^\.tmp/'` → Empty (no impl files modified)
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

## Scope

Writes: tests/integration/service/struct-repair-loop.test.ts (NEW) — RED: malformed→repair→valid · tests/integration/service/struct-explicit-fail.test.ts (NEW) — RED: always-malformed→ExtractionFailedError, no committed row · tests/integration/service/struct-tripwire-blocked.test.ts (NEW) — RED: tripwire→BlockedError, no tool dispatch · tests/integration/service/struct-boot-probe.test.ts (NEW) — RED: probe uses real generateObject · tests/fixtures/struct-fixtures.ts (NEW) — shared fixture seeds · .tmp/struct-3-red-output.txt (NEW) — RED evidence capture

Prohibited: services/platform/src/** - RED phase writes tests ONLY, no implementation, services/platform/src/inference/resolve-model.ts - Sprint 08 router contract

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: struct-3 — RED tests: malformed→repair→valid, always-malformed→explicit-fail, tripwire→blocked
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (150 min)
AGENT:      red-test-generator
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
Author the RED test suite that proves the empty implementation goes RED with specific failure signatures for repair-loop, explicit-fail, tripwire-blocked, and boot-probe
Four tests/integration/service/struct-*.test.ts exist and fail against the empty implementation with ReferenceError/network-assertion signatures; evidence captured to .tmp/struct-3-red-output.txt

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Write the four RED test files BEFORE struct-1/struct-2 implementation — capture failures first
- MUST Each RED test targets a specific failure signature (ReferenceError for missing fn/class; network assertion for a stub)
- MUST Seed via real entrypoints (loadFleetManifest, real fleet fixtures) — never view-injection
- MUST Capture RED evidence to .tmp/struct-3-red-output.txt for the orchestrator + struct-4 review
- NEVER Write implementation code during the RED phase — RED writes tests ONLY
- NEVER Use mocked endpoints or endpointOverride — RED must prove the empty impl fails against the real seam
- NEVER Mark tests skip/todo to fake a RED
- NEVER Accept a GREEN pass without the missing implementation
- STRICTLY Every RED test carries a negative_control naming the stub/mock/bypass it catches

- STRICTLY RED evidence saved for struct-4's TDD-cycle verification

- STRICTLY PLATFORM_IT=1 so the RED runs against the real fleet contract

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: test fails proving malformed→repair→valid (network assertion: zero fleet traffic from stub) (flow_ref T-INFER-010)
- [ ] AC-2: test fails proving always-malformed→ExtractionFailedError with no committed row (flow_ref T-INFER-010)
- [ ] AC-3: test fails proving tripwire→BlockedError with no tool dispatch (flow_ref T-INFER-010)
- [ ] AC-4: test fails proving probe uses real generateObject (not /health/static) (flow_ref T-INFER-010)
- [ ] `ls tests/integration/service/struct-*.test.ts | wc -l` green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 test fails proving malformed→repair→valid (network assertion: zero fleet traffic from stub) (PRIMARY) (flow_ref T-INFER-010)
  GIVEN: empty implementation stub
  WHEN:  running struct-repair-loop.test.ts
  THEN:  test fails proving malformed→repair→valid (network assertion: zero fleet traffic from stub)
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: empty-implementation-stub · evidence: stdout
    NEGATIVE_CONTROL: would fail if Test stubbed to pass without real implementation, Network assertion mocked so always passes, Test skipped or marked as todo, Test uses fake extraction implementation
    CASE[0] start_ref=empty-implementation-stub · actor=tester
      ACTION: Run tests/integration/service/struct-repair-loop.test.ts → Capture RED test failure output → Verify failure proves missing extractStructured function → Verify network assertion shows zero fleet traffic
      MUST_OBSERVE: Test exit code = 1 (RED state) | stdout contains "ReferenceError: extractStructured is not defined" | stdout contains "network assertion failed: zero fleet traffic" | tests/integration/service/struct-repair-loop.test.ts line count > 0
      MUST_NOT_OBSERVE: Test exits with code 0 (GREEN state) | Test passes without implementation | Test marked as skip or todo

AC-2 test fails proving always-malformed→ExtractionFailedError with no committed row (flow_ref T-INFER-010)
  GIVEN: empty implementation stub
  WHEN:  running struct-explicit-fail.test.ts
  THEN:  test fails proving always-malformed→ExtractionFailedError with no committed row
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: empty-implementation-stub · evidence: stdout
    NEGATIVE_CONTROL: would fail if Test stubbed to pass without real implementation, Test expects generic Error instead of ExtractionFailedError, Test allows DB commit despite failure, Test skipped or marked as todo
    CASE[0] start_ref=empty-implementation-stub · actor=tester
      ACTION: Run tests/integration/service/struct-explicit-fail.test.ts → Capture RED test failure output → Verify failure proves missing ExtractionFailedError class → Verify failure proves no DB commit logic
      MUST_OBSERVE: Test exit code = 1 (RED state) | stdout contains "ReferenceError: ExtractionFailedError is not defined" | stdout contains "expected ExtractionFailedError to be thrown" | tests/integration/service/struct-explicit-fail.test.ts line count > 0
      MUST_NOT_OBSERVE: Test exits with code 0 (GREEN state) | Test passes without implementation | Test marked as skip or todo

AC-3 test fails proving tripwire→BlockedError with no tool dispatch (flow_ref T-INFER-010)
  GIVEN: empty implementation stub
  WHEN:  running struct-tripwire-blocked.test.ts
  THEN:  test fails proving tripwire→BlockedError with no tool dispatch
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: empty-implementation-stub · evidence: stdout
    NEGATIVE_CONTROL: would fail if Test stubbed to pass without real implementation, Test expects generic Error instead of BlockedError, Test allows tool dispatch despite tripwire, Test skipped or marked as todo
    CASE[0] start_ref=empty-implementation-stub · actor=tester
      ACTION: Run tests/integration/service/struct-tripwire-blocked.test.ts → Capture RED test failure output → Verify failure proves missing BlockedError class → Verify failure proves no tripwire handling logic
      MUST_OBSERVE: Test exit code = 1 (RED state) | stdout contains "ReferenceError: BlockedError is not defined" | stdout contains "expected tripwire to trigger BlockedError" | tests/integration/service/struct-tripwire-blocked.test.ts line count > 0
      MUST_NOT_OBSERVE: Test exits with code 0 (GREEN state) | Test passes without implementation | Test marked as skip or todo

AC-4 test fails proving probe uses real generateObject (not /health/static) (flow_ref T-INFER-010)
  GIVEN: empty implementation stub
  WHEN:  running struct-boot-probe.test.ts
  THEN:  test fails proving probe uses real generateObject (not /health/static)
  TEST_TIER: integration · VERIFICATION_SERVICE: litellm-fleet · TDD_STATE: red→green
  SCENARIO — start_ref: empty-implementation-stub · evidence: stdout
    NEGATIVE_CONTROL: would fail if Test stubbed to pass without real implementation, Test allows /health proxy instead of generateObject, Test allows static cached capability data, Test skipped or marked as todo
    CASE[0] start_ref=empty-implementation-stub · actor=tester
      ACTION: Run tests/integration/service/struct-boot-probe.test.ts → Capture RED test failure output → Verify failure proves missing probeCapabilities function → Verify failure proves no real generateObject call
      MUST_OBSERVE: Test exit code = 1 (RED state) | stdout contains "ReferenceError: probeCapabilities is not defined" | stdout contains "expected real generateObject call, not /health proxy" | tests/integration/service/struct-boot-probe.test.ts line count > 0
      MUST_NOT_OBSERVE: Test exits with code 0 (GREEN state) | Test passes without implementation | Test marked as skip or todo

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------
- TC-1 [struct-repair-loop.test.ts exists and fails against empty implementation] (maps_to_ac AC-1)
- TC-2 [struct-explicit-fail.test.ts exists and fails against empty implementation] (maps_to_ac AC-2)
- TC-3 [struct-tripwire-blocked.test.ts exists and fails against empty implementation] (maps_to_ac AC-3)
- TC-4 [struct-boot-probe.test.ts exists and fails against empty implementation] (maps_to_ac AC-4)
- TC-5 [All RED tests write failure evidence to .tmp/struct-3-red-output.txt] (maps_to_ac AC-1)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- tests/integration/service/struct-repair-loop.test.ts (NEW) — RED: malformed→repair→valid
- tests/integration/service/struct-explicit-fail.test.ts (NEW) — RED: always-malformed→ExtractionFailedError, no committed row
- tests/integration/service/struct-tripwire-blocked.test.ts (NEW) — RED: tripwire→BlockedError, no tool dispatch
- tests/integration/service/struct-boot-probe.test.ts (NEW) — RED: probe uses real generateObject
- tests/fixtures/struct-fixtures.ts (NEW) — shared fixture seeds
- .tmp/struct-3-red-output.txt (NEW) — RED evidence capture
writeProhibited: services/platform/src/** - RED phase writes tests ONLY, no implementation, services/platform/src/inference/resolve-model.ts - Sprint 08 router contract

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. tests/integration/service/infer-router-*.test.ts lines 1-50
   - focus: RED test pattern with PLATFORM_IT=1 and network assertions
2. services/platform/src/inference/resolve-model.ts lines 126-184
   - focus: resolveModel pattern that RED tests must call (not stub)
3. brain/docs/RED-FIRST-TEST-GATE.md lines 1-74
   - focus: TDD RED phase methodology + evidence-capture requirements
4. brain/docs/kanban/SCENARIO-CONTRACT-V1.md lines 193-219
   - focus: negative-control validation rules

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED test files saved: `ls tests/integration/service/struct-*.test.ts | wc -l` → ≥4 files
- RED tests fail against empty implementation: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-*.test.ts 2>&1 | tee .tmp/struct-3-red-output.txt; echo $?` → Non-zero exit with FAIL output
- RED evidence captured: `test -f .tmp/struct-3-red-output.txt && grep -q 'RED state' .tmp/struct-3-red-output.txt` → Exit 0
- No implementation code written: `git diff --name-only | grep -v '^tests/' | grep -v '^\.tmp/'` → Empty (no impl files modified)

--------------------------------------------------------------------------------
DESIGN NOTES
--------------------------------------------------------------------------------
- pattern: Write test → run against empty impl → capture failure signature → save RED evidence → verify negative_control populated
- pattern_source: brain/docs/RED-FIRST-TEST-GATE.md + tests/integration/service/infer-router-*.test.ts
- anti_pattern: Writing tests after implementation (GREEN first); mocked endpoints; degenerate-only fixtures; missing negative_control
- agent_rationale: RED-suite authorship — defines what the negative-control proofs must catch before struct-1/2 implementation exists
- composes resolveModel(role) from Sprint 08; owns the CAP-INF-01 extraction segment

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: none · Blocks: struct-4

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "struct-3",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "empty-implementation-stub": {
      "description": "Repo state before struct-1/2 implementation exists",
      "seed_method": "migration_fixture",
      "records": [
        "services/platform/src/inference/extract-structured.ts does not exist",
        "services/platform/src/fleet/probe-capability.ts does not exist",
        "tests/integration/service/struct-*.test.ts do not exist",
        "No extractStructured function defined",
        "No probeCapabilities function defined"
      ]
    },
    "seeded-fleet-structured": {
      "description": "Fleet Role Manifest loaded via loadFleetManifest() with divergent/convergent roles at :4545",
      "seed_method": "public_api",
      "records": [
        "loadFleetManifest() returns manifest with roles divergent, convergent",
        "divergent.litellmModelId = '35B-A3B'",
        "convergent.litellmModelId = '27B'",
        "Fleet reachable at http://localhost:4545"
      ]
    },
    "malformed-once-fixture": {
      "description": "Fleet --fixture malformed-once mode returns malformed JSON once then valid",
      "seed_method": "cli",
      "records": [
        "First generateObject call returns malformed JSON",
        "Second generateObject call returns valid JSON"
      ]
    },
    "always-malformed-fixture": {
      "description": "Fleet --fixture always-malformed mode always returns malformed JSON",
      "seed_method": "cli",
      "records": [
        "Every generateObject call returns malformed JSON"
      ]
    },
    "tripwire-fixture": {
      "description": "Fleet/processor fixture that trips an output tripwire",
      "seed_method": "cli",
      "records": [
        "Processor detects violation and trips tripwire",
        "Tripwire payload contains reason and processorId"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN empty implementation stub WHEN running struct-repair-loop.test.ts THEN test fails proving malformed→repair→valid (network assertion: zero fleet traffic from stub)",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Test stubbed to pass without real implementation",
            "Network assertion mocked so always passes",
            "Test skipped or marked as todo",
            "Test uses fake extraction implementation"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty-implementation-stub",
            "action": {
              "actor": "tester",
              "steps": [
                "Run tests/integration/service/struct-repair-loop.test.ts",
                "Capture RED test failure output",
                "Verify failure proves missing extractStructured function",
                "Verify network assertion shows zero fleet traffic"
              ]
            },
            "end_state": {
              "must_observe": [
                "Test exit code = 1 (RED state)",
                "stdout contains \"ReferenceError: extractStructured is not defined\"",
                "stdout contains \"network assertion failed: zero fleet traffic\"",
                "tests/integration/service/struct-repair-loop.test.ts line count > 0"
              ],
              "must_not_observe": [
                "Test exits with code 0 (GREEN state)",
                "Test passes without implementation",
                "Test marked as skip or todo"
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
      "description": "GIVEN empty implementation stub WHEN running struct-explicit-fail.test.ts THEN test fails proving always-malformed→ExtractionFailedError with no committed row",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-explicit-fail.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Test stubbed to pass without real implementation",
            "Test expects generic Error instead of ExtractionFailedError",
            "Test allows DB commit despite failure",
            "Test skipped or marked as todo"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty-implementation-stub",
            "action": {
              "actor": "tester",
              "steps": [
                "Run tests/integration/service/struct-explicit-fail.test.ts",
                "Capture RED test failure output",
                "Verify failure proves missing ExtractionFailedError class",
                "Verify failure proves no DB commit logic"
              ]
            },
            "end_state": {
              "must_observe": [
                "Test exit code = 1 (RED state)",
                "stdout contains \"ReferenceError: ExtractionFailedError is not defined\"",
                "stdout contains \"expected ExtractionFailedError to be thrown\"",
                "tests/integration/service/struct-explicit-fail.test.ts line count > 0"
              ],
              "must_not_observe": [
                "Test exits with code 0 (GREEN state)",
                "Test passes without implementation",
                "Test marked as skip or todo"
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
      "description": "GIVEN empty implementation stub WHEN running struct-tripwire-blocked.test.ts THEN test fails proving tripwire→BlockedError with no tool dispatch",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Test stubbed to pass without real implementation",
            "Test expects generic Error instead of BlockedError",
            "Test allows tool dispatch despite tripwire",
            "Test skipped or marked as todo"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty-implementation-stub",
            "action": {
              "actor": "tester",
              "steps": [
                "Run tests/integration/service/struct-tripwire-blocked.test.ts",
                "Capture RED test failure output",
                "Verify failure proves missing BlockedError class",
                "Verify failure proves no tripwire handling logic"
              ]
            },
            "end_state": {
              "must_observe": [
                "Test exit code = 1 (RED state)",
                "stdout contains \"ReferenceError: BlockedError is not defined\"",
                "stdout contains \"expected tripwire to trigger BlockedError\"",
                "tests/integration/service/struct-tripwire-blocked.test.ts line count > 0"
              ],
              "must_not_observe": [
                "Test exits with code 0 (GREEN state)",
                "Test passes without implementation",
                "Test marked as skip or todo"
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
      "description": "GIVEN empty implementation stub WHEN running struct-boot-probe.test.ts THEN test fails proving probe uses real generateObject (not /health/static)",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet",
        "negative_control": {
          "would_fail_if": [
            "Test stubbed to pass without real implementation",
            "Test allows /health proxy instead of generateObject",
            "Test allows static cached capability data",
            "Test skipped or marked as todo"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty-implementation-stub",
            "action": {
              "actor": "tester",
              "steps": [
                "Run tests/integration/service/struct-boot-probe.test.ts",
                "Capture RED test failure output",
                "Verify failure proves missing probeCapabilities function",
                "Verify failure proves no real generateObject call"
              ]
            },
            "end_state": {
              "must_observe": [
                "Test exit code = 1 (RED state)",
                "stdout contains \"ReferenceError: probeCapabilities is not defined\"",
                "stdout contains \"expected real generateObject call, not /health proxy\"",
                "tests/integration/service/struct-boot-probe.test.ts line count > 0"
              ],
              "must_not_observe": [
                "Test exits with code 0 (GREEN state)",
                "Test passes without implementation",
                "Test marked as skip or todo"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "struct-repair-loop.test.ts exists and fails against empty implementation",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-repair-loop.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "struct-explicit-fail.test.ts exists and fails against empty implementation",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-explicit-fail.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "struct-tripwire-blocked.test.ts exists and fails against empty implementation",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-tripwire-blocked.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "struct-boot-probe.test.ts exists and fails against empty implementation",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/struct-boot-probe.test.ts",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "All RED tests write failure evidence to .tmp/struct-3-red-output.txt",
      "verify": "cat .tmp/struct-3-red-output.txt | grep -c 'RED state'",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->
</details>
