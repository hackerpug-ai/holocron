# FUL-INFRA-002 — Embed the Fulcrum LiteLLM router in the platform image

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** B
> **Assignee:** devops-engineer · **Reviewer:** devops-engineer (peer) + mastra-reviewer
> **Priority:** P0 · **Points:** 5 · **Type:** FEATURE
> **Proposed by:** devops-engineer
> **TDD mode:** `skipped` · **RED_GREEN_REQUIRED:** no
> Status: Backlog

## What this does

Ship a loopback-only LiteLLM router with the platform image that load-balances the three Fulcrum roles across both minis and returns router-truthful identity headers.

## Why

A real chat completion issued to `http://127.0.0.1:4547/v1` from the mastra container returns 200 with `x-litellm-model-id` equal to one of the six pinned deployment ids, `GET /model/info` lists all six deployments with the two mini api-bases, a stopped mini is transparently covered by the other, and no mini hostname appears in Fulcrum cycle code.

## How to verify

Primary acceptance criterion **AC-1** (integration tier, service: LiteLLM 1.91.0 fulcrum-router container on 127.0.0.1:4547 fronting oMLX on inference1 and inference2):

```
pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-1' 2>&1 | grep -E 'x-litellm-model-id=divergent-inference(1|2)'
```

Full gate set: 5 acceptance criteria, 7 test criteria, 5 verification gates.

## Scope

- services/platform/deploy/compose/fulcrum-router.config.yaml
- services/platform/deploy/compose/compose.yaml
- services/platform/deploy/compose/compose.dev.yaml
- services/platform/deploy/compose/image-lock.json
- services/platform/Dockerfile
- services/platform/src/inference/fulcrum-router.ts
- services/platform/src/cli/commands/fulcrum-router-check.ts
- services/platform/src/cli/holo.ts
- services/platform/tests/integration/fulcrum-router-image.test.ts

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-INFRA-002 - Embed the Fulcrum LiteLLM router in the platform image
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     5
AGENT:      implementer=devops-engineer | reviewer=devops-engineer (peer) + mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave B)
PROPOSED_BY:devops-engineer
TDD_MODE:   skipped
RED_GREEN_REQUIRED: no

RUNTIME_COMMANDS:
  test:      pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error

PROGRESS: 0/5 ACs complete

--------------------------------------------------------------------------------
OUTCOME (observable success)
--------------------------------------------------------------------------------

