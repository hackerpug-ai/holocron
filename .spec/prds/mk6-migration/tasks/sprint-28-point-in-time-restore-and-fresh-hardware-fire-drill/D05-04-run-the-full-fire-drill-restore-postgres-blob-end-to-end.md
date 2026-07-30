# D05-04 — Run the full fire-drill restore (Postgres + blob) end-to-end
> Status: ✅ Completed
> Completed: 2026-07-29T01:13:23Z

## What this does

Executes the full CAP-BAK-01 fire drill: restore Postgres via D05-02 from R2 alone onto the fresh target from D05-03, then verify (a) per-table row counts match, (b) evidence-ledger as-of chain is intact, and (c) blob SHA-256 digests match the restic manifest


**Provides:** End-to-end fire drill restore procedure (holo restore:fire-drill command or script); Parity report comparing restored state to pre-failure snapshot; Evidence ledger chain verification


**Consumes:** D05-02 (holo restore --pitr command); D05-03 (fresh target); Sprint 27 backup_heartbeat and R2 repo (D04-02/D04-03); Sprint 27 restic blob mirror (D04-04)


## Why

CAP-BAK-01 requires a real fire-drill restore proven by parity checks — not just 'restore succeeded' but 'restored state is identical to pre-failure state'


Grounded in: UC-PLAT-06, T-PLAT-025, CAP-BAK-01.


## How to verify

Run holo restore:fire-drill on the fresh target; capture pre-failure snapshot row counts; restore Postgres; run parity-report.ts to compare row counts, ledger chain checksum, and blob SHA-256 digests; report exit 0 only if all checks pass


## Scope


**Writes:** services/platform/src/backup/fire-drill.ts (NEW); services/platform/src/backup/parity-report.ts (NEW); services/platform/src/backup/evidence-ledger-verify.ts (NEW); services/platform/src/cli/holo.ts (MODIFY — add holo restore:fire-drill case); scripts/fire-drill.sh (NEW — optional wrapper script)


**Prohibited:** Modifying the evidence ledger schema (Sprint 04 owns); Skipping parity checks or assuming success without verification; Using the original mini's PGDATA or blob storage; Emitting exit 0 when any parity check fails; Hardcoding expected counts/digests (must capture from pre-failure snapshot)


<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>


================================================================================
TASK: D05-04 — Run the full fire-drill restore (Postgres + blob) end-to-end
================================================================================
TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L  (150 min)
AGENT:      devops-engineer
PROPOSED-BY: devops-engineer
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Execute a full fire-drill restore onto fresh hardware using only the remote R2 repository, then verify the restored state is bit-for-bit identical to the pre-failure state

