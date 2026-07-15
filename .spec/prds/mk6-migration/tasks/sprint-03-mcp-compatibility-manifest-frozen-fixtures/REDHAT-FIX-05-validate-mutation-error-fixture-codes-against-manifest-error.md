# REDHAT-FIX-05 — Validate mutation error fixture codes against the corresponding manifest error catalog

## What this does
Adds a parameterized cross-check test that validates every mutation tool's `{tool_id}_error.json` fixture `code` field against the manifest's `errors[]` catalog for that tool, and fixes the proven `shop_products` VALIDATION_ERROR mismatch.

## Why
This task remediates a HIGH-severity finding from the independent post-remediation red-hat review (`.spec/reviews/red-hat-2026-07-14T19-07-45Z-sprint03-postremediation.md`, NEW-2). The review found that `shop_products_error.json` has `"code": "VALIDATION_ERROR"` but the manifest declares `shop_products` errors as `INTERNAL_SERVER_ERROR` and `TIMEOUT` only. No test in any of the 7 test files cross-checks fixture error codes against the manifest error catalog. This mismatch survives all 306 tests. Any error fixture could contain any arbitrary error code and pass the entire suite.

## How to verify
Running `MCP_IT=1 pnpm vitest run tests/integration/mcp-fixture-coverage.test.ts` passes all tests including the new error-code-catalog validation for all 21 mutation tools. Before fixing `shop_products_error.json`, the new test fails naming `shop_products` and showing `VALIDATION_ERROR` is not in `[INTERNAL_SERVER_ERROR, TIMEOUT]`.

