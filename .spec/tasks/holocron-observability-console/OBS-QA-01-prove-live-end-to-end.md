# OBS-QA-01 — Prove the hosted system end to end

**Status:** Planned
**Proposed By:** `mastra-planner`
**Primary owner:** independent reviewer plus operator
**Estimate:** 2–3 days
**Depends on:** OBS-01, OBS-02, OBS-03, OBS-04, OBS-05, OBS-MCP-01, OBS-MCP-02

## Objective

Produce fresh, adversarial, exact-release proof that the hosted private console,
instrumentation, event query, degraded/recovery state machine, restart, backup, isolated
restore, and rollback work with real services. QA implements no missing product behavior;
defects return to the owning task.

## Critical constraints

- MUST run only after all predecessor commits, reviews, and immutable release identities
  agree; a mismatch stops before traffic or lifecycle actions.
- MUST use fresh post-`start_ref` real service activity, real browser, real HTTP/stdio
  processes, real local fleet, real R2/restic, and an isolated real restore.
- MUST record BLOCKED for a missing dependency/credential/authorization rather than skip
  a required lane or substitute synthetic evidence.
- NEVER fix production code during QA, mutate secrets, touch unrelated processes, or
  disrupt network/Tailscale settings.

## Preconditions

- All predecessor implementation/review commits are ancestors of the candidate.
- Hosted ReleaseLock v2, Compose hash, migration head, package lock, source SHA, and
  every image digest match the candidate; manifest expectation is 45.
- Target capacity and real R2/restic preflights are green.
- The operator has authorized the exact scoped Langfuse/Collector stop/start, queue
  pressure, whole-release restart, isolated restore, and compatible rollback actions.
- `.env` and the ignored secret store are loaded by name only; receipts contain no
  values. Missing credentials/services yield BLOCKED, not skips.

Never disrupt Wi-Fi, Tailscale, DNS, firewall, host interfaces, simulators, unrelated
processes, or unrelated Compose projects. Invalid-auth proof uses an isolated test
exporter/credential and never rotates production credentials.

## Write-allowed files

```text
scripts/verify-observability-hosted.ts
services/platform/tests/live/observability-hosted-e2e.test.ts
services/platform/tests/e2e/observability-console.spec.ts       # QA assertions only
.tmp/OBS-QA-01/**
```

All production code/config, secrets, release state, task predecessors, Sprint 33
worktrees, and sprint state are read-only except approved lifecycle operations through
existing release commands.

## Hosted scenario order

1. Record `start_ref`: UTC, main/candidate/deployed SHA, package/Compose/migration
   identity, all image/source digests, database tuple fingerprint, service/container/
   volume inventory, and initial health/capacity. Fail on mismatch.
2. Run a fresh real mission via the real local inference fleet plus real chat/tool/
   inference/deploy/health paths. Correlate local Mastra storage, first-party SQL,
   Langfuse v2 observations, metrics, and service-event feed.
3. Call `query_service_events` through full-key HTTP, observability-key HTTP, platform
   stdio, and packaged stdio. Independently compare SQL ordering, filters, cursor,
   freshness, release identity, redaction, and trace deep link.
4. Use a real tailnet browser to authenticate, open the returned deep link, and inspect
   its span/model metadata under `/observability`.
5. Stop only the scoped Langfuse ingestion/Collector component. Generate real traffic;
   prove product success, local persistence, HTTP-200 degraded health, durable failure,
   bounded truthful queue, then restart and prove drain plus v2 observation recovery.
6. Execute deterministic retention boundary/hold proof.
7. Run full exact-release cold restart; repeat health, browser, trace, MCP, and witness
   checks.
8. Run real backup, isolated restore to fresh project/volumes/ports/credentials, and
   compare trace/observation/score/object/event witnesses. Exercise a compatible rollback
   and an incompatible rollback negative.
9. Scan logs, API bodies, database projections, traces, UI captures, process argv,
   artifacts, and touched source/tests for secret sentinels, stubs, skips, placeholders,
   or deferred core behavior. Obtain independent reviewer verdict.

## Acceptance and test criteria

- **AC-1:** Given a post-start real mission/model call, when every store/surface is
  queried, then correlation/release identity matches and the browser opens its trace.
- **AC-2:** Given scoped sink outage and queue pressure, when product traffic continues,
  then requests succeed, health degrades truthfully, queue is bounded, and recovery
  drains to a real Langfuse observation.
- **AC-3:** Given real HTTP/stdio and direct SQL on one snapshot, when the event tool is
  exercised, then scope, mapping, ordering, cursor, redaction, freshness, and deep-link
  parity are exact for the 45-tool contract.
- **AC-4:** Given exact-release restart, backup/restore, and rollback, when witnesses are
  compared, then compatible paths preserve all state and incompatible rollback blocks.
- **TC-1:** Mutate expected trace ID, image digest, route, and release SHA separately;
  every verifier mutation fails.
- **TC-2:** A green health body during outage, unbounded/concealed queue, mission failure,
  or missing recovered observation fails the outage gate.
- **TC-3:** Replace one cursor/order/schema/authorization expectation; cross-transport
  parity fails and denied SQL count remains zero.
- **TC-4:** Corrupt one restore checksum and select an incompatible rollback; neither can
  produce a green recovery receipt or modify production state.

## Verification

