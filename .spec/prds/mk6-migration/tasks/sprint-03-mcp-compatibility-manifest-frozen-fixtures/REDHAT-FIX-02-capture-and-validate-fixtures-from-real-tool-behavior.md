# REDHAT-FIX-02 — Capture and validate fixtures from real tool behavior, including mutation error coverage

## What this does
All 21 mutation tools have both success and error fixture files, all mutation tools with replay blocks have replay fixtures, and no fixture contains unmarked placeholder data — fixtures are either captured from real tool execution or explicitly annotated as representative examples.

## Why
This task remediates a blocking finding from the independent red-hat review (`.spec/reviews/red-hat-2026-07-14T19-30-00Z-sprint03.md`). The review found that Expand the fixture suite from its current 49 files (44 success, 3 error, 2 replay) to full mutation-tool coverage: 44 success + 21 error + N replay fixtures. Remediate synthetic placeholder data by either capturing from real tool execution or annotating as representative examples. Fixes Findings 2 (synthetic data), 4 (error coverage 3/21), and 5 (replay coverage 2/21)..

## How to verify
Every mutation tool in the manifest has matching _success.json, _error.json, and _replay.json fixture files, no fixture contains unmarked placeholder identifiers, and the total fixture count is at minimum 44 + 21 + N (where N = mutation tools with replay blocks).

