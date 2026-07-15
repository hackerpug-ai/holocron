# REDHAT-FIX-01 — Replace tautological replay fixture assertions with behavioral, real-tool replay proof

## What this does
The replay-contract integration test invokes a real MCP mutation tool (or cross-validates the fixture's idempotency_key against both the manifest's replay.idempotency_key and the tool's Zod schema dedup logic), proving real de-duplication rather than asserting two identical values from the same hand-authored JSON file.

## Why
This task remediates a blocking finding from the independent red-hat review (`.spec/reviews/red-hat-2026-07-14T19-30-00Z-sprint03.md`). The review found that Eliminate the test-theatre replay-contract test (Finding 1 — CRITICAL) by replacing the tautological static-file equality assertion with a behavioral test that either invokes a real MCP mutation tool twice with the same idempotency_key and verifies stored-result return, or cross-validates the replay fixture's idempotency_key against both the manifest's replay.idempotency_key field and the tool's actual Zod schema dedup logic..

## How to verify
Running MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts passes, and the test code contains zero instances of asserting equality between two values read from the same JSON file; the test instead proves real tool-level or schema-level idempotency behavior.

## Scope
Writes to: tests/integration/mcp-replay-contract.test.ts, services/platform/tests/fixtures/mcp-manifest/add_subscription_replay.json, services/platform/tests/fixtures/mcp-manifest/store_document_replay.json
Prohibited: services/platform/src/mcp/verify-manifest.ts, .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml, holocron-mcp/src/tools/*.ts...

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-01 — Replace tautological replay fixture assertions with behavioral, real-tool replay proof
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (120 min)
AGENT:      implementer=mcp-implementer | reviewer=mcp-reviewer
PROPOSED-BY: mcp-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes
CAPABILITY: CAP-CUT-01
SPRINT:     [Sprint 3 — MCP Compatibility Manifest and Frozen Fixtures](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      MCP_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
The replay-contract integration test invokes a real MCP mutation tool (or cross-validates the fixture's idempotency_key against both the manifest's replay.idempotency_key and the tool's Zod schema dedup logic), proving real de-duplication rather than asserting two identical values from the same hand-authored JSON file.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST either (a) invoke the real MCP mutation tool through the Mastra stdio server and verify the same idempotency_key produces the stored result on the second call, or (b) cross-validate the replay fixture's idempotency_key against the manifest entry's replay.idempotency_key field AND the real tool's Zod schema dedup field
- MUST remove or fully replace the tautological assertion at tests/integration/mcp-replay-contract.test.ts:26-58 that reads first_call_result and second_call_result from the same static JSON file
- MUST provide RED evidence showing the replacement test fails against the current tautological code before the fix is applied
- NEVER assert equality between two values sourced from the same hand-authored JSON file as the sole replay proof
- NEVER mock or stub the Convex backend, Mastra server, or MCP protocol layer in the replacement test — the test must exercise a real service boundary
- NEVER leave the old tautological test file in place alongside the replacement — it must be replaced in full
- STRICTLY verify that the idempotency mechanism under test is the real tool's behavior (de-dup by key), not fixture file internal consistency
- STRICTLY capture the test's stdout/stderr as evidence showing real tool invocation or real schema validation occurred

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): Replay test invokes real tool or cross-validates against manifest + schema
- [x] AC-2: Real de-duplication is proven, not file-internal consistency
- [x] AC-3: Tautological assertion pattern fully eliminated
- [x] AC-4: RED evidence: test fails against pre-fix tautological code
- [ ] MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts passes (exit 0, no tautological assertions)
- [ ] pnpm tsgo --noEmit passes (exit 0)
- [ ] pnpm biome check tests/integration/mcp-replay-contract.test.ts passes (exit 0)
- [ ] test -f .spec/evidence/redhat-fix-01-red-evidence.txt passes (file exists with failing pre-fix test output)
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1 Replay test invokes real tool or cross-validates against manifest + schema [PRIMARY]
  GIVEN: the replay-contract integration test suite is executed with MCP_IT=1
  WHEN:  the test runs the replay verification for a mutation tool (e.g., add_subscription)
  THEN:  the test either (a) invokes the real MCP tool through the Mastra stdio server with an idempotency_key and verifies the second call returns the stored result from the first call, or (b) loads the tool's real Zod schema, extracts the idempotency/dedup field, loads the manifest entry's replay.idempotency_key, loads the fixture's idempotency_key, and asserts all three resolve to the same dedup contract — NOT two values from the same fixture file
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-stdio-mcp-server
  SCENARIO (start_ref: replay_cross_validate_setup · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if static, stub, mock, empty
    MUST_OBSERVE: test passes with exit code 0; stdout shows real tool invocation or real Zod schema cross-validation (not static file read); assertion references at least 2 distinct sources: fixture idempotency_key AND manifest replay.idempotency_key AND/OR Zod schema dedup field
    MUST_NOT_OBSERVE: assertion comparing first_call_result.x === second_call_result.x where both come from the same JSON file; zero network/process invocations (test must touch a real service or load a real schema module)
  TDD_STATE: none
AC-2 Real de-duplication is proven, not file-internal consistency
  GIVEN: the replacement replay-contract test is executed
  WHEN:  the test verifies idempotency for a mutation tool
  THEN:  the test demonstrates that the idempotency_key mechanism produces identical results across two distinct calls or validates the key against two independent sources (manifest + schema), proving behavioral de-duplication rather than the fixture author having typed the same string twice
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-stdio-mcp-server
  SCENARIO (start_ref: replay_cross_validate_setup · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if static, mock, stub
    MUST_OBSERVE: test source imports from at least 2 of: fixture JSON file, manifest YAML, tool Zod schema module, or Mastra server client; dedup verification compares values from independent sources or two real tool calls
    MUST_NOT_OBSERVE: dedup verification compares two values from the same import/require of a single JSON file
  TDD_STATE: none
AC-3 Tautological assertion pattern fully eliminated
  GIVEN: the full test codebase is searched for the tautological replay pattern
  WHEN:  a search is performed for any assertion comparing first_call_result and second_call_result values sourced from the same JSON file
  THEN:  zero instances of the tautological pattern are found in any test file
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem
  SCENARIO (start_ref: replay_cross_validate_setup · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if static, stub
    MUST_OBSERVE: exit code 1 (no matches found) or explicit CLEAN output
    MUST_NOT_OBSERVE: any line matching first_call_result.*===.*second_call_result in tests/
  TDD_STATE: none
AC-4 RED evidence: test fails against pre-fix tautological code
  GIVEN: the current tautological mcp-replay-contract.test.ts is in place (before fix)
  WHEN:  the replacement test is run against the unfixed codebase
  THEN:  the test fails, proving it is not a no-op and exercises real behavior
  TEST_TIER: integration · VERIFICATION_SERVICE: mastra-stdio-mcp-server
  SCENARIO (start_ref: replay_cross_validate_setup · tier: holdout · evidence: stdout):
    NEGATIVE_CONTROL: would fail if empty, static
    MUST_OBSERVE: test fails with non-zero exit code before the fix is applied; failure reason is behavioral (real tool/schema mismatch), not assertion of identical file values
    MUST_NOT_OBSERVE: test passes trivially on first run without any code change (would indicate no-op test)
  TDD_STATE: none
--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- tests/integration/mcp-replay-contract.test.ts
- services/platform/tests/fixtures/mcp-manifest/add_subscription_replay.json
- services/platform/tests/fixtures/mcp-manifest/store_document_replay.json

writeProhibited:
- services/platform/src/mcp/verify-manifest.ts
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml
- holocron-mcp/src/tools/*.ts
- holocron-mcp/src/mastra/stdio.ts

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. tests/integration/mcp-replay-contract.test.ts [PRIMARY PATTERN]
   - Lines: 1-80
   - Focus: The tautological test at lines 26-58 that reads add_subscription_replay.json and asserts first_call_result.subscriptionId === second_call_result.subscriptionId — both from the same file
2. services/platform/tests/fixtures/mcp-manifest/add_subscription_replay.json
   - Lines: full
   - Focus: The static replay fixture containing hand-authored first_call_result and second_call_result with the same subscriptionId — no tool invocation
3. .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml
   - Lines: search for 'replay:'
   - Focus: Manifest entries with replay.idempotency_key fields that the cross-validation approach must check against
4. holocron-mcp/src/mastra/stdio.ts
   - Lines: search for 'add_subscription'
   - Focus: The real tool registration and its createTool({ id: 'add_subscription' }) call — the entry point for real tool invocation
5. services/platform/src/mcp/manifest-loader.ts
   - Lines: full
   - Focus: How the manifest YAML is loaded and parsed — needed for cross-validation approach to access replay.idempotency_key

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: test
  Command: MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts
  Expected: exit 0, no tautological assertions

Gate 2: typecheck
  Command: pnpm tsgo --noEmit
  Expected: exit 0

Gate 3: lint
  Command: pnpm biome check tests/integration/mcp-replay-contract.test.ts
  Expected: exit 0

Gate 4: red_evidence
  Command: test -f .spec/evidence/redhat-fix-01-red-evidence.txt
  Expected: file exists with failing pre-fix test output

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

References:
- .spec/reviews/red-hat-2026-07-14T19-30-00Z-sprint03.md — Finding 1 (CRITICAL)

Interaction notes:
- Preferred approach (b): cross-validate fixture idempotency_key against manifest replay.idempotency_key AND the tool's real Zod schema — avoids needing a running Convex backend in CI while still proving the contract is internally consistent across 3 independent sources.
- If approach (a) is feasible in CI: invoke the Mastra stdio server, call add_subscription with a known idempotency_key, call again, assert same result. This is the gold standard but requires Convex backend availability.
- The cross-validation test should import the Zod schema from the tool's source module (e.g., holocron-mcp/src/tools/subscriptions.ts), parse it, and verify the dedup field exists and matches the fixture/manifest.

Pattern: cross-source-contract-validation
Pattern source: Integration testing best practice: verify contract consistency across independent artifacts rather than self-referential file reads
Anti-pattern: tautological-self-referential-assertion (asserting two values from the same file are equal — proves the author typed consistently, not that the system works)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: None
Blocks: None

--------------------------------------------------------------------------------
REVIEW (for mcp-reviewer)
--------------------------------------------------------------------------------

Must pass:
- Each AC asserts a concrete failure signature with real-tool invocation or cross-source validation
- No tautological assertions, no mocks of the mcp module / manifest loader / filesystem
- RED evidence present in TDD_STATE history
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

TC-1: The replay-contract test file does not contain any assertion comparing first_call_result and second_call_result values where both are sourced from the same JSON file import
  maps_to_ac: AC-1 · verify: rg -n 'first_call_result.*===.*second_call_result' tests/integration/mcp-replay-contract.test.ts

TC-2: The replay-contract test imports or references at least two independent sources for idempotency verification (fixture JSON, manifest YAML, Zod schema module, or live Mastra server client)
  maps_to_ac: AC-1 · verify: rg -n 'import' tests/integration/mcp-replay-contract.test.ts

TC-3: MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts exits 0 after the fix
  maps_to_ac: AC-1 · verify: MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts

TC-4: RED evidence exists showing the replacement test fails against the pre-fix tautological code
  maps_to_ac: AC-4 · verify: ls .spec/evidence/redhat-fix-01-red-evidence.*

TC-5: No file in tests/ contains the pattern first_call_result.*===.*second_call_result
  maps_to_ac: AC-3 · verify: rg -n 'first_call_result.*===.*second_call_result' tests/ || true

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable; see brain/docs/kanban/REQUIREMENT-CONTRACT-V1.md)
--------------------------------------------------------------------------------

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-01",
  "proposed_by": "mcp-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "replay_cross_validate_setup": {
      "description": "Test environment with the manifest YAML, replay fixture JSON, and tool Zod schema available for cross-validation. The real add_subscription tool's Zod schema defines an idempotency_key field. The manifest entry for add_subscription has replay.idempotency_key. The fixture file add_subscription_replay.json has an idempotency_key. The test must prove these three are consistent.",
      "seed_method": "filesystem — manifest at .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml, fixtures at services/platform/tests/fixtures/mcp-manifest/, Zod schema importable from holocron-mcp/src/tools/subscriptions.ts",
      "records": [
        {
          "source": "manifest",
          "field": "add_subscription.replay.idempotency_key",
          "expected_value": "string matching tool schema"
        },
        {
          "source": "fixture",
          "field": "add_subscription_replay.json.idempotency_key",
          "expected_value": "same string"
        },
        {
          "source": "zod_schema",
          "field": "add_subscription input schema idempotency_key field",
          "expected_value": "field exists with dedup semantics"
        }
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "Replay test invokes real MCP tool or cross-validates fixture idempotency_key against manifest replay.idempotency_key AND tool Zod schema dedup field — not two values from the same JSON file",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "mastra-stdio-mcp-server",
        "start_ref": "replay_cross_validate_setup",
        "negative_control": {
          "would_fail_if": [
            "static",
            "stub",
            "mock",
            "empty"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "replay_cross_validate_setup",
            "action": {
              "type": "run_test",
              "target": "tests/integration/mcp-replay-contract.test.ts",
              "env": {
                "MCP_IT": "1"
              }
            },
            "end_state": {
              "must_observe": [
                "exit code 0",
                "stdout shows real tool invocation or schema cross-validation",
                "assertion references >= 2 distinct sources"
              ],
              "must_not_observe": [
                "assertion comparing two values from same JSON file",
                "zero service invocations"
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
      "description": "Real de-duplication is proven via independent sources or two real tool calls, not file-internal consistency",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "mastra-stdio-mcp-server",
        "start_ref": "replay_cross_validate_setup",
        "negative_control": {
          "would_fail_if": [
            "static",
            "mock",
            "stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "replay_cross_validate_setup",
            "action": {
              "type": "inspect_test_source",
              "target": "tests/integration/mcp-replay-contract.test.ts"
            },
            "end_state": {
              "must_observe": [
                "test imports from >= 2 of: fixture JSON, manifest YAML, Zod schema, Mastra client",
                "dedup compares independent sources"
              ],
              "must_not_observe": [
                "dedup compares two values from same single JSON import"
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
      "description": "Tautological assertion pattern fully eliminated from all test files",
      "verify": "rg -n 'first_call_result.*===.*second_call_result' tests/ || echo 'CLEAN'",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "filesystem",
        "start_ref": "replay_cross_validate_setup",
        "negative_control": {
          "would_fail_if": [
            "static",
            "stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "replay_cross_validate_setup",
            "action": {
              "type": "run_command",
              "target": "rg -n 'first_call_result.*===.*second_call_result' tests/",
              "expected_exit": 1
            },
            "end_state": {
              "must_observe": [
                "exit code 1 or CLEAN output"
              ],
              "must_not_observe": [
                "any matching line in tests/"
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
      "description": "RED evidence: replacement test fails against pre-fix tautological code",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts (pre-fix)",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "holdout",
        "verification_service": "mastra-stdio-mcp-server",
        "start_ref": "replay_cross_validate_setup",
        "negative_control": {
          "would_fail_if": [
            "empty",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "replay_cross_validate_setup",
            "action": {
              "type": "run_test_pre_fix",
              "target": "tests/integration/mcp-replay-contract.test.ts",
              "env": {
                "MCP_IT": "1"
              }
            },
            "end_state": {
              "must_observe": [
                "test fails with non-zero exit",
                "failure is behavioral mismatch"
              ],
              "must_not_observe": [
                "test passes without code change"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "No assertion in replay-contract test compares first_call_result === second_call_result from same file",
      "maps_to_ac": "AC-1",
      "verify": "rg -n 'first_call_result.*===.*second_call_result' tests/integration/mcp-replay-contract.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Replay-contract test imports >= 2 independent sources for idempotency verification",
      "maps_to_ac": "AC-1",
      "verify": "rg -n 'import' tests/integration/mcp-replay-contract.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts exits 0",
      "maps_to_ac": "AC-1",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "RED evidence artifact exists for REDHAT-FIX-01",
      "maps_to_ac": "AC-4",
      "verify": "ls .spec/evidence/redhat-fix-01-red-evidence.*"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "No file in tests/ matches the tautological assertion pattern",
      "maps_to_ac": "AC-3",
      "verify": "rg -n 'first_call_result.*===.*second_call_result' tests/ || true"
    }
  ]
}
-->

================================================================================

</details>
