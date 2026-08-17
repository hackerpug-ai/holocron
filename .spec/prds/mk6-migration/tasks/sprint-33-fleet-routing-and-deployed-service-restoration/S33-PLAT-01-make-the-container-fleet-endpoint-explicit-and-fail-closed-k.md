# S33-PLAT-01: Make the container fleet endpoint explicit and fail-closed (kill the implicit host.docker.internal default and the unconditional loopback rewrite)

> Status: 🟡 In Progress
> Updated: 2026-08-17T22:09:44Z
> Assignee: mastra-implementer
> Priority: P0
> Type: FEATURE
> Effort: S · 75 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: S33-OPS-02
> Blocks: S33-PLAT-02, S33-PLAT-05

## Outcome

Remove the two laptop-era assumptions in fleetUrlForContainer (production-deploy.ts:447-462) — the http://host.docker.internal:4545/v1 default when FLEET_URL is unset, and the unconditional 127.0.0.1/localhost/::1 -> host.docker.internal rewrite — replacing both with an explicit, fail-closed resolution so a redeploy can no longer silently re-point the container at an address the operator never chose.

**Success state:** A deploy with no FLEET_URL in consolidated secrets aborts with FLEET_URL_REQUIRED and writes no runtime secrets file. A deploy with an explicit FLEET_URL (including http://host.docker.internal:4545) writes that exact endpoint into runtime secrets. A deploy with a loopback FLEET_URL and no explicit co-location opt-in aborts with FLEET_URL_LOOPBACK_REFUSED, naming host.docker.internal as the co-located remedy. The deployed service /health then reports fleet.ready true with failing_dependency no longer fleet.

## Critical Constraints

**MUST**

- Fail closed with a named, greppable error when FLEET_URL is absent from consolidated secrets — the deploy must stop, not synthesize an endpoint.
- ACCEPT `http://host.docker.internal:4545` as a valid EXPLICIT operator-supplied value and write it verbatim. It is the correct co-located topology for holocron, proven live by S33-OPS-02. The defect being fixed is the implicit default and the silent rewrite, NOT the hostname.
- Preserve the existing rejections: URL credentials in FLEET_URL are still refused; invalid URLs are still refused.
- AC-1 and AC-2 are independently runnable with no devops dependency — only AC-3 needs S33-OPS-02 deployed.

**NEVER**

- Never keep `http://host.docker.internal:4545/v1` (or any other address) as an IMPLICIT default for an unset FLEET_URL. A missing value must stop the deploy, not become a confident guess.
- Never rewrite a loopback FLEET_URL to host.docker.internal unconditionally — silently translating operator intent is what made this fault survive every redeploy.
- Never log, echo, or write FLEET_KEY or any secret value into evidence or error text; endpoint host is reportable, credentials are not.

**STRICTLY**

- This task changes ONLY the resolution rule in production-deploy.ts. Compose files, env files, launchd plists, and scripts/deploy* belong to the devops lane and are write-prohibited here.
- If S33-OPS-02 has not deployed the holocron-host router, record AC-3 as BLOCKED with the real /health JSON as evidence — do not mark it passed, and do not weaken it.

## Acceptance Criteria

### AC-1 — Missing FLEET_URL aborts the deploy instead of silently defaulting

- **GIVEN** A real consolidated secrets file on disk containing MASTRA_API_KEY, FLEET_KEY and HOLO_KEY_MCP but no FLEET_URL key
- **WHEN** The real runtimeSecrets() resolution path in production-deploy.ts runs against that file with a temp runtimeSecretsPath
- **THEN** The call throws/exits with a message containing FLEET_URL_REQUIRED, and no runtime secrets file is created at the target path
- **Verify:** `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts`
- **Tier:** integration · **Service:** deploy-runtime-secrets-filesystem · **Flow:** UC-PLAT-05
- **Scenario:** topology `single-node` · evidence `file_artifact` · negative control: stub, static, mock

### AC-2 — An explicit FLEET_URL is written verbatim; a loopback one is refused with an actionable remedy, not rewritten

- **GIVEN** Two real consolidated secrets files — one with the explicit http://host.docker.internal:4545, one with http://127.0.0.1:4545/v1
- **WHEN** The real runtimeSecrets() resolution path runs against each in turn with no co-location opt-in set
- **THEN** The explicit case writes a runtime secrets JSON whose FLEET_URL equals the supplied endpoint with no host substitution; the loopback case throws with FLEET_URL_LOOPBACK_REFUSED, names host.docker.internal as the co-located remedy, and writes nothing
- **Verify:** `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts`
- **Tier:** integration · **Service:** deploy-runtime-secrets-filesystem · **Flow:** UC-PLAT-05
- **Scenario:** topology `single-node` · evidence `file_artifact` · negative control: stub, static, mock

### AC-3 — The redeployed service reaches a real fleet at the explicitly configured endpoint

- **GIVEN** S33-OPS-02 has deployed the LiteLLM router on the holocron host and the service carries the explicit FLEET_URL
- **WHEN** A second tailnet device requests GET /health from the deployed service
- **THEN** fleet.ready is true, failing_dependency is no longer fleet, and stopping the router reverts the reading — proving causation
- **Verify:** `curl -sS https://holocron.tail011a51.ts.net:44111/health | jq -e '.fleet.ready==true and .failing_dependency!="fleet"'`
- **Tier:** e2e · **Service:** deployed-holocron-health · **Flow:** UC-PLAT-02
- **Scenario:** topology `single-node` · evidence `api_response` · negative control: disconnect, static, stub

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | An unset FLEET_URL aborts the deploy with FLEET_URL_REQUIRED and writes no runtime secrets file. | AC-1 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts` |
| TC-2 | An explicit host.docker.internal FLEET_URL is persisted byte-identical. | AC-2 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts` |
| TC-3 | A loopback FLEET_URL is refused with FLEET_URL_LOOPBACK_REFUSED naming the co-located remedy, not silently rewritten. | AC-2 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts` |
| TC-4 | A FLEET_URL carrying URL credentials is still refused (existing guard not regressed). | AC-2 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts` |
| TC-5 | The deployed /health reports fleet.ready true, and reverts to false when the router is stopped. | AC-3 | `curl -sS https://holocron.tail011a51.ts.net:44111/health | jq -e '.fleet.ready==true and .failing_dependency!="fleet"'` |

## Fixtures

**`secrets_with_explicit_fleet_url`** — A real consolidated secrets YAML on disk carrying every key runtimeSecrets() requires plus the explicit, live-proven holocron fleet endpoint. Written to a temp path and passed via the secretsPath option. _(seed: cli)_

- MASTRA_API_KEY: <32-byte base64url test value>
- FLEET_KEY: <32-byte base64url test value>
- HOLO_KEY_MCP: <32-byte base64url test value>
- FLEET_URL: http://host.docker.internal:4545

**`secrets_without_fleet_url`** — Identical real secrets YAML with the FLEET_URL key entirely absent — the exact condition that today silently yields host.docker.internal without the operator ever choosing it. _(seed: cli)_

- MASTRA_API_KEY: <32-byte base64url test value>
- FLEET_KEY: <32-byte base64url test value>
- HOLO_KEY_MCP: <32-byte base64url test value>
- FLEET_URL: key absent (0 occurrences in the file)

**`secrets_with_loopback_fleet`** — Identical real secrets YAML whose FLEET_URL is a loopback address. Inside the container 127.0.0.1 is the container itself, so this can never be a correct fleet address. _(seed: cli)_

- MASTRA_API_KEY: <32-byte base64url test value>
- FLEET_KEY: <32-byte base64url test value>
- HOLO_KEY_MCP: <32-byte base64url test value>
- FLEET_URL: http://127.0.0.1:4545/v1

## Reading List

- `services/platform/src/deploy/production-deploy.ts` (447-501) — fleetUrlForContainer() default + loopback rewrite, and runtimeSecrets() which is its only caller — the exact defect surface.
- `services/platform/src/http/health.ts` (204-254) — probeFleet() consumes process.env.FLEET_URL — this is what surfaces the resolved endpoint on /health for AC-3.
- `services/platform/config/secrets.example.yaml` (20-26) — The FLEET_URL key shape in consolidated secrets (currently documents a loopback example that this change makes invalid for container deploys).
- `.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-FLEET-001-tailnet-routing.md` (1-40) — Adjacent task that rejects loopback at PREFLIGHT. Read to avoid duplicating its preflight implementation — this task owns only the deploy-time resolution rule.

## Guardrails

**WRITE-ALLOWED**

- services/platform/src/deploy/production-deploy.ts (MODIFY)
- services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts (NEW)
- services/platform/config/secrets.example.yaml (MODIFY — example value only, no secrets)

**WRITE-PROHIBITED**

- services/platform/deploy/** - devops lane owns compose, env files and launchd (incl. S33-OPS-04's production.env.example fix)
- scripts/deploy* - devops lane
- services/platform/src/fleet/manifest.ts - MK6-FLEET-001 owns the loader/preflight seam
- services/platform/src/fleet/manifest.schema.ts - MK6-FLEET-001 owns the schema
- services/platform/src/mcp/** - mcp lane

## Design

**References**

- services/platform/src/deploy/production-deploy.ts:447-462
- services/platform/src/deploy/production-deploy.ts:490

**Interaction notes**

- fleetUrlForContainer is called exactly once, from runtimeSecrets(). Changing it to throw is sufficient to make the whole deploy fail closed — no separate guard needed.
- deployFail() is the established abort helper in this file; reuse it so the error surfaces through the existing deploy error channel rather than a new exception type.
- The co-location opt-in should be an explicit named key (e.g. FLEET_URL_ALLOW_HOST_LOOPBACK=1) read from the same consolidated secrets/env source, so the escape hatch is auditable in the secrets file rather than implicit in code.
- host.docker.internal is CORRECT for holocron because the router runs on the same physical Mac as the Docker containers and Docker Desktop resolves that name to host-published ports. This is a topology fact, not a code assumption — which is exactly why it belongs in operator-supplied config rather than in a code default.

**Pattern** — Fail-closed resolution with a named error code and an explicit opt-in escape hatch — the same shape already used by deployFail() for MASTRA_API_KEY / FLEET_KEY / HOLO_KEY_MCP.

_Source:_ `services/platform/src/deploy/production-deploy.ts:480-482`

**Anti-pattern** — Silently substituting a plausible-looking default for missing configuration. `raw = value?.trim() || 'http://host.docker.internal:4545/v1'` is the shape that made this outage survive a redeploy — a missing value became a confident value nobody chose. Note the guess happened to be right about the hostname and still produced a months-long outage, because nothing forced anyone to state the topology out loud.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/deploy/production-deploy.ts services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts` | Exit 0 |
| typecheck | `pnpm tsgo --noEmit` | Exit 0 |
| unit | `pnpm test:unit` | Exit 0 |
| integration | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts` | Exit 0 |
| deployed-service | `curl -sS https://holocron.tail011a51.ts.net:44111/health | jq -e '.fleet.ready==true and .failing_dependency!="fleet"'` | Exit 0 |

## Agent Assignment

**mastra-implementer** — Single-file behavioral change in services/platform/src/deploy/production-deploy.ts (platform TypeScript, server-side) plus one integration test against the real filesystem secrets path and the real deployed service. No compose/launchd/router provisioning — that is the devops lane.

## Coding Standards

- No z.any() and no untyped config reads — the resolution result is a concrete string or a thrown deployFail.
- Error codes are stable, greppable literals (FLEET_URL_REQUIRED, FLEET_URL_LOOPBACK_REFUSED) so operators and tests bind to the same token.
- Never interpolate secret values into error strings or evidence; endpoint hosts only.
- Tests hit the real filesystem via temp dirs — no fs mocking, no fake secrets module.

## Boundary Contracts

- FLEET_URL VALUE for the holocron deployment is `http://host.docker.internal:4545` — live-proven by s33-devops against the real deployed service (health flipped 503->200 with zero container restart, and reverted when the router stopped). devops owns the value; production-deploy.ts owns only the resolution rule and must never invent a default.
- Co-located-router rewrite (loopback -> host.docker.internal) survives only behind an explicit opt-in key; MK6-FLEET-001 preflight independently rejects loopback before compose apply. The two must agree on rejection, not overlap in implementation.
- S33-OPS-04 fixes the FLEET_URL placeholder in services/platform/deploy/compose/production.env.example. This task touches services/platform/config/secrets.example.yaml only — different files, no collision, but the two example values must end up consistent.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-PLAT-01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "secrets_with_explicit_fleet_url": {
      "description": "A real consolidated secrets YAML on disk carrying every key runtimeSecrets() requires plus the explicit, live-proven holocron fleet endpoint. Written to a temp path and passed via the secretsPath option.",
      "seed_method": "cli",
      "records": [
        "MASTRA_API_KEY: <32-byte base64url test value>",
        "FLEET_KEY: <32-byte base64url test value>",
        "HOLO_KEY_MCP: <32-byte base64url test value>",
        "FLEET_URL: http://host.docker.internal:4545"
      ]
    },
    "secrets_without_fleet_url": {
      "description": "Identical real secrets YAML with the FLEET_URL key entirely absent \u2014 the exact condition that today silently yields host.docker.internal without the operator ever choosing it.",
      "seed_method": "cli",
      "records": [
        "MASTRA_API_KEY: <32-byte base64url test value>",
        "FLEET_KEY: <32-byte base64url test value>",
        "HOLO_KEY_MCP: <32-byte base64url test value>",
        "FLEET_URL: key absent (0 occurrences in the file)"
      ]
    },
    "secrets_with_loopback_fleet": {
      "description": "Identical real secrets YAML whose FLEET_URL is a loopback address. Inside the container 127.0.0.1 is the container itself, so this can never be a correct fleet address.",
      "seed_method": "cli",
      "records": [
        "MASTRA_API_KEY: <32-byte base64url test value>",
        "FLEET_KEY: <32-byte base64url test value>",
        "HOLO_KEY_MCP: <32-byte base64url test value>",
        "FLEET_URL: http://127.0.0.1:4545/v1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a real consolidated secrets file with no FLEET_URL key WHEN runtimeSecrets() runs THEN it aborts with FLEET_URL_REQUIRED and creates no runtime secrets file.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts",
      "scenario": {
        "id": "S33-PLAT-01/AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "deploy-runtime-secrets-filesystem",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "secrets_without_fleet_url",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "Write the fixture secrets YAML to a temp directory on the real filesystem.",
                "Invoke the real production-deploy runtimeSecrets() with secretsPath=<temp yaml> and runtimeSecretsPath=<temp json that does not exist>.",
                "Capture the thrown error message and stat() the runtimeSecretsPath."
              ]
            },
            "end_state": {
              "must_observe": [
                "error message contains the literal token `FLEET_URL_REQUIRED`",
                "exactly 0 files created at runtimeSecretsPath (existsSync returns `false`)"
              ],
              "must_not_observe": [
                "1 or more files present at runtimeSecretsPath",
                "a runtime secrets JSON containing the substring `host.docker.internal` supplied by a code default rather than the operator",
                "an empty or partial secrets JSON left behind after the abort"
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
      "description": "GIVEN real secrets files with an explicit host.docker.internal and a loopback FLEET_URL WHEN runtimeSecrets() runs with no co-location opt-in THEN the explicit value is persisted verbatim and the loopback value is refused with FLEET_URL_LOOPBACK_REFUSED naming the remedy.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts",
      "scenario": {
        "id": "S33-PLAT-01/AC-2",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "deploy-runtime-secrets-filesystem",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "secrets_with_explicit_fleet_url",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "Write the fixture secrets YAML to a temp directory.",
                "Run runtimeSecrets() with that secretsPath and a temp runtimeSecretsPath.",
                "Read the produced runtime secrets JSON back off disk and compare FLEET_URL to the fixture value."
              ]
            },
            "end_state": {
              "must_observe": [
                "runtime secrets JSON FLEET_URL === `http://host.docker.internal:4545` (byte-identical to the operator-supplied value)",
                "the JSON contains exactly 6 keys: POSTGRES_PASSWORD, DATABASE_URL, MASTRA_API_KEY, FLEET_KEY, ZERO_ADMIN_PASSWORD, FLEET_URL",
                "file mode of the runtime secrets JSON is `0600`"
              ],
              "must_not_observe": [
                "a written FLEET_URL differing from `http://host.docker.internal:4545` in 1 or more bytes",
                "FLEET_URL containing `127.0.0.1`, `localhost`, or `::1`",
                "an empty FLEET_URL field in the written JSON"
              ]
            }
          },
          {
            "start_ref": "secrets_with_loopback_fleet",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "Write the loopback fixture secrets YAML to a temp directory.",
                "Run runtimeSecrets() with no co-location opt-in key present in the environment.",
                "Capture the thrown error and stat() the runtimeSecretsPath."
              ]
            },
            "end_state": {
              "must_observe": [
                "error message contains the literal token `FLEET_URL_LOOPBACK_REFUSED`",
                "error message names the offending host `127.0.0.1` and the remedy `host.docker.internal`",
                "exactly 0 runtime secrets files written (existsSync returns `false`)"
              ],
              "must_not_observe": [
                "1 or more runtime secrets files present after the refusal",
                "a returned FLEET_URL === `http://host.docker.internal:4545` synthesized by the tool rather than supplied by the operator",
                "an empty error message carrying no named code"
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
      "description": "GIVEN the redeployed service against the S33-OPS-02 router WHEN /health is requested THEN fleet.ready is true, failing_dependency is not fleet, and stopping the router reverts it.",
      "verify": "curl -sS https://holocron.tail011a51.ts.net:44111/health | jq -e '.fleet.ready==true and .failing_dependency!=\"fleet\"'",
      "scenario": {
        "id": "S33-PLAT-01/AC-3",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "deployed-holocron-health",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "static",
            "stub"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "secrets_with_explicit_fleet_url",
            "action": {
              "actor": "operator from a tailnet device that is NOT the laptop",
              "steps": [
                "curl -sS https://holocron.tail011a51.ts.net:44111/health and save the JSON body verbatim.",
                "Stop the S33-OPS-02 router, re-request /health, and save that body as the causation control.",
                "Restart the router, re-request /health, and save the third body."
              ]
            },
            "end_state": {
              "must_observe": [
                "fleet.ready === `true` in the router-running response",
                "failing_dependency !== `fleet` in the router-running response",
                "fleet.endpoint === `http://host.docker.internal:4545` (the explicitly configured value)",
                "fleet.latency_ms >= 1 in all 3 captured responses",
                "fleet.ready === `false` in the router-stopped control response"
              ],
              "must_not_observe": [
                "an empty or absent fleet object in any of the 3 responses",
                "fleet.ready === `true` in the router-stopped control response",
                "failing_dependency === `fleet` while the router is running"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "An unset FLEET_URL aborts the deploy with FLEET_URL_REQUIRED and writes no runtime secrets file.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "An explicit host.docker.internal FLEET_URL is persisted byte-identical.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "A loopback FLEET_URL is refused with FLEET_URL_LOOPBACK_REFUSED naming the co-located remedy, not silently rewritten.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "A FLEET_URL carrying URL credentials is still refused (existing guard not regressed).",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-01-fleet-url-fail-closed.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "The deployed /health reports fleet.ready true, and reverts to false when the router is stopped.",
      "maps_to_ac": "AC-3",
      "verify": "curl -sS https://holocron.tail011a51.ts.net:44111/health | jq -e '.fleet.ready==true and .failing_dependency!=\"fleet\"'"
    }
  ]
}
-->
