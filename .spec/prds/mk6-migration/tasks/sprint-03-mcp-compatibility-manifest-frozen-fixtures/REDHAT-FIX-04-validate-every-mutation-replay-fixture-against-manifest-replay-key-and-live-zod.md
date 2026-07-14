# REDHAT-FIX-04 — Validate every mutation replay fixture against its manifest replay key and live Zod schema

## What this does
Parameterizes the cross-source replay-contract validation (currently hardcoded for 2/21 tools) across all 21 mutation tools using `it.each(mutationTools)` with per-tool Zod schema loading, proving fixture ↔ manifest ↔ schema consistency for every mutation tool's idempotency contract.

## Why
This task remediates a HIGH-severity finding from the independent post-remediation red-hat review (`.spec/reviews/red-hat-2026-07-14T19-07-45Z-sprint03-postremediation.md`, NEW-1). The review found that 19 of 21 mutation replay fixtures have ZERO cross-source idempotency validation — a wrong idempotency key in `start_assimilation_replay.json`, `assimilate_creator_replay.json`, etc. would go undetected by all tests. Sprint 19's rehost trusts replay contracts for all 21 mutation tools; 90.5% of those contracts are presence-on-disk checks only.

## How to verify
Running `MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts` produces at least 63 parameterized test cases (21 tools × 3 assertions) plus the suite-shape self-test, all passing. Temporarily corrupting any manifest replay.idempotency_key for a previously-uncovered tool causes the corresponding `it.each` case to fail.

