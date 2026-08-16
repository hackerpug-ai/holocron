# MK6-FLEET-001: Route Mastra and scheduler to one explicit tailnet fleet

> Status: Backlog
> Assignee: mastra-implementer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: bugfix
> Wave: 2
> Proposed by: mastra-planner
> Files: services/platform/src/fleet/manifest.ts, services/platform/src/fleet/manifest.schema.ts, services/platform/src/fleet/runtime-config.ts, services/platform/src/fleet/preflight.ts, services/platform/src/stack/config.ts, services/platform/tests/integration/mk6-fleet-routing-live.test.ts, scripts/verify-mk6-fleet-routing.sh, .gate-evidence/mk6-fleet
> Depends on: MK6-HOST-001

## Outcome

Mastra and scheduler receive the same explicit private tailnet fleet endpoint and secret-name reference, and both candidate containers prove model discovery plus real completion before deploy.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-fleet-routing.sh --candidate-containers --json` proves identical endpoint host hash in Mastra and scheduler, authenticated expected aliases from `/v1/models`, and one non-destructive real completion from each container.
- [ ] AC-2: `PLATFORM_IT=1 MK6_FLEET_NEGATIVE=route-matrix bash scripts/verify-mk6-fleet-routing.sh --preflight --json` enumerates and rejects loopback, `host.docker.internal`, wrong host, missing key name, and unreachable target before compose apply, emitting only a host hash/reason.
- [ ] AC-3: `PLATFORM_IT=1 bash scripts/verify-mk6-fleet-routing.sh --external-health-count 3 --json` — Three external `:44111/health` responses bind `fleet.ready=true` and the same fleet identity after injection.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Both candidate containers list expected aliases and complete once. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-fleet-routing.sh --candidate-containers --json` |
| TC-2 | Wrong host fails before compose apply. | AC-2 | `PLATFORM_IT=1 MK6_FLEET_NEGATIVE=wrong-host bash scripts/verify-mk6-fleet-routing.sh --preflight --json` |
| TC-3 | Missing key name fails before compose apply. | AC-2 | `PLATFORM_IT=1 MK6_FLEET_NEGATIVE=missing-key bash scripts/verify-mk6-fleet-routing.sh --preflight --json` |
| TC-4 | Unreachable target fails before compose apply. | AC-2 | `PLATFORM_IT=1 MK6_FLEET_NEGATIVE=unreachable bash scripts/verify-mk6-fleet-routing.sh --preflight --json` |
| TC-5 | Three external health calls report the injected fleet ready. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-fleet-routing.sh --external-health-count 3 --json` |
| TC-6 | Loopback fleet endpoint fails before compose apply. | AC-2 | `PLATFORM_IT=1 MK6_FLEET_NEGATIVE=loopback bash scripts/verify-mk6-fleet-routing.sh --preflight --json` |
| TC-7 | `host.docker.internal` fleet endpoint fails before compose apply. | AC-2 | `PLATFORM_IT=1 MK6_FLEET_NEGATIVE=host-docker-internal bash scripts/verify-mk6-fleet-routing.sh --preflight --json` |

Credential values never appear in files or receipts; only the existing credential name is injected. No production fault hook or network disruption is permitted.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "MK6-FLEET-001",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "candidate_containers": {
      "seed_method": "cli",
      "description": "real Mastra and scheduler candidate containers",
      "records": [
        "consumerCount: 2"
      ]
    },
    "fleet_preflight": {
      "seed_method": "cli",
      "description": "candidate config before compose apply",
      "records": [
        "expectedRejectedModes: 3"
      ]
    },
    "external_health": {
      "seed_method": "public_api",
      "description": "already-listening private service with injected fleet",
      "records": [
        "healthRequestCount: 3"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN two candidate containers WHEN fleet probes run THEN both list aliases and complete against one tailnet endpoint",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-fleet-routing.sh --candidate-containers --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "fleet-containers",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "litellm-mastra-scheduler",
        "negative_control": {
          "would_fail_if": [
            "either container is disconnected or completions are stubbed"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "candidate_containers",
            "action": {
              "steps": [
                "query models and complete once from Mastra and scheduler containers"
              ]
            },
            "end_state": {
              "must_observe": [
                "modelListPassCount: 2",
                "completionPassCount: 2"
              ],
              "must_not_observe": [
                "completionPassCount: 0",
                "empty endpoint identity"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN invalid production routes WHEN preflight runs THEN each is rejected before compose apply",
      "verify": "PLATFORM_IT=1 MK6_FLEET_NEGATIVE=route-matrix bash scripts/verify-mk6-fleet-routing.sh --preflight --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "fleet-preflight-negatives",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "fleet-deploy-preflight",
        "negative_control": {
          "would_fail_if": [
            "the preflight is removed and wrong host, missing key or unreachable target is accepted"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fleet_preflight",
            "action": {
              "steps": [
                "run loopback, host.docker.internal, wrong-host, missing-key and unreachable preflights"
              ]
            },
            "end_state": {
              "must_observe": [
                "rejectedModeCount: 5",
                "enumeratedModeCount: 5"
              ],
              "must_not_observe": [
                "rejectedModeCount: 0",
                "empty failure class"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN the injected fleet WHEN external health is called three times THEN all bind the same ready fleet identity",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-fleet-routing.sh --external-health-count 3 --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "fleet-health",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "external-health",
        "negative_control": {
          "would_fail_if": [
            "fleet.ready is hardcoded or identity changes"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "external_health",
            "action": {
              "steps": [
                "call private external health three times"
              ]
            },
            "end_state": {
              "must_observe": [
                "fleetReadyCount: 3",
                "fleetIdentityCount: 1"
              ],
              "must_not_observe": [
                "fleetReadyCount: 0",
                "empty fleet identity"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Two containers list and complete",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-fleet-routing.sh --candidate-containers --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Wrong host is rejected",
      "verify": "PLATFORM_IT=1 MK6_FLEET_NEGATIVE=wrong-host bash scripts/verify-mk6-fleet-routing.sh --preflight --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Missing key is rejected",
      "verify": "PLATFORM_IT=1 MK6_FLEET_NEGATIVE=missing-key bash scripts/verify-mk6-fleet-routing.sh --preflight --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Unreachable fleet is rejected",
      "verify": "PLATFORM_IT=1 MK6_FLEET_NEGATIVE=unreachable bash scripts/verify-mk6-fleet-routing.sh --preflight --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Three health calls bind one ready fleet",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-fleet-routing.sh --external-health-count 3 --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Loopback route fails",
      "verify": "PLATFORM_IT=1 MK6_FLEET_NEGATIVE=loopback bash scripts/verify-mk6-fleet-routing.sh --preflight --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Host docker internal route fails",
      "verify": "PLATFORM_IT=1 MK6_FLEET_NEGATIVE=host-docker-internal bash scripts/verify-mk6-fleet-routing.sh --preflight --json",
      "maps_to_ac": "AC-2"
    }
  ]
}
-->
