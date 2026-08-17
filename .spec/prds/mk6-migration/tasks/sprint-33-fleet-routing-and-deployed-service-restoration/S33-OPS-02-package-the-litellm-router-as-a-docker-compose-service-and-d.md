# S33-OPS-02: Package the LiteLLM router as a Docker Compose service and deploy it on the holocron host, capacity-routing to both minis

> Status: 🔴 Needs Fixes
> Commit: ec6277f70582560de3b768fb6048a99993753808
> Fix: HOLOCRON-SSH-AUTH-AND-LIVE-DEPLOY
> Updated: 2026-08-17T04:02:53Z
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

Stand up a real LiteLLM router on the holocron host as a pinned-digest Docker Compose service, reachable from both host.docker.internal (unblocking the existing FLEET_URL default in production-deploy.ts) and the tailnet, with `reviewer` bound to the real Qwen3.8 backend on inference2 only and `implementer` capacity-routed across the real Qwen3.6 backends on both minis. Prove the service through a live-observed /health flip and through a second real device (inference1) independently confirming the router answers over its own SSH-issued request.

**Success state:** docker compose -f router.compose.yaml up -d on holocron produces a running container; GET holocron.tail011a51.ts.net:4545/v1/models — queried both from the laptop AND from inference1 over its own SSH session — lists both 'implementer' and 'reviewer'; a real `reviewer` chat completion identifies inference2 as its backend and never inference1; GET https://holocron.tail011a51.ts.net:44111/health reports status ok and fleet.ready:true with failing_dependency:null; concurrent real chat completions against `implementer` are demonstrably served by BOTH inference1 and inference2, not just one (proven via response headers and each mini's own entrypoint).

## Critical Constraints

**MUST**

