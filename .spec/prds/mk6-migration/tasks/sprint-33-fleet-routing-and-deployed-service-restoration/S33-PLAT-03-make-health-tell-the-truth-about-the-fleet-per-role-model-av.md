# S33-PLAT-03: Make /health tell the truth about the fleet: per-role model availability, not just endpoint reachability

> Status: ✅ Completed
> Cycle: 3
> Commit: 41dc2bc1b26bdb74dc57815f9fa1f0a4c69a5992
> Reviewer: product-manager + mastra-reviewer
> Completed: 2026-08-18T03:59:47Z
> Assignee: mastra-implementer
> Priority: P0
> Type: FEATURE
> Effort: M · 165 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: S33-PLAT-02, S33-OPS-02, S33-OPS-05
> Blocks: S33-PLAT-05

## Outcome

probeFleet() (health.ts:204-254) sets ready = res.ok on GET /v1/models. A router answering with an empty or wrong model list therefore reports the fleet healthy while every real model call fails. Replace endpoint-reachability-only readiness with a per-role cross-check between the manifest declared litellmModelIds and the ids the router actually serves, and surface the result honestly — including the roles that are missing.

**Success state:** GET /health reports fleet.roles with a present boolean per role, fleet.unavailable_roles listing every role whose model the router does not serve, and fleet.ready true only when the four gating roles are all present. With a manifest naming an unserved model for divergent OR for embed, fleet.ready is false and failing_dependency is fleet. On the real deployment, rerank alone is reported present:false with degradationAction fail-closed while the service is otherwise ok.

## Critical Constraints

**MUST**

- fleet.ready must become false when ANY GATING role (divergent, convergent, judge, embed) names a model the router does not serve — endpoint reachability alone must no longer be sufficient.
- Report per-role presence explicitly, including the roles that are absent, so no consumer can infer capability the fleet does not have.
- Keep the probe bounded — the existing 3s fleet budget is what keeps /health from hanging; the role cross-check reuses the single /v1/models response rather than issuing one request per role.

**NEVER**

- Never report rerank as present. Never let embed silently stop gating — AC-1 case[1] is the regression guard for that rule.
- Never flip a role degradationAction, or drop a role from the manifest, to make /health green.
- Never return a statically-true fleet.ready — every field must derive from the live /v1/models response for this request.

**STRICTLY**

- RULING (orchestrator, recorded for audit): readiness gates on divergent, convergent, judge AND embed. rerank does NOT gate: no qwen3-reranker model exists anywhere on this fleet, and gating on a model that exists nowhere pins /health at 503 permanently — a permanently-red readiness signal is no more honest than a green one, just as uninformative. rerank is reported present:false inside the green response; that is where the honesty lives. embed DOES gate: it is fail-closed, its absence kills search and re-embedding — the exact capability the laptop-off-the-tailnet premise is about — and unlike rerank it is obtainable (335 MB, provisioned by S33-OPS-05).
- This task decides what `ready` MEANS. It does not decide where the fleet IS (S33-PLAT-02) or how it is deployed (devops lane).
- Whether HTTP 503 is returned is governed by the existing HOLO_PRODUCTION_READINESS / allReady logic — do not add a second, parallel status rule.

## Acceptance Criteria

### AC-1 — A gating role naming an unserved model makes fleet.ready false — proven for a chat role AND for embed

- **GIVEN** The router is reachable and answering GET /v1/models, and the manifest names a model id absent from that list for a gating role
- **WHEN** runHealthCheck() executes against the real router
- **THEN** fleet.ready is false, failing_dependency is fleet, and that role reports present false — even though the endpoint itself answered HTTP 200
- **Verify:** `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts`
- **Tier:** integration · **Service:** litellm-fleet-router · **Flow:** UC-PLAT-02
- **Scenario:** topology `single-node` · evidence `api_response` · negative control: static, stub, mock, empty

### AC-2 — With the committed manifest, the four gating roles report present and rerank alone reports absent

