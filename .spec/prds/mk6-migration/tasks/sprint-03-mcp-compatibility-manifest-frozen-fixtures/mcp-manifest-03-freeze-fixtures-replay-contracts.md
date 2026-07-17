# mcp-manifest-03 — Freeze success/error/mutation-replay fixtures for all 44 tools from current behavior

## What this does
Delivers the failing-first **negative-control suite** and frozen fixtures that give the manifest completeness gate its teeth: (a) a tool whose fixture block is removed → `holo mcp:verify-manifest` exits non-zero naming the uncovered tool; (b) a replay contract — re-invoking a mutation with the same idempotency key returns the stored result, no duplicate side-effect (add_subscription / store_document seed); (c) all 44 tools carry frozen success/error fixtures captured from the REAL tool behavior. The suite is RED against the absent/broken start and GREEN against the up state, with NO `it.skip`/`test.skip` on any negative control.

## Why
A gate is only real if it fails when the behavior is absent (`~/.claude/CLAUDE.md` THE SUPREME RULE; the CAP-CUT-01 negative-control clause). This is the RED-first bead for mcp-manifest-04: it authors the controls (and the frozen fixtures + tampered manifest copies they seed from) that the implementer turns green, proving the completeness gate genuinely depends on frozen fixtures rather than a stubbed pass.

## How to verify
`MCP_IT=1 pnpm vitest run tests/integration/mcp-manifest-negative-controls.test.ts` against a completed mcp-manifest-04 passes because each control observed the real non-zero exit; before that implementation exists (or with fixtures removed) the controls fail RED. The suite carries no `*.skip` on any negative control.