## Scope
Writes to: tests/integration/mcp-fixture-coverage.test.ts, services/platform/tests/fixtures/mcp-manifest/shop_products_error.json
Prohibited: .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml, holocron-mcp/src/config/validation.ts, services/platform/src/mcp/manifest-loader.ts, tests/integration/mcp-replay-contract.test.ts

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-05 — Cross-check every mutation error fixture code against the manifest error catalog and fix the shop_products mismatch
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (90 min)
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
Every mutation tool's {tool_id}_error.json fixture has a code field that exists in the corresponding manifest errors[] array, with the proven shop_products VALIDATION_ERROR mismatch fixed.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST add a new describe block to tests/integration/mcp-fixture-coverage.test.ts that loads the manifest via loadManifest(MANIFEST_PATH), enumerates mutation tools via .tools.filter(t => t.side_effects != null), loads each {tool_id}_error.json fixture, and asserts fixture.code is present in manifest tool.errors[].map(e => e.code)
- MUST use the existing loadManifest and ManifestTool from services/platform/src/mcp/manifest-loader.ts — never re-parse the YAML manually
- MUST use the existing FIXTURES_DIR constant from the test file — never hardcode a different path
- MUST fix the proven mismatch in shop_products_error.json: change code from VALIDATION_ERROR to INTERNAL_SERVER_ERROR (a code that IS in the manifest catalog)
- MUST update the shop_products_error.json message and details to be semantically consistent with INTERNAL_SERVER_ERROR
- NEVER modify the manifest YAML — it is WRITE-PROHIBITED. The fix direction is always fixture→manifest, never manifest→fixture
- NEVER skip or soften the assertion for shop_products specifically — all 21 tools must pass the same parameterized check
- STRICTLY report any ADDITIONAL mismatches discovered during implementation (beyond shop_products) — the implementer must fix them in the fixture, not suppress them

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): Parameterized test validates all 21 mutation tool error fixture codes against manifest catalogs
- [x] AC-2: shop_products_error.json fixture fixed (code → INTERNAL_SERVER_ERROR with consistent message)
- [x] AC-3: RED evidence — test catches the shop_products mismatch before the fix
- [ ] MCP_IT=1 pnpm vitest run tests/integration/mcp-fixture-coverage.test.ts passes (exit 0, all tests including 21 new error-code-catalog cases)
- [ ] pnpm tsgo --noEmit passes (exit 0)
- [ ] pnpm biome check . passes (exit 0)
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1 Parameterized test validates all 21 mutation tool error fixture codes against manifest catalogs [PRIMARY]
  GIVEN: the mcp-fixture-coverage test suite with the new error-code-catalog describe block
  WHEN:  the test suite is executed with MCP_IT=1
  THEN:  every mutation tool (all 21 from side_effects != null filter) has a passing assertion that its {tool_id}_error.json fixture code exists in the manifest's errors[] catalog
  TEST_TIER: integration · VERIFICATION_SERVICE: vitest
  SCENARIO (start_ref: error_fixture_catalog_check · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if static, stub, mock, empty
    MUST_OBSERVE: test report shows 21 new parameterized cases under 'error code catalog validation'; each case title includes tool ID; all 21 pass; existing 5 fixture-coverage tests still pass
    MUST_NOT_OBSERVE: any '.skip' in titles; fewer than 21 error-code-catalog cases; a failure mentioning VALIDATION_ERROR for shop_products
  TDD_STATE: none
AC-2 shop_products_error.json fixture is fixed
  GIVEN: the shop_products error fixture must conform to its manifest error catalog
  WHEN:  the fixture code is changed from VALIDATION_ERROR to INTERNAL_SERVER_ERROR
  THEN:  the fixture code field is INTERNAL_SERVER_ERROR, the message is semantically consistent (references internal failure, not validation constraint), and the catalog check passes
  TEST_TIER: integration · VERIFICATION_SERVICE: vitest
  SCENARIO (start_ref: shop_products_error_fixed · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if static, stub, empty
    MUST_OBSERVE: shop_products case passes with INTERNAL_SERVER_ERROR found in [INTERNAL_SERVER_ERROR, TIMEOUT]; fixture file contains "code": "INTERNAL_SERVER_ERROR"; message references internal/search failure
    MUST_NOT_OBSERVE: fixture still containing VALIDATION_ERROR; message still saying 'Query must not be empty'; any git diff showing changes to manifest YAML
  TDD_STATE: none
AC-3 RED evidence — test catches the mismatch before fix
  GIVEN: the new error-code-catalog test is implemented but shop_products_error.json is not yet fixed
  WHEN:  the test is run before the fixture fix
  THEN:  the test fails for shop_products with a clear message naming the tool and showing VALIDATION_ERROR is not in [INTERNAL_SERVER_ERROR, TIMEOUT]
  TEST_TIER: integration · VERIFICATION_SERVICE: vitest
  SCENARIO (start_ref: red_evidence_before_fix · tier: holdout · evidence: stdout):
    NEGATIVE_CONTROL: would fail if static, stub
    MUST_OBSERVE: test output shows FAILED for shop_products error-code-catalog case; failure message names 'shop_products' and shows 'VALIDATION_ERROR' not in ['INTERNAL_SERVER_ERROR', 'TIMEOUT']; other 20 tools' cases run (pass or fail)
    MUST_NOT_OBSERVE: all tests passing (would indicate no-op test); generic 'test failed' without naming tool or showing code arrays
  TDD_STATE: none
--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- tests/integration/mcp-fixture-coverage.test.ts
- services/platform/tests/fixtures/mcp-manifest/shop_products_error.json

writeProhibited:
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml
- holocron-mcp/src/config/validation.ts
- services/platform/src/mcp/manifest-loader.ts
- tests/integration/mcp-replay-contract.test.ts

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. tests/integration/mcp-fixture-coverage.test.ts [PRIMARY PATTERN]
   - Lines: full
   - Focus: Existing structure: imports loadManifest/ManifestTool from manifest-loader (line 13), MANIFEST_PATH and FIXTURES_DIR constants (lines 16-20), manifest loaded at module scope (line 22), mutationTools filtered from manifest (lines 25-27). The new describe block goes after line 73 and reuses mutationTools.
2. services/platform/tests/fixtures/mcp-manifest/shop_products_error.json
   - Lines: full
   - Focus: Current fixture: code is VALIDATION_ERROR (line 3), message is 'Query must not be empty', details.field is 'query'. Must be changed to INTERNAL_SERVER_ERROR with consistent message.
3. services/platform/src/mcp/manifest-loader.ts
   - Lines: 13-25, 48-81
   - Focus: ManifestTool interface: .id, .errors is Array<{code: string; description: string}>, .side_effects is string | null. loadManifest() returns McpManifest with .tools array. errors array directly accessible as tool.errors.
4. .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml
   - Lines: 1036-1041
   - Focus: shop_products manifest errors catalog: INTERNAL_SERVER_ERROR ('Convex startShopSearch action failed') and TIMEOUT ('Retailer search timed out'). VALIDATION_ERROR is NOT listed.
5. .spec/reviews/red-hat-2026-07-14T19-07-45Z-sprint03-postremediation.md
   - Lines: 144-156
   - Focus: Review finding NEW-2 documenting the shop_products VALIDATION_ERROR mismatch as HIGH severity with proven reproduction.

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: test-suite-passes
  Command: MCP_IT=1 pnpm vitest run tests/integration/mcp-fixture-coverage.test.ts
  Expected: All tests pass — existing 5 coverage tests plus 21 new error-code-catalog validation cases. Zero failures.

Gate 2: typecheck
  Command: pnpm tsgo --noEmit
  Expected: Exit code 0, no type errors

Gate 3: lint
  Command: pnpm biome check .
  Expected: Exit code 0, no lint errors

Gate 4: red-evidence-mismatch
  Command: Before fixing shop_products_error.json, run MCP_IT=1 pnpm vitest run tests/integration/mcp-fixture-coverage.test.ts and observe the shop_products failure
  Expected: Test fails for shop_products with message naming tool and showing VALIDATION_ERROR not in [INTERNAL_SERVER_ERROR, TIMEOUT]

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

References:
- .spec/reviews/red-hat-2026-07-14T19-07-45Z-sprint03-postremediation.md — NEW-2 (HIGH)

Interaction notes:
- Add a new describe block to mcp-fixture-coverage.test.ts titled 'MCP fixture coverage — error code catalog validation'. Inside, use it.each(mutationTools.map(t => [t.id, t.errors.map(e => e.code)])) to iterate all 21 mutation tools. For each tool: (1) read {tool_id}_error.json from FIXTURES_DIR, (2) extract fixture.code, (3) assert fixture.code is included in the manifest's errors[] code array using expect(manifestErrorCodes).toContain(fixture.code). The assertion message should name the tool and show both the fixture code and the available manifest codes for easy debugging. For the shop_products fix: the fixture currently represents a validation scenario ('Query must not be empty'), but since VALIDATION_ERROR is not in the manifest catalog and the manifest is write-prohibited, the fixture must be changed to represent an INTERNAL_SERVER_ERROR scenario instead. Update the message to something like 'Shop search action failed unexpectedly' and details to { step: 'retailer_search', retailer: 'amazon' } to be semantically consistent with the INTERNAL_SERVER_ERROR description in the manifest ('Convex startShopSearch action failed').

Pattern: Parameterized fixture-vs-catalog cross-validation with fail-on-mismatch
Pattern source: Existing mcp-fixture-coverage.test.ts lines 39-49 (per-tool fixture existence check) adapted for content-level validation
Anti-pattern: Suppressing or special-casing the shop_products assertion to avoid the mismatch instead of fixing the fixture

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: None
Blocks: None

--------------------------------------------------------------------------------
REVIEW (for mcp-reviewer)
--------------------------------------------------------------------------------

Must pass:
- New describe block uses it.each with dynamically-loaded mutationTools array — not a hardcoded tool list
- Assertion is expect(manifestErrorCodes).toContain(fixtureCode) — fixture code must be IN manifest catalog
- shop_products_error.json code is now INTERNAL_SERVER_ERROR (not VALIDATION_ERROR)
- shop_products_error.json message and details are semantically consistent with INTERNAL_SERVER_ERROR
- Manifest YAML NOT modified (git diff shows 0 lines changed in YAML)
- Any additional mismatches beyond shop_products discovered and fixed in fixtures
- Existing 5 fixture-coverage tests still pass unchanged

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

TC-1: All 21 mutation tools pass error-code-catalog validation after the shop_products fix
  maps_to_ac: AC-1 · verify: MCP_IT=1 pnpm vitest run tests/integration/mcp-fixture-coverage.test.ts

TC-2: shop_products_error.json contains code INTERNAL_SERVER_ERROR with semantically consistent message
  maps_to_ac: AC-2 · verify: Read services/platform/tests/fixtures/mcp-manifest/shop_products_error.json

TC-3: TypeScript compiles with zero errors
  maps_to_ac: AC-1 · verify: pnpm tsgo --noEmit

TC-4: Biome lint passes with zero errors
  maps_to_ac: AC-1 · verify: pnpm biome check .

TC-5: RED evidence: test fails on shop_products VALIDATION_ERROR before the fixture fix
  maps_to_ac: AC-3 · verify: Run test before fixture fix, capture failure output

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable; see brain/docs/kanban/REQUIREMENT-CONTRACT-V1.md)
--------------------------------------------------------------------------------

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-05",
  "proposed_by": "mcp-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "error_fixture_catalog_check": {
      "description": "The 21 {tool_id}_error.json files in services/platform/tests/fixtures/mcp-manifest/ that contain a 'code' field. Each file has: representative_example (boolean), code (string), message (string), details (object). The test loads each one, extracts the code, and checks it against the manifest's errors[] array for that tool.",
      "seed_method": "Pre-existing frozen fixtures on disk — loaded read-only by the test. The shop_products_error.json is the only one modified (code field changed from VALIDATION_ERROR to INTERNAL_SERVER_ERROR).",
      "records": [
        { "file": "shop_products_error.json", "code_before": "VALIDATION_ERROR", "code_after": "INTERNAL_SERVER_ERROR", "manifest_catalog": ["INTERNAL_SERVER_ERROR", "TIMEOUT"], "status": "MISMATCH_TO_FIX" },
        { "file": "store_document_error.json", "code": "VALIDATION_ERROR", "manifest_catalog": ["VALIDATION_ERROR", "EMBEDDING_FAILED", "INTERNAL_SERVER_ERROR"], "status": "EXPECTED_PASS" },
        { "file": "add_subscription_error.json", "code": "VALIDATION_ERROR", "manifest_catalog": ["VALIDATION_ERROR", "DUPLICATE_SUBSCRIPTION", "INTERNAL_SERVER_ERROR"], "status": "EXPECTED_PASS" },
        { "file": "start_assimilation_error.json", "code": "VALIDATION_ERROR", "manifest_catalog": ["VALIDATION_ERROR", "INTERNAL_SERVER_ERROR"], "status": "EXPECTED_PASS" }
      ]
    },
    "shop_products_error_fixed": {
      "description": "The corrected shop_products_error.json fixture after the fix. The code changes from VALIDATION_ERROR to INTERNAL_SERVER_ERROR. The message changes from 'Query must not be empty' to something consistent with an internal server error scenario. The details object changes from { field: 'query', constraint: 'minLength: 1' } to something like { action: 'startShopSearch', step: 'retailer_fetch' }.",
      "seed_method": "Direct edit of services/platform/tests/fixtures/mcp-manifest/shop_products_error.json",
      "records": [
        { "field": "representative_example", "value": true },
        { "field": "code", "old_value": "VALIDATION_ERROR", "new_value": "INTERNAL_SERVER_ERROR" },
        { "field": "message", "old_value": "Query must not be empty", "new_value": "Convex startShopSearch action failed unexpectedly" },
        { "field": "details", "old_value": { "field": "query", "constraint": "minLength: 1" }, "new_value": { "action": "startShopSearch", "step": "retailer_fetch" } }
      ]
    },
    "red_evidence_before_fix": {
      "description": "Proof artifact for the RED phase: before changing shop_products_error.json, the implementer runs the new error-code-catalog test and captures the failure output. The failure must clearly show that shop_products fixture code 'VALIDATION_ERROR' is not in the manifest catalog ['INTERNAL_SERVER_ERROR', 'TIMEOUT']. This is captured BEFORE the fixture fix, proving the test has real teeth.",
      "seed_method": "Run the test against the current (unfixed) fixture, capture stdout showing the failure, then apply the fix and re-run to show green.",
      "records": [
        { "phase": "RED", "action": "Run MCP_IT=1 pnpm vitest run tests/integration/mcp-fixture-coverage.test.ts with VALIDATION_ERROR fixture", "expected": "FAIL: shop_products — expected [ 'INTERNAL_SERVER_ERROR', 'TIMEOUT' ] to contain 'VALIDATION_ERROR'" },
        { "phase": "GREEN", "action": "Fix shop_products_error.json code to INTERNAL_SERVER_ERROR, re-run test", "expected": "PASS: shop_products — INTERNAL_SERVER_ERROR found in [ 'INTERNAL_SERVER_ERROR', 'TIMEOUT' ]" }
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "A parameterized test in mcp-fixture-coverage.test.ts validates that every mutation tool's {tool_id}_error.json fixture code exists in the manifest's errors[] catalog for that tool.",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-fixture-coverage.test.ts",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "vitest",
        "start_ref": "error_fixture_catalog_check",
        "negative_control": {
          "would_fail_if": ["static", "stub", "mock", "empty"]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "error_fixture_catalog_check",
            "action": {
              "type": "run_test",
              "target": "tests/integration/mcp-fixture-coverage.test.ts",
              "env": { "MCP_IT": "1" }
            },
            "end_state": {
              "must_observe": [
                "Test report shows 21 new parameterized test cases under 'error code catalog validation', one per mutation tool",
                "Each case title includes the tool ID (e.g., 'shop_products', 'add_improvement', 'store_document')",
                "All 21 cases pass — each fixture.code is found in the corresponding manifest tool.errors[] array",
                "The existing 5 fixture-coverage tests still pass unchanged"
              ],
              "must_not_observe": [
                "Any test case with '.skip' in its title",
                "Fewer than 21 error-code-catalog test cases",
                "A failure message mentioning VALIDATION_ERROR for shop_products"
              ]
            }
          },
          {
            "start_ref": "error_fixture_catalog_check",
            "action": {
              "type": "run_test",
              "target": "tests/integration/mcp-fixture-coverage.test.ts",
              "env": { "MCP_IT": "1" }
            },
            "end_state": {
              "must_observe": [
                "shop_products case passes with fixture code INTERNAL_SERVER_ERROR found in manifest catalog [INTERNAL_SERVER_ERROR, TIMEOUT]",
                "store_document case passes with fixture code found in its manifest catalog",
                "add_subscription case passes with fixture code found in its manifest catalog"
              ],
              "must_not_observe": [
                "shop_products error fixture still containing VALIDATION_ERROR",
                "Any mutation tool's error fixture code missing from its manifest catalog"
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
      "description": "The shop_products_error.json fixture is fixed: code changed from VALIDATION_ERROR to INTERNAL_SERVER_ERROR with a semantically consistent message and details.",
      "verify": "Read services/platform/tests/fixtures/mcp-manifest/shop_products_error.json",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "vitest",
        "start_ref": "shop_products_error_fixed",
        "negative_control": {
          "would_fail_if": ["static", "stub", "empty"]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "shop_products_error_fixed",
            "action": {
              "type": "run_test",
              "target": "tests/integration/mcp-fixture-coverage.test.ts",
              "env": { "MCP_IT": "1" }
            },
            "end_state": {
              "must_observe": [
                "shop_products error-code-catalog test case passes — INTERNAL_SERVER_ERROR is found in manifest errors [INTERNAL_SERVER_ERROR, TIMEOUT]",
                "The fixture file shop_products_error.json contains \"code\": \"INTERNAL_SERVER_ERROR\" — not VALIDATION_ERROR",
                "The fixture message is semantically consistent with an internal server error (references a failure in the search/backing action, not a validation constraint)"
              ],
              "must_not_observe": [
                "Fixture still containing \"code\": \"VALIDATION_ERROR\"",
                "Fixture message still saying 'Query must not be empty'",
                "Any git diff showing changes to the manifest YAML file"
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
      "description": "RED evidence proves the test catches the mismatch: before fixing shop_products_error.json, the new test fails with a clear message naming shop_products and showing VALIDATION_ERROR is not in [INTERNAL_SERVER_ERROR, TIMEOUT].",
      "verify": "Run test before fixture fix, capture failure",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "holdout",
        "verification_service": "vitest",
        "start_ref": "red_evidence_before_fix",
        "negative_control": {
          "would_fail_if": ["static", "stub"]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "red_evidence_before_fix",
            "action": {
              "type": "run_test",
              "target": "tests/integration/mcp-fixture-coverage.test.ts",
              "env": { "MCP_IT": "1" }
            },
            "end_state": {
              "must_observe": [
                "Test output shows FAILED for the shop_products error-code-catalog case",
                "Failure message explicitly names 'shop_products' and shows that 'VALIDATION_ERROR' was not found in the manifest catalog ['INTERNAL_SERVER_ERROR', 'TIMEOUT']",
                "The other 20 mutation tools' error-code-catalog cases either pass or also fail if they have mismatches"
              ],
              "must_not_observe": [
                "All tests passing (would indicate the test does not actually validate the fixture code against the catalog)",
                "Only a generic 'test failed' message without naming the tool or showing the code arrays"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "All 21 mutation tools pass error-code-catalog validation after the shop_products fix",
      "maps_to_ac": "AC-1",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-fixture-coverage.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "shop_products_error.json contains code INTERNAL_SERVER_ERROR with semantically consistent message",
      "maps_to_ac": "AC-2",
      "verify": "Read services/platform/tests/fixtures/mcp-manifest/shop_products_error.json"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "TypeScript compiles with zero errors",
      "maps_to_ac": "AC-1",
      "verify": "pnpm tsgo --noEmit"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Biome lint passes with zero errors",
      "maps_to_ac": "AC-1",
      "verify": "pnpm biome check ."
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "RED evidence: test fails on shop_products VALIDATION_ERROR before the fixture fix",
      "maps_to_ac": "AC-3",
      "verify": "Run test before fixture fix, capture failure output"
    }
  ]
}
-->

================================================================================

</details>
