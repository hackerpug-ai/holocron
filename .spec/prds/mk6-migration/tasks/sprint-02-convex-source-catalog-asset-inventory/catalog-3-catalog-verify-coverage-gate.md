# catalog-3 — `holo catalog:verify` coverage tool + build-gate

## What this does
Adds the coverage build-gate for the source catalog: `holo catalog:verify` exits 0 only when all 60 legacy tables and every field and every storage reference carry one approved disposition (`preserve`/`merge`/`drop`/`regenerate`/`archive`) with a target and an approval, and exits non-zero naming any unmapped surface. `holo catalog:coverage` prints the per-field/per-storage-ref mapping with owner + approval; `holo catalog:merges` proves the business 12→3 (`analysis_*`) and research 5→3 (`research_*`, `system` discriminator) collapses with no per-domain shell relations surviving in the targets.

## Why
This is the T-DATA-020 build-gate that makes "no source surface silently dropped" enforceable in CI (UC-DATA-01). Sprint 04's Postgres schema is validated against exactly these approved dispositions and merges; without a gate that fails closed the instant a table, field, or storage ref goes unmapped, an entire legacy surface can vanish unnoticed and the schema built on a lie.

## How to verify
`CATALOG_IT=1 pnpm vitest run tests/integration/catalog-verify.test.ts` against the frozen fixture `convex export` + the committed `12-convex-source-catalog.yaml` → exit 0, `tables: 60/60 approved`, `storage refs: 6/6 approved`, every field mapped. Then delete one table's entry (or one storage-ref disposition) from a catalog copy → `holo catalog:verify` exits non-zero naming that exact surface.

## Scope
Creates `services/platform/src/catalog/{verify,coverage,merges}.ts`, registers `catalog:verify` + `catalog:coverage` + `catalog:merges` in `services/platform/src/cli/holo.ts`, and creates `tests/integration/catalog-verify.test.ts`. Reuses the shared `export-reader.ts`/`catalog-loader.ts` from catalog-2 (read-only) and the fixtures + negative controls from catalog-5. Does NOT author reconcile/assets (catalog-2), the RED controls (catalog-5), or touch `convex/**`, `app/**`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: catalog-3 — `holo catalog:verify` coverage tool + build-gate
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (120 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes
SPRINT:     [Sprint 2 — Convex Source Catalog and Asset Inventory](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      pnpm test        (vitest; single file: pnpm vitest run <path>)
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
`bun services/platform/src/cli/holo.ts catalog:verify` exits 0 when — cross-checked against a real `convex export`'s actual surface — all 60 legacy tables, every field, and every storage reference carry one approved disposition with a target and an approval, and exits non-zero naming the exact unmapped table/field/storage ref otherwise; `holo catalog:coverage` prints the per-field + per-storage-ref mapping with owner + approval; `holo catalog:merges` reports the business 12→3 and research 5→3 collapses and asserts zero surviving per-domain shell relations in the targets.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST cross-check the catalog against the REAL export's actual surface (tables + fields + `_storage` refs enumerated from the export), not a self-referential list of the catalog's own keys — a catalog that omits a table the export contains MUST fail.
- MUST require, per surface, a disposition ∈ {preserve, merge, drop, regenerate, archive} with a non-empty target (where applicable), owner, and approval id; a missing disposition, blank owner, or blank approval is an unmapped surface.
- `catalog:verify` exit code is the gate: 0 iff 60/60 tables + every field + every storage ref approved; non-zero MUST name the offending surface(s).
- `catalog:merges` MUST prove NO per-domain shell relation survives (e.g. no `revenue_validation_*`/`competitive_analysis_*`/`ai_roi_*`/`deep_research_*` target table) — the 4 business pipelines collapse to `analysis_sessions`/`analysis_items`/`analysis_evidence`, the 2 research systems to the `research_*` trio.
- NEVER pass a `60/60` when a surface is unmapped; NEVER report coverage at table granularity while claiming field coverage; NEVER let a blank owner/approval through; NEVER `z.any()`.
- STRICTLY Mastra 1.x subpath imports; extends `services/platform` (compat-1); reuses the shared catalog-loader/export-reader read-only; modifies only SCOPE.writeAllowed files.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): `catalog:verify` on real export + complete catalog ⇒ exit 0, 60/60 tables + 6/6 storage refs + every field approved
- [x] AC-2: `catalog:coverage` prints per-field + per-storage-ref mapping each with a non-empty owner + approval
- [x] AC-3: `catalog:merges` shows business 12→3 + research 5→3 with zero surviving per-domain shell targets
- [x] AC-4: a deleted table entry / missing storage-ref disposition ⇒ `catalog:verify` exits non-zero naming that exact surface
- [ ] catalog-5's `tests/integration/catalog-negative-controls.test.ts` unmapped-table + deleted-entry controls go GREEN against this implementation
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean; only SCOPE.writeAllowed files modified

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED against the absent `catalog:verify`/`coverage`/`merges` commands first)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Coverage gate passes at 60/60 against a real export (flow_ref UC-DATA-01)
  GIVEN the complete committed catalog (real_catalog) + the frozen fixture export (export_sample)
  WHEN  `bun services/platform/src/cli/holo.ts catalog:verify --json` runs
  THEN  exit 0 with `tables: 60/60 approved`, `storage refs: 6/6 approved`, every field mapped, each disposition ∈ the approved vocab
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: real_catalog+export_sample · evidence: stdout
    NEGATIVE_CONTROL: would fail if the table total is hard-coded, the catalog isn't parsed, or the export surface isn't cross-checked (a catalog missing a table the export has would falsely pass)
    MUST_OBSERVE: exit 0; `tables: 60/60 approved`; `storage refs: 6/6 approved`; a per-table disposition each ∈ {preserve,merge,drop,regenerate,archive}
    MUST_NOT_OBSERVE: a `60/60` with no per-table check; a table/field with no disposition passing; exit 0 while any field or storage ref is unmapped; a self-referential count of catalog keys

