# REDHAT-FIX-S27-19 — [R-5] Scope or break-glass the backup:healthy --all heartbeat update

## What this does

Scopes runHealthyBackupJob('all') so the default path no longer executes UPDATE backup_heartbeat SET status='success' with no WHERE. Default --all only touches allowlisted production job names and/or explicit test prefixes (or DELETEs test rows + runs real success writers); unscoped full-table silence requires an explicit break-glass env. A red_first integration test proves the negative control still fails today and greens after the gate.

## Why

R-5 HIGH residual of F-13: any local session that can run holo can silence ALL overdue/failed backup alerts via backup:healthy --all — exact D04-01 anti-pattern as a standing CLI surface. Gate steps 4–7/8/10 invoke healthy --all and harness jobs (s27-11-*, s27-15-*, all-clear) pollute the production heartbeat table while also mass-clearing real jobs.

## How to verify

PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts → Exit 0; rg shows no unscoped UPDATE without break-glass guard; pnpm tsgo --noEmit; pnpm biome check .

## Scope

services/platform/src/backup/alerting.ts runHealthyBackupJob + CLI wiring if needed + new integration test. Prefer not to redesign induce paths.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-19 — [R-5] Scope or break-glass the backup:healthy --all heartbeat update
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P1
EFFORT:     M  (90 min)
AGENT:      implementer=mastra-implementer | reviewer=security-reviewer
PROPOSED-BY: security-reviewer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Default clearAll only succeeds allowlisted/test-prefix rows (or deletes test rows); a seeded non-allowlist failed/overdue job remains failed/overdue after --all without break-glass; unscoped full-table success UPDATE runs only when break-glass env is set; red_first integration suite greens; typecheck and lint clean.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST remove the unscoped UPDATE backup_heartbeat SET status='success', last_success_at=now() with no WHERE as the default clearAll path (alerting.ts:646-653)
- MUST scope default backup:healthy --all / runHealthyBackupJob('all'|'*') to an explicit job allowlist (production job names: wal_archive, base_backup, restic_blob_mirror or documented set) and/or test prefixes (e.g. s27-*, redhat-fix-*, all-clear, test-*)
- MUST require an explicit break-glass env (e.g. HOLO_BACKUP_HEALTHY_UNSCOPED=1 or HOLO_BACKUP_HEALTHY_BREAK_GLASS=1) before any full-table success UPDATE / unscoped silence path
- MUST prefer DELETE of test-prefix rows + real successful job writers over mass status='success' when resetting harness pollution
- MUST preserve single-job path: runHealthyBackupJob(<jobId>) still UPDATE ... WHERE job_name = $jobId
- MUST Write red_first integration test that fails while unscoped UPDATE remains available without break-glass
- MUST Keep gate/RED isolation usable: allowlisted/test-prefix reset still clears induced store + scoped heartbeats so steps 4–7 silence path works for harness jobs
- Never leave UPDATE backup_heartbeat SET status='success' ... with no WHERE as the default clearAll implementation
- Never allow backup:healthy --all without break-glass to mark a deliberately failed/overdue non-allowlist production-like job as success
- Never stub runHealthyBackupJob to return status success without touching the real backup_heartbeat table
- Never hardcode a green test that only asserts return status without querying heartbeat rows
- Never remove the induced-store clear for clearAll (inducedByJob + durable store still reset)
- Never broaden write scope beyond alerting.ts, optional holo.ts wiring for break-glass messaging, and the new/updated integration test
- STRICTLY CAP-BAK-01: healthy run stays silent is for real healthy jobs — not a standing CLI weapon to silence all overdue/failed alerts
- STRICTLY preserve finding severity HIGH for R-5; do not downgrade in AC text
- STRICTLY primary ACs are integration against real Postgres backup_heartbeat rows

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Default --all does not unscoped-UPDATE all heartbeats to success
- [ ] AC-2: Allowlist / test-prefix scope still resets harness jobs
- [ ] AC-3: Break-glass env required for unscoped full-table silence
- [ ] AC-4: Negative control — unscoped UPDATE without break-glass still available fails the suite
- [ ] AC-5: Single-job healthy path unchanged
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean on write_allowed paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — Default --all does not unscoped-UPDATE all heartbeats to success (flow_ref CAP-BAK-01)
  GIVEN backup_heartbeat contains (a) allowlisted/test-prefix jobs and (b) at least one non-allowlist production-like job (e.g. prod-canary-overdue) with status='failed' or stale last_success_at that would be overdue, and break-glass env is unset
  WHEN  runHealthyBackupJob('all') or CLI backup:healthy --all is invoked
  THEN  only allowlisted production jobs and/or test-prefix rows are set to success or deleted; the non-allowlist failed/overdue row remains failed/overdue (status and last_success_at not mass-reset); induced store is still cleared
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: postgres-backup-heartbeat
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-1'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if unscoped UPDATE without WHERE still runs on clearAll without break-glass; stub returns status success without querying backup_heartbeat; oracle only checks function return value and ignores residual failed rows
  START_REF: s27-19-mixed-heartbeat-table
  MUST_OBSERVE: non-allowlist job prod-canary-overdue still status=failed or overdue (last_success_at not advanced by unscoped mass UPDATE); clearAll returns without requiring break-glass for scoped path; induced store empty after clearAll
  MUST_NOT_OBSERVE: all rows status=success after --all without break-glass; prod-canary-overdue last_success_at equal to mass-updated now() alongside every other row
  EVIDENCE: db_query

