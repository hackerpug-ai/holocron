# REDHAT-FIX-C3 — Correct the PITR recovery/promotion/LSN contract and executable assertions (review C-3)

## What this does

Rewrite the D05-02 PITR acceptance contract so paused-recovery proof, promotion proof, and repeatable restore assertions are mutually compatible with real PostgreSQL/pgBackRest behavior — using seeded timestamp/LSN sentinel rows instead of invented pg_stat_recovery fields, and dropping incorrect system_identifier inequality and post-promote source-WAL catch-up requirements.

## Why

Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-C3). Grounded in UC-PLAT-06 / T-PLAT-022 / T-PLAT-025 / CAP-BAK-01. Review evidence: `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` (reviewed SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`).

## How to verify

- `! rg -n 'last_applied_timestamp' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02-holo-restore-pitr-timestamp-operator-command.md` → exit 0
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts` → RED until H1 lands restore; GREEN after H1 against corrected contract
- `pnpm tsgo --noEmit` → exit 0
- `pnpm biome check .` → exit 0 on touched files
- `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0

## Scope

Writes: /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02-holo-restore-pitr-timestamp-operator-command.md, services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts (NEW — contract RED), services/platform/tests/integration/helpers/pitr-sentinel-seed.ts (NEW — optional), .tmp/REDHAT-FIX-C3/**

Prohibited: Full restore product implementation owned by REDHAT-FIX-H1 beyond contract-required test scaffolding, Changing Postgres system_identifier artificially to satisfy a wrong AC, Inventing non-existent catalog columns

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-C3 — Correct the PITR recovery/promotion/LSN contract and executable assertions (review C-3)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
D05-02 (and any REDHAT-FIX-H1 restore tests) separate (1) --target-action=pause recovery proof with correct LSN/timestamp sentinel from seeded data, (2) promote path as a distinct writable-DB proof, (3) repeatable restores assert identical row counts and identical system_identifier for physical clones; zero references to pg_stat_recovery.last_applied_timestamp; zero requirement that promoted clones re-apply later source WAL; zero system_identifier inequality assertion.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Separate paused-recovery proof (--target-action=pause) from promotion proof (--target-action=promote)
- MUST Prove exact PITR cut using seeded sentinel table rows (timestamp and/or LSN known at seed time), not invented pg_stat_recovery columns
- MUST While paused in recovery, use valid recovery views/functions (e.g. pg_is_in_recovery()=true, pg_last_wal_replay_lsn()) plus sentinel row visibility
- MUST Promotion AC only asserts writable DB + exit 0 + sentinel data present — not pg_stat_recovery after promote
- MUST Repeatable physical restores of the same source must allow identical system_identifier (physical restore preserves it)
- NEVER require --target-action=promote AND pg_stat_recovery proof of exact replay in the same AC
- NEVER assert pg_stat_recovery.last_applied_timestamp (field does not exist)
- NEVER require physical restore clones to have different system_identifier values
- NEVER require a promoted PITR clone to fetch/apply later source WAL as if it were still a standby of the original primary
- NEVER mock Postgres recovery state
- STRICTLY pause-mode proof runs while pg_is_in_recovery() is true
- STRICTLY promote-mode proof runs while pg_is_in_recovery() is false and accepts writes
- STRICTLY sentinel rows are created during backup seed at known times so before/after target visibility is deterministic
- STRICTLY D05-02 task file ACs are rewritten to match these rules before H1 implements against them

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN r2_repo_with_sentinel_wal_window (T0 < Tt < T1) WHEN operator runs `holo restore --pitr <Tt> --scratch <dir> --tar
- [ ] AC-2: GIVEN the same seeded repo WHEN operator runs restore with --target-action=promote at Tt THEN exit 0; pg_is_in_recovery(
- [ ] AC-3: GIVEN two independent restores of the same source backup/WAL to different scratch dirs at the same Tt WHEN both complete
- [ ] AC-4: GIVEN a promoted restore at Tt WHEN inspecting post-restore configuration THEN the contract MUST NOT require the promote
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN r2_repo_with_sentinel_wal_window (T0 < Tt < T1) WHEN operator runs `holo r (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN r2_repo_with_sentinel_wal_window (T0 < Tt < T1) WHEN operator runs `holo restore --pitr <Tt> --scratch <dir> --target-action=pause` THEN exit 0; pg_is_in_recovery()=true; SELECT COUNT(*) FROM pitr_sentinel WHERE label='before-target' >= 1; SELECT COUNT(*) FROM pitr_sentinel WHERE label='after-target' = 0; and a valid recovery LSN function (pg_last_wal_replay_lsn()) returns non-null — WITHOUT reading any invented pg_stat_recovery.last_applied_timestamp field.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: pgBackRest+R2+Postgres+holo-restore
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts -t 'pause'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if AC still requires promote + pg_stat_recovery together; test asserts last_applied_timestamp column; pause mode not used for recovery proof; after-target rows visible at paused Tt (replay too far)
  START_REF: r2_repo_with_sentinel_wal_window
  MUST_OBSERVE: restore exit code = 0; SELECT pg_is_in_recovery() = true; COUNT(*) pitr_sentinel label=before-target >= 1; COUNT(*) pitr_sentinel label=after-target = 0; pg_last_wal_replay_lsn() IS NOT NULL; zero references to last_applied_timestamp in D05-02 contract and test
  MUST_NOT_OBSERVE: pg_is_in_recovery() = false during pause proof; after-target row count >= 1; assertion on pg_stat_recovery.last_applied_timestamp; empty/start signature: promote used as the only recovery proof
  EVIDENCE: db_query (required_capture=True)

### AC-2 — GIVEN the same seeded repo WHEN operator runs restore with --target-action=promo (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN the same seeded repo WHEN operator runs restore with --target-action=promote at Tt THEN exit 0; pg_is_in_recovery()=false; DB accepts INSERT; before-target rows present; after-target rows absent; promotion is tested separately from recovery catalog views.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: pgBackRest+R2+Postgres+holo-restore
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts -t 'promote'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if promotion AC still queries pg_stat_recovery for replay proof; INSERT fails because still in recovery; after-target data present
  START_REF: promoted_restore_scratch
  MUST_OBSERVE: exit code = 0; pg_is_in_recovery() = false; INSERT 0 1 succeeds; before-target count >= 1 AND after-target count = 0
  MUST_NOT_OBSERVE: pg_is_in_recovery() = true after promote; INSERT fails; empty/start signature: success without starting Postgres
  EVIDENCE: db_query (required_capture=True)

### AC-3 — GIVEN two independent restores of the same source backup/WAL to different scratc (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN two independent restores of the same source backup/WAL to different scratch dirs at the same Tt WHEN both complete successfully THEN row counts match exactly AND pg_controldata system_identifier values are EQUAL (physical restore preserves system identifier) — D05-02 MUST NOT require inequality.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: pgBackRest+R2+Postgres
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts -t 'repeatable'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if contract still requires system_identifier inequality; second restore fails because first consumed backups; row counts differ between clones
  START_REF: r2_repo_with_sentinel_wal_window
  MUST_OBSERVE: both restores exit 0; COUNT(*) beliefs/pitr_sentinel equal across both (concrete integer match); system_identifier_first = system_identifier_second; D05-02 contract text does not require system_identifier inequality
  MUST_NOT_OBSERVE: system_identifier inequality required by contract; row counts differ; empty/start signature: single restore only
  EVIDENCE: db_query (required_capture=True)

### AC-4 — GIVEN a promoted restore at Tt WHEN inspecting post-restore configuration THEN t (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN a promoted restore at Tt WHEN inspecting post-restore configuration THEN the contract MUST NOT require the promoted clone to re-point and apply later source primary WAL as standby catch-up; optional pause-mode restore_command for rehearsal is documented separately from promote; invalid timestamp outside WAL range still fails closed with named error.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: contract-docs+holo-restore
  VERIFY: `rg -n 'system_identifier|last_applied_timestamp|target-action|catch-up|outside available WAL' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02*.md`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if AC-4 still requires promoted cluster to apply later source WAL; invalid timestamp path removed; invented recovery fields remain in contract
  START_REF: promoted_restore_scratch
  MUST_OBSERVE: D05-02 has no last_applied_timestamp assertion; D05-02 has no system_identifier inequality assertion; D05-02 does not require promoted clone to apply later source WAL; invalid timestamp still exits non-zero with 'outside available WAL' OR 'not in retention window'
  MUST_NOT_OBSERVE: promoted catch-up to source still required; last_applied_timestamp still present; empty/start signature: contract unchanged from reviewed broken text
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | D05-02 contract contains zero last_applied_timestamp references | AC-1 | `! rg -n 'last_applied_timestamp' /Users/inference1/Projects/holocron/.spec/prds/` |
| TC-2 | D05-02 contract does not require system_identifier inequality | AC-3 | `! rg -n 'system_identifier.*!=' /Users/inference1/Projects/holocron/.spec/prds/m` |
| TC-3 | Pause vs promote scenarios documented as separate ACs | AC-1 | `rg -n 'target-action=pause|target-action=promote|pg_is_in_recovery' /Users/infer` |
| TC-4 | PITR contract integration test file exists and is PLATFORM_IT guarded | AC-1 | `test -f services/platform/tests/integration/sprint28-pitr-recovery-contract.test` |
| TC-5 | Typecheck + lint | AC-1 | `pnpm tsgo --noEmit && pnpm biome check services/platform/tests/integration/sprin` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02-holo-restore-pitr-timestamp-operator-command.md
- services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts (NEW — contract RED)
- services/platform/tests/integration/helpers/pitr-sentinel-seed.ts (NEW — optional)
- .tmp/REDHAT-FIX-C3/**
writeProhibited:
- Full restore product implementation owned by REDHAT-FIX-H1 beyond contract-required test scaffolding
- Changing Postgres system_identifier artificially to satisfy a wrong AC
- Inventing non-existent catalog columns

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/reviews/red-hat-20260728T235155Z-sprint-28.md:73-78 [C-3 finding: incompatible promote/recovery/system_identifier ACs]
2. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02-holo-restore-pitr-timestamp-operator-command.md:96-138 [broken AC-1..AC-4]
3. https://pgbackrest.org/command.html#command-restore [target-action pause|promote]
4. PostgreSQL docs: pg_is_in_recovery, pg_last_wal_replay_lsn, pg_controldata system_identifier
5. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md:57 [T-PLAT-022]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- contract-no-invented-fields: `! rg -n 'last_applied_timestamp' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02-holo-restore-pitr-timestamp-operator-command.md` → exit 0
- pitr-contract-tests: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts` → RED until H1 lands restore; GREEN after H1 against corrected contract
- typecheck: `pnpm tsgo --noEmit` → exit 0
- lint: `pnpm biome check .` → exit 0 on touched files

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260728T235155Z-sprint-28.md, ./SPRINT.md
Interaction notes:
- —
pattern: Two-phase PITR proof: (1) pause + sentinel visibility + real recovery functions; (2) promote + writability. Physical clone identity preserved.
pattern_source: pgBackRest restore --type=time --target-action=pause|promote; PostgreSQL recovery control functions
anti_pattern: Promote then query pg_stat_recovery; invent last_applied_timestamp; require distinct system_identifier; treat promoted clone as standby of original primary.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — C-3 is an unimplementable Postgres PITR contract (promote vs recovery, invented pg_stat_recovery fields, wrong system_identifier inequality, wrong post-promote catch-up model). DevOps owns the D05-02 restore contract and must rewrite ACs before implementation can land honestly.
Reviewer: code-reviewer (+ security-reviewer when task is security-scoped)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D05-02
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
  "task_id": "REDHAT-FIX-C3",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "r2_repo_with_sentinel_wal_window": {
      "description": "Real pgBackRest repo covering a known WAL window with pitr_sentinel rows inserted before and after the target timestamp.",
      "seed_method": "public_api",
      "records": [
        "Table pitr_sentinel(id, label, observed_at timestamptz, note text)",
        "Row A: observed_at = T0 (before target), label='before-target'",
        "Row B: observed_at = T1 (after target), label='after-target' \u2014 written after target cut",
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
      "description": "GIVEN r2_repo_with_sentinel_wal_window (T0 < Tt < T1) WHEN operator runs `holo restore --pitr <Tt> --scratch <dir> --target-action=pause` THEN exit 0; pg_is_in_recovery()=true; SELECT COUNT(*) FROM pitr_sentinel WHERE label='before-target' >= 1; SELECT COUNT(*) FROM pitr_sentinel WHERE label='after-target' = 0; and a valid recovery LSN function (pg_last_wal_replay_lsn()) returns non-null \u2014 WITHOUT reading any invented pg_stat_recovery.last_applied_timestamp field.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts -t 'pause'",
      "maps_to_ac": null,
      "primary": true,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pgBackRest+R2+Postgres+holo-restore",
        "topology": "single-node",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "AC still requires promote + pg_stat_recovery together",
            "test asserts last_applied_timestamp column",
            "pause mode not used for recovery proof",
            "after-target rows visible at paused Tt (replay too far)"
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
                "SELECT pg_is_in_recovery() = true",
                "COUNT(*) pitr_sentinel label=before-target >= 1",
                "COUNT(*) pitr_sentinel label=after-target = 0",
                "pg_last_wal_replay_lsn() IS NOT NULL",
                "zero references to last_applied_timestamp in D05-02 contract and test"
              ],
              "must_not_observe": [
                "pg_is_in_recovery() = false during pause proof",
                "after-target row count >= 1",
                "assertion on pg_stat_recovery.last_applied_timestamp",
                "empty/start signature: promote used as the only recovery proof"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN the same seeded repo WHEN operator runs restore with --target-action=promote at Tt THEN exit 0; pg_is_in_recovery()=false; DB accepts INSERT; before-target rows present; after-target rows absent; promotion is tested separately from recovery catalog views.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts -t 'promote'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pgBackRest+R2+Postgres+holo-restore",
        "topology": "single-node",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "promotion AC still queries pg_stat_recovery for replay proof",
            "INSERT fails because still in recovery",
            "after-target data present"
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
                "pg_is_in_recovery() = false",
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
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN two independent restores of the same source backup/WAL to different scratch dirs at the same Tt WHEN both complete successfully THEN row counts match exactly AND pg_controldata system_identifier values are EQUAL (physical restore preserves system identifier) \u2014 D05-02 MUST NOT require inequality.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts -t 'repeatable'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pgBackRest+R2+Postgres",
        "topology": "single-node",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "contract still requires system_identifier inequality",
            "second restore fails because first consumed backups",
            "row counts differ between clones"
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
                "COUNT(*) beliefs/pitr_sentinel equal across both (concrete integer match)",
                "system_identifier_first = system_identifier_second",
                "D05-02 contract text does not require system_identifier inequality"
              ],
              "must_not_observe": [
                "system_identifier inequality required by contract",
                "row counts differ",
                "empty/start signature: single restore only"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN a promoted restore at Tt WHEN inspecting post-restore configuration THEN the contract MUST NOT require the promoted clone to re-point and apply later source primary WAL as standby catch-up; optional pause-mode restore_command for rehearsal is documented separately from promote; invalid timestamp outside WAL range still fails closed with named error.",
      "verify": "rg -n 'system_identifier|last_applied_timestamp|target-action|catch-up|outside available WAL' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02*.md",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "contract-docs+holo-restore",
        "topology": "single-node",
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
                "Remove last_applied_timestamp and system_identifier inequality from contract"
              ]
            },
            "end_state": {
              "must_observe": [
                "D05-02 has no last_applied_timestamp assertion",
                "D05-02 has no system_identifier inequality assertion",
                "D05-02 does not require promoted clone to apply later source WAL",
                "invalid timestamp still exits non-zero with 'outside available WAL' OR 'not in retention window'"
              ],
              "must_not_observe": [
                "promoted catch-up to source still required",
                "last_applied_timestamp still present",
                "empty/start signature: contract unchanged from reviewed broken text"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "D05-02 contract contains zero last_applied_timestamp references",
      "verify": "! rg -n 'last_applied_timestamp' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02-holo-restore-pitr-timestamp-operator-command.md",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "D05-02 contract does not require system_identifier inequality",
      "verify": "! rg -n 'system_identifier.*!=' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02-holo-restore-pitr-timestamp-operator-command.md",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Pause vs promote scenarios documented as separate ACs",
      "verify": "rg -n 'target-action=pause|target-action=promote|pg_is_in_recovery' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02-holo-restore-pitr-timestamp-operator-command.md",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "PITR contract integration test file exists and is PLATFORM_IT guarded",
      "verify": "test -f services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts && rg -n 'PLATFORM_IT' services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Typecheck + lint",
      "verify": "pnpm tsgo --noEmit && pnpm biome check services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->

</details>
