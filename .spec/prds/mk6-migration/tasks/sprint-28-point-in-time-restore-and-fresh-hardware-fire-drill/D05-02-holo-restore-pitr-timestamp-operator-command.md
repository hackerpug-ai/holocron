# D05-02 — holo restore --pitr <timestamp> operator command
> Status: ✅ Completed
> Completed: 2026-07-29T01:13:23Z
> Contract corrected: REDHAT-FIX-C3 (honest PostgreSQL recovery / promotion / LSN semantics)

## What this does

Implements the holo restore --pitr command that wraps pgBackRest restore to recover Postgres to a specific point-in-time from the R2 repository


**Provides:** services/platform/src/backup/restore.ts module; holo restore --pitr CLI command; pgBackRest restore integration with R2 repo


**Consumes:** sprint-27 pgBackRest R2 repo (D04-02); backup_heartbeat table (D04-03); pgBackRest stanza configuration


## Why

CAP-BAK-01 requires operators to restore the database to any point within the backup retention window, proven by a real restore that stops replay at the named timestamp using **seeded sentinel rows** and **real recovery catalogs** — not invented `pg_stat_recovery` fields.


Grounded in: UC-PLAT-06, T-PLAT-022, CAP-BAK-01. Contract honesty: REDHAT-FIX-C3 / red-hat C-3.


## How to verify

