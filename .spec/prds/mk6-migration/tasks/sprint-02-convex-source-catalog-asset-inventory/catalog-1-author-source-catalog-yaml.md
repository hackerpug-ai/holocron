# catalog-1 — Author 12-convex-source-catalog.yaml — one approved entry per table/field/storage reference

## What this does
Authors the machine-readable migration-contract artifact `.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml`: one approved entry for **every one of the 60 legacy Convex tables**, every field, and every storage reference — each carrying a disposition (`preserve` / `merge` / `drop` / `regenerate` / `archive`), a target relation/fields, transform, FK rewrites, a computable expected-target-count formula, exclusions, a checksum-or-sample, an owner, an approval, and a frozen fixture. It encodes the business 12→3 (`analysis_*`) and research 5→3 (`research_*`) collapses and the dropped Convex-only crutch (`documentCounters`), and proves completeness by running the `holo catalog:*` gate against a **real `convex export`**.

## Why
This YAML is the ETL authority every later DATA/SVC/SYNC sprint reads (UC-DATA-01, UC-DATA-05; T-DATA-020 build-gate). No source table, field, or object may be silently dropped and every intentional loss must be a versioned approval. Sprint 04's Postgres schema is validated against these dispositions and Sprint 14's ETL must reconcile to this catalog at zero unexplained variance — so an empty or partial template is not completion, it is a broken contract.

## How to verify
With the `holo catalog:*` surface (catalog-3) and the RED suite (catalog-5) in place, run `bun services/platform/src/cli/holo.ts catalog:verify --export "$CONVEX_EXPORT_DIR"` against a real `convex export` → exit 0, "60/60 tables approved"; `holo catalog:coverage` → every field + all 6 storage refs mapped; `holo catalog:merges` → business 12→3 + research 5→3 with no per-domain shells. Then delete one table's entry and re-run → non-zero, naming the unmapped table.

## Scope
Authors `.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml` plus its frozen-fixture sample rows under `services/platform/tests/fixtures/catalog/`. Does NOT write the tool (`services/platform/src/**` — catalog-3), the asset generator (catalog-2), or the tests (`tests/**` — catalog-5); does NOT touch `convex/**` (read-only source of truth).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: catalog-1 — Author 12-convex-source-catalog.yaml — one approved entry per table/field/storage reference
================================================================================

