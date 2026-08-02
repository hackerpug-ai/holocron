# REDHAT-FIX-S29-R2-C03 — Bind parity to an immutable content-addressed export/catalog and reject truncated or caller-authored reports (C-03; soak-fence.ts:318-355,1226-1285)

## What this does

Close red-hat C-03 (cycle-2) by binding cutover:verify-reads to an immutable content-addressed export/catalog (not a mutable caller-selected ETL report), requiring the full expected table set, and rejecting truncated, rewritten, or test-authored reports that would greenwash migration loss.

## Why

Remediate cycle-2 red-hat finding for CAP-CUT-01, CAP-MIG-01 (`REDHAT-FIX-S29-R2-C03`). Grounded in UC-SYNC-03 / UC-SYNC-04 / T-SYNC-008–010 / CAP-CUT-01 (and CAP-MIG-01 when ETL parity applies). Review evidence: `.spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md` (reviewed SHA `cab5c0717974a96e33c338105b5d198d82cb607d`).

## How to verify

- `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c03-red.log`
- `bun services/platform/src/cli/holo.ts cutover:verify-reads --json | jq -e '.ok==true and .tablesTotal>=4 and .tablesMatched==.tablesTotal'`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts -t 'R2-C03|truncated|immutable'`
- `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c03-path.json`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: services/platform/src/cutover/soak-fence.ts — MODIFY runVerifyReads / loadEtlReconcileSnapshot binding to catalog+archive, services/platform/src/cli/holo.ts — MODIFY verify-reads flags for catalog/export paths if needed, services/platform/src/catalog/* — READ or thin helpers only if required for table inventory, services/platform/src/etl/archive.ts — READ/use readImmutableExport; MODIFY only if expose needed hash helper, services/platform/tests/integration/sprint29-soak-flip.test.ts — MODIFY parity cases for truncated/rewritten rejection, services/platform/tests/integration/redhat-fix-s29-r2-c03-*.test.ts — NEW optional, services/platform/tests/fixtures/sprint29/** — MODIFY/ADD frozen archive+catalog fixtures with real content addresses, .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c03-** — evidence

Prohibited: Rewriting production watermark-report.json from live counts in tests, Accepting freestanding D06-04-shaped fixture as sole production oracle without archive/catalog bind, app/, components/, hooks/, screens/, convex/** deletion, Silent skip of catalog tables, Re-opening schedule drain (C-02 finding / other task)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-R2-C03 — Bind parity to an immutable content-addressed export/catalog and reject truncated or caller-authored reports (C-03; soak-fence.ts:318-355,1226-1285)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L  (150 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-CUT-01, CAP-MIG-01
SPRINT:     [Sprint 29 — Cutover: Write Freeze, ETL and Read-Only Soak Flip](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
runVerifyReads loads expected tables and counts from an immutable export archive + source catalog (or D06-04 watermark whose exportArchiveHash matches a content-addressed archive on disk), refuses ok:true when the caller supplies a truncated loadedByTable (e.g. single table), refuses when baseline_hash is only a self-hash of a mutable caller report without archive binding, and integration tests use real frozen export/catalog evidence rather than a D06-04-shaped freestanding fixture alone.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST derive the verify-reads target set from an immutable content-addressed export/catalog (exportArchiveHash + catalog table inventory and/or archived export row counts) — not solely from caller-selected loadedByTable (soak-fence.ts:1226-1235)
- MUST reject truncated target sets: ok cannot be true when tablesTotal is below the catalog/export expected table count (must not accept one-table success at soak-fence.ts:1280-1285)
- MUST bind baseline integrity to export archive content address (exportArchiveHash / archive digest) that is independent of a caller-rewritable report body; baseline_hash must not be solely SHA-256 of the same mutable report used as the oracle (soak-fence.ts:318-355)
- MUST fail closed on missing catalog, missing archive, hash mismatch, alias conflicts, empty loadedByTable, or caller-authored report lacking provenance binding
- MUST capture RED evidence at cab5c071 proving truncated/rewritten report can green verify-reads
- NEVER accept verify-reads ok:true from a one-table or truncated loadedByTable that omits catalog-required tables
- NEVER treat SHA-256 of the caller-selected mutable report alone as immutable provenance (soak-fence.ts:318-355)
- NEVER invent expected counts from live SELECT count(*) immediately before assert
- NEVER use only services/platform/tests/fixtures/sprint29/watermark-report-multi-table.json as the sole production oracle without archive/catalog binding (fixture note lines 24-36 admit D06-04-shaped test fixture)
- NEVER delete convex/ or touch app/, components/, hooks/, screens/
- STRICTLY tdd_mode red_first; evidence under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c03-*
- STRICTLY PRIMARY AC test_tier e2e/integration with live holocron_nonprod count queries
- STRICTLY tablesTotal and tablesMatched are concrete integers; ok true only when tablesMatched==tablesTotal and full catalog/export set reconciled
- STRICTLY exportArchiveHash is 64-hex and matches on-disk immutable archive digest
- STRICTLY CAP-MIG-01 full-table parity contract preserved and strengthened

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN immutable_export_catalog_baseline with content-addressed export archive a…
- [ ] AC-2: GIVEN truncated_caller_report with loadedByTable containing only documents (or …
- [ ] AC-3: GIVEN rewritten_mutable_report that changes loadedByTable counts or drops keys …
- [ ] AC-4: GIVEN immutable_export_catalog_baseline with live Postgres matching full expect…
- [ ] AC-5: GIVEN pre_fix_mutable_self_hashed_report at cab5c071 WHEN implementer completes…
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN immutable_export_catalog_baseline with content-addressed export… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN immutable_export_catalog_baseline with content-addressed export archive and catalog inventory of expected migrated tables WHEN operator runs holo cutover:verify-reads --json THEN target set is the full catalog/export expected set (tablesTotal equals catalog expected count, not caller-truncated length); every expected table is compared to live Postgres
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: postgres + filesystem
  VERIFY: `bun services/platform/src/cli/holo.ts cutover:verify-reads --json | jq -e '.ok==true and .tablesTotal>=4 and .tablesMatched==.tablesTotal and (.exportArchiveHash|length)==64 and (.catalog_table_count//.tablesTotal)==.tablesTotal'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: immutable_export_catalog_baseline
  MUST_OBSERVE: AC-1 report field ok equals true OR exit_code equals 1; AC-1 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; tablesTotal is integer >= 4; AC-1 observed_status equals literal 'PASS' and observed_count >= 1; exportArchiveHash is 64-hex matching on-disk archive; AC-1 observed_status equals literal 'PASS' and observed_count >= 1; AC-1 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 [PRIMARY] — GIVEN truncated_caller_report with loadedByTable containing only docu… (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN truncated_caller_report with loadedByTable containing only documents (or any proper subset of catalog tables) WHEN operator runs verify-reads against that truncated report as sole input THEN verify-reads ok===false and mismatches include a truncated/incomplete-set reason; suite refuses green
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: cutover CLI
  VERIFY: `bun services/platform/src/cli/holo.ts cutover:verify-reads --json --etl-report $TMP/truncated-one-table.json; test $? -ne 0; jq -e '.ok==false and (.mismatches|length)>0' /tmp/verify-reads-truncated.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: truncated_caller_report
  MUST_OBSERVE: AC-2 report field ok equals true OR exit_code equals 1; AC-2 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; report.ok === false; mismatches array length >= 1; AC-2 observed_status equals literal 'PASS' and observed_count >= 1; process exit code != 0 for CLI path
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — GIVEN rewritten_mutable_report that changes loadedByTable counts or d… (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN rewritten_mutable_report that changes loadedByTable counts or drops keys after original exportArchiveHash was computed for a different body WHEN verify-reads evaluates integrity binding THEN hash/provenance check fails; ok false; self-hash of mutable report alone is insufficient
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem+postgres
  VERIFY: `jq -e '.ok==false and ([.mismatches[]|select(test("hash|archive|provenance|catalog";"i"))]|length)>0' verify-reads-rewritten.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: rewritten_mutable_report
  MUST_OBSERVE: AC-3 report field ok equals true OR exit_code equals 1; AC-3 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; ok === false; AC-3 observed_status equals literal 'PASS' and observed_count >= 1; AC-3 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — GIVEN immutable_export_catalog_baseline with live Postgres matching f… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN immutable_export_catalog_baseline with live Postgres matching full expected counts WHEN verify-reads compares live counts THEN exact equality for every catalog/export table; mismatches empty; tablesMatched==tablesTotal
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: postgres
  VERIFY: `jq -e '.ok==true and .mismatches==[] and .tablesMatched==.tablesTotal and .tablesTotal>0' verify-reads.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: immutable_export_catalog_baseline
  MUST_OBSERVE: AC-4 report field ok equals true OR exit_code equals 1; AC-4 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; for every table T, perTableCounts[T] === baselineCounts[T]; mismatches length equals 0; AC-4 observed_status equals literal 'PASS' and observed_count >= 1; ok === true
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-5 — GIVEN pre_fix_mutable_self_hashed_report at cab5c071 WHEN implementer… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN pre_fix_mutable_self_hashed_report at cab5c071 WHEN implementer completes R2-C03 THEN red log + green evidence + path.json A devops-engineer under redhat-fix-s29-r2-c03-*
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem
  VERIFY: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c03-red.log && jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c03-path.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: pre_fix_mutable_self_hashed_report
  MUST_OBSERVE: AC-5 report field ok equals true OR exit_code equals 1; AC-5 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; red log size > 0; AC-5 observed_status equals literal 'PASS' and observed_count >= 1; AC-5 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | verify-reads tablesTotal equals catalog/export expected migrated tabl… | AC-1 | `jq .tablesTotal verify-reads.json; compare to cat…` |
| TC-2 | exportArchiveHash is 64-hex and matches on-disk immutable export arch… | AC-1 | `jq -e '(.exportArchiveHash|length)==64' ; sha256 …` |
| TC-3 | truncated one-table caller report yields ok false with non-empty mism… | AC-2 | `verify-reads against truncated fixture; jq .ok==f…` |
| TC-4 | rewritten mutable report fails provenance/archive binding | AC-3 | `rewrite loadedByTable; verify-reads fails closed` |
| TC-5 | full-set live counts equal baselineCounts for every table with mismat… | AC-4 | `jq .tablesMatched==.tablesTotal and .mismatches==…` |
| TC-6 | RED evidence log non-empty for mutable self-hashed baseline defect at… | AC-5 | `test -s redhat-fix-s29-r2-c03-red.log` |
| TC-7 | runVerifyReads code path opens catalog and/or immutable export reader… | AC-1 | `rg + integration assertion on baseline_source/cat…` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cutover/soak-fence.ts — MODIFY runVerifyReads / loadEtlReconcileSnapshot binding to catalog+archive
- services/platform/src/cli/holo.ts — MODIFY verify-reads flags for catalog/export paths if needed
- services/platform/src/catalog/* — READ or thin helpers only if required for table inventory
- services/platform/src/etl/archive.ts — READ/use readImmutableExport; MODIFY only if expose needed hash helper
- services/platform/tests/integration/sprint29-soak-flip.test.ts — MODIFY parity cases for truncated/rewritten rejection
- services/platform/tests/integration/redhat-fix-s29-r2-c03-*.test.ts — NEW optional
- services/platform/tests/fixtures/sprint29/** — MODIFY/ADD frozen archive+catalog fixtures with real content addresses
- .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c03-** — evidence
writeProhibited:
- Rewriting production watermark-report.json from live counts in tests
- Accepting freestanding D06-04-shaped fixture as sole production oracle without archive/catalog bind
- app/, components/, hooks/, screens/
- convex/** deletion
- Silent skip of catalog tables
- Re-opening schedule drain (C-02 finding / other task)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md:59-65 — C-03 CRITICAL finding
2. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md:109 — remediation #3 immutable export/catalog
3. services/platform/src/cutover/soak-fence.ts:318-355 — baseline_hash = sha256 of mutable report
4. services/platform/src/cutover/soak-fence.ts:1226-1235 — targets from caller loadedByTable
5. services/platform/src/cutover/soak-fence.ts:1280-1285 — ok when tablesTotal>0 only
6. services/platform/tests/fixtures/sprint29/watermark-report-multi-table.json:24-36 — D06-04-shaped test fixture provenance
7. services/platform/src/catalog/catalog-loader.ts — loadCatalog / listTableNames
8. services/platform/src/etl/archive.ts:268-278 — readImmutableExport
9. REDHAT-FIX-S29-H02-reconcile-every-migrated-table-against-immutable-export-catalog-evidence-without-test-authored.md — prior H02 contract
10. .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md — CAP-MIG-01

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- gate: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c03-red.log` → Exit 0
- gate: `bun services/platform/src/cli/holo.ts cutover:verify-reads --json | jq -e '.ok==true and .tablesTotal>=4 and .tablesMatched==.tablesTotal'` → Exit 0
- gate: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts -t 'R2-C03|truncated|immutable'` → Exit 0
- gate: `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c03-path.json` → Exit 0
- gate: `pnpm tsgo --noEmit` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md#C-03, services/platform/src/cutover/soak-fence.ts:318-355,1226-1285, services/platform/src/etl/archive.ts readImmutableExport, services/platform/src/catalog/catalog-loader.ts
Interaction notes:
- Coordinate with sibling R2 remediations; do not fake-pass incomplete siblings
pattern: verify-reads binds expected table set + counts to content-addressed immutable export + catalog inventory; watermark report may supply runId but cannot alone define a subset; reject truncated/rewritten/unbound reports; baseline_hash/exportArchiveHash prove archive integrity independent of caller rewrite.
pattern_source: Review remediation #3 + CAP-MIG-01 + prior REDHAT-FIX-S29-H02 + ETL archive reader
anti_pattern: mapLoadedByTableToPgTargets(caller.loadedByTable) as sole target source; ok when tablesTotal>0; baseline_hash=sha256(same report); D06-04-shaped freestanding fixture as production oracle

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — PRIMARY surface is cutover verify-reads parity binding: immutable D06-04 export/catalog content addressing, reject truncated/caller-authored loadedByTable reports, and full-table reconcile oracles. This is CAP-MIG-01/CAP-CUT-01 ETL verification infrastructure owned by devops-engineer (prior H02), not Mastra agent code. Planner = mastra-planner; reviewers = mastra-reviewer + test-quality-reviewer on immutability oracles.
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer / test-quality-reviewer when domain-scoped)
Proposed By: mastra-planner

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D06-04, REDHAT-FIX-S29-H02, D06-05
Blocks: unqualified-sprint-29-close

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
['Finding lineage: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md finding C-03 CRITICAL; reviewed SHA cab5c0717974a96e33c338105b5d198d82cb607d', 'Cycle-2: prior H02 multi-table fixture still allows caller-selected subset and self-hash; this task requires catalog/export authority', 'Fakeability: AC-2/AC-3 must fail if suite only asserts non-empty tablesTotal without catalog completeness']

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-R2-C03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "immutable_export_catalog_baseline": {
      "description": "Content-addressed D06-04 export archive + source catalog with known table inventory and row counts; watermark report may accompany but is not sole authority.",
      "seed_method": "migration_fixture",
      "records": [
        "export archive directory or zip with stable exportArchiveHash 64-hex",
        "catalog YAML/JSON listing all expected migrated tables",
        "live holocron_nonprod counts match archive for green path"
      ]
    },
    "truncated_caller_report": {
      "description": "Caller-authored watermark JSON with loadedByTable containing only documents (or other proper subset).",
      "seed_method": "migration_fixture",
      "records": [
        "loadedByTable: { documents: <n> } only",
        "optional fake exportArchiveHash that does not bind full catalog"
      ]
    },
    "rewritten_mutable_report": {
      "description": "Report file mutated after initial write to drop tables or change counts while keeping or forging baseline_hash self-hash.",
      "seed_method": "migration_fixture",
      "records": [
        "pre-rewrite multi-table body",
        "post-rewrite truncated or altered counts"
      ]
    },
    "pre_fix_mutable_self_hashed_report": {
      "description": "cab5c071 defect: loadEtlReconcileSnapshot baseline_hash=sha256(report bytes); runVerifyReads targets from caller loadedByTable; ok if tablesTotal>0 all match.",
      "seed_method": "recorded_external",
      "records": [
        "services/platform/src/cutover/soak-fence.ts:318-355",
        "services/platform/src/cutover/soak-fence.ts:1226-1235",
        "services/platform/src/cutover/soak-fence.ts:1280-1285",
        "services/platform/tests/fixtures/sprint29/watermark-report-multi-table.json:24-36",
        ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md C-03"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN immutable_export_catalog_baseline with content-addressed export archive and catalog inventory of expected migrated tables WHEN operator runs holo cutover:verify-reads --json THEN target set is the full catalog/export expected set (tablesTotal equals catalog expected count, not caller-truncated length); every expected table is compared to live Postgres",
      "verify": "bun services/platform/src/cli/holo.ts cutover:verify-reads --json | jq -e '.ok==true and .tablesTotal>=4 and .tablesMatched==.tablesTotal and (.exportArchiveHash|length)==64 and (.catalog_table_count//.tablesTotal)==.tablesTotal'",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "topology": "single-node",
        "verification_service": "postgres + filesystem",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "immutable_export_catalog_baseline",
            "action": {
              "actor": "operator",
              "steps": [
                "point verify-reads at bound archive+catalog+watermark",
                "run verify-reads",
                "inspect tablesTotal vs catalog expected"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-1 report field ok equals true OR exit_code equals 1",
                "AC-1 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "tablesTotal is integer >= 4",
                "AC-1 observed_status equals literal 'PASS' and observed_count >= 1",
                "exportArchiveHash is 64-hex matching on-disk archive",
                "AC-1 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-1 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "e2e"
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-009",
      "description": "GIVEN truncated_caller_report with loadedByTable containing only documents (or any proper subset of catalog tables) WHEN operator runs verify-reads against that truncated report as sole input THEN verify-reads ok===false and mismatches include a truncated/incomplete-set reason; suite refuses green",
      "verify": "bun services/platform/src/cli/holo.ts cutover:verify-reads --json --etl-report $TMP/truncated-one-table.json; test $? -ne 0; jq -e '.ok==false and (.mismatches|length)>0' /tmp/verify-reads-truncated.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "topology": "single-node",
        "verification_service": "cutover CLI",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "truncated_caller_report",
            "action": {
              "actor": "operator",
              "steps": [
                "author truncated loadedByTable with only documents: N",
                "run verify-reads",
                "assert fail-closed"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-2 report field ok equals true OR exit_code equals 1",
                "AC-2 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "report.ok === false",
                "mismatches array length >= 1",
                "AC-2 observed_status equals literal 'PASS' and observed_count >= 1",
                "process exit code != 0 for CLI path"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "integration"
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-009",
      "description": "GIVEN rewritten_mutable_report that changes loadedByTable counts or drops keys after original exportArchiveHash was computed for a different body WHEN verify-reads evaluates integrity binding THEN hash/provenance check fails; ok false; self-hash of mutable report alone is insufficient",
      "verify": "jq -e '.ok==false and ([.mismatches[]|select(test(\"hash|archive|provenance|catalog\";\"i\"))]|length)>0' verify-reads-rewritten.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "topology": "single-node",
        "verification_service": "filesystem+postgres",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "rewritten_mutable_report",
            "action": {
              "actor": "operator",
              "steps": [
                "rewrite loadedByTable after capture",
                "run verify-reads",
                "assert provenance fail"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-3 report field ok equals true OR exit_code equals 1",
                "AC-3 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "ok === false",
                "AC-3 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-3 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "integration"
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN immutable_export_catalog_baseline with live Postgres matching full expected counts WHEN verify-reads compares live counts THEN exact equality for every catalog/export table; mismatches empty; tablesMatched==tablesTotal",
      "verify": "jq -e '.ok==true and .mismatches==[] and .tablesMatched==.tablesTotal and .tablesTotal>0' verify-reads.json",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "topology": "single-node",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "immutable_export_catalog_baseline",
            "action": {
              "actor": "operator",
              "steps": [
                "verify-reads full set",
                "compare perTableCounts"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-4 report field ok equals true OR exit_code equals 1",
                "AC-4 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "for every table T, perTableCounts[T] === baselineCounts[T]",
                "mismatches length equals 0",
                "AC-4 observed_status equals literal 'PASS' and observed_count >= 1",
                "ok === true"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "e2e"
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN pre_fix_mutable_self_hashed_report at cab5c071 WHEN implementer completes R2-C03 THEN red log + green evidence + path.json A devops-engineer under redhat-fix-s29-r2-c03-*",
      "verify": "test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c03-red.log && jq -e '.path==\"A\" and .agent==\"devops-engineer\"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-r2-c03-path.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "topology": "single-node",
        "verification_service": "filesystem",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pre_fix_mutable_self_hashed_report",
            "action": {
              "actor": "cli_user",
              "steps": [
                "capture red",
                "implement",
                "green",
                "path.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-5 report field ok equals true OR exit_code equals 1",
                "AC-5 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "red log size > 0",
                "AC-5 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-5 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ],
        "tier": "visible",
        "test_tier": "integration"
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "verify-reads tablesTotal equals catalog/export expected migrated table count and is >= 4",
      "maps_to_ac": "AC-1",
      "verify": "jq .tablesTotal verify-reads.json; compare to catalog listTableNames length"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "exportArchiveHash is 64-hex and matches on-disk immutable export archive digest",
      "maps_to_ac": "AC-1",
      "verify": "jq -e '(.exportArchiveHash|length)==64' ; sha256 archive compare"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "truncated one-table caller report yields ok false with non-empty mismatches",
      "maps_to_ac": "AC-2",
      "verify": "verify-reads against truncated fixture; jq .ok==false"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "rewritten mutable report fails provenance/archive binding",
      "maps_to_ac": "AC-3",
      "verify": "rewrite loadedByTable; verify-reads fails closed"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "full-set live counts equal baselineCounts for every table with mismatches empty",
      "maps_to_ac": "AC-4",
      "verify": "jq .tablesMatched==.tablesTotal and .mismatches==[]"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "RED evidence log non-empty for mutable self-hashed baseline defect at cab5c071",
      "maps_to_ac": "AC-5",
      "verify": "test -s redhat-fix-s29-r2-c03-red.log"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "runVerifyReads code path opens catalog and/or immutable export reader; does not sole-source from mapLoadedByTableToPgTargets(caller.loadedByTable)",
      "maps_to_ac": "AC-1",
      "verify": "rg + integration assertion on baseline_source/catalog fields"
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01",
    "CAP-MIG-01"
  ],
  "provides": [
    "immutable-export-catalog-bound-verify-reads",
    "truncated-report-rejection"
  ],
  "consumes": [
    "d06-04-export-archive-hash",
    "source-catalog-table-inventory",
    "redhat-fix-s29-h02-full-table-parity-intent"
  ],
  "boundary_contracts": [
    "Caller-authored loadedByTable cannot define a smaller success set than catalog/export",
    "exportArchiveHash is content-addressed and independently verifiable",
    "CAP-MIG-01 parity is full-table, not sample-table"
  ],
  "proposed_by": "mastra-planner",
  "source_finding": {
    "report": ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md",
    "reviewed_sha": "cab5c0717974a96e33c338105b5d198d82cb607d"
  }
}
-->

</details>