AC-2 Field- and storage-level coverage carries owner + approval
  GIVEN real_catalog + export_sample
  WHEN  `holo catalog:coverage --json` runs
  THEN  every field and every storage ref maps to a disposition with a non-empty owner and approval id
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  MUST_OBSERVE: per-field rows e.g. `conversations.title → preserve owner=<name> approval=<id>`; all 6 storage refs present with owner+approval · MUST_NOT_OBSERVE: a field with empty owner/approval passing; coverage reported at table granularity only; a storage ref missing from the report

AC-3 Merge collapse proven with no per-domain shells
  GIVEN real_catalog's merge dispositions
  WHEN  `holo catalog:merges --json` runs
  THEN  business 12→3 (`analysis_sessions`/`analysis_items`/`analysis_evidence`) and research 5→3 (`research_*`, `system` discriminator) are reported, and zero per-domain shell relations survive in the targets
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  MUST_OBSERVE: `business: 12 → 3 (analysis_sessions, analysis_items, analysis_evidence)`; `research: 5 → 3 (system discriminator)`; `per_domain_shell_targets: 0` · MUST_NOT_OBSERVE: a surviving `revenue_validation_*`/`competitive_analysis_*`/`ai_roi_*`/`deep_research_*` target; a 12→12 pass-through; research collapsed without a `system` discriminator

