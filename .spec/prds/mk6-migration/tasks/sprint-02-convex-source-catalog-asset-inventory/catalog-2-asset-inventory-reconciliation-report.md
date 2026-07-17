# catalog-2 — Asset inventory + reconciliation report generator

## What this does
Adds the two `holo catalog:*` generators that turn a real `convex export` plus the committed source catalog into (a) a **reconciliation report** — per-table source count, expected-target-count formula, approved merge/drop/regenerate exceptions, and unexplained variance — and (b) a **per-object asset inventory** — legacy storage ID, recomputed SHA-256, byte length, MIME, content-addressed target, and retention/disposition for every retained storage object. `catalog:reconcile --dry-run` is green only at zero unexplained variance; `catalog:assets` emits one integrity row per blob read from disk.

## Why
This is the ETL authority the whole DATA phase is validated against (UC-DATA-05, T-DATA-016). Sprint 14's big-bang ETL must reconcile to *this* report at zero unexplained variance, and every retained Convex-storage object must migrate under *this* asset inventory. If the numbers aren't computed from a real export's bytes, the reconciliation is fiction and the ETL has no truth to check against.

## How to verify
`CATALOG_IT=1 pnpm vitest run tests/integration/catalog-reconcile.test.ts` against the frozen fixture `convex export` + the committed `12-convex-source-catalog.yaml` → exit 0, per-table variance rows all `variance=0`, `unexplained_variance: 0`, and one asset row per storage-bearing object with a SHA-256 that matches `sha256(bytes on disk)`. Then point reconcile at `export-variance/` (a table whose real row count diverges with no approved exception) → non-zero exit naming the table and its numeric variance.

## Scope
Creates `services/platform/src/catalog/{export-reader,catalog-loader,reconcile,assets}.ts`, registers `catalog:reconcile` + `catalog:assets` in `services/platform/src/cli/holo.ts`, and creates `tests/integration/catalog-reconcile.test.ts`. Consumes (read-only) the fixtures and negative-control suite authored by catalog-5. Does NOT author `catalog:verify`/`coverage`/`merges` (catalog-3), the RED negative controls (catalog-5), or touch `convex/**`, `app/**`.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: catalog-2 — Asset inventory + reconciliation report generator
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Completed
PRIORITY:   P0
EFFORT:     M  (180 min)
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
`bun services/platform/src/cli/holo.ts catalog:reconcile --dry-run` against a real `convex export` directory + the committed `12-convex-source-catalog.yaml` prints, per source table, the real row count, the catalog's expected-target-count formula, and any approved merge/drop/regenerate exception — reporting `unexplained_variance: 0` and exiting 0 only when every table reconciles; `holo catalog:assets` emits one integrity row (legacy storage ID, SHA-256 recomputed from the blob bytes, byte length, MIME, content-addressed target, retention/disposition) per retained storage object; and reconcile exits non-zero naming any table whose real count diverges from its formula with no approved exception.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST walk a REAL `convex export` directory (per-table `documents.jsonl` + a `_storage/` blob set) and parse the REAL committed catalog YAML; source counts, SHA-256, byte length, and MIME are computed from the bytes/rows on disk — NEVER hard-coded, NEVER a canned map.
- MUST derive variance = (real source count) − (catalog expected-target formula, with approved merge/drop/regenerate exceptions folded in); an approved exception is NOT variance, an unapproved divergence IS unexplained variance.
- MUST recompute each asset's SHA-256 from the blob bytes and its content-addressed target from that digest; the row's byte length MUST equal the on-disk file size.
- MUST resolve the retained storage-bearing fields from the committed catalog's storage dispositions (catalog-1 is authoritative for the exact table.field list); NEVER invent a storage table not present in `convex/schema.ts`.
- NEVER emit a static `variance: 0`, a placeholder/hard-coded SHA, a `0 objects` asset run, or a green reconcile while a table diverges; NEVER count an approved merge as variance or let an unapproved `drop` pass.
- STRICTLY Mastra 1.x: subpath imports only (root `@mastra/core` exports only `Mastra`); any tool `execute(inputData, context)` is validated against a real `outputSchema`; NEVER `z.any()`. CLI exit code MUST reflect variance (0 ⇒ 0, >0 ⇒ non-zero).
- Extends `services/platform` (compat-1 layout); modifies only SCOPE.writeAllowed files; the RED negative-control suite + fixtures are catalog-5's — read-only here.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): `catalog:reconcile --dry-run` on real export + catalog ⇒ per-table counts/formulas printed, unexplained_variance=0, exit 0
- [x] AC-2: `catalog:assets` emits one integrity row per storage object with a SHA-256 that matches sha256(bytes)
- [x] AC-3: approved merge (business 12→3, research 5→3) + drop/regenerate exceptions fold into the formula and are NOT counted as variance
- [x] AC-4: a real count that diverges from the formula with no approved exception ⇒ reconcile exits non-zero naming the table + numeric variance
- [ ] catalog-5's `tests/integration/catalog-negative-controls.test.ts` variance control goes GREEN against this implementation
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean; only SCOPE.writeAllowed files modified

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED against the absent `catalog:reconcile`/`catalog:assets` commands first)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Reconciliation report reaches zero unexplained variance against a real export (flow_ref UC-DATA-05)
  GIVEN the frozen fixture `convex export` (export_sample) + the committed catalog (real_catalog)
  WHEN  `bun services/platform/src/cli/holo.ts catalog:reconcile --dry-run --json` runs
  THEN  exit 0, one row per source table with real source count + expected-target formula, and `unexplained_variance: 0`
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: none
  SCENARIO — start_ref: export_sample+real_catalog · evidence: stdout
    NEGATIVE_CONTROL: would fail if the export dir is empty/stubbed, counts are hard-coded, the formula is static, or the catalog isn't actually read
    MUST_OBSERVE: exit 0; per-table rows e.g. `researchFindings: source=N expected=N variance=0`; `unexplained_variance: 0`; row count == number of source tables in the export
    MUST_NOT_OBSERVE: `0 objects`/empty table set; a bare `variance: 0` with no per-table rows; a static formula independent of the export; exit ≠ 0