### AC-2 — Allowlist / test-prefix scope still resets harness jobs (flow_ref CAP-BAK-01)
  GIVEN heartbeat rows for documented allowlist (wal_archive, base_backup, restic_blob_mirror) and test prefixes (s27-*, redhat-fix-*, all-clear or equivalent) are failed/stale, break-glass unset
  WHEN  runHealthyBackupJob('all') executes the scoped path
  THEN  those allowlisted/test-prefix rows are success (or test rows deleted) so gate/RED isolation reset remains usable; induced store cleared
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: postgres-backup-heartbeat
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-2'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if scoped path is a no-op that leaves harness jobs failed (breaks gate isolation); implementation only clears induced store and never touches allowlisted heartbeats
  START_REF: s27-19-harness-prefix-jobs
  MUST_OBSERVE: wal_archive status=success OR documented allowlist success; s27-19-test-job status=success OR row deleted
  MUST_NOT_OBSERVE: s27-19-test-job still failed after scoped --all; induced store still non-empty
  EVIDENCE: db_query

### AC-3 — Break-glass env required for unscoped full-table silence (flow_ref CAP-BAK-01)
  GIVEN multiple non-allowlist failed jobs exist and operator intends full-table success refresh
  WHEN  runHealthyBackupJob('all') is called WITH break-glass env set (documented name) and without it
  THEN  with break-glass: unscoped or fully exhaustive success path may run and all targeted rows become success; without break-glass: unscoped path is refused / not executed (scoped only)
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: postgres-backup-heartbeat
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-3'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if unscoped UPDATE still available when break-glass env is unset; break-glass env is ignored and default path always full-table UPDATEs
  START_REF: s27-19-non-allowlist-failed-jobs
  MUST_OBSERVE: without break-glass: non-allowlist jobs remain failed; with break-glass: unscoped path documented and executes only when env set
  MUST_NOT_OBSERVE: unscoped full-table success UPDATE with break-glass unset
  EVIDENCE: db_query

### AC-4 — Negative control — unscoped UPDATE without break-glass still available fails the suite (flow_ref CAP-BAK-01)
  GIVEN the redhat-fix-s27-19 suite encodes the R-5 defect (clearAll path can mass-success all jobs without allowlist/break-glass)
  WHEN  the suite runs against a regression that reintroduces UPDATE ... no WHERE as default clearAll
  THEN  the suite MUST fail (negative control load-bearing); pre-fix RED evidence captures failure; post-fix GREEN has no unscoped default path
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: postgres-backup-heartbeat
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-4'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if unscoped UPDATE without break-glass still available; still silences all jobs without allowlist; test only greps source comments without exercising DB
  START_REF: s27-19-mixed-heartbeat-table
  MUST_OBSERVE: suite exit 0 only when unscoped default path is gone; RED log shows pre-fix mass-silence of non-allowlist job
  MUST_NOT_OBSERVE: suite greens while alerting.ts still has unscoped UPDATE for clearAll without break-glass guard
  EVIDENCE: stdout

