# catalog-4 — Verify export completeness against the real convex export

## What this does
Adversarially verifies that the committed `12-convex-source-catalog.yaml` actually covers **everything a real `convex export` emits** — not just the 60 tables that `convex/schema.ts` declares. The reviewer produces a real `convex export --include-file-storage`, enumerates every table directory it emits plus system tables (`_storage`, and any `_scheduled_functions`/system state present), confirms each maps to a catalog entry or a versioned exclusion (zero export tables unaccounted), reconciles per-table real row counts against the catalog's expected-target formulas at zero unexplained variance (T-DATA-016), and confirms every retained `_storage` object appears in the asset inventory with SHA-256/byte-length/MIME. Approval is granted only on reproduced real-export evidence.

## Why
catalog-1 proves the catalog covers the *design* surface (schema.ts). This task closes the gap between the design and **reality**: a table with data but silently missing from the catalog, an export directory the schema no longer reflects, a `_storage` object with no inventory line, or a merge whose expected count ignores a source — all pass a schema-only check and fail here. Per the project's Subagent-Awareness and anti-stub rules, an implementer's "the catalog lists 60 tables" is not evidence; this is the last line of defense before the Sprint 2 gate and the contract Sprint 14's ETL reconciles to.

## How to verify
Reviewer runs `npx convex export --include-file-storage` then `holo catalog:verify --export <dir>` (60/60 approved + 0 export tables unaccounted), `holo catalog:reconcile --export <dir>` (per-table variance = 0, merge sums correct), and `holo catalog:assets --export <dir>` (inventory count === export `_storage/` retained-file count, a sampled SHA-256 matches readback) — then removes one entry and confirms `catalog:verify --export` exits non-zero with no `*.skip` on the drift controls.

## Scope
Review/verification only — makes NO edits to the catalog, tool, or source; emits a structured verdict + reproduced-evidence list as the agent message.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: catalog-4 — Verify export completeness against the real convex export
================================================================================

