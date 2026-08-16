# S33-OPS-04: Fix the fictional FLEET_URL example and prove the fleet dependency chain has zero laptop coupling

> Status: Backlog
> Assignee: devops-engineer
> Priority: P1
> Type: CONFIG
> Effort: S · 45 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: devops-engineer
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: S33-OPS-02, S33-OPS-03
> Blocks: —

## Outcome

Remove the last documentation drift (a fictional fleet hostname) from the deploy contract and provide a deterministic, inspectable, live-reconfirmed guarantee that the fleet-serving path has zero laptop dependency, so the sprint's human testing gate has nothing left to trip on from this lane.

**Success state:** production.env.example contains no reference to the fictional 'inference-fleet' hostname; grep across services/platform/deploy/** for fleet-related config shows zero references to 'laptop' or a laptop-only IP; live curl from this laptop to inference1:8003, inference2:8003, and holocron:4545 each succeed independently (peer-to-peer Tailscale reachability, not proxied through the laptop).

## Critical Constraints

**MUST**

- Replace the fictional `FLEET_URL=http://inference-fleet:4545/v1` placeholder in production.env.example with either the correct real default (omit it, relying on production-deploy.ts's host.docker.internal:4545 default, now backed by S33-OPS-02's live router) or an explicit comment documenting that value with a working example.
- Prove — by config inspection AND live network calls from a real device other than holocron — that nothing in the fleet-serving path (router.compose.yaml, compose.yaml scheduler/mastra fleet vars) references the laptop's hostname, IP, or a loopback address that would only resolve on the laptop.
- Coordinate the corrected FLEET_URL value with S33-PLAT-01's services/platform/config/secrets.example.yaml so the two example files state the same value — different files, no edit collision, but they must agree.

**NEVER**

- Never claim a literal 'unplugged the laptop's Tailscale and it kept working' drill was executed from a single-device planning/implementation session — that specific cross-device drill belongs to the sprint's Human Testing Gate (kb-run-human-tests with a real second device), not this task.

## Acceptance Criteria

### AC-1 — production.env.example no longer names a fictional host

- **GIVEN** production.env.example line 6 currently reads FLEET_URL=http://inference-fleet:4545/v1, a hostname that resolves nowhere on the real tailnet.
- **WHEN** The line is corrected to a real, resolvable value or removed in favor of the documented host.docker.internal default.
- **THEN** grep -rn 'inference-fleet' services/platform/deploy/ returns no matches, and `docker compose -f compose.yaml --env-file production.env.example config --quiet` still renders successfully.
- **Verify:** `grep -rn 'inference-fleet' services/platform/deploy/ ; echo exit=$?  # must be 1 (no match) ; docker compose -f services/platform/deploy/compose/compose.yaml --env-file services/platform/deploy/compose/production.env.example config --quiet`
- **Tier:** integration · **Service:** docker compose config render (real CLI, real files) · **Flow:** UC-PLAT-05
- **Scenario:** topology `single-node` · evidence `stdout` · negative control: static

### AC-2 — Fleet-serving path is provably laptop-independent

- **GIVEN** router.compose.yaml (S33-OPS-02) and compose.yaml's scheduler/mastra fleet vars (S33-OPS-03) reference only inference1/inference2/holocron endpoints.
- **WHEN** A grep across the fleet-related deploy config is run, and independent live curls are made from this laptop to each of the three real hosts.
- **THEN** Zero occurrences of 'laptop' or a laptop-only address in fleet-related config; inference1:8003/v1/models, inference2:8003/v1/models, and holocron:4545/v1/models each respond directly and independently (none proxied through another).
- **Verify:** `grep -rniE 'laptop|100\.123\.216\.92' services/platform/deploy/compose/router.compose.yaml services/platform/deploy/compose/compose.yaml ; curl -sS http://inference1.tail011a51.ts.net:8003/v1/models ; curl -sS http://inference2.tail011a51.ts.net:8003/v1/models ; curl -sS http://holocron.tail011a51.ts.net:4545/v1/models`
- **Tier:** integration · **Service:** real tailnet endpoints (inference1, inference2, holocron) · **Flow:** UC-PLAT-05
- **Scenario:** topology `multi-node` · evidence `api_response` · negative control: disconnect

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | no fictional hostname remains in the deploy contract | AC-1 | `grep -rn 'inference-fleet' services/platform/deploy/` |
| TC-2 | fleet config has zero laptop references | AC-2 | `grep -rniE 'laptop|100\.123\.216\.92' services/platform/deploy/compose/router.compose.yaml services/platform/deploy/compose/compose.yaml` |

## Fixtures

**`fictional-hostname`** — The current placeholder that must not survive this task. _(seed: cli)_

- services/platform/deploy/compose/production.env.example:6 FLEET_URL=http://inference-fleet:4545/v1

## Reading List

- `services/platform/deploy/compose/production.env.example` (1-16) — the fictional FLEET_URL placeholder to fix

## Guardrails

**WRITE-ALLOWED**

- services/platform/deploy/compose/production.env.example (MODIFY)

**WRITE-PROHIBITED**

- services/platform/src/** - mastra-planner's lane
- services/platform/fleet/manifest.json - mastra-planner's lane
- services/platform/config/secrets.example.yaml - S33-PLAT-01's file, coordinate value only, do not edit

## Design

**Interaction notes**

- AC-2 kept as topology:multi-node after the reword-vs-downgrade test: its subject genuinely is device independence (no laptop proxying), so it earns the declaration honestly rather than by wording alone. Strengthened with a real assertion — inference1's and inference2's /v1/models response bodies are asserted NOT byte-identical, which only holds if they are two independently-running oMLX processes each reporting their own real state, not a single relayed/fixture response standing in for both.

**Pattern** — Documentation-drift correction plus deterministic config-grep + live-reachability proof

_Source:_ `services/platform/deploy/compose/README.md`

**Anti-pattern** — Fabricating a laptop-unplugged drill result from a single-device session instead of leaving that specific cross-device step to kb-run-human-tests

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| no fictional hostname | `grep -rn 'inference-fleet' services/platform/deploy/` | no matches (exit 1) |
| no laptop coupling in fleet config | `grep -rniE 'laptop|100\.123\.216\.92' services/platform/deploy/compose/router.compose.yaml services/platform/deploy/compose/compose.yaml` | no matches (exit 1) |

## Agent Assignment

**devops-engineer** — Deploy-contract example/documentation correction plus a config-grep + live-reachability topology proof is deployment-contract hygiene within devops-engineer's owned services/platform/deploy/** lane.

## Coding Standards

- Keep example/documentation files honest about what actually resolves — a fictional hostname in an .example file is a real operator trap.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-OPS-04",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": false
  },
  "fixtures": {
    "fictional-hostname": {
      "description": "The current placeholder that must not survive this task.",
      "seed_method": "cli",
      "records": [
        "services/platform/deploy/compose/production.env.example:6 FLEET_URL=http://inference-fleet:4545/v1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a fictional FLEET_URL placeholder WHEN it is corrected THEN no reference remains and compose config still renders",
      "verify": "grep -rn 'inference-fleet' services/platform/deploy/",
      "scenario": {
        "id": "AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "docker compose CLI",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fictional-hostname",
            "action": {
              "actor": "devops-engineer",
              "steps": [
                "edit production.env.example FLEET_URL line",
                "run grep + compose config"
              ]
            },
            "end_state": {
              "must_observe": [
                "grep -rn 'inference-fleet' services/platform/deploy/ exits 1 (no matches)",
                "docker compose config --quiet exits 0"
              ],
              "must_not_observe": [
                "'inference-fleet' string present anywhere under services/platform/deploy/",
                "grep -rn 'inference-fleet' services/platform/deploy/ returning more than 0 matching lines"
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
      "description": "GIVEN the packaged router+scheduler wiring WHEN inspected and live-queried THEN zero laptop coupling exists and all three hosts respond independently",
      "verify": "grep + 3x curl",
      "scenario": {
        "id": "AC-2",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "inference1:8003 + inference2:8003 + holocron:4545",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fictional-hostname",
            "action": {
              "actor": "devops-engineer",
              "steps": [
                "grep fleet config for laptop references",
                "curl each of the three real hosts independently \u2014 inference1 and inference2 are two devices queried separately from holocron, each proving its own direct reachability rather than being inferred from the other"
              ]
            },
            "end_state": {
              "must_observe": [
                "grep for 'laptop' in fleet config returns 0 matches",
                "all three curls return HTTP 200 with a real model list",
                "the inference1 and inference2 /v1/models response bodies are not byte-identical to each other (each device's own oMLX process reports its own model set/load timestamps independently \u2014 a single relayed or fixture response could not produce this)"
              ],
              "must_not_observe": [
                "any fleet-related config line referencing 'laptop.tail011a51.ts.net' or '100.123.216.92'",
                "grep -rniE 'laptop|100\\.123\\.216\\.92' returning more than 0 matches",
                "inference1 and inference2 /v1/models responses being byte-identical (would indicate a single shared/relayed source, not two independent devices)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "no fictional hostname",
      "maps_to_ac": "AC-1",
      "verify": "grep -rn 'inference-fleet' services/platform/deploy/"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "no laptop coupling",
      "maps_to_ac": "AC-2",
      "verify": "grep -rniE 'laptop|100\\.123\\.216\\.92' ..."
    }
  ]
}
-->
