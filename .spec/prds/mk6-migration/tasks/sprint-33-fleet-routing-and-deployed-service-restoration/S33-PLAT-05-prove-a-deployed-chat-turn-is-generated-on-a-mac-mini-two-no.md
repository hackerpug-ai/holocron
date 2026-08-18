# S33-PLAT-05: Prove a deployed chat turn is generated on a Mac mini with no laptop serving dependency

> Status: Backlog
> Assignee: mastra-implementer
> Priority: P0
> Type: FEATURE
> Effort: M · 180 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: S33-PLAT-02, S33-PLAT-03, S33-OPS-01, S33-OPS-02
> Blocks: —

## Outcome

Close the sprint gate hardest step without disrupting any network: a chat turn issued from `inference1` to the deployed Holocron service whose tokens were demonstrably generated on `inference1` or `inference2`, while a read-only capture of the deployed router's effective model configuration proves that every `implementer` backend is one of those two minis and no laptop/local/self-hosted serving endpoint exists. Today the chat path resolves the divergent role through `resolveModel()` to the manifest hardcoded `127.0.0.1:4545` — inside the container that is the container itself — so no chat turn can produce tokens regardless of `/health`. This task supplies the two-node proof and fixes the endpoint-recording surfaces that would otherwise under-report a non-loopback fleet.

**Success state:** `PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json` issues a chat turn with a unique nonce from `inference1` to the deployed service, receives non-empty streamed assistant text, independently confirms from the oMLX log on exactly one mini that it served the completion inside the request window, and records a read-only effective-router snapshot whose `implementer` backend set is exactly `inference1.tail011a51.ts.net:8003` plus `inference2.tail011a51.ts.net:8003`. It emits both node identities and exits non-zero if the chat, two-mini evidence, topology allowlist, header/telemetry correlation, or zero-cloud-call proof is missing.

## Critical Constraints

**MUST**

- Drive the chat turn through the deployed service own public entrypoint (POST /api/chat-runs over the tailnet), not through an in-process harness.
- Independently observe the completion by reading ~/local-llm/logs/omlx-mini-8003.log on BOTH inference1 and inference2 over SSH — each node driven through its own entrypoint — and record both results including the negative one.
- Issue the public API turn from `inference1` through bounded SSH, and capture the running Holocron router's effective `/etc/litellm/config.yaml` read-only through the exact deployed-host identity `holocron@holocron`; the operator laptop may coordinate the verifier but cannot appear in any serving path.
- Require the effective `model_list` to contain a nonempty `implementer` backend set whose unique API bases are exactly `http://inference1.tail011a51.ts.net:8003/v1` and `http://inference2.tail011a51.ts.net:8003/v1`; every backend entry must use the divergent Qwen model and no other implementer backend is allowed.
- Capture x-litellm-model-api-base from the fleet response for the turn and record the resolved endpoint in inference telemetry, so the served backend is auditable after the fact.

**NEVER**