1. Pause path (recovery proof): `holo restore --pitr <Tt> --scratch <dir> --target-action=pause` → exit 0; `pg_is_in_recovery()=true`; sentinel `before-target` visible, `after-target` absent; `pg_last_wal_replay_lsn()` non-null.
2. Promote path (writable proof, separate): `holo restore --pitr <Tt> --scratch <dir> --target-action=promote` → exit 0; `pg_is_in_recovery()=false`; INSERT succeeds; same sentinel visibility.
3. Contract suite: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts`


## Scope


**Writes:** services/platform/src/backup/restore.ts (NEW); services/platform/src/cli/holo.ts (MODIFY — add holo restore:pitr, holo restore:status cases); services/platform/src/backup/index.ts (MODIFY — export restore functions if it exists)


**Prohibited:** services/platform/src/db/schema/backup.ts (D04-03 owns this; D05-02 only reads backup_heartbeat); Modifying existing stack:up, db:seed, or other holo subcommands beyond adding restore cases; Hardcoding R2 credentials in restore.ts (must read from env/pgBackRest config); Creating any restore command that does not use pgBackRest; Inventing non-existent catalog columns (invented non-existent pg_stat_recovery timestamp columns); Requiring distinct `system_identifier` for physical clones; Requiring a promoted clone to re-apply later source primary WAL as standby catch-up


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
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Implement a production-grade PITR restore command that operators can invoke to recover the Postgres database to any specific timestamp within the backup retention window, using only the remote R2 repository.

**Success state (honest PG semantics — REDHAT-FIX-C3):**
- **Pause path** (`--target-action=pause`): exit 0; Postgres started in recovery (`pg_is_in_recovery()=true`); seeded `pitr_sentinel` rows prove the cut (before-target visible, after-target absent); `pg_last_wal_replay_lsn()` non-null. Do **not** query invented non-existent pg_stat_recovery timestamp columns.
- **Promote path** (`--target-action=promote`): tested **separately** from pause; exit 0; `pg_is_in_recovery()=false`; DB accepts writes; same sentinel visibility. Do **not** require post-promote `pg_stat_recovery` replay proof.
- **Repeatable physical restores** of the same source share the same `system_identifier` (physical restore preserves it) and matching row counts.
- Invalid timestamps outside the available WAL range fail closed with a named error.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST wrap pgBackRest restore --type=time --target=<ts> --target-action=promote|pause
- MUST restore into a target PGDATA directory specified by --scratch <dir>
- MUST stop WAL replay at the named timestamp, proven by seeded pitr_sentinel rows (T0 < Tt < T1) plus real recovery catalogs while paused (pg_is_in_recovery, pg_last_wal_replay_lsn / startup-log stop time / pg_last_xact_replay_timestamp / recovery_target_time)
- MUST support --target-action=promote for writable queryable DB (separate AC from pause)
- MUST support --target-action=pause for recovery/rehearsal proof (non-writable primary)
- MUST fail closed with non-zero exit when repo/target-timestamp is invalid
- MUST allow optional restore_command re-point for pause-mode rehearsal only — promote path MUST NOT require the clone to act as a standby of the original primary and apply later source WAL
- NEVER invent or assert invented non-existent pg_stat_recovery timestamp columns (field does not exist)
- NEVER require --target-action=promote AND recovery-catalog exact-replay proof in the same AC
- NEVER require physical restore clones to have different system_identifier values (physical restore preserves system_identifier — dual restores of the same source are EQUAL)
- NEVER require a promoted PITR clone to fetch/apply later source primary WAL as standby catch-up
- NEVER accept timestamps outside the available WAL range (fail with error)
- NEVER restore into an existing non-empty PGDATA without --scratch
- NEVER return exit 0 on a failed or incomplete restore
- NEVER use the running Postgres instance's PGDATA as the restore target
- STRICTLY pgBackRest restore command is the only restore path (no direct WAL copying)
- STRICTLY target PGDATA must be empty before restore starts
- STRICTLY timestamp is validated against the available WAL segment range before restore begins
- STRICTLY restore command emits a structured JSON report with exit code, target timestamp, actual stop timestamp (from real log/catalog sources — never the operator argv echoed as proof), and PGDATA path
- STRICTLY healthy control fixtures (D05-01 AC-3) must be real pgBackRest-produced objects only — reject synthetic text manifests / HEALTHY-WAL-PLACEHOLDER; no test-only restore reader for synthetic objects (REDHAT-FIX-C1)
- NEVER treat hand-written 'pgBackRest-style' text objects as a valid restorable chain
- STRICTLY pause-mode proof runs while pg_is_in_recovery() is true
- STRICTLY promote-mode proof runs while pg_is_in_recovery() is false and accepts writes
- STRICTLY sentinel rows are created during backup seed at known times so before/after target visibility is deterministic

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): Pause-path PITR recovery proof via sentinels + real recovery catalogs
- [ ] AC-2: Promote-path writable proof (separate from pause / recovery catalogs)
- [ ] AC-3: Restore is repeatable; row counts match; system_identifier EQUAL across physical clones
- [ ] AC-4: Contract honesty — no post-promote source-WAL catch-up requirement; invalid timestamp fails closed
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — proven by real services)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] Pause-path PITR recovery proof (flow_ref T-PLAT-022)
  GIVEN: r2_repo_with_sentinel_wal_window (T0 < Tt < T1) with table pitr_sentinel rows labeled before-target (at T0) and after-target (at T1)
  WHEN:  operator runs `holo restore --pitr <Tt> --scratch <dir> --target-action=pause`
  THEN:  exit 0; pg_is_in_recovery()=true; COUNT(*) FROM pitr_sentinel WHERE label='before-target' >= 1; COUNT(*) FROM pitr_sentinel WHERE label='after-target' = 0; pg_last_wal_replay_lsn() IS NOT NULL — WITHOUT reading any invented non-existent pg_stat_recovery timestamp columns field
  TEST_TIER: integration · VERIFICATION_SERVICE: pgBackRest+R2+Postgres+holo-restore · TDD_STATE: red→green
  SCENARIO — start_ref: r2_repo_with_sentinel_wal_window · evidence: db_query
    NEGATIVE_CONTROL: would fail if AC requires promote + pg_stat_recovery together; test asserts invented recovery-timestamp column; pause mode not used; after-target rows visible at paused Tt
    MUST_OBSERVE: restore exit code = 0; SELECT pg_is_in_recovery() = true; COUNT(*) pitr_sentinel label=before-target >= 1; COUNT(*) pitr_sentinel label=after-target = 0; pg_last_wal_replay_lsn() IS NOT NULL; zero invented non-existent pg_stat_recovery fields in this contract
    MUST_NOT_OBSERVE: pg_is_in_recovery() = false during pause proof; after-target row count >= 1; assertion on invented non-existent pg_stat_recovery timestamp columns; promote used as the only recovery proof
  verify: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts -t 'pause'

AC-2 Promote-path writable proof (separate from recovery catalogs) (flow_ref T-PLAT-022)
  GIVEN: the same seeded repo
  WHEN:  operator runs restore with --target-action=promote at Tt
  THEN:  exit 0; pg_is_in_recovery()=false; DB accepts INSERT; before-target rows present; after-target rows absent; promotion is tested separately from recovery catalog views (no pg_stat_recovery exact-replay requirement after promote)
  TEST_TIER: integration · VERIFICATION_SERVICE: pgBackRest+R2+Postgres+holo-restore · TDD_STATE: red→green
  SCENARIO — start_ref: promoted_restore_scratch · evidence: db_query
    NEGATIVE_CONTROL: would fail if promotion AC still queries pg_stat_recovery for replay proof; INSERT fails because still in recovery; after-target data present
    MUST_OBSERVE: exit code = 0; pg_is_in_recovery() = false; INSERT 0 1 succeeds; before-target count >= 1 AND after-target count = 0
    MUST_NOT_OBSERVE: pg_is_in_recovery() = true after promote; INSERT fails; success without starting Postgres
  verify: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts -t 'promote'

AC-3 Restore is repeatable; physical clones share system_identifier (flow_ref T-PLAT-022)
  GIVEN: two independent restores of the same source backup/WAL to different scratch dirs at the same Tt
  WHEN:  both complete successfully
  THEN:  row counts match exactly AND pg_controldata system_identifier values are EQUAL (physical restore preserves system_identifier) — this contract MUST NOT require inequality
  TEST_TIER: integration · VERIFICATION_SERVICE: pgBackRest+R2+Postgres · TDD_STATE: red→green
  SCENARIO — start_ref: r2_repo_with_sentinel_wal_window · evidence: db_query
    NEGATIVE_CONTROL: would fail if contract still requires system_identifier inequality; second restore fails because first consumed backups; row counts differ between clones
    MUST_OBSERVE: both restores exit 0; COUNT(*) beliefs/pitr_sentinel equal across both (concrete integer match); system_identifier_first = system_identifier_second; contract text does not require system_identifier inequality
    MUST_NOT_OBSERVE: system_identifier inequality required by contract; row counts differ; single restore only
  verify: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts -t 'repeatable'

AC-4 Contract honesty + invalid timestamp fail-closed (flow_ref T-PLAT-022)
  GIVEN: a promoted restore at Tt OR an invalid timestamp outside the WAL window
  WHEN:  inspecting post-restore configuration / invoking restore with an out-of-range timestamp
  THEN:  the contract MUST NOT require the promoted clone to re-point and apply later source primary WAL as standby catch-up; optional pause-mode restore_command for rehearsal is documented separately from promote; invalid timestamp outside WAL range still fails closed with named error ('outside available WAL' OR 'not in retention window')
  TEST_TIER: integration · VERIFICATION_SERVICE: contract-docs+holo-restore · TDD_STATE: red→green
  SCENARIO — start_ref: promoted_restore_scratch · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if AC-4 still requires promoted cluster to apply later source WAL; invalid timestamp path removed; invented recovery fields remain
    MUST_OBSERVE: no invented recovery-timestamp column assertion; no system_identifier inequality assertion; no promoted catch-up-to-source requirement; invalid timestamp exits non-zero with 'outside available WAL' OR 'not in retention window'
    MUST_NOT_OBSERVE: promoted catch-up to source still required; invented recovery-timestamp column still present
  verify: rg -n 'system_identifier|target-action|catch-up|outside available WAL|pg_is_in_recovery' .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02*.md

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
1. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-03-configure-continuous-wal-archiving-and-scheduled-base-backups.md:32-280 [INFRA task structure]
2. /Users/inference1/Projects/holocron/services/platform/src/cli/holo.ts [CLI command parsing pattern]
3. /Users/inference1/Projects/holocron/services/platform/src/backup/wal-archive.ts [pgBackRest integration pattern]
4. https://pgbackrest.org/command.html#command-restore [target-action pause|promote]
5. PostgreSQL docs: pg_is_in_recovery, pg_last_wal_replay_lsn, pg_last_xact_replay_timestamp, pg_controldata system_identifier
6. REDHAT-FIX-C3 — correct PITR recovery/promotion/LSN contract (review C-3)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Pause recovery proof: `holo restore --pitr <Tt> --scratch <dir> --target-action=pause` → Exit 0; pg_is_in_recovery=true; sentinels prove cut; pg_last_wal_replay_lsn non-null
- Promote writable proof: `holo restore --pitr <Tt> --scratch <dir> --target-action=promote` → Exit 0; pg_is_in_recovery=false; INSERT succeeds
- Invalid timestamp rejection: `holo restore --pitr 2099-01-01T00:00:00Z --scratch /tmp/verify-invalid` → Exit non-zero; stderr contains 'outside available WAL' or 'not in retention window'
- Contract suite: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts`
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check services/platform/src/backup/restore.ts services/platform/src/cli/holo.ts` → Exit 0

--------------------------------------------------------------------------------
DESIGN / ANTI-PATTERN
--------------------------------------------------------------------------------
pattern: Two-phase PITR proof — (1) pause + sentinel visibility + real recovery functions; (2) promote + writability. Physical clone identity preserved (equal system_identifier).
pattern_source: pgBackRest restore --type=time --target-action=pause|promote; PostgreSQL recovery control functions
anti_pattern: Promote then query pg_stat_recovery for exact replay; invent invented recovery-timestamp column; require distinct system_identifier for physical clones; treat promoted clone as standby of original primary; echo operator --pitr argv as actual_stop_timestamp proof

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D04-02, D04-03 · Blocks: D05-04, D05-06 · Contract corrected by: REDHAT-FIX-C3

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
    "r2_repo_with_sentinel_wal_window": {
      "description": "Real pgBackRest repo covering a known WAL window with pitr_sentinel rows inserted before and after the target timestamp.",
      "seed_method": "public_api",
      "records": [
        "Table pitr_sentinel(id, label, observed_at timestamptz, note text)",
        "Row A: observed_at = T0 (before target), label='before-target'",
        "Row B: observed_at = T1 (after target), label='after-target' — written after target cut",
        "Base backup + WAL continuous across [T0, T1]",
        "Target timestamp Tt with T0 < Tt < T1"
      ]
    },
    "pause_restore_scratch": {
      "description": "Scratch PGDATA restored with --target-action=pause at Tt.",
      "seed_method": "cli",
      "records": [
        "holo restore --pitr <Tt> --scratch <dir> --target-action=pause",
        "Postgres started in recovery"
      ]
    },
    "promoted_restore_scratch": {
      "description": "Scratch PGDATA restored with --target-action=promote at Tt.",
      "seed_method": "cli",
      "records": [
        "holo restore --pitr <Tt> --scratch <dir> --target-action=promote",
        "Postgres accepting writes"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-022",
      "description": "GIVEN r2_repo_with_sentinel_wal_window (T0 < Tt < T1) WHEN operator runs holo restore --pitr <Tt> --scratch <dir> --target-action=pause THEN exit 0; pg_is_in_recovery()=true; SELECT COUNT(*) FROM pitr_sentinel WHERE label='before-target' >= 1; SELECT COUNT(*) FROM pitr_sentinel WHERE label='after-target' = 0; pg_last_wal_replay_lsn() IS NOT NULL — WITHOUT reading any invented non-existent pg_stat_recovery timestamp columns field.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts -t 'pause'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pgBackRest+R2+Postgres+holo-restore",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "AC still requires promote + pg_stat_recovery together",
            "test asserts invented recovery-timestamp column column",
            "pause mode not used for recovery proof",
            "after-target rows visible at paused Tt (replay too far)",
            "stub/static implementation hardcodes pass without real product behavior",
            "mock empty start state still passes oracle"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "r2_repo_with_sentinel_wal_window",
            "action": {
              "actor": "operator",
              "steps": [
                "Seed backup with before-target and after-target sentinel rows around Tt",
                "Run holo restore --pitr Tt --target-action=pause --scratch <dir>",
                "Query pg_is_in_recovery(), sentinel counts, pg_last_wal_replay_lsn()"
              ]
            },
            "end_state": {
              "must_observe": [
                "restore exit code = 0",
                "SELECT pg_is_in_recovery() returns boolean true (== true)",
                "COUNT(*) pitr_sentinel label=before-target >= 1",
                "COUNT(*) pitr_sentinel label=after-target = 0",
                "pg_last_wal_replay_lsn() IS NOT NULL AND length(text) >= 1",
                "zero invented non-existent pg_stat_recovery fields in D05-02 contract and test"
              ],
              "must_not_observe": [
                "pg_is_in_recovery() = false during pause proof",
                "after-target row count >= 1",
                "assertion on invented non-existent pg_stat_recovery timestamp columns",
                "empty/start signature: promote used as the only recovery proof"
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
      "description": "GIVEN the same seeded repo WHEN operator runs restore with --target-action=promote at Tt THEN exit 0; pg_is_in_recovery()=false; DB accepts INSERT; before-target rows present; after-target rows absent; promotion is tested separately from recovery catalog views.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts -t 'promote'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pgBackRest+R2+Postgres+holo-restore",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "promotion AC still queries pg_stat_recovery for replay proof",
            "INSERT fails because still in recovery",
            "after-target data present",
            "stub/static implementation hardcodes pass without real product behavior",
            "mock empty start state still passes oracle"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "promoted_restore_scratch",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo restore --pitr Tt --target-action=promote --scratch <dir>",
                "SELECT pg_is_in_recovery(); INSERT into a scratch table; query sentinels"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code = 0",
                "pg_is_in_recovery() returns boolean false (== false)",
                "INSERT 0 1 succeeds",
                "before-target count >= 1 AND after-target count = 0"
              ],
              "must_not_observe": [
                "pg_is_in_recovery() = true after promote",
                "INSERT fails",
                "empty/start signature: success without starting Postgres"
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
      "description": "GIVEN two independent restores of the same source backup/WAL to different scratch dirs at the same Tt WHEN both complete successfully THEN row counts match exactly AND pg_controldata system_identifier values are EQUAL (physical restore preserves system identifier) — D05-02 MUST NOT require inequality.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts -t 'repeatable'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pgBackRest+R2+Postgres",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "contract still requires system_identifier inequality",
            "second restore fails because first consumed backups",
            "row counts differ between clones",
            "stub/static implementation hardcodes pass without real product behavior",
            "mock empty start state still passes oracle"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "r2_repo_with_sentinel_wal_window",
            "action": {
              "actor": "operator",
              "steps": [
                "Restore to /tmp/restore-first and /tmp/restore-second at same Tt",
                "Compare COUNT(*) and system_identifier"
              ]
            },
            "end_state": {
              "must_observe": [
                "both restores exit 0",
                "COUNT(*) beliefs/pitr_sentinel equal across both clones (integer N == N, N >= 0)",
                "system_identifier_first == system_identifier_second (equal 64-bit ids)",
                "D05-02 contract text does not require system_identifier inequality"
              ],
              "must_not_observe": [
                "system_identifier inequality required by contract",
                "row counts differ",
                "empty/start signature: single restore only"
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
      "description": "GIVEN a promoted restore at Tt WHEN inspecting post-restore configuration THEN the contract MUST NOT require the promoted clone to re-point and apply later source primary WAL as standby catch-up; optional pause-mode restore_command for rehearsal is documented separately from promote; invalid timestamp outside WAL range still fails closed with named error.",
      "verify": "rg -n 'system_identifier|target-action|catch-up|outside available WAL|pg_is_in_recovery' .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02*.md",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "contract-docs+holo-restore",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "AC-4 still requires promoted cluster to apply later source WAL",
            "invalid timestamp path removed",
            "invented recovery fields remain in contract"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "promoted_restore_scratch",
            "action": {
              "actor": "operator",
              "steps": [
                "Rewrite D05-02 AC-4 to drop post-promote source-WAL catch-up requirement",
                "Keep invalid timestamp fail-closed AC",
                "Remove invented recovery-timestamp column and system_identifier inequality from contract"
              ]
            },
            "end_state": {
              "must_observe": [
                "D05-02 has no invented recovery-timestamp column assertion",
                "D05-02 has no system_identifier inequality assertion",
                "D05-02 does not require promoted clone to apply later source WAL",
                "invalid timestamp still exits non-zero with 'outside available WAL' OR 'not in retention window'"
              ],
              "must_not_observe": [
                "promoted catch-up to source still required",
                "invented recovery-timestamp column still present",
                "empty/start signature: contract unchanged from reviewed broken text"
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
      "description": "D05-02 contract contains zero invented non-existent pg_stat_recovery timestamp field names",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts -t 'zero last_applied'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "D05-02 contract does not require system_identifier inequality",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts -t 'system_identifier'"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Pause vs promote scenarios documented as separate ACs",
      "maps_to_ac": "AC-1",
      "verify": "rg -n 'target-action=pause|target-action=promote|pg_is_in_recovery' .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02-holo-restore-pitr-timestamp-operator-command.md"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Invalid timestamp fails closed with clear error",
      "maps_to_ac": "AC-4",
      "verify": "holo restore --pitr <invalid-timestamp> exits non-zero; stderr contains 'outside available WAL' or 'not in retention window'"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "PITR contract integration test file exists and is PLATFORM_IT guarded",
      "maps_to_ac": "AC-1",
      "verify": "test -f services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts && rg -n 'PLATFORM_IT' services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts"
    }
  ]
}
-->

</details>