## Scope
Creates `tests/integration/mcp-manifest-negative-controls.test.ts`, `tests/integration/mcp-replay-contract.test.ts`, and frozen fixtures under `services/platform/tests/fixtures/mcp-manifest/**` (real success/error snapshots for all 44 tools + mutation replay fixtures). Touches NO production/service code under `services/platform/src`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: mcp-manifest-03 — Freeze success/error/mutation-replay fixtures for all 44 tools from current behavior
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Completed
PRIORITY:   P0
EFFORT:     L  (180 min)
AGENT:      implementer=red-test-generator | reviewer=mcp-reviewer
PROPOSED-BY: mcp-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes
CAPABILITY: CAP-CUT-01 (the frozen-fixture + replay-contract un-fakeability guard for the manifest baseline)
SPRINT:     [Sprint 3 — MCP Compatibility Manifest and Frozen Fixtures](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      MCP_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
The negative-control suite passes only against the real, completed `holo mcp:verify-manifest` surface and the committed frozen fixtures; against the absent/broken start (verify-manifest not built, a fixture block removed, the replay contract unwired) the targeted controls report RED. The frozen fixtures directory carries real success/error snapshots for all 44 tools (get_research_session_success.json, get_document_not_found.json, etc.) and mutation replay fixtures (add_subscription_replay.json capturing idempotency key [identifier, sourceType] → stored subscriptionId; store_document_replay.json capturing [title, content] → stored documentId). The suite has NO `it.skip`/`test.skip` guards — every control either passes-with-teeth or fails-on-absent-stack.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST drive the REAL `holo mcp:verify-manifest` entrypoint — no mocking of the mcp module, the manifest loader, or the filesystem.
- MUST assert the concrete failure signature: fixture block removed → verify-manifest exit non-zero naming the tool; replay contract missing → replay test fails RED.
- MUST seed real start state via REAL artifacts: the committed `14-mcp-compatibility-manifest.yaml` (read-only from mcp-manifest-02) and frozen fixture files under `services/platform/tests/fixtures/mcp-manifest/**`.
- MUST capture frozen success/error fixtures from the REAL tool behavior (store_document returns {documentId, title, content, embedded_at}; get_document with an invalid id throws NOT_FOUND; etc.).
- MUST capture the mutation replay fixtures from the exact idempotency-key → stored-result mapping in the manifest (add_subscription: [identifier, sourceType] → subscriptionId; store_document: [title, content] → documentId).
- NEVER use `it.skip`/`test.skip`/conditional skip to make a control pass when the surface is absent — a skipped control has no teeth (review-blocking anti-pattern).
- NEVER weaken an assertion (`exit>=0`, `toBeTruthy`) to pass; NEVER touch `services/platform/src` (RED tests + fixtures only); NEVER assert "works"/"verifies correctly"; each control names its would-fail-if disconnect.
- NEVER modify the committed `14-mcp-compatibility-manifest.yaml` (read-only from mcp-manifest-02); NEVER touch `holocron-mcp/src/**` (read-only source of truth).
- STRICTLY every control names its would-fail-if disconnect; fixtures are committed JSON files, not generated at runtime; replay fixtures capture the exact field-to-field mapping from the manifest's idempotency_key to stored_result.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): fixture-missing control has teeth (remove a fixture block → verify-manifest exits non-zero naming the tool)
- [x] AC-2: replay contract control has teeth (re-invoke add_subscription with the same idempotency key → returns the stored subscriptionId; same for store_document)
- [x] AC-3: all 44 tools have frozen success fixtures; mutation tools have error fixtures; all controls pass against up-state fixtures
- [x] AC-4: suite GREEN against the up-state (real verify-manifest + fixtures), RED against the absent/broken start, NO `*.skip` guards
- [ ] frozen fixtures created (44 success fixtures + mutation error/replay fixtures) and committed
- [ ] `pnpm biome check .` clean; only test + fixture files modified (no `services/platform/src`)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (RED-first — each control fails against the absent/broken start, then mcp-manifest-04 makes it green)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Fixture-missing control has teeth — verify-manifest exits non-zero naming the uncovered tool (flow_ref UC-SVC-04)
  GIVEN the committed manifest (manifest_committed) with fixture blocks for all 44 tools and the verify-manifest entrypoint (verify_gate from mcp-manifest-04)
  WHEN  the negative-control test removes one tool's fixture block (e.g. store_document) and runs verify-manifest
  THEN  verify-manifest exits non-zero, stderr names the uncovered tool (e.g. "store_document fixtures missing"); the control passes because it observed the non-zero exit, would FAIL if verify-manifest passed with missing fixtures
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: manifest_committed+verify_gate · evidence: stdout
    NEGATIVE_CONTROL: would fail if verify-manifest passes with the fixture block missing (fails open), the control doesn't assert the concrete non-zero exit, or the control doesn't assert the tool is named in stderr
    MUST_OBSERVE: test passes because verify-manifest exited != 0; stderr contains "store_document fixtures missing" (or equivalent)
    MUST_NOT_OBSERVE: test green while verify-manifest exited 0; a generic pass with no tool name

AC-2 Replay contract control has teeth — re-invoking mutation with same idempotency key returns stored result (flow_ref T-SVC-021)
  GIVEN the populated manifest with replay contracts (add_subscription.idempotency_key: [identifier, sourceType]; store_document.idempotency_key: [title, content]) and the frozen replay fixtures (add_subscription_replay.json, store_document_replay.json)
  WHEN  the replay control test invokes add_subscription twice with the same identifier+sourceType and asserts both calls return the same subscriptionId from the fixture
  THEN  first call returns the fixture's subscriptionId; second call returns the SAME subscriptionId (no new row); control passes because replay returned the stored result, would FAIL if the second call created a duplicate
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  SCENARIO — start_ref: manifest_with_replay+replay_fixtures · evidence: stdout
    NEGATIVE_CONTROL: would fail if the second call creates a new subscriptionId (no idempotency), the control doesn't assert both calls return identical subscriptionId, or the control uses a mocked/stubbed replay
    MUST_OBSERVE: test passes because both calls returned the same subscriptionId; first call's subscriptionId matches the fixture
    MUST_NOT_OBSERVE: second call returns a different subscriptionId; a duplicate row created

AC-3 All 44 tools have frozen success fixtures; mutation tools have error fixtures (flow_ref T-SVC-021)
  GIVEN the real MCP tool behavior (holocron-mcp/src/tools/*.ts) and the fixtures directory
  WHEN  the fixture-capture process runs each tool with sample inputs and commits the success/error outputs as JSON
  THEN  44 success fixtures present (get_research_session_success.json … findRecommendations_success.json); error fixtures present for mutation tools (store_document_validation_error.json, add_subscription_not_found.json, etc.); all fixtures match the tool's schema from the manifest
  TEST_TIER: integration · VERIFICATION_SERVICE: filesystem
  SCENARIO — start_ref: real_tool_behavior · evidence: filesystem
    NEGATIVE_CONTROL: would fail if the fixture count < 44, a tool is missing a success fixture, or a mutation tool is missing an error fixture
    MUST_OBSERVE: 44 success fixtures; error fixtures for mutation tools; fixtures match tool schemas
    MUST_NOT_OBSERVE: fixture count < 44; a tool with no success fixture; a mutation with no error fixture

AC-4 Suite GREEN against up-state, RED against absent/broken start, NO it.skip
  GIVEN the full negative-control suite
  WHEN  run against the up-state (real verify-manifest + fixtures) then the absent/broken start (verify-manifest not built, fixtures removed)
  THEN  up-state run passes; absent/broken-start run shows the targeted controls RED; no `it.skip`/`test.skip` guards exist in the suite
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  SCENARIO — start_ref: full_suite · evidence: stdout
    NEGATIVE_CONTROL: would fail if controls are guarded by it.skip so they neither pass-with-teeth nor fail-on-absent, or the suite passes regardless of fixture state
    MUST_OBSERVE: up-state run passes; no `*.skip` on negative controls; absent/broken-start run shows the controls failing
    MUST_NOT_OBSERVE: any it.skip/test.skip on a negative control; a control that passes regardless of fixture state

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- tests/integration/mcp-manifest-negative-controls.test.ts (NEW — fixture-missing controls)
- tests/integration/mcp-replay-contract.test.ts (NEW — idempotency/replay controls)
- services/platform/tests/fixtures/mcp-manifest/** (NEW — frozen success/error fixtures for all 44 tools + mutation replay fixtures: <tool>_success.json per tool, <mutation>_error.json, add_subscription_replay.json, store_document_replay.json)
writeProhibited: services/platform/src/** (production/service code — RED tests + fixtures only), .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml (read-only from mcp-manifest-02), holocron-mcp/src/** (read-only source of truth), tests/integration/mcp-verify-manifest.test.ts (mcp-manifest-04, read-only), convex/**, app/**

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/tasks/sprint-02-convex-source-catalog-asset-inventory/catalog-5-red-tests-negative-controls.md:1-185 [PRIMARY MODEL] — RED-test task shape with negative controls, no skip-to-green, real fixture capture
2. holocron-mcp/src/mastra/stdio.ts:139-843 — the real 44 registered tool IDs the fixture capture covers
3. holocron-mcp/src/tools/*.ts — real tool behavior to capture fixtures from (success/error outputs, side effects)
4. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:139 — T-SVC-021 (all 44 tools + both transports have frozen success/error fixtures; mutation replay contract present)
5. services/platform/src/cli/holo.ts:1-60 — the real `holo` entrypoint the controls spawn against (from Sprint 01 compat-1)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- fixture-missing control RED-with-teeth: `MCP_IT=1 pnpm vitest run tests/integration/mcp-manifest-negative-controls.test.ts -t 'fixture missing'` → Exit 0 (control passes because verify-manifest exited non-zero) — and the test itself fails if verify-manifest passes
- add_subscription replay control: `MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts -t 'add_subscription replay'` → Exit 0
- store_document replay control: `MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts -t 'store_document replay'` → Exit 0
- 44 fixtures present: `ls services/platform/tests/fixtures/mcp-manifest/*_success.json | wc -l | xargs test 44 -eq` → Exit 0
- no skip guards: `! grep -REn 'it\.skip|test\.skip|describe\.skip' tests/integration/mcp-manifest-negative-controls.test.ts tests/integration/mcp-replay-contract.test.ts` → Exit 0
- RED evidence: captured run of the suite against the absent/broken start showing the controls failing (before mcp-manifest-04 green)
- lint clean: `pnpm biome check .` → Exit 0
- Gate 8 (un-fakeable PRIMARY): AC-1 was watched RED against the absent `verify-manifest` command (and against a manifest with a fixture block deleted) before green; captured stdout shows a real named failure, not a bare exit code.

--------------------------------------------------------------------------------
REVIEW (mcp-reviewer)
--------------------------------------------------------------------------------
Must pass: each control asserts a concrete failure signature (fixture-missing → verify-manifest non-zero with the tool name; replay → identical stored IDs); no skip-to-green; no mocks of the mcp module / manifest loader / filesystem; fixtures are real committed JSON files, not view-injection; RED reproduced against the absent/broken start. Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: mcp-manifest-02 (populated manifest with per-tool contracts and idempotency keys), mcp-manifest-01 (the tool entries the fixtures derive from) · Blocks: mcp-manifest-04 (this RED suite turns green when verify-manifest is built — the fixture-missing + replay controls it turns green)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "mcp-manifest-03",
  "proposed_by": "mcp-planner",
  "tdd_mode": "red_first",
  "verification_policy": { "requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true },
  "fixtures": {
    "manifest_committed": { "description": "The committed 14-mcp-compatibility-manifest.yaml populated by mcp-manifest-02 (read-only for fixture capture + tampered copies)", "seed_method": "file", "records": [".spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml"] },
    "verify_gate": { "description": "The holo mcp:verify-manifest entrypoint from mcp-manifest-04 (absent during RED phase, present during GREEN phase)", "seed_method": "cli", "records": ["services/platform/src/cli/holo.ts mcp:verify-manifest (built by mcp-manifest-04)"] },
    "real_tool_behavior": { "description": "The real MCP tool implementations from holocron-mcp/src/tools/*.ts — fixture capture runs these and commits outputs", "seed_method": "read_only", "records": ["holocron-mcp/src/tools/*.ts implementations"] },
    "replay_fixtures": { "description": "Frozen replay fixtures capturing the idempotency_key -> stored_result mapping for mutation tools", "seed_method": "migration_fixture", "records": ["services/platform/tests/fixtures/mcp-manifest/add_subscription_replay.json", "services/platform/tests/fixtures/mcp-manifest/store_document_replay.json"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN committed manifest + verify-manifest WHEN a fixture block is removed and verify-manifest runs THEN exit non-zero naming the uncovered tool; control passes because it observed non-zero, would FAIL if verify passed",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-manifest-negative-controls.test.ts -t 'fixture missing'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["verify-manifest passes with the fixture missing (fails open)", "control doesn't assert the non-zero exit", "control doesn't assert the tool is named"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_committed+verify_gate", "action": { "actor": "red_test_generator", "steps": ["remove store_document fixture block; run verify-manifest; assert non-zero exit with 'store_document' in stderr"] },
          "end_state": { "must_observe": ["test passes because verify-manifest exited != 0", "stderr contains the tool name"], "must_not_observe": ["test passes while verify-manifest exited 0", "a generic pass with no tool name"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "T-SVC-021",
      "description": "GIVEN manifest with replay contracts + frozen fixtures WHEN a mutation is invoked twice with the same idempotency key THEN both calls return the same stored result; control passes because replay worked, would FAIL if a duplicate were created",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts -t 'add_subscription replay'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "T-SVC-021",
        "negative_control": { "would_fail_if": ["second call creates a new ID", "control doesn't assert identical IDs", "control uses a mocked replay"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_committed+replay_fixtures", "action": { "actor": "red_test_generator", "steps": ["invoke add_subscription with {identifier, sourceType}; capture subscriptionId; invoke again; assert identical subscriptionId"] },
          "end_state": { "must_observe": ["test passes because both calls returned the same subscriptionId", "first call's subscriptionId matches the fixture"], "must_not_observe": ["second call returns a different subscriptionId", "a duplicate row created"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "T-SVC-021",
      "description": "GIVEN real tool behavior WHEN fixture-capture runs THEN 44 success fixtures present; error fixtures present for mutations; fixtures match tool schemas",
      "verify": "ls services/platform/tests/fixtures/mcp-manifest/*_success.json | wc -l | xargs test 44 -eq",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "filesystem", "flow_ref": "T-SVC-021",
        "negative_control": { "would_fail_if": ["fixture count < 44", "a tool missing a success fixture", "a mutation missing an error fixture"] },
        "evidence": { "artifact_type": "filesystem", "required_capture": true },
        "cases": [ { "start_ref": "real_tool_behavior", "action": { "actor": "red_test_generator", "steps": ["run each tool with sample inputs; capture outputs; commit as fixtures"] },
          "end_state": { "must_observe": ["44 success fixtures", "error fixtures for mutation tools", "fixtures match tool schemas"], "must_not_observe": ["fixture count < 44", "a tool with no success fixture", "a mutation with no error fixture"] } } ] } },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "UC-SVC-04",
      "description": "GIVEN the full suite WHEN run against the up-state then the absent/broken start THEN up-state passes, absent/broken-start controls RED, no `*.skip` guards",
      "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-manifest-negative-controls.test.ts && ! grep -REn 'it\\.skip|test\\.skip|describe\\.skip' tests/integration/mcp-manifest-negative-controls.test.ts tests/integration/mcp-replay-contract.test.ts",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli", "flow_ref": "UC-SVC-04",
        "negative_control": { "would_fail_if": ["any control is guarded by it.skip", "the suite passes regardless of fixture state"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "manifest_committed+verify_gate", "action": { "actor": "cli_user", "steps": ["run the suite up-state; scan for skip; re-run against the absent/broken start"] },
          "end_state": { "must_observe": ["up-state run passes", "no `*.skip` on negative controls", "absent/broken-start run shows the controls failing"], "must_not_observe": ["any it.skip/test.skip on a negative control", "a control that passes regardless of fixture state"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "fixture-missing control passes only because verify-manifest exited non-zero naming the uncovered tool", "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-manifest-negative-controls.test.ts -t 'fixture missing'" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "add_subscription replay control passes only because both calls returned identical subscriptionId", "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts -t 'add_subscription replay'" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "store_document replay control passes only because both calls returned identical documentId", "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-replay-contract.test.ts -t 'store_document replay'" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "44 success fixtures + error fixtures present for all tools", "verify": "ls services/platform/tests/fixtures/mcp-manifest/*_success.json | wc -l | xargs test 44 -eq" },
    { "id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "suite passes with no `*.skip` guards against up-state; fails RED against absent/broken start", "verify": "MCP_IT=1 pnpm vitest run tests/integration/mcp-manifest-negative-controls.test.ts && ! grep -REn 'it\\.skip|test\\.skip' tests/integration/mcp-manifest-negative-controls.test.ts tests/integration/mcp-replay-contract.test.ts" }
  ]
}
-->
</details>