**Success state:** holo restore:fire-drill completes with exit 0; the parity report shows (a) all table row counts exactly match the immutable R2 recovery baseline (e.g., beliefs=1234, sources=56, passages=789), (b) evidence-ledger SHA-256 matches baseline.ledger_sha256 (collision-resistant — never MD5-only as sole oracle), (c) blob SHA-256 digests all match the restic / baseline blob_manifest_sha256; the restored Postgres is queryable and the blob store is fully hydrated

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST restore Postgres from R2 alone using holo restore --pitr
- MUST load the immutable recovery baseline from R2 (recovery-baseline.json bound to pgBackRest label + restic snapshot id + target LSN/timestamp) as the parity oracle — not live mini state alone
- MUST capture pre-failure snapshot of per-table row counts and evidence-ledger SHA-256 (or load the R2-retained baseline written at backup time)
- MUST compare restored Postgres row counts to baseline/pre-failure snapshot (exact match)
- MUST verify evidence-ledger as-of chain integrity (tx_from/tx_to validity windows preserved)
- MUST restore blobs via restic and verify SHA-256 digests match source manifest / baseline.blob_manifest_sha256
- MUST emit a parity report artifact documenting the comparison (including baseline_id or pgbackrest_backup_label)
- MUST fail non-zero if any parity check fails or if the recovery baseline is missing/unverified
- NEVER use the original mini's PGDATA or blob storage during restore
- NEVER skip the pre-failure snapshot / baseline load
- NEVER accept approximate row count matches (must be exact)
- NEVER accept a corrupted or truncated evidence ledger chain
- NEVER use MD5 as the only ledger integrity mechanism (SHA-256 or stronger required; REDHAT-FIX-C5)
- NEVER ignore blob SHA-256 mismatches
- NEVER return exit 0 when parity checks fail
- STRICTLY pre-failure snapshot / recovery baseline is captured BEFORE the restore begins (not after)
- STRICTLY row counts are per-table COUNT(*) from restored Postgres compared to R2 baseline (or snapshot co-retained with backup)
- STRICTLY evidence-ledger integrity is verified by a collision-resistant digest (SHA-256 of concatenated belief/claim/passage/source rows ordered by id) matching baseline.ledger_sha256
- STRICTLY blob parity uses SHA-256 content-addressable verification (every object's digest matches)
- STRICTLY parity report includes concrete counts/digests (not just 'passed')

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): Postgres restore and row-count parity
- [ ] AC-2: Evidence ledger as-of chain integrity
- [ ] AC-3: Blob SHA-256 parity from restic restore
- [ ] AC-4: End-to-end fire drill emits unified parity report
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — proven by real services)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Postgres restore and row-count parity (flow_ref T-PLAT-025)
  GIVEN: Fresh restore target from D05-03 with R2 read-only credentials and empty PGDATA
  WHEN:  operator runs holo restore:fire-drill --target-timestamp <pre-failure-timestamp> --scratch <pgdata-path>
  THEN:  holo restore --pitr restores Postgres; pre-failure snapshot is captured; restored Postgres row counts are compared to snapshot; all per-table counts match exactly (e.g., beliefs=1234, sources=56, passages=789); parity report shows POSTGRES_PARITY_PASS=true
  TEST_TIER: e2e · VERIFICATION_SERVICE: pgBackRest+R2+Postgres+fire-drill-parity · TDD_STATE: none
  SCENARIO — start_ref: fresh_target_with_r2_creds · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if restore command is a stub; row-count comparison is skipped; parity report shows pass despite mismatch
    MUST_OBSERVE: process exit code = 0; test -f parity-report.json exit = 0 (file exists); jq '.POSTGRES_PARITY_PASS' parity-report.json = true; jq '.row_counts.beliefs' parity-report.json = <N> AND psql -c 'SELECT COUNT(*) FROM beliefs' = <N> (counts match); jq '.row_counts.sources' parity-report.json = <M> AND psql -c 'SELECT COUNT(*) FROM sources' = <M>
    MUST_NOT_OBSERVE: exit code != 0; test -f parity-report.json exit != 0; jq '.POSTGRES_PARITY_PASS' = false; psql COUNT(*) != jq '.row_counts.*'; row_counts key missing (empty)
  verify: holo restore:fire-drill --target-timestamp 2024-01-15T12:00:00Z --scratch /var/lib/postgresql/restore; parity-report.json contains 'POSTGRES_PARITY_PASS': true and 'row_counts': {'beliefs': 1234, 'sources': 56, 'passages': 789}

