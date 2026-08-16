# MK6-SOAK-001: Run 24-hour and 72-hour operational and semantic soak

> Status: Backlog
> Assignee: observability-engineer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: manual verification
> Wave: 18
> Proposed by: mastra-planner
> Files: scripts/verify-mk6-soak.sh, services/platform/tests/integration/mk6-soak-report.test.ts, .gate-evidence/mk6-soak
> Depends on: MK6-PROMOTION-001

## Outcome

The exact installed release survives fresh 24-hour and 72-hour checkpoints with bounded operational metrics, non-empty semantic canaries, and one scoped failure/recovery alert path.

## Acceptance Criteria

- [ ] AC-1: `MANUAL-ONLY SOAK-M1`: `bash scripts/verify-mk6-soak.sh --hours 24 --release "$MK6_PROMOTED_RELEASE" --json` retains availability, p95 health/mission/MCP/client latency, errors, PgBoss/PG connections, queue depth/lease/failures/restarts, fleet latency/errors/spend, Zero lag/reconnect errors, backup/R2/restore ages, disk/log growth, and identity drift.
- [ ] AC-2: `bash scripts/verify-mk6-soak.sh --hours 72 --release "$MK6_PROMOTED_RELEASE" --json` — `MANUAL-ONLY SOAK-M2`: the same command at `--hours 72` proves zero monotonic connection/log leak, zero identity drift, mandatory SLO thresholds, and non-empty mission/MCP/client sentinel canaries bound to the same release.
- [ ] AC-3: `PLATFORM_IT=1 bash scripts/verify-mk6-soak.sh --scoped-failure-recovery --release "$MK6_PROMOTED_RELEASE" --json` — A task-owned scoped canary failure emits one real alert and one recovery/all-clear without altering network configuration or shared services; missing metric, canary, interval, or recovery receipt fails the report.
- [ ] AC-4: `PLATFORM_IT=1 MK6_SOAK_NEGATIVE=soak-evidence-matrix bash scripts/verify-mk6-soak.sh --release "$MK6_PROMOTED_RELEASE" --json` enumerates missing metric, missing semantic canary, missing interval, and missing recovery receipt; all four fail named.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Fresh 24-hour report covers every named metric and candidate identity. | AC-1 | `bash scripts/verify-mk6-soak.sh --hours 24 --release "$MK6_PROMOTED_RELEASE" --json` |
| TC-2 | Fresh 72-hour report meets thresholds with three non-empty semantic canaries. | AC-2 | `bash scripts/verify-mk6-soak.sh --hours 72 --release "$MK6_PROMOTED_RELEASE" --json` |
| TC-3 | Scoped canary failure and recovery produce exactly one alert each. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-soak.sh --scoped-failure-recovery --release "$MK6_PROMOTED_RELEASE" --json` |
| TC-4 | The four missing-evidence soak variants each fail named. | AC-4 | `PLATFORM_IT=1 MK6_SOAK_NEGATIVE=soak-evidence-matrix bash scripts/verify-mk6-soak.sh --release "$MK6_PROMOTED_RELEASE" --json` |

Minimum thresholds: external availability `>= 99.9%`; p95 health `<= 1000 ms`; mission terminal p95 `<= 120000 ms`; MCP sentinel p95 `<= 5000 ms`; Zero replication p95 `<= 5000 ms`; identity drift `0`; monotonic connection/log leak `0`; failed semantic canaries `0`. Actual elapsed time and installed-host observability access are manual blockers.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "MK6-SOAK-001",
  "tdd_mode": "shared",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "soak24": {
      "seed_method": "recorded_external",
      "description": "24 hours of exact-release operational telemetry",
      "records": [
        "elapsedHours: 24"
      ]
    },
    "soak72": {
      "seed_method": "recorded_external",
      "description": "72 hours of exact-release telemetry and semantic canaries",
      "records": [
        "elapsedHours: 72",
        "semanticCanaryCount: 3"
      ]
    },
    "scoped_failure": {
      "seed_method": "cli",
      "description": "task-owned semantic canary dependency and independent alert receiver",
      "records": [
        "expectedFailureAlerts: 1",
        "expectedRecoveryAlerts: 1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the exact installed release WHEN 24 hours elapse THEN every named metric is fresh and identity-bound",
      "verify": "bash scripts/verify-mk6-soak.sh --hours 24 --release \"$MK6_PROMOTED_RELEASE\" --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "soak-24",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "observability-installed-release",
        "negative_control": {
          "would_fail_if": [
            "one required metric is removed or identity is hardcoded"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "soak24",
            "action": {
              "steps": [
                "collect and verify every named metric for 24 elapsed hours"
              ]
            },
            "end_state": {
              "must_observe": [
                "elapsedHours: 24",
                "missingMetricCount: 0",
                "identityDriftCount: 0"
              ],
              "must_not_observe": [
                "elapsedHours: 0",
                "empty release identity"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN the same release WHEN 72 hours elapse THEN SLOs pass and three non-empty canaries remain green",
      "verify": "bash scripts/verify-mk6-soak.sh --hours 72 --release \"$MK6_PROMOTED_RELEASE\" --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "soak-72",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "observability-semantic-canaries",
        "negative_control": {
          "would_fail_if": [
            "semantic canaries are empty or connection leak is ignored"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "soak72",
            "action": {
              "steps": [
                "verify 72 elapsed hours and mission, MCP and client canaries"
              ]
            },
            "end_state": {
              "must_observe": [
                "elapsedHours: 72",
                "semanticCanaryPassCount: 3",
                "monotonicLeakCount: 0"
              ],
              "must_not_observe": [
                "semanticCanaryPassCount: 0",
                "empty canary sentinel"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN a task-owned scoped canary dependency WHEN it fails and recovers THEN one alert and one all-clear are captured",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-soak.sh --scoped-failure-recovery --release \"$MK6_PROMOTED_RELEASE\" --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "soak-failure-recovery",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "canary-alert-receiver",
        "negative_control": {
          "would_fail_if": [
            "alert delivery is disconnected or recovery is removed"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "scoped_failure",
            "action": {
              "steps": [
                "stop only task-owned canary dependency, capture alert, restore it, capture all-clear"
              ]
            },
            "end_state": {
              "must_observe": [
                "failureAlertCount: 1",
                "recoveryAlertCount: 1"
              ],
              "must_not_observe": [
                "failureAlertCount: 0",
                "empty recovery receipt"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "Missing metric, semantic canary, interval, and recovery receipt each fail named",
      "verify": "PLATFORM_IT=1 MK6_SOAK_NEGATIVE=soak-evidence-matrix bash scripts/verify-mk6-soak.sh --release \"$MK6_PROMOTED_RELEASE\" --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "soak-evidence-matrix",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "soak-report-verifier",
        "negative_control": {
          "would_fail_if": [
            "a required soak metric, canary, interval, or recovery receipt is omitted but accepted"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "soak24",
            "action": {
              "steps": [
                "enumerate missing metric, canary, interval, and recovery receipt variants"
              ]
            },
            "end_state": {
              "must_observe": [
                "enumeratedVariantCount: 4",
                "namedFailureCount: 4"
              ],
              "must_not_observe": [
                "namedFailureCount: 0",
                "soakPassCount > 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "24-hour metrics are complete",
      "verify": "bash scripts/verify-mk6-soak.sh --hours 24 --release \"$MK6_PROMOTED_RELEASE\" --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "72-hour SLO and canaries pass",
      "verify": "bash scripts/verify-mk6-soak.sh --hours 72 --release \"$MK6_PROMOTED_RELEASE\" --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Scoped failure and recovery alert once",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-soak.sh --scoped-failure-recovery --release \"$MK6_PROMOTED_RELEASE\" --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Four incomplete soak variants fail named",
      "verify": "PLATFORM_IT=1 MK6_SOAK_NEGATIVE=soak-evidence-matrix bash scripts/verify-mk6-soak.sh --release \"$MK6_PROMOTED_RELEASE\" --json",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