TASK_TYPE:  FEATURE  (real-export verification)
STATUS:     Complete
PRIORITY:   P0
EFFORT:     M  (150 min)
AGENT:      implementer=convex-reviewer | reviewer=convex-reviewer
PROPOSED-BY: convex-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no   (verification; reproduces real-export evidence — seeded-evidence required)
CAPABILITY: CAP-MIG-01 (the reconciliation the ETL must satisfy — verified against a real export)
SPRINT:     [Sprint 2 — Convex Source Catalog and Asset Inventory](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      pnpm test        (vitest; single file: pnpm vitest run <path>)
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
A structured verdict recording that a REAL `convex export --include-file-storage` was produced; every table/directory it emits (data tables + `_storage` + any system state) maps to a catalog entry or a versioned exclusion with zero export tables unaccounted; per-table real row counts reconcile against the catalog's expected-target formulas with zero unexplained variance (merge sums included); every retained `_storage` object is inventoried with SHA-256/byte-length/MIME and a sampled readback matches; and the drift control (remove one entry → non-zero) reproduces with no `*.skip` guards — or an itemized blocking-findings list.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST run a REAL `convex export --include-file-storage` (a live deployment snapshot — dev IS production here) and verify against ITS contents; NEVER a hand-authored fixture that merely mirrors `schema.ts` (that defeats the purpose — the whole point is catching export/schema drift).
- MUST enumerate EVERY directory/table the export emits (each `<table>/documents.jsonl`, `_storage/`, `_tables/documents.jsonl`, and any system table present) and confirm each maps to a catalog entry OR a versioned exclusion; zero export tables unaccounted.
- MUST reconcile per-table source row counts from the real export against the catalog's expected-target formulas at zero unexplained variance — including merge sums (`analysis_sessions` expected = revenueValidationSessions + competitiveAnalysisSessions + aiRoiSessions + flightsSessions counts; `research_sessions` expected = researchSessions + deepResearchSessions counts) and approved drop/regenerate exceptions.
- MUST confirm every retained `_storage` object in the export appears in the asset inventory with legacy-ID/SHA-256/byte-length/MIME; a sampled object's SHA-256 recomputed from the export bytes MUST match the inventory value.
- MUST reproduce the drift control: with one entry removed (or an unmapped export table injected) `catalog:verify --export` exits non-zero naming the unaccounted table, and no completeness control is `*.skip`-guarded.
- NEVER approve on "the catalog lists 60 tables" / "tests pass" alone; NEVER accept a synthetic/stubbed export or a zero-object asset inventory against a non-empty `_storage/`; NEVER relay an implementer's "that table isn't in the export / out of scope" without inspecting the export directory yourself.
- STRICTLY review-only: emit a structured verdict + reproduced-evidence list; make NO edits to the catalog, tool, or source.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): real `convex export` produced; `catalog:verify --export` reports 60/60 approved + 0 export tables unaccounted (incl. `_storage`/system tables)
- [x] AC-2: `catalog:reconcile --export` reports zero unexplained variance across all tables; merge sums correct
- [x] AC-3: asset inventory count === export `_storage/` retained-file count; a sampled SHA-256 matches recomputed readback; temporary objects excluded with a drop disposition
- [x] AC-4 (negative control): removing one entry flips `catalog:verify --export` non-zero naming the table; no `*.skip` on the drift controls
- [x] structured verdict emitted with a reproduced-evidence list (export table count, `_storage` object count, variance=0, drift non-zero)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Real-export completeness — every emitted table is accounted for by the catalog
  GIVEN a real `convex export --include-file-storage` (real_export), the committed catalog (catalog_committed), and the verify tool (full_stack)
  WHEN  the reviewer produces the export and runs `bun services/platform/src/cli/holo.ts catalog:verify --export "$CONVEX_EXPORT_DIR"`
  THEN  exit 0, "60/60 tables approved" AND "0 export tables unaccounted"; every emitted directory — including `_storage` and any system table — maps to an entry or a versioned exclusion
  TEST_TIER: integration · VERIFICATION_SERVICE: convex-export · FLOW_REF: UC-DATA-05 · TDD_STATE: none
  SCENARIO — start_ref: real_export+catalog_committed · evidence: stdout
    NEGATIVE_CONTROL: would fail if the export is replaced by a schema-mirroring stub / verify is run without --export (schema-only) / a `_storage` or system table is silently ignored / an emitted table with no catalog entry passes
    MUST_OBSERVE: verify exit 0, "60/60 tables approved" + "0 export tables unaccounted", `_storage` (and any system table emitted) each carry an approved disposition/exclusion, the export dir holds real `<table>/documents.jsonl` with real rows + a real `_storage/`
    MUST_NOT_OBSERVE: an emitted table/directory with no catalog entry passing, verify exit 0 while a table is unaccounted, a synthetic export (empty/absent `_storage/`), a "looks complete" line with no per-table accounting

AC-2 Reconciliation — zero unexplained variance against the real export
  GIVEN the real export (real_export) + the committed catalog + the reconciliation report (asset_inventory)
  WHEN  the reviewer runs `bun services/platform/src/cli/holo.ts catalog:reconcile --export "$CONVEX_EXPORT_DIR"`
  THEN  each table's real row count matches its catalog expected-target formula (merge sums + approved drop/regenerate exceptions applied); total unexplained variance = 0
  TEST_TIER: integration · VERIFICATION_SERVICE: convex-export · FLOW_REF: UC-DATA-05
  MUST_OBSERVE: reconcile reports per-table source_count + expected_target + variance=0 across all 60; `analysis_sessions` expected === sum of the 4 business `*Sessions` counts; `research_sessions` expected === researchSessions + deepResearchSessions counts
  MUST_NOT_OBSERVE: any table with variance≠0 unexplained, a merge target whose expected count ignores a source, reconcile skipping tables, a hard-coded "variance: 0"

AC-3 Asset-inventory completeness against the export's `_storage/`
  GIVEN the real export with `_storage/` files (real_export) + the asset inventory (asset_inventory)
  WHEN  the reviewer runs `bun services/platform/src/cli/holo.ts catalog:assets --export "$CONVEX_EXPORT_DIR"` and cross-checks against the export `_storage/` files
  THEN  every retained `_storage` object has a legacy-ID/SHA-256/byte-length/MIME/target/disposition line; the inventory's retained-object count === the export `_storage/` retained-file count; a sampled object's SHA-256 recomputed from export bytes matches the inventory; temporary objects (`audioTranscriptJobs.audioStorageId`) are excluded with a drop disposition
  TEST_TIER: integration · VERIFICATION_SERVICE: convex-export · FLOW_REF: UC-DATA-05
  MUST_OBSERVE: inventoried retained-object count === export `_storage/` retained-file count; `shasum -a 256` of a sampled `_storage/<id>` === the inventory's SHA-256 for that legacy-ID; MIME + byte-length present per object
  MUST_NOT_OBSERVE: a `_storage` object in the export missing from the inventory, a zero-object inventory against a non-empty `_storage/`, a fabricated SHA that doesn't match readback