## Scope
Writes to: tests/integration/mcp-replay-contract.test.ts
Prohibited: .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml, holocron-mcp/src/config/validation.ts, services/platform/src/mcp/manifest-loader.ts, services/platform/tests/fixtures/mcp-manifest/*.json

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-04 — Parameterize replay-fixture cross-source idempotency validation across all 21 mutation tools
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
All 21 mutation tools have parameterized cross-source validation proving fixture idempotency_key, manifest replay.idempotency_key, and live Zod schema shape are mutually consistent.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST replace the 2 hardcoded describe blocks (add_subscription lines 56-86, store_document lines 88-118) with a single parameterized describe using it.each(mutationTools)
- MUST import ALL 19 additional Zod schemas from holocron-mcp/src/config/validation.ts beyond the current 2 (AddSubscriptionSchema, StoreDocumentSchema)
- MUST load mutation tools dynamically from the manifest via loadManifest(MANIFEST_PATH).tools.filter(t => t.side_effects != null) — NEVER hardcode a tool list
- MUST build a static Record<string, ZodTypeAny> map from toolId to schema and throw if a mutation tool from the manifest is missing from the map (fail-closed on new tools)
- MUST run 3 assertions per tool: (1) fixture.idempotency_key deep-equals manifest.replay.idempotency_key, (2) every manifest key field exists in schema.shape, (3) every fixture key field exists in schema.shape
- MUST preserve the existing suite-shape self-test (lines 120-131) that checks for .skip() usage
- NEVER modify the manifest YAML, any fixture JSON, or any Zod schema — this task is test-only
- NEVER stub or mock loadManifest, loadReplayFixture, or Zod schema imports — all three sources must be real
- STRICTLY use the existing loadManifestReplayKey() helper or replace it with the typed loadManifest() from manifest-loader.ts for manifest access

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): All 21 mutation tools have parameterized cross-source validation (fixture ↔ manifest ↔ Zod schema)
- [ ] AC-2: RED evidence proves the parameterized test has teeth for the 19 newly-covered tools
- [ ] MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts passes (≥64 test cases, zero failures)
- [ ] pnpm tsgo --noEmit passes (exit 0)
- [ ] pnpm biome check . passes (exit 0)
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1 All 21 mutation tools have parameterized cross-source validation [PRIMARY]
  GIVEN: the replay-contract integration test suite with the parameterized it.each(mutationTools) implementation
  WHEN:  the test suite is executed with MCP_IT=1
  THEN:  every mutation tool (all 21 from the manifest's side_effects != null filter) has 3 passing assertions: (1) fixture.idempotency_key deep-equals manifest replay.idempotency_key, (2) every manifest key field exists in the tool's real Zod schema .shape, (3) every fixture key field exists in the tool's real Zod schema .shape
  TEST_TIER: integration · VERIFICATION_SERVICE: vitest
  SCENARIO (start_ref: mutation_tool_replay_fixtures · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if static, stub, mock, empty
    MUST_OBSERVE: test report shows ≥63 parameterized cases named with tool IDs (shop_products, add_improvement, steer_assimilation, cancel_assimilation, etc.); each case title contains the tool ID and assertion name; all pass with zero failures; suite-shape self-test passes
    MUST_NOT_OBSERVE: any '.skip' in titles; fewer than 63 cross-source cases; a 'tool not found in schema map' error for any of the 21 mutation tools
  TDD_STATE: none
AC-2 RED evidence proves the parameterized test has teeth
  GIVEN: the parameterized test is implemented but the manifest is temporarily corrupted for a previously-uncovered tool
  WHEN:  shop_products manifest replay.idempotency_key is changed from [query, condition, priceMin, priceMax] to [query]
  THEN:  the shop_products cross-source test case fails with expect([...]).toEqual([...]) showing the diff, proving the test catches real mismatches for the 19 newly-covered tools
  TEST_TIER: integration · VERIFICATION_SERVICE: vitest
  SCENARIO (start_ref: red_teeth_proof · tier: visible · evidence: stdout):
    NEGATIVE_CONTROL: would fail if static, stub
    MUST_OBSERVE: FAILED case for shop_products with AssertionError showing expected vs actual array diff; after reverting manifest, same case passes; add_subscription and store_document cases still pass unchanged
    MUST_NOT_OBSERVE: all tests passing with corrupted manifest key (would indicate no-op test); only 2 old tools being tested (would indicate parameterization failed)
  TDD_STATE: none
--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- tests/integration/mcp-replay-contract.test.ts

writeProhibited:
- .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml
- holocron-mcp/src/config/validation.ts
- services/platform/src/mcp/manifest-loader.ts
- services/platform/tests/fixtures/mcp-manifest/*.json

--------------------------------------------------------------------------------
READING LIST (max 5 files)
--------------------------------------------------------------------------------

1. tests/integration/mcp-replay-contract.test.ts [PRIMARY PATTERN]
   - Lines: full
   - Focus: Current test structure: 2 hardcoded describe blocks (lines 56-118), loadReplayFixture and loadManifestReplayKey helpers (lines 35-54), suite-shape self-test (lines 120-131). The parameterized version must replace lines 56-118 while preserving lines 120-131.
2. tests/integration/mcp-fixture-coverage.test.ts
   - Lines: 1-28
   - Focus: Pattern for loading manifest and filtering mutation tools: loadManifest(MANIFEST_PATH) then .tools.filter(t => t.side_effects != null). This exact pattern must be reused.
3. holocron-mcp/src/config/validation.ts
   - Lines: full
   - Focus: All 21 exportable Zod schemas. Key map: store_document→StoreDocumentSchema, update_document→UpdateDocumentSchema, share_document→ShareDocumentSchema, add_subscription→AddSubscriptionSchema, remove_subscription→RemoveSubscriptionSchema, check_subscriptions→CheckSubscriptionsSchema, set_subscription_filter→SetSubscriptionFilterSchema, store_tool→StoreToolSchema, update_tool→UpdateToolSchema, remove_tool→RemoveToolSchema, shop_products→ShopProductsSchema, start_assimilation→StartAssimilationSchema, approve_assimilation_plan→AssimilationSessionIdSchema, reject_assimilation_plan→RejectAssimilationPlanSchema, cancel_assimilation→AssimilationSessionIdSchema, steer_assimilation→SteerAssimilationSchema, assimilate_creator→AssimilateCreatorSchema, regenerate_transcript→RegenerateTranscriptSchema, add_improvement→AddImprovementSchema, close_improvement→CloseImprovementSchema, set_improvement_status→SetImprovementStatusSchema
4. services/platform/src/mcp/manifest-loader.ts
   - Lines: full
   - Focus: Typed loadManifest() function, ManifestTool interface with .id, .replay (ReplayContract | null), .side_effects (string | null). ReplayContract has idempotency_key: unknown[] and stored_result: string.
5. .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml
   - Lines: search for 'replay:'
   - Focus: The replay blocks for all 21 mutation tools — each has replay.idempotency_key (string array) and replay.stored_result (string).

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------

Gate 1: test-suite-passes
  Command: MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts
  Expected: All tests pass — at least 64 test cases (21×3 cross-source + 1 suite-shape self-test). Zero failures.

Gate 2: typecheck
  Command: pnpm tsgo --noEmit
  Expected: Exit code 0, no type errors

Gate 3: lint
  Command: pnpm biome check .
  Expected: Exit code 0, no lint errors

Gate 4: red-evidence-teeth
  Command: Manually change shop_products replay.idempotency_key in the manifest YAML from [query, condition, priceMin, priceMax] to [query], run the test, observe failure, then revert.
  Expected: The shop_products cross-source test case fails with expect([...]).toEqual([...]) showing the diff. After reverting, all pass.

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

References:
- .spec/reviews/red-hat-2026-07-14T19-07-45Z-sprint03-postremediation.md — NEW-1 (HIGH)

Interaction notes:
- Replace the two hardcoded describe blocks with a single parameterized describe('MCP replay contract — cross-source validation (all mutation tools)', () => {...}). Inside, load mutation tools from the manifest, build the TOOL_SCHEMA_MAP, then use it.each(mutationTools.map(t => [t.id])) to run 3 assertions per tool. The assertions mirror the existing 3 checks: (1) deep-equal fixture vs manifest idempotency_key arrays, (2) manifest key fields exist in Zod shape, (3) fixture key fields exist in Zod shape. Additionally, add a fail-closed guard: if a mutation tool's id is not in TOOL_SCHEMA_MAP, throw an Error naming the missing tool — this ensures new mutation tools added to the manifest are not silently skipped.

Pattern: Parameterized table-driven testing with dynamic source enumeration
Pattern source: Existing mcp-fixture-coverage.test.ts lines 25-27 (mutation tool enumeration from manifest) combined with vitest it.each()
Anti-pattern: Hardcoded per-tool describe blocks that silently miss new mutation tools added to the manifest

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: None
Blocks: None

--------------------------------------------------------------------------------
REVIEW (for mcp-reviewer)
--------------------------------------------------------------------------------

Must pass:
- TOOL_SCHEMA_MAP contains exactly 21 entries — one per mutation tool from the manifest's side_effects != null filter
- Mutation tools loaded DYNAMICALLY from loadManifest() — no hardcoded array of tool IDs
- Fail-closed guard throws when a mutation tool ID is not found in TOOL_SCHEMA_MAP
- Suite-shape self-test (checking for .skip) preserved and still passes
- NO fixture JSON, manifest YAML, or validation.ts modified
- Test count ≥64 (21 tools × 3 assertions + at least 1 self-test) — not just the old 11 tests

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

TC-1: All 21 mutation tools produce 3 passing parameterized test cases (63 total cross-source + suite-shape self-test)
  maps_to_ac: AC-1 · verify: MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts

TC-2: TypeScript compiles with zero errors after adding 19 new schema imports and the TOOL_SCHEMA_MAP
  maps_to_ac: AC-1 · verify: pnpm tsgo --noEmit

TC-3: Biome lint passes with zero errors on the refactored test file
  maps_to_ac: AC-1 · verify: pnpm biome check .

TC-4: RED teeth: manifest mutation for a previously-uncovered tool causes test failure
  maps_to_ac: AC-2 · verify: Manual mutation + test run + revert

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable; see brain/docs/kanban/REQUIREMENT-CONTRACT-V1.md)
--------------------------------------------------------------------------------

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-04",
  "proposed_by": "mcp-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "mutation_tool_replay_fixtures": {
      "description": "The 21 {tool_id}_replay.json files in services/platform/tests/fixtures/mcp-manifest/ that contain idempotency_key arrays. Each file has fields: idempotency_key (string[]), stored_result (string), first_call_result (object), second_call_result (object). The parameterized test loads each one via loadReplayFixture() and cross-validates its idempotency_key against the manifest and Zod schema.",
      "seed_method": "Pre-existing frozen fixtures on disk — loaded read-only by the test. No seeding required.",
      "records": [
        { "file": "store_document_replay.json", "idempotency_key": ["title", "content"], "stored_result": "documentId" },
        { "file": "update_document_replay.json", "idempotency_key": ["documentId"], "stored_result": "documentId" },
        { "file": "share_document_replay.json", "idempotency_key": ["documentId", "isPublic"], "stored_result": "shareToken" },
        { "file": "add_subscription_replay.json", "idempotency_key": ["sourceType", "identifier"], "stored_result": "subscriptionId" },
        { "file": "remove_subscription_replay.json", "idempotency_key": ["subscriptionId"], "stored_result": "deleted" },
        { "file": "check_subscriptions_replay.json", "idempotency_key": ["sourceType"], "stored_result": "totalQueued" },
        { "file": "set_subscription_filter_replay.json", "idempotency_key": ["sourceId", "ruleName"], "stored_result": "filterId" },
        { "file": "store_tool_replay.json", "idempotency_key": ["title", "sourceType", "category"], "stored_result": "toolId" },
        { "file": "update_tool_replay.json", "idempotency_key": ["toolId"], "stored_result": "toolId" },
        { "file": "remove_tool_replay.json", "idempotency_key": ["toolId"], "stored_result": "deleted" },
        { "file": "shop_products_replay.json", "idempotency_key": ["query", "condition", "priceMin", "priceMax"], "stored_result": "sessionId" },
        { "file": "start_assimilation_replay.json", "idempotency_key": ["repositoryUrl"], "stored_result": "sessionId" },
        { "file": "approve_assimilation_plan_replay.json", "idempotency_key": ["sessionId"], "stored_result": "approved" },
        { "file": "reject_assimilation_plan_replay.json", "idempotency_key": ["sessionId", "feedback"], "stored_result": "rejected" },
        { "file": "cancel_assimilation_replay.json", "idempotency_key": ["sessionId"], "stored_result": "cancelled" },
        { "file": "steer_assimilation_replay.json", "idempotency_key": ["sessionId", "note"], "stored_result": "steered" },
        { "file": "assimilate_creator_replay.json", "idempotency_key": ["profileId", "forceRegenerate"], "stored_result": "transcriptsCreated" },
        { "file": "regenerate_transcript_replay.json", "idempotency_key": ["contentId"], "stored_result": "jobId" },
        { "file": "add_improvement_replay.json", "idempotency_key": ["items"], "stored_result": "ids" },
        { "file": "close_improvement_replay.json", "idempotency_key": ["id"], "stored_result": "status" },
        { "file": "set_improvement_status_replay.json", "idempotency_key": ["id", "status"], "stored_result": "status" }
      ]
    },
    "tool_schema_map": {
      "description": "Static Record<string, ZodTypeAny> mapping each of the 21 mutation tool IDs to its corresponding Zod schema exported from holocron-mcp/src/config/validation.ts. The test uses this to access schema.shape for field-existence checks. If a mutation tool from the manifest is not in this map, the test throws a fail-closed error.",
      "seed_method": "Hardcoded in the test file as a const — all schemas imported from ../../holocron-mcp/src/config/validation.ts",
      "records": [
        { "tool_id": "store_document", "schema": "StoreDocumentSchema" },
        { "tool_id": "update_document", "schema": "UpdateDocumentSchema" },
        { "tool_id": "share_document", "schema": "ShareDocumentSchema" },
        { "tool_id": "add_subscription", "schema": "AddSubscriptionSchema" },
        { "tool_id": "remove_subscription", "schema": "RemoveSubscriptionSchema" },
        { "tool_id": "check_subscriptions", "schema": "CheckSubscriptionsSchema" },
        { "tool_id": "set_subscription_filter", "schema": "SetSubscriptionFilterSchema" },
        { "tool_id": "store_tool", "schema": "StoreToolSchema" },
        { "tool_id": "update_tool", "schema": "UpdateToolSchema" },
        { "tool_id": "remove_tool", "schema": "RemoveToolSchema" },
        { "tool_id": "shop_products", "schema": "ShopProductsSchema" },
        { "tool_id": "start_assimilation", "schema": "StartAssimilationSchema" },
        { "tool_id": "approve_assimilation_plan", "schema": "AssimilationSessionIdSchema" },
        { "tool_id": "reject_assimilation_plan", "schema": "RejectAssimilationPlanSchema" },
        { "tool_id": "cancel_assimilation", "schema": "AssimilationSessionIdSchema" },
        { "tool_id": "steer_assimilation", "schema": "SteerAssimilationSchema" },
        { "tool_id": "assimilate_creator", "schema": "AssimilateCreatorSchema" },
        { "tool_id": "regenerate_transcript", "schema": "RegenerateTranscriptSchema" },
        { "tool_id": "add_improvement", "schema": "AddImprovementSchema" },
        { "tool_id": "close_improvement", "schema": "CloseImprovementSchema" },
        { "tool_id": "set_improvement_status", "schema": "SetImprovementStatusSchema" }
      ]
    },
    "red_teeth_proof": {
      "description": "Proof artifact for the RED phase: the implementer temporarily changes shop_products replay.idempotency_key in the manifest YAML from [query, condition, priceMin, priceMax] to [query], runs the test, captures the failure output showing the expected vs actual array diff, then reverts the manifest. This proves the parameterized test has real teeth for the 19 newly-covered tools.",
      "seed_method": "Manual mutation of .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml, then immediate revert after capturing failure output.",
      "records": [
        { "step": 1, "action": "Change manifest shop_products replay.idempotency_key to [query]", "expected": "Test fails for shop_products with array diff" },
        { "step": 2, "action": "Revert manifest change", "expected": "Test passes for all 21 tools" }
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "All 21 mutation tools have parameterized cross-source validation: fixture idempotency_key === manifest replay.idempotency_key, and all key fields from both sources exist in the tool's live Zod schema.",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "vitest",
        "start_ref": "mutation_tool_replay_fixtures",
        "negative_control": {
          "would_fail_if": ["static", "stub", "mock", "empty"]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mutation_tool_replay_fixtures",
            "action": {
              "type": "run_test",
              "target": "tests/integration/mcp-replay-contract.test.ts",
              "env": { "MCP_IT": "1" }
            },
            "end_state": {
              "must_observe": [
                "Test report shows at least 63 parameterized test cases named with tool IDs like 'shop_products', 'add_improvement', 'steer_assimilation', 'cancel_assimilation'",
                "Each parameterized case title contains the tool ID and the assertion name",
                "All 63+ cases pass with zero failures",
                "The suite-shape self-test 'does not use skip-to-green guards' passes"
              ],
              "must_not_observe": [
                "Any test case with '.skip' in its title",
                "Fewer than 63 cross-source test cases",
                "A thrown error about a missing tool in TOOL_SCHEMA_MAP"
              ]
            }
          },
          {
            "start_ref": "mutation_tool_replay_fixtures",
            "action": {
              "type": "run_test",
              "target": "tests/integration/mcp-replay-contract.test.ts",
              "env": { "MCP_IT": "1" }
            },
            "end_state": {
              "must_observe": [
                "shop_products appears with 3 passing assertions: idempotency_key [query, condition, priceMin, priceMax] matches manifest, all 4 fields exist in ShopProductsSchema.shape",
                "add_improvement appears with 3 passing assertions",
                "approve_assimilation_plan appears with 3 passing assertions using AssimilationSessionIdSchema"
              ],
              "must_not_observe": [
                "Any tool ID appearing only in old hardcoded blocks but not in the parameterized suite",
                "A 'tool not found in schema map' error for any of the 21 mutation tools"
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
      "description": "RED evidence proves the parameterized test has teeth: temporarily corrupting any one manifest replay.idempotency_key for a previously-uncovered tool causes the corresponding it.each case to fail.",
      "verify": "Manual mutation + test run",
      "maps_to_ac": null,
      "flow_ref": "UC-SVC-04",
      "scenario": {
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "vitest",
        "start_ref": "red_teeth_proof",
        "negative_control": {
          "would_fail_if": ["static", "stub"]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "red_teeth_proof",
            "action": {
              "type": "run_test",
              "target": "tests/integration/mcp-replay-contract.test.ts",
              "env": { "MCP_IT": "1" }
            },
            "end_state": {
              "must_observe": [
                "After changing shop_products manifest idempotency_key to [query], test shows FAILED with AssertionError: expected [ 'query', 'condition', 'priceMin', 'priceMax' ] to deeply equal [ 'query' ]",
                "After reverting the manifest, the same test case passes",
                "add_subscription and store_document cases still pass unchanged"
              ],
              "must_not_observe": [
                "All tests passing even with a corrupted manifest key",
                "Only the 2 old tools being tested"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "All 21 mutation tools produce 3 passing parameterized test cases (63 total cross-source + suite-shape self-test)",
      "maps_to_ac": "AC-1",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "TypeScript compiles with zero errors after adding 19 new schema imports and the TOOL_SCHEMA_MAP",
      "maps_to_ac": "AC-1",
      "verify": "pnpm tsgo --noEmit"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Biome lint passes with zero errors on the refactored test file",
      "maps_to_ac": "AC-1",
      "verify": "pnpm biome check ."
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "RED teeth: manifest mutation for a previously-uncovered tool causes test failure",
      "maps_to_ac": "AC-2",
      "verify": "Manual mutation + test run + revert"
    }
  ]
}
-->

================================================================================

</details>
