# OBS-05 — Serve the private `/observability` path

**Status:** Planned
**Proposed By:** `mastra-planner`
**Primary implementer:** deployment specialist; independent security/routing review
**Estimate:** 3–4 days
**Depends on:** OBS-04

## Objective

Build and pin a base-path-aware Langfuse web image and deterministic edge route so the
existing tailnet origin serves `/observability` without exposing internal services or
breaking any Mastra API, MCP, health, or streaming path.

## Critical constraints

- MUST build Langfuse web from the OBS-01 exact source revision with
  `NEXT_PUBLIC_BASE_PATH=/observability`; prebuilt/runtime substitution is forbidden.
- MUST record source SHA, Dockerfile/base-image hashes, build args, SBOM/provenance, and
  final ARM64 digest in ReleaseLock v2.
- MUST match only `/observability` and `/observability/*`, preserve the prefix, and send
  `/observabilityevil` to Mastra. Encoded separator/dot/double-slash behavior is tested.
- MUST leave the external Tailscale Serve mapping and network settings unchanged.
- MUST publish only edge on `127.0.0.1:44111`; no Langfuse/DB/cache/object-store host
  listener and no public interface is allowed.
- MUST use a real browser and real streaming client; DOM emulation or response mocks do
  not close the task.

## Write-allowed files

```text
package.json
pnpm-lock.yaml
services/platform/deploy/edge/Caddyfile
services/platform/src/deploy/langfuse-web-release.ts
services/platform/deploy/compose/compose.yaml
services/platform/deploy/compose/compose.dev.yaml
services/platform/deploy/compose/image-lock.json
services/platform/deploy/compose/production.env.example
services/platform/deploy/compose/README.md
services/platform/src/deploy/production-release.ts
services/platform/src/deploy/production-deploy.ts
services/platform/src/deploy/verify-production.ts
services/platform/src/stack/supervisor.ts
services/platform/tests/integration/observability-private-route.test.ts
services/platform/tests/e2e/observability-console.spec.ts
```

If Playwright is absent, add an exact-pinned `@playwright/test` dev dependency after
the OBS-01 provenance policy, install the matching real browser, and commit the lock.
Application routes, Tailscale settings, observability tables, and MCP files are read-only.

## Route and build contract

The edge binds `:44111` internally. Exact `/observability` and the prefix subtree
reverse-proxy to `langfuse-web:3000` without stripping the base path. All other routes
proxy to `mastra:4111`. Streaming responses are not buffered or transformed. Configure
Langfuse auth URL as the complete private `/observability/api/auth` URL.

The build command checks out the pinned source in a disposable directory, verifies the
commit and Dockerfile hash, builds for target ARM64, inspects labels/SBOM, pushes to the
approved registry, resolves the immutable digest, and updates ReleaseLock v2. A changed
source/build fingerprint with an old digest fails verification.

## Acceptance and test criteria

- **AC-1:** Given the exact private origin, when a real browser signs in, then login,
  assets, API, and a known trace page load under `/observability` with no root redirect.
- **AC-2:** Given the route-adversary matrix, when requests pass through edge, then only
  exact observability paths reach Langfuse and no internal service is directly exposed.
- **AC-3:** Given existing Mastra health/API/MCP/streaming routes, when accessed through
  edge, then status, bytes/chunks, cancellation, and auth match direct internal behavior.
- **AC-4:** Given source/build/release identities, when verification runs, then only the
  recorded custom-web and edge digests are deployable.
- **TC-1:** A root-path redirect, missing asset, failed auth callback, or trace 404 makes
  browser QA fail with screenshot/network evidence.
- **TC-2:** `/observabilityevil`, encoded separators, dot segments, and double slashes
  never expose Langfuse; listener inventory contains only loopback edge.
- **TC-3:** A real SSE/model stream retains progressive chunks and cancellation;
  buffering or path regression fails parity.
- **TC-4:** Mutating source SHA, build arg, config hash, or digest fails before apply.

## Verification

```bash
docker compose -f services/platform/deploy/compose/compose.yaml config
bun services/platform/src/deploy/langfuse-web-release.ts build --json
bun services/platform/src/deploy/production-release.ts verify --json
pnpm typecheck
PLATFORM_IT=1 pnpm vitest run --project integration \
  services/platform/tests/integration/observability-private-route.test.ts
pnpm exec playwright test services/platform/tests/e2e/observability-console.spec.ts
git diff --check
```

