# S33-OPS-03: Wire the scheduler compose service to FLEET_URL + FLEET_KEY so background missions are no longer model-less

> Status: 🔵 In Review
> Cycle: 1
> Commit: 0892b96a4632cf41d15f19f8c60f4ad28f30c76b
> Updated: 2026-08-17T22:55:55Z
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

Give the scheduler process the same FLEET_URL/FLEET_KEY visibility mastra already has, so the role-resolution code executed by scheduler PID 1 is no longer missing the fleet entirely while one-off `docker exec` children remain unable to read the mounted secret export.

**Success state:** compose.yaml's scheduler service declares FLEET_URL as a required container environment variable and exports FLEET_KEY from the fleet-key secret into the PID-1 scheduler process; on the live holocron host, a recreated scheduler proves FLEET_URL through the container environment, proves a nonempty FLEET_KEY through `/proc/1/environ` without printing its value, proves a separate `docker exec` child does not inherit FLEET_KEY, and its own probe-cli.ts healthcheck still reports healthy.

## Critical Constraints

**MUST**

- Mirror the mastra service's exact existing pattern: FLEET_URL as a required top-level environment var (${FLEET_URL:?FLEET_URL is required}), FLEET_KEY delivered via a mounted secret and exported from /run/secrets/fleet_key inside the command script before exec'ing scheduler-worker.ts.
- Verify the change with docker compose ... config --quiet render AND a real container-level check in the authenticated `holocron@holocron` remote-host context — not local/laptop Docker and not just a static YAML diff.
- Verify FLEET_KEY against the actual PID-1 process environment through a no-output predicate over `/proc/1/environ`; a new `docker exec` child MUST have FLEET_KEY absent because Docker exec children inherit the container's configured environment, not variables exported only by the PID-1 command script.

**NEVER**

- Never print or log the FLEET_KEY value anywhere in evidence artifacts.
- Never touch mastra's or postgres's or zero-cache's service blocks.
- Never run docker compose down -v or remove the holocron-postgres/holocron-blobs named volumes while recreating the scheduler service.

## Acceptance Criteria

### AC-1 — compose.yaml scheduler service gains FLEET_URL + FLEET_KEY, verified live on holocron

- **GIVEN** compose.yaml's scheduler service currently declares only the database-url secret; live `docker compose config` on holocron fails outright with 'required variable FLEET_URL is missing a value' when invoked directly (confirmed 2026-08-16), and running scheduler containers today have neither var.
- **WHEN** compose.yaml is edited to add FLEET_URL and a fleet-key secret export to the scheduler service (mirroring mastra), and the scheduler service is recreated on holocron with FLEET_URL/FLEET_KEY supplied.
- **THEN** a shell started by docker exec proves FLEET_URL is nonempty in the configured container environment, a no-output predicate over `/proc/1/environ` proves PID 1 has a nonempty FLEET_KEY, that same exec child proves its own FLEET_KEY is absent, and the scheduler's own probe-cli.ts healthcheck still reports healthy (Docker HEALTHY status) after the recreate.
- **Verify:** `docker exec holocron-production-scheduler-1 sh -ceu 'test -n "${FLEET_URL:-}"; grep -zq "^FLEET_KEY=." /proc/1/environ; test -z "${FLEET_KEY:-}"; printf "%s\n" FLEET_URL_PRESENT FLEET_KEY_PID1_PRESENT FLEET_KEY_CHILD_ABSENT' && test "$(docker inspect --format='{{.State.Health.Status}}' holocron-production-scheduler-1)" = healthy`
- **Tier:** integration · **Service:** real scheduler container on holocron (docker exec) · **Flow:** UC-PLAT-05
- **Scenario:** topology `single-node` · evidence `stdout` · negative control: disconnect, empty

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | recreated scheduler exposes nonempty FLEET_URL to the container, exposes nonempty FLEET_KEY only to PID 1, and withholds FLEET_KEY from a separate docker exec child | AC-1 | `docker exec holocron-production-scheduler-1 sh -ceu 'test -n "${FLEET_URL:-}"; grep -zq "^FLEET_KEY=." /proc/1/environ; test -z "${FLEET_KEY:-}"; printf "%s\n" FLEET_URL_PRESENT FLEET_KEY_PID1_PRESENT FLEET_KEY_CHILD_ABSENT'` |
| TC-2 | scheduler healthcheck reports exactly healthy after the recreate | AC-1 | `test "$(docker inspect --format='{{.State.Health.Status}}' holocron-production-scheduler-1)" = healthy` |

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

