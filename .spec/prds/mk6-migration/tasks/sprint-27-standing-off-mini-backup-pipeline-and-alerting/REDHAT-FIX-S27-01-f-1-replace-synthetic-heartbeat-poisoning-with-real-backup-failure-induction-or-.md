# REDHAT-FIX-S27-01 — [F-1] Replace synthetic heartbeat poisoning with real backup-failure induction or an honest production-truth gate

## What this does

Close red-hat F-1 by making backup failure induction real (or honestly split synthetic sweep harness from a production-truth gate) so CAP-BAK-01 alert proof exercises the production failure chain end-to-end.

## Why

- Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-S27-01).
- Grounded in UC-PLAT-06 / T-PLAT-024 / CAP-BAK-01.

## How to verify

- `pnpm tsgo --noEmit` → exit 0
- `pnpm biome check .` → exit 0
- `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → exit 0; real induction paths exercised
- `bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive --json` → real process fault evidence + heartbeat status=failed via production path

## Scope

Writes: services/platform/src/backup/alerting.ts, services/platform/src/backup/wal-archive.ts, services/platform/src/backup/base-backup.ts, services/platform/src/backup/restic-mirror.ts, services/platform/src/cli/holo.ts, services/platform/tests/integration/sprint27-backup-alerting-red.test.ts, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json, .tmp/D04-01/**, .tmp/REDHAT-FIX-S27-01/**

Prohibited: app/**, services/platform/src/db/migrations/**, services/platform/deploy/launchd/**, secrets.yaml, node_modules/**

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-01 — [F-1] Replace synthetic heartbeat poisoning with real backup-failure induction or an honest production-truth gate
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
An operator (or gate) can induce kill / credential-expired / config-removed against real backup tooling; the affected job writes status=failed (or becomes overdue after config removal) via production catch paths; alert sweep still fires; heartbeat-poison-only is no longer the sole certification path.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Replace or reframe induceBackupFailure so at least one production-truth path kills a real pgbackrest/restic process (or equivalent real fault) and the resulting heartbeat status='failed' is written by production job catch paths (wal-archive.ts ~506, base-backup.ts ~277), not solely by induceBackupFailure SQL upsert
- MUST Provide three silent-failure modes: (a) kill / WAL behind, (b) credential expired/rotated invalid, (c) config removed → pure overdue (stale last_success_at without fake status=failed-only theatre)
- MUST Update CLI holo backup:induce-failure and/or add explicit production-truth subcommand flags so gate + RED suite can invoke real induction
- MUST Update sprint27-backup-alerting-red.test.ts (and any gate steps using induce-failure) so PRIMARY proof no longer depends on lastWalSegment DEAD / cred-expired-snap / pre-removal-snap sentinels as the only signal
- MUST If synthetic poison is kept for sweep-unit mechanics, document it honestly and gate production-truth separately
- MUST pnpm tsgo --noEmit and pnpm biome check . clean on SCOPE.writeAllowed files
- NEVER Claim REAL induction while only poisoning backup_heartbeat with sentinel WAL/snapshot IDs
- NEVER Leave production docstring that says 'poisoning the heartbeat' as the sole described induction mechanism for the gate
- NEVER Allow runHealthyBackupJob bulk UPDATE to remain an unscoped silent-healthy weapon without WHERE on intended jobs (if touched, scope it)
- NEVER Mock fetch/webhook or stub pgbackrest exit as the sole failure proof
- NEVER Leave poisoned DEAD rows as the only durable evidence of 'kill' mode in gate artifacts
- STRICTLY PRIMARY proof observes process death / real auth failure / missing config on the mini AND heartbeat.status failed|overdue through production writers

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: AC-1
- [ ] AC-2: AC-2
- [ ] AC-3: AC-3
- [ ] AC-4: AC-4
- [ ] AC-5: AC-5
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — AC-1 (flow_ref T-PLAT-024)
  GIVEN healthy_wal_archive_ready + real backup tooling available on mini
  WHEN  operator induces kill mode against wal_archive with real process kill
  THEN  process gone; heartbeat.status=failed via production writer; induction evidence does not rely on DEAD sentinel alone
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: backup-failure-induction
  VERIFY: `bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive --json; assert induction reports real_process_killed or equivalent; query backup_heartbeat for wal_archive status=failed; assert production path (not only induce upsert of DEAD segment)`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if induceBackupFailure only SQL-poisons heartbeat with lastWalSegment=00000001000000000000DEAD and never kills a real process; status=failed is written only by harness upsert, bypassing wal-archive/base-backup catch blocks; stub/static mock returns failed without spawning or killing pgbackrest/restic; heartbeat-poison-only path is the sole gate proof for REAL induction
  START_REF: healthy_wal_archive_ready
  MUST_OBSERVE: induction mode=kill_wal_behind (or kill) for job_name=wal_archive; backup_heartbeat.wal_archive status=failed; evidence of real process kill or non-zero production job exit (pid_killed=true OR production_catch=true OR exit_code != 0 from real binary); trace_id or failure detail from production path len >= 1
  MUST_NOT_OBSERVE: sole proof is last_wal_segment=00000001000000000000DEAD with no process kill; status=success after kill induction; heartbeat-poison-only without production catch; mocked failed result with zero real binary interaction
  EVIDENCE: induction_and_heartbeat_artifact (required_capture=True)

### AC-2 — AC-2 (flow_ref T-PLAT-024)
  GIVEN real_credential_fault_ready
  WHEN  induce credential-expired then run affected job or induction that forces the job through real auth failure
  THEN  status=failed via production catch; failure_reason matches credential keywords
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: backup-failure-induction
  VERIFY: `bun services/platform/src/cli/holo.ts backup:induce-failure --mode credential-expired --job base_backup --json; assert real auth fault path; heartbeat status=failed`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if only upserts lastSnapshotId=cred-expired-snap without revoking/overriding real R2 credentials; job never invoked against invalid credentials; stub/static credential mode hardcodes failed heartbeat; heartbeat-poison-only path used as sole proof
  START_REF: real_credential_fault_ready
  MUST_OBSERVE: heartbeat.status=failed for induced job; failure_reason or detail contains credential|expired|denied|403|401|InvalidAccessKeyId (case-insensitive match on at least one); real job non-zero exit or Cloudflare/S3 auth error captured
  MUST_NOT_OBSERVE: only last_snapshot_id=cred-expired-snap with no auth error; status=success after credential induction; silent-healthy with no alertable failed/overdue state
  EVIDENCE: induction_and_heartbeat_artifact (required_capture=True)

### AC-3 — AC-3 (flow_ref T-PLAT-024)
  GIVEN real_config_removed_ready
  WHEN  induce config-removed and attempt job or wait for overdue detection
  THEN  config absent; heartbeat stale/overdue or failed; not silent-healthy
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: backup-failure-induction
  VERIFY: `bun services/platform/src/cli/holo.ts backup:induce-failure --mode config-removed --job restic_blob_mirror --json; assert config missing; heartbeat not advancing success`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if only sets lastSnapshotId=pre-removal-snap and status=success SQL without removing real config; config file still present after induction; stub/static mode reports overdue without filesystem change; heartbeat-poison-only path used as sole proof
  START_REF: real_config_removed_ready
  MUST_OBSERVE: real config path removed or renamed (exists=false on active path); job cannot complete success cycle with missing config; heartbeat is_overdue=true OR status=failed OR last_success_at older than overdue threshold after induction window
  MUST_NOT_OBSERVE: only pre-removal-snap poison with config still present; last_success_at advanced to now after config removal; false-healthy overall with no overdue/failed flag
  EVIDENCE: induction_and_heartbeat_artifact (required_capture=True)

### AC-4 — AC-4 (flow_ref CAP-BAK-01)
  GIVEN codebase post-fix with optional dual paths
  WHEN  review induceBackupFailure docstring, CLI banner, and gate step using induction
  THEN  honest naming; production-truth gate step present or all three modes real
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: holo-CLI
  VERIFY: `rg -n "poison|DEAD|cred-expired-snap" services/platform/src/backup/alerting.ts services/platform/src/cli/holo.ts; assert production-truth path or honest dual documentation; PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if docstring still claims poison is the induction for all gate proofs without separate production-truth; gate continues to use only SQL poison for kill/credential/config steps; RED suite only asserts DEAD sentinel without real fault path; stub/static implementation hardcodes healthy result with no real service round-trip
  START_REF: healthy_wal_archive_ready
  MUST_OBSERVE: either all three modes real OR dual-path with production-truth gate documented; PLATFORM_IT=1 RED suite exit 0 after GREEN for real induction changes; CLI surface exposes real induction (flags/mode docs accurate)
  MUST_NOT_OBSERVE: gate sole reliance on 00000001000000000000DEAD poison; silent rewrite of D04-01 REAL requirement to synthetic without documentation; RED suite green only because mocks replace real induction
  EVIDENCE: stdout (required_capture=True)