- Never assert cross-device behavior from a row on one node. A telemetry row on the holocron host, or a response header read there, is not proof a mini generated the tokens — the mini must independently show the completion in its own log. A fixture-supplied row standing in for the other node is CROSS_NODE_SEEDED and will be rejected.
- Never count a fleet request by matching the literal strings 127.0.0.1:4545 / localhost:4545. That hardcoded check (compat/cells/agent.ts:80) reports zero fleet requests against the host.docker.internal router, which would make a passing test meaningless — and makes Sprint 8's 'zero Anthropic on the default path' gate satisfiable by a system that makes no inference calls at all.
- Never accept an empty or whitespace-only assistant reply as a passing turn.
- Never fall back to the DeepSeek escape path or any cloud provider to make the turn succeed — allowEscape stays false and cloudRequests must be 0.
- Never stop, restart, reconfigure, or write through the router, minis, Holocron deployment, Tailscale, Wi-Fi, network interfaces, or routes. This verifier is read-only apart from the ordinary public chat request and its normal application records.
- Never accept a deployed `implementer` backend whose API-base hostname is anything except the exact `inference1.tail011a51.ts.net` or `inference2.tail011a51.ts.net` allowlist. This rejects laptop names or addresses, `localhost`, `127.0.0.1`, `host.docker.internal`, the Holocron host itself, cloud hosts, and unknown/self-hosted endpoints as serving backends. (`host.docker.internal:4545` remains valid only as the deployed service's router ingress, never as an `implementer` API base.)

**STRICTLY**

- Do not provision, restart, or reconfigure the routers or the minis model servers — that is the devops lane. This task observes them.
- Never claim that a literal laptop disconnect was performed. The no-laptop-dependency claim comes from the independent request origin, the exact effective-backend allowlist, and matching one-mini log/header/telemetry evidence.
- The chat turn exercises the divergent role (implementer -> Qwen3.6-35B-A3B on the minis). Do NOT extend this task to embed or rerank: embed is proven by S33-PLAT-03 / S33-OPS-05, and rerank is unobtainable.

## Acceptance Criteria

### AC-1 — A deployed chat turn returns real tokens and exactly one mini's own log shows it served the completion

- **GIVEN** The deployed service is healthy, a read-only capture proves the router's complete `implementer` backend set is exactly the two minis, and the request origin is `inference1`
- **WHEN** A chat run carrying a unique nonce is created from `inference1` through the deployed public API and the oMLX log is read directly on each mini
- **THEN** Non-empty assistant text is returned; exactly one of inference1/inference2 logs a matching Chat completion line inside the request window; both node identities and both query results are recorded; and the serving mini agrees with the response header and persisted telemetry while `cloudRequests===0`
- **Verify:** `PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json`
- **Tier:** e2e · **Service:** deployed-holocron-chat + omlx-mini · **Flow:** UC-INFER-01
- **Scenario:** topology `multi-node` · evidence `stdout` · negative control: forbidden backend, stub, empty, static, mock

### AC-2 — The verifier fails closed when the node-side half of the evidence is missing

- **GIVEN** The same setup, but the mini-side log read is deliberately made unavailable on both minis
- **WHEN** The verifier runs
- **THEN** It exits non-zero with MINI_EVIDENCE_UNAVAILABLE and does not report a pass on the strength of the chat response or the LiteLLM header alone
- **Verify:** `set -o pipefail; if neg=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron S33_MINI_NEGATIVE=no-mini-evidence bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\n' "$neg" | jq -e '.ok == false and .error_code == "MINI_EVIDENCE_UNAVAILABLE" and (.attempted_nodes | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null`
- **Tier:** e2e · **Service:** deployed-holocron-chat + omlx-mini · **Flow:** UC-INFER-01
- **Scenario:** topology `multi-node` · evidence `stdout` · negative control: stub, static, mock, missing node evidence

### AC-3 — Fleet-request accounting no longer assumes a loopback address

- **GIVEN** A resolved fleet endpoint whose host is the configured router rather than 127.0.0.1 or localhost
- **WHEN** A real fleet-backed generate runs through the agent cell and telemetry records the call
- **THEN** The fleet-request count is greater than zero and the recorded endpoint is the resolved router base
- **Verify:** `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts`
- **Tier:** integration · **Service:** litellm-fleet-router · **Flow:** UC-INFER-01
- **Scenario:** topology `single-node` · evidence `db_query` · negative control: static, stub, mock

### AC-4 — The deployed router topology proves there is no laptop serving dependency and rejects forbidden backends

- **GIVEN** The verifier can read the running `litellm-router` container's effective config through bounded, read-only SSH to `holocron@holocron`
- **WHEN** It enumerates every `model_name=implementer` `api_base`, validates the exact allowlist, and exercises the forbidden-backend contract control without changing the running config
- **THEN** The live snapshot contains both and only the inference1/inference2 API bases, while a control snapshot containing any laptop/local/self/unknown backend exits non-zero with `LAPTOP_DEPENDENCY_DETECTED` before the public chat request
- **Verify:** `set -o pipefail; if neg=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron S33_MINI_NEGATIVE=forbidden-backend bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\n' "$neg" | jq -e '.ok == false and .error_code == "LAPTOP_DEPENDENCY_DETECTED" and .chat_request_issued == false and (.effective_implementer_api_bases_before | sort) == ["http://inference1.tail011a51.ts.net:8003/v1","http://inference2.tail011a51.ts.net:8003/v1"] and (.effective_config_sha256_before | type == "string" and length == 64) and .effective_config_sha256_before == .effective_config_sha256_after and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null`
- **Tier:** integration · **Service:** deployed-litellm-router-config · **Flow:** UC-INFER-01
- **Scenario:** topology `multi-node` · evidence `stdout` · negative control: forbidden backend, laptop endpoint, local endpoint, self-hosted endpoint

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | A deployed chat turn issued from inference1 returns assistant text of length >= 10 without any laptop serving endpoint. | AC-1 | `PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json` |
| TC-2 | Exactly one mini's own oMLX log shows the completion in the window, both minis were queried, and the LiteLLM header names the same node. | AC-1 | `PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json` |
| TC-3 | With node-side evidence unavailable, the verifier exits non-zero with MINI_EVIDENCE_UNAVAILABLE. | AC-2 | `set -o pipefail; if neg=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron S33_MINI_NEGATIVE=no-mini-evidence bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\n' "$neg" | jq -e '.ok == false and .error_code == "MINI_EVIDENCE_UNAVAILABLE" and (.attempted_nodes | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null` |
| TC-4 | A real generate against a non-loopback router yields fleetRequests >= 1 and cloudRequests === 0. | AC-3 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` |
| TC-5 | The persisted telemetry endpoint for the turn is the configured router, not the loopback default. | AC-3 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` |
| TC-6 | The live effective implementer backend set is exactly inference1 and inference2, with no laptop/local/self/unknown endpoint. | AC-4 | `PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json` |
| TC-7 | A forbidden-backend control exits non-zero with LAPTOP_DEPENDENCY_DETECTED before issuing a chat request. | AC-4 | `set -o pipefail; if neg=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron S33_MINI_NEGATIVE=forbidden-backend bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\n' "$neg" | jq -e '.ok == false and .error_code == "LAPTOP_DEPENDENCY_DETECTED" and .chat_request_issued == false and (.effective_implementer_api_bases_before | sort) == ["http://inference1.tail011a51.ts.net:8003/v1","http://inference2.tail011a51.ts.net:8003/v1"] and (.effective_config_sha256_before | type == "string" and length == 64) and .effective_config_sha256_before == .effective_config_sha256_after and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null` |

## Fixtures

**`nonce_chat_turn`** — One chat run created through the deployed service real public API, carrying a unique nonce so the completion can be correlated on the mini side. _(seed: public_api)_

- POST https://holocron.tail011a51.ts.net:44111/api/chat-runs with Authorization Bearer HOLO_KEY_MCP
- body: requestId s33-<uuid>, msg 'S33 nonce <uuid>: reply with one short sentence.'
- captured: run id, conversation id, request start timestamp in ISO-8601, nonce

**`mini_omlx_logs`** — The live oMLX server logs on the two devices inference1 and inference2 — the independent cross-device evidence surface confirmed present by the devops lane. Each device is read through its own SSH entrypoint; neither device's state is ever read from the other. _(seed: cli)_

- second device inference1: ~/local-llm/logs/omlx-mini-8003.log confirmed present
- second device inference2: ~/local-llm/logs/omlx-mini-8003.log confirmed present
- device_id for each mini is its tailnet hostname: inference1.tail011a51.ts.net and inference2.tail011a51.ts.net
- device_id of the deployed holocron host is holocron.tail011a51.ts.net and is NOT a valid serving device
- line form: '<timestamp> - omlx.server - INFO - Chat completion: model=Qwen3.6-35B-A3B-MLX-8bit, <n> tokens in <s>s (<rate> tok/s), prompt: <n>, finish_reason=<r>'
- both nodes reachable by SSH alias inference1 and inference2 with key auth

**`deployed_router_topology`** — One read-only snapshot of the running Holocron LiteLLM router's effective configuration, plus an independent request origin on `inference1`. _(seed: cli)_

- bounded SSH destination for the deployed host is exactly `holocron@holocron`; bounded mini aliases remain exactly `inference1` and `inference2`
- the verifier identifies exactly one running container with Compose project/service labels `holocron-router`/`litellm-router`, then reads `/etc/litellm/config.yaml` without modifying it
- every `model_name: implementer` record has model `openai/Qwen3.6-35B-A3B-MLX-8bit`
- the unique implementer `api_base` set is exactly `http://inference1.tail011a51.ts.net:8003/v1` and `http://inference2.tail011a51.ts.net:8003/v1`
- the public chat request is executed from `inference1`; auth is delivered only over SSH stdin and is never placed in argv, environment receipts, logs, or evidence
- no service, router config, Tailscale state, Wi-Fi, interface, route, or network setting is stopped, restarted, toggled, or rewritten

## Reading List

- `services/platform/src/compat/cells/agent.ts` (58-110) — withCloudRequestTracking — line 80 counts fleet requests by matching the literal strings 127.0.0.1:4545 / localhost:4545, reporting zero against the host.docker.internal router. Must derive from the resolved endpoint.
- `services/platform/src/inference/telemetry.ts` (480-500) — The process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1' endpoint default used when recording a call — must record the actually-resolved endpoint.
- `services/platform/src/inference/telemetry.ts` (1090-1110) — Second configuredEndpoint loopback default on the same pattern.
- `services/platform/src/http/chat-runs.ts` (1-40) — The deployed chat entrypoint (POST /api/chat-runs) and its route to createFleetAgentWithResolved — the path the gate chat turn actually travels.
- `services/platform/deploy/compose/router.compose.yaml` (42-76) — Committed router topology shape to compare with the running container's effective config; it is read-only in this task.
- `.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPRINT.md` (66-96) — The human testing gate steps 4 and 5 this verifier must make reproducible.

## Guardrails

**WRITE-ALLOWED**

- scripts/verify-s33-mini-served-turn.sh (NEW)
- services/platform/src/inference/telemetry.ts (MODIFY — endpoint recording only)
- services/platform/src/compat/cells/agent.ts (MODIFY — fleet-request accounting only; unowned by any other S33 lane, and its hardcoded loopback match would otherwise invalidate AC-3)
- services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts (NEW)

**WRITE-PROHIBITED**

- services/platform/src/http/chat-runs.ts - out of scope; the chat route is exercised, not modified
- services/platform/src/mcp/** - mcp lane
- services/platform/deploy/** - devops lane
- scripts/deploy* - devops lane
- router / oMLX configuration on inference1, inference2 and the holocron host - devops lane; observe only, never reconfigure
- services/platform/deploy/compose/router.compose.yaml - read-only topology reference; do not edit it in this task
- Tailscale, Wi-Fi, interfaces, routes, DNS, and all host/container network configuration - network continuity is non-negotiable

## Design

**References**

- services/platform/src/compat/cells/agent.ts:80
- services/platform/src/inference/telemetry.ts:488
- services/platform/src/inference/telemetry.ts:1097

**Interaction notes**

- Capture the request-window start BEFORE issuing the turn so the log scan is bounded and non-retroactive — otherwise an unrelated earlier completion could be miscredited. Keep the window tight enough that both minis cannot match.
- Run the public request from `inference1` and capture `request_origin=inference1`. The coordinator's continued connectivity is not serving-path evidence; no-laptop dependency is proven by the exact effective backend allowlist plus the serving mini's own log.
- Through bounded `ssh holocron@holocron`, identify the single running container labeled `com.docker.compose.project=holocron-router` and `com.docker.compose.service=litellm-router`, read `/etc/litellm/config.yaml`, and persist its SHA-256 plus parsed implementer records. Do not accept the committed file alone as proof of deployed effective state.
- Validate every implementer `api_base` by exact parsed URL, not substring. The unique set must equal both mini URLs. Reject any additional/missing/malformed endpoint, including `localhost`, `127.0.0.1`, `host.docker.internal`, Holocron, cloud, laptop, raw-IP, and unknown hosts.
- Query BOTH minis every run and record both results, including the negative one. 'inference2 logged nothing' is part of the evidence that inference1 served it, and it is what makes the exactly-one claim checkable.
- Correlate primarily on the bounded window plus the token/prompt counts in the omlx line, cross-checked against x-litellm-model-api-base. State plainly in the report which correlation strength was achieved rather than implying nonce-level matching the log format does not provide.
- The fleet-request counter should compare against the resolved endpoint host:port (ResolvedModel.endpoint, available at the call site) — not a hardcoded list.

**Pattern** — Two-node attestation plus deployed-topology allowlisting: each mini is read through its own entrypoint, the request originates independently on inference1, the effective router config is read from the running Holocron container, and the claim is the intersection. Absence of any half is a hard failure, not a downgrade.

_Source:_ `services/platform/src/compat/cells/agent.ts:58-95 (network-assertion shape to generalize)`

**Anti-pattern** — Single-node inference about a cross-device fact, or a literal network disconnect used as a substitute for deployed routing proof. A telemetry row — or a response header — read on the Holocron host proves what that host believes, not which machine ran the model. Equally: a fleet-request counter keyed to hardcoded loopback strings reports 0 against a correctly-configured fleet, so a test asserting 'no cloud calls happened' would pass even if no call happened at all.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/inference/telemetry.ts services/platform/src/compat/cells/agent.ts services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` | Exit 0 |
| typecheck | `pnpm tsgo --noEmit` | Exit 0 |
| unit | `pnpm test:unit` | Exit 0 |
| integration | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` | Exit 0 |
| two-node-e2e + no-laptop topology | `PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json` | Exit 0; live effective implementer backends equal the two minis; exactly one mini serves; cloudRequests=0 |
| two-node negative | Run TC-3's exact fail-closed command | Exit 0 only after the underlying verifier exits non-zero with MINI_EVIDENCE_UNAVAILABLE and both attempted nodes are asserted |
| forbidden-backend negative | Run TC-7's exact fail-closed command | Exit 0 only after the underlying verifier exits non-zero with LAPTOP_DEPENDENCY_DETECTED before chat and the live config hash is unchanged |

## Agent Assignment

**mastra-implementer** — Ties the fleet resolution work to the sprint hardest gate step. Touches src/inference/telemetry.ts endpoint recording and the fleet-request counter in src/compat/cells/agent.ts (both hardcode loopback today and would silently under-report a non-loopback fleet), plus a two-node verifier script. Requires a real chat turn from inference1 against the deployed service, real observation on both minis, and a read-only capture of the deployed router's effective backend topology.

## Coding Standards

- No z.any(); the verifier JSON output is schema-validated.
- Never print HOLO_KEY_MCP, FLEET_KEY or any SSH credential into stdout or evidence — node identities and endpoint hosts only.
- Bounded SSH reads with explicit timeouts; a hung log read must fail the verifier, not stall it.
- Every deployed-host SSH invocation uses exact destination `holocron@holocron` with `BatchMode=yes`, `ConnectTimeout=10`, `ServerAliveInterval=5`, and `ServerAliveCountMax=2`; every mini SSH invocation uses the same bounds with stable aliases `inference1`/`inference2`.
- The forbidden-backend negative control operates on an in-memory copy of the freshly read effective config, appends a forbidden endpoint, proves `LAPTOP_DEPENDENCY_DETECTED`, and exits before the chat call. It never edits or replaces the live config.
- No mocked fetch, no recorded fixtures, and no simulated mini in any test that claims a mini served a completion.

## Boundary Contracts

- MINI-SIDE OBSERVABLE (supplied and live-verified by s33-devops): log file ~/local-llm/logs/omlx-mini-8003.log present on BOTH inference1 and inference2, appending one line per served completion in the form '<timestamp> - omlx.server - INFO - Chat completion: model=<model>, <n> tokens in <s>s (<rate> tok/s), prompt: <n>, finish_reason=<r>'. devops confirmed causation by matching a deliberately bad request to a 404 WARNING line at the same timestamp.
- HOLOCRON-SIDE CORROBORATION: LiteLLM response headers x-litellm-model-api-base (e.g. http://inference1.tail011a51.ts.net:8003/v1), x-litellm-model-name, x-litellm-model-group. Useful for correlation but NOT sufficient alone — it is the holocron host asserting a fact about another node.
- DEPLOYED TOPOLOGY PROOF: exact `ssh holocron@holocron` read of the one running `holocron-router`/`litellm-router` container's `/etc/litellm/config.yaml`; parsed `implementer` records must be nonempty, model-exact, and have the unique API-base set equal to both mini URLs. This proves the deployed router has no laptop/local/self/unknown serving path without mutating network state.
- NETWORK CONTINUITY: the verifier may make bounded public HTTP requests and read-only SSH/Docker reads only. It must never stop/restart/reconfigure a service or toggle Tailscale, Wi-Fi, interfaces, routes, or DNS, and its result must state `network_mutation_performed=false` and `literal_disconnect_claimed=false`.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-PLAT-05",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "nonce_chat_turn": {
      "description": "One chat run created through the deployed service real public API, carrying a unique nonce so the completion can be correlated on the mini side.",
      "seed_method": "public_api",
      "records": [
        "POST https://holocron.tail011a51.ts.net:44111/api/chat-runs with Authorization Bearer HOLO_KEY_MCP",
        "body: requestId s33-<uuid>, msg 'S33 nonce <uuid>: reply with one short sentence.'",
        "captured: run id, conversation id, request start timestamp in ISO-8601, nonce"
      ]
    },
    "mini_omlx_logs": {
      "description": "The live oMLX server logs on the two devices inference1 and inference2 \u2014 the independent cross-device evidence surface confirmed present by the devops lane. Each device is read through its own SSH entrypoint; neither device's state is ever read from the other.",
      "seed_method": "cli",
      "records": [
        "second device inference1: ~/local-llm/logs/omlx-mini-8003.log confirmed present",
        "second device inference2: ~/local-llm/logs/omlx-mini-8003.log confirmed present",
        "device_id for each mini is its tailnet hostname: inference1.tail011a51.ts.net and inference2.tail011a51.ts.net",
        "device_id of the deployed holocron host is holocron.tail011a51.ts.net and is NOT a valid serving device",
        "line form: '<timestamp> - omlx.server - INFO - Chat completion: model=Qwen3.6-35B-A3B-MLX-8bit, <n> tokens in <s>s (<rate> tok/s), prompt: <n>, finish_reason=<r>'",
        "both nodes reachable by SSH alias inference1 and inference2 with key auth"
      ]
    },
    "deployed_router_topology": {
      "description": "A read-only snapshot of the running Holocron LiteLLM router effective configuration, combined with a public API request executed from inference1, proves every implementer serving endpoint is one of the two minis without any network mutation.",
      "seed_method": "cli",
      "records": [
        "deployed host SSH destination is exactly holocron@holocron; mini aliases are inference1 and inference2",
        "one running container has Compose project/service labels holocron-router/litellm-router and /etc/litellm/config.yaml is read without modification",
        "the unique implementer api_base set equals http://inference1.tail011a51.ts.net:8003/v1 plus http://inference2.tail011a51.ts.net:8003/v1",
        "every implementer record names openai/Qwen3.6-35B-A3B-MLX-8bit",
        "the public chat request is executed from inference1 with auth delivered over SSH stdin and absent from argv, environment receipts, logs, and evidence",
        "network_mutation_performed=false and literal_disconnect_claimed=false"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the live effective router config contains exactly the two mini implementer backends and the request origin is inference1 WHEN a nonce-carrying chat run is created through the deployed public API and the oMLX log is read on each mini THEN non-empty text is returned, exactly one mini independently logs the completion, and header plus telemetry correlation proves cloudRequests is zero.",
      "verify": "PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json",
      "scenario": {
        "id": "S33-PLAT-05/AC-1",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "deployed-holocron-chat + omlx-mini",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "forbidden_backend",
            "stub",
            "empty",
            "static",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "nonce_chat_turn",
            "action": {
              "actor": "operator coordinating bounded reads while inference1 issues the public request, holocron@holocron exposes the effective router config read-only, and inference1/inference2 each expose their own oMLX log",
              "steps": [
                "Use bounded SSH to holocron@holocron to identify exactly one running holocron-router/litellm-router container, read /etc/litellm/config.yaml without modification, and require the unique implementer api_base set to equal both exact mini URLs before any chat request.",
                "Record the request-window start timestamp and request_origin=inference1, then execute POST /api/chat-runs from inference1 with the nonce prompt; deliver auth only over SSH stdin and do not place it in argv, environment receipts, logs, or evidence.",
                "Consume GET /api/chat-runs/:id/events until terminal and capture the full assistant text.",
                "SSH to the second device inference1 and read its own ~/local-llm/logs/omlx-mini-8003.log for Chat completion lines in the window, capturing the matched lines or the explicit absence.",
                "SSH to the other second device inference2 and read its own log the same way, separately \u2014 neither device's result is derived from the other.",
                "Emit JSON with expected_nodes naming both device_id values, request_origin=inference1, each device query result, the serving device_id, the assistant text length, the captured x-litellm-model-api-base, the resolved fleet ingress endpoint from telemetry, the parsed implementer backend list and effective-config sha256, cloudRequests=0, network_mutation_performed=false, and literal_disconnect_claimed=false."
              ]
            },
            "end_state": {
              "must_observe": [
                "assistant text length >= 10 characters",
                "exactly 1 of the 2 devices logs a `Chat completion:` line with model=`Qwen3.6-35B-A3B-MLX-8bit` inside the request window",
                "the serving device_id === `inference1.tail011a51.ts.net` or === `inference2.tail011a51.ts.net`",
                "the serving device_id is inference1.tail011a51.ts.net or inference2.tail011a51.ts.net and is not holocron.tail011a51.ts.net; it may equal request_origin=inference1 because inference1 is an allowed serving mini",
                "expected_nodes has length 2 and a query result is recorded for each of the 2 devices, including the one that matched 0 lines",
                "x-litellm-model-api-base === `http://<serving-device_id>:8003/v1` whose hostname equals the device whose own log matched, so the 2 independent cross-device evidence sources agree",
                "request_origin === `inference1`",
                "the live effective implementer api_base set equals exactly `http://inference1.tail011a51.ts.net:8003/v1` plus `http://inference2.tail011a51.ts.net:8003/v1`",
                "every effective implementer record names `openai/Qwen3.6-35B-A3B-MLX-8bit`",
                "the telemetry row records a fleet ingress endpoint host === `host.docker.internal` and cloudRequests === 0",
                "network_mutation_performed === false and literal_disconnect_claimed === false"
              ],
              "must_not_observe": [
                "an empty or whitespace-only assistant reply",
                "0 devices logging the completion, which would mean the tokens came from elsewhere",
                "2 devices both logging it, which means the window is too wide for sound correlation",
                "a serving device_id === `holocron.tail011a51.ts.net`, which would mean the deployed host served itself",
                "any request to `api.anthropic.com`, `api.openai.com` or `api.deepseek.com`",
                "a telemetry endpoint containing `127.0.0.1` or `localhost`",
                "an implementer backend api_base containing laptop, localhost, 127.0.0.1, host.docker.internal, holocron, a raw IP, a cloud host, or any host outside the two exact mini allowlist",
                "a pass produced from 1 device of evidence, or from the response header alone"
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
      "description": "GIVEN node-side evidence made unavailable on both devices WHEN the verifier runs THEN it exits non-zero with MINI_EVIDENCE_UNAVAILABLE rather than passing on the chat response or header alone.",
      "verify": "set -o pipefail; if neg=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron S33_MINI_NEGATIVE=no-mini-evidence bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\\n' \"$neg\" | jq -e '.ok == false and .error_code == \"MINI_EVIDENCE_UNAVAILABLE\" and (.attempted_nodes | sort) == [\"inference1.tail011a51.ts.net\",\"inference2.tail011a51.ts.net\"] and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null",
      "scenario": {
        "id": "S33-PLAT-05/AC-2",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "deployed-holocron-chat + omlx-mini",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static",
            "mock",
            "missing_node_evidence"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mini_omlx_logs",
            "action": {
              "actor": "mastra-implementer driving the two devices inference1 and inference2",
              "steps": [
                "Run the verifier in its no-mini-evidence control mode, which deliberately suppresses both node-read results in memory without changing SSH, the log files, services, or network state.",
                "Capture exit code and the emitted JSON."
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code !== 0",
                "emitted JSON contains the literal error code `MINI_EVIDENCE_UNAVAILABLE`",
                "emitted JSON names both attempted device_id values and the reason each of the 2 devices was unreadable"
              ],
              "must_not_observe": [
                "exit code 0 from the verifier",
                "a served_by device_id naming a device that returned 0 successful queries",
                "an empty reason list, or a pass justified by the chat response or the x-litellm-model-api-base header alone"
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
      "description": "GIVEN a non-loopback resolved fleet endpoint WHEN a real generate runs THEN fleetRequests is at least 1, cloudRequests is 0, and the telemetry endpoint is the resolved router base.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts",
      "scenario": {
        "id": "S33-PLAT-05/AC-3",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet-router",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "stub",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mini_omlx_logs",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "Resolve the divergent role against the configured non-loopback router.",
                "Run one real generate through the agent cell with cloud-request tracking enabled.",
                "Read back the fleet request count and the persisted telemetry endpoint."
              ]
            },
            "end_state": {
              "must_observe": [
                "fleetRequests >= 1",
                "cloudRequests === 0",
                "the persisted telemetry endpoint host === `host.docker.internal`",
                "returned text length >= 1"
              ],
              "must_not_observe": [
                "fleetRequests === 0 while a real completion was returned",
                "a telemetry endpoint falling back to the hardcoded default `http://127.0.0.1:4545/v1`",
                "an empty telemetry row, or any counted request to a cloud provider host"
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
      "description": "GIVEN read-only access to the running Holocron router effective config WHEN every implementer api_base is parsed and checked against the exact two-mini allowlist THEN the live set contains both and only inference1/inference2, while an in-memory forbidden-backend control fails before chat with LAPTOP_DEPENDENCY_DETECTED and makes no runtime or network mutation.",
      "verify": "set -o pipefail; if neg=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron S33_MINI_NEGATIVE=forbidden-backend bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\\n' \"$neg\" | jq -e '.ok == false and .error_code == \"LAPTOP_DEPENDENCY_DETECTED\" and .chat_request_issued == false and (.effective_implementer_api_bases_before | sort) == [\"http://inference1.tail011a51.ts.net:8003/v1\",\"http://inference2.tail011a51.ts.net:8003/v1\"] and (.effective_config_sha256_before | type == \"string\" and length == 64) and .effective_config_sha256_before == .effective_config_sha256_after and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null",
      "scenario": {
        "id": "S33-PLAT-05/AC-4",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "deployed-litellm-router-config",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "forbidden_backend",
            "laptop_endpoint",
            "local_endpoint",
            "self_hosted_endpoint",
            "unknown_endpoint",
            "empty"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "deployed_router_topology",
            "action": {
              "actor": "mastra-implementer using bounded read-only SSH to holocron@holocron",
              "steps": [
                "Identify exactly one running container labeled com.docker.compose.project=holocron-router and com.docker.compose.service=litellm-router.",
                "Read /etc/litellm/config.yaml and its sha256 without modifying the container, file, service, host, or network.",
                "Parse every model_name=implementer record and require the model plus unique api_base set to equal the exact two-mini contract.",
                "For the negative control only, append http://127.0.0.1:8003/v1 to an in-memory copy of the freshly read records; do not write that copy anywhere and do not issue the chat request.",
                "Capture the nonzero exit plus result JSON and independently re-read the live effective config sha256 to prove it did not change."
              ]
            },
            "end_state": {
              "must_observe": [
                "positive live snapshot unique implementer api_base set equals exactly 2 literals: `http://inference1.tail011a51.ts.net:8003/v1` and `http://inference2.tail011a51.ts.net:8003/v1`",
                "every positive live implementer record names openai/Qwen3.6-35B-A3B-MLX-8bit",
                "forbidden-backend control exit code !== 0",
                "forbidden-backend control error code === `LAPTOP_DEPENDENCY_DETECTED`",
                "chat_request_issued === false for the forbidden-backend control",
                "effective_config_sha256_before === effective_config_sha256_after",
                "network_mutation_performed === false and literal_disconnect_claimed === false"
              ],
              "must_not_observe": [
                "a positive live implementer api_base outside the two exact mini URLs",
                "a missing mini URL or empty implementer backend list",
                "host.docker.internal accepted as a serving backend rather than router ingress",
                "a control exit code 0 or a chat request issued after the forbidden backend is introduced",
                "any service, config, Tailscale, Wi-Fi, interface, route, DNS, or network mutation"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "A deployed chat turn issued from inference1 returns assistant text of length >= 10 without any laptop serving endpoint.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Exactly one mini's own omlx log shows the completion in the window, both minis were queried, and the LiteLLM header names the same node.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "With node-side evidence unavailable, the verifier exits non-zero with MINI_EVIDENCE_UNAVAILABLE.",
      "maps_to_ac": "AC-2",
      "verify": "set -o pipefail; if neg=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron S33_MINI_NEGATIVE=no-mini-evidence bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\\n' \"$neg\" | jq -e '.ok == false and .error_code == \"MINI_EVIDENCE_UNAVAILABLE\" and (.attempted_nodes | sort) == [\"inference1.tail011a51.ts.net\",\"inference2.tail011a51.ts.net\"] and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "A real generate against a non-loopback router yields fleetRequests >= 1 and cloudRequests === 0.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "The persisted telemetry endpoint for the turn is the configured router, not the loopback default.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "The live effective implementer backend set is exactly inference1 and inference2, with no laptop, local, self-hosted, cloud, or unknown endpoint.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "A forbidden-backend control exits nonzero with LAPTOP_DEPENDENCY_DETECTED before issuing a chat request and leaves the effective config hash unchanged.",
      "maps_to_ac": "AC-4",
      "verify": "set -o pipefail; if neg=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron S33_MINI_NEGATIVE=forbidden-backend bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\\n' \"$neg\" | jq -e '.ok == false and .error_code == \"LAPTOP_DEPENDENCY_DETECTED\" and .chat_request_issued == false and (.effective_implementer_api_bases_before | sort) == [\"http://inference1.tail011a51.ts.net:8003/v1\",\"http://inference2.tail011a51.ts.net:8003/v1\"] and (.effective_config_sha256_before | type == \"string\" and length == 64) and .effective_config_sha256_before == .effective_config_sha256_after and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null"
    }
  ]
}
-->