A real chat completion issued to `http://127.0.0.1:4547/v1` from the mastra container returns 200 with `x-litellm-model-id` equal to one of the six pinned deployment ids, `GET /model/info` lists all six deployments with the two mini api-bases, a stopped mini is transparently covered by the other, and no mini hostname appears in Fulcrum cycle code.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: MUST declare exactly 6 `model_list` rows — one per role per mini — each at `weight: 100` with `model_info.id` set to `{role}-{node}`, and `router_settings` `least-busy` / `num_retries: 2` / `timeout: 600` / `cooldown_time: 60`
- MUST: MUST bind the router to container loopback only and reach the minis at `http://inference1.tail011a51.ts.net:8003/v1` and `http://inference2.tail011a51.ts.net:8003/v1`
- MUST: MUST record the pinned LiteLLM image digest and the router config sha256 in `services/platform/deploy/compose/image-lock.json` so the binding is digest-protected across image builds
- NEVER: NEVER disconnect any host from the internet, disable Wi-Fi, change network settings, or toggle a network interface; failover and outage cases in this task are produced by stopping oMLX on a mini and restarting it (AGENTS.md Network Continuity)
- NEVER: NEVER publish the Fulcrum router port on `0.0.0.0` or add it to the edge proxy; it is a loopback dependency of the mastra service only
- NEVER: NEVER add `judge`, `reviewer`, `implementer`, `orchestrator`, `qwen-coder`, `verifier`, or the laptop endpoint to the Fulcrum router `model_list`
- NEVER: NEVER place an API key, Tailscale key, or password value in the router config or compose file; use the credential-bearing names already indexed in `AGENTS.md`
- STRICTLY: STRICTLY leave `services/platform/deploy/compose/router.compose.yaml` (the coder router on `:4545`) untouched; the Fulcrum router is a separate, additional deployment unit
- STRICTLY: STRICTLY keep the loopback base URL as the only endpoint literal reachable from cycle code; no host, port, or device key may be introduced under `services/platform/src/mission/` or `services/platform/src/research/`

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-INFER-01
provides:             fulcrum-loopback-router-base-url, fulcrum-router-model-info-ids, fulcrum-router-header-truth-contract
consumes:             fulcrum-role-set-on-both-minis, fulcrum-expected-role-manifest
boundary_contracts:
  - PROVIDES to FUL-PLAT-007 and FUL-PLAT-008: Fulcrum dials exactly one endpoint, `http://127.0.0.1:4547/v1`, inside the container; no mini hostname, no `:4545`, and no per-device endpoint key exists in cycle code
  - PROVIDES to FUL-PLAT-007: `GET http://127.0.0.1:4547/model/info` lists one deployment per role per mini with stable `model_info.id` values `divergent-inference1`, `divergent-inference2`, `convergent-inference1`, `convergent-inference2`, `embed-inference1`, `embed-inference2`
  - PROVIDES to FUL-PLAT-007: every Fulcrum completion response carries `x-litellm-model-api-base` and `x-litellm-model-id`; the response body `model` field is never an identity source because LiteLLM 1.91.0 rewrites it to the requested alias
  - CONSUMES from FUL-INFRA-001: role name to oMLX basename bindings come from `services/platform/deploy/fleet/fulcrum-roles.json`, never a second vocabulary
  - The Fulcrum router listens on container loopback only and is never published on `0.0.0.0`

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): A real completion through the loopback router is served by a mini [PRIMARY]
- [ ] AC-2: The router declares six deployments across both minis and both minis really serve them
- [ ] AC-3: A stopped mini is covered by the other without a config change
- [ ] AC-4: With no backend the router fails closed and no cloud endpoint is contacted
- [ ] AC-5: Cycle code carries no per-device endpoint, only the loopback base URL
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: A real completion through the loopback router is served by a mini [PRIMARY] [PRIMARY]
  GIVEN: GIVEN the compose stack is up with the Fulcrum router on container loopback and both minis serving
  WHEN:  WHEN a real chat completion for model `divergent` is POSTed to `http://127.0.0.1:4547/v1/chat/completions` from inside the mastra container
  THEN:  THEN the response is 200 and carries `x-litellm-model-api-base` naming a mini `:8003/v1` endpoint and `x-litellm-model-id` equal to a pinned deployment id

  TEST_TIER:            integration
  VERIFICATION_SERVICE: LiteLLM 1.91.0 fulcrum-router container on 127.0.0.1:4547 fronting oMLX on inference1 and inference2
  FLOW_REF:             UC-LIS-01 / T-LIS-001, T-LIS-002
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-1' 2>&1 | grep -E 'x-litellm-model-id=divergent-inference(1|2)'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          LiteLLM 1.91.0 fulcrum-router container on 127.0.0.1:4547 fronting oMLX on inference1 and inference2
    NEGATIVE_CONTROL: would fail if the router config is absent so the loopback connect is refused and no completion returns; identity is read from the response body `model` field, which LiteLLM rewrites to the requested alias and is therefore static; the completion is served by a stubbed local echo endpoint instead of a real mini
    EVIDENCE:         api_response (required_capture=True)
    CASES:
      - START_REF: stack_with_fulcrum_router
        ACTOR:     api_client
        STEP:      run `docker compose -f services/platform/deploy/compose/compose.yaml up -d fulcrum-router mastra`
        STEP:      run `docker compose exec mastra curl -sS -D /tmp/h.txt http://127.0.0.1:4547/v1/chat/completions -H 'content-type: application/json' -d '{"model":"divergent","messages":[{"role":"user","content":"Reply with the single word ready"}],"max_tokens":8}'`
        STEP:      print the captured response headers from /tmp/h.txt
        MUST_OBSERVE:     `HTTP/1.1 200 OK`
        MUST_OBSERVE:     `x-litellm-model-id=divergent-inference1` or `x-litellm-model-id=divergent-inference2`
        MUST_OBSERVE:     `x-litellm-model-api-base=http://inference1.tail011a51.ts.net:8003/v1` or `x-litellm-model-api-base=http://inference2.tail011a51.ts.net:8003/v1`
        MUST_OBSERVE:     a `choices[0].message.content` string of length `1` or more
        MUST_NOT_OBSERVE: `Connection refused` on 127.0.0.1:4547
        MUST_NOT_OBSERVE: an empty `x-litellm-model-id` header
        MUST_NOT_OBSERVE: `x-litellm-model-api-base=http://laptop.tail011a51.ts.net:8003/v1`

AC-2: The router declares six deployments across both minis and both minis really serve them
  GIVEN: GIVEN the Fulcrum router config carries one row per role per mini at weight 100
  WHEN:  WHEN `GET http://127.0.0.1:4547/model/info` is read and each mini's own `:8003/v1/models` endpoint is read
  THEN:  THEN the six pinned deployment ids are listed against the two mini api-bases and both nodes really serve the basenames those rows name

  TEST_TIER:            integration
  VERIFICATION_SERVICE: LiteLLM 1.91.0 fulcrum-router /model/info plus oMLX :8003 on inference1 and inference2
  FLOW_REF:             UC-LIS-01 / ADR-007 load-balancing
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-2' 2>&1 | grep -F 'deployments=6 nodes=inference1,inference2 strategy=least-busy'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         multi-node
    SERVICE:          LiteLLM 1.91.0 fulcrum-router /model/info plus oMLX :8003 on inference1 and inference2
    NEGATIVE_CONTROL: would fail if the config declares one row per role, so only a single backend exists and the deployment count is 3; the deployment list is a static expectation never compared with the real /model/info response; the second real node is never contacted, so rows naming it can be empty promises
    EVIDENCE:         api_response (required_capture=True)
    CASES:
      - START_REF: stack_with_fulcrum_router
        ACTOR:     api_client
        STEP:      run `docker compose exec mastra curl -sS http://127.0.0.1:4547/model/info`
        STEP:      run `ssh inference1 'curl -sS http://127.0.0.1:8003/v1/models'` so the first real node answers through its own entrypoint
        STEP:      run `ssh inference2 'curl -sS http://127.0.0.1:8003/v1/models'` so the second real node answers through its own entrypoint
        STEP:      compare the api-base of every /model/info row against the ids both nodes actually serve
        MUST_OBSERVE:     `deployments=6 nodes=inference1,inference2 strategy=least-busy`
        MUST_OBSERVE:     `convergent-inference2 -> http://inference2.tail011a51.ts.net:8003/v1`
        MUST_OBSERVE:     `embed-inference1 -> http://inference1.tail011a51.ts.net:8003/v1`
        MUST_OBSERVE:     `num_retries=2 timeout=600 cooldown_time=60`
        MUST_OBSERVE:     `served_by_inference1=3 served_by_inference2=3`
        MUST_NOT_OBSERVE: `deployments=3`
        MUST_NOT_OBSERVE: `served_by_inference2=0`
        MUST_NOT_OBSERVE: an empty `data` array from either node