AC-2 Evidence ledger as-of chain integrity (flow_ref T-PLAT-025)
  GIVEN: Restored Postgres with row-count parity verified against the R2 recovery baseline
  WHEN:  operator runs evidence-ledger-verify / baseline compare against the restored database
  THEN:  the evidence ledger (beliefs, sources, passages, claims, relations) preserves the as-of chain: tx_from/tx_to validity windows match, supersedes_id chains are intact, a collision-resistant ledger_sha256 (SHA-256 of ordered concatenated rows) matches the immutable R2 recovery baseline (REDHAT-FIX-C5) — MD5-only is never the sole oracle
  TEST_TIER: e2e · VERIFICATION_SERVICE: Postgres+evidence-ledger-verify+recovery-baseline · TDD_STATE: none
  SCENARIO — start_ref: postgres_restored_with_row_parity · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if ledger checksum is not computed (assumes match - no-op); checksum comparison passes despite mismatch (stub); MD5-only used as sole ledger oracle; tx windows corrupted but report shows pass (static shell)
    MUST_OBSERVE: jq '.LEDGER_CHECKSUM_MATCH' parity-report.json = true; ledger digest equals baseline.ledger_sha256 (64-hex or sha256:…); SELECT tx_from, tx_to FROM beliefs WHERE id='<sample-id>' returns 2 non-null timestamps (validity windows intact)
    MUST_NOT_OBSERVE: jq '.LEDGER_CHECKSUM_MATCH' = false; empty ledger digest; MD5-only (32-hex) as sole ledger field without SHA-256 baseline; SELECT tx_from, tx_to returns NULL for non-deleted row (corrupted)
  verify: load recovery-baseline from R2; compareRestoredToBaseline; parity-report.json contains 'LEDGER_CHECKSUM_MATCH': true and ledger_sha256 matching baseline

AC-3 Blob SHA-256 parity from restic restore (flow_ref T-PLAT-025)
  GIVEN: Restored Postgres with ledger parity verified
  WHEN:  operator runs restic restore and blob-verify against the restored blob store
  THEN:  restic restores all blobs to the target directory; blob-verify computes SHA-256 for each object and compares against the source manifest; all digests match; parity report contains 'BLOB_PARITY_PASS': true and 'matched_objects': <N> (actual count)
  TEST_TIER: e2e · VERIFICATION_SERVICE: restic+blob-verify · TDD_STATE: none
  SCENARIO — start_ref: postgres_restored_with_ledger_parity · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if restic restore is stubbed (no actual restore - no-op); SHA-256 computation skipped (assumes match - mock); parity report shows pass despite SHA mismatches (static shell)
    MUST_OBSERVE: restic restore exit code = 0 AND restored object count > 0; jq '.BLOB_PARITY_PASS' parity-report.json = true; jq '.matched_objects' parity-report.json = <K> AND <K> > 0 (non-zero count); sha256sum /var/lib/holocron/blob-restore/<sample-file> digest = manifest digest for <sample-file>
    MUST_NOT_OBSERVE: restic restore exit code != 0; jq '.BLOB_PARITY_PASS' = false; jq '.matched_objects' = 0 (zero objects - fake-success start state); sha256sum digest != manifest digest
  verify: restic restore r2:holocron-blobs --target /var/lib/holocron/blob-restore; blob-verify --root /var/lib/holocron/blob-restore; parity-report.json contains 'BLOB_PARITY_PASS': true and 'matched_objects': 4321 (actual count)

