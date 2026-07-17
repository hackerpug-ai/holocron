# catalog-5 — RED tests: unmapped-table fails, deleted-entry fails, variance≠0 fails

## What this does
Delivers the failing-first **negative-control suite** and the frozen fixtures that give the catalog gate its teeth: an unmapped/deleted table entry ⇒ `holo catalog:verify` exits non-zero naming it, a removed field/storage-ref disposition ⇒ verify/coverage blocks naming it, and a source count that diverges from the catalog's expected-target formula with no approved exception ⇒ `holo catalog:reconcile` exits non-zero naming the table + numeric variance — each driving the REAL `holo catalog:*` entrypoints, no mocks, no skip-to-green.

## Why
A gate is only real if it fails when the behavior is absent (`~/.claude/CLAUDE.md` THE SUPREME RULE; the CAP-MIG-01 negative-control clause). This is the RED-first bead for catalog-2 and catalog-3: it authors the controls (and the real fixture `convex export` + tampered catalog copies they seed from) that the two implementers turn green, proving the coverage gate and reconciliation genuinely depend on the real catalog + export rather than on a stubbed pass.

## How to verify
`CATALOG_IT=1 pnpm vitest run tests/integration/catalog-negative-controls.test.ts` against a completed catalog-2/catalog-3 passes because each control observed the real non-zero exit; before those implementations exist (or with the disconnect re-introduced) the controls fail RED. The suite carries no `*.skip` on any negative control.

## Scope
Creates `tests/integration/catalog-negative-controls.test.ts` and the frozen fixtures under `services/platform/tests/fixtures/` (a real fixture `convex export`, tampered catalog copies, a variance export). Touches NO production/service code under `services/platform/src`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: catalog-5 — RED tests: unmapped-table fails, deleted-entry fails, variance≠0 fails
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Completed
PRIORITY:   P0
EFFORT:     S  (90 min)
AGENT:      implementer=red-test-generator | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes
CAPABILITY: CAP-MIG-01 (source-catalog un-fakeability guard)
SPRINT:     [Sprint 2 — Convex Source Catalog and Asset Inventory](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      pnpm test        (vitest; single file: pnpm vitest run <path>)
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
The negative-control suite passes only against the real, completed `holo catalog:*` surface and a real fixture `convex export`; against the absent/broken start (command not yet built, table entry deleted, disposition removed, variance introduced) the targeted controls report RED, and the captured RED output demonstrates the teeth — no skip-to-green.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST drive the REAL `holo` entrypoints (`catalog:verify`, `catalog:coverage`, `catalog:reconcile`) — no mocking of `@mastra/*`, the catalog loader, the export reader, or the filesystem.
- MUST assert the concrete failure signature: deleted table entry ⇒ `catalog:verify` exit non-zero naming the table (RED if it reports 60/60); removed field/storage disposition ⇒ `catalog:coverage`/`verify` non-zero naming the surface (RED if it passes); count-vs-formula divergence with no approved exception ⇒ `catalog:reconcile` non-zero naming the table + numeric variance (RED if it reports `variance: 0`).
- MUST seed real start state via REAL artifacts: a frozen fixture `convex export` directory (grounded in real convex/schema.ts table names + `_storage/` blobs) and tampered COPIES of the committed catalog — never view-injection, never a hand-built in-memory object.
- NEVER use `it.skip`/conditional skip to make a control pass when the surface is absent — a skipped control has no teeth (review-blocking anti-pattern).
- NEVER weaken an assertion (`exit>=0`, `toBeTruthy`) to pass; NEVER touch `services/platform/src` (RED tests + fixtures only); NEVER assert "works"/"verifies correctly"; each control names its would-fail-if disconnect.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): deleted/unmapped-table control has teeth (verify exits non-zero naming the table)
- [x] AC-2: removed field/storage-ref disposition control has teeth (coverage/verify blocks naming the surface)
- [x] AC-3: variance≠0 control has teeth (reconcile exits non-zero naming the table + numeric variance)
- [x] AC-4: suite green on the up state (real catalog + fixture export + built surface), RED on the absent/broken start, no `*.skip` guards
- [ ] frozen fixtures created (real fixture export, tampered catalog copies, variance export) and committed
- [ ] `pnpm biome check .` clean; only test + fixture files modified (no `services/platform/src`)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (RED-first — each control fails against the absent/broken start, then catalog-2/catalog-3 make it green)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Deleted/unmapped-table control has teeth (flow_ref UC-DATA-01)
  GIVEN the `holo catalog:verify` entrypoint (catalog-3) + a catalog copy with one table entry removed (catalog_missing_table), cross-checked against the real fixture export (export_sample)
  WHEN  the negative-control test drives `holo catalog:verify`
  THEN  it asserts non-zero exit naming the missing table, and would itself FAIL if verify reported 60/60
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  MUST_OBSERVE: test passes because `holo catalog:verify` exited ≠ 0 naming the removed table (e.g. `voiceCommands`) · MUST_NOT_OBSERVE: test green while verify exited 0 / reported 60/60