- **GIVEN** The S33-OPS-02 plus S33-OPS-05 router is reachable and the committed manifest is in force
- **WHEN** runHealthCheck() executes against the real router
- **THEN** fleet.roles reports present true for divergent, convergent, judge and embed; present false for rerank with degradationAction fail-closed; fleet.unavailable_roles equals exactly [rerank]; and fleet.ready is true
- **Verify:** `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts`
- **Tier:** integration · **Service:** litellm-fleet-router · **Flow:** UC-INFER-05
- **Scenario:** topology `single-node` · evidence `api_response` · negative control: static, stub, mock, disconnect

### AC-3 — The deployed service reports the same truth over the tailnet

- **GIVEN** The redeployed holocron service is running against the provisioned router with the laptop off the tailnet
- **WHEN** A second tailnet device requests GET /health
- **THEN** status is ok, fleet.ready is true, all four gating roles are present, and rerank alone is reported absent
- **Verify:** `curl -sS https://holocron.tail011a51.ts.net:44111/health | jq -e '.status=="ok" and .fleet.ready==true and .fleet.roles.embed.present==true and .fleet.roles.rerank.present==false and ((.fleet.unavailable_roles|sort) == ["rerank"])'`
- **Tier:** e2e · **Service:** deployed-holocron-health · **Flow:** UC-PLAT-02
- **Scenario:** topology `single-node` · evidence `api_response` · negative control: static, disconnect, stub

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | An unserved divergent alias against a reachable router yields fleet.ready false and failing_dependency fleet. | AC-1 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts` |
| TC-2 | An unserved embed alias also yields fleet.ready false, proving embed gates readiness and cannot regress silently. | AC-1 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts` |
| TC-3 | With the committed manifest, all four gating roles report present true against the raw model list. | AC-2 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts` |
| TC-4 | rerank alone reports present false with degradationAction fail-closed and is the single entry in unavailable_roles. | AC-2 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts` |
| TC-5 | The deployed /health reports ready true with embed present and rerank visibly absent. | AC-3 | `curl -sS https://holocron.tail011a51.ts.net:44111/health | jq -e '.status=="ok" and .fleet.ready==true and .fleet.roles.embed.present==true and .fleet.roles.rerank.present==false'` |

## Fixtures

**`manifest_repo_default`** — The committed services/platform/fleet/manifest.json as landed by S33-PLAT-02, loaded through the real loader. _(seed: cli)_

- 5 roles: divergent (implementer), convergent (reviewer), judge (reviewer), embed (qwen3-embedding), rerank (qwen3-reranker)
- embed.degradationAction = fail-closed; rerank.degradationAction = fail-closed

**`manifest_divergent_alias_unserved`** — A real manifest file written to a temp path and loaded via FLEET_MANIFEST_PATH, identical to the repo default except that the divergent role names a model id the live router provably does not serve. _(seed: cli)_

- divergent.litellmModelId = s33-model-that-does-not-exist
- all other roles unchanged from manifest_repo_default
- written to a temp path; 0 modifications to the committed manifest

**`manifest_embed_alias_unserved`** — A real manifest file written to a temp path, identical to the repo default except that the embed role names a model id the live router provably does not serve. Proves the embed-gates-readiness rule is asserted somewhere and cannot regress silently. _(seed: cli)_

- embed.litellmModelId = s33-embedding-that-does-not-exist
- all other roles unchanged from manifest_repo_default
- written to a temp path; 0 modifications to the committed manifest

**`ops_router`** — The running LiteLLM router deployed on the holocron host by S33-OPS-02 and extended by S33-OPS-05, whose GET /v1/models is the observed side of the cross-check. _(seed: cli)_

- GET /v1/models returns HTTP 200 with a data[] id list of length >= 3 containing `implementer`, `reviewer` and `qwen3-embedding`
- the list contains qwen3-reranker exactly 0 times
- the list contains s33-model-that-does-not-exist exactly 0 times
- the list contains s33-embedding-that-does-not-exist exactly 0 times

## Reading List