### AC-5 — AC-5
  GIVEN implementation complete
  WHEN  run typecheck + lint
  THEN  exit 0
  TEST_TIER: unit · TDD_STATE: red
  VERIFICATION_SERVICE: tooling
  VERIFY: `pnpm tsgo --noEmit; pnpm biome check .`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if type errors introduced in alerting.ts or holo.ts; biome violations left unfixed in write_allowed paths
  START_REF: healthy_wal_archive_ready
  MUST_OBSERVE: tsgo exit 0; biome check exit 0
  MUST_NOT_OBSERVE: error TS; biome Found errors
  EVIDENCE: stdout (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Real kill induction terminates process and production path sets wal_archive status=failed | AC-1 | `PLATFORM_IT=1 induction kill + heartbeat query; assert not poison-only` |
| TC-2 | Credential-expired induction causes real auth failure and status=failed | AC-2 | `induce credential-expired; observe auth error + failed heartbeat` |
| TC-3 | Config-removed induction removes real config and yields overdue/failed | AC-3 | `induce config-removed; config missing; heartbeat not success-advancing` |
| TC-4 | RED suite + honesty boundary for synthetic vs production-truth | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` |
| TC-5 | Typecheck and lint clean | AC-5 | `pnpm tsgo --noEmit; pnpm biome check .` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/alerting.ts
- services/platform/src/backup/wal-archive.ts
- services/platform/src/backup/base-backup.ts
- services/platform/src/backup/restic-mirror.ts
- services/platform/src/cli/holo.ts
- services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json
- .tmp/D04-01/**
- .tmp/REDHAT-FIX-S27-01/**
writeProhibited:
- app/**
- services/platform/src/db/migrations/**
- services/platform/deploy/launchd/**
- secrets.yaml
- node_modules/**

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T054039Z.md:29-33 — F-1 CRITICAL induceBackupFailure poison vs REAL induction requirement
2. services/platform/src/backup/alerting.ts:489-535 — induceBackupFailure poison implementation and sentinel IDs
3. services/platform/src/cli/holo.ts:2262-2297 — backup:induce-failure CLI dispatch
4. services/platform/src/backup/wal-archive.ts:494-513 — production status=failed catch + heartbeat upsert
5. services/platform/src/backup/base-backup.ts:264-281 — production status=failed catch for base backup
6. services/platform/tests/integration/sprint27-backup-alerting-red.test.ts:400-560 — RED suite calls induceBackupFailure for three modes
7. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-01-red-induced-backup-failure-must-alert-healthy-run-stays-silent.md:1-120 — REAL failure induction AC wording

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- `PLATFORM_IT=1 pnpm vitest run <path>` exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: SPRINT.md, red-hat-sprint27-20260728T054039Z.md
Interaction notes:
- Prefer real induction modes that restore config/creds after test (cleanup path) so production mini is not left broken
- May keep synthetic poison only if labeled and excluded from production-truth gate claims
- Coordinates with REDHAT-FIX-S27-04 (isolation) and S27-05 (gate RED) which assume honest induction
Pattern: Real operational fault → production job catch → backup_heartbeat status=failed/overdue → alert sweep
Pattern source: wal-archive.ts failure branch + D04-01 REAL induction AC + red-hat F-1 fix guidance
Anti-pattern: SQL heartbeat poisoning with DEAD/cred-expired-snap/pre-removal-snap as the only 'failure' proof (theatre certification)

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- typecheck: `pnpm tsgo --noEmit` → exit 0
- lint: `pnpm biome check .` → exit 0
- red-integration: `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → exit 0; real induction paths exercised
- kill-induction-cli: `bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive --json` → real process fault evidence + heartbeat status=failed via production path

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: devops-engineer
- Reviewer: code-reviewer
- Rationale: Owns the backup induction surface under services/platform/src/backup/alerting.ts and holo backup:induce-failure CLI; must rewire production failure induction through real pgbackrest/restic process, credential, or config faults so status=failed is written by production catch paths (wal-archive / base-backup / restic-mirror), not SQL heartbeat poisoning.
- Proposed by: devops-engineer

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]
- provides: ['real-backup-failure-induction', 'production-truth-failure-gate', 'honest-synthetic-harness-boundary']
- consumes: ['backup_heartbeat', 'pgbackrest-r2-repo', 'wal-archive-job', 'base-backup-job', 'restic-blob-mirror']
- boundary_contracts: [{'name': 'real-induction-vs-heartbeat-poison', 'rule': "backup:induce-failure (or replacement production-truth entrypoint) MUST induce a REAL operational fault — kill real pgbackrest/restic pid mid-job, revoke/rotate a test-scoped R2 credential via Cloudflare API / env override that causes auth failure, or rename/remove real pgbackrest.conf / restic config — and MUST observe status='failed' (or pure overdue for config_removed) written by production catch paths in wal-archive.ts / base-backup.ts / restic-mirror.ts. SQL-only upsert of sentinel lastWalSegment='00000001000000000000DEAD' / lastSnapshotId='cred-expired-snap'|'pre-removal-snap' is NOT sufficient proof of real induction.", 'sides': ['operator-CLI', 'backup-job-process', 'backup_heartbeat', 'R2/pgbackrest/restic']}, {'name': 'synthetic-harness-honesty', 'rule': "If a synthetic heartbeat-poison path is retained for fast CI sweep mechanics, it MUST be named and documented as synthetic (not production-truth), MUST NOT be the sole gate proof for D04-01 'REAL backup-job failure', and a separate smaller production-truth gate step MUST kill a real process (or revoke real cred / remove real config) and assert status=failed via production catch.", 'sides': ['test-harness', 'human-testing-gate', 'RED-suite']}]

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- brain/docs/REACT-RULES.md is N/A — use services/platform conventions
- RULES.md
- services/platform/src/backup/* existing spawnSync timeout + heartbeat patterns

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['D04-05', 'D04-01', 'D04-03']
- blocks: ['REDHAT-FIX-S27-04', 'REDHAT-FIX-S27-05']

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T054039Z.md (REDHAT-FIX-S27-01)
- CAP-BAK-01 remediation — gate honesty + production-truth.

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "healthy_wal_archive_ready": {
      "description": "Postgres archive_mode=always, pgbackrest configured to R2, wal_archive heartbeat fresh success so a subsequent real kill/fault is distinguishable",
      "seed_method": "entrypoint",
      "seed_entrypoint": "bun services/platform/src/cli/holo.ts backup:wal --json",
      "records": [
        "wal_archive heartbeat status=success before induction",
        "pgbackrest binary and repo config present on mini"
      ]
    },
    "real_kill_induction_ready": {
      "description": "A live backup job process (pgbackrest archive-push or backup) is startable so induce can kill its real pid mid-flight",
      "seed_method": "entrypoint",
      "seed_entrypoint": "bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive (post-fix real induction)",
      "records": [
        "target job process pid exists before kill",
        "after induction heartbeat.status=failed written by production catch path"
      ]
    },
    "real_credential_fault_ready": {
      "description": "Test-scoped R2 credential can be revoked/overridden so base_backup or mirror hits auth failure",
      "seed_method": "public_api",
      "records": [
        "invalid or revoked R2 cred active for job under test",
        "job exits non-zero; heartbeat.status=failed via production catch"
      ]
    },
    "real_config_removed_ready": {
      "description": "pgbackrest.conf or restic config renamed/removed so the job cannot run and heartbeat stops updating",
      "seed_method": "entrypoint",
      "seed_entrypoint": "bun services/platform/src/cli/holo.ts backup:induce-failure --mode config-removed --job restic_blob_mirror",
      "records": [
        "config path missing after induction",
        "heartbeat becomes overdue without fake-healthy success advances"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN healthy wal_archive WHEN real kill induction runs THEN process is killed and heartbeat status=failed via production catch \u2014 not DEAD-sentinel poison alone",
      "verify": "bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive --json + heartbeat assert",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-failure-induction",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "heartbeat-poison-only with lastWalSegment=00000001000000000000DEAD",
            "no real process kill",
            "stub/static mock failed result",
            "bypass production catch paths"
          ]
        },
        "evidence": {
          "artifact_type": "induction_and_heartbeat_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "healthy_wal_archive_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "run real kill induction",
                "observe heartbeat + kill evidence"
              ]
            },
            "end_state": {
              "must_observe": [
                "status=failed",
                "real process kill or production non-zero exit evidence"
              ],
              "must_not_observe": [
                "DEAD poison as sole proof",
                "status=success"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN real credential fault WHEN induction runs THEN status=failed via production catch with credential failure signals",
      "verify": "induce credential-expired; assert auth fault + failed heartbeat",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-failure-induction",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "only upserts lastSnapshotId=cred-expired-snap without revoking/overriding real R2 credentials",
            "job never invoked against invalid credentials",
            "stub/static credential mode hardcodes failed heartbeat",
            "heartbeat-poison-only path used as sole proof"
          ]
        },
        "evidence": {
          "artifact_type": "induction_and_heartbeat_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_credential_fault_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "induce credential-expired for base_backup (or restic_blob_mirror)",
                "ensure job executes against invalid creds",
                "read backup_heartbeat + induction JSON"
              ]
            },
            "end_state": {
              "must_observe": [
                "heartbeat.status=failed for induced job",
                "failure_reason or detail contains credential|expired|denied|403|401|InvalidAccessKeyId (case-insensitive match on at least one)",
                "real job non-zero exit or Cloudflare/S3 auth error captured"
              ],
              "must_not_observe": [
                "only last_snapshot_id=cred-expired-snap with no auth error",
                "status=success after credential induction",
                "silent-healthy with no alertable failed/overdue state"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN config-removed induction WHEN config is gone THEN job overdue/failed, not false-healthy",
      "verify": "induce config-removed; assert config missing + overdue/failed",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-failure-induction",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "only sets lastSnapshotId=pre-removal-snap and status=success SQL without removing real config",
            "config file still present after induction",
            "stub/static mode reports overdue without filesystem change",
            "heartbeat-poison-only path used as sole proof"
          ]
        },
        "evidence": {
          "artifact_type": "induction_and_heartbeat_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_config_removed_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "induce config-removed for restic_blob_mirror",
                "verify config path missing or renamed",
                "observe heartbeat last_success_at stale and/or status failed"
              ]
            },
            "end_state": {
              "must_observe": [
                "real config path removed or renamed (exists=false on active path)",
                "job cannot complete success cycle with missing config",
                "heartbeat is_overdue=true OR status=failed OR last_success_at older than overdue threshold after induction window"
              ],
              "must_not_observe": [
                "only pre-removal-snap poison with config still present",
                "last_success_at advanced to now after config removal",
                "false-healthy overall with no overdue/failed flag"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "Honest dual-path or fully real induction; RED suite green against real path",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-CLI",
        "flow_ref": "CAP-BAK-01",
        "negative_control": {
          "would_fail_if": [
            "docstring still claims poison is the induction for all gate proofs without separate production-truth",
            "gate continues to use only SQL poison for kill/credential/config steps",
            "RED suite only asserts DEAD sentinel without real fault path",
            "stub/static implementation hardcodes healthy result with no real service round-trip"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "healthy_wal_archive_ready",
            "action": {
              "actor": "implementer",
              "steps": [
                "grep induce implementation for poison-only vs real induction",
                "run RED suite with PLATFORM_IT=1",
                "capture evidence that production-truth path is exercised or honestly separated"
              ]
            },
            "end_state": {
              "must_observe": [
                "either all three modes real OR dual-path with production-truth gate documented",
                "PLATFORM_IT=1 RED suite exit 0 after GREEN for real induction changes",
                "CLI surface exposes real induction (flags/mode docs accurate)"
              ],
              "must_not_observe": [
                "gate sole reliance on 00000001000000000000DEAD poison",
                "silent rewrite of D04-01 REAL requirement to synthetic without documentation",
                "RED suite green only because mocks replace real induction"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "Typecheck and lint clean",
      "verify": "pnpm tsgo --noEmit; pnpm biome check .",
      "primary": false,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "tooling",
        "negative_control": {
          "would_fail_if": [
            "type errors introduced in alerting.ts or holo.ts",
            "biome violations left unfixed in write_allowed paths"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "healthy_wal_archive_ready",
            "action": {
              "actor": "implementer",
              "steps": [
                "pnpm tsgo --noEmit",
                "pnpm biome check ."
              ]
            },
            "end_state": {
              "must_observe": [
                "tsgo exit 0",
                "biome check exit 0"
              ],
              "must_not_observe": [
                "error TS",
                "biome Found errors"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Real kill induction production-truth",
      "verify": "PLATFORM_IT=1 kill induction + heartbeat",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Credential-expired real auth failure",
      "verify": "induce credential-expired",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Config-removed real filesystem fault",
      "verify": "induce config-removed",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "RED suite after induction rewrite",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "tsgo + biome",
      "verify": "pnpm tsgo --noEmit; pnpm biome check .",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