AC-3: A stopped mini is covered by the other without a config change
  GIVEN: GIVEN both minis are serving and the router config is unchanged
  WHEN:  WHEN oMLX on `inference1` is stopped over SSH and a `convergent` completion is issued through the loopback router
  THEN:  THEN the completion returns 200 served by `convergent-inference2`, and after `inference1` is restarted a later completion can be served by `convergent-inference1`

  TEST_TIER:            integration
  VERIFICATION_SERVICE: LiteLLM 1.91.0 fulcrum-router with a real oMLX service stop on inference1
  FLOW_REF:             UC-LIS-04 / T-LIS-015
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-3' 2>&1 | grep -F 'during_outage=convergent-inference2 after_restore=convergent-inference1'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         multi-node
    SERVICE:          LiteLLM 1.91.0 fulcrum-router with a real oMLX service stop on inference1
    NEGATIVE_CONTROL: would fail if cooldown is absent so the router keeps selecting the stopped backend and the completion is never served; the served-backend value is a static string rather than the real x-litellm-model-id header of each call; the second real node is never driven, so failover coverage is assumed rather than observed
    EVIDENCE:         api_response (required_capture=True)
    CASES:
      - START_REF: stack_with_inference1_stopped
        ACTOR:     api_client
        STEP:      run `ssh inference1 'pkill -f "omlx serve"'` to stop the real service on the first node, changing no network setting
        STEP:      run `docker compose exec mastra curl -sS -D - http://127.0.0.1:4547/v1/chat/completions -H 'content-type: application/json' -d '{"model":"convergent","messages":[{"role":"user","content":"Reply with the single word ready"}],"max_tokens":8}'` and record x-litellm-model-id
        STEP:      run `ssh inference1 'bash ~/start-omlx-node.sh'` to restore the first real node through its own entrypoint
        STEP:      wait for cooldown_time 60 seconds, then repeat the completion until x-litellm-model-id names the restored node
        MUST_OBSERVE:     `during_outage=convergent-inference2 after_restore=convergent-inference1`
        MUST_OBSERVE:     `status_during_outage=200`
        MUST_OBSERVE:     `completions_served=2`
        MUST_NOT_OBSERVE: `status_during_outage=500`
        MUST_NOT_OBSERVE: `completions_served=0`
        MUST_NOT_OBSERVE: an empty `x-litellm-model-id` header on either call

AC-4: With no backend the router fails closed and no cloud endpoint is contacted
  GIVEN: GIVEN oMLX is stopped on both minis and `FULCRUM_CLOUD_FALLBACK` is off
  WHEN:  WHEN a `divergent` completion is issued through the loopback router
  THEN:  THEN the router returns an explicit no-host error naming the requested model and no cloud host is contacted

  TEST_TIER:            integration
  VERIFICATION_SERVICE: LiteLLM 1.91.0 fulcrum-router with oMLX stopped on both minis
  FLOW_REF:             UC-LIS-04 / T-LIS-016, T-LIS-019
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-4' 2>&1 | grep -F 'status=503 error_names=divergent cloud_hosts_contacted=0'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             holdout
    TOPOLOGY:         multi-node
    SERVICE:          LiteLLM 1.91.0 fulcrum-router with oMLX stopped on both minis
    NEGATIVE_CONTROL: would fail if a cloud provider row is present in the config, so the call silently succeeds while both minis are stopped; the failure is a generic empty timeout that never names the requested model; only the first node is stopped and the second real node quietly serves the call
    EVIDENCE:         api_response (required_capture=True)
    CASES:
      - START_REF: stack_with_both_minis_stopped
        ACTOR:     api_client
        STEP:      run `ssh inference1 'pkill -f "omlx serve"'` to stop the real service on the first node
        STEP:      run `ssh inference2 'pkill -f "omlx serve"'` to stop the real service on the second real node, changing no network setting on either host
        STEP:      run `docker compose exec mastra curl -sS -o /tmp/b.json -w 'status=%{http_code}' http://127.0.0.1:4547/v1/chat/completions -H 'content-type: application/json' -d '{"model":"divergent","messages":[{"role":"user","content":"ping"}]}'`
        STEP:      run `docker compose logs fulcrum-router --since 2m | grep -ci 'api.openai.com\|api.anthropic.com\|api.deepseek.com'`
        STEP:      restore both nodes with `ssh inference1 'bash ~/start-omlx-node.sh'` and `ssh inference2 'bash ~/start-omlx-node.sh'`
        MUST_OBSERVE:     `status=503 error_names=divergent cloud_hosts_contacted=0`
        MUST_OBSERVE:     `"error"` body containing the literal `divergent`
        MUST_NOT_OBSERVE: `status=200`
        MUST_NOT_OBSERVE: `cloud_hosts_contacted=1`
        MUST_NOT_OBSERVE: an empty error body with no model name

