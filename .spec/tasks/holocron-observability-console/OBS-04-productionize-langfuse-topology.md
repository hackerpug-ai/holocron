# OBS-04 — Productionize Langfuse topology and recovery

**Status:** Planned
**Proposed By:** `mastra-planner`
**Primary implementer:** `mastra-implementer` with deployment review
**Estimate:** 5–7 days
**Depends on:** OBS-01 GO

## Objective

Fold the complete Langfuse v4 and selected OTLP transport into Holocron's immutable
production release, secret/capacity preflight, backup, isolated restore, restart, and
rollback lifecycle.

## Execution split

Keep one task ID but use three sequential reviewed commits:

1. **OBS-04A:** canonical Compose and ReleaseLock v2;
2. **OBS-04B:** lifecycle, secrets, healthchecks, and capacity enforcement;
3. **OBS-04C:** consistent backup, isolated restore, restart, and rollback.

## Critical constraints

- MUST use the exact OBS-01 package/image/source/ARM64 decision. No floating tag,
  stale digest, synthetic image lock, or unverified architecture may deploy.
- MUST give Langfuse its own Postgres credentials/database and distinct service names.
- MUST remove every production credential/salt/key fallback and keep secret values out
  of argv, rendered config, logs, and evidence. Missing names fail preflight.
- MUST have one production lifecycle. Retire the standalone Langfuse LaunchAgent and
  separate production Compose project; do not start competing writers.
- MUST back up real ClickHouse, Langfuse Postgres, object data, selected persistent OTLP
  queue, and release metadata, then prove an isolated restore through public APIs.
- NEVER run `down -v`, mount production volumes into the restore target, alter network
  settings, or apply to the hosted release without the separate operator gate.

## Target topology

The selected production decision contains exactly 12 services and 8 volumes, adding
`otel-collector` and its persistent `otel-queue` to the eleven-service console/core
topology. OBS-01 must prove this Collector path or return
`EXPORT_QUEUE_STATUS_UNAVAILABLE`; it may not silently fall back to direct export.

Langfuse minimum versions are ClickHouse 25.12+, Postgres 15/16-compatible target,
and Redis 7+. Internal database/cache/object-store ports are not published. Only the
later edge service publishes loopback 44111.

## Write-allowed files

```text
AGENTS.md                                                   # value-free secret index only
.env.example
services/platform/config/secrets.example.yaml
services/platform/deploy/compose/compose.yaml
services/platform/deploy/compose/compose.dev.yaml
services/platform/deploy/compose/production.env.example
services/platform/deploy/compose/development.env.example
services/platform/deploy/compose/image-lock.json
services/platform/deploy/compose/langfuse.compose.yaml       # retire/delete or dev include
services/platform/deploy/compose/README.md
services/platform/deploy/launchd/holocron-langfuse.plist    # retire/delete
services/platform/deploy/launchd/README.md
services/platform/deploy/otel/**
services/platform/src/stack/supervisor.ts
services/platform/src/deploy/production-release.ts
services/platform/src/deploy/production-deploy.ts
services/platform/src/deploy/verify-production.ts
services/platform/src/backup/langfuse-backup.ts
services/platform/src/backup/langfuse-restore.ts
services/platform/src/backup/index.ts
services/platform/src/backup/heartbeat.ts
services/platform/src/backup/alerting.ts
services/platform/src/cli/holo.ts
scripts/stage-holocron-release.sh
scripts/verify-cutover-exact-release.sh
services/platform/tests/integration/observability-production-topology.test.ts
services/platform/tests/integration/observability-backup-restore.test.ts
services/platform/tests/integration/sprint29-deployment.test.ts
services/platform/tests/integration/cutover-exact-release.test.ts
```

OBS-05 edge/custom-web build files, application observability, MCP, retained Sprint 33
worktrees, and sprint state are read-only.

## ReleaseLock v2 and secret contract

Schema v2 records every selected service image repository and platform digest, custom
source/build provenance, Compose SHA-256, migration head, state-volume class, and
previous compatible release. The checked-in example remains explicitly nondeployable.
Every hard-coded four-service/two-volume verifier moves to the selected exact topology.

Secret templates add names for Langfuse database, ClickHouse, Redis, MinIO,
encryption/salt/auth, project API keys, and initial admin. Compose uses `${NAME:?}` or
file-backed inputs. For software without native `_FILE`, create a mode-0600 tmpfs config
at container start. Redis passwords are absent from process command and healthcheck.

Capacity preflight uses the fresh target Docker VM memory/disk snapshot, reserves host
and Docker overhead, and accounts for all twelve service limits and eight volumes.
Published per-service planning guidance totals roughly 27.5 GiB for the Langfuse
components before Holocron core and Collector headroom. Existing resource limits may
change only from OBS-01's captured target evidence; insufficient reserve blocks apply.

## Backup and restore contract

Backup order: quiesce web/worker/export, prove ingestion/persistent queue drained or
block, take a consistent ClickHouse backup, back up Langfuse Postgres, snapshot object
data and persistent queue, record Redis disposition, and write a checksummed manifest
with trace/observation/score/object witnesses plus ReleaseLock v2.

Restore uses a unique absent Compose project, fresh volumes, fresh credentials, and
non-production ports. It verifies witnesses via Langfuse public APIs plus direct
first-party event SQL. Rollback first proves the previous Langfuse image understands
the current schema; incompatible rollback returns `ROLLBACK_SCHEMA_INCOMPATIBLE`.

## Acceptance and test criteria

- **AC-1:** Given the selected topology, when release verification runs, then exactly
  every service/volume/image/source/Compose identity is immutable and ARM64-proven.
