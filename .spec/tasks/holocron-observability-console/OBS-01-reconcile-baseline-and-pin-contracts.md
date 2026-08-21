# OBS-01 — Reconcile baseline and pin supported contracts
> Status: 🔵 In Review
> Cycle: 1
> Commit: a18bc21b7e805043bad2f851920fb9b3dcd73971
> Updated: 2026-08-21T03:32:17Z

**Status:** Planned
**Proposed By:** `mastra-planner`
**Primary implementer:** `mastra-implementer`
**Estimate:** 2–3 days
**Depends on:** none

## Objective

Select and commit one safe, compatible Mastra/Langfuse dependency and image-source
contract after proving it with real Bun, Postgres, Langfuse v4, and target-host
capacity. This task is the go/no-go gate for every later task.

## Critical constraints

- MUST evaluate PRD Candidate A first and Candidate B only after a recorded A failure.
- MUST pin direct versions and lock integrity; no range, floating image tag, or
  transitive-only SDK dependency is accepted.
- MUST compare selected Mastra artifacts with the official 2026 incident denylist and
  verify registry provenance, engine, architecture, and installed graph.
- MUST prove that official exporter success and failure are externally distinguishable.
  If failure is concealed, stop BLOCKED; never invent queue freshness.
- NEVER stop/restart the existing hosted release, edit network settings, reveal secret
  values, mutate Sprint 33 worktrees, or call a capacity shortfall complete.

## Write-allowed files

```text
services/platform/package.json
pnpm-lock.yaml
services/platform/deploy/compose/observability-source-lock.json
scripts/verify-observability-baseline.ts
services/platform/tests/integration/observability-compatibility-gate.test.ts
.spec/prd/holocron-observability-console/README.md   # only if evidence changes the matrix
```

All production exporter, Compose, release, health, MCP, and retained-worktree files
are read-only in this task.

## Implementation sequence

1. Capture root/main SHA, ancestry, worktrees, current package graph, Node/Bun/CPU
   identities, current Compose/image locks, hosted ReleaseLock/health identity, and
   target-mini free memory/disk without printing environment values.
2. Add direct exact dependencies for Candidate A, including
   `@mastra/otel-exporter@1.3.9`, `@mastra/observability@1.17.1`, the official MCP SDK
   at its accepted resolved version when source imports it directly, and
   `@mastra/langfuse@1.4.9` only for the direct-export compatibility canary. Commit lock
   integrity.
3. Validate package metadata, provenance/integrity, engine `>=22.13`, official incident
   denylist, and absence of unpublished/deprecated-for-security packages.
4. Start a disposable real Postgres + pinned Langfuse v4 stack on isolated ports and
   volumes. Run the actual Bun Mastra exporter with a secret sentinel through success,
   endpoint-unreachable, wrong-auth, persistent-queue saturation, recovery, and flush
   paths through the pinned Collector. Confirm success through Observations API v2,
   documented Collector metrics, and sentinel absence.
5. If A fails, preserve evidence, move exactly to Candidate B from the PRD, and run the
   complete type/unit/integration regression plus the same canary.
6. Resolve exact ARM64 digests and upstream source revision for Langfuse web/worker,
   ClickHouse (v4-supported version), Redis, Postgres, MinIO, and the edge image. Write
   only non-secret source/digest/provenance data to `observability-source-lock.json`.
7. Compare measured target-host capacity with published low-scale requirements and the
   existing four-service budget. Emit `GO` only with recorded headroom; otherwise emit
   `BLOCKED_CAPACITY` and stop later dispatch.

Candidate discovery inputs are Langfuse `v4.15.0` source
`2371d606c4ab8882f09f6afce5b73948698552c6`, worker digest
`sha256:37a7c4251b602e60fd39451e6c252195908bf61837d4e252adbd752c0809e835`,
ClickHouse 25.12 digest
`sha256:8a790dd3468db22b1d4e7b18a176f378ff5ff6053b9c48dd4ea1fa71a24c5ba6`,
Redis 7 digest
`sha256:91d0f7e8c748ec7a4c2b4fb2c4f84edab794dd91d01e095e38dc906db9d684ab`,
and Postgres 17 digest
`sha256:e38411452a464af89e5adadb8d223bf53b898d47d6ef918b2d58c08707350449`.
They are not approved until registry and target ARM64 verification passes. MinIO,
edge, Collector, final web build, and all child manifests begin unresolved and block GO.

## Acceptance and test criteria

- **AC-1:** Given Candidate A, when the real canary runs, then the accepted matrix has
  a visible OTLP success, visible failure class, recovery, and redaction proof.
- **AC-2:** Given every selected package/image, when the supply-chain gate runs, then
  exact provenance, integrity, engine, ARM64 digest, and denylist results are recorded.
- **AC-3:** Given the target mini, when capacity is measured, then a named GO/BLOCKED
  decision accounts for all twelve services and eight volumes.
- **AC-4:** Given repository/runtime history, when baseline reconciliation runs, then
  source, installed, hosted, and retained-WIP states are separately identified.
