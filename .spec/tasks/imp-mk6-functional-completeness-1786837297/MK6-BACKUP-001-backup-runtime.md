# MK6-BACKUP-001: Restore installed backup, heartbeat, and alert runtime

> Status: Backlog
> Assignee: devops-engineer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: infrastructure
> Wave: 3
> Proposed by: mastra-planner
> Files: services/platform/src/backup/alerting.ts, services/platform/src/backup/base-backup.ts, services/platform/src/backup/config.ts, services/platform/src/backup/heartbeat.ts, services/platform/src/backup/index.ts, services/platform/src/backup/r2-provision.ts, services/platform/src/backup/restic-mirror.ts, services/platform/src/backup/restore.ts, services/platform/src/backup/wal-archive.ts, services/platform/src/backup/trusted-bin.ts, services/platform/src/backup/span.ts, services/platform/src/backup/parity-check.ts, services/platform/src/backup/recovery-baseline.ts, services/platform/src/backup/harness-isolation.ts, services/platform/deploy/launchd/holocron-base-backup.plist, services/platform/deploy/launchd/holocron-wal-archive.plist, services/platform/deploy/launchd/holocron-restic-blob-mirror.plist, services/platform/deploy/launchd/holocron-backup-alert-sweep.plist, services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts, services/platform/tests/integration/sprint27-backup-alerting-red.test.ts, services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts, services/platform/tests/integration/sprint27-backup-heartbeat-migrate.test.ts, services/platform/tests/integration/sprint27-backup-span-export.test.ts, services/platform/tests/integration/sprint31-ops-01-backup-restore.test.ts, services/platform/tests/integration/mk6-backup-launchctl-live.test.ts, scripts/verify-mk6-backup-runtime.sh
> Depends on: MK6-HOST-001, MK6-PROVENANCE-001

## Outcome