- Pin the LiteLLM image by digest, never a floating tag — ghcr.io/berriai/litellm@sha256:468c25f35f3e5ec4e414974f00deab93337b1b4d9953cabcfd3722e59415f834 (live-verified pulled and cached on holocron 2026-08-16), matching this repo's existing image-pinning convention (see compose.yaml / langfuse.compose.yaml).
- Follow the existing sibling-compose-file pattern (langfuse.compose.yaml) rather than adding a 5th service to compose.yaml — README.md documents compose.yaml as an exact 'four-service' contract and preflight/verify tooling checks running_service_count=4.
- Bind the router container on 0.0.0.0:4545 on the holocron host (matching the laptop's own router bind pattern in ~/start-router.sh) so it is reachable both via host.docker.internal (from the mastra/scheduler containers) and via the tailnet (holocron.tail011a51.ts.net:4545) for future consumers.
- model_name 'reviewer' MUST resolve to the real Qwen3.8-27B-8bit backend on inference2 only — S33-OPS-01 proved inference1 had less than 44 GiB free, no copy was attempted, its Qwen3.8 path remains absent, and its oMLX model list remains Qwen3.6-only. The role name exactly matches the litellmModelId already declared for the convergent/judge roles in services/platform/fleet/manifest.json (read-only reference, not edited by this task).
- Include an 'implementer' model_name entry with both minis at weight=100, each using the already-resident Qwen3.6-35B-A3B-MLX-8bit model, so the divergent role's litellmModelId resolves through this same router and the real two-mini capacity-routing proof remains possible.
- Use restart: unless-stopped for reboot persistence — do NOT install a launchd LaunchAgent; README.md explicitly warns against native LaunchAgents alongside the Docker Compose production path (double-bind risk), and live inspection of holocron confirms none of the four existing services use launchd either.
- AC-1 must prove both observer paths independently: the laptop curls the router directly and inference1 curls it through its own SSH session; each `/v1/models` response must be captured separately, parse successfully, and contain both exact public role IDs `implementer` and `reviewer`.
- AC-2 must send concurrent requests to `implementer`, not `reviewer`: Qwen3.6 is the only real model resident on both inference1 and inference2, so it is the only valid role for the preserved two-mini distribution proof.
- Implement `scripts/verify-s33-router-capacity.sh` as the single fail-closed runtime verifier with the exact `models-reviewer`, `implementer-distribution`, and `health-flip` modes specified below; every required capture and assertion is load-bearing, every curl/SSH/background-job/cleanup failure propagates to a nonzero exit, and success emits a JSON result into the selected `.tmp/S33-OPS-02/**` evidence directory.
- Implement `tests/integration/sprint33-ops-02-router-capacity.test.ts` as a real-service integration test that executes all three verifier modes against the deployed Holocron router, deployed Mastra service, and real minis. Missing HTTP, SSH, log, header, body, identity, cleanup, or service evidence must fail the test, never skip or fall back to fixtures.
- TC-3 must use the canonical `ssh holocron` destination (which resolves to `holocron@holocron.tail011a51.ts.net`) and only the deployed auxiliary router Compose file at `/Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml`. The verifier must arm an idempotent cleanup trap before the first router mutation and restore the auxiliary router on every normal, error, and signal exit.
- Every non-interactive remote Docker call must use the validated absolute CLI `/usr/local/bin/docker`; bare `docker` is forbidden because it is not on the canonical non-interactive `ssh holocron` PATH. `health-flip` must require `--remote-docker-bin /usr/local/bin/docker`, validate that exact remote file is executable before mutation, and use it for every Compose/inspect command.
- `health-flip` must accept the exact optional `--negative-control fail-after-stop` only in that mode. The control must perform the real router-only stop and exact degraded-state assertions, then deliberately fail so the already-armed cleanup trap runs; it must exit nonzero only after cleanup has restored the router and persisted an independently checkable failure/restore artifact.

**NEVER**

- Never add an auth master_key inconsistent with the rest of the fleet (security comes from Tailscale ACLs only, per ~/models/DEVICES.md) unless the operator explicitly requests it.
- Never modify compose.yaml's documented four-service count.
- Never configure `reviewer` with an inference1 backend or state that inference1 serves Qwen3.8-27B-8bit unless a later provisioning task supplies new live evidence; the completed S33-OPS-01 dependency proved the opposite.
- Never hardcode services/platform/fleet/manifest.json's endpoint fields to host.docker.internal:4545 — mastra-planner (s33-platform) deliberately keeps the manifest's loopback value as the committed dev fallback and is instead adding FLEET_URL precedence (S33-PLAT-01/02: endpointOverride > FLEET_URL > manifest role endpoint > manifest defaultEndpoint), so this task must not propose or depend on a manifest hardcode.
- Never claim the full chat-completion path works end-to-end through Mastra from this task alone. Confirmed mechanism: probeFleet() in services/platform/src/http/health.ts:205 is the ONLY consumer of process.env.FLEET_URL — it is what this task's /health AC exercises. resolveModel() in services/platform/src/inference/resolve-model.ts:332 uses manifest.json's entry.endpoint via an endpointOverride, and never reads FLEET_URL directly, so real model calls do not reach this router until S33-PLAT-01/02's endpoint-precedence fix lands (mastra-planner's lane, not touched here). This task proves the router itself is live, reachable, and capacity-routes real inference — nothing more.
- Do not remove the inference1-driven curl step from AC-1 to simplify the task — without it, AC-1's multi-node claim is unearned (a fixture-injected or laptop-only proof would satisfy neither the real requirement nor the fakeability gate).
- Never use network disruption, mocked HTTP/SSH/filesystem seams, canned responses, pre-existing log tails, untracked background jobs, ignored curl exit codes, or a runtime skip as proof. Unavailable real dependencies are a blocking failure.
- Never run `docker compose down`, stop or recreate any of the four production services (`postgres`, `mastra`, `scheduler`, `zero-cache`), or write to the protected remote primary checkout. TC-3 may stop only the `litellm-router` service in the exact isolated auxiliary Compose project and must leave that router running and healthy on every exit.

## Acceptance Criteria

### AC-1 — Router deploys on holocron and is reachable across two devices — an external observer AND a real fleet member

- **GIVEN** holocron:44111/health currently reports status 'degraded', fleet.ready:false, endpoint http://host.docker.internal:4545, error 'Unable to connect' (live-verified 2026-08-16 and re-confirmed twice by temporary router smoke tests during planning, each of which flipped it to ok and back to degraded on teardown). Today, nothing on the tailnet — including a real fleet member like inference1 — can reach holocron:4545 either, since nothing listens there. S33-OPS-01 proved Qwen3.8-27B-8bit is served by inference2, while inference1's Qwen3.8 path is absent and inference1 still serves only Qwen3.6-35B-A3B-MLX-8bit.
- **WHEN** `/usr/local/bin/docker compose -f /Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml up -d litellm-router` is run through `ssh holocron` with `reviewer` wired only to inference2's Qwen3.8 backend and `implementer` wired to both minis' Qwen3.6 backends.
- **THEN** The router answers to both the laptop (an external observer) AND inference1 (a real second device inside the fleet, querying holocron:4545 over its own SSH-issued curl) with 'implementer' and 'reviewer'; a real `reviewer` completion reports inference2, never inference1, in `x-litellm-model-api-base`; holocron's own /health endpoint returns status 'ok', fleet.ready:true, failing_dependency:null, with zero restart of the mastra container.
- **Verify:** `bash scripts/verify-s33-router-capacity.sh --mode models-reviewer --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --inference1-host inference1 --evidence-dir .tmp/S33-OPS-02/models-reviewer`
- **Tier:** integration · **Service:** real deployed holocron service /health + LiteLLM router on holocron:4545, confirmed reachable from inference1's own entrypoint · **Flow:** UC-PLAT-05
- **Scenario:** topology `multi-node` · evidence `api_response` · negative control: disconnect, stub