AC-4 [ERROR] Unmapped surface fails closed
  GIVEN a catalog copy with one table entry removed (catalog_missing_table) or one storage-ref disposition removed (catalog_missing_storage), cross-checked against export_sample
  WHEN  `holo catalog:verify` runs
  THEN  exits non-zero naming that exact unmapped table/storage ref
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  MUST_OBSERVE: exit ≠ 0; the removed surface named e.g. `unmapped table: voiceCommands` / `unmapped storage ref: improvementImages.storageId` · MUST_NOT_OBSERVE: exit 0; a generic "some tables unmapped" with no name; the missing surface silently passing

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/catalog/verify.ts (NEW), services/platform/src/catalog/coverage.ts (NEW), services/platform/src/catalog/merges.ts (NEW)
- services/platform/src/cli/holo.ts (MODIFY — register `catalog:verify` + `catalog:coverage` + `catalog:merges`)
- tests/integration/catalog-verify.test.ts (NEW — happy 60/60 verify + coverage owner/approval + merges 12→3/5→3)
writeProhibited: services/platform/src/catalog/{export-reader,catalog-loader,reconcile,assets}.ts (catalog-2 — read/import only, do NOT edit), tests/integration/catalog-reconcile.test.ts (catalog-2), tests/integration/catalog-negative-controls.test.ts + services/platform/tests/fixtures/** (catalog-5, read-only), .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml (read-only — catalog-1), convex/**, app/**, holocron-mcp/**

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:71 [PRIMARY PATTERN] — T-DATA-020 build-gate signature (every table/field/storage ref has approved disposition/target; no unmapped loss)
2. .spec/prds/mk6-migration/05-uc-data.md:22-29 — UC-DATA-01 AC (business 12→3 analysis_* trio, research 5→3 with system discriminator, no per-domain shells; every surface one approved disposition)
3. .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md:11-16 — Convex source catalog contract (entry fields: disposition/target/owner/approval; no silent drop)
4. convex/schema.ts:1-1520 — the 60 real tables + 6 storage refs the gate counts coverage against (documentCounters is the drop crutch)
5. services/platform/src/catalog/catalog-loader.ts + export-reader.ts — the shared loaders from catalog-2 to import (do NOT re-implement)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- verify green at 60/60: `CATALOG_IT=1 pnpm vitest run tests/integration/catalog-verify.test.ts -t '60/60'` → Exit 0 (captured `tables: 60/60 approved`, not merely "Exit 0")
- coverage owner+approval: `CATALOG_IT=1 pnpm vitest run tests/integration/catalog-verify.test.ts -t 'owner and approval'` → Exit 0
- merges no-shells: `CATALOG_IT=1 pnpm vitest run tests/integration/catalog-verify.test.ts -t 'no per-domain shells'` → Exit 0
- deleted-entry fails closed: `bun services/platform/src/cli/holo.ts catalog:verify --catalog services/platform/tests/fixtures/catalog-missing-voiceCommands.yaml; test $? -ne 0` → Exit 0
- catalog-5's unmapped/deleted controls go green here: `CATALOG_IT=1 pnpm vitest run tests/integration/catalog-negative-controls.test.ts -t 'unmapped|deleted'` → Exit 0
- root typecheck `pnpm tsgo --noEmit` → Exit 0 · lint `pnpm biome check .` → Exit 0
- Gate 8 (un-fakeable PRIMARY): AC-1 was watched RED against the absent `catalog:verify` command (and against a catalog with a table deleted) before green; captured stdout shows the real 60/60 tally + a real named failure, not a bare "60/60"

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: one integration test per AC driving the real `holo catalog:*` surface; RED evidence present; coverage cross-checks the export's actual surface (grep — not a self-referential key count); owner/approval enforced non-empty; merges assert zero per-domain shells; verify fails closed naming the surface; SCOPE respected (shared loaders imported, not edited). Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: catalog-1 (the committed catalog), catalog-5 (the RED-first negative-control suite + fixtures this turns green), catalog-2 (the shared `export-reader.ts`/`catalog-loader.ts` this imports) · Blocks: catalog-4 (real-export review of the verify/coverage/merges gate)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "catalog-3",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": { "requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true },
  "fixtures": {
    "real_catalog": { "description": "The complete committed source catalog authored in catalog-1 (60/60 tables + fields + 6 storage refs)", "seed_method": "migration_fixture", "records": [".spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml"] },
    "export_sample": { "description": "Frozen fixture `convex export` (real table names + `_storage/` refs), authored by catalog-5 — the actual surface coverage is cross-checked against", "seed_method": "migration_fixture", "records": ["services/platform/tests/fixtures/export-sample/**"] },
    "catalog_missing_table": { "description": "Catalog copy with the voiceCommands entry removed", "seed_method": "migration_fixture", "records": ["services/platform/tests/fixtures/catalog-missing-voiceCommands.yaml"] },
    "catalog_missing_storage": { "description": "Catalog copy with the improvementImages.storageId disposition removed", "seed_method": "migration_fixture", "records": ["services/platform/tests/fixtures/catalog-missing-improvementImages-storage.yaml"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null, "flow_ref": "UC-DATA-01",
      "description": "GIVEN the complete catalog + real export WHEN `holo catalog:verify --json` runs THEN exit 0 with tables 60/60 approved, storage refs 6/6 approved, every field mapped",
      "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-verify.test.ts -t '60/60'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli",
        "negative_control": { "would_fail_if": ["table total hard-coded", "catalog not parsed", "export surface not cross-checked so a catalog missing a table the export has falsely passes"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "real_catalog+export_sample", "action": { "actor": "cli_user", "steps": ["bun services/platform/src/cli/holo.ts catalog:verify --json"] },
          "end_state": { "must_observe": ["exit 0", "tables: 60/60 approved", "storage refs: 6/6 approved", "each disposition in {preserve,merge,drop,regenerate,archive}"], "must_not_observe": ["a 60/60 with no per-table check", "a table/field with no disposition passing", "exit 0 while any field or storage ref is unmapped", "a self-referential count of catalog keys"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN real_catalog + export WHEN `holo catalog:coverage --json` runs THEN every field and storage ref maps to a disposition with a non-empty owner + approval",
      "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-verify.test.ts -t 'owner and approval'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli",
        "negative_control": { "would_fail_if": ["coverage reported at table granularity only", "a blank owner/approval passes"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "real_catalog+export_sample", "action": { "actor": "cli_user", "steps": ["holo catalog:coverage --json"] },
          "end_state": { "must_observe": ["per-field rows e.g. conversations.title → preserve owner=<name> approval=<id>", "all 6 storage refs present with owner+approval"], "must_not_observe": ["a field with empty owner/approval passing", "coverage at table granularity only", "a storage ref missing from the report"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the catalog merge dispositions WHEN `holo catalog:merges --json` runs THEN business 12→3 analysis_* and research 5→3 research_* (system discriminator) are reported with zero surviving per-domain shell targets",
      "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-verify.test.ts -t 'no per-domain shells'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli",
        "negative_control": { "would_fail_if": ["a per-domain shell target survives", "merges left as 12→12 pass-through", "research collapsed without a system discriminator"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "real_catalog", "action": { "actor": "cli_user", "steps": ["holo catalog:merges --json"] },
          "end_state": { "must_observe": ["business: 12 → 3 (analysis_sessions, analysis_items, analysis_evidence)", "research: 5 → 3 (system discriminator)", "per_domain_shell_targets: 0"], "must_not_observe": ["a surviving revenue_validation_*/competitive_analysis_*/ai_roi_*/deep_research_* target", "a 12→12 pass-through", "research collapsed without a system discriminator"] } } ] } },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN a catalog copy with a table entry or storage-ref disposition removed, cross-checked against the export WHEN `holo catalog:verify` runs THEN it exits non-zero naming that exact surface",
      "verify": "bun services/platform/src/cli/holo.ts catalog:verify --catalog services/platform/tests/fixtures/catalog-missing-voiceCommands.yaml; test $? -ne 0",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli",
        "negative_control": { "would_fail_if": ["verify passes with the entry gone (fails open)"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "catalog_missing_table", "action": { "actor": "cli_user", "steps": ["holo catalog:verify against catalog-missing-voiceCommands.yaml (and catalog-missing-improvementImages-storage.yaml)"] },
          "end_state": { "must_observe": ["exit != 0", "the removed surface named e.g. unmapped table: voiceCommands / unmapped storage ref: improvementImages.storageId"], "must_not_observe": ["exit 0", "a generic 'some tables unmapped' with no name", "the missing surface silently passing"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "catalog-verify test spawns real `holo catalog:verify` vs the real catalog + fixture export and asserts exit 0 with tables 60/60 + storage 6/6 approved", "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-verify.test.ts -t '60/60'" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "test asserts `catalog:coverage` emits per-field + per-storage-ref rows each with a non-empty owner and approval", "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-verify.test.ts -t 'owner and approval'" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "test asserts `catalog:merges` reports 12→3 + 5→3 and per_domain_shell_targets:0", "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-verify.test.ts -t 'no per-domain shells'" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "against a catalog with a deleted table/storage entry `holo catalog:verify` exits non-zero naming the surface", "verify": "bun services/platform/src/cli/holo.ts catalog:verify --catalog services/platform/tests/fixtures/catalog-missing-voiceCommands.yaml; test $? -ne 0" }
  ]
}
-->
</details>