Real launchctl-loaded stable-path units advance base/WAL/blob backup state, fresh heartbeats, and truthful failure/recovery alerts under the exact installed CLI identity.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-backup-runtime.sh --write-burst --max-log-bytes 10485760 --max-retained-logs 5 --json` proves advancing real R2 objects under a Postgres write burst, fresh base/WAL/restic/cleanup heartbeats, logs bounded to 10 MiB with no more than five retained rotations, and exactly one failure plus one recovery/all-clear delivered to the configured intended alert receiver identity.
- [ ] AC-2: `PLATFORM_IT=1 bash scripts/verify-mk6-backup-runtime.sh --launchctl-installed --json` — `MANUAL-ONLY BACKUP-M2`: real `launchctl bootstrap/print` proves all four installed units loaded, point only to stable existing versioned paths, resolve the canonical installed `holo build-info`, and contain no worktree path or secret value.
- [ ] AC-3: `PLATFORM_IT=1 MK6_BACKUP_NEGATIVE=evidence-log-matrix bash scripts/verify-mk6-backup-runtime.sh --json` enumerates and rejects exactly four named variants—worktree path, injected heartbeat, historical object count, and unbounded/unrotated log—before installation/readiness.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Real objects, four heartbeats, bounded rotated logs, and one alert/all-clear pair to the intended receiver advance. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-backup-runtime.sh --write-burst --max-log-bytes 10485760 --max-retained-logs 5 --json` |
| TC-2 | Four real launchctl units use stable existing paths and one installed CLI identity. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-mk6-backup-runtime.sh --launchctl-installed --json` |
| TC-3 | A worktree-coupled plist is rejected before bootstrap. | AC-3 | `PLATFORM_IT=1 MK6_BACKUP_NEGATIVE=worktree-path bash scripts/verify-mk6-backup-runtime.sh --json` |
| TC-4 | Injected heartbeat evidence is rejected. | AC-3 | `PLATFORM_IT=1 MK6_BACKUP_NEGATIVE=injected-heartbeat bash scripts/verify-mk6-backup-runtime.sh --json` |
| TC-5 | Historical object counts are rejected. | AC-3 | `PLATFORM_IT=1 MK6_BACKUP_NEGATIVE=historical-object bash scripts/verify-mk6-backup-runtime.sh --json` |
| TC-6 | An unbounded or unrotated log is rejected. | AC-3 | `PLATFORM_IT=1 MK6_BACKUP_NEGATIVE=unbounded-log bash scripts/verify-mk6-backup-runtime.sh --json` |

`MANUAL-ONLY BACKUP-M1`: distinct real R2 restore credentials and access. Presence of plist/shell, `--check`, historical counts, or injected heartbeat rows cannot pass.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "MK6-BACKUP-001",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "backup_burst": {
      "seed_method": "cli",
      "description": "real Postgres write burst and independent alert receiver",
      "records": [
        "burstRows: 25"
      ]
    },
    "installed_units": {
      "seed_method": "cli",
      "description": "real user launchctl domain and canonical installed CLI",
      "records": [
        "expectedUnitCount: 4"
      ]
    },
    "backup_controls": {
      "seed_method": "cli",
      "description": "disposable worktree plist and injected heartbeat receipt",
      "records": [
        "controlCaseCount: 2"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a real write burst WHEN installed backup units run THEN objects, four heartbeats, alert and all-clear advance",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-backup-runtime.sh --write-burst --max-log-bytes 10485760 --max-retained-logs 5 --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "backup-runtime",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres-r2-alert-receiver",
        "negative_control": {
          "would_fail_if": [
            "heartbeat rows are hardcoded or R2 write is disconnected"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "backup_burst",
            "action": {
              "steps": [
                "write 25 rows, run real base, WAL and restic units with one scoped failure, rotate logs at 10 MiB with at most five retained, and target the configured alert receiver identity"
              ]
            },
            "end_state": {
              "must_observe": [
                "burstRows: 25",
                "freshHeartbeatCount: 4",
                "failureAlerts: 1",
                "recoveryAlerts: 1",
                "maxObservedLogBytes <= 10485760",
                "retainedLogFileCount <= 5",
                "logRotationObservedCount >= 1",
                "intendedAlertReceiverMatchCount: 2"
              ],
              "must_not_observe": [
                "failureAlerts: 0",
                "empty R2 object delta"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN installed units WHEN launchctl prints them THEN four stable paths bind one installed CLI identity",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-backup-runtime.sh --launchctl-installed --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "backup-launchctl",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "macos-launchctl-installed-cli",
        "negative_control": {
          "would_fail_if": [
            "a unit is absent or path points to a removed worktree"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "installed_units",
            "action": {
              "steps": [
                "bootstrap and print four real units and query installed build-info"
              ]
            },
            "end_state": {
              "must_observe": [
                "loadedStableUnitCount: 4",
                "installedCliIdentityCount: 1"
              ],
              "must_not_observe": [
                "loadedStableUnitCount: 0",
                "empty ProgramArguments"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN the four-case evidence and log matrix WHEN preflight runs THEN every named fakeability variant fails",
      "verify": "PLATFORM_IT=1 MK6_BACKUP_NEGATIVE=evidence-log-matrix bash scripts/verify-mk6-backup-runtime.sh --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "backup-controls",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "backup-preflight",
        "negative_control": {
          "would_fail_if": [
            "the stable-path guard is removed or an injected heartbeat is accepted"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "backup_controls",
            "action": {
              "steps": [
                "enumerate and run worktree-path, injected-heartbeat, historical-object, and unbounded-log disposable cases"
              ]
            },
            "end_state": {
              "must_observe": [
                "enumeratedVariantCount: 4",
                "namedControlFailureCount: 4"
              ],
              "must_not_observe": [
                "namedControlFailureCount: 0",
                "empty failure class"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Backup runtime advances",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-backup-runtime.sh --write-burst --max-log-bytes 10485760 --max-retained-logs 5 --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Launchctl units bind stable CLI",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-backup-runtime.sh --launchctl-installed --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Worktree path fails",
      "verify": "PLATFORM_IT=1 MK6_BACKUP_NEGATIVE=worktree-path bash scripts/verify-mk6-backup-runtime.sh --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Injected heartbeat fails",
      "verify": "PLATFORM_IT=1 MK6_BACKUP_NEGATIVE=injected-heartbeat bash scripts/verify-mk6-backup-runtime.sh --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Historical object counts fail",
      "verify": "PLATFORM_IT=1 MK6_BACKUP_NEGATIVE=historical-object bash scripts/verify-mk6-backup-runtime.sh --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Unbounded logs fail",
      "verify": "PLATFORM_IT=1 MK6_BACKUP_NEGATIVE=unbounded-log bash scripts/verify-mk6-backup-runtime.sh --json",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
