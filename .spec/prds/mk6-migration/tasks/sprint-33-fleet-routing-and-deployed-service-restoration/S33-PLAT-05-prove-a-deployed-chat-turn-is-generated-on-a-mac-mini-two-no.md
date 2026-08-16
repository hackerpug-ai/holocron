# S33-PLAT-05: Prove a deployed chat turn is generated on a Mac mini: two-node evidence with the laptop off the tailnet

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

Close the sprint gate hardest step: a chat turn issued to the deployed holocron service, with the laptop off the tailnet, whose tokens were demonstrably generated on inference1 or inference2. Today the chat path resolves the divergent role through resolveModel() to the manifest hardcoded 127.0.0.1:4545 — inside the container that is the container itself — so no chat turn can produce tokens regardless of /health. This task supplies the two-node proof and fixes the endpoint-recording surfaces that would otherwise under-report a non-loopback fleet.

**Success state:** PLATFORM_IT=1 bash scripts/verify-s33-mini-served-turn.sh --json issues a chat turn with a unique nonce to the deployed service, receives non-empty streamed assistant text, and independently confirms from the omlx log on exactly one mini that it served the completion inside the request window — emitting both node identities and exiting non-zero if either side of the evidence is missing.

## Critical Constraints

**MUST**

- Drive the chat turn through the deployed service own public entrypoint (POST /api/chat-runs over the tailnet), not through an in-process harness.
- Independently observe the completion by reading ~/local-llm/logs/omlx-mini-8003.log on BOTH inference1 and inference2 over SSH — each node driven through its own entrypoint — and record both results including the negative one.
- Run the whole proof with the operator laptop off the tailnet, so laptop-resident models cannot be the source of the tokens.
- Capture x-litellm-model-api-base from the fleet response for the turn and record the resolved endpoint in inference telemetry, so the served backend is auditable after the fact.

**NEVER**

- Never assert cross-device behavior from a row on one node. A telemetry row on the holocron host, or a response header read there, is not proof a mini generated the tokens — the mini must independently show the completion in its own log. A fixture-supplied row standing in for the other node is CROSS_NODE_SEEDED and will be rejected.
- Never count a fleet request by matching the literal strings 127.0.0.1:4545 / localhost:4545. That hardcoded check (compat/cells/agent.ts:80) reports zero fleet requests against the host.docker.internal router, which would make a passing test meaningless — and makes Sprint 8's 'zero Anthropic on the default path' gate satisfiable by a system that makes no inference calls at all.
- Never accept an empty or whitespace-only assistant reply as a passing turn.
- Never fall back to the DeepSeek escape path or any cloud provider to make the turn succeed — allowEscape stays false and cloudRequests must be 0.

**STRICTLY**

- Do not provision, restart, or reconfigure the routers or the minis model servers — that is the devops lane. This task observes them.
- The chat turn exercises the divergent role (implementer -> Qwen3.6-35B-A3B on the minis). Do NOT extend this task to embed or rerank: embed is proven by S33-PLAT-03 / S33-OPS-05, and rerank is unobtainable.

## Acceptance Criteria

### AC-1 — A deployed chat turn returns real tokens and exactly one mini's own log shows it served the completion

- **GIVEN** The laptop is off the tailnet, the deployed service is healthy, and both minis serve the divergent model behind the S33-OPS-02 router
- **WHEN** A chat run carrying a unique nonce is created through the deployed public API and the omlx log is read directly on each mini
- **THEN** Non-empty assistant text is returned, and exactly one of inference1/inference2 logs a matching Chat completion line inside the request window — with both node identities and both query results recorded
- **Verify:** `PLATFORM_IT=1 bash scripts/verify-s33-mini-served-turn.sh --json`
- **Tier:** e2e · **Service:** deployed-holocron-chat + omlx-mini · **Flow:** UC-INFER-01
- **Scenario:** topology `multi-node` · evidence `stdout` · negative control: disconnect, stub, empty, static, mock

### AC-2 — The verifier fails closed when the node-side half of the evidence is missing

- **GIVEN** The same setup, but the mini-side log read is deliberately made unavailable on both minis
- **WHEN** The verifier runs
- **THEN** It exits non-zero with MINI_EVIDENCE_UNAVAILABLE and does not report a pass on the strength of the chat response or the LiteLLM header alone
- **Verify:** `PLATFORM_IT=1 S33_MINI_NEGATIVE=no-mini-evidence bash scripts/verify-s33-mini-served-turn.sh --json`
- **Tier:** e2e · **Service:** deployed-holocron-chat + omlx-mini · **Flow:** UC-INFER-01
- **Scenario:** topology `multi-node` · evidence `stdout` · negative control: stub, static, mock, disconnect

### AC-3 — Fleet-request accounting no longer assumes a loopback address

