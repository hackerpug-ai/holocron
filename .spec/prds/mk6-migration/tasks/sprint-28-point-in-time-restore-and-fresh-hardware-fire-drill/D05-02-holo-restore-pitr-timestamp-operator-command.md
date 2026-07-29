# D05-02 — holo restore --pitr <timestamp> operator command
> Status: ✅ Completed
> Completed: 2026-07-29T01:13:23Z

## What this does

Implements the holo restore --pitr command that wraps pgBackRest restore to recover Postgres to a specific point-in-time from the R2 repository


**Provides:** services/platform/src/backup/restore.ts module; holo restore --pitr CLI command; pgBackRest restore integration with R2 repo


**Consumes:** sprint-27 pgBackRest R2 repo (D04-02); backup_heartbeat table (D04-03); pgBackRest stanza configuration


## Why

CAP-BAK-01 requires operators to restore the database to any point within the backup retention window, proven by a real restore that stops replay exactly at the named timestamp


Grounded in: UC-PLAT-06, T-PLAT-022, CAP-BAK-01.


## How to verify

Run holo restore --pitr <timestamp> --scratch <test-dir> against the real R2 repo; verify the restored Postgres starts, accepts queries, and pg_stat_recovery shows replay stopped at the target timestamp


## Scope


**Writes:** services/platform/src/backup/restore.ts (NEW); services/platform/src/cli/holo.ts (MODIFY — add holo restore:pitr, holo restore:status cases); services/platform/src/backup/index.ts (MODIFY — export restore functions if it exists)


**Prohibited:** services/platform/src/db/schema/backup.ts (D04-03 owns this; D05-02 only reads backup_heartbeat); Modifying existing stack:up, db:seed, or other holo subcommands beyond adding restore cases; Hardcoding R2 credentials in restore.ts (must read from env/pgBackRest config); Creating any restore command that does not use pgBackRest


<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>


================================================================================
TASK: D05-02 — holo restore --pitr <timestamp> operator command
================================================================================
TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (150 min)
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
Implement a production-grade PITR restore command that operators can invoke to recover the Postgres database to any specific timestamp within the backup retention window, using only the remote R2 repository

**Success state:** holo restore --pitr 2024-01-15T12:30:00Z --scratch /tmp/restore-test completes with exit 0; the restored Postgres in /tmp/restore-test starts and serves queries; pg_stat_recovery shows recovery stopped at 2024-01-15T12:30:00Z; the database is in a consistent state accepting writes (promote mode) or read-only queries (pause mode)

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST wrap pgBackRest restore --type=time --target=<ts> --target-action=promote|pause
- MUST restore into a target PGDATA directory specified by --scratch <dir>
- MUST stop WAL replay exactly at the named timestamp (pg_stat_recovery confirms)
- MUST support --target-action=promote for writable queryable DB
- MUST support --target-action=pause for rehearsal mode (non-writable)
- MUST fail closed with non-zero exit when repo/target-timestamp is invalid
- MUST re-point restored cluster at live R2 repo for catch-up WAL
- NEVER accept timestamps outside the available WAL range (fail with error)
- NEVER restore into an existing non-empty PGDATA without --scratch
- NEVER return exit 0 on a failed or incomplete restore
- NEVER use the running Postgres instance's PGDATA as the restore target
- STRICTLY pgBackRest restore command is the only restore path (no direct WAL copying)
- STRICTLY target PGDATA must be empty before restore starts
- STRICTLY timestamp is validated against the available WAL segment range before restore begins
- STRICTLY restore command emits a structured JSON report with exit code, target timestamp, actual stop timestamp, and PGDATA path
- STRICTLY healthy control fixtures (D05-01 AC-3) must be real pgBackRest-produced objects only — reject synthetic text manifests / HEALTHY-WAL-PLACEHOLDER; no test-only restore reader for synthetic objects (REDHAT-FIX-C1)
- NEVER treat hand-written 'pgBackRest-style' text objects as a valid restorable chain

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): PITR restore stops at exact timestamp
- [ ] AC-2: Restore fails closed on invalid timestamp
- [ ] AC-3: Restore is repeatable into clean PGDATA
- [ ] AC-4: Re-point restored cluster to live R2 repo
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — proven by real services)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] PITR restore stops at exact timestamp (flow_ref T-PLAT-022)
  GIVEN: Postgres with pgBackRest repo in R2 containing WAL segments covering 2024-01-15T12:00:00Z through 2024-01-15T13:00:00Z
  WHEN:  operator runs holo restore --pitr 2024-01-15T12:30:45Z --scratch /tmp/pitr-target --target-action=promote
  THEN:  pgBackRest restores base backup + WALs to /tmp/pitr-target; Postgres starts and serves connections; pg_stat_recovery shows the last applied LSN corresponds to 2024-01-15T12:30:45Z; the database accepts writes; exit code is 0
  TEST_TIER: integration · VERIFICATION_SERVICE: pgBackRest+R2+Postgres · TDD_STATE: none
  SCENARIO — start_ref: r2_repo_with_wal_coverage · evidence: stdout
    NEGATIVE_CONTROL: would fail if pgBackRest restore is a stub; restore command exits 0 without starting Postgres; pg_stat_recovery shows different timestamp
    MUST_OBSERVE: exit code = 0; pgBackRest restore command shows restored WAL count = 5 (non-zero); restored DB psql -c 'SELECT COUNT(*) FROM beliefs' = source COUNT(*) — both equal 1234 (concrete integer); pg_stat_recovery.last_applied_timestamp = 2024-01-15T12:30:45Z; INSERT returns 'INSERT 0 1' and COUNT(*) from beliefs = 1234 (concrete count)
    MUST_NOT_OBSERVE: exit code != 0; pgBackRest restored WAL count = 0; psql -c 'SELECT 1' exit code != 0; pg_stat_recovery.last_applied_timestamp > 2024-01-15T12:31:00Z; INSERT exits non-zero
  verify: holo restore --pitr 2024-01-15T12:30:45Z --scratch /tmp/pitr-target --target-action=promote && psql -h /tmp/pitr-target -c 'SELECT 1' exit 0 && pg_stat_recovery confirms replay stopped at target