**Anti-pattern** — Passing FLEET_KEY as a plain container environment literal merely to make a separate `docker exec` child inherit it; that weakens the mounted-secret boundary and tests the wrong process.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| compose config renders with FLEET_URL required | `docker compose -f services/platform/deploy/compose/compose.yaml --env-file services/platform/deploy/compose/production.env.example config --quiet` | Exit 0 when FLEET_URL is set in env |
| live scheduler process has the bounded fleet contract | `docker exec holocron-production-scheduler-1 sh -ceu 'test -n "${FLEET_URL:-}"; grep -zq "^FLEET_KEY=." /proc/1/environ; test -z "${FLEET_KEY:-}"; printf "%s\n" FLEET_URL_PRESENT FLEET_KEY_PID1_PRESENT FLEET_KEY_CHILD_ABSENT'` | Three fixed sentinel lines; no URL or secret value printed |
| scheduler health is exactly healthy | `test "$(docker inspect --format='{{.State.Health.Status}}' holocron-production-scheduler-1)" = healthy` | Exit 0 only for exact healthy state |

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
      "description": "GIVEN scheduler PID 1 lacks the fleet contract WHEN compose.yaml is fixed and the service recreated THEN configured FLEET_URL and PID-1-only FLEET_KEY are present, a separate exec child cannot read FLEET_KEY, and health is exactly healthy",
      "verify": "docker exec holocron-production-scheduler-1 sh -ceu 'test -n \"${FLEET_URL:-}\"; grep -zq \"^FLEET_KEY=.\" /proc/1/environ; test -z \"${FLEET_KEY:-}\"; printf \"%s\\n\" FLEET_URL_PRESENT FLEET_KEY_PID1_PRESENT FLEET_KEY_CHILD_ABSENT' && test \"$(docker inspect --format='{{.State.Health.Status}}' holocron-production-scheduler-1)\" = healthy",
      "maps_to_ac": null,
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
                "on the authenticated holocron@holocron remote host: supply FLEET_URL and the operator secret through the existing deployment path, then recreate only scheduler",
                "run the exact no-secret-output verifier that checks configured FLEET_URL, checks nonempty FLEET_KEY in /proc/1/environ, and checks FLEET_KEY is absent from the separate docker exec child"
              ]
            },
            "end_state": {
              "must_observe": [
                "'FLEET_URL_PRESENT' printed",
                "'FLEET_KEY_PID1_PRESENT' printed",
                "'FLEET_KEY_CHILD_ABSENT' printed",
                "docker inspect Health.Status == 'healthy'"
              ],
              "must_not_observe": [
                "the actual FLEET_URL value appearing in captured evidence",
                "the actual FLEET_KEY secret value appearing anywhere in captured evidence",
                "a separate docker exec child has a nonempty FLEET_KEY"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The recreated scheduler has nonempty configured FLEET_URL, a nonempty PID-1 FLEET_KEY, and no FLEET_KEY in a separate docker exec child.",
      "maps_to_ac": "AC-1",
      "verify": "docker exec holocron-production-scheduler-1 sh -ceu 'test -n \"${FLEET_URL:-}\"; grep -zq \"^FLEET_KEY=.\" /proc/1/environ; test -z \"${FLEET_KEY:-}\"; printf \"%s\\n\" FLEET_URL_PRESENT FLEET_KEY_PID1_PRESENT FLEET_KEY_CHILD_ABSENT'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "The recreated scheduler health status is exactly healthy.",
      "maps_to_ac": "AC-1",
      "verify": "test \"$(docker inspect --format='{{.State.Health.Status}}' holocron-production-scheduler-1)\" = healthy"
    }
  ]
}
-->