## Scope
Writes to: services/platform/tests/fixtures/mcp-manifest/*_error.json, services/platform/tests/fixtures/mcp-manifest/*_replay.json, services/platform/tests/fixtures/mcp-manifest/*_success.json, tests/integration/mcp-fixture-coverage.test.ts, tests/integration/mcp-fixture-placeholder-audit.test.ts, tests/integration/mcp-fixture-schema-validation.test.ts
Prohibited: services/platform/src/mcp/verify-manifest.ts, .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml, holocron-mcp/src/tools/*.ts...

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-02 — Capture and validate fixtures from real tool behavior, including mutation error coverage
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (180 min)
AGENT:      implementer=red-test-generator | reviewer=mcp-reviewer
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
All 21 mutation tools have both success and error fixture files, all mutation tools with replay blocks have replay fixtures, and no fixture contains unmarked placeholder data — fixtures are either captured from real tool execution or explicitly annotated as representative examples.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST create error fixture files (_error.json) for all 21 mutation tools identified in the manifest (currently only 3 exist — 18 must be added)
- MUST create replay fixture files (_replay.json) for all mutation tools that declare replay.idempotency_key in the manifest (currently only 2 exist)
- MUST either capture fixture data from real tool execution against the live Convex backend OR explicitly annotate each fixture with a top-level "representative_example": true field if the data is synthetic
- MUST replace obvious placeholder data (e.g., "documentId": "kg_doc_store_001", "url": "https://amazon.com/dp/B0XXXXX") with either real captured values or clearly-marked representative values
- MUST provide RED evidence showing the current fixture suite has only 3 error fixtures and 2 replay fixtures before expansion
- NEVER ship a fixture file containing placeholder identifiers (e.g., kg_doc_store_001, B0XXXXX, fake-id-123) without a "representative_example": true annotation
- NEVER create error fixtures that do not correspond to real error modes the tool can actually produce (e.g., validation error, not-found, permission denied)
- NEVER skip a mutation tool when creating error fixtures — all 21 must be covered
- STRICTLY enumerate mutation tools by scanning the manifest for entries where side_effects is non-null/non-empty — this defines the 21-tool set
- STRICTLY validate each new error fixture's structure matches the MCP error response schema (code, message, details)
- STRICTLY ensure replay fixtures contain first_call_result, second_call_result, and idempotency_key fields consistent with the manifest's replay contract

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): Error fixtures exist for all 21 mutation tools
- [ ] AC-2: Replay fixtures exist for all mutation tools with replay blocks
- [ ] AC-3: No fixture contains unmarked placeholder data
- [ ] AC-4: Error fixtures match real MCP error response schema
- [ ] AC-5: RED evidence: fixture suite has insufficient coverage before expansion
- [ ] MCP_IT=1 pnpm vitest run tests/integration/mcp-fixture-coverage.test.ts passes (exit 0, all 21 mutation tools have error fixtures)
- [ ] ls services/platform/tests/fixtures/mcp-manifest/*_error.json | wc -l passes (>= 21)
- [ ] ls services/platform/tests/fixtures/mcp-manifest/*_replay.json | wc -l passes (>= number of manifest entries with replay blocks)
- [ ] pnpm vitest run tests/integration/mcp-fixture-placeholder-audit.test.ts passes (exit 0, no unmarked placeholders)
- [ ] pnpm vitest run tests/integration/mcp-fixture-schema-validation.test.ts passes (exit 0, all error fixtures valid)
- [ ] pnpm tsgo --noEmit passes (exit 0)
- [ ] pnpm biome check services/platform/tests/fixtures/ passes (exit 0)
- [ ] test -f .spec/evidence/redhat-fix-02-red-evidence.txt passes (file exists with pre-fix fixture count (3 error, 2 replay))
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1 Error fixtures exist for all 21 mutation tools [PRIMARY]
  GIVEN: the manifest is loaded and mutation tools are enumerated (entries with non-null side_effects)
  WHEN:  the fixture directory is scanned for _error.json files
  THEN:  exactly one _error.json fixture file exists for each of the 21 mutation tools, each containing a valid MCP error response (code, message, details) corresponding to a real error mode that tool can produce
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem
  SCENARIO (start_ref: mutation_tool_inventory · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if empty, static, stub
    MUST_OBSERVE: count >= 21; each mutation tool ID from the manifest has a corresponding {toolId}_error.json file
    MUST_NOT_OBSERVE: count == 3 (the pre-fix count); any mutation tool ID missing from the error fixture set
  TDD_STATE: none
AC-2 Replay fixtures exist for all mutation tools with replay blocks
  GIVEN: the manifest is loaded and mutation tools with replay.idempotency_key are enumerated
  WHEN:  the fixture directory is scanned for _replay.json files
  THEN:  exactly one _replay.json fixture file exists for each mutation tool that declares replay.idempotency_key in the manifest, each containing first_call_result, second_call_result, and idempotency_key fields
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem
  SCENARIO (start_ref: mutation_tool_inventory · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if empty, static
    MUST_OBSERVE: count >= number of manifest entries with replay.idempotency_key (currently 2, target: all mutation tools with replay blocks)
    MUST_NOT_OBSERVE: count == 2 (the pre-fix count)
  TDD_STATE: none
AC-3 No fixture contains unmarked placeholder data
  GIVEN: all fixture files in services/platform/tests/fixtures/mcp-manifest/ are inspected
  WHEN:  a search is performed for known placeholder patterns (kg_doc_store_, B0XXXXX, fake-id, placeholder, dummy, test-123, example.com in non-URL-context fields)
  THEN:  any fixture containing placeholder data has a top-level "representative_example": true field; fixtures without that annotation contain no placeholder patterns
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem
  SCENARIO (start_ref: mutation_tool_inventory · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if static, empty, stub
    MUST_OBSERVE: test passes — no fixture with placeholder data lacks the representative_example annotation; any fixture with representative_example: true is explicitly listed in test output
    MUST_NOT_OBSERVE: fixture containing 'kg_doc_store_001' without representative_example: true; fixture containing 'B0XXXXX' without representative_example: true
  TDD_STATE: none
AC-4 Error fixtures match real MCP error response schema
  GIVEN: each new _error.json fixture file is parsed
  WHEN:  the fixture's JSON structure is validated against the MCP error response contract (must contain 'code' (string), 'message' (string), and optionally 'details' (object))
  THEN:  every error fixture passes schema validation with a non-degenerate error code (e.g., 'VALIDATION_ERROR', 'NOT_FOUND', 'PERMISSION_DENIED') and a non-empty message
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem
  SCENARIO (start_ref: mutation_tool_inventory · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if empty, static
    MUST_OBSERVE: all 21+ error fixtures pass schema validation; each fixture has code (non-empty string), message (non-empty string); error codes are real MCP error types, not generic 'ERROR'
    MUST_NOT_OBSERVE: fixture with empty code or message; fixture with code: 'ERROR' (too generic)
  TDD_STATE: none
AC-5 RED evidence: fixture suite has insufficient coverage before expansion
  GIVEN: the current fixture directory (pre-expansion) is inspected
  WHEN:  error and replay fixture counts are measured
  THEN:  RED evidence shows error fixture count == 3 and replay fixture count == 2, proving the gap exists before remediation
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem
  SCENARIO (start_ref: mutation_tool_inventory · tier: holdout · evidence: stdout):
    NEGATIVE_CONTROL: would fail if empty
    MUST_OBSERVE: output == 3 (proving insufficient error coverage before fix); evidence artifact saved to .spec/evidence/redhat-fix-02-red-evidence.txt
    MUST_NOT_OBSERVE: output >= 21 (would indicate gap already closed)
  TDD_STATE: none
--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/tests/fixtures/mcp-manifest/*_error.json
- services/platform/tests/fixtures/mcp-manifest/*_replay.json
- services/platform/tests/fixtures/mcp-manifest/*_success.json
- tests/integration/mcp-fixture-coverage.test.ts
- tests/integration/mcp-fixture-placeholder-audit.test.ts
- tests/integration/mcp-fixture-schema-validation.test.ts

writeProhibited:
- services/platform/src/mcp/verify-manifest.ts
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml
- holocron-mcp/src/tools/*.ts
- holocron-mcp/src/mastra/stdio.ts

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml [PRIMARY PATTERN]
   - Lines: full (1845 lines)
   - Focus: Enumerate all 44 tool entries; identify the 21 with non-null side_effects (mutation tools); check each for replay.idempotency_key to determine replay fixture requirements
2. services/platform/tests/fixtures/mcp-manifest/
   - Lines: ls -la
   - Focus: Current fixture inventory: 44 success, 3 error, 2 replay files. Identify the 18 mutation tools missing error fixtures and the mutation tools missing replay fixtures.
3. holocron-mcp/src/tools/
   - Lines: all tool files
   - Focus: Real tool implementations to understand actual error modes (validation errors, not-found, permission denied) for authoring accurate error fixtures
4. services/platform/src/mcp/verify-manifest.ts
   - Lines: 50-82
   - Focus: The validation loop that checks fixture file existence — new fixtures must be discoverable by this gate
5. services/platform/tests/fixtures/mcp-manifest/add_subscription_error.json
   - Lines: full
   - Focus: One of the 3 existing error fixtures — use as structural template for the 18 new error fixtures

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: test
  Command: MCP_IT=1 pnpm vitest run tests/integration/mcp-fixture-coverage.test.ts
  Expected: exit 0, all 21 mutation tools have error fixtures

Gate 2: fixture_count
  Command: ls services/platform/tests/fixtures/mcp-manifest/*_error.json | wc -l
  Expected: >= 21

Gate 3: replay_count
  Command: ls services/platform/tests/fixtures/mcp-manifest/*_replay.json | wc -l
  Expected: >= number of manifest entries with replay blocks

Gate 4: placeholder_audit
  Command: pnpm vitest run tests/integration/mcp-fixture-placeholder-audit.test.ts
  Expected: exit 0, no unmarked placeholders

Gate 5: schema_validation
  Command: pnpm vitest run tests/integration/mcp-fixture-schema-validation.test.ts
  Expected: exit 0, all error fixtures valid

Gate 6: typecheck
  Command: pnpm tsgo --noEmit
  Expected: exit 0

Gate 7: lint
  Command: pnpm biome check services/platform/tests/fixtures/
  Expected: exit 0

Gate 8: red_evidence
  Command: test -f .spec/evidence/redhat-fix-02-red-evidence.txt
  Expected: file exists with pre-fix fixture count (3 error, 2 replay)

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

References:
- .spec/reviews/red-hat-2026-07-14T19-30-00Z-sprint03.md — Findings 2 (HIGH), 4 (MEDIUM), 5 (MEDIUM)

Interaction notes:
- Enumerate mutation tools by scanning the manifest YAML for entries where `side_effects` is non-null. Cross-reference with holocron-mcp/src/tools/*.ts to understand each tool's real error modes.
- For each of the 18 missing error fixtures, model the error on a real failure mode: validation error (invalid input), not-found (missing resource), or permission denied (unauthorized). Use the existing add_subscription_error.json as structural template.
- For replay fixtures: each must contain first_call_result (full success response), second_call_result (same success response, proving de-dup), and idempotency_key (matching manifest's replay.idempotency_key).
- For placeholder remediation: either replace with real captured values from a dev Convex deployment, or add "representative_example": true to the fixture's top level and ensure the placeholder is clearly synthetic (e.g., use 'repr_' prefix instead of 'kg_').
- REDHAT-FIX-03 will add gate validation for these new fields — coordinate so error fixture existence is checked.

Pattern: fixture-driven-contract-testing
Pattern source: MCP compatibility manifest pattern: frozen fixtures serve as the migration contract baseline
Anti-pattern: synthetic-placeholder-fixture (fixtures with obvious fake data presented as real captured behavior)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: None
Blocks: REDHAT-FIX-03

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

TC-1: The count of _error.json files in services/platform/tests/fixtures/mcp-manifest/ is >= 21
  maps_to_ac: AC-1 · verify: ls services/platform/tests/fixtures/mcp-manifest/*_error.json | wc -l

TC-2: Every mutation tool ID from the manifest has a corresponding {toolId}_error.json fixture file
  maps_to_ac: AC-1 · verify: pnpm vitest run tests/integration/mcp-fixture-coverage.test.ts

TC-3: The count of _replay.json files is >= the number of manifest entries with replay.idempotency_key
  maps_to_ac: AC-2 · verify: ls services/platform/tests/fixtures/mcp-manifest/*_replay.json | wc -l

TC-4: No fixture file with placeholder data lacks the representative_example: true annotation
  maps_to_ac: AC-3 · verify: pnpm vitest run tests/integration/mcp-fixture-placeholder-audit.test.ts

TC-5: All error fixtures pass MCP error response schema validation with non-degenerate error codes
  maps_to_ac: AC-4 · verify: pnpm vitest run tests/integration/mcp-fixture-schema-validation.test.ts

TC-6: RED evidence artifact exists showing error fixture count == 3 before expansion
  maps_to_ac: AC-5 · verify: test -f .spec/evidence/redhat-fix-02-red-evidence.txt

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable; see brain/docs/kanban/REQUIREMENT-CONTRACT-V1.md)
--------------------------------------------------------------------------------

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-02",
  "proposed_by": "mcp-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "mutation_tool_inventory": {
      "description": "The set of 21 mutation tools enumerated from the manifest by scanning for entries with non-null side_effects. Each mutation tool requires _success.json, _error.json, and (if replay block exists) _replay.json fixture files. Currently only 3 error and 2 replay fixtures exist.",
      "seed_method": "manifest-scan: parse 14-mcp-compatibility-manifest.yaml, filter entries where side_effects != null",
      "records": [
        {
          "tool_id": "add_subscription",
          "has_error": true,
          "has_replay": true,
          "side_effects": [
            "writes:subscriptions"
          ]
        },
        {
          "tool_id": "store_document",
          "has_error": true,
          "has_replay": true,
          "side_effects": [
            "writes:documents"
          ]
        },
        {
          "tool_id": "remove_subscription",
          "has_error": true,
          "has_replay": false,
          "side_effects": [
            "writes:subscriptions"
          ]
        },
        {
          "tool_id": "...19 more mutation tools",
          "has_error": "varies",
          "has_replay": "varies",
          "side_effects": [
            "various"
          ]
        }
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "Error fixtures exist for all 21 mutation tools with valid MCP error response schema",
      "verify": "ls services/platform/tests/fixtures/mcp-manifest/*_error.json | wc -l",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "filesystem",
        "start_ref": "mutation_tool_inventory",
        "negative_control": {
          "would_fail_if": [
            "empty",
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
            "start_ref": "mutation_tool_inventory",
            "action": {
              "type": "run_command",
              "target": "ls services/platform/tests/fixtures/mcp-manifest/*_error.json | wc -l"
            },
            "end_state": {
              "must_observe": [
                "count >= 21",
                "each mutation tool ID has a corresponding error fixture"
              ],
              "must_not_observe": [
                "count == 3",
                "any mutation tool missing from error fixture set"
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
      "description": "Replay fixtures exist for all mutation tools with replay blocks in the manifest",
      "verify": "ls services/platform/tests/fixtures/mcp-manifest/*_replay.json | wc -l",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "filesystem",
        "start_ref": "mutation_tool_inventory",
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
            "start_ref": "mutation_tool_inventory",
            "action": {
              "type": "run_command",
              "target": "ls services/platform/tests/fixtures/mcp-manifest/*_replay.json | wc -l"
            },
            "end_state": {
              "must_observe": [
                "count >= N mutation tools with replay blocks"
              ],
              "must_not_observe": [
                "count == 2"
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
      "description": "No fixture contains unmarked placeholder data",
      "verify": "pnpm vitest run tests/integration/mcp-fixture-placeholder-audit.test.ts",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "filesystem",
        "start_ref": "mutation_tool_inventory",
        "negative_control": {
          "would_fail_if": [
            "static",
            "empty",
            "stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mutation_tool_inventory",
            "action": {
              "type": "run_test",
              "target": "tests/integration/mcp-fixture-placeholder-audit.test.ts"
            },
            "end_state": {
              "must_observe": [
                "test passes",
                "representative_example fixtures explicitly listed"
              ],
              "must_not_observe": [
                "unmarked kg_doc_store_001",
                "unmarked B0XXXXX"
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
      "description": "Error fixtures match real MCP error response schema with non-degenerate error codes",
      "verify": "pnpm vitest run tests/integration/mcp-fixture-schema-validation.test.ts",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "filesystem",
        "start_ref": "mutation_tool_inventory",
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
            "start_ref": "mutation_tool_inventory",
            "action": {
              "type": "run_test",
              "target": "tests/integration/mcp-fixture-schema-validation.test.ts"
            },
            "end_state": {
              "must_observe": [
                "all 21+ error fixtures pass validation",
                "non-empty code and message",
                "real error types not generic 'ERROR'"
              ],
              "must_not_observe": [
                "empty code or message",
                "code: 'ERROR'"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "RED evidence: fixture suite has only 3 error and 2 replay fixtures before expansion",
      "verify": "ls services/platform/tests/fixtures/mcp-manifest/*_error.json | wc -l (pre-fix)",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "holdout",
        "verification_service": "filesystem",
        "start_ref": "mutation_tool_inventory",
        "negative_control": {
          "would_fail_if": [
            "empty"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mutation_tool_inventory",
            "action": {
              "type": "run_command_pre_fix",
              "target": "ls services/platform/tests/fixtures/mcp-manifest/*_error.json | wc -l"
            },
            "end_state": {
              "must_observe": [
                "output == 3",
                "evidence saved to .spec/evidence/redhat-fix-02-red-evidence.txt"
              ],
              "must_not_observe": [
                "output >= 21"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Error fixture count >= 21",
      "maps_to_ac": "AC-1",
      "verify": "ls services/platform/tests/fixtures/mcp-manifest/*_error.json | wc -l"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Every mutation tool ID has a corresponding error fixture",
      "maps_to_ac": "AC-1",
      "verify": "pnpm vitest run tests/integration/mcp-fixture-coverage.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Replay fixture count >= N mutation tools with replay blocks",
      "maps_to_ac": "AC-2",
      "verify": "ls services/platform/tests/fixtures/mcp-manifest/*_replay.json | wc -l"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "No fixture with placeholder data lacks representative_example annotation",
      "maps_to_ac": "AC-3",
      "verify": "pnpm vitest run tests/integration/mcp-fixture-placeholder-audit.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "All error fixtures pass MCP error schema validation",
      "maps_to_ac": "AC-4",
      "verify": "pnpm vitest run tests/integration/mcp-fixture-schema-validation.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "RED evidence artifact exists for REDHAT-FIX-02",
      "maps_to_ac": "AC-5",
      "verify": "test -f .spec/evidence/redhat-fix-02-red-evidence.txt"
    }
  ]
}
-->

================================================================================

</details>
