# REDHAT-FIX-03 — Make `holo mcp:verify-manifest` fail closed on all required contract fields and fixtures

## What this does
The verify-manifest gate rejects any manifest entry missing output_schema, any mutation tool with empty errors or null replay, and any tool with missing fixture files on disk — the gate exits non-zero with a field-specific error message naming the tool and the missing field.

## Why
This task remediates a blocking finding from the independent red-hat review (`.spec/reviews/red-hat-2026-07-14T19-30-00Z-sprint03.md`). The review found that Extend the verify-manifest gate (Finding 3 — HIGH) to validate all required per-tool contract fields: output_schema (all tools), errors array non-empty (mutation tools), replay non-null (mutation tools), and fixture file existence on disk for both success and error fixtures. Also fix the negative control test (Finding 6 — MEDIUM) that removes the manifest entry instead of the fixture file, so the fixtures_missing code path is actually exercised..

## How to verify
Running `holo mcp:verify-manifest` against a manifest with any missing required field (output_schema, errors, replay, or fixture file) exits non-zero with a field-specific error, and the gate passes on the valid complete manifest with zero validation errors.

## Scope
Writes to: services/platform/src/mcp/verify-manifest.ts, tests/integration/mcp-verify-manifest-field-validation.test.ts, tests/integration/mcp-manifest-negative-controls.test.ts, services/platform/tests/fixtures/mcp-manifest/malformed/*.yaml
Prohibited: .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml, holocron-mcp/src/tools/*.ts, holocron-mcp/src/mastra/stdio.ts...

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-03 — Make `holo mcp:verify-manifest` fail closed on all required contract fields and fixtures
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
The verify-manifest gate rejects any manifest entry missing output_schema, any mutation tool with empty errors or null replay, and any tool with missing fixture files on disk — the gate exits non-zero with a field-specific error message naming the tool and the missing field.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST add validation checks to buildVerifyReport in verify-manifest.ts for: output_schema != null (all tools), errors.length > 0 (mutation tools with side_effects), replay != null (mutation tools with side_effects), error fixture file existence on disk
- MUST add a negative control test that removes the _success.json fixture file (while keeping the manifest entry intact) and asserts the fixtures_missing code path at verify-manifest.ts:74-81 fires and the gate exits non-zero
- MUST add a negative control test that removes an _error.json fixture file and asserts the gate fails
- MUST ensure the gate still passes on the valid complete manifest (no false positives)
- MUST provide RED evidence showing the gate currently passes with output_schema: null before the fix
- NEVER let a manifest entry with output_schema: null pass the gate
- NEVER let a mutation tool with errors: [] or replay: null pass the gate
- NEVER let a tool with a missing fixture file pass the gate
- NEVER modify the manifest YAML itself to work around a gate failure — the gate must validate the real manifest
- STRICTLY emit field-specific error messages in the verify report: 'Tool {toolId}: field {fieldName} is {null|empty} but is required for {reason}'
- STRICTLY define mutation tools as entries where side_effects is non-null and non-empty — this determines which fields are required
- STRICTLY run the existing positive tests to ensure no regression on the valid manifest

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): Gate rejects manifest entries with null output_schema
- [x] AC-2: Gate rejects mutation tools with empty errors array
- [x] AC-3: Gate rejects mutation tools with null replay
- [x] AC-4: Negative control: fixture-file-removed triggers fixtures_missing branch
- [x] AC-5: Gate passes on valid complete manifest (no regression)
- [x] AC-6: RED evidence: gate passes with null output_schema before fix
- [ ] MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest-field-validation.test.ts passes (exit 0, all field validation tests pass)
- [ ] MCP_IT=1 pnpm vitest run tests/integration/mcp-manifest-negative-controls.test.ts passes (exit 0, fixture-file-removed test triggers fixtures_missing)
- [ ] MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts passes (exit 0, no regression on valid manifest)
- [ ] pnpm tsgo --noEmit passes (exit 0)
- [ ] pnpm biome check services/platform/src/mcp/verify-manifest.ts passes (exit 0)
- [ ] test -f .spec/evidence/redhat-fix-03-red-evidence.txt passes (file exists showing gate passed with null output_schema pre-fix)
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1 Gate rejects manifest entries with null output_schema [PRIMARY]
  GIVEN: a manifest entry exists with output_schema set to null (or missing)
  WHEN:  holo mcp:verify-manifest is executed
  THEN:  the gate exits non-zero with an error message naming the tool ID and stating output_schema is required but null/missing
  TEST_TIER: integration · VERIFICATION_SERVICE: cli
  SCENARIO (start_ref: manifest_entry_null_output · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if empty, stub, mock, static
    MUST_OBSERVE: exit code != 0; stderr/stdout contains the tool ID with null output_schema; error message mentions 'output_schema' explicitly
    MUST_NOT_OBSERVE: exit code 0 (gate must fail); no error output (must name the field)
  TDD_STATE: none
AC-2 Gate rejects mutation tools with empty errors array
  GIVEN: a mutation tool manifest entry (side_effects non-null) has errors set to an empty array []
  WHEN:  holo mcp:verify-manifest is executed
  THEN:  the gate exits non-zero with an error message naming the tool ID and stating errors array must be non-empty for mutation tools
  TEST_TIER: integration · VERIFICATION_SERVICE: cli
  SCENARIO (start_ref: manifest_entry_empty_errors · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if empty, stub, mock
    MUST_OBSERVE: exit code != 0; error message names the mutation tool; error message mentions 'errors' array must be non-empty
    MUST_NOT_OBSERVE: exit code 0
  TDD_STATE: none
AC-3 Gate rejects mutation tools with null replay
  GIVEN: a mutation tool manifest entry (side_effects non-null) has replay set to null
  WHEN:  holo mcp:verify-manifest is executed
  THEN:  the gate exits non-zero with an error message naming the tool ID and stating replay is required for mutation tools
  TEST_TIER: integration · VERIFICATION_SERVICE: cli
  SCENARIO (start_ref: manifest_entry_null_replay · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if empty, stub, mock
    MUST_OBSERVE: exit code != 0; error message names the mutation tool; error message mentions 'replay' is required for mutation tools
    MUST_NOT_OBSERVE: exit code 0
  TDD_STATE: none
AC-4 Negative control: fixture-file-removed triggers fixtures_missing branch
  GIVEN: a manifest entry exists and is valid, but its {toolId}_success.json fixture file is deleted from disk (the manifest entry itself remains intact)
  WHEN:  holo mcp:verify-manifest is executed
  THEN:  the gate exits non-zero via the fixtures_missing code path (verify-manifest.ts:74-81), with an error stating the fixture file is missing — this is distinct from the manifest-entry-missing path
  TEST_TIER: integration · VERIFICATION_SERVICE: cli
  SCENARIO (start_ref: fixture_file_removed · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if empty, stub, mock, static
    MUST_OBSERVE: test passes asserting fixtures_missing error fires; error message states the fixture FILE is missing (not the manifest entry); the manifest entry for the affected tool still exists in the manifest YAML
    MUST_NOT_OBSERVE: error message about missing manifest entry (that's the other negative control); exit code 0 from verify-manifest
  TDD_STATE: none
AC-5 Gate passes on valid complete manifest (no regression)
  GIVEN: the real production manifest (14-mcp-compatibility-manifest.yaml) with all 44 tools fully specified
  WHEN:  holo mcp:verify-manifest is executed
  THEN:  the gate exits 0 with zero field validation errors — all output_schema, errors, replay, and fixture checks pass
  TEST_TIER: integration · VERIFICATION_SERVICE: cli
  SCENARIO (start_ref: valid_complete_manifest · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if empty, stub
    MUST_OBSERVE: exit code 0; zero field validation errors; all 44 tools reported as valid
    MUST_NOT_OBSERVE: any field validation error; exit code != 0
  TDD_STATE: none
AC-6 RED evidence: gate passes with null output_schema before fix
  GIVEN: the current unfixed verify-manifest.ts that only validates 4 fields
  WHEN:  a manifest entry with output_schema: null is verified
  THEN:  the gate passes (exit 0) — proving the validation gap exists before remediation
  TEST_TIER: integration · VERIFICATION_SERVICE: cli
  SCENARIO (start_ref: manifest_entry_null_output · tier: holdout · evidence: stdout):
    NEGATIVE_CONTROL: would fail if empty
    MUST_OBSERVE: exit code 0 (gate passes despite null output_schema — the gap); evidence saved to .spec/evidence/redhat-fix-03-red-evidence.txt
    MUST_NOT_OBSERVE: exit code != 0 (would mean gap already closed)
  TDD_STATE: none
--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/mcp/verify-manifest.ts
- tests/integration/mcp-verify-manifest-field-validation.test.ts
- tests/integration/mcp-manifest-negative-controls.test.ts
- services/platform/tests/fixtures/mcp-manifest/malformed/*.yaml

writeProhibited:
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml
- holocron-mcp/src/tools/*.ts
- holocron-mcp/src/mastra/stdio.ts
- services/platform/src/mcp/manifest-loader.ts

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. services/platform/src/mcp/verify-manifest.ts [PRIMARY PATTERN]
   - Lines: full (focus 50-82)
   - Focus: The buildVerifyReport function's validation loop — currently checks only entry existence, input_schema, transports, and success fixture file. Must add output_schema, errors, replay, and error fixture checks.
2. tests/integration/mcp-manifest-negative-controls.test.ts
   - Lines: full (focus 62-69)
   - Focus: The negative control test that removes the MANIFEST ENTRY (manifest-missing-store_document.yaml) instead of the fixture file — must add a new test that removes the fixture FILE while keeping the manifest entry
3. .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml
   - Lines: first 200 lines + search for 'side_effects:'
   - Focus: Manifest schema: understand the full per-tool entry structure (output_schema, errors, replay, side_effects, fixtures) to know which fields to validate and how to identify mutation tools
4. services/platform/src/mcp/manifest-loader.ts
   - Lines: full
   - Focus: How manifest entries are parsed into typed objects — needed to access output_schema, errors, replay, side_effects fields in the validation loop
5. tests/integration/mcp-verify-manifest.test.ts
   - Lines: full
   - Focus: Existing positive test that verifies the gate passes on the valid manifest — must not regress when adding new field checks

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: test_field_validation
  Command: MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest-field-validation.test.ts
  Expected: exit 0, all field validation tests pass

Gate 2: test_negative_controls
  Command: MCP_IT=1 pnpm vitest run tests/integration/mcp-manifest-negative-controls.test.ts
  Expected: exit 0, fixture-file-removed test triggers fixtures_missing

Gate 3: test_positive
  Command: MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts
  Expected: exit 0, no regression on valid manifest

Gate 4: typecheck
  Command: pnpm tsgo --noEmit
  Expected: exit 0

Gate 5: lint
  Command: pnpm biome check services/platform/src/mcp/verify-manifest.ts
  Expected: exit 0

Gate 6: red_evidence
  Command: test -f .spec/evidence/redhat-fix-03-red-evidence.txt
  Expected: file exists showing gate passed with null output_schema pre-fix

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

References:
- .spec/reviews/red-hat-2026-07-14T19-30-00Z-sprint03.md — Finding 3 (HIGH), Finding 6 (MEDIUM)

Interaction notes:
- Add validation checks inside the existing buildVerifyReport loop in verify-manifest.ts. For each manifest entry, after the existing 4 checks, add: (5) output_schema != null, (6) if side_effects non-null then errors.length > 0, (7) if side_effects non-null then replay != null, (8) for each error in errors array, check that {toolId}_error.json file exists on disk.
- For the fixture-file-removed negative control (Finding 6): create a test that copies the manifest to a temp dir, removes a specific {toolId}_success.json fixture file (keeping the manifest entry), runs verify-manifest, and asserts the fixtures_missing branch at line 74-81 fires with a non-zero exit.
- Create malformed manifest YAML fixtures in services/platform/tests/fixtures/mcp-manifest/malformed/ for each validation case (null output_schema, empty errors, null replay). These are test-only manifests, not the production manifest.
- Error messages should follow the format: 'Tool {toolId}: {fieldName} is {null|empty} — required for {all tools | mutation tools}' so they are greppable and actionable.

Pattern: fail-closed-validation-gate
Pattern source: Contract validation gates must fail closed: any missing required field or fixture causes rejection, never silent acceptance
Anti-pattern: partial-validation-gate (gate that checks a subset of required fields and passes entries with critical null/empty fields)

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

TC-1: verify-manifest exits non-zero when any manifest entry has output_schema: null
  maps_to_ac: AC-1 · verify: MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest-field-validation.test.ts -t 'output_schema null'

TC-2: verify-manifest exits non-zero when a mutation tool has errors: []
  maps_to_ac: AC-2 · verify: MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest-field-validation.test.ts -t 'empty errors'

TC-3: verify-manifest exits non-zero when a mutation tool has replay: null
  maps_to_ac: AC-3 · verify: MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest-field-validation.test.ts -t 'null replay'

TC-4: The fixture-file-removed negative control test triggers the fixtures_missing code path and asserts non-zero exit
  maps_to_ac: AC-4 · verify: MCP_IT=1 pnpm vitest run tests/integration/mcp-manifest-negative-controls.test.ts -t 'fixture file removed'

TC-5: verify-manifest exits 0 on the valid complete manifest with zero field validation errors
  maps_to_ac: AC-5 · verify: MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts

TC-6: RED evidence artifact exists showing gate passes with null output_schema before fix
  maps_to_ac: AC-6 · verify: test -f .spec/evidence/redhat-fix-03-red-evidence.txt

TC-7: The verify report error messages contain the tool ID and field name for each validation failure
  maps_to_ac: AC-1 · verify: MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest-field-validation.test.ts -t 'error message format'

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable; see brain/docs/kanban/REQUIREMENT-CONTRACT-V1.md)
--------------------------------------------------------------------------------

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-03",
  "proposed_by": "mcp-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "manifest_entry_null_output": {
      "description": "A test-only manifest YAML with one tool entry where output_schema is set to null. All other fields are valid. Used to prove the gate rejects null output_schema.",
      "seed_method": "test fixture file at services/platform/tests/fixtures/mcp-manifest/malformed/null-output-schema.yaml — copy of a valid manifest entry with output_schema overwritten to null",
      "records": [
        {
          "tool_id": "search_documents",
          "output_schema": null,
          "input_schema": "valid",
          "transports": [
            "stdio"
          ],
          "side_effects": null
        }
      ]
    },
    "manifest_entry_empty_errors": {
      "description": "A test-only manifest YAML with one mutation tool entry where errors is set to an empty array []. All other fields are valid.",
      "seed_method": "test fixture file at services/platform/tests/fixtures/mcp-manifest/malformed/empty-errors.yaml — copy of a valid mutation tool entry with errors overwritten to []",
      "records": [
        {
          "tool_id": "add_subscription",
          "output_schema": "valid",
          "input_schema": "valid",
          "transports": [
            "stdio"
          ],
          "side_effects": [
            "writes:subscriptions"
          ],
          "errors": [],
          "replay": "valid"
        }
      ]
    },
    "manifest_entry_null_replay": {
      "description": "A test-only manifest YAML with one mutation tool entry where replay is set to null. All other fields are valid.",
      "seed_method": "test fixture file at services/platform/tests/fixtures/mcp-manifest/malformed/null-replay.yaml — copy of a valid mutation tool entry with replay overwritten to null",
      "records": [
        {
          "tool_id": "add_subscription",
          "output_schema": "valid",
          "input_schema": "valid",
          "transports": [
            "stdio"
          ],
          "side_effects": [
            "writes:subscriptions"
          ],
          "errors": [
            "valid"
          ],
          "replay": null
        }
      ]
    },
    "fixture_file_removed": {
      "description": "Test setup where the manifest entry for store_document exists and is valid, but the store_document_success.json fixture file has been removed from the fixture directory. The test asserts the fixtures_missing code path (verify-manifest.ts:74-81) fires, producing a non-zero exit with a fixture-missing error — distinct from the manifest-entry-missing error.",
      "seed_method": "test setup: copy fixture directory to temp, remove store_document_success.json, run verify-manifest against temp dir",
      "records": [
        {
          "manifest_entry": "store_document exists",
          "fixture_file": "store_document_success.json REMOVED",
          "expected_error": "fixtures_missing (not manifest_missing)"
        }
      ]
    },
    "valid_complete_manifest": {
      "description": "The real production manifest (14-mcp-compatibility-manifest.yaml) with all 44 tool entries fully specified. Used for the positive/no-regression test.",
      "seed_method": "existing file at .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml",
      "records": [
        {
          "tool_count": 44,
          "all_output_schema": "non-null",
          "mutation_tools_errors": "non-empty",
          "mutation_tools_replay": "non-null",
          "all_fixtures": "present"
        }
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "Gate rejects manifest entries with null output_schema with field-specific error",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest-field-validation.test.ts",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "cli",
        "start_ref": "manifest_entry_null_output",
        "negative_control": {
          "would_fail_if": [
            "empty",
            "stub",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "manifest_entry_null_output",
            "action": {
              "type": "run_command",
              "target": "MCP_IT=1 node services/platform/src/cli/holo.ts mcp:verify-manifest --manifest <null-output-manifest>"
            },
            "end_state": {
              "must_observe": [
                "exit code != 0",
                "error names tool ID",
                "error mentions 'output_schema'"
              ],
              "must_not_observe": [
                "exit code 0",
                "no error output"
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
      "description": "Gate rejects mutation tools with empty errors array",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest-field-validation.test.ts",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "cli",
        "start_ref": "manifest_entry_empty_errors",
        "negative_control": {
          "would_fail_if": [
            "empty",
            "stub",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "manifest_entry_empty_errors",
            "action": {
              "type": "run_command",
              "target": "MCP_IT=1 node services/platform/src/cli/holo.ts mcp:verify-manifest --manifest <empty-errors-manifest>"
            },
            "end_state": {
              "must_observe": [
                "exit code != 0",
                "error names mutation tool",
                "error mentions 'errors' must be non-empty"
              ],
              "must_not_observe": [
                "exit code 0"
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
      "description": "Gate rejects mutation tools with null replay",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest-field-validation.test.ts",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "cli",
        "start_ref": "manifest_entry_null_replay",
        "negative_control": {
          "would_fail_if": [
            "empty",
            "stub",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "manifest_entry_null_replay",
            "action": {
              "type": "run_command",
              "target": "MCP_IT=1 node services/platform/src/cli/holo.ts mcp:verify-manifest --manifest <null-replay-manifest>"
            },
            "end_state": {
              "must_observe": [
                "exit code != 0",
                "error names mutation tool",
                "error mentions 'replay' required"
              ],
              "must_not_observe": [
                "exit code 0"
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
      "description": "Fixture-file-removed negative control triggers fixtures_missing branch (not manifest-entry-missing)",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-manifest-negative-controls.test.ts",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "cli",
        "start_ref": "fixture_file_removed",
        "negative_control": {
          "would_fail_if": [
            "empty",
            "stub",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fixture_file_removed",
            "action": {
              "type": "run_test",
              "target": "tests/integration/mcp-manifest-negative-controls.test.ts",
              "env": {
                "MCP_IT": "1"
              }
            },
            "end_state": {
              "must_observe": [
                "fixtures_missing branch fires",
                "error states fixture FILE missing",
                "manifest entry still present"
              ],
              "must_not_observe": [
                "manifest-entry-missing error",
                "exit code 0"
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
      "description": "Gate passes on valid complete manifest with zero errors (no regression)",
      "verify": "MCP_IT=1 node services/platform/src/cli/holo.ts mcp:verify-manifest",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "cli",
        "start_ref": "valid_complete_manifest",
        "negative_control": {
          "would_fail_if": [
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
            "start_ref": "valid_complete_manifest",
            "action": {
              "type": "run_command",
              "target": "MCP_IT=1 node services/platform/src/cli/holo.ts mcp:verify-manifest"
            },
            "end_state": {
              "must_observe": [
                "exit code 0",
                "zero field validation errors",
                "all 44 tools valid"
              ],
              "must_not_observe": [
                "any validation error",
                "exit code != 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "RED evidence: gate passes with null output_schema before fix",
      "verify": "MCP_IT=1 node services/platform/src/cli/holo.ts mcp:verify-manifest --manifest <null-output-manifest> (pre-fix)",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "holdout",
        "verification_service": "cli",
        "start_ref": "manifest_entry_null_output",
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
            "start_ref": "manifest_entry_null_output",
            "action": {
              "type": "run_command_pre_fix",
              "target": "MCP_IT=1 node services/platform/src/cli/holo.ts mcp:verify-manifest --manifest <null-output-manifest>"
            },
            "end_state": {
              "must_observe": [
                "exit code 0 (gap proven)",
                "evidence saved to .spec/evidence/redhat-fix-03-red-evidence.txt"
              ],
              "must_not_observe": [
                "exit code != 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "verify-manifest exits non-zero when output_schema is null",
      "maps_to_ac": "AC-1",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest-field-validation.test.ts -t 'output_schema null'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "verify-manifest exits non-zero when mutation tool has empty errors",
      "maps_to_ac": "AC-2",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest-field-validation.test.ts -t 'empty errors'"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "verify-manifest exits non-zero when mutation tool has null replay",
      "maps_to_ac": "AC-3",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest-field-validation.test.ts -t 'null replay'"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Fixture-file-removed negative control triggers fixtures_missing branch",
      "maps_to_ac": "AC-4",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-manifest-negative-controls.test.ts -t 'fixture file removed'"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "verify-manifest exits 0 on valid complete manifest",
      "maps_to_ac": "AC-5",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "RED evidence artifact exists for REDHAT-FIX-03",
      "maps_to_ac": "AC-6",
      "verify": "test -f .spec/evidence/redhat-fix-03-red-evidence.txt"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Error messages contain tool ID and field name",
      "maps_to_ac": "AC-1",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-verify-manifest-field-validation.test.ts -t 'error message format'"
    }
  ]
}
-->

================================================================================

</details>
