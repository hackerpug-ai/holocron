# D05-01 — RED: restore fails closed on empty/corrupted backup chain
> Status: ✅ Completed
> Completed: 2026-07-29T01:13:23Z

## What this does

Authors the RED integration test suite that proves `holo restore --pitr <timestamp>` exits NON-ZERO with a named error when pointed at an empty, corrupted, or missing backup chain — and NEVER writes a fake-success row. Test currently FAILS (no restore implementation exists) and will PASS only after D05-02/D05-04 implement real PITR restore.


## Why

This is the negative-control proof that restore NEVER reports success against an unverifiable backup chain. The test is unfakeable: it requires observing specific non-zero exit codes, named error strings, and absence of fake-success records. Without this RED gate, D05-02/D05-04 could pass on stubs that exit 0 against corrupted chains.


Grounded in: UC-PLAT-06, T-PLAT-022, CAP-BAK-01.


## How to verify

Run `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts` → Exit ≠ 0 currently (RED state). After D05-02/D05-04 → Exit 0 (GREEN). Each case asserts concrete artifacts: non-zero exit, specific error strings, concrete PGDATA file counts (0 for failures), and no backup_heartbeat success rows written.


## Scope


**Writes:** services/platform/tests/integration/sprint28-restore-fails-closed.test.ts (NEW)