AC-5: Cycle code carries no per-device endpoint, only the loopback base URL
  GIVEN: GIVEN the router config, compose entry, Dockerfile copy, and loopback constant have landed
  WHEN:  WHEN the repository is scanned for mini hostnames, the coder router port, and the deleted base-URL key under the Fulcrum cycle paths
  THEN:  THEN the scan finds 0 per-device endpoint references in cycle code and exactly 1 loopback base URL constant

  TEST_TIER:            integration
  VERIFICATION_SERVICE: Real repository worktree scanned with git grep over services/platform/src
  FLOW_REF:             UC-LIS-01 / T-LIS-004
  TDD_STATE:            none
  VERIFY:               pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-5' 2>&1 | grep -F 'cycle_device_refs=0 loopback_base_urls=1'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          Real repository worktree scanned with git grep over services/platform/src
    NEGATIVE_CONTROL: would fail if the mini hostnames are hardcoded in cycle code, so the deleted per-device config survives under a new name; the scan globs a directory that does not exist, so the tally is empty for a reason unrelated to the code; the loopback constant is absent and the base URL is read from a mutable operator environment key
    EVIDENCE:         stdout (required_capture=True)
    CASES:
      - START_REF: repo_worktree_after_router_wiring
        ACTOR:     cli_user
        STEP:      run `git grep -c -E 'inference[12]\.tail011a51\.ts\.net|127\.0\.0\.1:4545|FULCRUM_INFERENCE_BASE_URL|FULCRUM_ROLE_MAP' -- services/platform/src/mission services/platform/src/research | wc -l`
        STEP:      run `git grep -c -F 'http://127.0.0.1:4547/v1' -- services/platform/src/inference/fulcrum-router.ts`
        STEP:      run `git grep -c -F 'inference1.tail011a51.ts.net' -- services/platform/deploy/compose/fulcrum-router.config.yaml`
        MUST_OBSERVE:     `cycle_device_refs=0 loopback_base_urls=1`
        MUST_OBSERVE:     `services/platform/deploy/compose/fulcrum-router.config.yaml:3` mini hostname rows
        MUST_OBSERVE:     `services/platform/src/inference/fulcrum-router.ts:1` loopback constant
        MUST_NOT_OBSERVE: `loopback_base_urls=0`
        MUST_NOT_OBSERVE: `FULCRUM_INFERENCE_BASE_URL` under `services/platform/src/mission`
        MUST_NOT_OBSERVE: an empty scan target list

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | The completion response carries an `x-litellm-model-id` header matching `divergent-inference1` or `divergent-inference2` when the loopback router is dialed. | AC-1 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-1' 2>&1 \| grep -E 'x-litellm-model-id=divergent-inference(1\|2)'` |
| TC-2 | The completion response omits any api-base naming the laptop when the loopback router is dialed. | AC-1 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-1' 2>&1 \| grep -cF 'laptop.tail011a51.ts.net' \| grep -x '0'` |
| TC-3 | The `/model/info` response lists `deployments=6` when the router config is loaded. | AC-2 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-2' 2>&1 \| grep -F 'deployments=6'` |
| TC-4 | The router settings report `num_retries=2 timeout=600 cooldown_time=60` when `/model/info` is read. | AC-2 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-2' 2>&1 \| grep -F 'num_retries=2 timeout=600 cooldown_time=60'` |
| TC-5 | The outage completion reports `during_outage=convergent-inference2` when oMLX on `inference1` is stopped. | AC-3 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-3' 2>&1 \| grep -F 'during_outage=convergent-inference2'` |
| TC-6 | The router reports `cloud_hosts_contacted=0` when oMLX is stopped on both minis. | AC-4 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-4' 2>&1 \| grep -F 'cloud_hosts_contacted=0'` |
| TC-7 | The repository scan reports `cycle_device_refs=0 loopback_base_urls=1` when run over `services/platform/src`. | AC-5 | `pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-5' 2>&1 \| grep -F 'cycle_device_refs=0 loopback_base_urls=1'` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/deploy/compose/fulcrum-router.config.yaml
- services/platform/deploy/compose/compose.yaml
- services/platform/deploy/compose/compose.dev.yaml
- services/platform/deploy/compose/image-lock.json
- services/platform/Dockerfile
- services/platform/src/inference/fulcrum-router.ts
- services/platform/src/cli/commands/fulcrum-router-check.ts
- services/platform/src/cli/holo.ts
- services/platform/tests/integration/fulcrum-router-image.test.ts