- **GIVEN** A resolved fleet endpoint whose host is the configured router rather than 127.0.0.1 or localhost
- **WHEN** A real fleet-backed generate runs through the agent cell and telemetry records the call
- **THEN** The fleet-request count is greater than zero and the recorded endpoint is the resolved router base
- **Verify:** `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts`
- **Tier:** integration · **Service:** litellm-fleet-router · **Flow:** UC-INFER-01
- **Scenario:** topology `single-node` · evidence `db_query` · negative control: static, stub, mock

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | A deployed chat turn returns assistant text of length >= 10 with the laptop off the tailnet. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-s33-mini-served-turn.sh --json` |
| TC-2 | Exactly one mini's own omlx log shows the completion in the window, both minis were queried, and the LiteLLM header names the same node. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-s33-mini-served-turn.sh --json` |
| TC-3 | With node-side evidence unavailable, the verifier exits non-zero with MINI_EVIDENCE_UNAVAILABLE. | AC-2 | `PLATFORM_IT=1 S33_MINI_NEGATIVE=no-mini-evidence bash scripts/verify-s33-mini-served-turn.sh --json` |
| TC-4 | A real generate against a non-loopback router yields fleetRequests >= 1 and cloudRequests === 0. | AC-3 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` |
| TC-5 | The persisted telemetry endpoint for the turn is the configured router, not the loopback default. | AC-3 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` |

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

**`laptop_off_tailnet`** — The operator laptop dropped off the tailnet for the duration of the proof, so laptop-resident models cannot serve the turn. _(seed: cli)_

- tailscale down executed on the laptop
- tailscale status from a second real device lists the laptop 0 times as active, captured before the turn is issued

## Reading List

- `services/platform/src/compat/cells/agent.ts` (58-110) — withCloudRequestTracking — line 80 counts fleet requests by matching the literal strings 127.0.0.1:4545 / localhost:4545, reporting zero against the host.docker.internal router. Must derive from the resolved endpoint.
- `services/platform/src/inference/telemetry.ts` (480-500) — The process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1' endpoint default used when recording a call — must record the actually-resolved endpoint.
- `services/platform/src/inference/telemetry.ts` (1090-1110) — Second configuredEndpoint loopback default on the same pattern.
- `services/platform/src/http/chat-runs.ts` (1-40) — The deployed chat entrypoint (POST /api/chat-runs) and its route to createFleetAgentWithResolved — the path the gate chat turn actually travels.
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

## Design

**References**

- services/platform/src/compat/cells/agent.ts:80
- services/platform/src/inference/telemetry.ts:488
- services/platform/src/inference/telemetry.ts:1097

**Interaction notes**

- Capture the request-window start BEFORE issuing the turn so the log scan is bounded and non-retroactive — otherwise an unrelated earlier completion could be miscredited. Keep the window tight enough that both minis cannot match.
- Query BOTH minis every run and record both results, including the negative one. 'inference2 logged nothing' is part of the evidence that inference1 served it, and it is what makes the exactly-one claim checkable.
- Correlate primarily on the bounded window plus the token/prompt counts in the omlx line, cross-checked against x-litellm-model-api-base. State plainly in the report which correlation strength was achieved rather than implying nonce-level matching the log format does not provide.
- The fleet-request counter should compare against the resolved endpoint host:port (ResolvedModel.endpoint, available at the call site) — not a hardcoded list.

**Pattern** — Two-node attestation: each node is driven and read through its own entrypoint, both results are recorded, and the claim is the intersection. Absence of either half is a hard failure, not a downgrade.

_Source:_ `services/platform/src/compat/cells/agent.ts:58-95 (network-assertion shape to generalize)`

**Anti-pattern** — Single-node inference about a cross-device fact. A telemetry row — or a response header — read on the holocron host proves what that host believes, not which machine ran the model. Equally: a fleet-request counter keyed to hardcoded loopback strings reports 0 against a correctly-configured fleet, so a test asserting 'no cloud calls happened' would pass even if no call happened at all.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/inference/telemetry.ts services/platform/src/compat/cells/agent.ts services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` | Exit 0 |
| typecheck | `pnpm tsgo --noEmit` | Exit 0 |
| unit | `pnpm test:unit` | Exit 0 |
| integration | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` | Exit 0 |
| two-node-e2e | `PLATFORM_IT=1 bash scripts/verify-s33-mini-served-turn.sh --json` | Exit 0 |
| two-node-negative | `PLATFORM_IT=1 S33_MINI_NEGATIVE=no-mini-evidence bash scripts/verify-s33-mini-served-turn.sh --json` | Non-zero exit with MINI_EVIDENCE_UNAVAILABLE |

## Agent Assignment

**mastra-implementer** — Ties the fleet resolution work to the sprint hardest gate step. Touches src/inference/telemetry.ts endpoint recording and the fleet-request counter in src/compat/cells/agent.ts (both hardcode loopback today and would silently under-report a non-loopback fleet), plus a two-node verifier script. Requires a real chat turn against the deployed service and real observation on both minis.

## Coding Standards

- No z.any(); the verifier JSON output is schema-validated.
- Never print HOLO_KEY_MCP, FLEET_KEY or any SSH credential into stdout or evidence — node identities and endpoint hosts only.
- Bounded SSH reads with explicit timeouts; a hung log read must fail the verifier, not stall it.
- No mocked fetch, no recorded fixtures, and no simulated mini in any test that claims a mini served a completion.

