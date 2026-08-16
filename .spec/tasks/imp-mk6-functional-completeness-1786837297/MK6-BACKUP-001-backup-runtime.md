# MK6-BACKUP-001: Restore backup, alert, and heartbeat runtime

> Status: Backlog
> Assignee: devops-engineer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: infrastructure
> Wave: 1
> Proposed by: mastra-planner
> Files: services/platform/src/backup/alerting.ts, services/platform/src/backup/base-backup.ts, services/platform/src/backup/config.ts, services/platform/src/backup/heartbeat.ts, services/platform/src/backup/index.ts, services/platform/src/backup/r2-provision.ts, services/platform/src/backup/restic-mirror.ts, services/platform/src/backup/restore.ts, services/platform/src/backup/wal-archive.ts, services/platform/src/backup/trusted-bin.ts, services/platform/src/backup/span.ts, services/platform/src/backup/parity-check.ts, services/platform/src/backup/recovery-baseline.ts, services/platform/src/backup/harness-isolation.ts, services/platform/deploy/launchd/holocron-base-backup.plist, services/platform/deploy/launchd/holocron-wal-archive.plist, services/platform/deploy/launchd/holocron-restic-blob-mirror.plist, services/platform/deploy/launchd/holocron-backup-alert-sweep.plist, services/platform/tests/integration/sprint27-backup-*.test.ts, services/platform/tests/integration/sprint31-ops-01-backup-restore.test.ts, scripts/verify-mk6-backup-runtime.sh
> Depends on: MK6-DEP-001

## Outcome

Stable-path installed units advance real base/WAL/blob backup state, persist fresh heartbeats, and emit truthful failure and recovery alerts.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-backup-runtime.sh --write-burst --json` proves advancing real R2 objects under a Postgres write burst, fresh base/WAL/restic/cleanup heartbeats, and one independently captured failure alert plus one recovery/all-clear.
- [ ] AC-2: A scoped backup failure or worktree-coupled service path exits non-zero; injected heartbeat rows, `--check`, plist presence, and historical object counts cannot pass.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Real base/WAL/blob objects and all heartbeat ages advance during a write burst. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-backup-runtime.sh --write-burst --json` |
| TC-2 | A worktree-coupled launch path is rejected before installation. | AC-2 | `PLATFORM_IT=1 MK6_BACKUP_NEGATIVE=worktree-path bash scripts/verify-mk6-backup-runtime.sh --json` |

`MANUAL-ONLY BACKUP-M1`: distinct restore credentials and actual R2 access are operator prerequisites; missing access blocks this task and is not replaceable by local files.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-BACKUP-001","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"backup_burst":{"seed_method":"cli","description":"real Postgres write burst and independent alert receiver","records":["burstRows: 25"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN a real Postgres write burst WHEN installed backup units run THEN R2 objects, four heartbeats, failure alert and all-clear advance","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-backup-runtime.sh --write-burst --json","maps_to_ac":null,"scenario":{"test_tier":"integration","tier":"visible","verification_service":"postgres-r2-alert-receiver","negative_control":{"would_fail_if":["heartbeat rows are hardcoded or the R2 write is disconnected"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"backup_burst","action":{"steps":["write 25 rows and run real base, WAL and restic units with one scoped induced failure"]},"end_state":{"must_observe":["burstRows: 25","failureAlerts: 1","recoveryAlerts: 1"],"must_not_observe":["failureAlerts: 0","empty R2 object delta"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Worktree paths and fake freshness evidence fail closed","verify":"PLATFORM_IT=1 MK6_BACKUP_NEGATIVE=worktree-path bash scripts/verify-mk6-backup-runtime.sh --json","maps_to_ac":null},{"id":"TC-1","type":"test_criterion","description":"Real backup objects and alert transitions advance","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-backup-runtime.sh --write-burst --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"A worktree-coupled unit path is rejected","verify":"PLATFORM_IT=1 MK6_BACKUP_NEGATIVE=worktree-path bash scripts/verify-mk6-backup-runtime.sh --json","maps_to_ac":"AC-2"}]}
-->