- **TC-1:** Unreachable and wrong-auth Langfuse endpoints fail the canary and cannot
  update last-success state.
- **TC-2:** A mutated digest, denied version, or floating tag makes the gate nonzero.
- **TC-3:** A capacity fixture one byte below reserve fails while the live measurement
  remains unchanged.
- **TC-4:** A hosted SHA mismatch or overlapping retained writer blocks dispatch.

## Verification

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:unit
PLATFORM_IT=1 pnpm vitest run --project integration \
  services/platform/tests/integration/observability-compatibility-gate.test.ts
bun scripts/verify-observability-baseline.ts --candidate A --json
bun scripts/verify-observability-baseline.ts --supply-chain --json
bun scripts/verify-observability-baseline.ts --target-capacity --json
git diff --check
```

Required artifacts:

```text
.tmp/OBS-01/start-ref.json
.tmp/OBS-01/dependency-integrity.json
.tmp/OBS-01/incident-denylist.json
.tmp/OBS-01/real-export-canary.json
.tmp/OBS-01/export-failure-recovery.json
.tmp/OBS-01/arm64-image-source-lock.json
.tmp/OBS-01/target-capacity.json
.tmp/OBS-01/overlap-and-baseline.json
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "OBS-01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "real_canary": {
      "seed_method": "public_api",
      "description": "isolated real Bun Postgres and Langfuse v4 export canary",
      "records": [
        "expectedObservationCount:1",
        "expectedSecretSentinelCount:0"
      ]
    },
    "target_host": {
      "seed_method": "recorded_external",
      "description": "fresh target-mini CPU memory disk Docker and release identity",
      "records": [
        "expectedServiceCount:12",
        "expectedVolumeCount:8"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN Candidate A and real services WHEN success outage auth failure and recovery run THEN official export semantics are visible and redacted",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-compatibility-gate.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-01/AC-1",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "bun-postgres-langfuse-v4",
        "negative_control": {
          "would_fail_if": [
            "the sink is fake or exporter errors are concealed",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_canary",
            "action": {
              "steps": [
                "export then fail authentication then recover"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedObservationCount:1",
                "failureClassCount >= 1",
                "recoveryObservationCount:1"
              ],
              "must_not_observe": [
                "expectedSecretSentinelCount > 0",
                "green concealed failure",
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
      "description": "GIVEN selected artifacts WHEN supply chain validation runs THEN exact integrity provenance engine architecture and denylist results pass",
      "verify": "bun scripts/verify-observability-baseline.ts --supply-chain --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-01/AC-2",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "npm-registry-and-image-registry",
        "negative_control": {
          "would_fail_if": [
            "a digest is mutated or a denied version is accepted",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_canary",
            "action": {
              "steps": [
                "validate package and image identities"
              ]
            },
            "end_state": {
              "must_observe": [
                "floatingTagCount:0",
                "deniedVersionCount:0"
              ],
              "must_not_observe": [
                "missing integrity",
                "unverified ARM64 digest",
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
      "description": "GIVEN the target mini WHEN capacity is measured THEN twelve services and eight volumes receive an explicit GO or blocking result",
      "verify": "bun scripts/verify-observability-baseline.ts --target-capacity --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-01/AC-3",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "target-mini-docker-host",
        "negative_control": {
          "would_fail_if": [
            "capacity uses guessed or local-machine values",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "target_host",
            "action": {
              "steps": [
                "measure and compare published reserve"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedServiceCount:12",
                "expectedVolumeCount:8",
                "decisionCount:1"
              ],
              "must_not_observe": [
                "empty host identity",
                "silent overcommit",
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
      "description": "GIVEN source hosted and retained worktree state WHEN reconciliation runs THEN their identities and ownership are separate and actionable",
      "verify": "bun scripts/verify-observability-baseline.ts --reconcile --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-01/AC-4",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "git-release-lock-and-worktree-inventory",
        "negative_control": {
          "would_fail_if": [
            "hosted identity is inferred from source or an overlapping writer is ignored",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "target_host",
            "action": {
              "steps": [
                "compare Git release runtime and worktree identities"
              ]
            },
            "end_state": {
              "must_observe": [
                "sourceIdentityCount:1",
                "hostedIdentityCount:1",
                "ownershipDecisionCount:1"
              ],
              "must_not_observe": [
                "collapsed identity",
                "unowned overlap",
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
      "description": "Unreachable and wrong-auth endpoints fail and do not advance success freshness.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-compatibility-gate.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Mutated digest denied version and floating tag each fail supply-chain validation.",
      "verify": "bun scripts/verify-observability-baseline.ts --supply-chain --negative --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Capacity below reserve returns a blocking decision.",
      "verify": "bun scripts/verify-observability-baseline.ts --target-capacity --negative --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Hosted SHA mismatch and retained writer overlap block dispatch.",
      "verify": "bun scripts/verify-observability-baseline.ts --reconcile --negative --json",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
