# MK6-HOST-001: Establish authoritative host topology and private reachability

> Status: 🟡 In Progress
> Cycle: 1
> Updated: 2026-08-16T19:50:14Z
> Assignee: devops-engineer
> Priority: P0
> Type: infrastructure
> Wave: 1
> Proposed by: mastra-planner
> Files: services/platform/src/ops/host-diagnostics.ts, services/platform/src/ops/host-topology.ts, scripts/verify-mk6-host-topology.sh, services/platform/tests/integration/mk6-host-topology-live.test.ts, .gate-evidence/mk6-host
> Depends on: MK6-DEP-001

## Outcome

Read-only diagnostics establish one authoritative writer, stable-key SSH, two-device private Serve reachability, no Funnel, and a redacted incident timeline without disrupting any network.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash scripts/verify-mk6-host-topology.sh --read-only --json` connects through the stable SSH alias, captures uptime/power/disk/memory/Docker/four service states/bounded logs/restart reason and exact SHA-image-generation-host identity, and proves exactly one writer.
- [ ] AC-2: `PLATFORM_IT=1 bash scripts/verify-mk6-host-topology.sh --two-device-private-serve --json` — `MANUAL-ONLY HOST-M1`: two named authorized real tailnet devices independently reach the private Serve health endpoint and retain device-hashed receipts; `tailscale funnel status --json` proves no Funnel listener. A second writer, one-device capture, Funnel, password/secret output, or network mutation fails closed.
- [ ] AC-3: `PLATFORM_IT=1 bash scripts/verify-mk6-host-topology.sh --verify-incident-timeline --json` — The retained incident timeline names timestamps and evidence for healthy, 503, offline, and recovered transitions without self-attested status.
- [ ] AC-4: `PLATFORM_IT=1 MK6_HOST_NEGATIVE=reachability-output-matrix bash scripts/verify-mk6-host-topology.sh --read-only --json` enumerates and rejects a one-device receipt, any Funnel listener, and a credential canary in captured output; every case is read-only and performs zero network mutations.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Stable-alias SSH returns one non-empty host/release identity and one writer. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-host-topology.sh --read-only --json` |
| TC-2 | Two authorized devices reach private Serve and Funnel count is zero. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-mk6-host-topology.sh --two-device-private-serve --json` |
| TC-3 | A planted second writer is rejected. | AC-2 | `PLATFORM_IT=1 MK6_HOST_NEGATIVE=second-writer bash scripts/verify-mk6-host-topology.sh --read-only --json` |
| TC-4 | The timeline contains four timestamped transitions backed by captured diagnostics. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-mk6-host-topology.sh --verify-incident-timeline --json` |
| TC-5 | One-device, Funnel, and credential-canary variants each fail named without changing the network. | AC-4 | `PLATFORM_IT=1 MK6_HOST_NEGATIVE=reachability-output-matrix bash scripts/verify-mk6-host-topology.sh --read-only --json` |

Never disconnect Wi-Fi/Tailscale, toggle interfaces, alter Serve/Funnel, sleep/wake the host, restart services, or change network settings for this task. Missing host or second-device authority is a manual blocker.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "MK6-HOST-001",
  "tdd_mode": "shared",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "authoritative_host": {
      "seed_method": "cli",
      "description": "stable SSH alias to the real authoritative host",
      "records": [
        "expectedWriterCount: 1"
      ]
    },
    "two_devices": {
      "seed_method": "recorded_external",
      "description": "two named authorized real tailnet devices",
      "records": [
        "authorizedDeviceCount: 2"
      ]
    },
    "incident_window": {
      "seed_method": "recorded_external",
      "description": "bounded real host and service logs",
      "records": [
        "expectedTransitionCount: 4"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the stable SSH alias WHEN read-only diagnostics run THEN one authoritative writer and one non-empty release identity are captured",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-host-topology.sh --read-only --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "host-readonly",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "ssh-host-diagnostics",
        "negative_control": {
          "would_fail_if": [
            "the host identity is hardcoded or a second writer is present"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "authoritative_host",
            "action": {
              "steps": [
                "run read-only diagnostics through the stable SSH alias"
              ]
            },
            "end_state": {
              "must_observe": [
                "writerCount: 1",
                "serviceStateCount: 4"
              ],
              "must_not_observe": [
                "writerCount: 0",
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
      "description": "GIVEN two authorized devices WHEN private Serve is queried THEN both reach it and Funnel count remains zero",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-host-topology.sh --two-device-private-serve --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "host-two-device",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "tailscale-private-serve",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "the second real device is removed or Funnel is enabled"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "two_devices",
            "action": {
              "steps": [
                "drive device A and a second real device B to the private Serve endpoint"
              ]
            },
            "end_state": {
              "must_observe": [
                "authorizedDevicePassCount: 2",
                "funnelListenerCount: 0"
              ],
              "must_not_observe": [
                "authorizedDevicePassCount: 0",
                "empty device identity"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN bounded real logs WHEN the incident timeline is built THEN four timestamped transitions cite captured evidence",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-host-topology.sh --verify-incident-timeline --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "host-timeline",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "host-log-timeline",
        "negative_control": {
          "would_fail_if": [
            "the incident events are static or timestamps are absent"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "incident_window",
            "action": {
              "steps": [
                "correlate bounded host, Docker and service logs"
              ]
            },
            "end_state": {
              "must_observe": [
                "timestampedTransitionCount: 4"
              ],
              "must_not_observe": [
                "timestampedTransitionCount: 0",
                "empty incident timeline"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "One-device, Funnel, and credential-canary variants fail closed without network mutation",
      "verify": "PLATFORM_IT=1 MK6_HOST_NEGATIVE=reachability-output-matrix bash scripts/verify-mk6-host-topology.sh --read-only --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "host-reachability-output-matrix",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "tailnet-host-read-only",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "a second device is absent but accepted, Funnel is present, a credential canary leaks, or the verifier mutates network state"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "authoritative_host",
            "action": {
              "steps": [
                "drive the second real device, then enumerate one-device, Funnel-present, and credential-canary cases using read-only diagnostics"
              ]
            },
            "end_state": {
              "must_observe": [
                "enumeratedVariantCount: 3",
                "namedFailureCount: 3",
                "networkMutationCount: 0"
              ],
              "must_not_observe": [
                "credentialCanaryOutputCount > 0",
                "namedFailureCount: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Stable-alias diagnostics prove one writer",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-host-topology.sh --read-only --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Two-device private Serve passes with no Funnel",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-host-topology.sh --two-device-private-serve --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "A second writer fails closed",
      "verify": "PLATFORM_IT=1 MK6_HOST_NEGATIVE=second-writer bash scripts/verify-mk6-host-topology.sh --read-only --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Four timeline transitions retain evidence",
      "verify": "PLATFORM_IT=1 bash scripts/verify-mk6-host-topology.sh --verify-incident-timeline --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Reachability and output negative matrix fails named",
      "verify": "PLATFORM_IT=1 MK6_HOST_NEGATIVE=reachability-output-matrix bash scripts/verify-mk6-host-topology.sh --read-only --json",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