AC-2 Restore fails closed on invalid timestamp (flow_ref T-PLAT-022)
  GIVEN: R2 repo contains WALs from 2024-01-15T12:00:00Z through 2024-01-15T13:00:00Z
  WHEN:  operator runs holo restore --pitr 2024-01-15T14:00:00Z (outside available WAL range)
  THEN:  command exits non-zero with a clear error message stating the timestamp is outside the available WAL range; no PGDATA directory is created or modified
  TEST_TIER: integration · VERIFICATION_SERVICE: pgBackRest+R2 · TDD_STATE: none
  SCENARIO — start_ref: r2_repo_with_wal_coverage · evidence: stdout
    NEGATIVE_CONTROL: would fail if command returns exit 0 despite invalid timestamp (stub ignores validation); error message is vague (static 'restore failed' without WAL range); command creates PGDATA despite failing (no-op stub)
    MUST_OBSERVE: process exit code = 1 (or other non-zero); stderr contains 'timestamp' AND 'outside available WAL' OR 'not in retention window'
    MUST_NOT_OBSERVE: exit code = 0 (the fake-success start state); test -d /tmp/invalid-test exit 0 (directory created despite failure); stderr empty or missing 'timestamp' keyword (vague error)
  verify: holo restore --pitr 2024-01-15T14:00:00Z --scratch /tmp/invalid-test; echo $? shows > 0; stderr contains 'outside available WAL range' or 'timestamp not in retention window'

AC-3 Restore is repeatable into clean PGDATA (flow_ref T-PLAT-022)
  GIVEN: A previous restore created /tmp/restore-first with timestamp 2024-01-15T12:30:00Z
  WHEN:  operator runs holo restore --pitr 2024-01-15T12:30:00Z --scratch /tmp/restore-second (same timestamp, different directory)
  THEN:  restore completes successfully; both /tmp/restore-first and /tmp/restore-second contain identical Postgres data (same row counts, same LSN)
  TEST_TIER: integration · VERIFICATION_SERVICE: pgBackRest+R2+Postgres · TDD_STATE: none
  SCENARIO — start_ref: previous_restore_completed · evidence: stdout
    NEGATIVE_CONTROL: would fail if second restore fails because first restore consumed backup (static state bug); restored databases have different row counts (non-deterministic mock); restore modifies source R2 data (idempotency violation - no-op)
    MUST_OBSERVE: process exit code = 0; pg_ctl status on /tmp/restore-first returns 'server is running' AND pg_ctl status on /tmp/restore-second returns 'server is running' (2 running); COUNT(*) FROM beliefs on /tmp/restore-first = COUNT(*) on /tmp/restore-second = 1234 (identical concrete integer); pg_controldata system_identifier on /tmp/restore-first != pg_controldata system_identifier on /tmp/restore-second (2 DISTINCT values)
    MUST_NOT_OBSERVE: exit code != 0; pg_ctl status on either returns 'server is not running' (0 running); COUNT(*) from beliefs differs (1234 vs 5678 for example); pg_controldata system_identifier values are identical (same cluster)
  verify: holo restore --pitr 2024-01-15T12:30:00Z --scratch /tmp/restore-second; psql -h /tmp/restore-second -c 'SELECT COUNT(*) FROM beliefs' = psql -h /tmp/restore-first -c 'SELECT COUNT(*) FROM beliefs' = <N>

