# REDHAT-FIX-C5 — Add an immutable, collision-resistant recovery baseline bound to the backup/WAL/blob snapshots (review C-5)

## What this does

Capture a collision-resistant (SHA-256 or stronger), immutable recovery baseline/manifest at backup time that binds target timestamp/LSN, per-table row counts, evidence-ledger canonical digest (SHA-256), pgBackRest backup label, WAL target, and restic snapshot id; store it immutably with the backup set so R2-alone restore parity compares against that baseline — never against live mini state and never via MD5-only.

## Why

Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-C5). Grounded in UC-PLAT-06 / T-PLAT-022 / T-PLAT-025 / CAP-BAK-01. Review evidence: `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` (reviewed SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`).

## How to verify

- `test -f services/platform/src/backup/recovery-baseline.ts` → exit 0
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-recovery-baseline.test.ts` → capture + compare + fail-closed paths covered
- `pnpm tsgo --noEmit` → exit 0
- `pnpm biome check services/platform/src/backup/` → exit 0
- `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/backup/recovery-baseline.ts (NEW), services/platform/src/backup/base-backup.ts (MODIFY — emit baseline hook), services/platform/src/backup/restic-mirror.ts (MODIFY — bind snapshot id into baseline), services/platform/src/backup/parity-check.ts (MODIFY — if needed for baseline compare helpers), services/platform/src/backup/index.ts (MODIFY — exports), /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-04-run-the-full-fire-drill-restore-postgres-blob-end-to-end.md, services/platform/tests/integration/sprint28-recovery-baseline.test.ts (NEW), .tmp/REDHAT-FIX-C5/**

Prohibited: MD5-only ledger digest as the parity oracle, Baseline that lives only in mutable backup_heartbeat without R2 object, Mocking R2 uploads of baseline

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-C5 — Add an immutable, collision-resistant recovery baseline bound to the backup/WAL/blob snapshots (review C-5)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (150 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-recovery-baseline.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Backup path emits recovery-baseline.json (or equivalent) with sha256 digests and bindings; object is retained in R2 with the backup; fire-drill parity loads baseline from R2 (no mini access); mismatched baseline fails closed; MD5 is not the sole ledger digest; tampering with backup without baseline update breaks parity.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Emit recovery baseline at backup time (base backup and/or coordinated snapshot moment)
- MUST Include SHA-256 (or stronger) digests for ledger canonical form and blob manifest binding
- MUST Bind pgBackRest backup label, WAL target LSN/timestamp, restic snapshot id
- MUST Include per-table row counts for parity tables (beliefs, sources, passages, claims at minimum)
- MUST Parity compare restored state to baseline loaded from R2 alone
- MUST Fail closed if baseline missing, unsigned/unverified when signing is used, or digests mismatch
- NEVER use MD5 as the only ledger checksum
- NEVER compare restore parity only to live mini state (defeats R2-alone drill)
- NEVER allow backup writer to omit baseline while still claiming PARITY_PASS
- NEVER mock R2/pgBackRest/restic for baseline tests
- NEVER store baseline only on the mini local disk without R2 retention
- STRICTLY baseline content-address or signature makes silent rewrite detectable
- STRICTLY ledger digest algorithm is SHA-256 or stronger (sha256: prefix or 64-hex)
- STRICTLY baseline references concrete backup label string and restic snapshot id
- STRICTLY D05-04 contract is updated to require baseline-bound parity (superseding MD5 language)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN a successful base backup + restic mirror cycle WHEN recovery baseline capture runs THEN an immutable recovery-base
- [ ] AC-2: GIVEN recovery-baseline retained in R2 and no mini access WHEN fire-drill parity runs after restore THEN row counts and 
- [ ] AC-3: GIVEN a baseline bound to ledger_sha256=X WHEN restored data would compute ledger_sha256=Y≠X (tamper or wrong PITR point
- [ ] AC-4: GIVEN D05-04 contract language WHEN updated for C-5 THEN pre-failure snapshot requirements reference the immutable R2 ba
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN a successful base backup + restic mirror cycle WHEN recovery baseline capt (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN a successful base backup + restic mirror cycle WHEN recovery baseline capture runs THEN an immutable recovery-baseline document is written to R2 with: pgbackrest_backup_label (len>=8), restic_snapshot_id (len>=8), target_timestamp ISO-8601, target_lsn non-empty, row_counts map with integer counts, ledger_sha256 64-hex (or sha256:...), blob_manifest_sha256 64-hex — algorithm SHA-256 or stronger, not MD5-only.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: pgBackRest+restic+R2+Postgres
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-recovery-baseline.test.ts -t 'capture|emit'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if baseline only uses MD5; baseline missing restic or pgBackRest binding; baseline not uploaded to R2; hardcoded fake digests
  START_REF: backup_run_with_domain_data
  MUST_OBSERVE: R2 get recovery-baseline.json exit 0; jq -r .pgbackrest_backup_label length >= 8; jq -r .restic_snapshot_id length >= 8; jq -r .ledger_sha256 matches '^[0-9a-f]{64}$' OR starts with 'sha256:'; jq -r .blob_manifest_sha256 matches SHA-256 form; jq .row_counts.beliefs is integer >= 0
  MUST_NOT_OBSERVE: ledger_checksum is 32-char MD5 only; missing pgbackrest_backup_label or restic_snapshot_id; empty/start signature: baseline file absent from R2
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 — GIVEN recovery-baseline retained in R2 and no mini access WHEN fire-drill parity (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN recovery-baseline retained in R2 and no mini access WHEN fire-drill parity runs after restore THEN row counts and ledger/blob digests are compared to the baseline object loaded from R2; POSTGRES_PARITY_PASS and LEDGER_CHECKSUM_MATCH reflect baseline equality, not live mini queries.
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: fire-drill-parity+R2
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-recovery-baseline.test.ts -t 'parity|compare'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if parity still requires live mini connection; baseline ignored in favor of hardcoded expected counts; MD5 comparison only
  START_REF: r2_retained_baseline
  MUST_OBSERVE: parity code path reads baseline from R2 (no DATABASE_URL to mini required); on match: POSTGRES_PARITY_PASS=true and LEDGER_CHECKSUM_MATCH=true with ledger digest equal to baseline.ledger_sha256; report includes baseline_id or pgbackrest_backup_label echoed from baseline
  MUST_NOT_OBSERVE: parity queries original mini for expected counts; LEDGER_CHECKSUM_MATCH true with MD5-only field; empty/start signature: pass without loading baseline
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — GIVEN a baseline bound to ledger_sha256=X WHEN restored data would compute ledge (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN a baseline bound to ledger_sha256=X WHEN restored data would compute ledger_sha256=Y≠X (tamper or wrong PITR point) THEN parity exits non-zero and LEDGER_CHECKSUM_MATCH=false (or POSTGRES_PARITY_PASS=false for count mismatch) — fail closed.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: fire-drill-parity+R2
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-recovery-baseline.test.ts -t 'tamper|mismatch|fail'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if mismatch still reports PASS; test skips digest compare; silent ignore of baseline
  START_REF: tampered_backup_without_baseline_update
  MUST_OBSERVE: parity command exit code != 0; LEDGER_CHECKSUM_MATCH=false OR POSTGRES_PARITY_PASS=false; report includes both expected baseline digest and actual digest
  MUST_NOT_OBSERVE: exit 0 with all PASS flags true; empty/start signature: no digest fields in report
  EVIDENCE: stdout (required_capture=True)

### AC-4 — GIVEN D05-04 contract language WHEN updated for C-5 THEN pre-failure snapshot re (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN D05-04 contract language WHEN updated for C-5 THEN pre-failure snapshot requirements reference the immutable R2 baseline (SHA-256+), forbid MD5-only ledger checksum as sole oracle, and require baseline binding fields; recovery-baseline module is exported from backup package.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: contract-docs+backup-module
  VERIFY: `rg -n 'recovery-baseline|ledger_sha256|SHA-256|MD5' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-04*.md services/platform/src/backup/recovery-baseline.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if D05-04 still permits MD5 as sole ledger checksum; no baseline module; baseline not bound to backup labels
  START_REF: r2_retained_baseline
  MUST_OBSERVE: test -f services/platform/src/backup/recovery-baseline.ts; D05-04 mentions recovery baseline / ledger_sha256 / SHA-256; D05-04 does not specify MD5 as the only ledger integrity mechanism
  MUST_NOT_OBSERVE: only MD5 language remains; recovery-baseline.ts missing; empty/start signature: contract unchanged
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | recovery-baseline module exists | AC-1 | `test -f services/platform/src/backup/recovery-baseline.ts` |
| TC-2 | Baseline integration test PLATFORM_IT | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-recov` |
| TC-3 | No MD5-only as sole ledger oracle in D05-04 | AC-4 | `rg -n 'SHA-256|sha256|recovery.baseline|recovery-baseline' /Users/inference1/Pro` |
| TC-4 | Typecheck + lint on backup baseline surfaces | AC-1 | `pnpm tsgo --noEmit && pnpm biome check services/platform/src/backup/recovery-bas` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/recovery-baseline.ts (NEW)
- services/platform/src/backup/base-backup.ts (MODIFY — emit baseline hook)
- services/platform/src/backup/restic-mirror.ts (MODIFY — bind snapshot id into baseline)
- services/platform/src/backup/parity-check.ts (MODIFY — if needed for baseline compare helpers)
- services/platform/src/backup/index.ts (MODIFY — exports)
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-04-run-the-full-fire-drill-restore-postgres-blob-end-to-end.md
- services/platform/tests/integration/sprint28-recovery-baseline.test.ts (NEW)
- .tmp/REDHAT-FIX-C5/**
writeProhibited:
- MD5-only ledger digest as the parity oracle
- Baseline that lives only in mutable backup_heartbeat without R2 object
- Mocking R2 uploads of baseline

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/reviews/red-hat-20260728T235155Z-sprint-28.md:87-92 [C-5 finding: no immutable time-bound baseline]
2. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-04-run-the-full-fire-drill-restore-postgres-blob-end-to-end.md:68-119 [parity ACs with MD5 language]
3. services/platform/src/backup/base-backup.ts:312-379 [heartbeat without baseline binding]
4. services/platform/src/backup/restic-mirror.ts:709-730 [snapshot id without recovery manifest]
5. services/platform/src/backup/parity-check.ts [existing parity helpers]
6. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md:57-60 [T-PLAT-022/025]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- baseline-module: `test -f services/platform/src/backup/recovery-baseline.ts` → exit 0
- baseline-it: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-recovery-baseline.test.ts` → capture + compare + fail-closed paths covered
- typecheck: `pnpm tsgo --noEmit` → exit 0
- lint: `pnpm biome check services/platform/src/backup/` → exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260728T235155Z-sprint-28.md, ./SPRINT.md
Interaction notes:
- —
pattern: Write-once recovery baseline object co-retained with backup set; fire-drill loads baseline from R2 and compares collision-resistant digests and counts.
pattern_source: Content-addressed blob verify (services/platform/src/blob/verify.ts); Sprint 27 heartbeat/snapshot ids extended into a bound manifest
anti_pattern: MD5-only checksums; comparing to live mini; mutable heartbeat as sole baseline; writer can change backup and report together without immutable binding.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — C-5 blocks honest R2-alone fire-drill parity: without an immutable SHA-256+ baseline bound to pgBackRest label, WAL target, and restic snapshot at backup time, a writer can alter backup and matching report. DevOps owns backup pipeline hooks and parity comparison design.
Reviewer: code-reviewer (+ security-reviewer when task is security-scoped)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D04-03, D04-04, D05-04
Blocks: REDHAT-FIX-H1
Coordinates with: REDHAT-FIX-C1

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Review evidence (immutable): `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` @ SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`.
- Do not claim gate pass; do not implement outside write_allowed.
- Preserve Sprint 28 CAP-BAK-01 restore-half scope.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-C5",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "backup_run_with_domain_data": {
      "description": "Source mini/test DB with non-zero domain rows + blob objects + working Sprint 27 backup pipeline",
      "seed_method": "public_api",
      "records": [
        "beliefs/sources/passages counts >= 1",
        "at least one blob object",
        "pgBackRest stanza configured",
        "restic mirror configured"
      ]
    },
    "r2_retained_baseline": {
      "description": "recovery-baseline object present in R2 bound to a completed backup",
      "seed_method": "public_api",
      "records": [
        "R2 key under backup prefix containing recovery-baseline.json",
        "JSON fields: schema_version, captured_at, target_timestamp, target_lsn, pgbackrest_backup_label, restic_snapshot_id, row_counts, ledger_sha256, blob_manifest_sha256"
      ]
    },
    "tampered_backup_without_baseline_update": {
      "description": "Negative control where backup objects change but baseline digest binding no longer matches",
      "seed_method": "public_api",
      "records": [
        "Baseline sha256 of ledger X",
        "Restored/altered data yields ledger sha256 Y != X",
        "parity must fail"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN a successful base backup + restic mirror cycle WHEN recovery baseline capture runs THEN an immutable recovery-baseline document is written to R2 with: pgbackrest_backup_label (len>=8), restic_snapshot_id (len>=8), target_timestamp ISO-8601, target_lsn non-empty, row_counts map with integer counts, ledger_sha256 64-hex (or sha256:...), blob_manifest_sha256 64-hex \u2014 algorithm SHA-256 or stronger, not MD5-only.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-recovery-baseline.test.ts -t 'capture|emit'",
      "maps_to_ac": null,
      "primary": true,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pgBackRest+restic+R2+Postgres",
        "topology": "single-node",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "baseline only uses MD5",
            "baseline missing restic or pgBackRest binding",
            "baseline not uploaded to R2",
            "hardcoded fake digests"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "backup_run_with_domain_data",
            "action": {
              "actor": "operator",
              "steps": [
                "Run base backup + restic mirror (or coordinated capture API)",
                "Fetch recovery-baseline.json from R2",
                "Validate required fields and digest formats"
              ]
            },
            "end_state": {
              "must_observe": [
                "R2 get recovery-baseline.json exit 0",
                "jq -r .pgbackrest_backup_label length >= 8",
                "jq -r .restic_snapshot_id length >= 8",
                "jq -r .ledger_sha256 matches '^[0-9a-f]{64}$' OR starts with 'sha256:'",
                "jq -r .blob_manifest_sha256 matches SHA-256 form",
                "jq .row_counts.beliefs is integer >= 0",
                "document does not rely on md5 as sole ledger field"
              ],
              "must_not_observe": [
                "ledger_checksum is 32-char MD5 only",
                "missing pgbackrest_backup_label or restic_snapshot_id",
                "empty/start signature: baseline file absent from R2"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN recovery-baseline retained in R2 and no mini access WHEN fire-drill parity runs after restore THEN row counts and ledger/blob digests are compared to the baseline object loaded from R2; POSTGRES_PARITY_PASS and LEDGER_CHECKSUM_MATCH reflect baseline equality, not live mini queries.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-recovery-baseline.test.ts -t 'parity|compare'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "fire-drill-parity+R2",
        "topology": "single-node",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "parity still requires live mini connection",
            "baseline ignored in favor of hardcoded expected counts",
            "MD5 comparison only"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "r2_retained_baseline",
            "action": {
              "actor": "operator",
              "steps": [
                "Restore from R2 alone into scratch",
                "Load baseline from R2",
                "Compute restored digests/counts and compare"
              ]
            },
            "end_state": {
              "must_observe": [
                "parity code path reads baseline from R2 (no DATABASE_URL to mini required)",
                "on match: POSTGRES_PARITY_PASS=true and LEDGER_CHECKSUM_MATCH=true with ledger digest equal to baseline.ledger_sha256",
                "report includes baseline_id or pgbackrest_backup_label echoed from baseline"
              ],
              "must_not_observe": [
                "parity queries original mini for expected counts",
                "LEDGER_CHECKSUM_MATCH true with MD5-only field",
                "empty/start signature: pass without loading baseline"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN a baseline bound to ledger_sha256=X WHEN restored data would compute ledger_sha256=Y\u2260X (tamper or wrong PITR point) THEN parity exits non-zero and LEDGER_CHECKSUM_MATCH=false (or POSTGRES_PARITY_PASS=false for count mismatch) \u2014 fail closed.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-recovery-baseline.test.ts -t 'tamper|mismatch|fail'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "fire-drill-parity+R2",
        "topology": "single-node",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "mismatch still reports PASS",
            "test skips digest compare",
            "silent ignore of baseline"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "tampered_backup_without_baseline_update",
            "action": {
              "actor": "operator",
              "steps": [
                "Use baseline X with restored state Y\u2260X",
                "Run parity compare"
              ]
            },
            "end_state": {
              "must_observe": [
                "parity command exit code != 0",
                "LEDGER_CHECKSUM_MATCH=false OR POSTGRES_PARITY_PASS=false",
                "report includes both expected baseline digest and actual digest"
              ],
              "must_not_observe": [
                "exit 0 with all PASS flags true",
                "empty/start signature: no digest fields in report"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN D05-04 contract language WHEN updated for C-5 THEN pre-failure snapshot requirements reference the immutable R2 baseline (SHA-256+), forbid MD5-only ledger checksum as sole oracle, and require baseline binding fields; recovery-baseline module is exported from backup package.",
      "verify": "rg -n 'recovery-baseline|ledger_sha256|SHA-256|MD5' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-04*.md services/platform/src/backup/recovery-baseline.ts",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "contract-docs+backup-module",
        "topology": "single-node",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "D05-04 still permits MD5 as sole ledger checksum",
            "no baseline module",
            "baseline not bound to backup labels"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "r2_retained_baseline",
            "action": {
              "actor": "operator",
              "steps": [
                "Add recovery-baseline.ts",
                "Hook capture into backup pipeline",
                "Rewrite D05-04 AC ledger language to SHA-256 baseline"
              ]
            },
            "end_state": {
              "must_observe": [
                "test -f services/platform/src/backup/recovery-baseline.ts",
                "D05-04 mentions recovery baseline / ledger_sha256 / SHA-256",
                "D05-04 does not specify MD5 as the only ledger integrity mechanism"
              ],
              "must_not_observe": [
                "only MD5 language remains",
                "recovery-baseline.ts missing",
                "empty/start signature: contract unchanged"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "recovery-baseline module exists",
      "verify": "test -f services/platform/src/backup/recovery-baseline.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Baseline integration test PLATFORM_IT",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-recovery-baseline.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "No MD5-only as sole ledger oracle in D05-04",
      "verify": "rg -n 'SHA-256|sha256|recovery.baseline|recovery-baseline' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-04-run-the-full-fire-drill-restore-postgres-blob-end-to-end.md",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Typecheck + lint on backup baseline surfaces",
      "verify": "pnpm tsgo --noEmit && pnpm biome check services/platform/src/backup/recovery-baseline.ts services/platform/src/backup/base-backup.ts",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->

</details>