AC-4 Drift teeth — an unaccounted export table is caught, controls have teeth (reproduced non-zero)
  GIVEN the real export + the committed catalog with exactly one entry removed (drift_case) + the catalog-5 suite
  WHEN  the reviewer runs `catalog:verify --export "$CONVEX_EXPORT_DIR"` and greps the suite for skip guards
  THEN  verify exits non-zero naming the unaccounted table AND no `it.skip`/`test.skip`/`describe.skip` guards the completeness controls
  TEST_TIER: integration · VERIFICATION_SERVICE: convex-export
  MUST_OBSERVE: verify exit != 0 naming the removed/extra table, grep finds no `*.skip` on the export-completeness controls
  MUST_NOT_OBSERVE: exit 0 with an unaccounted export table, any `*.skip` on a drift control

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- (none — review/verification is read-only; the verdict + reproduced-evidence list is returned as the agent message)
writeProhibited: .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml, services/platform/**, tests/**, convex/**, app/**, any source file

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md:11-16,29-31 [PRIMARY PATTERN] — the completeness + reconciliation + asset-inventory contract under verification
2. .spec/prds/mk6-migration/05-uc-data.md:68-77 — UC-DATA-05 AC-1 (load a full `convex export` with source-catalog-derived reconciliation, zero unexplained variance) — the PRIMARY flow_ref
3. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:99 — T-DATA-016 (catalog-derived reconciliation, zero unexplained variance) — the row to reproduce
4. convex/schema.ts:1-1517 — the 60-table baseline to diff the export directory listing against (catch schema/export drift both ways)
5. convex/schema.ts:766,814,856,902,1211,1231 + convex/audioTranscripts/scheduled.ts:117-167 — the 5 retained `_storage` fields vs the temporary/deleted `audioTranscriptJobs.audioStorageId` to confirm in the export's `_storage/`
6. .spec/prds/mk6-migration/tasks/sprint-02-convex-source-catalog-asset-inventory/catalog-1-*.md — the artifact this task verifies (dispositions, merges, expected-target formulas)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- produce a real export: `npx convex export --include-file-storage --path "$CONVEX_EXPORT_ZIP" && unzip -o "$CONVEX_EXPORT_ZIP" -d "$CONVEX_EXPORT_DIR" && ls "$CONVEX_EXPORT_DIR"` → real per-table `documents.jsonl` + non-empty `_storage/`
- completeness: `bun services/platform/src/cli/holo.ts catalog:verify --export "$CONVEX_EXPORT_DIR"` → Exit 0, "60/60 tables approved" + "0 export tables unaccounted"
- reconciliation zero-variance: `bun services/platform/src/cli/holo.ts catalog:reconcile --export "$CONVEX_EXPORT_DIR"` → Exit 0, total unexplained variance = 0
- asset integrity: `bun services/platform/src/cli/holo.ts catalog:assets --export "$CONVEX_EXPORT_DIR"` → inventoried retained count === `find "$CONVEX_EXPORT_DIR/_storage" -type f | wc -l` (retained subset); `shasum -a 256 "$CONVEX_EXPORT_DIR/_storage/<sampled-id>"` matches the inventory SHA
- drift teeth + no skips: `cp "$CATALOG" /tmp/c.bak; <remove one entry>; bun services/platform/src/cli/holo.ts catalog:verify --export "$CONVEX_EXPORT_DIR"; rc=$?; cp /tmp/c.bak "$CATALOG"; test $rc -ne 0 && ! grep -REn 'it\.skip|test\.skip|describe\.skip' tests/integration/catalog-coverage.test.ts` → Exit 0
- Gate 8 (un-fakeable PRIMARY): AC-1's "0 unaccounted" was reproduced against a REAL export whose directory listing was inspected by hand (not a schema-mirror), and the drift control was watched flipping non-zero — captured stdout shows the export table count + `_storage` object count, not merely "Exit 0".

--------------------------------------------------------------------------------
REVIEW (verdict shape)
--------------------------------------------------------------------------------
{ approved: boolean, blocking_findings: [], evidence_reproduced: ["real convex export produced (N tables, M _storage objects)", "60/60 approved + 0 export tables unaccounted", "reconcile unexplained variance = 0 (merge sums verified)", "asset inventory count === export _storage retained count; sampled SHA-256 matches readback", "drift control: removed entry → verify non-zero, no *.skip", ...] }

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: catalog-1 (the committed catalog), catalog-2 (asset inventory + reconciliation report), catalog-3 (the `holo catalog:*` tool), catalog-5 (the RED suite) · Blocks: (Sprint 2 gate)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "catalog-4",
  "proposed_by": "convex-planner",
  "tdd_mode": "skipped",
  "verification_policy": { "requires_tests": false, "requires_red_evidence": false, "requires_seeded_evidence": true },
  "fixtures": {
    "real_export": { "description": "A REAL `convex export --include-file-storage` snapshot unzipped to $CONVEX_EXPORT_DIR — a live deployment snapshot (dev IS production here), NOT a schema-mirroring fixture", "seed_method": "cli", "records": ["npx convex export --include-file-storage --path \"$CONVEX_EXPORT_ZIP\"", "unzip -o \"$CONVEX_EXPORT_ZIP\" -d \"$CONVEX_EXPORT_DIR\"; ls shows <table>/documents.jsonl + non-empty _storage/ + _tables/documents.jsonl"] },
    "catalog_committed": { "description": "The committed catalog from catalog-1", "seed_method": "file", "records": [".spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml"] },
    "asset_inventory": { "description": "The asset inventory + reconciliation report from catalog-2", "seed_method": "cli", "records": ["bun services/platform/src/cli/holo.ts catalog:assets --export \"$CONVEX_EXPORT_DIR\"", "bun services/platform/src/cli/holo.ts catalog:reconcile --export \"$CONVEX_EXPORT_DIR\""] },
    "full_stack": { "description": "The holo catalog:* tool (catalog-3) + the catalog-5 suite", "seed_method": "cli", "records": ["bun services/platform/src/cli/holo.ts catalog:verify --export \"$CONVEX_EXPORT_DIR\" available; tests/integration/catalog-coverage.test.ts present"] },
    "drift_case": { "description": "Negative control: the committed catalog with exactly one table entry removed", "seed_method": "cli", "records": ["cp catalog catalog.bak; delete one table entry (e.g. citations); restore after"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null,
      "description": "GIVEN a real convex export + the committed catalog WHEN the reviewer runs `catalog:verify --export` THEN exit 0 with 60/60 approved AND 0 export tables unaccounted (incl. _storage/system tables)",
      "verify": "bun services/platform/src/cli/holo.ts catalog:verify --export \"$CONVEX_EXPORT_DIR\"",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "convex-export", "flow_ref": "UC-DATA-05",
        "negative_control": { "would_fail_if": ["the export is replaced by a schema-mirroring stub", "verify is run without --export (schema-only)", "a _storage or system table is silently ignored", "an emitted table with no catalog entry passes"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "real_export", "action": { "actor": "cli_user", "steps": ["npx convex export --include-file-storage; bun services/platform/src/cli/holo.ts catalog:verify --export \"$CONVEX_EXPORT_DIR\""] },
          "end_state": { "must_observe": ["verify exit 0", "60/60 tables approved", "0 export tables unaccounted", "_storage (and any system table emitted) carries an approved disposition/exclusion", "export dir holds real <table>/documents.jsonl + real _storage/"], "must_not_observe": ["an emitted table/directory with no catalog entry passing", "verify exit 0 while a table is unaccounted", "a synthetic export (empty/absent _storage/)", "a 'looks complete' line with no per-table accounting"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the real export + catalog WHEN the reviewer runs `catalog:reconcile --export` THEN per-table real counts match the expected-target formulas (merge sums applied) with zero unexplained variance",
      "verify": "bun services/platform/src/cli/holo.ts catalog:reconcile --export \"$CONVEX_EXPORT_DIR\"",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "convex-export", "flow_ref": "UC-DATA-05",
        "negative_control": { "would_fail_if": ["any table has variance≠0 unexplained", "a merge target's expected count ignores a source", "reconcile skips tables", "a hard-coded variance:0"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "real_export", "action": { "actor": "cli_user", "steps": ["bun services/platform/src/cli/holo.ts catalog:reconcile --export \"$CONVEX_EXPORT_DIR\""] },
          "end_state": { "must_observe": ["per-table source_count + expected_target + variance=0 across all 60", "analysis_sessions expected === sum of the 4 business *Sessions counts", "research_sessions expected === researchSessions + deepResearchSessions counts"], "must_not_observe": ["any table with variance≠0 unexplained", "a merge target whose expected count ignores a source", "reconcile skipping tables", "a hard-coded variance:0"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the export's _storage/ + the asset inventory WHEN the reviewer runs `catalog:assets --export` and cross-checks THEN inventory retained count === export _storage retained count, a sampled SHA-256 matches readback, temporary objects are drop-excluded",
      "verify": "bun services/platform/src/cli/holo.ts catalog:assets --export \"$CONVEX_EXPORT_DIR\"",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "convex-export", "flow_ref": "UC-DATA-05",
        "negative_control": { "would_fail_if": ["a _storage object in the export is missing from the inventory", "a zero-object inventory against a non-empty _storage/", "a fabricated SHA that doesn't match readback"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "real_export", "action": { "actor": "cli_user", "steps": ["bun services/platform/src/cli/holo.ts catalog:assets --export \"$CONVEX_EXPORT_DIR\"; shasum -a 256 a sampled _storage/<id>; compare to inventory"] },
          "end_state": { "must_observe": ["inventoried retained-object count === export _storage/ retained-file count", "shasum -a 256 of a sampled object === the inventory SHA-256 for that legacy-ID", "MIME + byte-length present per object", "audioTranscriptJobs.audioStorageId temporary objects excluded with a drop disposition"], "must_not_observe": ["a _storage object in the export missing from the inventory", "a zero-object inventory against a non-empty _storage/", "a fabricated SHA that doesn't match readback"] } } ] } },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the real export + a catalog with one entry removed WHEN `catalog:verify --export` runs and the suite is grepped THEN verify exits non-zero naming the unaccounted table and no control is *.skip-guarded",
      "verify": "cp \"$CATALOG\" /tmp/c.bak; sed -i '' '/^  citations:/d' \"$CATALOG\" 2>/dev/null; bun services/platform/src/cli/holo.ts catalog:verify --export \"$CONVEX_EXPORT_DIR\"; rc=$?; cp /tmp/c.bak \"$CATALOG\"; test $rc -ne 0 && ! grep -REn 'it\\.skip|test\\.skip|describe\\.skip' tests/integration/catalog-coverage.test.ts",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "convex-export",
        "negative_control": { "would_fail_if": ["verify exits 0 with an unaccounted export table", "a drift control is *.skip-guarded"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "drift_case", "action": { "actor": "cli_user", "steps": ["remove one entry; run catalog:verify --export; grep the suite for *.skip; restore"] },
          "end_state": { "must_observe": ["verify exit != 0 naming the removed/extra table", "grep finds no *.skip on the export-completeness controls"], "must_not_observe": ["exit 0 with an unaccounted export table", "any *.skip on a drift control"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "reviewer produces a real convex export and reproduces catalog:verify --export → 60/60 approved + 0 export tables unaccounted (inspecting the export directory listing by hand)", "verify": "bun services/platform/src/cli/holo.ts catalog:verify --export \"$CONVEX_EXPORT_DIR\"" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "reviewer reproduces catalog:reconcile --export → zero unexplained variance with merge sums verified against real counts", "verify": "bun services/platform/src/cli/holo.ts catalog:reconcile --export \"$CONVEX_EXPORT_DIR\"" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "reviewer cross-checks catalog:assets against the export _storage/ (count match + sampled SHA-256 readback)", "verify": "bun services/platform/src/cli/holo.ts catalog:assets --export \"$CONVEX_EXPORT_DIR\"" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "reviewer removes one entry and confirms catalog:verify --export exits non-zero naming the table, with no *.skip on the controls", "verify": "cp \"$CATALOG\" /tmp/c.bak; sed -i '' '/^  citations:/d' \"$CATALOG\" 2>/dev/null; bun services/platform/src/cli/holo.ts catalog:verify --export \"$CONVEX_EXPORT_DIR\"; rc=$?; cp /tmp/c.bak \"$CATALOG\"; test $rc -ne 0" }
  ]
}
-->
</details>