Artifacts: `.tmp/OBS-05/start-ref.json`, `custom-web-provenance.json`,
`edge-route-matrix.json`, `listener-inventory.json`, `stream-parity.json`,
`browser-network.har`, and authenticated screenshots.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "OBS-05",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "known_trace": {
      "seed_method": "public_api",
      "description": "real Langfuse v4 trace and operator account on private origin",
      "records": [
        "expectedTracePageCount:1"
      ]
    },
    "route_matrix": {
      "seed_method": "cli",
      "description": "exact adjacent encoded dot and streaming routes through real edge",
      "records": [
        "expectedInternalPublishedPortCount:0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the private origin and known trace WHEN a real browser signs in THEN all console pages assets auth and trace remain under the base path",
      "verify": "pnpm exec playwright test services/platform/tests/e2e/observability-console.spec.ts -g 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-05/AC-1",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "real-browser-edge-langfuse",
        "negative_control": {
          "would_fail_if": [
            "the test uses DOM emulation or accepts a root redirect",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "known_trace",
            "action": {
              "steps": [
                "sign in and open exact trace through private origin"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedTracePageCount:1",
                "assetFailureCount:0",
                "rootRedirectCount:0"
              ],
              "must_not_observe": [
                "trace 404",
                "public origin",
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
      "description": "GIVEN adversarial paths and listener inventory WHEN routed THEN only exact console paths reach Langfuse and internal ports remain unpublished",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-private-route.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-05/AC-2",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "caddy-compose-host-listeners",
        "negative_control": {
          "would_fail_if": [
            "prefix matching is loose or internal ports are published",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "event_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "route_matrix",
            "action": {
              "steps": [
                "request adversarial paths and inspect listeners"
              ]
            },
            "end_state": {
              "must_observe": [
                "expectedInternalPublishedPortCount:0",
                "routeMismatchCount:0"
              ],
              "must_not_observe": [
                "observabilityevilLangfuseCount > 0",
                "publicBindCount > 0",
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
      "description": "GIVEN existing Mastra routes WHEN requests stream through edge THEN health API MCP chunks cancellation and auth match internal behavior",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-private-route.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-05/AC-3",
        "test_tier": "e2e",
        "tier": "visible",
        "verification_service": "edge-mastra-mcp-local-fleet",
        "negative_control": {
          "would_fail_if": [
            "the proxy buffers SSE or rewrites auth paths",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "route_matrix",
            "action": {
              "steps": [
                "compare direct and proxied health MCP and streaming calls"
              ]
            },
            "end_state": {
              "must_observe": [
                "routeParityMismatchCount:0",
                "progressiveChunkCount >= 2",
                "cancellationObserved:true"
              ],
              "must_not_observe": [
                "bufferedSingleChunk:true",
                "authBypass:true",
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
      "description": "GIVEN pinned source build and release identities WHEN verification runs THEN only matching custom web and edge digests deploy",
      "verify": "bun services/platform/src/deploy/production-release.ts verify --json",
      "maps_to_ac": null,
      "scenario": {
        "id": "OBS-05/AC-4",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "source-build-registry-release-lock",
        "negative_control": {
          "would_fail_if": [
            "an old digest is accepted after source or config mutation",
            "a disconnected stub would pass"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "known_trace",
            "action": {
              "steps": [
                "verify then mutate disposable source config and digest inputs"
              ]
            },
            "end_state": {
              "must_observe": [
                "verifiedBuildIdentityCount:1",
                "negativeExitCode != 0"
              ],
              "must_not_observe": [
                "floatingTagCount > 0",
                "staleDigestAccepted:true",
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
      "description": "Real browser auth assets and trace page stay under the base path.",
      "verify": "pnpm exec playwright test services/platform/tests/e2e/observability-console.spec.ts -g 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Adversarial paths never reach Langfuse and only loopback edge is published.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-private-route.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Proxied real stream preserves progressive chunks and cancellation.",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/observability-private-route.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Source build config and digest mutations fail release verification.",
      "verify": "bun services/platform/src/deploy/production-release.ts verify --negative-observability --json",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