```bash
set -a
source .env
set +a
bun scripts/verify-observability-hosted.ts --json
pnpm test:live -- services/platform/tests/live/observability-hosted-e2e.test.ts
pnpm exec playwright test services/platform/tests/e2e/observability-console.spec.ts
bun services/platform/src/deploy/verify-production.ts --json
pnpm typecheck
pnpm test:unit
pnpm test:integration
git diff --check
```

Evidence index `.tmp/OBS-QA-01/evidence-index.json` must hash and describe the start
reference, exact release, mission/correlation, browser/HAR, MCP/SQL parity,
outage/recovery timeline, retention, restart, backup/restore, rollback, capacity,
negative-control, secret/stub scan, and independent reviewer artifacts. Completion
requires every named artifact and zero unresolved blocker.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "OBS-QA-01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "hosted_release": {
      "seed_method": "recorded_external",
      "description": "fresh exact hosted ReleaseLock v2 and post-start real mission trace",
      "records": [
        "expectedReleaseMismatchCount:0",
        "expectedTraceIdentityMismatchCount:0"
      ]
    },
    "recovery_run": {
      "seed_method": "public_api",
      "description": "authorized scoped outage restart backup isolated restore and rollback witnesses",
      "records": [
        "expectedWitnessMismatchCount:0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN an exact hosted release and post-start mission WHEN stores APIs MCP and browser are inspected THEN trace and release correlation match end to end",
      "verify": "PLATFORM_IT=1 pnpm test:live -- services/platform/tests/live/observability-hosted-e2e.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-QA-01/AC-1",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "hosted-tailnet-mastra-postgres-langfuse-browser-local-fleet",
        "negative_control": {
          "would_fail_if": [
            "a pre-existing trace fake model or source SHA inference is accepted",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "hosted_release",
            "action": {
              "steps": [
                "run fresh mission and correlate SQL API MCP and browser"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedReleaseMismatchCount:0",
                "expectedTraceIdentityMismatchCount:0",
                "browserTracePageCount:1"
              ],
              "must_not_observe": [
                "preStartTraceAccepted:true",
                "empty image digest",
                "empty required evidence"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN authorized scoped sink outage WHEN real traffic continues and service recovers THEN product remains available health degrades queue is bounded and observations drain",
      "verify": "PLATFORM_IT=1 pnpm test:live -- services/platform/tests/live/observability-hosted-e2e.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-QA-01/AC-2",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "hosted-langfuse-collector-mastra-health",
        "negative_control": {
          "would_fail_if": [
            "network is disrupted or queue health is fabricated",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "recovery_run",
            "action": {
              "steps": [
                "stop only scoped sink generate traffic restart and verify drain"
              ]
            },
            "end_state": {
              "must_observe": [
                "missionSuccessCount >= 1",
                "degradedHttpStatus:200",
                "queueWithinCapacity:true",
                "recoveredObservationCount >= 1"
              ],
              "must_not_observe": [
                "networkSettingChangeCount > 0",
                "outageHealthStatus:ok",
                "empty required evidence"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN one real event snapshot WHEN HTTP both stdio and SQL are compared THEN 45-tool scope mapping pagination redaction freshness and deep links are exact",
      "verify": "PLATFORM_IT=1 pnpm test:live -- services/platform/tests/live/observability-hosted-e2e.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-QA-01/AC-3",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "hosted-http-platform-stdio-packaged-stdio-postgres",
        "negative_control": {
          "would_fail_if": [
            "transport envelopes hide a data mismatch or denial queries SQL",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "hosted_release",
            "action": {
              "steps": [
                "query all transports and independent SQL including scope negatives"
              ]
            },
            "end_state": {
              "must_observe": [
                "manifestToolCount:45",
                "parityMismatchCount:0",
                "deniedSqlQueryCount:0"
              ],
              "must_not_observe": [
                "sentinelMatchCount > 0",
                "brokenDeepLinkCount > 0",
                "empty required evidence"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN exact release state WHEN cold restart backup isolated restore and rollback run THEN compatible witnesses match and incompatible rollback blocks before mutation",
      "verify": "PLATFORM_IT=1 pnpm test:live -- services/platform/tests/live/observability-hosted-e2e.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-QA-01/AC-4",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "hosted-compose-restic-r2-isolated-restore",
        "negative_control": {
          "would_fail_if": [
            "archive creation substitutes for restore or production volumes are reused",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "recovery_run",
            "action": {
              "steps": [
                "restart backup restore to fresh project and test rollback matrix"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedWitnessMismatchCount:0",
                "restoreProjectDistinct:true",
                "incompatibleRollbackExitCode != 0"
              ],
              "must_not_observe": [
                "productionVolumeMutationCount > 0",
                "green corrupt restore",
                "empty required evidence"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Trace image route and release identity mutants each fail hosted correlation.",
      "verify": "bun scripts/verify-observability-hosted.ts --negative identity-matrix --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Outage must be fail-open degraded bounded and recover to a real observation.",
      "verify": "PLATFORM_IT=1 pnpm test:live -- services/platform/tests/live/observability-hosted-e2e.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Transport and SQL parity mutations fail while denied SQL remains zero.",
      "verify": "PLATFORM_IT=1 pnpm test:live -- services/platform/tests/live/observability-hosted-e2e.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Corrupt restore and incompatible rollback fail without production state mutation.",
      "verify": "PLATFORM_IT=1 pnpm test:live -- services/platform/tests/live/observability-hosted-e2e.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
