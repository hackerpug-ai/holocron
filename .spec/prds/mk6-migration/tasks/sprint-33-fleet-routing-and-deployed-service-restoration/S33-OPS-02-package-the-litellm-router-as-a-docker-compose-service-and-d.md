# S33-OPS-02: Package the LiteLLM router as a Docker Compose service and deploy it on the holocron host, capacity-routing to both minis

> Status: Backlog
> Assignee: devops-engineer
> Priority: P0
> Type: INFRA
> Effort: M · 150 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: devops-engineer
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: S33-OPS-01
> Blocks: S33-OPS-03, S33-OPS-04, S33-OPS-05

## Outcome

Stand up a real, capacity-routed LiteLLM router on the holocron host as a pinned-digest Docker Compose service, reachable from both host.docker.internal (unblocking the existing FLEET_URL default in production-deploy.ts) and the tailnet, proven by a live-observed /health flip AND by a second real device (inference1) independently confirming the router answers over its own SSH-issued request.

**Success state:** docker compose -f router.compose.yaml up -d on holocron produces a running container; GET holocron.tail011a51.ts.net:4545/v1/models — queried both from the laptop AND from inference1 over its own SSH session — lists both 'implementer' and 'reviewer'; GET https://holocron.tail011a51.ts.net:44111/health reports status ok and fleet.ready:true with failing_dependency:null; concurrent real chat completions against 'reviewer' are demonstrably served by BOTH inference1 and inference2, not just one (proven via each mini's own entrypoint).

## Critical Constraints

**MUST**

- Pin the LiteLLM image by digest, never a floating tag — ghcr.io/berriai/litellm@sha256:468c25f35f3e5ec4e414974f00deab93337b1b4d9953cabcfd3722e59415f834 (live-verified pulled and cached on holocron 2026-08-16), matching this repo's existing image-pinning convention (see compose.yaml / langfuse.compose.yaml).
- Follow the existing sibling-compose-file pattern (langfuse.compose.yaml) rather than adding a 5th service to compose.yaml — README.md documents compose.yaml as an exact 'four-service' contract and preflight/verify tooling checks running_service_count=4.
- Bind the router container on 0.0.0.0:4545 on the holocron host (matching the laptop's own router bind pattern in ~/start-router.sh) so it is reachable both via host.docker.internal (from the mastra/scheduler containers) and via the tailnet (holocron.tail011a51.ts.net:4545) for future consumers.
- model_name 'reviewer' MUST be used for the new 27B backend — this exactly matches the litellmModelId already declared for the convergent/judge roles in services/platform/fleet/manifest.json (read-only reference, not edited by this task).
- Include an 'implementer' model_name entry (both minis, weight=100, already-resident Qwen3.6-35B-A3B-MLX-8bit) so the divergent role's litellmModelId also resolves through this same router.
- Use restart: unless-stopped for reboot persistence — do NOT install a launchd LaunchAgent; README.md explicitly warns against native LaunchAgents alongside the Docker Compose production path (double-bind risk), and live inspection of holocron confirms none of the four existing services use launchd either.
- AC-1 must prove reachability from a REAL second device inside the fleet (inference1 curling the router over its own SSH session), not just from the operator's laptop — this is a genuine two-device claim (holocron + inference1) and both sides must be driven through their own real entrypoints.

**NEVER**

- Never add an auth master_key inconsistent with the rest of the fleet (security comes from Tailscale ACLs only, per ~/models/DEVICES.md) unless the operator explicitly requests it.
- Never modify compose.yaml's documented four-service count.
- Never hardcode services/platform/fleet/manifest.json's endpoint fields to host.docker.internal:4545 — mastra-planner (s33-platform) deliberately keeps the manifest's loopback value as the committed dev fallback and is instead adding FLEET_URL precedence (S33-PLAT-01/02: endpointOverride > FLEET_URL > manifest role endpoint > manifest defaultEndpoint), so this task must not propose or depend on a manifest hardcode.
- Never claim the full chat-completion path works end-to-end through Mastra from this task alone. Confirmed mechanism: probeFleet() in services/platform/src/http/health.ts:205 is the ONLY consumer of process.env.FLEET_URL — it is what this task's /health AC exercises. resolveModel() in services/platform/src/inference/resolve-model.ts:332 uses manifest.json's entry.endpoint via an endpointOverride, and never reads FLEET_URL directly, so real model calls do not reach this router until S33-PLAT-01/02's endpoint-precedence fix lands (mastra-planner's lane, not touched here). This task proves the router itself is live, reachable, and capacity-routes real inference — nothing more.
- Do not remove the inference1-driven curl step from AC-1 to simplify the task — without it, AC-1's multi-node claim is unearned (a fixture-injected or laptop-only proof would satisfy neither the real requirement nor the fakeability gate).

