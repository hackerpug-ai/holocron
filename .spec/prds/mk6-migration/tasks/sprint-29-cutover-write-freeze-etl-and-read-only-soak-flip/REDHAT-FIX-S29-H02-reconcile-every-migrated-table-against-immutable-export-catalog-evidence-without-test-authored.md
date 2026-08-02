# REDHAT-FIX-S29-H02 — Reconcile every migrated table against immutable export/catalog evidence without test-authored baselines (H-02; soak-fence.ts:624,671-706)

## What this does

Close red-hat H-02 by reconciling every migrated/mapped target table against immutable D06-04 export/catalog expected counts and by eliminating test-authored baseline replacement in soak tests.

## Why

Remediate red-hat finding for CAP-CUT-01 (REDHAT-FIX-S29-H02). Grounded in UC-SYNC-03 / UC-SYNC-04 / UC-SYNC-03, T-SYNC-010, T-SYNC-009, CAP-MIG-01. Review evidence: `.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md` (reviewed SHA `2b966c7b60559ec9986cf737ed5322a6146c7960`).

## How to verify

- `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-h02-red.log`
- `bun services/platform/src/cli/holo.ts cutover:verify-reads --json | jq -e '.ok==true and .tablesTotal>=4 and .tablesMatched==.tablesTotal and .mismatches==[]'`
- `rg -n 'loadedByTable' services/platform/tests/integration/sprint29-soak-flip.test.ts`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts`
- `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-h02-path.json`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: services/platform/src/cutover/soak-fence.ts — MODIFY runVerifyReads full-table set + baseline hash binding + report fields tablesTotal/tablesMatched, services/platform/tests/integration/sprint29-soak-flip.test.ts — MODIFY remove live-count baseline overwrite; assert full-table parity, services/platform/tests/integration/redhat-fix-s29-h02-read-parity.test.ts — NEW optional, services/platform/tests/fixtures/** — NEW frozen multi-table watermark fixture if needed (immutable counts), services/platform/src/cli/holo.ts — MODIFY only if verify-reads flags need baseline path/hash passthrough, .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/** — evidence

Prohibited: Rewriting production watermark-report.json from live counts in tests, Keeping READ_SAMPLE_TABLES as the sole reconciliation set, app/, components/, hooks/, screens/, convex/** deletion, Silent skip of loadedByTable keys, H-01 network transport rewrite (separate task)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-H02 — Reconcile every migrated table against immutable export/catalog evidence without test-authored baselines (H-02; soak-fence.ts:624,671-706)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-MIG-01, CAP-CUT-01
SPRINT:     [Sprint 29 — Cutover: Write Freeze, ETL and Read-Only Soak Flip](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
verify-reads ok only when every loadedByTable/mapped catalog table matches live Postgres counts exactly against an immutable ETL baseline; tests use frozen D06-04 artifacts; three-table hardcode removed as the sole set.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST derive the set of tables under reconciliation from the D06-04 ETL report loadedByTable keys and/or Sprint 14 catalog+LOAD_ORDER mapped targets present in the immutable export — NOT from a hard-coded READ_SAMPLE_TABLES of only three names (soak-fence.ts:624)
- MUST load expected counts immutably from the archived D06-04 watermark/ETL report (and/or immutable export row counts bound by exportArchiveHash) without rewriting that report from live SELECT count(*) in the test immediately before assert
- MUST compare every mapped target table: for each expected key, live Postgres count equals baseline count exactly; any mismatch appends to mismatches[] and forces ok==false
- MUST include at minimum all tables present in loadedByTable from the green ETL report (documents, conversations, and every other loaded key such as tasks, researchSessions, …) after name mapping camelCase→snake_case as needed
- MUST fail closed if the ETL report is missing, loadedByTable empty, or exportArchiveHash missing when hash-binding is required
- MUST remove/replace the sprint29-soak-flip.test.ts pattern that writeFileSync-es loadedByTable from live counts before verify-soak (lines 461-492)
- MUST preserve per-table evidence in perTableCounts and baselineCounts maps in the JSON report
- MUST capture RED evidence showing three-table sampling and/or test-authored baseline on pre-fix HEAD
- NEVER hardcode only documents/conversations/subscription_sources as the complete reconciliation set
- NEVER overwrite watermark-report.json loadedByTable with live DB counts in tests to force green
- NEVER assert only non-empty counts without equality to immutable baseline
- NEVER silently skip tables present in loadedByTable
- NEVER invent expected counts from fixtures unrelated to D06-04 export/catalog evidence
- STRICTLY tdd_mode red_first; evidence under .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/
- STRICTLY test_tier e2e/integration with live holocron_nonprod for count queries
- STRICTLY baseline file is content-addressed or treated read-only (exportArchiveHash / sha256 of watermark-report recorded in verify-reads report)
- STRICTLY tablesTotal and tablesMatched are concrete integers in the report (tablesMatched==tablesTotal for ok true)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN immutable_etl_baseline WHEN cutover:verify-reads --json THEN full mapped table se...
- [ ] AC-2: GIVEN immutable_etl_baseline WHEN verify-reads compares live counts THEN exact equality...
- [ ] AC-3: GIVEN immutable_etl_baseline WHEN verify-reads binds baseline artifact THEN hash-bound ...
- [ ] AC-4: GIVEN immutable_etl_baseline WHEN one table diverges THEN verify-reads fails closed
- [ ] AC-5: GIVEN pre_fix_three_table_and_test_authored_baseline WHEN implementer completes H-02 TH...
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — Table set derived from immutable ETL loadedByTable / catalog mapping (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN immutable_etl_baseline WHEN cutover:verify-reads --json THEN full mapped table set used
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: postgres
  VERIFY: `bun services/platform/src/cli/holo.ts cutover:verify-reads --json | jq -e '.tablesTotal >= 4 and .tablesTotal == (.perTableCounts|keys|length) and .tablesTotal == (.baselineCounts|keys|length)'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if READ_SAMPLE_TABLES only three names (soak-fence.ts:624,671-706); tablesTotal hardcoded 3; empty loadedByTable treated as success
  START_REF: immutable_etl_baseline
  MUST_OBSERVE: tablesTotal is integer >= 4; perTableCounts key count equals tablesTotal; baselineCounts key count equals tablesTotal; table set includes documents and conversations; table set includes at least one additional mapped table beyond subscription_sources (e.g. tasks or research_sessions); baseline_source or etl_run_id non-empty referencing D06-04 run
  MUST_NOT_OBSERVE: empty/start signature: tablesTotal equals 3 with only documents/conversations/subscription_sources; tablesTotal equals 0; baselineCounts empty while ok true
  EVIDENCE: db_query (required_capture=True)