writeProhibited:
- services/platform/deploy/compose/router.compose.yaml — the coder router on :4545 stays untouched
- services/platform/src/mission/** — FUL-PLAT-005 owns the mission contract in this same wave
- services/platform/src/research/** — FUL-PLAT-002 owns admission in this same wave
- services/platform/deploy/fleet/** — FUL-INFRA-001 owns the role expectation file
- services/platform/src/db/** — FUL-PLAT-001 owns the ledger
- .spec/** — the orchestrator owns sprint artifacts
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: services/platform/deploy/compose/router.compose.yaml:12

Sidecar LiteLLM router joined to the application container's network namespace so the application dials it on 127.0.0.1, with the model_list and router_settings carried as a checked-in config file copied into the image and hashed in image-lock.json.

ANTI-PATTERN: Publishing the router on 0.0.0.0, reusing the coder `:4545` router for Fulcrum roles, deriving serving identity from the response body `model` field, or letting mini hostnames leak into cycle code as an operator environment key.

References:
- .spec/prds/fulcrum/09-technical-requirements/05-architecture-diagram.md
- .spec/prds/fulcrum/09-technical-requirements/00-architecture-decisions.md

Notes:
- N
- o
-  
- U
- I
-  
- s
- u
- r
- f
- a
- c
- e
- .
-  
- T
- h
- e
-  
- o
- p
- e
- r
- a
- t
- o
- r
-  
- s
- u
- r
- f
- a
- c
- e
-  
- i
- s
-  
- `
- h
- o
- l
- o
-  
- f
- u
- l
- c
- r
- u
- m
- :
- r
- o
- u
- t
- e
- r
- -
- c
- h
- e
- c
- k
- `
- ,
-  
- w
- h
- o
- s
- e
-  
- J
- S
- O
- N
-  
- s
- t
- d
- o
- u
- t
-  
- i
- s
-  
- t
- h
- e
-  
- e
- v
- i
- d
- e
- n
- c
- e
-  
- a
- r
- t
- i
- f
- a
- c
- t
-  
- f
- o
- r
-  
- t
- h
- e
-  
- d
- e
- p
- l
- o
- y
- m
- e
- n
- t
-  
- g
- a
- t
- e
- ;
-  
- t
- h
- e
-  
- r
- o
- u
- t
- e
- r
-  
- i
- t
- s
- e
- l
- f
-  
- i
- s
-  
- n
- e
- v
- e
- r
-  
- r
- e
- a
- c
- h
- a
- b
- l
- e
-  
- f
- r
- o
- m
-  
- o
- u
- t
- s
- i
- d
- e
-  
- t
- h
- e
-  
- c
- o
- n
- t
- a
- i
- n
- e
- r
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/deploy/compose/router.compose.yaml
   - Lines: 1-100
   - Focus: [PRIMARY PATTERN] digest-pinned LiteLLM service, inline `configs:` content block, model_list rows per backend at weight 100, router_settings block, healthcheck shape — copy this shape, change the vocabulary to divergent/convergent/embed and bind to loopback
2. services/platform/deploy/compose/compose.yaml
   - Lines: 1-120
   - Focus: Compose contract v2 conventions: bounded logging anchor, contract labels, digest-qualified images, secret handling; the fulcrum-router service must join the mastra network namespace so 127.0.0.1 is shared
3. services/platform/deploy/compose/image-lock.json
   - Lines: 1-40
   - Focus: Where the new LiteLLM digest and the router config hash must be recorded so the binding is digest-protected across builds
4. services/platform/src/inference/telemetry.ts
   - Lines: 555-585
   - Focus: Existing `x-litellm-model-api-base` header reader; the new router must emit that header plus `x-litellm-model-id` for FUL-PLAT-007 to consume
5. .spec/prds/fulcrum/09-technical-requirements/00-architecture-decisions.md
   - Lines: 117-133
   - Focus: ADR-007 — image-local router, load-balance settings, header-truth rule, and the deleted per-device configuration surface

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

This task is infra-class: the RED→GREEN ceremony is SKIPPED (tdd_mode=skipped).

The integration/E2E reality proof is NOT waived. Every AC above with a SCENARIO must
still be verified against the real service named in VERIFICATION_SERVICE, with the
MUST_OBSERVE value captured as evidence. Work the VERIFICATION CHECKLIST below in order.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

Gate 1: Integration lane
  Command:  pnpm test:integration
  Expected: `fulcrum-router-image.test.ts` reports 5 passed and stdout contains `deployments=6 nodes=inference1,inference2 strategy=least-busy`

Gate 2: Typecheck
  Command:  pnpm tsgo --noEmit
  Expected: No diagnostics referencing `fulcrum-router.ts` or `fulcrum-router-check.ts`

Gate 3: Lint
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/inference/fulcrum-router.ts services/platform/src/cli/commands/fulcrum-router-check.ts services/platform/tests/integration/fulcrum-router-image.test.ts services/platform/deploy/compose/image-lock.json
  Expected: Checked 4 files with 0 errors

Gate 4: Compose validity
  Command:  docker compose -f services/platform/deploy/compose/compose.yaml config 2>&1 | grep -F 'fulcrum-router'
  Expected: Rendered config contains the `fulcrum-router` service with no published `0.0.0.0` port

Gate 5: Header-truth proof
  Command:  pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-1' 2>&1 | grep -E 'x-litellm-model-id=divergent-inference(1|2)'
  Expected: A pinned deployment id captured from a real completion response header

Gate S: Scenario is un-fakeable (PRIMARY) — supersedes 'Exit 0' as the bar for done.
  Verify: validate_scenario.py passes on the PRIMARY AC scenario (exit 0).
  Verify: captured evidence shows the seeded MUST_OBSERVE value, not merely 'tests passed'.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

Implementer: devops-engineer
Rationale:   Image packaging, a digest-pinned LiteLLM container, compose topology, loopback-only exposure, and image-lock bookkeeping are containerization and deployment work owned by devops-engineer; the cycle code that dials the resulting loopback base URL belongs to mastra-implementer in FUL-PLAT-007.
Reviewer:    devops-engineer (peer) + mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- AGENTS.md
- services/platform/deploy/compose/README.md
- .spec/prds/fulcrum/09-technical-requirements/00-architecture-decisions.md

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: FUL-INFRA-001
Blocks:     FUL-PLAT-007, FUL-PLAT-008, FUL-INFRA-003
Wave:       B

--------------------------------------------------------------------------------
REVIEW
--------------------------------------------------------------------------------

Must pass:
- One test per AC; tests verify behavior, not implementation
- PRIMARY AC scenario passes validate_scenario (exit 0), evidence artifact captured
- Minimal implementation; no gold-plating
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Verdict: [APPROVED | NEEDS_FIXES]

================================================================================
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "FUL-INFRA-002",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "stack_with_fulcrum_router": {
      "description": "The holocron compose stack is up with the fulcrum-router service attached to the mastra network namespace on port 4547, and both minis serve the three Fulcrum basenames on :8003",
      "seed_method": "cli",
      "records": [
        "docker compose ps lists fulcrum-router as running and healthy",
        "GET http://127.0.0.1:4547/health/liveliness inside the mastra container returns 200",
        "inference1 and inference2 :8003/v1/models each list the three Fulcrum basenames"
      ]
    },
    "stack_with_inference1_stopped": {
      "description": "Same stack, then oMLX on inference1 is stopped with pkill over SSH while inference2 keeps serving; no network setting is touched",
      "seed_method": "cli",
      "records": [
        "inference1 :8003 refuses TCP connections",
        "inference2 :8003/v1/models still lists the three Fulcrum basenames",
        "the fulcrum-router container is still running with an unchanged config"
      ]
    },
    "stack_with_both_minis_stopped": {
      "description": "Same stack, then oMLX is stopped with pkill over SSH on inference1 and on inference2; every network interface stays up",
      "seed_method": "cli",
      "records": [
        "inference1 :8003 refuses TCP connections",
        "inference2 :8003 refuses TCP connections",
        "FULCRUM_CLOUD_FALLBACK is off"
      ]
    },
    "repo_worktree_after_router_wiring": {
      "description": "The repository worktree after the Fulcrum router config, compose entry, Dockerfile copy, and loopback constant module have landed",
      "seed_method": "cli",
      "records": [
        "services/platform/src/inference/fulcrum-router.ts exports the loopback base URL http://127.0.0.1:4547/v1",
        "services/platform/deploy/compose/fulcrum-router.config.yaml holds the six model_list rows",
        "services/platform/src/mission and services/platform/src/research contain no mini hostname"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the compose stack is up with the Fulcrum router on container loopback and both minis serving WHEN a real chat completion for model `divergent` is POSTed to `http://127.0.0.1:4547/v1/chat/completions` from inside the mastra container THEN the response is 200 and carries `x-litellm-model-api-base` naming a mini `:8003/v1` endpoint and `x-litellm-model-id` equal to a pinned deployment id",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-1' 2>&1 | grep -E 'x-litellm-model-id=divergent-inference(1|2)'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "LiteLLM 1.91.0 fulcrum-router container on 127.0.0.1:4547 fronting oMLX on inference1 and inference2",
      "scenario": {
        "id": "SC-FUL-INFRA-002-AC1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "LiteLLM 1.91.0 fulcrum-router container on 127.0.0.1:4547 fronting oMLX on inference1 and inference2",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the router config is absent so the loopback connect is refused and no completion returns",
            "identity is read from the response body `model` field, which LiteLLM rewrites to the requested alias and is therefore static",
            "the completion is served by a stubbed local echo endpoint instead of a real mini"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stack_with_fulcrum_router",
            "action": {
              "actor": "api_client",
              "steps": [
                "run `docker compose -f services/platform/deploy/compose/compose.yaml up -d fulcrum-router mastra`",
                "run `docker compose exec mastra curl -sS -D /tmp/h.txt http://127.0.0.1:4547/v1/chat/completions -H 'content-type: application/json' -d '{\"model\":\"divergent\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word ready\"}],\"max_tokens\":8}'`",
                "print the captured response headers from /tmp/h.txt"
              ]
            },
            "end_state": {
              "must_observe": [
                "`HTTP/1.1 200 OK`",
                "`x-litellm-model-id=divergent-inference1` or `x-litellm-model-id=divergent-inference2`",
                "`x-litellm-model-api-base=http://inference1.tail011a51.ts.net:8003/v1` or `x-litellm-model-api-base=http://inference2.tail011a51.ts.net:8003/v1`",
                "a `choices[0].message.content` string of length `1` or more"
              ],
              "must_not_observe": [
                "`Connection refused` on 127.0.0.1:4547",
                "an empty `x-litellm-model-id` header",
                "`x-litellm-model-api-base=http://laptop.tail011a51.ts.net:8003/v1`"
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
      "description": "GIVEN the Fulcrum router config carries one row per role per mini at weight 100 WHEN `GET http://127.0.0.1:4547/model/info` is read and each mini's own `:8003/v1/models` endpoint is read THEN the six pinned deployment ids are listed against the two mini api-bases and both nodes really serve the basenames those rows name",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-2' 2>&1 | grep -F 'deployments=6 nodes=inference1,inference2 strategy=least-busy'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "LiteLLM 1.91.0 fulcrum-router /model/info plus oMLX :8003 on inference1 and inference2",
      "scenario": {
        "id": "SC-FUL-INFRA-002-AC2",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "LiteLLM 1.91.0 fulcrum-router /model/info plus oMLX :8003 on inference1 and inference2",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "the config declares one row per role, so only a single backend exists and the deployment count is 3",
            "the deployment list is a static expectation never compared with the real /model/info response",
            "the second real node is never contacted, so rows naming it can be empty promises"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stack_with_fulcrum_router",
            "action": {
              "actor": "api_client",
              "steps": [
                "run `docker compose exec mastra curl -sS http://127.0.0.1:4547/model/info`",
                "run `ssh inference1 'curl -sS http://127.0.0.1:8003/v1/models'` so the first real node answers through its own entrypoint",
                "run `ssh inference2 'curl -sS http://127.0.0.1:8003/v1/models'` so the second real node answers through its own entrypoint",
                "compare the api-base of every /model/info row against the ids both nodes actually serve"
              ]
            },
            "end_state": {
              "must_observe": [
                "`deployments=6 nodes=inference1,inference2 strategy=least-busy`",
                "`convergent-inference2 -> http://inference2.tail011a51.ts.net:8003/v1`",
                "`embed-inference1 -> http://inference1.tail011a51.ts.net:8003/v1`",
                "`num_retries=2 timeout=600 cooldown_time=60`",
                "`served_by_inference1=3 served_by_inference2=3`"
              ],
              "must_not_observe": [
                "`deployments=3`",
                "`served_by_inference2=0`",
                "an empty `data` array from either node"
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
      "description": "GIVEN both minis are serving and the router config is unchanged WHEN oMLX on `inference1` is stopped over SSH and a `convergent` completion is issued through the loopback router THEN the completion returns 200 served by `convergent-inference2`, and after `inference1` is restarted a later completion can be served by `convergent-inference1`",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-3' 2>&1 | grep -F 'during_outage=convergent-inference2 after_restore=convergent-inference1'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "LiteLLM 1.91.0 fulcrum-router with a real oMLX service stop on inference1",
      "scenario": {
        "id": "SC-FUL-INFRA-002-AC3",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "LiteLLM 1.91.0 fulcrum-router with a real oMLX service stop on inference1",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "cooldown is absent so the router keeps selecting the stopped backend and the completion is never served",
            "the served-backend value is a static string rather than the real x-litellm-model-id header of each call",
            "the second real node is never driven, so failover coverage is assumed rather than observed"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stack_with_inference1_stopped",
            "action": {
              "actor": "api_client",
              "steps": [
                "run `ssh inference1 'pkill -f \"omlx serve\"'` to stop the real service on the first node, changing no network setting",
                "run `docker compose exec mastra curl -sS -D - http://127.0.0.1:4547/v1/chat/completions -H 'content-type: application/json' -d '{\"model\":\"convergent\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word ready\"}],\"max_tokens\":8}'` and record x-litellm-model-id",
                "run `ssh inference1 'bash ~/start-omlx-node.sh'` to restore the first real node through its own entrypoint",
                "wait for cooldown_time 60 seconds, then repeat the completion until x-litellm-model-id names the restored node"
              ]
            },
            "end_state": {
              "must_observe": [
                "`during_outage=convergent-inference2 after_restore=convergent-inference1`",
                "`status_during_outage=200`",
                "`completions_served=2`"
              ],
              "must_not_observe": [
                "`status_during_outage=500`",
                "`completions_served=0`",
                "an empty `x-litellm-model-id` header on either call"
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
      "description": "GIVEN oMLX is stopped on both minis and `FULCRUM_CLOUD_FALLBACK` is off WHEN a `divergent` completion is issued through the loopback router THEN the router returns an explicit no-host error naming the requested model and no cloud host is contacted",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-4' 2>&1 | grep -F 'status=503 error_names=divergent cloud_hosts_contacted=0'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "LiteLLM 1.91.0 fulcrum-router with oMLX stopped on both minis",
      "scenario": {
        "id": "SC-FUL-INFRA-002-AC4",
        "primary": true,
        "tier": "holdout",
        "test_tier": "integration",
        "verification_service": "LiteLLM 1.91.0 fulcrum-router with oMLX stopped on both minis",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "a cloud provider row is present in the config, so the call silently succeeds while both minis are stopped",
            "the failure is a generic empty timeout that never names the requested model",
            "only the first node is stopped and the second real node quietly serves the call"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stack_with_both_minis_stopped",
            "action": {
              "actor": "api_client",
              "steps": [
                "run `ssh inference1 'pkill -f \"omlx serve\"'` to stop the real service on the first node",
                "run `ssh inference2 'pkill -f \"omlx serve\"'` to stop the real service on the second real node, changing no network setting on either host",
                "run `docker compose exec mastra curl -sS -o /tmp/b.json -w 'status=%{http_code}' http://127.0.0.1:4547/v1/chat/completions -H 'content-type: application/json' -d '{\"model\":\"divergent\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}]}'`",
                "run `docker compose logs fulcrum-router --since 2m | grep -ci 'api.openai.com\\|api.anthropic.com\\|api.deepseek.com'`",
                "restore both nodes with `ssh inference1 'bash ~/start-omlx-node.sh'` and `ssh inference2 'bash ~/start-omlx-node.sh'`"
              ]
            },
            "end_state": {
              "must_observe": [
                "`status=503 error_names=divergent cloud_hosts_contacted=0`",
                "`\"error\"` body containing the literal `divergent`"
              ],
              "must_not_observe": [
                "`status=200`",
                "`cloud_hosts_contacted=1`",
                "an empty error body with no model name"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the router config, compose entry, Dockerfile copy, and loopback constant have landed WHEN the repository is scanned for mini hostnames, the coder router port, and the deleted base-URL key under the Fulcrum cycle paths THEN the scan finds 0 per-device endpoint references in cycle code and exactly 1 loopback base URL constant",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-5' 2>&1 | grep -F 'cycle_device_refs=0 loopback_base_urls=1'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "verification_service": "Real repository worktree scanned with git grep over services/platform/src",
      "scenario": {
        "id": "SC-FUL-INFRA-002-AC5",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Real repository worktree scanned with git grep over services/platform/src",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the mini hostnames are hardcoded in cycle code, so the deleted per-device config survives under a new name",
            "the scan globs a directory that does not exist, so the tally is empty for a reason unrelated to the code",
            "the loopback constant is absent and the base URL is read from a mutable operator environment key"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "repo_worktree_after_router_wiring",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `git grep -c -E 'inference[12]\\.tail011a51\\.ts\\.net|127\\.0\\.0\\.1:4545|FULCRUM_INFERENCE_BASE_URL|FULCRUM_ROLE_MAP' -- services/platform/src/mission services/platform/src/research | wc -l`",
                "run `git grep -c -F 'http://127.0.0.1:4547/v1' -- services/platform/src/inference/fulcrum-router.ts`",
                "run `git grep -c -F 'inference1.tail011a51.ts.net' -- services/platform/deploy/compose/fulcrum-router.config.yaml`"
              ]
            },
            "end_state": {
              "must_observe": [
                "`cycle_device_refs=0 loopback_base_urls=1`",
                "`services/platform/deploy/compose/fulcrum-router.config.yaml:3` mini hostname rows",
                "`services/platform/src/inference/fulcrum-router.ts:1` loopback constant"
              ],
              "must_not_observe": [
                "`loopback_base_urls=0`",
                "`FULCRUM_INFERENCE_BASE_URL` under `services/platform/src/mission`",
                "an empty scan target list"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The completion response carries an `x-litellm-model-id` header matching `divergent-inference1` or `divergent-inference2` when the loopback router is dialed.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-1' 2>&1 | grep -E 'x-litellm-model-id=divergent-inference(1|2)'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The completion response omits any api-base naming the laptop when the loopback router is dialed.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-1' 2>&1 | grep -cF 'laptop.tail011a51.ts.net' | grep -x '0'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The `/model/info` response lists `deployments=6` when the router config is loaded.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-2' 2>&1 | grep -F 'deployments=6'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "The router settings report `num_retries=2 timeout=600 cooldown_time=60` when `/model/info` is read.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-2' 2>&1 | grep -F 'num_retries=2 timeout=600 cooldown_time=60'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "The outage completion reports `during_outage=convergent-inference2` when oMLX on `inference1` is stopped.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-3' 2>&1 | grep -F 'during_outage=convergent-inference2'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "The router reports `cloud_hosts_contacted=0` when oMLX is stopped on both minis.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-4' 2>&1 | grep -F 'cloud_hosts_contacted=0'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "The repository scan reports `cycle_device_refs=0 loopback_base_urls=1` when run over `services/platform/src`.",
      "verify": "pnpm vitest run --project integration services/platform/tests/integration/fulcrum-router-image.test.ts -t 'AC-5' 2>&1 | grep -F 'cycle_device_refs=0 loopback_base_urls=1'",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->

</details>

## Acceptance Criteria

- [ ] AC-1 (PRIMARY): A real completion through the loopback router is served by a mini [PRIMARY]
- [ ] AC-2: The router declares six deployments across both minis and both minis really serve them
- [ ] AC-3: A stopped mini is covered by the other without a config change
- [ ] AC-4: With no backend the router fails closed and no cloud endpoint is contacted
- [ ] AC-5: Cycle code carries no per-device endpoint, only the loopback base URL