## Boundary Contracts

- MINI-SIDE OBSERVABLE (supplied and live-verified by s33-devops): log file ~/local-llm/logs/omlx-mini-8003.log present on BOTH inference1 and inference2, appending one line per served completion in the form '<timestamp> - omlx.server - INFO - Chat completion: model=<model>, <n> tokens in <s>s (<rate> tok/s), prompt: <n>, finish_reason=<r>'. devops confirmed causation by matching a deliberately bad request to a 404 WARNING line at the same timestamp.
- HOLOCRON-SIDE CORROBORATION: LiteLLM response headers x-litellm-model-api-base (e.g. http://inference1.tail011a51.ts.net:8003/v1), x-litellm-model-name, x-litellm-model-group. Useful for correlation but NOT sufficient alone — it is the holocron host asserting a fact about another node.

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
    "laptop_off_tailnet": {
      "description": "The operator laptop dropped off the tailnet for the duration of the proof, so laptop-resident models cannot serve the turn.",
      "seed_method": "cli",
      "records": [
        "tailscale down executed on the laptop",
        "tailscale status from a second real device lists the laptop 0 times as active, captured before the turn is issued"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the laptop off the tailnet WHEN a nonce-carrying chat run is created through the deployed public API and the omlx log is read on each of the two devices THEN non-empty text is returned and exactly one mini independently logs the completion, with both node identities and both query results recorded.",
      "verify": "PLATFORM_IT=1 bash scripts/verify-s33-mini-served-turn.sh --json",
      "scenario": {
        "id": "S33-PLAT-05/AC-1",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "deployed-holocron-chat + omlx-mini",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
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
              "actor": "operator on the holocron host plus the two devices inference1 and inference2, each second device driven through its own SSH entrypoint",
              "steps": [
                "Confirm and capture that the laptop is off the tailnet before anything else runs.",
                "Record the request-window start timestamp and the device_id of the host issuing the request, then POST /api/chat-runs to the deployed service with the nonce prompt.",
                "Consume GET /api/chat-runs/:id/events until terminal and capture the full assistant text.",
                "SSH to the second device inference1 and read its own ~/local-llm/logs/omlx-mini-8003.log for Chat completion lines in the window, capturing the matched lines or the explicit absence.",
                "SSH to the other second device inference2 and read its own log the same way, separately \u2014 neither device's result is derived from the other.",
                "Emit JSON with expected_nodes naming both device_id values, each device query result, the serving device_id, the assistant text length, the captured x-litellm-model-api-base, and the resolved fleet endpoint from telemetry."
              ]
            },
            "end_state": {
              "must_observe": [
                "assistant text length >= 10 characters",
                "exactly 1 of the 2 devices logs a `Chat completion:` line with model=`Qwen3.6-35B-A3B-MLX-8bit` inside the request window",
                "the serving device_id === `inference1.tail011a51.ts.net` or === `inference2.tail011a51.ts.net`",
                "the serving device_id !== the requesting host device_id `holocron.tail011a51.ts.net`, so the tokens were produced on a different machine from the one that asked",
                "expected_nodes has length 2 and a query result is recorded for each of the 2 devices, including the one that matched 0 lines",
                "x-litellm-model-api-base === `http://<serving-device_id>:8003/v1` whose hostname equals the device whose own log matched, so the 2 independent cross-device evidence sources agree",
                "the telemetry row records a fleet endpoint host === `host.docker.internal` and cloudRequests === 0"
              ],
              "must_not_observe": [
                "an empty or whitespace-only assistant reply",
                "0 devices logging the completion, which would mean the tokens came from elsewhere",
                "2 devices both logging it, which means the window is too wide for sound correlation",
                "a serving device_id === `holocron.tail011a51.ts.net`, which would mean the deployed host served itself",
                "any request to `api.anthropic.com`, `api.openai.com` or `api.deepseek.com`",
                "a telemetry endpoint containing `127.0.0.1` or `localhost`",
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
      "verify": "PLATFORM_IT=1 S33_MINI_NEGATIVE=no-mini-evidence bash scripts/verify-s33-mini-served-turn.sh --json",
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
            "disconnect"
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
                "Run the verifier with each second device's own log read made unreachable, on both devices.",
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
      "id": "TC-1",
      "type": "test_criterion",
      "description": "A deployed chat turn returns assistant text of length >= 10 with the laptop off the tailnet.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 bash scripts/verify-s33-mini-served-turn.sh --json"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Exactly one mini's own omlx log shows the completion in the window, both minis were queried, and the LiteLLM header names the same node.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 bash scripts/verify-s33-mini-served-turn.sh --json"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "With node-side evidence unavailable, the verifier exits non-zero with MINI_EVIDENCE_UNAVAILABLE.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 S33_MINI_NEGATIVE=no-mini-evidence bash scripts/verify-s33-mini-served-turn.sh --json"
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
    }
  ]
}
-->