**Prohibited:** services/platform/src/cli/holo.ts restore:* commands (MODIFY - D05-02 owns restore implementation); services/platform/src/backup/** (MODIFY - D05-02 owns backup/restore logic); any production restore implementation (MODIFY - D05-02 owns this)


<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>


================================================================================
TASK: D05-01 — RED: restore fails closed on empty/corrupted backup chain
================================================================================
TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (? min)
AGENT:      implementer=red-test-generator | reviewer=backup-reviewer
PROPOSED-BY: red-test-generator
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Authors the RED integration test suite that proves `holo restore --pitr <timestamp>` exits NON-ZERO with a named error when pointed at an empty, corrupted, or missing backup chain — and NEVER writes a fake-success row. Test currently FAILS (no restore implementation exists) and will PASS only after D05-02/D05-04 implement real PITR restore.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST write RED integration test at services/platform/tests/integration/sprint28-restore-fails-closed.test.ts (NEW)
- MUST invoke the real `holo restore --pitr <timestamp>` CLI via spawnSync (never mock the restore path)
- MUST assert non-zero exit code with a named error string for empty/corrupted chains
- MUST verify NO queryable PGDATA is written for failed restores (anti-fake-success)
- MUST include a healthy negative control case that PASSES on a seeded repo (proves test isn't trivially satisfiable by `exit 1`)
- MUST assert no backup_heartbeat 'success' row is written for failed restores
- MUST use real R2 bucket fixtures (empty, corrupted, healthy) seeded via test-scoped provisioning, never mocks
- MUST fail in current state and only pass after D05-02/D05-04 land real PITR restore
- MUST use PLATFORM_IT=1 guard and run via pnpm vitest run
- NEVER mock R2 bucket, pgBackRest, or the restore CLI in the RED test
- NEVER stub the restore path to always exit 0 or always fail without observing real artifacts
- NEVER allow a fake-success condition where restore reports OK against an unverifiable chain
- NEVER implement restore production code in this task (D05-02 owns that)
- STRICTLY verification runs against real restore command and real R2 fixtures — no fake buckets
- STRICTLY test lives under services/platform/tests/integration/, PLATFORM_IT=1 guarded

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): GIVEN an empty R2 repo / missing base backup WHEN `holo restore --pitr <timestamp>` executes THEN the command exits NON-ZERO with a named error (e.g. 
- [ ] AC-2: GIVEN a corrupted backup chain with manifest mismatch WHEN `holo restore --pitr <timestamp>` executes THEN restore exits non-zero, names the corruptio
- [ ] AC-3: GIVEN a healthy seeded R2 repo with a complete backup chain WHEN `holo restore --pitr <timestamp>` executes THEN restore would succeed (exit 0, `SELEC
- [ ] AC-4: GIVEN any failed restore (empty repo or corrupted chain) WHEN the restore exits non-zero THEN NO fake-success row is written to backup_heartbeat or pa
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — proven by real services)
--------------------------------------------------------------------------------
AC-1 [PRIMARY]  (flow_ref T-PLAT-022)
  GIVEN: GIVEN an empty R2 repo / missing base backup WHEN `holo restore --pitr <timestamp>` executes THEN the command exits NON-ZERO with a named error (e.g. 'no base backup available') and PGDATA file count = 0 (no data written).
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-restore-cli+pgBackRest+R2 · TDD_STATE: red
  SCENARIO — start_ref: empty_r2_repo · evidence: stdout
    NEGATIVE_CONTROL: would fail if restore command returns exit 0 unconditionally; restore writes a fake PGDATA directory without real base backup; error message is generic instead of naming 'no base backup available'
    MUST_OBSERVE: exit code != 0; "no base backup available" OR "backup chain missing" in stderr; PGDATA file count = 0 (`find <scratch_pgdata> -type f | wc -l` returns 0)
    MUST_NOT_OBSERVE: exit code 0; a queryable Postgres data directory in PGDATA (file count >= 1); empty/start signature: generic 'error' without naming the missing base backup
  verify: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'empty R2 repo'

AC-2  (flow_ref T-PLAT-022)
  GIVEN: GIVEN a corrupted backup chain with manifest mismatch WHEN `holo restore --pitr <timestamp>` executes THEN restore exits non-zero, names the corruption (e.g. 'manifest checksum mismatch' or 'WAL segment corrupted'), and PGDATA file count = 0 or pg_ctl status exits non-zero (no promoted DB).
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-restore-cli+pgBackRest+R2 · TDD_STATE: red
  SCENARIO — start_ref: corrupted_manifest_repo · evidence: stdout
    NEGATIVE_CONTROL: would fail if restore silently skips corrupted WAL segments; restore reports success despite checksum mismatch; corruption check is a stub that always passes
    MUST_OBSERVE: exit code != 0; "manifest checksum mismatch" OR "WAL segment corrupted" OR "backup chain integrity check failed" in stderr; PGDATA file count = 0 OR `pg_ctl status` exit non-zero (restore did not promote)
    MUST_NOT_OBSERVE: exit code 0; a queryable Postgres data directory at the target timestamp (file count >= 1 AND pg_ctl status exit 0); empty/start signature: restore completes without naming the corruption
  verify: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'corrupted manifest'

AC-3  (flow_ref T-PLAT-022)
  GIVEN: GIVEN a healthy seeded R2 repo with a complete backup chain WHEN `holo restore --pitr <timestamp>` executes THEN restore would succeed (exit 0, `SELECT 1` exit 0, pitr_test row count >= 1) — this negative control proves the test suite cannot pass on a blanket 'always fail' stub.
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-restore-cli+pgBackRest+R2 · TDD_STATE: red
  SCENARIO — start_ref: healthy_seeded_repo · evidence: db_query
    NEGATIVE_CONTROL: would fail if test is written to always fail regardless of repo state; healthy case is marked as skip/todo; restore fails even on a valid backup chain
    MUST_OBSERVE: exit code 0; `psql -c 'SELECT 1'` exit 0 (restored DB serves queries); pitr_test table row count >= 1 (concrete, non-degenerate)
    MUST_NOT_OBSERVE: exit code != 0; `psql -c 'SELECT 1'` exit non-zero (no queryable database); empty/start signature: pitr_test row count = 0 OR table missing
  verify: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'healthy seeded repo'

AC-4  (flow_ref T-PLAT-022)
  GIVEN: GIVEN any failed restore (empty repo or corrupted chain) WHEN the restore exits non-zero THEN NO fake-success row is written to backup_heartbeat or parity tables — restore NEVER reports 'OK' against an unverifiable chain.
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-restore-cli+pgBackRest+R2 · TDD_STATE: red
  SCENARIO — start_ref: empty_r2_repo, corrupted_manifest_repo · evidence: db_query
    NEGATIVE_CONTROL: would fail if restore writes a 'success' heartbeat row despite failure; restore reports OK status to parity tracking even when corruption detected; the test fails to check for fake-success rows
    case[0] MUST_OBSERVE: exit code != 0 for the restore command; ZERO rows in backup_heartbeat with status 'success' or 'OK' (COUNT(*) = 0); ZERO rows in parity tracking indicating restore completed (COUNT(*) = 0)
    case[0] MUST_NOT_OBSERVE: a backup_heartbeat row with status 'success' for a failed restore; a parity tracking row claiming restore completed despite exit != 0; empty/start signature: any 'OK' record exists (COUNT(*) >= 1)
    case[1] MUST_OBSERVE: exit code != 0 for the restore command; ZERO rows in backup_heartbeat with status 'success' or 'OK' (COUNT(*) = 0); ZERO rows in parity tracking indicating restore completed (COUNT(*) = 0)
    case[1] MUST_NOT_OBSERVE: a backup_heartbeat row with status 'success' for a corrupted-chain restore; a parity tracking row claiming restore completed despite corruption; empty/start signature: any 'OK' record exists (COUNT(*) >= 1)
  verify: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'no fake-success row'

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/tests/integration/sprint28-restore-fails-closed.test.ts (NEW)
writeProhibited: services/platform/src/cli/holo.ts restore:* commands (MODIFY - D05-02 owns restore implementation); services/platform/src/backup/** (MODIFY - D05-02 owns backup/restore logic); any production restore implementation (MODIFY - D05-02 owns this)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md:53-59 [T-PLAT-022: PITR restore from remote backup alone, fail-closed on missing/corrupted chain]
2. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:63-72 [CAP-BAK-01: backup chain integrity and PITR restore contracts]
3. /Users/inference1/Projects/holocron/services/platform/src/cli/holo.ts:1-100 [Existing CLI structure where restore:* commands will live (D05-02 adds them)]
4. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-01-red-induced-backup-failure-must-alert-healthy-run-stays-silent.md:1-238 [RED test structure for backup-related negative-control suite]
5. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/D03-01-red-maestro-harness-fails-closed-without-simulator-build-backend.md:1-200 [RED test pattern: spawnSync real CLI, assert exit codes and stderr text]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED test file exists + valid: test -f services/platform/tests/integration/sprint28-restore-fails-closed.test.ts && grep -Ec 'describe|itLive' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts | grep -Eq '[1-9]' → Exit 0
- RED test currently FAILS: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts → Exit ≠ 0 (RED state)
- Real holo restore CLI invoked, no mocks: grep -Ec 'spawnSync.*holo.*restore|execSync.*holo.*restore' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts | grep -Eq '[1-9]' && ! grep -Eq 'mock.*holo|stub.*restore' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts → Exit 0
- Three failure modes covered: grep -Eq 'empty.*repo|missing.*base.*backup' && grep -Eq 'corrupt|manifest.*mismatch|WAL.*corrupt' && grep -Eq 'fake.*success|backup_heartbeat|parity.*ok' → Exit 0
- Healthy negative control present: grep -Eq 'healthy.*seeded|repo.*valid|complete.*chain' → Exit 0

--------------------------------------------------------------------------------
DESIGN / ANTI-PATTERN
--------------------------------------------------------------------------------
pattern: spawnSync(holo_restore_cmd, ['--pitr', timestamp], { env: {...process.env, R2_BUCKET: test_scoped_prefix } }) with assertions on exit code, stderr error strings, PGDATA file count (concrete 0 for failures), and backup_heartbeat table COUNT(*) = 0 for fake-success check
anti_pattern: mocking holo restore or R2 bucket; asserting only on exit code without checking error text; skipping the healthy negative control; allowing fake-success rows to be written

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: — · Blocks: D05-02, D05-04

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D05-01",
  "proposed_by": "red-test-generator",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "empty_r2_repo": {
      "description": "A test-scoped R2 bucket prefix with zero backup files \u2014 no base backup, no WAL archives.",
      "seed_method": "public_api",
      "records": [
        "R2 bucket prefix exists but is empty (0 objects)",
        "pgBackRest repo config points at this empty prefix",
        "No base backup manifest present",
        "No WAL segment files present"
      ]
    },
    "corrupted_manifest_repo": {
      "description": "A test-scoped R2 bucket with a base backup and a corrupted WAL manifest (checksum mismatch or truncated WAL segment).",
      "seed_method": "public_api",
      "records": [
        "R2 bucket prefix contains a base backup manifest",
        "WAL archive directory exists but at least one WAL segment is corrupted (invalid checksum or truncated)",
        "pgBackRest manifest reports mismatch vs. actual segment checksums",
        "Restore would fail at the corrupted segment during PITR replay"
      ]
    },
    "healthy_seeded_repo": {
      "description": "A test-scoped R2 bucket with a complete, verified backup chain and seed data.",
      "seed_method": "public_api",
      "records": [
        "R2 bucket prefix contains a complete base backup",
        "WAL archive contains continuous WAL segments covering the target PITR window",
        "pgBackRest manifest checksums are valid for all segments",
        "Backup includes test data (e.g. a table named 'pitr_test' with >= 1 rows)"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-022",
      "description": "GIVEN an empty R2 repo / missing base backup WHEN `holo restore --pitr <timestamp>` executes THEN the command exits NON-ZERO with a named error and PGDATA file count = 0.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'empty R2 repo'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-restore-cli+pgBackRest+R2",
        "negative_control": {
          "would_fail_if": [
            "restore command returns exit 0 unconditionally",
            "restore writes a fake PGDATA directory without real base backup",
            "error message is generic instead of naming 'no base backup available'",
            "the test mocks the R2 bucket instead of hitting a real empty repo"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_r2_repo",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Provision a test-scoped R2 bucket prefix with zero backup files",
                "Run `holo restore --pitr 2024-01-01T00:00:00Z` targeting the empty bucket",
                "Capture exit code, stderr, and PGDATA file count via `find $PGDATA -type f | wc -l`"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code != 0",
                "\"no base backup available\" OR \"backup chain missing\" in stderr",
                "PGDATA file count = 0 (`find <scratch_pgdata> -type f | wc -l` returns 0)"
              ],
              "must_not_observe": [
                "exit code 0",
                "a queryable Postgres data directory in PGDATA (file count >= 1)",
                "empty/start signature: generic 'error' without naming the missing base backup"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN a corrupted backup chain with manifest mismatch WHEN `holo restore --pitr <timestamp>` executes THEN restore exits non-zero, names the corruption, and PGDATA file count = 0 or pg_ctl status exits non-zero.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'corrupted manifest'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-restore-cli+pgBackRest+R2",
        "negative_control": {
          "would_fail_if": [
            "restore silently skips corrupted WAL segments",
            "restore reports success despite checksum mismatch",
            "corruption check is a stub that always passes",
            "the test uses a mocked manifest instead of real R2 corruption"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "corrupted_manifest_repo",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Provision a test-scoped R2 bucket with a base backup and a corrupted WAL manifest",
                "Run `holo restore --pitr 2024-01-01T01:00:00Z` targeting the corrupted point",
                "Capture exit code, stderr, PGDATA file count, and pg_ctl status"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code != 0",
                "\"manifest checksum mismatch\" OR \"WAL segment corrupted\" OR \"backup chain integrity check failed\" in stderr",
                "PGDATA file count = 0 OR `pg_ctl status` exit non-zero (restore did not promote)"
              ],
              "must_not_observe": [
                "exit code 0",
                "a queryable Postgres data directory at the target timestamp (file count >= 1 AND pg_ctl status exit 0)",
                "empty/start signature: restore completes without naming the corruption"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN a healthy seeded R2 repo with a complete backup chain WHEN `holo restore --pitr <timestamp>` executes THEN restore would succeed (exit 0, SELECT 1 exit 0, pitr_test row count >= 1) \u2014 this negative control proves the test suite cannot pass on a blanket 'always fail' stub.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'healthy seeded repo'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-restore-cli+pgBackRest+R2",
        "negative_control": {
          "would_fail_if": [
            "test is written to always fail regardless of repo state",
            "healthy case is marked as skip/todo",
            "restore fails even on a valid backup chain",
            "restore is a static stub that always returns exit 0 without replaying WAL"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "healthy_seeded_repo",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Provision a test-scoped R2 bucket with a complete backup chain (base backup + WAL archives)",
                "Seed the backup with test data (e.g. a table named 'pitr_test' with a known row count)",
                "Run `holo restore --pitr <timestamp>` targeting a point after the seed",
                "Query the restored database: `psql -c 'SELECT 1'` and `SELECT COUNT(*) FROM pitr_test`"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code 0",
                "`psql -c 'SELECT 1'` exit 0 (restored DB serves queries)",
                "pitr_test table row count >= 1 (concrete, non-degenerate)"
              ],
              "must_not_observe": [
                "exit code != 0",
                "`psql -c 'SELECT 1'` exit non-zero (no queryable database)",
                "empty/start signature: pitr_test row count = 0 OR table missing"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN any failed restore (empty repo or corrupted chain) WHEN the restore exits non-zero THEN NO fake-success row is written to backup_heartbeat or parity tables \u2014 restore NEVER reports 'OK' against an unverifiable chain.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'no fake-success row'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-restore-cli+pgBackRest+R2",
        "negative_control": {
          "would_fail_if": [
            "restore writes a 'success' heartbeat row despite failure",
            "restore reports OK status to parity tracking even when corruption detected",
            "the test fails to check for fake-success rows",
            "restore is a stub that writes a success heartbeat row without performing a real restore"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "empty_r2_repo",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run `holo restore --pitr <timestamp>` against an empty R2 bucket",
                "Query the backup_heartbeat table for any 'success' or 'OK' records",
                "Query parity tracking for any restore-completed records"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code != 0 for the restore command",
                "ZERO rows in backup_heartbeat with status 'success' or 'OK' (COUNT(*) = 0)",
                "ZERO rows in parity tracking indicating restore completed (COUNT(*) = 0)"
              ],
              "must_not_observe": [
                "a backup_heartbeat row with status 'success' for a failed restore",
                "a parity tracking row claiming restore completed despite exit != 0",
                "empty/start signature: any 'OK' record exists (COUNT(*) >= 1)"
              ]
            }
          },
          {
            "start_ref": "corrupted_manifest_repo",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run `holo restore --pitr <timestamp>` against a corrupted backup chain",
                "Query the backup_heartbeat table for any 'success' or 'OK' records",
                "Query parity tracking for any restore-completed records"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code != 0 for the restore command",
                "ZERO rows in backup_heartbeat with status 'success' or 'OK' (COUNT(*) = 0)",
                "ZERO rows in parity tracking indicating restore completed (COUNT(*) = 0)"
              ],
              "must_not_observe": [
                "a backup_heartbeat row with status 'success' for a corrupted-chain restore",
                "a parity tracking row claiming restore completed despite corruption",
                "empty/start signature: any 'OK' record exists (COUNT(*) >= 1)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "RED test file exists and is PLATFORM_IT=1 guarded",
      "maps_to_ac": "AC-1",
      "verify": "test -f services/platform/tests/integration/sprint28-restore-fails-closed.test.ts; grep -Ec 'PLATFORM_IT' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts | grep -Eq '[1-9]'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "RED test currently FAILS (no implementation exists)",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts; test ${PIPESTATUS[0]} -ne 0"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Test invokes real holo restore CLI via spawnSync, never mocks",
      "maps_to_ac": "AC-1",
      "verify": "grep -Ec 'spawnSync.*holo.*restore|execSync.*holo.*restore' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts | grep -Eq '[1-9]'; ! grep -Eq 'mock.*holo|stub.*restore' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Test covers all three failure modes: empty repo, corrupted manifest, and fake-success row check",
      "maps_to_ac": "AC-1",
      "verify": "grep -Eq 'empty.*repo|missing.*base.*backup' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts && grep -Eq 'corrupt|manifest.*mismatch|WAL.*corrupt' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts && grep -Eq 'fake.*success|backup_heartbeat|parity.*ok' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Test includes healthy negative control that would pass on a seeded repo",
      "maps_to_ac": "AC-3",
      "verify": "grep -Eq 'healthy.*seeded|repo.*valid|complete.*chain' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts"
    }
  ]
}
-->

</details>
