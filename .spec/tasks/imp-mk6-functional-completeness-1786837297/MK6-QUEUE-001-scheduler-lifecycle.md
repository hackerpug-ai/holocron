# MK6-QUEUE-001: Repair scheduler ownership and persistence

> Status: Backlog
> Assignee: mastra-implementer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: bugfix
> Wave: 2
> Proposed by: mastra-planner
> Files: services/platform/src/queue/backend.ts, services/platform/src/queue/scheduler-worker.ts, services/platform/src/queue/probe-cli.ts, services/platform/tests/integration/queue-backend-idempotency.test.ts, services/platform/tests/integration/queue-heartbeat-persistence-live.test.ts, scripts/verify-mk6-queue-lifecycle.sh
> Depends on: MK6-DATA-001

## Outcome

One durable PgBoss owner survives concurrent starts and restarts without connection growth, while queued work completes exactly once.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --duration-seconds 120 --connection-ceiling 8 --json` observes at least three 30-second heartbeats, one owner, no more than eight `pg_stat_activity` sessions with `application_name='holocron-pg-boss'` at every interval, zero monotonically growing intervals, one terminal side effect, zero owned sessions after SIGTERM, and exactly-once completion after restart.
- [ ] AC-2: `PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --negative-control queue-recreation --json` — `--negative-control queue-recreation` proves the real baseline, applies the lifecycle mutant only in a disposable copy, and fails with `QUEUE_RECREATION_DETECTED`; no production fault hook is used.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | A real queued job survives restart, stays at or below eight PgBoss sessions without monotonic growth, and its terminal side effect occurs exactly once. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --duration-seconds 120 --connection-ceiling 8 --json` |
| TC-2 | The queue-recreation mutant is killed. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --negative-control queue-recreation --json` |

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "MK6-QUEUE-001",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "queued_job": {
      "seed_method": "public_api",
      "description": "real PgBoss job with durable effect",
      "records": [
        "jobId: mk6-queue-job-1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN one real queued job WHEN scheduler runs, stops and restarts THEN one owner completes one durable effect exactly once",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --duration-seconds 120 --connection-ceiling 8 --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "queue-lifecycle",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres-pgboss",
        "negative_control": {
          "would_fail_if": [
            "the queue backend is recreated on every heartbeat or persistence is removed"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "queued_job",
            "action": {
              "steps": [
                "run scheduler for 120 seconds, sample holocron-pg-boss sessions each heartbeat against a fixed ceiling of 8, SIGTERM it, and restart it"
              ]
            },
            "end_state": {
              "must_observe": [
                "heartbeatCount >= 3",
                "maxPgBossConnectionCount <= 8",
                "monotonicGrowthIntervalCount: 0",
                "durableEffectCount: 1"
              ],
              "must_not_observe": [
                "durableEffectCount: 0",
                "empty owner identity"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "Real baseline passes and disposable queue-recreation mutant fails named",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --negative-control queue-recreation --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "queue-mutant",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "postgres-pgboss-disposable-mutant",
        "negative_control": {
          "would_fail_if": [
            "the queue recreation mutant is not detected or baseline is stubbed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "queued_job",
            "action": {
              "steps": [
                "prove real baseline then apply recreation mutant only to disposable copy"
              ]
            },
            "end_state": {
              "must_observe": [
                "baselinePassCount: 1",
                "mutantFailureClass: QUEUE_RECREATION_DETECTED"
              ],
              "must_not_observe": [
                "baselinePassCount: 0",
                "empty mutant failure class"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The durable job completes once after restart",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --duration-seconds 120 --connection-ceiling 8 --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The queue-recreation mutant fails",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-queue-lifecycle.sh --negative-control queue-recreation --json",
      "maps_to_ac": "AC-2"
    }
  ]
}
-->