- **AC-2:** Given missing or sentinel secrets, when preflight/render/start runs, then
  missing names fail closed and values occur nowhere in argv/config/log/evidence.
- **AC-3:** Given seeded live trace/score/object/event witnesses, when backup and isolated
  restore run, then all witnesses and checksums match through real services.
- **AC-4:** Given cold restart and compatible/incompatible previous releases, when
  lifecycle runs, then state survives compatible paths and incompatible rollback blocks.
- **TC-1:** Tag-only, changed digest, wrong architecture, omitted service/volume, or
  separate lifecycle makes release verification nonzero.
- **TC-2:** Omit each required secret; no container starts and canary values have zero
  matches in rendered/host artifacts.
- **TC-3:** Restore to fresh names, delete only restore volumes, restore again, and prove
  production volume/container identities never changed.
- **TC-4:** Cold restart retains witnesses; a deliberately incompatible schema refuses
  before any state mutation.

## Verification

```bash
docker compose -f services/platform/deploy/compose/compose.yaml config
bun services/platform/src/deploy/production-release.ts verify --json
bun services/platform/src/deploy/verify-production.ts --json
pnpm typecheck
pnpm test:unit
PLATFORM_IT=1 pnpm vitest run --project integration \
  services/platform/tests/integration/observability-production-topology.test.ts \
  services/platform/tests/integration/observability-backup-restore.test.ts \
  services/platform/tests/integration/sprint29-deployment.test.ts \
  services/platform/tests/integration/cutover-exact-release.test.ts
bun services/platform/src/cli/holo.ts backup:langfuse --json
bun services/platform/src/cli/holo.ts restore:langfuse --isolated --json
git diff --check
```

Artifacts: `.tmp/OBS-04/start-ref.json`, `release-lock-v2.json`,
`redacted-compose-and-listeners.json`, `secret-negative-matrix.json`,
`capacity-decision.json`, `backup-manifest.json`, `isolated-restore-parity.json`,
`restart.json`, and `rollback-matrix.json`.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "OBS-04",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "selected_release": {
      "seed_method": "recorded_external",
      "description": "OBS-01 selected exact ARM64 topology and real production-like Compose",
      "records": [
        "releaseLockSchema:2",
        "selectedTopologyCount:1"
      ]
    },
    "recovery_witnesses": {
      "seed_method": "public_api",
      "description": "real trace observation score object and first-party event before backup",
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
      "description": "GIVEN OBS-01 selected topology WHEN release verification runs THEN every service volume image source and Compose identity is exact and ARM64 proven",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-production-topology.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-04/AC-1",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "docker-compose-release-lock-registry",
        "negative_control": {
          "would_fail_if": [
            "a tag wrong architecture omitted service or separate lifecycle is accepted",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "selected_release",
            "action": {
              "steps": [
                "verify canonical release and image manifests"
              ]
            },
            "end_state": {
              "must_observe": [
                "releaseLockSchema:2",
                "selectedTopologyCount:1",
                "identityMismatchCount:0"
              ],
              "must_not_observe": [
                "floatingTagCount > 0",
                "undeclaredWriterCount > 0",
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
      "description": "GIVEN missing and sentinel secrets WHEN preflight render and start run THEN missing names block and values appear nowhere",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-production-topology.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-04/AC-2",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "compose-secret-preflight-and-host-processes",
        "negative_control": {
          "would_fail_if": [
            "a default credential or argv secret is accepted",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "selected_release",
            "action": {
              "steps": [
                "omit each secret then run sentinel start and scan"
              ]
            },
            "end_state": {
              "must_observe": [
                "missingSecretRejectedCount == requiredSecretCount",
                "sentinelMatchCount:0"
              ],
              "must_not_observe": [
                "containerStartedWithoutSecret:true",
                "secret in argv",
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
      "description": "GIVEN real witnesses WHEN backup and isolated restore run THEN public APIs and SQL report zero witness mismatch",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-backup-restore.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-04/AC-3",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "restic-r2-clickhouse-postgres-minio-langfuse",
        "negative_control": {
          "would_fail_if": [
            "backup is only an archive or restore reuses production volumes",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "recovery_witnesses",
            "action": {
              "steps": [
                "quiesce backup restore to fresh project and compare witnesses"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedWitnessMismatchCount:0",
                "restoreProjectDistinct:true",
                "resticSnapshotCount >= 1"
              ],
              "must_not_observe": [
                "productionVolumeMountCount > 0",
                "empty restored inventory",
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
      "description": "GIVEN cold restart and previous releases WHEN lifecycle runs THEN compatible state survives and incompatible rollback refuses before mutation",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-backup-restore.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-04/AC-4",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "docker-compose-langfuse-release-lifecycle",
        "negative_control": {
          "would_fail_if": [
            "restart loses data or schema compatibility is skipped",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "recovery_witnesses",
            "action": {
              "steps": [
                "cold restart then test compatible and incompatible rollback"
              ]
            },
            "end_state": {
              "must_observe": [
                "restartWitnessMismatchCount:0",
                "compatibleRollbackMismatchCount:0",
                "incompatibleRollbackExitCode != 0"
              ],
              "must_not_observe": [
                "stateVolumeRecreated:true",
                "incompatibleApplyCount > 0",
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
      "description": "Every topology image architecture and lifecycle mutation fails release verification.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-production-topology.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Missing secrets block and sentinel values have zero rendered or process matches.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-production-topology.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Isolated restore reports zero witness mismatches and never mounts production volumes.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-backup-restore.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Cold restart retains witnesses and incompatible rollback fails before apply.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-backup-restore.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