### AC-2 — Capacity/least-busy routing distributes real implementer inference load across BOTH minis

- **GIVEN** The router's 'implementer' model_name has two backends at weight=100: inference1:8003 and inference2:8003, both serving the already-resident real Qwen3.6-35B-A3B-MLX-8bit weights. LiteLLM's response header x-litellm-model-api-base names the exact backend that served each request (confirmed live 2026-08-16 for the 'implementer' model_name, returning x-litellm-model-api-base: http://inference1.tail011a51.ts.net:8003/v1 on a real completion).
- **WHEN** the verifier captures each mini's log baseline and then fires 6 tracked concurrent POST /v1/chat/completions requests at the router for model 'implementer'.
- **THEN** Every tracked request succeeds with a nonempty validated JSON body; per-request headers, bodies, and HTTP statuses are persisted; the x-litellm-model-api-base headers include BOTH http://inference1.tail011a51.ts.net:8003/v1 and http://inference2.tail011a51.ts.net:8003/v1; at least two nonempty response bodies are byte-distinct; and post-baseline log growth read independently through each mini's own SSH entrypoint contains fresh request evidence on both devices. Any missing assertion or evidence exits nonzero.
- **Verify:** `bash scripts/verify-s33-router-capacity.sh --mode implementer-distribution --router-url http://holocron.tail011a51.ts.net:4545 --inference1-host inference1 --inference2-host inference2 --request-count 6 --evidence-dir .tmp/S33-OPS-02/implementer-distribution`
- **Tier:** integration · **Service:** LiteLLM least-busy routing across real inference1+inference2 oMLX · **Flow:** UC-INFER-01
- **Scenario:** topology `multi-node` · evidence `stdout` · negative control: stub, static

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | holocron:44111/health is ready and the laptop-originated models response contains both exact public role IDs | AC-1 | `bash scripts/verify-s33-router-capacity.sh --mode models-reviewer --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --inference1-host inference1 --evidence-dir .tmp/S33-OPS-02/models-reviewer` |
| TC-2 | inference1-originated models contains both public roles and a real reviewer completion succeeds only through inference2 | AC-1 | `bash scripts/verify-s33-router-capacity.sh --mode models-reviewer --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --inference1-host inference1 --evidence-dir .tmp/S33-OPS-02/models-reviewer` |
| TC-3 | a router-only stop produces the exact degraded fleet state, then guaranteed cleanup restores readiness without restarting or changing the deployed Mastra identity | AC-1 | `bash scripts/verify-s33-router-capacity.sh --mode health-flip --holocron-host holocron --remote-compose-file /Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml --remote-docker-bin /usr/local/bin/docker --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --evidence-dir .tmp/S33-OPS-02/health-flip` |
| TC-4 | concurrent `implementer` requests land on both minis' real Qwen3.6 backends, evidenced by tracked response artifacts and fresh post-baseline logs from both devices | AC-2 | `bash scripts/verify-s33-router-capacity.sh --mode implementer-distribution --router-url http://holocron.tail011a51.ts.net:4545 --inference1-host inference1 --inference2-host inference2 --request-count 6 --evidence-dir .tmp/S33-OPS-02/implementer-distribution` |
| TC-5 | the focused integration test executes all three modes against real HTTP, SSH, filesystem, Docker Compose, deployed-service identity, and model-service seams | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/sprint33-ops-02-router-capacity.test.ts` |
| TC-6 | the declared integration test and its evidence contract pass the canonical test-reality audit | AC-2 | `python3 ~/Projects/brain/tools/test-reality/test_reality.py .tmp/S33-OPS-02/reality-spec.json` |

## Fixtures

**`litellm-router-image`** — Pinned LiteLLM proxy image, already pulled on holocron 2026-08-16 during planning verification. _(seed: cli)_

- image=ghcr.io/berriai/litellm@sha256:468c25f35f3e5ec4e414974f00deab93337b1b4d9953cabcfd3722e59415f834

**`mini-backends`** — Real oMLX inventory and role topology after the completed S33-OPS-01 dependency. _(seed: cli)_

- reviewer -> http://inference2.tail011a51.ts.net:8003/v1 -> Qwen3.8-27B-8bit (only reviewer backend)
- implementer -> http://inference1.tail011a51.ts.net:8003/v1 + http://inference2.tail011a51.ts.net:8003/v1 -> Qwen3.6-35B-A3B-MLX-8bit (both backends, weight=100)
- inference1 Qwen3.8 path is absent; no Qwen3.8 copy was attempted because live free disk was below 44 GiB

## Reading List

- `services/platform/deploy/compose/langfuse.compose.yaml` (1-30) — sibling-compose-file pattern to follow (pinned digests, bounded logging, naming)
- `services/platform/deploy/compose/README.md` (1-20,129-160) — four-service contract boundary + loopback port conventions
- `services/platform/src/http/health.ts` (204-230) — probeFleet() — the ONLY FLEET_URL consumer, live-verified as what flips /health
- `services/platform/src/inference/resolve-model.ts` (330-360) — resolveModel() uses manifest.json entry.endpoint via endpointOverride, never FLEET_URL directly — read-only, do not edit
- `services/platform/fleet/manifest.json` (1-98) — litellmModelId values ('implementer','reviewer') the router's model_list must match — read-only, do not edit
- `~/llm-router/config.yaml` (1-140) — existing laptop router's capacity-routing pattern to replicate (weight=100 least-busy)

## Guardrails

**WRITE-ALLOWED**

- scripts/verify-s33-router-capacity.sh (MODIFY verifier modes only)
- tests/integration/sprint33-ops-02-router-capacity.test.ts (MODIFY focused verifier coverage only)
- .tmp/S33-OPS-02/** (NEW real-service evidence and test-reality declaration)

**WRITE-PROHIBITED**

- services/platform/deploy/compose/compose.yaml - four-service contract, not this task's job (see S33-OPS-03)
- services/platform/deploy/compose/router.compose.yaml - deployed auxiliary router definition is read-only during this verifier repair
- services/platform/fleet/manifest.json - mastra-planner's lane
- services/platform/src/** - mastra-planner's lane

## Design

**Pattern** — Auxiliary pinned-digest Docker Compose file alongside compose.yaml, matching langfuse.compose.yaml precedent

_Source:_ `services/platform/deploy/compose/langfuse.compose.yaml:1-30`

**Anti-pattern** — Adding the router as a 5th service inside compose.yaml, breaking the documented and tooling-enforced four-service contract

### Fail-closed verifier contract

`scripts/verify-s33-router-capacity.sh` owns all runtime assertions and emits one final JSON object to stdout plus `<evidence-dir>/result.json`. It must use bounded curl/SSH timeouts, preserve raw captures, and exit nonzero before emitting `ok:true` when any dependency, request, parse, or assertion fails.

- `--mode models-reviewer` must capture the live `/health` JSON and require `status=ok`, `fleet.ready=true`, `failing_dependency=null`; capture and persist a laptop-originated `${router_url}/v1/models` response; independently capture and persist `${router_url}/v1/models` by running curl from inside the real inference1 SSH session; parse each response independently and require both exact public IDs `implementer` and `reviewer` in each; and fail nonzero if either request, parse, or role assertion fails. It must then perform a real `model=reviewer` completion with an HTTP-success status and nonempty parsed `choices[0].message.content`; persist its status, headers, and body; require the exact api-base header `http://inference2.tail011a51.ts.net:8003/v1`; and reject any api-base header containing inference1. Its result JSON records distinct nonempty `laptop_models_artifact_path` and `inference1_models_artifact_path` values, `laptop_models_has_both_roles==true`, `inference1_models_has_both_roles==true`, every other assertion, and every artifact path.
- `--mode implementer-distribution` must record each mini's remote log byte length before sending requests and fail if either baseline cannot be obtained. It then writes each request's unique prompt, PID, HTTP status, headers, and body under `<evidence-dir>/requests/`, waits for every tracked PID with failure propagation, and requires every request to have an HTTP-success status, parseable nonempty body, and nonempty generated content. Across the completed requests it requires exact api-base headers for both minis and at least two byte-distinct nonempty bodies. It reads only bytes added after each captured baseline, fails closed on log truncation/rotation or empty growth, persists each post-baseline segment, and requires fresh chat-completion request evidence in both minis' segments before emitting `ok:true` JSON.
- `--mode health-flip` must accept only the canonical `--holocron-host holocron`, exact `--remote-compose-file /Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml`, exact `--remote-docker-bin /usr/local/bin/docker`, router URL, health URL, and evidence directory declared by TC-3. It must execute remote Docker operations through bounded `ssh holocron`, first require `test -x /usr/local/bin/docker`, validate that the Compose project/service labels resolve to `holocron-router`/`litellm-router` and the exact isolated file, capture the pre-state, and arm an idempotent cleanup trap before mutation. It may issue only a router-scoped `/usr/local/bin/docker compose -f <exact-file> stop litellm-router`; `down`, bare `docker`, and any production-service operation are forbidden. It must poll and persist three real health bodies: pre-stop `status=ok`, `fleet.ready=true`, `failing_dependency=null`; post-stop `status=degraded`, `fleet.ready=false`, `failing_dependency=fleet`; and post-restore `status=ok`, `fleet.ready=true`, `failing_dependency=null`. Cleanup must run on every normal, error, and signal exit, restore only `litellm-router` with `/usr/local/bin/docker compose -f <exact-file> up -d litellm-router`, and wait until Docker reports the router `running` and `healthy` before success. Across the three health bodies it must require the deployed Mastra identity tuple (`host`, `runtime`, `imageDigest`, `sourceRevision`, `composeGeneration`) and PID to remain byte-equivalent, require `uptimeMs` to be monotonic, and capture before/after identities for all four production containers plus the protected remote primary checkout's HEAD/status/hash so any mutation or restart fails closed. Result JSON must include `ok=true`, `mode=health-flip`, `ssh_host=holocron`, `remote_docker_bin=/usr/local/bin/docker`, the exact remote Compose path, `cleanup_restore_armed=true`, `restore_succeeded=true`, the three health assertions, `deployment_identity_unchanged=true`, `deployment_pid_unchanged=true`, `deployment_uptime_monotonic=true`, `production_service_identities_unchanged=true`, `remote_primary_unchanged=true`, and final router `state=running`, `health=healthy`, with nonempty artifact entries for every capture.
- `--negative-control fail-after-stop` is valid only with `--mode health-flip` and the same exact canonical arguments. After the real router-only stop and exact degraded assertions, it must record the intentional failure trigger, enter the already-armed cleanup, restore/poll/assert the same final health/router/identity/uptime/production/primary state, write nonempty `failure.json` and cleanup artifacts, and exit nonzero without emitting `ok=true`. `failure.json` must record `ok=false`, `mode=health-flip`, `negative_control=fail-after-stop`, `intentional_failure_observed=true`, `cleanup_restore_armed=true`, `cleanup_restore_attempted=true`, `restore_succeeded=true`, restored `status=ok`, `fleet.ready=true`, `failing_dependency=null`, unchanged identity/sentinel booleans, and final router `state=running`, `health=healthy`. The flag must be rejected before mutation for every other mode or value.
- `tests/integration/sprint33-ops-02-router-capacity.test.ts` must execute all three exact modes against the real deployed router, deployed Mastra service, and minis, assert their nonzero-on-missing-evidence behavior, and validate their emitted result JSON and artifact manifests. For `models-reviewer`, the test must independently read both persisted models artifacts, require both role IDs in each, and require both corresponding result booleans to equal true; removing or weakening either the laptop or inference1 oracle must fail the test. For `health-flip`, it must assert the exact pre/degraded/restored health triplet, unchanged Mastra identity/PID, monotonic uptime, unchanged four-service and protected-primary sentinels, a cleanup trap armed before mutation, and a final running/healthy router. It must then execute the exact normal command plus `--negative-control fail-after-stop --evidence-dir .tmp/S33-OPS-02/health-flip-negative`, assert the command exits nonzero, validate every required `failure.json` field, and independently issue a fresh health request plus `/usr/local/bin/docker` inspect through `ssh holocron` to require restored `ok/true/null` and router `running/healthy` before the test continues. It must not mock fetch, child processes, SSH, filesystem, Docker Compose, LiteLLM, or oMLX; it must not skip when a real dependency is absent.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| router config renders | `docker compose -f services/platform/deploy/compose/router.compose.yaml config --quiet` | Exit 0 |
| health, both observer role lists, reviewer backend | `bash scripts/verify-s33-router-capacity.sh --mode models-reviewer --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --inference1-host inference1 --evidence-dir .tmp/S33-OPS-02/models-reviewer` | Exit 0; JSON `ok:true`; health ready; distinct nonempty `laptop_models_artifact_path` and `inference1_models_artifact_path` captures each contain both exact role IDs and set their corresponding both-role boolean true; reviewer HTTP/body valid; api-base is inference2 and not inference1 |
| router-only health flip and guaranteed restore | `bash scripts/verify-s33-router-capacity.sh --mode health-flip --holocron-host holocron --remote-compose-file /Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml --remote-docker-bin /usr/local/bin/docker --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --evidence-dir .tmp/S33-OPS-02/health-flip` | Exit 0; pre ok/ready/null; router-only stop yields degraded/false/fleet; cleanup restores ok/ready/null; Mastra identity/PID unchanged and uptime monotonic; production/primary sentinels unchanged; router running/healthy at exit |
| cleanup negative control bites and independently restores | `if bash scripts/verify-s33-router-capacity.sh --mode health-flip --holocron-host holocron --remote-compose-file /Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml --remote-docker-bin /usr/local/bin/docker --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --negative-control fail-after-stop --evidence-dir .tmp/S33-OPS-02/health-flip-negative; then exit 1; fi && jq -e '.ok == false and .mode == "health-flip" and .negative_control == "fail-after-stop" and .intentional_failure_observed == true and .cleanup_restore_armed == true and .cleanup_restore_attempted == true and .restore_succeeded == true and .restored_health.status == "ok" and .restored_health.fleet.ready == true and .restored_health.failing_dependency == null and .final_router.state == "running" and .final_router.health == "healthy"' .tmp/S33-OPS-02/health-flip-negative/failure.json >/dev/null && curl -fsS https://holocron.tail011a51.ts.net:44111/health | jq -e '.status == "ok" and .fleet.ready == true and .failing_dependency == null' >/dev/null && ssh holocron '/usr/local/bin/docker inspect "$(/usr/local/bin/docker compose -f /Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml ps -q litellm-router)"' | jq -e '.[0].State.Status == "running" and .[0].State.Health.Status == "healthy"' >/dev/null` | Intentional verifier exit is nonzero; failure.json proves the real stop/degraded/cleanup path; independent fresh HTTP and absolute-Docker SSH oracles prove restored readiness and router health |
| implementer two-mini distribution | `bash scripts/verify-s33-router-capacity.sh --mode implementer-distribution --router-url http://holocron.tail011a51.ts.net:4545 --inference1-host inference1 --inference2-host inference2 --request-count 6 --evidence-dir .tmp/S33-OPS-02/implementer-distribution` | Exit 0; JSON `ok:true`; all requests tracked; both api-base hostnames; >=2 distinct nonempty bodies; fresh post-baseline request evidence on each mini |
| focused real integration test | `PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/sprint33-ops-02-router-capacity.test.ts` | Exit 0 against real HTTP, SSH, filesystem, LiteLLM, and oMLX seams; absence fails, never skips |
| test-reality fakeability audit | `python3 ~/Projects/brain/tools/test-reality/test_reality.py .tmp/S33-OPS-02/reality-spec.json` | Reports REAL for the focused integration test and all three verifier modes |

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
      "description": "Real oMLX inventory and role topology after the completed S33-OPS-01 dependency.",
      "seed_method": "cli",
      "records": [
        "reviewer -> http://inference2.tail011a51.ts.net:8003/v1 -> Qwen3.8-27B-8bit (only reviewer backend)",
        "implementer -> http://inference1.tail011a51.ts.net:8003/v1 + http://inference2.tail011a51.ts.net:8003/v1 -> Qwen3.6-35B-A3B-MLX-8bit (both backends, weight=100)",
        "inference1 Qwen3.8 path is absent; no Qwen3.8 copy was attempted because live free disk was below 44 GiB"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the deployed service reports fleet unreachable and Qwen3.8 exists only on inference2 WHEN the packaged router is deployed on holocron THEN /health flips to ok/fleet.ready with zero mastra restart, laptop-originated and inference1-originated models responses independently contain both exact public role IDs, and reviewer completions identify inference2 rather than inference1",
      "verify": "bash scripts/verify-s33-router-capacity.sh --mode models-reviewer --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --inference1-host inference1 --evidence-dir .tmp/S33-OPS-02/models-reviewer",
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
                "run /usr/local/bin/docker compose -f /Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml up -d litellm-router through ssh holocron",
                "run scripts/verify-s33-router-capacity.sh in models-reviewer mode with bounded HTTP/SSH timeouts and a dedicated .tmp/S33-OPS-02 evidence directory",
                "capture live /health, capture and persist a laptop-originated router /v1/models response, and independently capture and persist /v1/models from inference1's own SSH-issued curl",
                "parse both models responses independently and require both exact public role IDs implementer and reviewer in each; fail nonzero if either request, parse, or assertion fails",
                "send a real reviewer completion through holocron:4545, require HTTP success plus a nonempty parsed generated body, and persist status, headers, body, and result JSON"
              ]
            },
            "end_state": {
              "must_observe": [
                "/v1/models response (from the laptop) contains both 'implementer' and 'reviewer'",
                "the laptop-originated models response and inference1-originated models response are persisted as separate nonempty artifacts",
                "/health status=='ok'",
                "/health fleet.ready==true and fleet.latency_ms>=1",
                "/health failing_dependency==null",
                "inference1's own curl (issued from inference1 itself over SSH, not the laptop) to holocron:4545/v1/models returns a response containing both 'implementer' and 'reviewer'",
                "reviewer completion returns an HTTP-success status and nonempty choices[0].message.content",
                "reviewer completion x-litellm-model-api-base == 'http://inference2.tail011a51.ts.net:8003/v1'",
                "result.json has ok==true, mode=='models-reviewer', laptop_models_has_both_roles==true, inference1_models_has_both_roles==true, distinct nonempty laptop_models_artifact_path and inference1_models_artifact_path values, and every named artifact has exists==true and byte_length>=1"
              ],
              "must_not_observe": [
                "/health status=='degraded'",
                "/health fleet.error field present",
                "/health fleet contains 0 reachable endpoints (the pre-fix failure signature)",
                "inference1's own curl to holocron:4545 timing out or returning 0 bytes (would mean the router is unreachable from within the fleet, not only from the laptop)",
                "inference1-originated /v1/models omits either public role name",
                "laptop-originated /v1/models request or parse fails, returns 0 bytes, or omits either public role name",
                "either models artifact path is absent, identical to the other path, or names an empty file",
                "reviewer completion has a non-success HTTP status or an empty/unparseable generated body",
                "reviewer completion x-litellm-model-api-base contains inference1.tail011a51.ts.net (the backend has 0 Qwen3.8 model files)"
              ]
            }
          },
          {
            "start_ref": "litellm-router-image",
            "action": {
              "actor": "devops-engineer",
              "steps": [
                "run scripts/verify-s33-router-capacity.sh in health-flip mode from the task worktree, targeting the canonical ssh holocron destination and exact remote isolated Compose file /Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml",
                "capture the pre-stop health body, Mastra deployment identity and PID, four production-container identities, protected remote primary HEAD/status/hash, and auxiliary router Compose labels; require pre-stop status=ok, fleet.ready=true, failing_dependency=null, and executable /usr/local/bin/docker through non-interactive ssh holocron",
                "arm an idempotent cleanup trap before mutation, then execute only /usr/local/bin/docker compose -f <exact-remote-compose-file> stop litellm-router through bounded ssh holocron; never run down, use bare docker, or address postgres, mastra, scheduler, or zero-cache",
                "poll and persist the post-stop health body until status=degraded, fleet.ready=false, and failing_dependency=fleet are observed",
                "restore litellm-router through the armed cleanup path, poll until the router is running and healthy, persist the restored health body, and compare every identity/uptime/primary-checkout sentinel before emitting ok=true",
                "in the focused integration test, rerun health-flip with --negative-control fail-after-stop and a separate evidence directory; assert intentional nonzero, validate failure.json, then independently re-read /health and inspect the router through ssh holocron plus /usr/local/bin/docker before continuing"
              ]
            },
            "end_state": {
              "must_observe": [
                "pre-stop /health has status=='ok', fleet.ready==true, and failing_dependency==null",
                "router-only stop produces /health status=='degraded', fleet.ready==false, and failing_dependency=='fleet'",
                "cleanup restores /health status=='ok', fleet.ready==true, and failing_dependency==null",
                "comparison records deployment_identity_unchanged==true, deployment_pid_unchanged==true, and deployment_uptime_monotonic==true across all three captures",
                "comparison records production_service_identities_unchanged==true for exactly 4 production containers and remote_primary_unchanged==true for the protected checkout HEAD/status/hash",
                "final auxiliary router state=='running' and health=='healthy'",
                "result.json has ok==true, mode=='health-flip', ssh_host=='holocron', remote_docker_bin=='/usr/local/bin/docker', cleanup_restore_armed==true, restore_succeeded==true, deployment_identity_unchanged==true, deployment_pid_unchanged==true, deployment_uptime_monotonic==true, production_service_identities_unchanged==true, and remote_primary_unchanged==true",
                "the fail-after-stop invocation exits nonzero after writing failure.json with intentional_failure_observed==true, cleanup_restore_attempted==true, restore_succeeded==true, and final router state=='running'/health=='healthy'; an independent fresh oracle confirms restored status=='ok', fleet.ready==true, and failing_dependency==null"
              ],
              "must_not_observe": [
                "/health remaining status=='ok' after the router-only stop or showing 0 change from the pre-stop reading",
                "the cleanup path is absent, unarmed before mutation, or exits with an empty/unhealthy router state",
                "docker compose down, a production-service stop/recreate, or any protected remote primary checkout mutation",
                "Mastra deployment identity or pid changes, uptimeMs regresses, or any production-container identity changes",
                "fail-after-stop returns exit 0, emits ok==true, omits failure.json, or leaves the router stopped/unhealthy",
                "any non-interactive SSH command relies on bare docker instead of /usr/local/bin/docker"
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
      "description": "GIVEN both minis serve the implementer role with real Qwen3.6 backends WHEN the verifier captures per-mini log baselines and routes tracked concurrent implementer requests THEN every request succeeds with persisted evidence, both backend headers occur, at least two nonempty bodies differ, and fresh post-baseline request evidence exists on both minis",
      "verify": "bash scripts/verify-s33-router-capacity.sh --mode implementer-distribution --router-url http://holocron.tail011a51.ts.net:4545 --inference1-host inference1 --inference2-host inference2 --request-count 6 --evidence-dir .tmp/S33-OPS-02/implementer-distribution",
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
                "capture each mini's remote oMLX log byte length before requests and record the test window; fail if either baseline is unavailable",
                "fire 6 uniquely identified concurrent model=implementer requests, persist every PID/status/header/body, and wait for every tracked PID with failure propagation",
                "read and persist only each mini's post-baseline log growth through its own SSH entrypoint; fail on truncation, rotation, empty growth, or missing fresh request evidence"
              ]
            },
            "end_state": {
              "must_observe": [
                "x-litellm-model-api-base header values across the 6 responses include both 'http://inference1.tail011a51.ts.net:8003/v1' and 'http://inference2.tail011a51.ts.net:8003/v1'",
                "all 6 tracked requests have an HTTP-success status, parseable nonempty response body, and nonempty generated content",
                "inference1's persisted post-baseline log segment contains fresh chat-completion request evidence from the test window",
                "inference2's persisted post-baseline log segment contains fresh chat-completion request evidence from the test window",
                "at least 2 byte-distinct nonempty response bodies among the 6 (proves real generation, not a canned static reply)",
                "result.json has ok==true, mode=='implementer-distribution', request_count==6, inference1.fresh_request_count>=1, and inference2.fresh_request_count>=1"
              ],
              "must_not_observe": [
                "all 6 x-litellm-model-api-base values identical (proves single-node pinning, not capacity routing)",
                "any background request exits without its failure propagating to the verifier",
                "either mini has no post-baseline log growth or no fresh request evidence",
                "0 of the 6 responses show either required mini hostname as the api-base value",
                "fewer than 2 distinct nonempty response bodies"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "health flips to ok and the separately persisted laptop-originated models response contains both exact public role IDs",
      "maps_to_ac": "AC-1",
      "verify": "bash scripts/verify-s33-router-capacity.sh --mode models-reviewer --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --inference1-host inference1 --evidence-dir .tmp/S33-OPS-02/models-reviewer"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "inference1-originated models contains both public roles and reviewer completes only through inference2",
      "maps_to_ac": "AC-1",
      "verify": "bash scripts/verify-s33-router-capacity.sh --mode models-reviewer --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --inference1-host inference1 --evidence-dir .tmp/S33-OPS-02/models-reviewer"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "the canonical ssh holocron health-flip verifier stops only the isolated auxiliary router, proves the exact degraded fleet state, and guarantees restoration while Mastra identity/PID and production/primary sentinels remain unchanged",
      "maps_to_ac": "AC-1",
      "verify": "bash scripts/verify-s33-router-capacity.sh --mode health-flip --holocron-host holocron --remote-compose-file /Users/holocron/Projects/holocron/.kb-run-sprint/worktrees/S33-OPS-02/services/platform/deploy/compose/router.compose.yaml --remote-docker-bin /usr/local/bin/docker --router-url http://holocron.tail011a51.ts.net:4545 --health-url https://holocron.tail011a51.ts.net:44111/health --evidence-dir .tmp/S33-OPS-02/health-flip"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "tracked concurrent implementer requests prove both real Qwen3.6 backends through exact headers, distinct nonempty bodies, and fresh post-baseline logs on both minis",
      "maps_to_ac": "AC-2",
      "verify": "bash scripts/verify-s33-router-capacity.sh --mode implementer-distribution --router-url http://holocron.tail011a51.ts.net:4545 --inference1-host inference1 --inference2-host inference2 --request-count 6 --evidence-dir .tmp/S33-OPS-02/implementer-distribution"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "the focused integration test executes all three verifier modes against real services, independently checks both persisted models artifacts and role booleans, proves the health-flip cleanup path plus exact state/identity oracles, and fails rather than skips when any observer oracle, dependency, cleanup, or evidence is missing",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration tests/integration/sprint33-ops-02-router-capacity.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "the focused real integration test and verifier evidence contract pass the canonical test-reality audit",
      "maps_to_ac": "AC-2",
      "verify": "python3 ~/Projects/brain/tools/test-reality/test_reality.py .tmp/S33-OPS-02/reality-spec.json"
    }
  ]
}
-->