- `services/platform/src/http/health.ts` (200-254) — probeFleet() — ready = res.ok is the exact untruth being fixed. Note the 3s AbortController budget the new cross-check must stay inside.
- `services/platform/src/http/health.ts` (104-165) — FleetProbeResult / HealthBody types — the additive fleet.roles and fleet.unavailable_roles fields go here.
- `services/platform/src/http/health.ts` (395-481) — runHealthCheck assembly, allReady, and failingDependency precedence — the new readiness must flow through the existing single status rule.
- `services/platform/src/inference/probe-capability.ts` (1-75) — Existing per-role probing shape. Follow its structure; do NOT call generateObject from /health — far too heavy for a readiness endpoint.
- `services/platform/fleet/manifest.json` (1-98) — Declared litellmModelId + degradationAction per role — the left-hand side of the cross-check.

## Guardrails

**WRITE-ALLOWED**

- services/platform/src/http/health.ts (MODIFY)
- services/platform/src/inference/probe-fleet-roles.ts (NEW)
- services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts (NEW)

**WRITE-PROHIBITED**

- services/platform/fleet/manifest.json - S33-PLAT-02 owns the manifest data; this task reads it
- services/platform/src/fleet/manifest.schema.ts - MK6-FLEET-001 owns the schema
- services/platform/deploy/** - devops lane
- services/platform/src/mcp/** - mcp lane

## Design

**References**

- services/platform/src/http/health.ts:204-254
- services/platform/src/http/health.ts:438-443
- services/platform/src/inference/probe-capability.ts:344-372

**Interaction notes**

- One GET /v1/models per health request serves both the reachability check and every role cross-check — do not fan out per role, that multiplies /health latency by five. Non-negotiable per orchestrator carry-forward.
- The manifest read must be resilient: if the manifest fails to load, fleet.ready must be false with an explicit error rather than an exception escaping runHealthCheck (which today has no try/catch around the fleet probe).
- Readiness classification: divergent, convergent, judge and embed gate fleet.ready; rerank is reported but does not gate because no reranker model exists anywhere on the fleet. Record this rule and its reason in a comment so a reviewer can audit the judgment rather than guess at it.
- Keep FleetProbeResult existing fields byte-compatible — MK6-FLEET-001 AC-3 asserts on fleet.ready.

**Pattern** — Declared-vs-observed cross-check: the manifest declares what each role needs, one live response observes what exists, readiness is the intersection over the roles that must work — with the difference reported rather than swallowed.

_Source:_ `services/platform/src/inference/probe-capability.ts:344-372 (compareManifestToProbe)`

**Anti-pattern** — Readiness that measures the wrong thing. `ready = res.ok` on /v1/models proves a process is listening, which is the one claim that is worthless here — the outage is a reachable-but-useless fleet. A green health check that cannot distinguish a loaded router from an empty one is a lie with a 200 status code.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/http/health.ts services/platform/src/inference/probe-fleet-roles.ts services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts` | Exit 0 |
| typecheck | `pnpm tsgo --noEmit` | Exit 0 |
| unit | `pnpm test:unit` | Exit 0 |
| integration | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts` | Exit 0 |
| deployed-service | `curl -sS https://holocron.tail011a51.ts.net:44111/health | jq -e '.status=="ok" and .fleet.ready==true and .fleet.roles.embed.present==true and .fleet.roles.rerank.present==false'` | Exit 0 |

## Agent Assignment

**mastra-implementer** — Changes readiness semantics in services/platform/src/http/health.ts plus a new per-role probe module under src/inference/ — both squarely in this lane, and both require a real router with a genuinely incomplete model list to verify.

## Coding Standards

- No z.any(); the per-role probe result is a concrete typed record.
- Bounded I/O: reuse the existing AbortController + 3s budget; no unbounded fetch in a readiness path.
- No static readiness values anywhere in the fleet probe — every boolean derives from this request's response.
- Tests use the real router; a test that passes with the router stopped is not evidence.

## Boundary Contracts

- The /health response gains `fleet.roles` (per-role presence) and `fleet.unavailable_roles`. Consumers asserting on /health — MK6-FLEET-001 AC-3 and the sprint human testing gate step 2 — must be told about the additive fields. Existing fields (fleet.ready, fleet.endpoint, fleet.latency_ms, failing_dependency) keep their names and types.
- S33-OPS-05 puts `qwen3-embedding` on both minis and on the holocron router, so `embed` resolves with the laptop off the tailnet. Only `qwen3-reranker` remains unobtainable, making `fleet.unavailable_roles` exactly [rerank] on the holocron deployment.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-PLAT-03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "manifest_repo_default": {
      "description": "The committed services/platform/fleet/manifest.json as landed by S33-PLAT-02, loaded through the real loader.",
      "seed_method": "cli",
      "records": [
        "5 roles: divergent (implementer), convergent (reviewer), judge (reviewer), embed (qwen3-embedding), rerank (qwen3-reranker)",
        "embed.degradationAction = fail-closed; rerank.degradationAction = fail-closed"
      ]
    },
    "manifest_divergent_alias_unserved": {
      "description": "A real manifest file written to a temp path and loaded via FLEET_MANIFEST_PATH, identical to the repo default except that the divergent role names a model id the live router provably does not serve.",
      "seed_method": "cli",
      "records": [
        "divergent.litellmModelId = s33-model-that-does-not-exist",
        "all other roles unchanged from manifest_repo_default",
        "written to a temp path; 0 modifications to the committed manifest"
      ]
    },
    "manifest_embed_alias_unserved": {
      "description": "A real manifest file written to a temp path, identical to the repo default except that the embed role names a model id the live router provably does not serve. Proves the embed-gates-readiness rule is asserted somewhere and cannot regress silently.",
      "seed_method": "cli",
      "records": [
        "embed.litellmModelId = s33-embedding-that-does-not-exist",
        "all other roles unchanged from manifest_repo_default",
        "written to a temp path; 0 modifications to the committed manifest"
      ]
    },
    "ops_router": {
      "description": "The running LiteLLM router deployed on the holocron host by S33-OPS-02 and extended by S33-OPS-05, whose GET /v1/models is the observed side of the cross-check.",
      "seed_method": "cli",
      "records": [
        "GET /v1/models returns HTTP 200 with a data[] id list of length >= 3 containing `implementer`, `reviewer` and `qwen3-embedding`",
        "the list contains qwen3-reranker exactly 0 times",
        "the list contains s33-model-that-does-not-exist exactly 0 times",
        "the list contains s33-embedding-that-does-not-exist exactly 0 times"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a reachable router and a manifest gating role naming an unserved model WHEN runHealthCheck() runs THEN fleet.ready is false, failing_dependency is fleet, and that role reports present false. Proven for BOTH a chat-serving role and the embed role.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts",
      "scenario": {
        "id": "S33-PLAT-03/AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet-router",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "stub",
            "mock",
            "empty"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "manifest_divergent_alias_unserved",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "Write the temp manifest and point FLEET_MANIFEST_PATH at it.",
                "Confirm with a real GET /v1/models that the router answers HTTP 200 and does not list the bogus id.",
                "Call runHealthCheck() against the real router and capture the full HealthBody."
              ]
            },
            "end_state": {
              "must_observe": [
                "fleet.ready === `false`",
                "failing_dependency === `fleet`",
                "fleet.roles.divergent.present === `false` with the offending id `s33-model-that-does-not-exist` echoed in the role entry",
                "fleet.latency_ms >= 1, proving the /v1/models request really ran",
                "the captured router model list has length >= 3, so this is a cross-check failure and not an unreachable router"
              ],
              "must_not_observe": [
                "an empty or absent fleet.roles object",
                "fleet.ready === `true`",
                "failing_dependency === null while divergent names an unserved model"
              ]
            }
          },
          {
            "start_ref": "manifest_embed_alias_unserved",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "Write the temp manifest naming an unserved embed model and point FLEET_MANIFEST_PATH at it.",
                "Confirm with a real GET /v1/models that the router answers HTTP 200 and does not list the bogus embedding id.",
                "Call runHealthCheck() against the real router and capture the full HealthBody."
              ]
            },
            "end_state": {
              "must_observe": [
                "fleet.ready === `false`, proving embed gates readiness and not only the chat trio",
                "failing_dependency === `fleet`",
                "fleet.roles.embed.present === `false` with the offending id `s33-embedding-that-does-not-exist` echoed in the role entry",
                "fleet.roles.divergent.present === `true` in the same response, isolating embed as the sole cause",
                "fleet.unavailable_roles has length 2 and sorted equals [`embed`, `rerank`]"
              ],
              "must_not_observe": [
                "an empty fleet.unavailable_roles array while embed is unserved",
                "fleet.ready === `true` while embed is unserved",
                "fleet.roles.embed.present === `true`"
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
      "description": "GIVEN the committed manifest and the provisioned router WHEN runHealthCheck() runs THEN the four gating roles report present true, rerank alone reports present false with fail-closed, unavailable_roles equals rerank only, and fleet.ready is true.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts",
      "scenario": {
        "id": "S33-PLAT-03/AC-2",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet-router",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "stub",
            "mock",
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "manifest_repo_default",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "Use the committed manifest with the configured base pointing at the provisioned router.",
                "Call runHealthCheck() and capture the full HealthBody plus the raw /v1/models list.",
                "Compare fleet.roles against the raw list entry by entry."
              ]
            },
            "end_state": {
              "must_observe": [
                "fleet.roles has exactly 5 entries: divergent, convergent, judge, embed, rerank",
                "fleet.roles.divergent.present === `true`, fleet.roles.convergent.present === `true`, fleet.roles.judge.present === `true`",
                "fleet.roles.embed.present === `true`, each id verified against the raw model list",
                "fleet.roles.rerank.present === `false` and fleet.roles.rerank.degradationAction === `fail-closed`",
                "fleet.unavailable_roles has length 1 and equals [`rerank`]",
                "fleet.ready === `true`"
              ],
              "must_not_observe": [
                "an empty or absent fleet.unavailable_roles array",
                "fleet.unavailable_roles having length 2 or containing `embed`",
                "fleet.roles.rerank.present === `true`",
                "any of the 5 role entries missing its present boolean"
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
      "description": "GIVEN the redeployed service WHEN /health is requested over the tailnet THEN status ok, fleet.ready true, all four gating roles present, and rerank alone reported absent.",
      "verify": "curl -sS https://holocron.tail011a51.ts.net:44111/health | jq -e '.status==\"ok\" and .fleet.ready==true and .fleet.roles.embed.present==true and .fleet.roles.rerank.present==false and ((.fleet.unavailable_roles|sort) == [\"rerank\"])'",
      "scenario": {
        "id": "S33-PLAT-03/AC-3",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "deployed-holocron-health",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
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
            "start_ref": "ops_router",
            "action": {
              "actor": "operator from a tailnet device that is NOT the laptop, with the laptop off the tailnet",
              "steps": [
                "curl -sS https://holocron.tail011a51.ts.net:44111/health",
                "Save the full JSON body verbatim to the task evidence directory.",
                "Confirm the reported fleet.endpoint is the configured holocron-host router value."
              ]
            },
            "end_state": {
              "must_observe": [
                "HTTP 200 with status === `ok`",
                "fleet.ready === `true` with all 4 gating roles reporting present === `true`",
                "fleet.roles.embed.present === `true` with the laptop off the tailnet, proving the embedding model is mini-resident",
                "fleet.roles.rerank.present === `false`, the honest gap visible inside the green response",
                "fleet.unavailable_roles sorted equals [`rerank`] with length 1"
              ],
              "must_not_observe": [
                "an empty or absent fleet.roles object in the response",
                "status === `degraded` or HTTP 503",
                "failing_dependency === `fleet`",
                "fleet.roles.embed.present === `false` while the laptop is off the tailnet"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "An unserved divergent alias against a reachable router yields fleet.ready false and failing_dependency fleet.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "An unserved embed alias also yields fleet.ready false, proving embed gates readiness and cannot regress silently.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "With the committed manifest, all four gating roles report present true against the raw model list.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "rerank alone reports present false with degradationAction fail-closed and is the single entry in unavailable_roles.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-03-fleet-role-readiness.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "The deployed /health reports ready true with embed present and rerank visibly absent.",
      "maps_to_ac": "AC-3",
      "verify": "curl -sS https://holocron.tail011a51.ts.net:44111/health | jq -e '.status==\"ok\" and .fleet.ready==true and .fleet.roles.embed.present==true and .fleet.roles.rerank.present==false'"
    }
  ]
}
-->
