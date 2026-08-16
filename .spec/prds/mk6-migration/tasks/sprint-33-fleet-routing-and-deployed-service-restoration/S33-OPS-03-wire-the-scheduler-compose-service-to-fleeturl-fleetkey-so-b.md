# S33-OPS-03: Wire the scheduler compose service to FLEET_URL + FLEET_KEY so background missions are no longer model-less

> Status: Backlog
> Assignee: devops-engineer
> Priority: P0
> Type: INFRA
> Effort: S · 60 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: devops-engineer
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no
> Depends on: S33-OPS-02
> Blocks: —

## Outcome

Give the scheduler container the same FLEET_URL/FLEET_KEY visibility mastra already has, so its process environment (read by the same role-resolution code both containers share) is no longer missing the fleet entirely.

**Success state:** compose.yaml's scheduler service declares FLEET_URL as a required env and exports FLEET_KEY from the fleet-key secret; on the live holocron host, a recreated scheduler container has both present in its process environment and its own probe-cli.ts healthcheck still reports healthy.

## Critical Constraints

**MUST**

- Mirror the mastra service's exact existing pattern: FLEET_URL as a required top-level environment var (${FLEET_URL:?FLEET_URL is required}), FLEET_KEY delivered via a mounted secret and exported from /run/secrets/fleet_key inside the command script before exec'ing scheduler-worker.ts.
- Verify the change with docker compose ... config --quiet render AND a real container-level check on the live holocron host — not just a static YAML diff.

**NEVER**

- Never print or log the FLEET_KEY value anywhere in evidence artifacts.
- Never touch mastra's or postgres's or zero-cache's service blocks.
- Never run docker compose down -v or remove the holocron-postgres/holocron-blobs named volumes while recreating the scheduler service.

## Acceptance Criteria

### AC-1 — compose.yaml scheduler service gains FLEET_URL + FLEET_KEY, verified live on holocron

- **GIVEN** compose.yaml's scheduler service currently declares only the database-url secret; live `docker compose config` on holocron fails outright with 'required variable FLEET_URL is missing a value' when invoked directly (confirmed 2026-08-16), and running scheduler containers today have neither var.
- **WHEN** compose.yaml is edited to add FLEET_URL and a fleet-key secret export to the scheduler service (mirroring mastra), and the scheduler service is recreated on holocron with FLEET_URL/FLEET_KEY supplied.
- **THEN** docker exec into the recreated scheduler container shows FLEET_URL present with its real value and FLEET_KEY present (checked for non-empty, value never printed); the scheduler's own probe-cli.ts healthcheck still reports healthy (Docker HEALTHY status) after the recreate.
- **Verify:** `docker exec holocron-production-scheduler-1 sh -c 'printenv FLEET_URL; [ -n "$FLEET_KEY" ] && echo FLEET_KEY_PRESENT' && docker inspect --format='{{.State.Health.Status}}' holocron-production-scheduler-1`
- **Tier:** integration · **Service:** real scheduler container on holocron (docker exec) · **Flow:** UC-PLAT-05
- **Scenario:** topology `single-node` · evidence `stdout` · negative control: disconnect, empty

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | recreated scheduler container has FLEET_URL and FLEET_KEY present | AC-1 | `docker exec holocron-production-scheduler-1 sh -c 'printenv FLEET_URL; [ -n "$FLEET_KEY" ]'` |
| TC-2 | scheduler healthcheck still passes after the recreate | AC-1 | `docker inspect --format='{{.State.Health.Status}}' holocron-production-scheduler-1` |

## Fixtures

**`live-scheduler-container`** — Real running container on holocron, confirmed 2026-08-16. _(seed: cli)_

- container_name=holocron-production-scheduler-1
- image=localhost:5000/holocron-platform
- status=Up 31 minutes (healthy) at time of recon

## Reading List

- `services/platform/deploy/compose/compose.yaml` (49-126) — mastra's FLEET_URL/FLEET_KEY pattern to mirror exactly on scheduler

## Guardrails

**WRITE-ALLOWED**

- services/platform/deploy/compose/compose.yaml (MODIFY - scheduler service block only)

**WRITE-PROHIBITED**

- services/platform/src/** - mastra-planner's lane
- services/platform/deploy/compose/compose.yaml postgres/mastra/zero-cache blocks - out of this task's scope

## Design

**Pattern** — Mirror mastra's existing secret-injection command-script pattern verbatim for the scheduler service

_Source:_ `services/platform/deploy/compose/compose.yaml:56-76`

**Anti-pattern** — Passing FLEET_KEY as a plain environment literal instead of the secrets/command-export mechanism already used by mastra

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| compose config renders with FLEET_URL required | `docker compose -f services/platform/deploy/compose/compose.yaml --env-file services/platform/deploy/compose/production.env.example config --quiet` | Exit 0 when FLEET_URL is set in env |
| live scheduler has fleet vars | `docker exec holocron-production-scheduler-1 sh -c 'printenv FLEET_URL; [ -n "$FLEET_KEY" ] && echo present'` | URL printed + 'present' |

## Agent Assignment

**devops-engineer** — compose.yaml service environment/secret wiring is a deploy-contract edit within devops-engineer's explicitly-owned services/platform/deploy/** lane.

## Coding Standards

- Never literalize secret values in compose YAML or CLI logs (per README.md 'Secret injection').
- Match existing service patterns exactly rather than inventing a new secret-delivery mechanism.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-OPS-03",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "live-scheduler-container": {
      "description": "Real running container on holocron, confirmed 2026-08-16.",
      "seed_method": "cli",
      "records": [
        "container_name=holocron-production-scheduler-1",
        "image=localhost:5000/holocron-platform",
        "status=Up 31 minutes (healthy) at time of recon"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN scheduler has no fleet vars WHEN compose.yaml is fixed and the service recreated THEN FLEET_URL/FLEET_KEY are present in the real container and health stays green",
      "verify": "docker exec holocron-production-scheduler-1 sh -c 'printenv FLEET_URL; [ -n \"$FLEET_KEY\" ]'",
      "scenario": {
        "id": "AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holocron-production-scheduler-1 (real Docker container)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "empty"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "live-scheduler-container",
            "action": {
              "actor": "devops-engineer",
              "steps": [
                "edit services/platform/deploy/compose/compose.yaml: add FLEET_URL required env + fleet-key secret to the scheduler service",
                "on holocron: FLEET_URL=<real value> FLEET_KEY=<from operator secrets.yaml> docker compose -f compose.yaml up -d scheduler",
                "docker exec holocron-production-scheduler-1 sh -c 'printenv FLEET_URL; [ -n \"$FLEET_KEY\" ] && echo FLEET_KEY_PRESENT'"
              ]
            },
            "end_state": {
              "must_observe": [
                "printenv FLEET_URL returns a URL string with length > 0 chars, e.g. 'http://host.docker.internal:4545'",
                "'FLEET_KEY_PRESENT' printed",
                "docker inspect Health.Status == 'healthy'"
              ],
              "must_not_observe": [
                "printenv FLEET_URL returns empty/unset",
                "the actual FLEET_KEY secret value appearing anywhere in captured evidence"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "env vars present",
      "maps_to_ac": "AC-1",
      "verify": "docker exec ... printenv FLEET_URL"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "health unaffected",
      "maps_to_ac": "AC-1",
      "verify": "docker inspect Health.Status"
    }
  ]
}
-->