## Acceptance Criteria

### AC-1 — Router deploys on holocron and is reachable across two devices — an external observer AND a real fleet member

- **GIVEN** holocron:44111/health currently reports status 'degraded', fleet.ready:false, endpoint http://host.docker.internal:4545, error 'Unable to connect' (live-verified 2026-08-16 and re-confirmed twice by temporary router smoke tests during planning, each of which flipped it to ok and back to degraded on teardown). Today, nothing on the tailnet — including a real fleet member like inference1 — can reach holocron:4545 either, since nothing listens there.
- **WHEN** `docker compose -f services/platform/deploy/compose/router.compose.yaml up -d` is run on holocron with the real model_list wired to inference1/inference2.
- **THEN** The router answers to both the laptop (an external observer) AND inference1 (a real second device inside the fleet, querying holocron:4545 over its own SSH-issued curl) with 'implementer' and 'reviewer'; holocron's own /health endpoint returns status 'ok', fleet.ready:true, failing_dependency:null, with zero restart of the mastra container.
- **Verify:** `curl -sS https://holocron.tail011a51.ts.net:44111/health | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['status']=='ok' and d['fleet']['ready'] is True and d['failing_dependency'] is None" && ssh inference1 'curl -sS http://holocron.tail011a51.ts.net:4545/v1/models' | grep -q reviewer`
- **Tier:** integration · **Service:** real deployed holocron service /health + LiteLLM router on holocron:4545, confirmed reachable from inference1's own entrypoint · **Flow:** UC-PLAT-05
- **Scenario:** topology `multi-node` · evidence `api_response` · negative control: disconnect, stub

### AC-2 — Capacity/least-busy routing distributes real inference load across BOTH minis