AC-4 Re-point restored cluster to live R2 repo (flow_ref T-PLAT-022)
  GIVEN: A promoted restore at /tmp/pitr-target with timestamp 2024-01-15T12:30:00Z
  WHEN:  operator starts the restored Postgres with pgBackRest restore-command reconfigured to fetch later WALs from R2
  THEN:  Postgres starts and can apply any WAL segments after 2024-01-15T12:30:00Z that arrive in R2 (catch-up replay); restore.conf or pgBackRest config points to the original R2 repo
  TEST_TIER: integration · VERIFICATION_SERVICE: pgBackRest+R2+Postgres · TDD_STATE: none
  SCENARIO — start_ref: promoted_restore_at_target_timestamp · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if restore.conf is missing or points to local directory (stub); Postgres cannot fetch WALs from R2 (disconnected stub); restore creates isolated cluster (disconnected from repo - static)
    MUST_OBSERVE: grep -c 'restore_command.*pgbackrest archive-get' /tmp/pitr-target/postgresql.conf = 1 (pattern present); pgBackRest config path matches the original R2 repo (string equality); SELECT count(*) FROM pg_stat_recovery WHERE replay_lag IS NOT NULL = 1 (repo connected)
    MUST_NOT_OBSERVE: grep -c 'restore_command.*pgbackrest archive-get' postgresql.conf = 0 (missing pattern); pgBackRest config path points to local filesystem or empty string; SELECT count(*) FROM pg_stat_recovery WHERE replay_lag IS NOT NULL = 0 (not connected)
  verify: cat /tmp/pitr-target/postgresql.conf shows restore_command = 'pgbackrest archive-get %f %p' pointing to R2; after starting, pg_stat_wal_receiver or pg_stat_recovery shows fetching later WALs if available

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/restore.ts (NEW)
- services/platform/src/cli/holo.ts (MODIFY — add holo restore:pitr, holo restore:status cases)
- services/platform/src/backup/index.ts (MODIFY — export restore functions if it exists)
writeProhibited: services/platform/src/db/schema/backup.ts (D04-03 owns this; D05-02 only reads backup_heartbeat); Modifying existing stack:up, db:seed, or other holo subcommands beyond adding restore cases; Hardcoding R2 credentials in restore.ts (must read from env/pgBackRest config); Creating any restore command that does not use pgBackRest

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-03-configure-continuous-wal-archiving-and-scheduled-base-backups.md:32-280 [INFRA task structure with REQUIREMENT-CONTRACT v1 block, AC/TC pattern, scenario shaping with concrete must_observe values]
2. /Users/inference1/Projects/holocron/services/platform/src/cli/holo.ts:1915-1990 [CLI command parsing pattern: case statement, arg parsing, import() of module, structured output, process.exit(result.ok ? 0 : 1)]
3. /Users/inference1/Projects/holocron/services/platform/src/cli/holo.ts:4970-5030 [CLI command that calls platform modules and emits structured JSON/text output]
4. /Users/inference1/Projects/holocron/services/platform/src/backup/wal-archive.ts:1-50 [pgBackRest integration pattern (will be created by Sprint 27; reference for restore.ts structure)]
5. https://pgbackrest.org/command.html#command-restore:1-100 [pgBackRest restore command options: --type=time, --target, --target-action=promote|pause, --pgdata, --delta]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- pgBackRest restore to timestamp: `holo restore --pitr 2024-01-15T12:30:45Z --scratch /tmp/verify-restore --target-action=promote` → Exit 0; pg_stat_recovery shows stop at 2024-01-15T12:30:45Z; psql accepts queries
- Invalid timestamp rejection: `holo restore --pitr 2099-01-01T00:00:00Z --scratch /tmp/verify-invalid` → Exit non-zero; stderr contains 'outside available WAL' or 'not in retention window'
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check services/platform/src/backup/restore.ts services/platform/src/cli/holo.ts` → Exit 0

--------------------------------------------------------------------------------
DESIGN / ANTI-PATTERN
--------------------------------------------------------------------------------
pattern: CLI command that wraps a binary (pgBackRest) with validation, idempotent execution, and structured output
anti_pattern: Implementing restore logic directly in TypeScript instead of delegating to pgBackRest; returning success without verifying Postgres actually starts; using timestamps without validating against available WAL range

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D04-02, D04-03 · Blocks: D05-04, D05-06

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D05-02",
  "proposed_by": "devops-engineer",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "r2_repo_with_wal_coverage": {
      "description": "Cloudflare R2 bucket containing pgBackRest repo with WAL segments covering 2024-01-15T12:00:00Z through 2024-01-15T13:00:00Z, created by Sprint 27 D04-02/D04-03",
      "seed_method": "public_api",
      "records": [
        "pgBackRest stanza exists in R2",
        "base backup manifest present",
        "WAL segments 000000010000000000000001 through 000000010000000000000010 available",
        "backup_heartbeat table shows recent successful wal_archive and base_backup jobs"
      ]
    },
    "previous_restore_completed": {
      "description": "A previous holo restore --pitr 2024-01-15T12:30:00Z completed successfully, leaving PGDATA at /tmp/restore-first",
      "seed_method": "cli",
      "records": [
        "holo restore --pitr 2024-01-15T12:30:00Z --scratch /tmp/restore-first --target-action=promote completed with exit 0",
        "Postgres started on /tmp/restore-first",
        "beliefs table has non-zero row count"
      ]
    },
    "promoted_restore_at_target_timestamp": {
      "description": "A promoted restore at /tmp/pitr-target with timestamp 2024-01-15T12:30:00Z, Postgres stopped, ready for configuration inspection",
      "seed_method": "cli",
      "records": [
        "holo restore --pitr 2024-01-15T12:30:00Z --scratch /tmp/pitr-target --target-action=promote completed",
        "Postgres is stopped (pg_ctl stop)",
        "PGDATA directory exists at /tmp/pitr-target"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-022",
      "description": "GIVEN R2 repo with WAL coverage WHEN operator runs holo restore --pitr <timestamp> --target-action=promote THEN pgBackRest restores to PGDATA; Postgres starts and serves; pg_stat_recovery shows replay stopped at exact timestamp; database accepts writes; exit 0",
      "verify": "holo restore --pitr 2024-01-15T12:30:45Z --scratch /tmp/pitr-target --target-action=promote && psql -c 'SELECT 1' exit 0 && pg_stat_recovery confirms stop at target",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pgBackRest+R2+Postgres",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "pgBackRest restore is a stub",
            "restore exits 0 without starting Postgres (static)",
            "pg_stat_recovery shows different timestamp (mock)",
            "restore succeeds without accessing R2 (disconnected)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "r2_repo_with_wal_coverage",
            "action": {
              "actor": "operator",
              "steps": [
                "run holo restore --pitr 2024-01-15T12:30:45Z --scratch /tmp/pitr-target --target-action=promote",
                "wait for restore to complete",
                "start Postgres",
                "query pg_stat_recovery"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code = 0",
                "pgBackRest restored WAL count = 5",
                "restored DB psql -c 'SELECT COUNT(*) FROM beliefs' = source COUNT(*) \u2014 both equal 1234 (concrete integer)",
                "pg_stat_recovery.last_applied_timestamp = '2024-01-15T12:30:45Z'",
                "INSERT returns 'INSERT 0 1' and COUNT(*) from beliefs = 1234 (concrete count)"
              ],
              "must_not_observe": [
                "exit code != 0",
                "pgBackRest restored WAL count = 0",
                "COUNT(*) from beliefs differs (1234 vs 5678 \u2014 not identical)",
                "pg_stat_recovery.last_applied_timestamp > target",
                "INSERT exits non-zero"
              ]
            }
          }
        ],
        "primary": true
      },
      "test_tier": "integration"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "description": "GIVEN R2 repo with WAL coverage WHEN operator runs holo restore --pitr <timestamp-outside-range> THEN command exits non-zero with clear error about WAL range; no PGDATA created",
      "verify": "holo restore --pitr 2024-01-15T14:00:00Z; echo $? > 0; stderr contains 'outside available WAL' or 'not in retention window'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pgBackRest+R2",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "exit 0 despite invalid timestamp",
            "vague error message",
            "PGDATA created despite failure",
            "validation skipped (mock)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "r2_repo_with_wal_coverage",
            "action": {
              "actor": "operator",
              "steps": [
                "run holo restore --pitr 2024-01-15T14:00:00Z --scratch /tmp/invalid"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code = 1 (non-zero)",
                "stderr contains 'timestamp' AND 'outside available WAL' OR 'not in retention window'"
              ],
              "must_not_observe": [
                "exit code = 0",
                "test -d /tmp/invalid exit 0",
                "stderr empty or missing 'timestamp'"
              ]
            }
          }
        ],
        "primary": false
      },
      "test_tier": "integration"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "description": "GIVEN previous restore completed WHEN operator runs holo restore --pitr <same-timestamp> --scratch <different-dir> THEN both restores produce identical Postgres data (same row counts, same LSN)",
      "verify": "Two restores to different directories at same timestamp have identical COUNT(*) from beliefs; pg_control system identifiers differ",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pgBackRest+R2+Postgres",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "second restore fails",
            "restored databases differ",
            "R2 data modified by first restore",
            "second restore is a stub"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "previous_restore_completed",
            "action": {
              "actor": "operator",
              "steps": [
                "run holo restore --pitr 2024-01-15T12:30:00Z --scratch /tmp/restore-second",
                "compare row counts",
                "compare pg_control identifiers"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code = 0",
                "pg_ctl status on both returns 'server is running' (2 running)",
                "COUNT(*) FROM beliefs on /tmp/restore-first = COUNT(*) on /tmp/restore-second = 1234 (identical concrete integer)",
                "pg_control system_identifier values differ (2 DISTINCT)"
              ],
              "must_not_observe": [
                "exit code != 0",
                "pg_ctl status shows not running (0 running)",
                "COUNT(*) differs",
                "pg_control identifiers identical"
              ]
            }
          }
        ],
        "primary": false
      },
      "test_tier": "integration"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "description": "GIVEN promoted restore WHEN operator starts Postgres THEN restore.conf/pgBackRest config points to original R2 repo; Postgres can fetch later WALs for catch-up replay",
      "verify": "cat postgresql.conf shows restore_command with pgbackrest archive-get; pg_stat_recovery shows repo connected",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pgBackRest+R2+Postgres",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "restore.conf missing",
            "points to local dir",
            "cannot fetch WALs",
            "config is a symlink"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "promoted_restore_at_target_timestamp",
            "action": {
              "actor": "operator",
              "steps": [
                "inspect postgresql.conf",
                "start Postgres",
                "check pg_stat_recovery"
              ]
            },
            "end_state": {
              "must_observe": [
                "grep -c 'restore_command.*pgbackrest archive-get' postgresql.conf = 1",
                "pgBackRest config matches original R2 repo",
                "SELECT count(*) FROM pg_stat_recovery WHERE replay_lag IS NOT NULL = 1"
              ],
              "must_not_observe": [
                "grep count = 0",
                "pgBackRest config points to local",
                "pg_stat_recovery count = 0"
              ]
            }
          }
        ],
        "primary": false
      },
      "test_tier": "integration"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "PITR restore stops at exact timestamp and produces writable database",
      "maps_to_ac": "AC-1",
      "verify": "holo restore --pitr <timestamp> --scratch <dir> --target-action=promote exits 0; pg_stat_recovery shows stop at timestamp; database accepts writes"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Invalid timestamp fails closed with clear error",
      "maps_to_ac": "AC-2",
      "verify": "holo restore --pitr <invalid-timestamp> exits non-zero; stderr contains 'outside available WAL'"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Restore is repeatable and idempotent",
      "maps_to_ac": "AC-3",
      "verify": "Two restores to different directories at same timestamp produce identical databases"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Restored cluster re-points to live R2 repo",
      "maps_to_ac": "AC-4",
      "verify": "postgresql.conf contains restore_command with pgbackrest archive-get; Postgres can fetch later WALs"
    }
  ]
}
-->

</details>