TASK_TYPE:  MIGRATION  (approved-mapping data artifact)
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L  (360 min)
AGENT:      implementer=mastra-implementer | reviewer=convex-reviewer
PROPOSED-BY: convex-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no   (data artifact; no RED-first — but completeness is machine-verified against a real export, seeded-evidence required)
CAPABILITY: CAP-MIG-01 (the approved source-catalog mapping the ETL must satisfy)
SPRINT:     [Sprint 2 — Convex Source Catalog and Asset Inventory](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      pnpm test        (vitest; single file: pnpm vitest run <path>)
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
The committed `.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml` carries one approved entry for every one of the 60 legacy tables, every field, and all 6 storage references, so that `bun services/platform/src/cli/holo.ts catalog:verify --export "$CONVEX_EXPORT_DIR"` against a real `convex export` exits 0 with "60/60 tables approved", `holo catalog:coverage` maps every field + storage ref, `holo catalog:merges` shows business 12→3 (`analysis_*`) and research 5→3 (`research_*`) with no per-domain shells — and deleting any single entry flips `catalog:verify` non-zero naming the unmapped table.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST enumerate the REAL 60 tables from `convex/schema.ts` (do NOT invent tables): the 4 business pipelines (`revenueValidation*`, `competitiveAnalysis*`, `aiRoi*`, `flights*` — 12 tables), 2 research systems (`researchSessions`/`researchIterations` + `deepResearchSessions`/`deepResearchIterations`/`researchFindings` — 5 tables), and 43 remaining tables. Every entry maps to a REAL source field.
- MUST give every table, field, and storage reference EXACTLY ONE disposition ∈ {`preserve`,`merge`,`drop`,`regenerate`,`archive`} with a target relation/fields, transform, FK rewrites, a computable expected-target-count formula, exclusions, checksum-or-sample, owner, approval, and frozen fixture — the entry shape in `12-migration-contract-artifacts.md` § "Convex source catalog".
- MUST encode the collapses exactly: business 12→3 → `analysis_sessions` (4 `*Sessions`, discriminator `type`), `analysis_items` (6 item tables, discriminator `kind`), `analysis_evidence` (2 evidence tables); research 5→3 → `research_sessions` (+ `system` discriminator `simple`|`deep`), `research_iterations`, `research_findings`. NO per-domain shell target survives.
- MUST disposition every storage reference: the 5 retained `_storage` fields (`audioSegments.storageId`, `videoTranscripts.storageId`, `audioTranscripts.storageId`, `improvementImages.storageId`, `voiceSessions.audioStorageId`) → content-addressed target with checksum/sample; the temporary `audioTranscriptJobs.audioStorageId` → `drop` (temporary/deleted-object) with a versioned approval; `documents.shareToken` → `preserve`.
- MUST mark `documentCounters` → `drop` (Convex-only counting crutch, replaced by Postgres `COUNT()`) with a versioned approval; every other drop/regenerate/archive carries a versioned approval id.
- NEVER leave a disposition blank/`TODO`/`null`; NEVER let a target field or object be silently dropped without an approval; NEVER hand-fabricate the "60/60 green" — it must be produced by `holo catalog:verify` against a real export.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): `catalog:verify --export` against a real `convex export` reports 60/60 tables approved, each with a disposition + computable expected-target formula + owner + approval
- [ ] AC-2: `catalog:merges` proves business 12→3 (`analysis_*`) + research 5→3 (`research_*`), exactly 3+3 targets, no per-domain shells
- [ ] AC-3: every field + all 6 storage refs carry a disposition; `audioTranscriptJobs.audioStorageId` + `documentCounters` are `drop` with versioned approvals
- [ ] AC-4 (negative control): deleting/blanking any single entry flips `catalog:verify` non-zero, naming the unmapped table (the 60/60 has teeth)
- [ ] catalog-5 RED suite goes green: `pnpm vitest run tests/integration/catalog-coverage.test.ts` → Exit 0
- [ ] `pnpm biome check .` clean (+ `pnpm tsgo --noEmit` clean if any TS fixture touched); only SCOPE.writeAllowed files modified

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (completeness proven against a real export, not hand-asserted)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Every one of the 60 tables + every field + storage ref has one approved disposition with a computable expected-target formula
  GIVEN a real `convex export` (real_export), the committed catalog (catalog_committed), and the verify tool (verify_tool)
  WHEN  `bun services/platform/src/cli/holo.ts catalog:verify --export "$CONVEX_EXPORT_DIR"` runs
  THEN  exit 0, "60/60 tables approved"; every table line shows a disposition ∈ {preserve,merge,drop,regenerate,archive}, an expected-target formula, an owner, and an approval
  TEST_TIER: integration · VERIFICATION_SERVICE: convex-export · FLOW_REF: UC-DATA-01 · TDD_STATE: none
  SCENARIO — start_ref: real_export+catalog_committed · evidence: stdout
    NEGATIVE_CONTROL: would fail if a table entry is missing / a disposition is blank/TODO / an entry has no expected-target formula / verify is run against an empty catalog / the export dir is stubbed/empty
    MUST_OBSERVE: exit 0, "60/60 tables approved", each of the 60 real tables (conversations … rateLimits) present with a disposition + expected-target formula + owner + approval
    MUST_NOT_OBSERVE: "0/60", any table with disposition null/TODO, an unmapped table silently passing, a "catalog complete" string with no per-table lines

AC-2 Business 12→3 and research 5→3 collapse to exactly 3+3 targets, no per-domain shells
  GIVEN the committed catalog (catalog_committed)
  WHEN  `bun services/platform/src/cli/holo.ts catalog:merges` runs
  THEN  the 12 business tables map onto {`analysis_sessions`,`analysis_items`,`analysis_evidence`} with a `type`/`kind` discriminator and the 5 research tables onto {`research_sessions`,`research_iterations`,`research_findings`} with a `system` discriminator; exactly 3+3 target relations
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-catalog · FLOW_REF: UC-DATA-01
  MUST_OBSERVE: `revenueValidationSessions|competitiveAnalysisSessions|aiRoiSessions|flightsSessions` → `analysis_sessions` (type discriminator); `researchSessions`+`deepResearchSessions` → `research_sessions` (system=simple|deep); exactly 3 `analysis_*` + 3 `research_*` targets
  MUST_NOT_OBSERVE: a surviving per-domain shell target (e.g. `revenue_validation_sessions`, `deep_research_sessions`), more than 3 `analysis_*` or 3 `research_*` targets, a merge source with no discriminator