- **GIVEN** The router's 'reviewer' model_name has two backends at weight=100: inference1:8003 and inference2:8003, both serving real Qwen3.8-27B-8bit weights (per S33-OPS-01). LiteLLM's response header x-litellm-model-api-base names the exact backend that served each request (confirmed live 2026-08-16 for the 'implementer' model_name, returning x-litellm-model-api-base: http://inference1.tail011a51.ts.net:8003/v1 on a real completion).
- **WHEN** 6 concurrent POST /v1/chat/completions requests are fired at the router for model 'reviewer'.
- **THEN** The x-litellm-model-api-base header across the 6 responses includes BOTH http://inference1.tail011a51.ts.net:8003/v1 and http://inference2.tail011a51.ts.net:8003/v1 (app-layer proof); AND both inference1 and inference2's own oMLX logs (~/local-llm/logs/omlx-mini-8003.log, confirmed present on both real minis) show request activity within the test window, read directly from each mini's own SSH entrypoint — evidence spans two devices, not one (device-side corroboration, not a fixture); each response contains genuinely different generated content (real tokens, not a canned/static reply).
- **Verify:** `for i in 1 2 3 4 5 6; do curl -sS -i -X POST http://holocron.tail011a51.ts.net:4545/v1/chat/completions -H 'Content-Type: application/json' -d '{"model":"reviewer","messages":[{"role":"user","content":"count to 3"}],"max_tokens":20}' | grep -i x-litellm-model-api-base & done; wait; ssh inference1 'tail -n 20 ~/local-llm/logs/omlx-mini-8003.log'; ssh inference2 'tail -n 20 ~/local-llm/logs/omlx-mini-8003.log'`
- **Tier:** integration · **Service:** LiteLLM least-busy routing across real inference1+inference2 oMLX · **Flow:** UC-INFER-01
- **Scenario:** topology `multi-node` · evidence `stdout` · negative control: stub, static

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | holocron:44111/health reports ok+fleet.ready after the router is up | AC-1 | `curl -sS https://holocron.tail011a51.ts.net:44111/health | grep -q '"status":"ok"'` |
| TC-2 | the router is reachable from inference1's own SSH-issued curl, not only from the laptop | AC-1 | `ssh inference1 'curl -sS http://holocron.tail011a51.ts.net:4545/v1/models' | grep -q reviewer` |
| TC-3 | stopping the router reverts /health to degraded | AC-1 | `docker compose -f router.compose.yaml down && curl -sS https://holocron.tail011a51.ts.net:44111/health | grep -q degraded` |
| TC-4 | concurrent requests land on both minis, evidenced app-side and device-side | AC-2 | `grep x-litellm-model-api-base headers for both mini hostnames; ssh inference1/inference2 log tails both show recent activity` |

## Fixtures

**`litellm-router-image`** — Pinned LiteLLM proxy image, already pulled on holocron 2026-08-16 during planning verification. _(seed: cli)_

- image=ghcr.io/berriai/litellm@sha256:468c25f35f3e5ec4e414974f00deab93337b1b4d9953cabcfd3722e59415f834

**`mini-backends`** — Real oMLX backends confirmed live 2026-08-16. _(seed: cli)_

- http://inference1.tail011a51.ts.net:8003/v1 -> Qwen3.6-35B-A3B-MLX-8bit (+ Qwen3.8-27B-8bit once S33-OPS-01 AC-2 lands)
- http://inference2.tail011a51.ts.net:8003/v1 -> Qwen3.6-35B-A3B-MLX-8bit + Qwen3.8-27B-8bit (S33-OPS-01 AC-1)

## Reading List

- `services/platform/deploy/compose/langfuse.compose.yaml` (1-30) — sibling-compose-file pattern to follow (pinned digests, bounded logging, naming)
- `services/platform/deploy/compose/README.md` (1-20,129-160) — four-service contract boundary + loopback port conventions
- `services/platform/src/http/health.ts` (204-230) — probeFleet() — the ONLY FLEET_URL consumer, live-verified as what flips /health
- `services/platform/src/inference/resolve-model.ts` (330-360) — resolveModel() uses manifest.json entry.endpoint via endpointOverride, never FLEET_URL directly — read-only, do not edit
- `services/platform/fleet/manifest.json` (1-98) — litellmModelId values ('implementer','reviewer') the router's model_list must match — read-only, do not edit
- `~/llm-router/config.yaml` (1-140) — existing laptop router's capacity-routing pattern to replicate (weight=100 least-busy)

## Guardrails

**WRITE-ALLOWED**

- services/platform/deploy/compose/router.compose.yaml (NEW)

**WRITE-PROHIBITED**

- services/platform/deploy/compose/compose.yaml - four-service contract, not this task's job (see S33-OPS-03)
- services/platform/fleet/manifest.json - mastra-planner's lane
- services/platform/src/** - mastra-planner's lane

## Design

**Pattern** — Auxiliary pinned-digest Docker Compose file alongside compose.yaml, matching langfuse.compose.yaml precedent

_Source:_ `services/platform/deploy/compose/langfuse.compose.yaml:1-30`

**Anti-pattern** — Adding the router as a 5th service inside compose.yaml, breaking the documented and tooling-enforced four-service contract

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| router config renders | `docker compose -f services/platform/deploy/compose/router.compose.yaml config --quiet` | Exit 0 |
| deployed health flips | `curl -sS https://holocron.tail011a51.ts.net:44111/health` | status=ok, fleet.ready=true, failing_dependency=null |
| reachable from a real second device | `ssh inference1 'curl -sS http://holocron.tail011a51.ts.net:4545/v1/models'` | response contains 'reviewer' |

## Agent Assignment

**devops-engineer** — New Docker Compose service packaging + deployment onto a real host, tailnet exposure, and capacity-routing configuration is container orchestration / deployment automation — devops-engineer's core lane.

## Coding Standards

- Pin every image by digest, never `latest` or a floating tag.
- Bounded logging (local driver, 10m x 3 files) on every new container, matching the rest of this compose contract.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-OPS-02",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "litellm-router-image": {
      "description": "Pinned LiteLLM proxy image, already pulled on holocron 2026-08-16 during planning verification.",
      "seed_method": "cli",
      "records": [
        "image=ghcr.io/berriai/litellm@sha256:468c25f35f3e5ec4e414974f00deab93337b1b4d9953cabcfd3722e59415f834"
      ]
    },
    "mini-backends": {
      "description": "Real oMLX backends confirmed live 2026-08-16.",
      "seed_method": "cli",
      "records": [
        "http://inference1.tail011a51.ts.net:8003/v1 -> Qwen3.6-35B-A3B-MLX-8bit (+ Qwen3.8-27B-8bit once S33-OPS-01 AC-2 lands)",
        "http://inference2.tail011a51.ts.net:8003/v1 -> Qwen3.6-35B-A3B-MLX-8bit + Qwen3.8-27B-8bit (S33-OPS-01 AC-1)"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the deployed service reports fleet unreachable WHEN the packaged router is deployed on holocron THEN /health flips to ok/fleet.ready with zero mastra restart, AND a second real device (inference1) independently confirms reachability over its own SSH-issued request",
      "verify": "curl -sS https://holocron.tail011a51.ts.net:44111/health && ssh inference1 'curl -sS http://holocron.tail011a51.ts.net:4545/v1/models'",
      "scenario": {
        "id": "AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holocron:44111/health (real Docker container) + inference1 as a second real device driving its own request",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "litellm-router-image",
            "action": {
              "actor": "devops-engineer",
              "steps": [
                "docker compose -f services/platform/deploy/compose/router.compose.yaml up -d   # run ON holocron via ssh",
                "curl -sS http://holocron.tail011a51.ts.net:4545/v1/models   # queried from the laptop, an external observer",
                "curl -sS https://holocron.tail011a51.ts.net:44111/health",
                "ssh inference1 'curl -sS http://holocron.tail011a51.ts.net:4545/v1/models'   # drives a second real device (inference1) through its OWN entrypoint \u2014 proves the router is reachable across two devices inside the fleet, not only from the operator's laptop"
              ]
            },
            "end_state": {
              "must_observe": [
                "/v1/models response (from the laptop) contains both 'implementer' and 'reviewer'",
                "/health status=='ok'",
                "/health fleet.ready==true and fleet.latency_ms>=1",
                "/health failing_dependency==null",
                "inference1's own curl (issued from inference1 itself over SSH, not the laptop) to holocron:4545/v1/models returns a response containing both 'implementer' and 'reviewer'"
              ],
              "must_not_observe": [
                "/health status=='degraded'",
                "/health fleet.error field present",
                "/health fleet contains 0 reachable endpoints (the pre-fix failure signature)",
                "inference1's own curl to holocron:4545 timing out or returning 0 bytes (would mean the router is unreachable from within the fleet, not only from the laptop)"
              ]
            }
          },
          {
            "start_ref": "litellm-router-image",
            "action": {
              "actor": "devops-engineer",
              "steps": [
                "docker compose -f router.compose.yaml down   # negative control: stop the router"
              ]
            },
            "end_state": {
              "must_observe": [
                "/health reverts to status=='degraded'",
                "/health fleet.ready==false (0 successful probes)",
                "/health failing_dependency=='fleet'"
              ],
              "must_not_observe": [
                "/health remaining status=='ok' after the router is stopped",
                "/health showing 0 change from the pre-stop reading (would indicate the flip was never real)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN both minis serve the reviewer model WHEN concurrent requests are routed THEN both minis observably handle real traffic, proven both app-side (headers) and device-side (logs)",
      "verify": "response headers + ssh inference1/inference2 log tail during concurrent load",
      "scenario": {
        "id": "AC-2",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "inference1:8003 + inference2:8003 (real Mac minis)",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mini-backends",
            "action": {
              "actor": "devops-engineer",
              "steps": [
                "fire 6 concurrent chat-completion requests through http://holocron.tail011a51.ts.net:4545/v1/chat/completions with model=reviewer, capturing response headers",
                "immediately tail both minis' real oMLX logs over SSH (each mini's own entrypoint) \u2014 evidence spans two devices, inference1 and inference2, each queried independently"
              ]
            },
            "end_state": {
              "must_observe": [
                "x-litellm-model-api-base header values across the 6 responses include both 'http://inference1.tail011a51.ts.net:8003/v1' and 'http://inference2.tail011a51.ts.net:8003/v1'",
                "inference1's own log file shows >=1 request timestamp in the test window",
                "inference2's own log file shows >=1 request timestamp in the test window",
                "at least 2 distinct response bodies among the 6 (proves real generation, not a cached static reply)"
              ],
              "must_not_observe": [
                "all 6 x-litellm-model-api-base values identical (proves single-node pinning, not capacity routing)",
                "all 6 requests' timestamps appearing only in one mini's log",
                "0 of the 6 responses show inference2.tail011a51.ts.net as the api-base value (would mean inference2 was never selected)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "health flips to ok",
      "maps_to_ac": "AC-1",
      "verify": "curl -sS https://holocron.tail011a51.ts.net:44111/health | grep -q '\"status\":\"ok\"'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "router reachable from a real second device",
      "maps_to_ac": "AC-1",
      "verify": "ssh inference1 'curl -sS http://holocron.tail011a51.ts.net:4545/v1/models' | grep -q reviewer"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "health reverts on router stop",
      "maps_to_ac": "AC-1",
      "verify": "curl -sS https://holocron.tail011a51.ts.net:44111/health | grep -q degraded"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "both minis serve real load",
      "maps_to_ac": "AC-2",
      "verify": "ssh inference1 tail + ssh inference2 tail + response header grep"
    }
  ]
}
-->