AC-4 End-to-end fire drill emits unified parity report (flow_ref T-PLAT-025)
  GIVEN: Fresh restore target and R2 repo with complete backup set
  WHEN:  operator runs holo restore:fire-drill --target-timestamp <timestamp> --scratch <pgdata> --blob-dir <blob-dir>
  THEN:  the full end-to-end flow executes: pre-failure snapshot captured, Postgres restored, row counts compared, ledger checksum computed, blobs restored and verified, unified parity-report.json emitted containing all three parity checks with concrete counts/digests; exit 0 only if all pass; exit non-zero if any fail
  TEST_TIER: e2e · VERIFICATION_SERVICE: full-fire-drill-stack · TDD_STATE: none
  SCENARIO — start_ref: fresh_target_with_r2_creds · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if fire-drill command stubs (returns success without running - no-op); parity report shows all pass without computing checksums (mock); exit 0 despite parity failures (static shell)
    MUST_OBSERVE: exit code = 0; jq '.POSTGRES_PARITY_PASS' parity-report.json = true AND jq '.LEDGER_CHECKSUM_MATCH' = true AND jq '.BLOB_PARITY_PASS' = true (3 true); jq '.matched_objects' parity-report.json = <K> AND <K> > 0 (non-zero); psql -c 'SELECT 1' exit 0 (restored Postgres queryable); find /var/lib/holocron/blobs -type f | wc -l > 0 (blobs present)
    MUST_NOT_OBSERVE: exit code != 0; any jq '.*_PASS' = false; jq '.matched_objects' = 0 (no objects); exit code = 0 AND jq '.*_PASS' contains false AND matched_objects = 0 (fake-success start state)
  verify: holo restore:fire-drill --target-timestamp 2024-01-15T12:00:00Z --scratch /var/lib/postgresql/restore --blob-dir /var/lib/holocron/blobs; exit code 0; parity-report.json contains POSTGRES_PARITY_PASS=true, LEDGER_CHECKSUM_MATCH=true, BLOB_PARITY_PASS=true with concrete values

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/fire-drill.ts (NEW)
- services/platform/src/backup/parity-report.ts (NEW)
- services/platform/src/backup/evidence-ledger-verify.ts (NEW)
- services/platform/src/cli/holo.ts (MODIFY — add holo restore:fire-drill case)
- scripts/fire-drill.sh (NEW — optional wrapper script)
writeProhibited: Modifying the evidence ledger schema (Sprint 04 owns); Skipping parity checks or assuming success without verification; Using the original mini's PGDATA or blob storage; Emitting exit 0 when any parity check fails; Hardcoding expected counts/digests (must capture from pre-failure snapshot)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-03-configure-continuous-wal-archiving-and-scheduled-base-backups.md:32-280 [INFRA task structure with REQUIREMENT-CONTRACT v1 block, AC/TC pattern, scenario shaping with concrete must_observe values]
2. /Users/inference1/Projects/holocron/services/platform/src/db/schema/evidence.ts:1-175 [Evidence ledger schema (beliefs, sources, passages, claims, relations) with tx_from/tx_to bi-temporal windows and supersedes_id chains]
3. /Users/inference1/Projects/holocron/services/platform/src/blob/verify.ts:1-60 [Blob verification pattern: SHA-256 parity computation, manifest comparison, BlobVerifyReport structure]
4. /Users/inference1/Projects/holocron/services/platform/src/backup/restore.ts:1-50 [PITR restore command from D05-02 (wrapped by fire-drill)]
5. https://restic.readthedocs.io/en/stable/040_restore.html:1-80 [restic restore command options and flow]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Full fire-drill execution: `holo restore:fire-drill --target-timestamp 2024-01-15T12:00:00Z --scratch /var/lib/postgresql/restore --blob-dir /var/lib/holocron/blobs` → Exit 0; parity-report.json contains POSTGRES_PARITY_PASS=true, LEDGER_CHECKSUM_MATCH=true, BLOB_PARITY_PASS=true with concrete values
- Postgres row-count parity: `jq '.POSTGRES_PARITY_PASS' parity-report.json -> true; jq '.row_counts' -> contains beliefs, sources, passages with counts >0` → POSTGRES_PARITY_PASS true; row_counts has keys with values >0
- Evidence ledger checksum: `jq '.LEDGER_CHECKSUM_MATCH' parity-report.json -> true; jq '.ledger_checksum' -> non-empty hex string` → LEDGER_CHECKSUM_MATCH true; ledger_checksum is 32-char hex
- Blob SHA-256 parity: `jq '.BLOB_PARITY_PASS' parity-report.json -> true; jq '.matched_objects' -> integer >0` → BLOB_PARITY_PASS true; matched_objects >0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check services/platform/src/backup/ services/platform/src/cli/holo.ts` → Exit 0

--------------------------------------------------------------------------------
DESIGN / ANTI-PATTERN
--------------------------------------------------------------------------------
pattern: End-to-end integration test that orchestrates multiple real-service restores and emits a unified parity report with concrete values
anti_pattern: Stubbing any restore step; assuming parity without concrete comparison; emitting success without capturing actual counts/digests; using the source DB as the baseline (must use snapshot)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D04-02, D04-03, D04-04, D05-02, D05-03 · Blocks: D05-05, D05-06

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D05-04",
  "proposed_by": "devops-engineer",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fresh_target_with_r2_creds": {
      "description": "Fresh restore target (VM/container) with Postgres installed, empty PGDATA/blob dirs, R2 read-only credentials configured, isolation verified, holo CLI installed",
      "seed_method": "cli",
      "records": [
        "prove-isolation.sh exited 0",
        "postgres --version returns",
        "/var/lib/postgresql/restore empty and writable",
        "/var/lib/holocron/blobs empty and writable",
        "R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY set (read-only)",
        "holo --version returns"
      ]
    },
    "postgres_restored_with_row_parity": {
      "description": "Postgres restored via holo restore --pitr, started and serving queries, row counts verified against pre-failure snapshot, POSTGRES_PARITY_PASS=true in parity report",
      "seed_method": "cli",
      "records": [
        "holo restore --pitr completed with exit 0",
        "Postgres running on restored PGDATA",
        "parity-report.json exists with POSTGRES_PARITY_PASS:true",
        "row_counts: beliefs:<N>, sources:<M>, passages:<K>"
      ]
    },
    "postgres_restored_with_ledger_parity": {
      "description": "Postgres restored with row-count parity verified AND evidence ledger checksum computed and matched (LEDGER_CHECKSUM_MATCH=true)",
      "seed_method": "cli",
      "records": [
        "POSTGRES_PARITY_PASS:true",
        "LEDGER_CHECKSUM_MATCH:true",
        "ledger_checksum: <actual-hex-digest>",
        "sample belief has valid tx_from/tx_to"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-025",
      "description": "GIVEN fresh target WHEN operator runs holo restore:fire-drill THEN Postgres restored; pre-failure snapshot captured; row counts compared exactly; parity report shows POSTGRES_PARITY_PASS:true with concrete counts",
      "verify": "holo restore:fire-drill --target-timestamp <ts> --scratch <pgdata>; parity-report.json contains POSTGRES_PARITY_PASS:true and row_counts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "pgBackRest+R2+Postgres+fire-drill-parity",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "restore command is a stub",
            "row-count comparison is omitted",
            "parity report shows pass despite mismatch (static)",
            "pre-failure snapshot captured AFTER restore"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_target_with_r2_creds",
            "action": {
              "actor": "operator",
              "steps": [
                "run holo restore:fire-drill --target-timestamp 2024-01-15T12:00:00Z --scratch /var/lib/postgresql/restore",
                "inspect parity-report.json",
                "verify restored counts match"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit = 0",
                "test -f parity-report.json exit = 0",
                "jq '.POSTGRES_PARITY_PASS' = true",
                "jq '.row_counts.beliefs' = <N> AND psql COUNT(*) = <N>",
                "jq '.row_counts.sources' = <M> AND psql COUNT(*) = <M>"
              ],
              "must_not_observe": [
                "exit code != 0",
                "test -f parity-report.json exit != 0",
                "jq '.POSTGRES_PARITY_PASS' = false",
                "psql COUNT(*) != jq '.row_counts.*'",
                "row_counts key missing (empty)",
                "exit code = 0 AND jq '.POSTGRES_PARITY_PASS' = true AND row_counts = {} (empty counts)"
              ]
            }
          }
        ],
        "primary": true
      },
      "test_tier": "e2e"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "description": "GIVEN restored Postgres WHEN operator runs evidence-ledger-verify THEN ledger checksum computed; matches pre-failure snapshot; parity report shows LEDGER_CHECKSUM_MATCH:true with hex digest",
      "verify": "evidence-ledger-verify --db-url <restore-db>; parity-report.json contains LEDGER_CHECKSUM_MATCH:true and ledger_checksum",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Postgres+evidence-ledger-verify",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "checksum not computed",
            "pass despite mismatch",
            "tx windows corrupted",
            "stub/static implementation hardcodes pass without real product behavior",
            "mock empty start state still passes oracle"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_restored_with_row_parity",
            "action": {
              "actor": "operator",
              "steps": [
                "run evidence-ledger-verify --db-url postgresql://localhost/restore_db",
                "inspect parity-report.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "jq '.LEDGER_CHECKSUM_MATCH' = true",
                "jq '.ledger_checksum' = <hex-digest> (32-char)",
                "SELECT tx_from,tx_to FROM beliefs WHERE id='<sid>' returns 2 non-null"
              ],
              "must_not_observe": [
                "jq '.LEDGER_CHECKSUM_MATCH' = false",
                "jq '.ledger_checksum' = null",
                "SELECT tx_from,tx_to returns NULL",
                "empty/start signature: (0) or blank success without real work"
              ]
            }
          }
        ],
        "primary": false
      },
      "test_tier": "e2e"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "description": "GIVEN restored Postgres WHEN operator runs restic restore and blob-verify THEN blobs restored; SHA-256 digests compared to manifest; all match; parity report shows BLOB_PARITY_PASS:true with matched_objects count",
      "verify": "restic restore r2:holocron-blobs --target <blob-dir>; blob-verify --root <blob-dir>; parity-report.json contains BLOB_PARITY_PASS:true and matched_objects",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "restic+blob-verify",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "restic stubbed",
            "SHA computation skipped",
            "pass despite mismatches"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_restored_with_ledger_parity",
            "action": {
              "actor": "operator",
              "steps": [
                "run restic restore r2:holocron-blobs --target /var/lib/holocron/blob-restore",
                "run blob-verify --root /var/lib/holocron/blob-restore",
                "inspect parity-report.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "restic exit = 0",
                "jq '.BLOB_PARITY_PASS' = true",
                "jq '.matched_objects' = <K> AND <K> > 0",
                "sha256sum digest = manifest"
              ],
              "must_not_observe": [
                "restic exit != 0",
                "jq '.BLOB_PARITY_PASS' = false",
                "jq '.matched_objects' = 0",
                "sha256sum digest != manifest"
              ]
            }
          }
        ],
        "primary": false
      },
      "test_tier": "e2e"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "description": "GIVEN fresh target WHEN operator runs holo restore:fire-drill THEN full flow executes; unified parity-report.json emitted with all checks; exit 0 only if all pass",
      "verify": "holo restore:fire-drill --target-timestamp <ts> --scratch <pgdata> --blob-dir <blob-dir>; exit 0; parity-report.json contains all PARITY_PASS:true with concrete values",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "full-fire-drill-stack",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "fire-drill stubbed",
            "report pass without computing",
            "exit 0 despite failures"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_target_with_r2_creds",
            "action": {
              "actor": "operator",
              "steps": [
                "run holo restore:fire-drill --target-timestamp 2024-01-15T12:00:00Z --scratch /var/lib/postgresql/restore --blob-dir /var/lib/holocron/blobs",
                "check exit code",
                "inspect parity-report.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit = 0",
                "jq '.POSTGRES_PARITY_PASS' = true AND jq '.LEDGER_CHECKSUM_MATCH' = true AND jq '.BLOB_PARITY_PASS' = true (3 true)",
                "jq '.matched_objects' = <K> AND <K> > 0"
              ],
              "must_not_observe": [
                "exit != 0",
                "any jq '.*_PASS' = false",
                "jq '.matched_objects' = 0"
              ]
            }
          }
        ],
        "primary": false
      },
      "test_tier": "e2e"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Postgres restore and row-count parity",
      "maps_to_ac": "AC-1",
      "verify": "holo restore:fire-drill; parity-report.json shows POSTGRES_PARITY_PASS:true with concrete row counts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Evidence ledger as-of chain integrity",
      "maps_to_ac": "AC-2",
      "verify": "evidence-ledger-verify; parity-report.json shows LEDGER_CHECKSUM_MATCH:true with hex digest"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Blob SHA-256 parity from restic restore",
      "maps_to_ac": "AC-3",
      "verify": "restic restore + blob-verify; parity-report.json shows BLOB_PARITY_PASS:true with matched_objects count"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "End-to-end fire drill emits unified parity report",
      "maps_to_ac": "AC-4",
      "verify": "holo restore:fire-drill exits 0; parity-report.json contains all PARITY_PASS:true with concrete values"
    }
  ]
}
-->

</details>