AC-3 Every storage reference + the drop crutches carry an explicit disposition
  GIVEN the committed catalog (catalog_committed)
  WHEN  `bun services/platform/src/cli/holo.ts catalog:coverage` runs
  THEN  every field maps, all 6 `_storage` field refs are dispositioned (5 retained → content-addressed with checksum/sample; `audioTranscriptJobs.audioStorageId` → `drop` temporary), and `documentCounters` → `drop` with a versioned approval
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-catalog
  MUST_OBSERVE: 6 `_storage` refs each dispositioned; `audioTranscriptJobs.audioStorageId` disposition=`drop` reason=temporary-deleted; `documentCounters` disposition=`drop` with an approval id; each retained storage entry carries a checksum-or-sample field
  MUST_NOT_OBSERVE: a storage ref with no disposition, `documentCounters` silently preserved, a retained object entry with no checksum/sample, an unmapped field

AC-4 The 60/60 completeness has teeth — deleting one entry flips verify non-zero (un-fakeable control)
  GIVEN a real export + the committed catalog with exactly one table's entry removed (incomplete_catalog)
  WHEN  `bun services/platform/src/cli/holo.ts catalog:verify --export "$CONVEX_EXPORT_DIR"` runs
  THEN  exit non-zero, the removed table named in stderr, coverage reported as 59/60
  TEST_TIER: integration · VERIFICATION_SERVICE: convex-export
  MUST_OBSERVE: exit != 0, the specific removed table named (e.g. "citations unmapped"), "59/60"
  MUST_NOT_OBSERVE: exit 0 with a missing entry, a generic pass, the removed table silently treated as covered

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml (NEW — the deliverable)
- services/platform/tests/fixtures/catalog/*.json (NEW — frozen-fixture sample rows referenced by entries' `frozen_fixture`)
writeProhibited: convex/** (read-only source of truth), services/platform/src/** (the tool — catalog-3), services/platform/src/catalog/asset-inventory.* (catalog-2), tests/** (catalog-5 owns the suite), app/**, components/**, any existing *.yaml/*.test.ts

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md:11-16,29-31 [PRIMARY PATTERN] — the catalog entry shape + asset/reconciliation contract every entry must satisfy
2. convex/schema.ts:1-1517 — the REAL 60 tables/fields/indexes to enumerate (source of truth; count them: conversations … rateLimits)
3. .spec/prds/mk6-migration/05-uc-data.md:20-29 — UC-DATA-01 merges (business 12→3, research 5→3 with `system`, drop `documentCounters`); AC-5 build-gate wording
4. convex/schema.ts:766,814,856,902,1211,1231 + convex/audioTranscripts/scheduled.ts:117-167 — the 5 retained `_storage` fields vs the temporary `audioTranscriptJobs.audioStorageId` (stored then `ctx.storage.delete`) that must be `drop`
5. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:71,99 — T-DATA-020 (every surface has approved disposition/target, no unmapped loss) + T-DATA-016 (catalog-derived reconciliation) rows
6. services/platform/src/cli/holo.ts (from Sprint 01 compat-1) — the operator CLI the `catalog:*` subcommands extend (same registration pattern as `compat:spike`)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- seed a real export: `npx convex export --include-file-storage --path "$CONVEX_EXPORT_ZIP" && unzip -o "$CONVEX_EXPORT_ZIP" -d "$CONVEX_EXPORT_DIR"` → per-table `documents.jsonl` + `_storage/` + `_tables/documents.jsonl`
- coverage 60/60: `bun services/platform/src/cli/holo.ts catalog:verify --export "$CONVEX_EXPORT_DIR"` → Exit 0, "60/60 tables approved"
- field + storage coverage: `bun services/platform/src/cli/holo.ts catalog:coverage` → Exit 0, every field + 6 storage refs mapped
- merges proof: `bun services/platform/src/cli/holo.ts catalog:merges` → business 12→3 `analysis_*` + research 5→3 `research_*`, no per-domain shells
- deleted-entry teeth: `cp "$CATALOG" /tmp/c.bak; <remove one table entry>; bun services/platform/src/cli/holo.ts catalog:verify --export "$CONVEX_EXPORT_DIR"; test $? -ne 0; cp /tmp/c.bak "$CATALOG"` → Exit 0 (asserts verify exited non-zero on the incomplete catalog)
- catalog-5 suite green: `pnpm vitest run tests/integration/catalog-coverage.test.ts` → Exit 0
- lint clean: `pnpm biome check .` → Exit 0 (+ `pnpm tsgo --noEmit` if a TS fixture was touched)
- Gate 8 (un-fakeable PRIMARY): AC-1 was watched RED with a deliberately-incomplete catalog (verify <60/60, non-zero) BEFORE the full catalog goes green (60/60); captured stdout shows the per-table lines, not merely "Exit 0".

--------------------------------------------------------------------------------
REVIEW (convex-reviewer)
--------------------------------------------------------------------------------
Must pass: catalog parses under the entry-shape schema; 60/60 tables + every field + all 6 storage refs carry a disposition/target/formula/owner/approval; merges collapse to exactly 3 `analysis_*` + 3 `research_*` with no shells; `documentCounters` + `audioTranscriptJobs.audioStorageId` are `drop` with versioned approvals; retained storage entries carry checksum/sample; 60/60 reproduced against a REAL export; the deleted-entry negative control reproduced non-zero. No hand-fabricated green. Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: (none — this is the foundational contract artifact every other task reads; dep-order proposed by convex-planner) · Blocks: catalog-2 (asset generator reads the storage dispositions), catalog-3 (verify/coverage gate validates against this catalog), catalog-4 (real-export completeness verification), catalog-5 (RED test fixtures derive from this catalog's shape)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "catalog-1",
  "proposed_by": "convex-planner",
  "tdd_mode": "skipped",
  "verification_policy": { "requires_tests": false, "requires_red_evidence": false, "requires_seeded_evidence": true },
  "fixtures": {
    "real_export": { "description": "A real `convex export --include-file-storage` snapshot unzipped to $CONVEX_EXPORT_DIR (dev deployment IS production for holocron — this is real data)", "seed_method": "cli", "records": ["npx convex export --include-file-storage --path \"$CONVEX_EXPORT_ZIP\"", "unzip -o \"$CONVEX_EXPORT_ZIP\" -d \"$CONVEX_EXPORT_DIR\"; ls shows <table>/documents.jsonl + _storage/ + _tables/documents.jsonl"] },
    "catalog_committed": { "description": "The committed 12-convex-source-catalog.yaml being authored", "seed_method": "file", "records": [".spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml with 60 table entries + field + storage-ref entries"] },
    "verify_tool": { "description": "The holo catalog:verify/coverage/merges tool from catalog-3", "seed_method": "cli", "records": ["bun services/platform/src/cli/holo.ts catalog:verify --export \"$CONVEX_EXPORT_DIR\" available"] },
    "incomplete_catalog": { "description": "Negative control: the committed catalog with exactly one table's entry removed", "seed_method": "cli", "records": ["cp catalog catalog.bak; delete one table entry (e.g. citations)"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null,
      "description": "GIVEN a real convex export + the committed catalog WHEN `holo catalog:verify --export` runs THEN exit 0 with 60/60 tables approved, each with a disposition + computable expected-target formula + owner + approval",
      "verify": "bun services/platform/src/cli/holo.ts catalog:verify --export \"$CONVEX_EXPORT_DIR\"",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "convex-export", "flow_ref": "UC-DATA-01",
        "negative_control": { "would_fail_if": ["a table entry missing", "a disposition left blank/TODO", "an entry with no expected-target formula", "verify run against an empty catalog", "the export dir stubbed/empty"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "real_export", "action": { "actor": "cli_user", "steps": ["bun services/platform/src/cli/holo.ts catalog:verify --export \"$CONVEX_EXPORT_DIR\""] },
          "end_state": { "must_observe": ["exit 0", "60/60 tables approved", "each of the 60 real tables (conversations … rateLimits) has a disposition + expected-target formula + owner + approval"], "must_not_observe": ["0/60", "any table with disposition null/TODO", "an unmapped table silently passing", "a 'catalog complete' string with no per-table lines"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the committed catalog WHEN `holo catalog:merges` runs THEN business 12→3 analysis_* + research 5→3 research_* with exactly 3+3 targets and discriminators, no per-domain shells",
      "verify": "bun services/platform/src/cli/holo.ts catalog:merges",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-catalog", "flow_ref": "UC-DATA-01",
        "negative_control": { "would_fail_if": ["a per-domain shell target survives", "more than 3 analysis_* or 3 research_* targets", "a merge source with no discriminator"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "catalog_committed", "action": { "actor": "cli_user", "steps": ["bun services/platform/src/cli/holo.ts catalog:merges"] },
          "end_state": { "must_observe": ["revenueValidationSessions|competitiveAnalysisSessions|aiRoiSessions|flightsSessions → analysis_sessions (type discriminator)", "researchSessions+deepResearchSessions → research_sessions (system=simple|deep)", "exactly 3 analysis_* + 3 research_* targets"], "must_not_observe": ["a surviving per-domain shell (revenue_validation_sessions/deep_research_sessions)", ">3 analysis_* or >3 research_* targets", "a merge source with no discriminator"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the committed catalog WHEN `holo catalog:coverage` runs THEN every field + all 6 storage refs are dispositioned; audioTranscriptJobs.audioStorageId + documentCounters are drop with versioned approvals",
      "verify": "bun services/platform/src/cli/holo.ts catalog:coverage",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-catalog",
        "negative_control": { "would_fail_if": ["a storage ref has no disposition", "documentCounters silently preserved", "a retained object entry has no checksum/sample", "a field unmapped"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "catalog_committed", "action": { "actor": "cli_user", "steps": ["bun services/platform/src/cli/holo.ts catalog:coverage"] },
          "end_state": { "must_observe": ["6 _storage refs each dispositioned", "audioTranscriptJobs.audioStorageId disposition=drop reason=temporary-deleted", "documentCounters disposition=drop with approval id", "each retained storage entry carries checksum-or-sample"], "must_not_observe": ["a storage ref with no disposition", "documentCounters preserved", "a retained object with no checksum/sample", "an unmapped field"] } } ] } },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN the catalog with one table entry removed WHEN `holo catalog:verify --export` runs THEN it exits non-zero naming the unmapped table (the 60/60 has teeth)",
      "verify": "cp \"$CATALOG\" /tmp/c.bak; sed -i '' '/^  citations:/,/^  [a-z]/{ /^  citations:/d; }' \"$CATALOG\" 2>/dev/null; bun services/platform/src/cli/holo.ts catalog:verify --export \"$CONVEX_EXPORT_DIR\"; rc=$?; cp /tmp/c.bak \"$CATALOG\"; test $rc -ne 0",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "convex-export",
        "negative_control": { "would_fail_if": ["verify exits 0 with a missing entry", "a generic pass", "the removed table silently treated as covered"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "incomplete_catalog", "action": { "actor": "cli_user", "steps": ["remove one table entry; run catalog:verify --export; restore"] },
          "end_state": { "must_observe": ["exit != 0", "the removed table named (e.g. 'citations unmapped')", "59/60"], "must_not_observe": ["exit 0 with a missing entry", "a generic pass", "the removed table silently covered"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "catalog-coverage suite asserts catalog:verify --export against a real export reports 60/60 approved with disposition+formula+owner+approval per table", "verify": "pnpm vitest run tests/integration/catalog-coverage.test.ts -t '60/60'" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "test asserts catalog:merges resolves business 12→3 analysis_* + research 5→3 research_* with 3+3 targets and no per-domain shells", "verify": "pnpm vitest run tests/integration/catalog-coverage.test.ts -t 'merges'" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "test asserts every field + all 6 storage refs are dispositioned and documentCounters + audioTranscriptJobs.audioStorageId are drop with approvals", "verify": "pnpm vitest run tests/integration/catalog-coverage.test.ts -t 'coverage|storage'" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "test removes one entry and asserts catalog:verify exits non-zero naming the unmapped table", "verify": "pnpm vitest run tests/integration/catalog-coverage.test.ts -t 'deleted entry'" }
  ]
}
-->
</details>