AC-2 Removed field/storage-ref disposition control has teeth
  GIVEN the coverage/verify entrypoint (catalog-3) + a catalog copy missing one storage-ref disposition (catalog_missing_storage — improvementImages.storageId)
  WHEN  the control drives `holo catalog:coverage`/`catalog:verify`
  THEN  asserts non-zero exit naming the unmapped field/storage ref, would FAIL if it passed
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  MUST_OBSERVE: test passes because coverage/verify exited ≠ 0 naming the surface (e.g. `improvementImages.storageId`) · MUST_NOT_OBSERVE: test green while it exited 0

AC-3 Variance≠0 control has teeth (flow_ref UC-DATA-05)
  GIVEN the `holo catalog:reconcile` entrypoint (catalog-2) + an export whose real count diverges from the catalog formula with no approved exception (export_variance)
  WHEN  the control drives `holo catalog:reconcile --dry-run`
  THEN  asserts non-zero exit naming the table + numeric variance, would FAIL if reconcile reported `variance: 0`
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  MUST_OBSERVE: test passes because `holo catalog:reconcile` exited ≠ 0 with `<table>: variance=Δ (unexplained)` · MUST_NOT_OBSERVE: test green while reconcile reported unexplained_variance 0

AC-4 Suite green on up-state, RED on absent/broken start (documented RED evidence)
  GIVEN the full negative-control suite
  WHEN  run against the up state (real catalog + fixture export + built `catalog:*` surface) then the absent/broken start (surface absent, entries deleted, variance introduced)
  THEN  up-state ⇒ passes; absent/broken start ⇒ targeted controls RED; no `*.skip` guards
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  MUST_OBSERVE: up-state run passes AND no `*.skip` on controls AND absent/broken-start run shows the controls failing · MUST_NOT_OBSERVE: any `it.skip`/`test.skip` on a negative control; a control that passes regardless of catalog/export state

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- tests/integration/catalog-negative-controls.test.ts (NEW — the three RED controls + the suite-teeth assertion)
- services/platform/tests/fixtures/export-sample/** (NEW — frozen fixture `convex export`: per-table `documents.jsonl` for a real-name subset incl. researchSessions/researchIterations/deepResearchSessions/deepResearchIterations/researchFindings/revenueValidationSessions/aiRoiSessions/competitiveAnalysisSessions/documentCounters/voiceCommands/improvementImages, plus `_storage/` blobs referenced by the 6 storage-bearing tables)
- services/platform/tests/fixtures/catalog-missing-voiceCommands.yaml (NEW — table entry removed)
- services/platform/tests/fixtures/catalog-missing-improvementImages-storage.yaml (NEW — storage-ref disposition removed)
- services/platform/tests/fixtures/export-variance/** (NEW — a table with N extra unexplained rows)
writeProhibited: services/platform/src/** (production/service code — RED tests + fixtures only), tests/integration/catalog-reconcile.test.ts (catalog-2), tests/integration/catalog-verify.test.ts (catalog-3), .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml (read-only — catalog-1 is the source of truth the copies derive from), convex/**, app/**

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:71,99 [PRIMARY PATTERN] — T-DATA-020 build-gate + T-DATA-016 reconciliation pass/fail signatures to assert
2. tests/integration/research-models.test.ts:1-44 — the repo's env-gated integration/live pattern (mirror the spawn-and-assert shape — but do NOT use `it.skip` to hide controls)
3. .spec/prds/mk6-migration/tasks/sprint-01-mastra-compat-lock-fleet-manifest/compat-4-red-tests-negative-controls.md — the negative-control task shape to mirror (would-fail-if per control, no skip-to-green, real entrypoints)
4. convex/schema.ts:762-1231,107 — the 6 real storage-bearing tables + `documentCounters` (the drop crutch) to ground the fixture export
5. services/platform/src/cli/holo.ts:1-60 — the real `holo` entrypoint + JSON result contract the controls spawn against (from compat-1)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- deleted-table control RED-with-teeth: `bun services/platform/src/cli/holo.ts catalog:verify --catalog services/platform/tests/fixtures/catalog-missing-voiceCommands.yaml; test $? -ne 0` → Exit 0 (control passes because verify exited non-zero) — and the test itself fails if verify reports 60/60
- missing-storage control: `CATALOG_IT=1 pnpm vitest run tests/integration/catalog-negative-controls.test.ts -t 'unmapped storage ref'` → Exit 0
- variance control: `CATALOG_IT=1 pnpm vitest run tests/integration/catalog-negative-controls.test.ts -t 'variance'` → Exit 0
- no skip guards: `! grep -REn 'it\.skip|test\.skip|describe\.skip' tests/integration/catalog-negative-controls.test.ts` → Exit 0
- RED evidence: captured run of the suite against the absent/broken start showing the three controls failing (before catalog-2/catalog-3 green)
- lint `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: each control asserts a concrete failure signature (named table/field/storage ref + numeric variance); no skip-to-green; no mocks of `@mastra/*`/catalog-loader/export-reader/filesystem; fixtures are real committed artifacts (a real `convex export` dir + tampered catalog copies), not view-injection; RED reproduced against the absent/broken start. Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: catalog-1 (the committed catalog the tampered copies derive from) · Blocks: catalog-2 (variance control it turns green), catalog-3 (unmapped/deleted + missing-storage controls it turns green), catalog-4 (the RED export-completeness controls the reviewer greps for `*.skip`) — RED-first bead: these controls exist and fail before catalog-2/catalog-3 turn them green

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "catalog-5",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": { "requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true },
  "fixtures": {
    "export_sample": { "description": "Frozen fixture `convex export` grounded in real convex/schema.ts table names + `_storage/` blobs for the 6 storage-bearing tables", "seed_method": "migration_fixture", "records": ["services/platform/tests/fixtures/export-sample/<table>/documents.jsonl (researchSessions/researchIterations/deepResearchSessions/deepResearchIterations/researchFindings/revenueValidationSessions/aiRoiSessions/competitiveAnalysisSessions/documentCounters/voiceCommands/improvementImages/...) + services/platform/tests/fixtures/export-sample/_storage/ blobs"] },
    "catalog_missing_table": { "description": "Copy of the committed catalog with the voiceCommands table entry removed", "seed_method": "migration_fixture", "records": ["services/platform/tests/fixtures/catalog-missing-voiceCommands.yaml"] },
    "catalog_missing_storage": { "description": "Copy of the committed catalog with the improvementImages.storageId disposition removed", "seed_method": "migration_fixture", "records": ["services/platform/tests/fixtures/catalog-missing-improvementImages-storage.yaml"] },
    "export_variance": { "description": "Fixture export where one table's real row count diverges from its catalog formula with no approved exception", "seed_method": "migration_fixture", "records": ["services/platform/tests/fixtures/export-variance/<table>/documents.jsonl with N extra unexplained rows"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null, "flow_ref": "UC-DATA-01",
      "description": "GIVEN `holo catalog:verify` + a catalog with a table entry removed, cross-checked against the real fixture export WHEN the control drives verify THEN it asserts non-zero exit naming the table and would FAIL if verify reported 60/60",
      "verify": "bun services/platform/src/cli/holo.ts catalog:verify --catalog services/platform/tests/fixtures/catalog-missing-voiceCommands.yaml; test $? -ne 0",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli",
        "negative_control": { "would_fail_if": ["verify passes with the entry gone (fails open)", "the export surface isn't cross-checked so the deletion goes unnoticed"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "catalog_missing_table", "action": { "actor": "cli_user", "steps": ["run the control test against the tampered catalog + fixture export"] },
          "end_state": { "must_observe": ["test passes because `holo catalog:verify` exited != 0 naming the removed table (voiceCommands)"], "must_not_observe": ["test green while verify exited 0 / reported 60/60"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the coverage/verify entrypoint + a catalog missing one storage-ref disposition WHEN the control drives it THEN it asserts non-zero exit naming the surface and would FAIL if it passed",
      "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-negative-controls.test.ts -t 'unmapped storage ref'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli",
        "negative_control": { "would_fail_if": ["coverage/verify accepts a surface with no disposition (fails open)"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "catalog_missing_storage", "action": { "actor": "cli_user", "steps": ["run the control test on coverage/verify against catalog-missing-improvementImages-storage.yaml"] },
          "end_state": { "must_observe": ["test passes because it exited != 0 naming improvementImages.storageId"], "must_not_observe": ["test green while it exited 0"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null, "flow_ref": "UC-DATA-05",
      "description": "GIVEN `holo catalog:reconcile` + an export whose real count diverges from the catalog formula with no approved exception WHEN the control drives reconcile THEN it asserts non-zero exit naming the table + numeric variance and would FAIL if reconcile reported variance 0",
      "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-negative-controls.test.ts -t 'variance'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli",
        "negative_control": { "would_fail_if": ["reconcile swallows the divergence and reports unexplained_variance 0"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "export_variance", "action": { "actor": "cli_user", "steps": ["run the control test on reconcile against export-variance"] },
          "end_state": { "must_observe": ["test passes because `holo catalog:reconcile` exited != 0 with <table>: variance=Δ (unexplained)"], "must_not_observe": ["test green while reconcile reported unexplained_variance 0"] } } ] } },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the full suite WHEN run against the up-state then the absent/broken start THEN up-state passes, absent/broken-start controls RED, no `*.skip` guards",
      "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-negative-controls.test.ts && ! grep -REn 'it\\.skip|test\\.skip|describe\\.skip' tests/integration/catalog-negative-controls.test.ts",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli",
        "negative_control": { "would_fail_if": ["any control is guarded by it.skip so it neither passes-with-teeth nor fails on an absent stack"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "export_sample", "action": { "actor": "cli_user", "steps": ["run the suite up-state; scan for skip; re-run against the absent/broken start"] },
          "end_state": { "must_observe": ["up-state run passes", "no `*.skip` guards on the negative controls", "absent/broken-start run shows the controls failing"], "must_not_observe": ["any it.skip/test.skip on a negative control", "a control that passes regardless of catalog/export state"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "deleted-table control passes only because `holo catalog:verify` exited non-zero naming the removed table", "verify": "bun services/platform/src/cli/holo.ts catalog:verify --catalog services/platform/tests/fixtures/catalog-missing-voiceCommands.yaml; test $? -ne 0" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "missing-storage control passes only because `holo catalog:coverage`/`verify` exited non-zero naming improvementImages.storageId", "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-negative-controls.test.ts -t 'unmapped storage ref'" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "variance control passes only because `holo catalog:reconcile` exited non-zero with a named table + numeric unexplained variance", "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-negative-controls.test.ts -t 'variance'" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "suite passes on the up-state and carries no `*.skip` guards on negative controls", "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-negative-controls.test.ts && ! grep -REn 'it\\.skip|test\\.skip|describe\\.skip' tests/integration/catalog-negative-controls.test.ts" }
  ]
}
-->