AC-2 Per-object asset inventory carries real integrity evidence
  GIVEN export_sample contains `_storage/` blobs referenced by the retained storage-bearing tables (per catalog-1's storage dispositions)
  WHEN  `holo catalog:assets --json` runs
  THEN  one row per retained object: legacy storage ID, SHA-256 == sha256(bytes), byte length == file size, detected MIME, content-addressed target derived from the digest, retention/disposition
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  MUST_OBSERVE: for at least one known blob, `sha256` equals the independently computed digest of its bytes AND `bytes` equals its on-disk size AND `target` is derived from that sha256 · MUST_NOT_OBSERVE: a placeholder/constant SHA, `0 objects`, a target unrelated to the digest, a byte length of 0 for a non-empty blob

AC-3 Approved merge/drop/regenerate exceptions fold into the formula (not variance)
  GIVEN real_catalog assigns disposition=merge to the 12 business-pipeline tables → `analysis_*` and the 5 research tables → `research_*` (system discriminator), and disposition=drop to `documentCounters`
  WHEN  `holo catalog:reconcile --dry-run --json` runs
  THEN  `analysis_*`/`research_*` expected-target formulas equal the summed source counts of their approved members, `documentCounters` is an approved drop, and none is reported as variance
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  MUST_OBSERVE: an exceptions list naming the business 12→3 merge, the research 5→3 merge, and the `documentCounters` drop; each labeled approved; `unexplained_variance: 0` · MUST_NOT_OBSERVE: an approved merge flagged as variance; `documentCounters` counted as loss; a 12→12 pass-through

AC-4 [ERROR] Unexplained variance fails closed
  GIVEN export_variance (one table's real row count diverges from its formula, no approved exception)
  WHEN  `holo catalog:reconcile --dry-run` runs
  THEN  exits non-zero naming the table and its numeric variance
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli
  MUST_OBSERVE: exit ≠ 0; `<tableName>: expected=N actual=M variance=Δ (unexplained)` · MUST_NOT_OBSERVE: exit 0; `unexplained_variance: 0` while a table diverges; the mismatch swallowed

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/catalog/export-reader.ts (NEW — enumerate export tables, row counts, and `_storage/` blobs) [SHARED — consumed by catalog-3]
- services/platform/src/catalog/catalog-loader.ts (NEW — parse + type the source catalog YAML into a validated model) [SHARED — consumed by catalog-3]
- services/platform/src/catalog/reconcile.ts (NEW), services/platform/src/catalog/assets.ts (NEW)
- services/platform/src/cli/holo.ts (MODIFY — register `catalog:reconcile` + `catalog:assets`)
- tests/integration/catalog-reconcile.test.ts (NEW — happy dry-run zero-variance + assets integrity + approved-exception folding)
writeProhibited: services/platform/src/catalog/{verify,coverage,merges}.ts (catalog-3), tests/integration/catalog-negative-controls.test.ts + services/platform/tests/fixtures/** (catalog-5, read-only), tests/integration/catalog-verify.test.ts (catalog-3), .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml (read-only — catalog-1), convex/**, app/**, holocron-mcp/**

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/prds/mk6-migration/10-technical-requirements/12-migration-contract-artifacts.md:29-31 [PRIMARY PATTERN] — Asset inventory + reconciliation report contract (source count, expected-target formula, approved exceptions, checksums/samples, zero unexplained variance)
2. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:99 — T-DATA-016 pass signature (expected target formulas + approved exceptions + samples/checksums ⇒ zero unexplained variance)
3. .spec/prds/mk6-migration/05-uc-data.md:68-73 — UC-DATA-05 AC (source-catalog-derived reconciliation, retained-object manifest fields)
4. .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml (from catalog-1) — the AUTHORITATIVE retained storage-bearing table.field list + dispositions the asset inventory walks
5. convex/schema.ts — the real storage-bearing tables grounding the asset fixture (confirm the exact `*.storageId` fields against catalog-1)
6. services/platform/src/cli/holo.ts:1-60 — the existing operator CLI wiring + JSON result contract to extend (from compat-1)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- reconcile zero-variance vs real export: `CATALOG_IT=1 pnpm vitest run tests/integration/catalog-reconcile.test.ts -t 'zero unexplained variance'` → Exit 0 (with captured per-table rows, not merely "Exit 0")
- assets integrity readback: `CATALOG_IT=1 pnpm vitest run tests/integration/catalog-reconcile.test.ts -t 'asset integrity'` → Exit 0 (asserts sha256(bytes) == reported SHA for a known blob)
- variance fails closed: `bun services/platform/src/cli/holo.ts catalog:reconcile --dry-run --export services/platform/tests/fixtures/export-variance; test $? -ne 0` → Exit 0
- catalog-5's variance control goes green here: `CATALOG_IT=1 pnpm vitest run tests/integration/catalog-negative-controls.test.ts -t 'variance'` → Exit 0
- root typecheck `pnpm tsgo --noEmit` → Exit 0 · lint `pnpm biome check .` → Exit 0
- Gate 8 (un-fakeable PRIMARY): AC-1 was watched RED against the absent `catalog:reconcile` command (and against a hand-perturbed count) before green; captured stdout shows real per-table variance rows, not a bare "variance: 0"

--------------------------------------------------------------------------------
REVIEW (mastra-reviewer)
--------------------------------------------------------------------------------
Must pass: one integration test per AC driving the real `holo catalog:*` surface; RED evidence present; SHA-256/byte-length computed from bytes (grep the source — no constant digest, no hard-coded count); approved-exception folding real; variance path fails closed; SCOPE respected. Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: catalog-1 (the committed catalog shape/entries + authoritative storage dispositions), catalog-5 (the RED-first negative-control suite + frozen fixtures this turns green) · Blocks: catalog-3 (consumes the shared `export-reader.ts`/`catalog-loader.ts` this authors), catalog-4 (real-export review of the asset inventory + reconciliation)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "catalog-2",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": { "requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true },
  "fixtures": {
    "real_catalog": { "description": "The committed source catalog authored in catalog-1", "seed_method": "migration_fixture", "records": [".spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml — one approved entry per legacy table/field/storage ref"] },
    "export_sample": { "description": "Frozen fixture `convex export` dir (real table names + `_storage/` blobs), authored by catalog-5", "seed_method": "migration_fixture", "records": ["services/platform/tests/fixtures/export-sample/<table>/documents.jsonl for a representative real-name subset + services/platform/tests/fixtures/export-sample/_storage/ blobs referenced by the retained storage-bearing tables"] },
    "export_variance": { "description": "Export where one table's real row count diverges from its catalog formula with no approved exception", "seed_method": "migration_fixture", "records": ["services/platform/tests/fixtures/export-variance/<table>/documents.jsonl with N extra unexplained rows"] }
  },
  "requirements": [
    { "id": "AC-1", "type": "acceptance_criterion", "primary": true, "maps_to_ac": null, "flow_ref": "UC-DATA-05",
      "description": "GIVEN the frozen fixture export + committed catalog WHEN `holo catalog:reconcile --dry-run --json` runs THEN exit 0 with per-table source count + expected-target formula and unexplained_variance:0",
      "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-reconcile.test.ts -t 'zero unexplained variance'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli",
        "negative_control": { "would_fail_if": ["export dir empty/stubbed", "counts hard-coded", "expected-target formula static/independent of the export", "catalog never actually parsed"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "export_sample+real_catalog", "action": { "actor": "cli_user", "steps": ["bun services/platform/src/cli/holo.ts catalog:reconcile --dry-run --json"] },
          "end_state": { "must_observe": ["exit 0", "per-table rows e.g. researchFindings: source=N expected=N variance=0", "unexplained_variance: 0", "row count == number of source tables in the export"], "must_not_observe": ["0 objects / empty table set", "a bare variance: 0 with no per-table rows", "a static formula independent of the export", "exit != 0"] } } ] } },
    { "id": "AC-2", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN `_storage/` blobs referenced by the retained storage-bearing tables WHEN `holo catalog:assets --json` runs THEN one integrity row per object with SHA-256==sha256(bytes), byte length==file size, MIME, content-addressed target, disposition",
      "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-reconcile.test.ts -t 'asset integrity'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli",
        "negative_control": { "would_fail_if": ["SHA hard-coded/constant", "blob bytes never read", "byte length faked"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "export_sample", "action": { "actor": "cli_user", "steps": ["holo catalog:assets --json"] },
          "end_state": { "must_observe": ["for a known blob sha256 == independently computed digest of its bytes", "bytes == on-disk file size", "target derived from that sha256"], "must_not_observe": ["a placeholder/constant SHA", "0 objects", "a target unrelated to the digest", "byte length 0 for a non-empty blob"] } } ] } },
    { "id": "AC-3", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN catalog dispositions merge (business 12→3 analysis_*, research 5→3 research_* with system discriminator) + drop (documentCounters) WHEN reconcile runs THEN approved exceptions fold into the expected-target formula and are not variance",
      "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-reconcile.test.ts -t 'approved exceptions'",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli",
        "negative_control": { "would_fail_if": ["an approved merge counted as variance", "documentCounters drop counted as loss", "merges left as 12→12 pass-through"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "export_sample+real_catalog", "action": { "actor": "cli_user", "steps": ["holo catalog:reconcile --dry-run --json"] },
          "end_state": { "must_observe": ["exceptions list names the business 12→3 merge, the research 5→3 merge, and the documentCounters drop, each labeled approved", "analysis_*/research_* expected == summed source counts of approved members", "unexplained_variance: 0"], "must_not_observe": ["an approved merge flagged as variance", "documentCounters counted as loss", "a 12→12 pass-through"] } } ] } },
    { "id": "AC-4", "type": "acceptance_criterion", "primary": false, "maps_to_ac": null,
      "description": "GIVEN export_variance (a diverging count, no approved exception) WHEN `holo catalog:reconcile --dry-run` runs THEN it exits non-zero naming the table and its numeric variance",
      "verify": "bun services/platform/src/cli/holo.ts catalog:reconcile --dry-run --export services/platform/tests/fixtures/export-variance; test $? -ne 0",
      "scenario": { "test_tier": "integration", "tier": "visible", "verification_service": "holo-cli",
        "negative_control": { "would_fail_if": ["reconcile swallows the mismatch and reports green"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [ { "start_ref": "export_variance", "action": { "actor": "cli_user", "steps": ["holo catalog:reconcile --dry-run against export-variance"] },
          "end_state": { "must_observe": ["exit != 0", "<tableName>: expected=N actual=M variance=Δ (unexplained)"], "must_not_observe": ["exit 0", "unexplained_variance: 0 while a table diverges"] } } ] } },
    { "id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "catalog-reconcile test spawns real `holo catalog:reconcile --dry-run` vs the fixture export + real catalog and asserts exit 0, per-table variance rows, unexplained_variance 0", "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-reconcile.test.ts -t 'zero unexplained variance'" },
    { "id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "test recomputes sha256 of a known fixture blob and asserts it equals the `catalog:assets` row's SHA + byte length equals file size", "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-reconcile.test.ts -t 'asset integrity'" },
    { "id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "test asserts the business 12→3 + research 5→3 merges and documentCounters drop appear as approved exceptions and are not variance", "verify": "CATALOG_IT=1 pnpm vitest run tests/integration/catalog-reconcile.test.ts -t 'approved exceptions'" },
    { "id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "against export-variance the reconcile exits non-zero naming the table + numeric variance", "verify": "bun services/platform/src/cli/holo.ts catalog:reconcile --dry-run --export services/platform/tests/fixtures/export-variance; test $? -ne 0" }
  ]
}
-->
</details>
