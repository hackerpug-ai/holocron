# S33-PLAT-02: Make resolveModel reach the real router: add configured-base precedence over the six hardcoded manifest endpoints and correct the role model revisions

> Status: Backlog
> Assignee: mastra-implementer
> Priority: P0
> Type: FEATURE
> Effort: M · 150 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: S33-PLAT-01, S33-OPS-01, S33-OPS-02, S33-OPS-05
> Blocks: S33-PLAT-03, S33-PLAT-05

## Outcome

Make the Fleet Role Manifest resolve to a fleet that is reachable from wherever the service actually runs. All five roles plus defaultEndpoint hardcode http://127.0.0.1:4545, and resolveModel() uses those values for every real model call — independently of FLEET_URL, which only health.ts reads. Inside the deployed container that resolves to the container's own loopback, so no chat turn can produce tokens even when /health is green.

**Success state:** resolveModel('divergent') executed from inside the deployed container resolves to the configured router base (http://host.docker.internal:4545), its live health probe passes, and a real completion returns non-empty text. The same committed manifest still resolves correctly on the laptop with no FLEET_URL set. Pointing the configured base at a closed port makes the call throw RoleUnavailableError naming that endpoint.

## Critical Constraints

**MUST**

- Every role effective endpoint must resolve to the configured router base at call time, so resolveModel() and probeFleet() can never disagree about where the fleet is. This is the actual fix — devops confirmed by read that resolveModel uses entry.endpoint (hardcoded 127.0.0.1:4545) and never consults FLEET_URL, so a live router alone only repairs /health shallow probe.
- Correct modelRevision for convergent and judge: the router routes the `reviewer` alias to Qwen3.8-27B-8bit (S33-OPS-01), not the `qwen3.6-27b-mtp-q8_0` the manifest currently claims. Correct embed modelRevision to the Qwen3-Embedding-0.6B-4bit-DWQ the router serves (S33-OPS-05).
- Unresolvable roles must still throw RoleUnavailableError from the live probe (fail closed). The existing cloud-endpoint refusal on the default path must remain intact.

**NEVER**

- Never hardcode `http://host.docker.internal:4545` into the committed manifest. That name only resolves inside a Docker container on the holocron Mac; baking it in breaks every laptop dev run. The committed manifest keeps a dev-sane loopback default and the CONTAINER supplies its own base via FLEET_URL — one manifest, correct on both hosts.
- Never change rerank's degradationAction to make anything green — no reranker model exists anywhere on the fleet. Keep embed's fail-closed too: it now resolves via S33-OPS-05, but the fail-closed contract is what makes its future absence loud.
- Never point a role at a cloud endpoint, and never remove the isCloudEndpoint() guards.
- Never claim a role resolves without the live health probe having actually run against the real router.

**STRICTLY**

- Do NOT edit services/platform/src/fleet/manifest.ts or manifest.schema.ts — MK6-FLEET-001 owns those. If a schema change proves unavoidable, stop and record it as a cross-task reconciliation blocker rather than editing them unilaterally.
- If S33-OPS-02 has not deployed the router, this task is BLOCKED for its live ACs. Record the blocker with the real failed probe output. Do not substitute the laptop router and call it done.

## Acceptance Criteria

### AC-1 — The configured base overrides the manifest endpoint for every role, with a passing live probe

- **GIVEN** The S33-OPS-02 router is running and FLEET_URL names it, while the committed manifest still declares its loopback default
- **WHEN** resolveModel() is called for divergent, convergent, judge and embed with the live health probe enabled
- **THEN** Each resolves with provider fleet, an endpoint equal to the configured base (NOT the manifest loopback value), a baseURL ending in /v1, and a litellmModelId present in the router live model list
- **Verify:** `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts`
- **Tier:** integration · **Service:** litellm-fleet-router · **Flow:** UC-INFER-01
- **Scenario:** topology `single-node` · evidence `stdout` · negative control: disconnect, stub, static, mock

### AC-2 — A dead router base fails closed, and the committed manifest still works for laptop dev

- **GIVEN** First a configured base pointing at a real closed port; then no configured base at all with the operator laptop router running at the manifest default
- **WHEN** resolveModel('divergent') is called with the live health probe enabled in each case
- **THEN** The dead base throws RoleUnavailableError naming that endpoint; the unset case falls back to the committed manifest endpoint and resolves successfully
- **Verify:** `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts`
- **Tier:** integration · **Service:** litellm-fleet-router · **Flow:** UC-INFER-05
- **Scenario:** topology `single-node` · evidence `stdout` · negative control: static, stub, mock

### AC-3 — The manifest tells the truth about model revisions, and the one unobtainable role is asserted absent

- **GIVEN** The S33-OPS-02 router live model list and the committed fleet/manifest.json
- **WHEN** Each role litellmModelId and modelRevision are cross-checked against that list and the models the router actually routes to
- **THEN** convergent and judge declare the Qwen3.8-27B-8bit revision, embed declares the served embedding revision, and rerank alone is asserted ABSENT with degradationAction still fail-closed
- **Verify:** `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts`
- **Tier:** integration · **Service:** litellm-fleet-router · **Flow:** UC-INFER-01
- **Scenario:** topology `single-node` · evidence `stdout` · negative control: static, stub, empty

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | All four gating roles resolve to the configured router base with a passing live probe. | AC-1 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts` |
| TC-2 | Resolved endpoints differ from the committed manifest value, proving precedence applied rather than coincidence. | AC-1 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts` |
| TC-3 | A dead base throws RoleUnavailableError instead of silently falling back to the manifest. | AC-2 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts` |
| TC-4 | With no configured base, the committed manifest still resolves against the laptop router (dev not broken). | AC-2 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts` |
| TC-5 | convergent/judge/embed modelRevision names what the router actually serves; rerank alone is asserted absent and still fail-closed. | AC-3 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts` |

## Fixtures

**`ops_router`** — The LiteLLM router deployed on the holocron host by S33-OPS-02, bound 0.0.0.0:4545, capacity-routing to both minis, carrying the embedding entry added by S33-OPS-05. _(seed: cli)_

- container-side base: http://host.docker.internal:4545
- GET /v1/models returns HTTP 200 with a data[] array of length >= 3
- served alias `implementer` -> Qwen3.6-35B-A3B-MLX-8bit on inference1 + inference2
- served alias `reviewer` -> Qwen3.8-27B-8bit on inference1 + inference2 (S33-OPS-01)
- served alias `qwen3-embedding` -> Qwen3-Embedding-0.6B-4bit-DWQ on both minis (S33-OPS-05)
- NOT served: qwen3-reranker (0 reranker models exist anywhere on the fleet)

**`laptop_router_default`** — The operator's existing laptop LiteLLM router at the committed manifest default, used to prove the same committed manifest still resolves for dev with no FLEET_URL set. _(seed: cli)_

- base: http://127.0.0.1:4545
- GET /v1/models returns HTTP 200 including the id `implementer`

**`dead_router_base`** — A real closed TCP port used as the negative control for the live probe — a genuine connection refusal, not a simulated one. _(seed: cli)_

- base: http://127.0.0.1:9
- verified refused by a real connect attempt returning 0 successful connections before the assertion runs

## Reading List

- `services/platform/src/inference/resolve-model.ts` (320-389) — The default (fleet-only) path: entry.endpoint feeds probeRoleHealth and becomes ResolvedModel.endpoint/baseURL. This is where the configured base must take precedence — devops confirmed by read that FLEET_URL is never consulted here today.
- `services/platform/src/inference/resolve-model.ts` (114-172) — isCloudEndpoint guard, normalizeEndpointBase and probeRoleHealth — all must survive the change untouched in behavior.
- `services/platform/fleet/manifest.json` (1-98) — The six hardcoded endpoints (defaultEndpoint + five roles) and each role litellmModelId / modelRevision pair. Only modelRevision changes; endpoints stay as the dev fallback.
- `services/platform/src/etl/vectors.ts` (410-420) — Existing ad-hoc endpointOverride = process.env.FLEET_URL — the one-off this task generalizes. Remove it once precedence lands so there is a single rule.
- `services/platform/src/fleet/manifest.ts` (36-80) — READ ONLY. Loader + FLEET_MANIFEST_PATH override. MK6-FLEET-001 owns this file; understand it, do not edit it.

## Guardrails

**WRITE-ALLOWED**

- services/platform/src/inference/resolve-model.ts (MODIFY)
- services/platform/fleet/manifest.json (MODIFY — modelRevision truth only; endpoints stay as the dev fallback)
- services/platform/src/etl/vectors.ts (MODIFY — remove the superseded one-off FLEET_URL override only)
- services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts (NEW)

**WRITE-PROHIBITED**

- services/platform/src/fleet/manifest.ts - MK6-FLEET-001 owns the loader
- services/platform/src/fleet/manifest.schema.ts - MK6-FLEET-001 owns the schema; reconcile rather than edit
- services/platform/deploy/** - devops lane
- scripts/deploy* - devops lane
- services/platform/src/mcp/** - mcp lane

## Design

**References**

- services/platform/src/inference/resolve-model.ts:332
- services/platform/src/inference/resolve-model.ts:355-381
- services/platform/fleet/manifest.json:3

**Interaction notes**

- Precedence to implement: explicit endpointOverride option > configured router base (FLEET_URL, /v1 suffix normalized off) > manifest role endpoint > manifest defaultEndpoint. Fail closed if none yields a valid non-cloud URL.
- This precedence is why the manifest should NOT be hardcoded to host.docker.internal: the container supplies its own base, the laptop falls through to the committed default, and one committed file stays correct on both hosts.
- health.ts probeFleet already normalizes a trailing /v1 off FLEET_URL; reuse normalizeEndpointBase so the two surfaces cannot drift.
- resolve-model.ts already has endpointOverride as a per-call escape used by tests and etl/vectors.ts. Generalizing that into the default path is the smallest correct change and lets the etl one-off be deleted.

**Pattern** — Configured-base-with-declared-default precedence, terminating in a live probe. The manifest declares intent, the runtime configuration declares location, the probe decides truth.

_Source:_ `services/platform/src/inference/resolve-model.ts:332-353`

**Anti-pattern** — Two independent addresses for one dependency. probeFleet reads FLEET_URL while resolveModel reads the manifest, so /health can go green about a router no model call will ever reach — which is precisely the state the deployed service is in today. Any fix leaving those two reading different sources recreates the bug, including hardcoding the manifest to match one host.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/inference/resolve-model.ts services/platform/src/etl/vectors.ts services/platform/fleet/manifest.json services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts` | Exit 0 |
| typecheck | `pnpm tsgo --noEmit` | Exit 0 |
| unit | `pnpm test:unit` | Exit 0 |
| integration | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts` | Exit 0 |

## Agent Assignment

**mastra-implementer** — The change spans fleet/manifest.json data and src/inference/resolve-model.ts resolution logic — the code path every real model call goes through. Requires a real live probe against the S33-OPS-02 router, which is the mastra-implementer TDD-against-real-services workflow.

## Coding Standards

- No z.any(); manifest parsing stays on the existing Zod schema.
- Endpoint normalization goes through the existing normalizeEndpointBase helper — do not hand-roll a second stripper.
- Preserve the cloud-endpoint refusal on both sides of normalization; do not collapse the two guards.
- Tests probe the real router over real HTTP — no fetchImpl mock in any test that claims a role resolves.

## Boundary Contracts

- SEAM (reconcile with MK6-FLEET-001 before either lands): the name and precedence of the configured router base. This task reads the base from the same key production-deploy writes (FLEET_URL), with the committed manifest endpoint as the declared fallback. If MK6-FLEET-001 lands services/platform/src/fleet/runtime-config.ts first, resolve-model MUST consume that accessor instead of reading env directly — the precedence rule, not the reader, is this task's contract.
- SEAM (S33-OPS-02 + S33-OPS-05): the router model_list carries `implementer` (35B-A3B on both minis), `reviewer` (Qwen3.8-27B-8bit on both minis, from S33-OPS-01) and `qwen3-embedding` (Qwen3-Embedding-0.6B-4bit-DWQ on both minis, from S33-OPS-05). It carries no `qwen3-reranker` entry. The manifest's existing litellmModelId values already match; only modelRevision needs correcting.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-PLAT-02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "ops_router": {
      "description": "The LiteLLM router deployed on the holocron host by S33-OPS-02, bound 0.0.0.0:4545, capacity-routing to both minis, carrying the embedding entry added by S33-OPS-05.",
      "seed_method": "cli",
      "records": [
        "container-side base: http://host.docker.internal:4545",
        "GET /v1/models returns HTTP 200 with a data[] array of length >= 3",
        "served alias `implementer` -> Qwen3.6-35B-A3B-MLX-8bit on inference1 + inference2",
        "served alias `reviewer` -> Qwen3.8-27B-8bit on inference1 + inference2 (S33-OPS-01)",
        "served alias `qwen3-embedding` -> Qwen3-Embedding-0.6B-4bit-DWQ on both minis (S33-OPS-05)",
        "NOT served: qwen3-reranker (0 reranker models exist anywhere on the fleet)"
      ]
    },
    "laptop_router_default": {
      "description": "The operator's existing laptop LiteLLM router at the committed manifest default, used to prove the same committed manifest still resolves for dev with no FLEET_URL set.",
      "seed_method": "cli",
      "records": [
        "base: http://127.0.0.1:4545",
        "GET /v1/models returns HTTP 200 including the id `implementer`"
      ]
    },
    "dead_router_base": {
      "description": "A real closed TCP port used as the negative control for the live probe \u2014 a genuine connection refusal, not a simulated one.",
      "seed_method": "cli",
      "records": [
        "base: http://127.0.0.1:9",
        "verified refused by a real connect attempt returning 0 successful connections before the assertion runs"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the S33-OPS-02 router and a configured base WHEN resolveModel() runs for divergent/convergent/judge/embed with the live probe THEN each resolves to the configured base (differing from the manifest value) with a /v1 baseURL and a served model id.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts",
      "scenario": {
        "id": "S33-PLAT-02/AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet-router",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
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
            "start_ref": "ops_router",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "Set the configured fleet base to the running router, leaving the committed manifest untouched at its loopback default.",
                "GET /v1/models from that router and capture the full id list.",
                "Call resolveModel(role) for divergent, convergent, judge and embed with skipHealth omitted so the live probe runs.",
                "Print each ResolvedModel role, endpoint, baseURL, litellmModelId and modelRevision."
              ]
            },
            "end_state": {
              "must_observe": [
                "exactly 4 roles resolve successfully: divergent, convergent, judge, embed",
                "all 4 resolved.endpoint values === `http://host.docker.internal:4545` and differ from the manifest endpoint field, proving precedence applied",
                "all 4 resolved.baseURL values end with the literal `/v1`",
                "resolved.litellmModelId === `implementer` for divergent and === `reviewer` for convergent and judge",
                "resolved.litellmModelId === `qwen3-embedding` for embed, and all 3 ids appear in the captured live model list"
              ],
              "must_not_observe": [
                "0 of the 4 roles resolving",
                "any resolved.endpoint containing `127.0.0.1`, `localhost` or `::1` while a non-loopback base is configured",
                "any resolved.litellmModelId absent from the router live model list",
                "an empty ResolvedModel returned while the router is unreachable"
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
      "description": "GIVEN a dead configured base THEN RoleUnavailableError is thrown naming it; GIVEN no configured base THEN the committed manifest fallback resolves against the laptop router.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts",
      "scenario": {
        "id": "S33-PLAT-02/AC-2",
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
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "dead_router_base",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "Confirm the chosen port is genuinely closed with a real connect attempt.",
                "Point the configured fleet base at that closed port.",
                "Call resolveModel('divergent') and capture the thrown error."
              ]
            },
            "end_state": {
              "must_observe": [
                "error.code === `ROLE_UNAVAILABLE` on a RoleUnavailableError instance",
                "error.endpoint === `http://127.0.0.1:9`",
                "error.message contains the literal `health probe failed`"
              ],
              "must_not_observe": [
                "0 RoleUnavailableError instances thrown for a dead endpoint",
                "a returned ResolvedModel with healthy === `true`",
                "a silent fallback to the manifest endpoint that masks the misconfiguration",
                "any request to `api.anthropic.com`, `api.openai.com` or `api.deepseek.com`"
              ]
            }
          },
          {
            "start_ref": "laptop_router_default",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "Unset the configured fleet base entirely, reproducing dev conditions.",
                "Call resolveModel('divergent') with the live probe on against the laptop router.",
                "Capture the resolved endpoint."
              ]
            },
            "end_state": {
              "must_observe": [
                "resolve returns healthy === `true`",
                "resolved.endpoint === `http://127.0.0.1:4545`, the committed manifest dev fallback",
                "resolved.litellmModelId === `implementer` and is present in the laptop router live model list of length >= 1"
              ],
              "must_not_observe": [
                "0 successful resolves against the laptop router under normal dev conditions",
                "resolved.endpoint === `http://host.docker.internal:4545` when no base is configured",
                "an empty ResolvedModel carrying no endpoint"
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
      "description": "GIVEN the router live model list WHEN the manifest is cross-checked THEN convergent/judge declare the served 27B revision, embed declares the served embedding revision, and rerank alone is asserted absent with fail-closed intact.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts",
      "scenario": {
        "id": "S33-PLAT-02/AC-3",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet-router",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "stub",
            "empty"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "ops_router",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "GET /v1/models from the router and capture the full id list verbatim.",
                "Load the committed fleet/manifest.json through the real loader.",
                "Assert per role that litellmModelId is present or absent as expected and that modelRevision names the real backing model."
              ]
            },
            "end_state": {
              "must_observe": [
                "the live model id list has length >= 3 and is captured verbatim in evidence",
                "convergent.modelRevision and judge.modelRevision both name the `Qwen3.8-27B-8bit` revision the router routes `reviewer` to",
                "embed.modelRevision names the `Qwen3-Embedding-0.6B-4bit-DWQ` revision and embed.embeddingDimension === 1024",
                "rerank.litellmModelId `qwen3-reranker` appears exactly 0 times in the captured id list",
                "rerank.degradationAction === `fail-closed` and embed.degradationAction === `fail-closed`"
              ],
              "must_not_observe": [
                "1 or more occurrences of `qwen3-reranker` in the live id list",
                "rerank.degradationAction changed to `surface-unavailable` or `queue-and-retry`",
                "rerank retargeted to an unrelated alias, or an empty modelRevision on any role",
                "any modelRevision still claiming the stale `qwen3.6-27b-mtp-q8_0`"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "All four gating roles resolve to the configured router base with a passing live probe.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Resolved endpoints differ from the committed manifest value, proving precedence applied rather than coincidence.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "A dead base throws RoleUnavailableError instead of silently falling back to the manifest.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "With no configured base, the committed manifest still resolves against the laptop router (dev not broken).",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "convergent/judge/embed modelRevision names what the router actually serves; rerank alone is asserted absent and still fail-closed.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-02-fleet-base-resolution.test.ts"
    }
  ]
}
-->