### AC-2 — Exact per-table equality against immutable baseline (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN immutable_etl_baseline WHEN verify-reads compares live counts THEN exact equality all tables
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: postgres
  VERIFY: `jq -e '.ok==true and .mismatches==[] and .tablesMatched==.tablesTotal and .tablesTotal>0'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if only non-empty asserted without equality; mismatch silently ignored; ok true with mismatches non-empty
  START_REF: immutable_etl_baseline
  MUST_OBSERVE: for every table T, perTableCounts[T] === baselineCounts[T] (documented sample: documents 10==10, conversations 5==5, and >=1 other table equality); mismatches array length equals 0; tablesMatched equals tablesTotal; ok === true
  MUST_NOT_OBSERVE: empty/start signature: ok true with any per-table mismatch; mismatches length > 0 with ok true; tablesMatched < tablesTotal with ok true
  EVIDENCE: db_query (required_capture=True)

### AC-3 — Immutable baseline binding (hash / read-only artifact) (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN immutable_etl_baseline WHEN verify-reads binds baseline artifact THEN hash-bound immutable baseline required
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem+postgres
  VERIFY: `jq -e '(.baseline_hash|length)==64 or (.exportArchiveHash|length)==64' verify-reads.json; test -f "$ETL_REPORT"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if baseline rewritten from live counts in-test (sprint29-soak-flip.test.ts:461-492); missing ETL report still ok true; no hash/binding field
  START_REF: immutable_etl_baseline
  MUST_OBSERVE: baseline_hash is 64-hex OR exportArchiveHash is 64-hex OR both present; baseline_path non-empty string; etl_run_id non-empty; rg of sprint29-soak-flip.test.ts shows no writeFileSync of loadedByTable from live SELECT count immediately before verify-soak (match count for the anti-pattern == 0)
  MUST_NOT_OBSERVE: empty/start signature: baseline_hash empty and exportArchiveHash empty while ok true; test rewrites ETL report from live counts before assert; ok true with missing ETL report
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — Induced mismatch fails overall (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN immutable_etl_baseline WHEN one table diverges THEN verify-reads fails closed
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: postgres
  VERIFY: `induce divergence; holo cutover:verify-reads --json | jq -e '.ok==false and (.mismatches|length)>=1'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if divergence still ok true; only three-table sample hides divergence on unsampled table
  START_REF: immutable_etl_baseline
  MUST_OBSERVE: ok === false; mismatches length >= 1; mismatches[0] string includes table name and live= and baseline= integers; tablesMatched < tablesTotal
  MUST_NOT_OBSERVE: empty/start signature: ok true after divergence; mismatches empty with unequal counts; divergence only possible on documents because other tables unsampled
  EVIDENCE: db_query (required_capture=True)

### AC-5 — TDD evidence chain for H-02 (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN pre_fix_three_table_and_test_authored_baseline WHEN implementer completes H-02 THEN red/green/path evidence present
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: tdd evidence
  VERIFY: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-h02-red.log && jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-h02-path.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if no red log; tests still rewrite baseline; green without tablesTotal>=4
  START_REF: pre_fix_three_table_and_test_authored_baseline
  MUST_OBSERVE: red log size > 0; path equals A; agent equals devops-engineer; green verify-reads report tablesTotal >= 4
  MUST_NOT_OBSERVE: empty/start signature: green only; test still overwrites loadedByTable from live counts
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | tablesTotal >= 4 and equals perTableCounts key count | AC-1 | `jq -e '.tablesTotal >= 4 and .tablesTotal==(.perTableCounts\|keys\|length)'` |
| TC-2 | every baseline table count equals live count | AC-2 | `jq -e '.ok and .mismatches==[] and .tablesMatched==.tablesTotal'` |
| TC-3 | baseline hash or exportArchiveHash present (64-hex) | AC-3 | `jq -e '((.baseline_hash//"")\|length)==64 or ((.exportArchiveHash//"")\|length)==64'` |
| TC-4 | suite source does not write live counts into ETL baseline before verify | AC-3 | `rg -n 'loadedByTable' services/platform/tests/integration/sprint29-soak-flip.test.ts \|...` |
| TC-5 | induced single-table divergence → ok false | AC-4 | `PLATFORM_IT=1 vitest -t 'mismatch\|divergence\|H-02'` |
| TC-6 | missing ETL report → ok false | AC-3 | `holo cutover:verify-reads --json with missing path; jq -e '.ok==false'` |
| TC-7 | RED log non-empty | AC-5 | `test -s redhat-fix-s29-h02-red.log` |
| TC-8 | documents and conversations still exact-match as part of full set | AC-2 | `jq -e '.perTableCounts.documents==.baselineCounts.documents and .perTableCounts.convers...` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cutover/soak-fence.ts — MODIFY runVerifyReads full-table set + baseline hash binding + report fields tablesTotal/tablesMatched
- services/platform/tests/integration/sprint29-soak-flip.test.ts — MODIFY remove live-count baseline overwrite; assert full-table parity
- services/platform/tests/integration/redhat-fix-s29-h02-read-parity.test.ts — NEW optional
- services/platform/tests/fixtures/** — NEW frozen multi-table watermark fixture if needed (immutable counts)
- services/platform/src/cli/holo.ts — MODIFY only if verify-reads flags need baseline path/hash passthrough
- .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/** — evidence
writeProhibited:
- Rewriting production watermark-report.json from live counts in tests
- Keeping READ_SAMPLE_TABLES as the sole reconciliation set
- app/, components/, hooks/, screens/
- convex/** deletion
- Silent skip of loadedByTable keys
- H-01 network transport rewrite (separate task)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:86-92 — H-02 HIGH finding + remediation
2. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:43 — D06-05 AC-3 FAIL matrix (three tables only)
3. services/platform/src/cutover/soak-fence.ts:624 — READ_SAMPLE_TABLES three-only constant
4. services/platform/src/cutover/soak-fence.ts:671-706 — three-table count loop and weak ok predicate
5. services/platform/tests/integration/sprint29-soak-flip.test.ts:461-492 — test overwrites ETL baseline with live counts
6. services/platform/src/cutover/etl-orchestrate.ts — loadedByTable emission
7. services/platform/src/etl/run.ts:36-73 — LOAD_ORDER mapped load targets
8. .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml — catalog tables
9. D06-04-capture-export-watermark-orchestrate-the-one-time-etl-run.md — immutable export/catalog evidence
10. D06-05 AC-3 — Postgres zero_pub table counts match watermark baseline

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED baseline: `test -s .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-h02-red.log` → Non-empty red log for three-table sample and/or test-authored baseline
- verify-reads full parity: `bun services/platform/src/cli/holo.ts cutover:verify-reads --json | jq -e '.ok==true and .tablesTotal>=4 and .tablesMatched==.tablesTotal and .mismatches==[]'` → Full-table exact match against immutable baseline
- Suite anti-pattern gone: `rg -n 'loadedByTable' services/platform/tests/integration/sprint29-soak-flip.test.ts` → No writeFileSync of live SELECT counts into ETL report before verify (manual/assert in test review)
- Integration suite: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-soak-flip.test.ts` → Exit 0 with H-02 full-table + mismatch cases
- path.json: `jq -e '.path=="A" and .agent=="devops-engineer"' .tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/redhat-fix-s29-h02-path.json` → path A + devops-engineer

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md#H-02, services/platform/src/cutover/soak-fence.ts:624,671-706, services/platform/tests/integration/sprint29-soak-flip.test.ts:461-492, services/platform/src/cutover/etl-orchestrate.ts — loadedByTable, services/platform/src/etl/run.ts LOAD_ORDER, .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml
Interaction notes:
- Use the same name mapping already started in baselineTableKey() but drive keys from loadedByTable, not a constant of three
- If a catalog table is disposition drop/archive/regenerate, exclude only when D06-04 report/catalog says so — never silent skip of loaded tables
- Prefer freezing a multi-table watermark fixture under tests/fixtures or .tmp from a real ETL rather than inventing counts
pattern: Derive reconciliation table list from D06-04 watermark-report loadedByTable keys (map camelCase ETL keys to Postgres snake_case) unioned with catalog/LOAD_ORDER mapped targets present in the immutable export. Compare SELECT count(*) per table to immutable expected counts. Record baseline_hash=sha256(ETL report file) or reuse exportArchiveHash. Remove test writeFileSync of live counts into the ETL fixture.
pattern_source: D06-04 etl-orchestrate loadedByTable + services/platform/src/etl/run.ts LOAD_ORDER + D06-05 AC-3 full parity intent
anti_pattern: READ_SAMPLE_TABLES three-only (624); loop only three tables (671-706); overwriting greenEtlPath loadedByTable from live SELECT before verify-soak (test:461-492); asserting non-empty without equality

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — PRIMARY surface is cutover:verify-reads reconciliation against D06-04 immutable ETL watermark/export/catalog loadedByTable for every mapped target table, plus removing test-authored baseline overwrites in sprint29-soak-flip.test.ts. This is CAP-MIG-01/CAP-CUT-01 cutover verification owned by devops-engineer (D06-04/D06-05 lineage), not Mastra agent implementation. Implementer stays devops-engineer; proposed_by mastra-planner; reviewer mastra-reviewer.
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer when domain-scoped)
Proposed By: mastra-planner

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D06-04, D06-05
Blocks: unqualified-sprint-29-close

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
['Finding lineage: red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md H-02; reviewed SHA 2b966c7b60559ec9986cf737ed5322a6146c7960', 'D06-05 AC-3 parent contract required full migrated-table parity; landed code sampled three tables only', 'ETL LOAD_ORDER currently enumerates 36 load targets — verify-reads should cover every key present in the concrete D06-04 loadedByTable for the cutover run, not a fixed 3']

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-H02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "immutable_etl_baseline": {
      "description": "Frozen D06-04 watermark/ETL report with unexplainedVariance==0, non-empty runId, multi-key loadedByTable (documents, conversations, and additional LOAD_ORDER/catalog tables), optional exportArchiveHash 64-hex. File is not rewritten by tests.",
      "seed_method": "recorded_external",
      "records": [
        "watermark-report.json from cutover:run-etl with loadedByTable multi-key",
        "exportArchiveHash or content hash recorded",
        "Postgres holocron_nonprod loaded from that ETL"
      ]
    },
    "pre_fix_three_table_and_test_authored_baseline": {
      "description": "Pre-fix HEAD at 2b966c7b: READ_SAMPLE_TABLES three tables; soak test overwrites ETL baseline with live counts at sprint29-soak-flip.test.ts:461-492.",
      "seed_method": "recorded_external",
      "records": [
        "soak-fence.ts:624 READ_SAMPLE_TABLES",
        "soak-fence.ts:671-706 only three-table loop",
        "sprint29-soak-flip.test.ts:461-492 writeFileSync loadedByTable from live counts"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN immutable_etl_baseline WHEN verify-reads runs THEN tablesTotal>=4 from loadedByTable/catalog mapping, not only three sample tables",
      "verify": "jq tablesTotal and keys",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "READ_SAMPLE_TABLES only three (soak-fence.ts:624,671-706)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "immutable_etl_baseline",
            "action": {
              "actor": "operator",
              "steps": [
                "run verify-reads",
                "inspect tablesTotal and keys"
              ]
            },
            "end_state": {
              "must_observe": [
                "tablesTotal >= 4",
                "perTableCounts keys == tablesTotal",
                "baselineCounts keys == tablesTotal",
                "includes documents and conversations",
                "includes >=1 additional mapped table",
                "etl_run_id non-empty"
              ],
              "must_not_observe": [
                "empty/start signature: tablesTotal==3 only sample set",
                "tablesTotal==0",
                "baselineCounts empty with ok true"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN immutable_etl_baseline WHEN counts compared THEN every table exact equality; mismatches empty; tablesMatched==tablesTotal",
      "verify": "jq ok mismatches tablesMatched",
      "maps_to_ac": null,
      "test_tier": "e2e",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "non-empty only without equality"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "immutable_etl_baseline",
            "action": {
              "actor": "operator",
              "steps": [
                "verify-reads equality"
              ]
            },
            "end_state": {
              "must_observe": [
                "all perTableCounts[T]==baselineCounts[T]",
                "mismatches length 0",
                "tablesMatched==tablesTotal",
                "ok true"
              ],
              "must_not_observe": [
                "empty/start signature: ok true with mismatch",
                "tablesMatched < tablesTotal with ok true"
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
      "flow_ref": "T-SYNC-009",
      "description": "GIVEN immutable_etl_baseline WHEN verify-reads binds baseline THEN baseline_hash or exportArchiveHash 64-hex present; tests do not rewrite baseline from live counts",
      "verify": "jq baseline_hash; rg test anti-pattern",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "sprint29-soak-flip.test.ts:461-492 rewrite pattern remains"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "immutable_etl_baseline",
            "action": {
              "actor": "operator",
              "steps": [
                "hash baseline file",
                "verify-reads",
                "assert no test rewrite"
              ]
            },
            "end_state": {
              "must_observe": [
                "baseline_hash or exportArchiveHash 64-hex",
                "baseline_path non-empty",
                "etl_run_id non-empty",
                "no live-count writeFileSync into ETL baseline before verify in suite"
              ],
              "must_not_observe": [
                "empty/start signature: no hash binding with ok true",
                "test-authored loadedByTable replacement"
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
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN immutable_etl_baseline WHEN one table diverges THEN ok false and mismatches>=1",
      "verify": "induce divergence; jq ok false",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "unsampled table divergence invisible"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "immutable_etl_baseline",
            "action": {
              "actor": "cli_user",
              "steps": [
                "diverge one table",
                "verify-reads",
                "restore"
              ]
            },
            "end_state": {
              "must_observe": [
                "ok false",
                "mismatches length >= 1",
                "mismatch string includes table and live/baseline integers",
                "tablesMatched < tablesTotal"
              ],
              "must_not_observe": [
                "empty/start signature: ok true after divergence",
                "mismatches empty"
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
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN pre_fix_three_table_and_test_authored_baseline WHEN complete THEN red/green/path evidence",
      "verify": "red log + path.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "no red log"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "pre_fix_three_table_and_test_authored_baseline",
            "action": {
              "actor": "cli_user",
              "steps": [
                "red",
                "implement",
                "green",
                "path.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "red log size > 0",
                "path A",
                "agent devops-engineer",
                "green tablesTotal >= 4"
              ],
              "must_not_observe": [
                "empty/start signature: green only",
                "test baseline rewrite remains"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "tablesTotal>=4 full key set",
      "maps_to_ac": "AC-1",
      "verify": "jq tablesTotal"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "exact equality all tables",
      "maps_to_ac": "AC-2",
      "verify": "jq mismatches empty"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "baseline hash binding",
      "maps_to_ac": "AC-3",
      "verify": "jq baseline_hash|exportArchiveHash"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "no test-authored baseline overwrite",
      "maps_to_ac": "AC-3",
      "verify": "rg suite anti-pattern == 0"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "induced mismatch fails",
      "maps_to_ac": "AC-4",
      "verify": "vitest mismatch case"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "missing ETL report fails",
      "maps_to_ac": "AC-3",
      "verify": "verify-reads missing path ok false"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "red log present",
      "maps_to_ac": "AC-5",
      "verify": "test -s red log"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "documents/conversations still exact within full set",
      "maps_to_ac": "AC-2",
      "verify": "jq documents/conversations equality"
    }
  ],
  "touches_capabilities": [
    "CAP-MIG-01",
    "CAP-CUT-01"
  ],
  "provides": [
    "full-table-read-parity-verify",
    "immutable-etl-baseline-binding"
  ],
  "consumes": [
    "d06-04-watermark-etl-report",
    "sprint-14-etl-load-order-and-catalog",
    "d06-05-verify-reads-cli"
  ],
  "boundary_contracts": [
    "Immutable D06-04 baseline only",
    "Every mapped loaded table compared",
    "No test-authored expected counts from live DB"
  ],
  "proposed_by": "mastra-planner"
}
-->

</details>