### AC-5 — Single-job healthy path unchanged (flow_ref CAP-BAK-01)
  GIVEN two jobs A and B both failed
  WHEN  runHealthyBackupJob(A) is called (not all)
  THEN  only job A is success; job B remains failed; no full-table UPDATE
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: postgres-backup-heartbeat
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-5'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if single-job path accidentally clears all rows; WHERE job_name clause removed from single-job UPDATE
  START_REF: s27-19-two-failed-jobs
  MUST_OBSERVE: job-a status=success; job-b status=failed
  MUST_NOT_OBSERVE: job-b status=success
  EVIDENCE: db_query


--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Non-allowlist failed job remains failed after backup:healthy --all when break-glass is unset | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-s...` |
| TC-2 | Allowlisted and test-prefix harness jobs are reset to success or deleted by scoped --all | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-s...` |
| TC-3 | Unscoped full-table success path runs only when break-glass env is set | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-s...` |
| TC-4 | Suite fails when default clearAll still executes UPDATE backup_heartbeat with no WHERE without break-glass | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-s...` |
| TC-5 | Single-job healthy updates only the requested job_name row | AC-5 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-s...` |
| TC-6 | Typecheck and lint are clean on write_allowed surfaces | AC-1 | `pnpm tsgo --noEmit && pnpm biome check services/platform/src/backup/alerting.ts services/platform...` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/alerting.ts (MODIFY)
- services/platform/src/cli/holo.ts (MODIFY — only if break-glass messaging / flag docs needed)
- services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts (NEW)
- .tmp/redhat-fix-s27-19*/** (NEW evidence)

writeProhibited:
- services/platform/src/backup/heartbeat.ts — heartbeat schema ownership
- services/platform/src/backup/wal-archive.ts
- services/platform/src/backup/base-backup.ts
- services/platform/src/backup/restic-mirror.ts
- services/platform/src/backup/r2-provision.ts
- services/platform/deploy/launchd/** — out of R-5 scope (R-10 owns launchd secrets)
- services/platform/config/**
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json — gate rewrite is other REDHAT-FIX tasks

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. services/platform/src/backup/alerting.ts:619-683 — runHealthyBackupJob clearAll branch — unscoped UPDATE at 646-653 (R-5 primary fix site)
2. services/platform/src/cli/holo.ts:2286-2330 — backup:healthy --all CLI surface; optional break-glass messaging
3. .spec/reviews/red-hat-sprint27-20260728T082702Z.md:82-87 — R-5 finding text: location, risk, expected fix
4. services/platform/tests/integration/sprint27-backup-alerting-red.test.ts:715-810 — Gate/RED isolation depends on healthy --all; must keep scoped reset usable
5. services/platform/src/backup/restic-mirror.ts:61-80 — mode 0o600 + secrets hygiene pattern (reference only for R-10 sibling; not required for this task)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED then GREEN integration suite: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts` → Exit 0 after fix; pre-fix RED fails on non-allowlist mass-silence
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0 (or scoped biome on write_allowed if repo-wide pre-existing noise)
- Static: no default unscoped clearAll UPDATE: `rg -n "UPDATE backup_heartbeat" -A8 services/platform/src/backup/alerting.ts` → clearAll path has WHERE allowlist/prefix OR is behind break-glass branch

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: SPRINT.md, .spec/reviews/red-hat-sprint27-20260728T082702Z.md (R-5), CAP-BAK-01 D04-01 healthy-silence anti-pattern
Pattern: const clearAll = jobId === 'all' || jobId === '*'; if (clearAll) { clear induced store; if (process.env.HOLO_BACKUP_HEALTHY_BREAK_GLASS === '1') { /* optional unscoped UPDATE */ } else { await sql`UPDATE backup_heartbeat SET status='success', last_success_at=now(), updated_at=now() WHERE job_name = ANY(${allowlist}) OR job_name LIKE ${testPrefixPattern}`; /* and/or DELETE test rows */ } }
Anti-pattern: UPDATE backup_heartbeat SET status='success' with no WHERE as default --all (R-5 / F-13 residual); silent-healthy weapon on standing CLI; test that only asserts return {status:'success'} without SELECT; deleting ALL rows including production jobs without allowlist
- Gate steps that call backup:healthy --all remain valid if they only need allowlisted/test-prefix reset; production-like residual rows must not be silently healed
- Document break-glass env name in CLI error/help when operator requests true full-table reset

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- RED then GREEN integration suite: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts` → Exit 0 after fix; pre-fix RED fails on non-allowlist mass-silence
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0 (or scoped biome on write_allowed if repo-wide pre-existing noise)
- Static: no default unscoped clearAll UPDATE: `rg -n "UPDATE backup_heartbeat" -A8 services/platform/src/backup/alerting.ts` → clearAll path has WHERE allowlist/prefix OR is behind break-glass branch

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: mastra-implementer
- Reviewer: security-reviewer
- Rationale: Load-bearing production change in runHealthyBackupJob (alerting.ts) that must stop unscoped bulk success UPDATE while preserving gate/RED harness reset semantics; mastra-implementer owns GREEN under red_first TDD.
- Proposed by: security-reviewer

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: ['CAP-BAK-01']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- brain/docs/ANTI-STUB-REVIEW.md
- brain/docs/TDD-METHODOLOGY.md
- services/platform conventions

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['D04-05', 'REDHAT-FIX-S27-04', 'REDHAT-FIX-S27-12']
- blocks: []

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T082702Z.md (REDHAT-FIX-S27-19)
- CAP-BAK-01 residual remediation — gate honesty + production-truth.
- Specialist JSON retained at .tmp/s27-redhat-r-cycle2-expanded-tasks.json

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-19",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s27-19-mixed-heartbeat-table": {
      "description": "Real backup_heartbeat rows mixing allowlist/test-prefix jobs with a non-allowlist production-like failed/overdue job used as the silent-healthy oracle",
      "seed_method": "public_api",
      "records": [
        "upsertBackupHeartbeat job_name=wal_archive status=failed",
        "upsertBackupHeartbeat job_name=s27-19-test-job status=failed",
        "upsertBackupHeartbeat job_name=prod-canary-overdue status=failed last_success_at=now()-2h",
        "break-glass env unset (HOLO_BACKUP_HEALTHY_UNSCOPED / HOLO_BACKUP_HEALTHY_BREAK_GLASS not set)",
        "pre-fix defect: alerting.ts:646-653 UPDATE with no WHERE marks ALL rows success including prod-canary-overdue"
      ]
    },
    "s27-19-harness-prefix-jobs": {
      "description": "Gate/harness jobs that must still reset under scoped --all so isolation steps keep working",
      "seed_method": "public_api",
      "records": [
        "job_name=wal_archive status=failed",
        "job_name=base_backup status=failed",
        "job_name=restic_blob_mirror status=failed",
        "job_name=s27-19-test-job status=failed",
        "induced store has at least one annotation for s27-19-test-job"
      ]
    },
    "s27-19-non-allowlist-failed-jobs": {
      "description": "Two non-allowlist failed jobs proving break-glass gating of unscoped silence",
      "seed_method": "public_api",
      "records": [
        "job_name=ops-manual-a status=failed",
        "job_name=ops-manual-b status=failed"
      ]
    },
    "s27-19-two-failed-jobs": {
      "description": "Pair of jobs for single-job WHERE-clause regression",
      "seed_method": "public_api",
      "records": [
        "job_name=job-a status=failed",
        "job_name=job-b status=failed"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN backup_heartbeat contains allowlisted/test-prefix jobs and a non-allowlist production-like failed/overdue job and break-glass is unset WHEN runHealthyBackupJob('all') or backup:healthy --all runs THEN only allowlisted/test-prefix rows are success or deleted; the non-allowlist failed/overdue row remains failed/overdue; induced store cleared",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-1'",
      "primary": true,
      "flow_ref": "CAP-BAK-01",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-backup-heartbeat",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "unscoped UPDATE without WHERE still runs on clearAll without break-glass",
            "stub returns status success without querying backup_heartbeat",
            "oracle only checks function return value and ignores residual failed rows"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-19-mixed-heartbeat-table",
            "action": {
              "actor": "operator",
              "steps": [
                "ensure break-glass env unset",
                "seed allowlist/test-prefix rows + non-allowlist failed/overdue row via real upsert/SQL",
                "invoke runHealthyBackupJob('all')",
                "SELECT job_name, status, last_success_at FROM backup_heartbeat"
              ]
            },
            "end_state": {
              "must_observe": [
                "non-allowlist job prod-canary-overdue still status=failed or overdue",
                "induced store empty after clearAll"
              ],
              "must_not_observe": [
                "all rows status=success after --all without break-glass"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN allowlist and test-prefix heartbeat rows are failed/stale and break-glass unset WHEN runHealthyBackupJob('all') executes the scoped path THEN those rows are success or deleted so gate/RED isolation remains usable; induced store cleared",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-2'",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-backup-heartbeat",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "scoped path is a no-op that leaves harness jobs failed",
            "implementation only clears induced store and never touches allowlisted heartbeats"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-19-harness-prefix-jobs",
            "action": {
              "actor": "gate-harness",
              "steps": [
                "seed s27-19-test-job and wal_archive as failed",
                "runHealthyBackupJob('all') without break-glass",
                "query heartbeats for those job names"
              ]
            },
            "end_state": {
              "must_observe": [
                "wal_archive status=success OR documented allowlist success",
                "s27-19-test-job status=success OR row deleted"
              ],
              "must_not_observe": [
                "s27-19-test-job still failed after scoped --all"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN non-allowlist failed jobs exist WHEN runHealthyBackupJob('all') is called with and without break-glass env THEN without break-glass unscoped path is not executed; with break-glass the explicit unscoped path may run",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-3'",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-backup-heartbeat",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "unscoped UPDATE still available when break-glass env is unset",
            "break-glass env is ignored"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-19-non-allowlist-failed-jobs",
            "action": {
              "actor": "operator",
              "steps": [
                "seed two non-allowlist failed jobs",
                "runHealthyBackupJob('all') with break-glass unset",
                "set break-glass and re-run if unscoped path is offered"
              ]
            },
            "end_state": {
              "must_observe": [
                "without break-glass non-allowlist jobs remain failed"
              ],
              "must_not_observe": [
                "unscoped full-table success UPDATE with break-glass unset"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN the suite encodes R-5 WHEN a regression reintroduces UPDATE ... no WHERE as default clearAll without break-glass THEN the suite fails (negative control: unscoped UPDATE without break-glass still available / still silences all jobs without allowlist)",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-4'",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-backup-heartbeat",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "unscoped UPDATE without break-glass still available",
            "still silences all jobs without allowlist"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-19-mixed-heartbeat-table",
            "action": {
              "actor": "reviewer",
              "steps": [
                "run suite behavioral oracle against mass-silence without break-glass"
              ]
            },
            "end_state": {
              "must_observe": [
                "suite exit 0 only when unscoped default path is gone"
              ],
              "must_not_observe": [
                "suite greens while clearAll still unscoped without break-glass"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN two failed jobs A and B WHEN runHealthyBackupJob(A) THEN only A is success and B remains failed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-5'",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres-backup-heartbeat",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "single-job path clears all rows",
            "WHERE job_name clause removed"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "s27-19-two-failed-jobs",
            "action": {
              "actor": "operator",
              "steps": [
                "seed job-a and job-b failed",
                "runHealthyBackupJob('job-a')",
                "query both rows"
              ]
            },
            "end_state": {
              "must_observe": [
                "job-a status=success",
                "job-b status=failed"
              ],
              "must_not_observe": [
                "job-b status=success"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Non-allowlist failed job remains failed after backup:healthy --all when break-glass is unset",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Allowlisted and test-prefix harness jobs are reset to success or deleted by scoped --all",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Unscoped full-table success path runs only when break-glass env is set",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Suite fails when default clearAll still executes UPDATE backup_heartbeat with no WHERE without break-glass",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Single-job healthy updates only the requested job_name row",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts -t 'AC-5'",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Typecheck and lint are clean on write_allowed surfaces",
      "verify": "pnpm tsgo --noEmit && pnpm biome check services/platform/src/backup/alerting.ts services/platform/tests/integration/redhat-fix-s27-19-healthy-all-scoped.test.ts",
      "maps_to_ac": "AC-1"
    }
  ],
  "proposed_by": "security-reviewer",
  "touches_capabilities": [
    "CAP-BAK-01"
  ]
}
-->

