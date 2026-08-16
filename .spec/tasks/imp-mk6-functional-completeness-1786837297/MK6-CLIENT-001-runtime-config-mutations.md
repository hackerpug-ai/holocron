# MK6-CLIENT-001: Fail closed client runtime configuration and durable mutations

> Status: Backlog
> Assignee: react-native-ui-implementer
> Reviewer: react-native-ui-reviewer
> Priority: P0
> Type: bugfix
> Wave: 8
> Proposed by: mastra-planner
> Files: app/_layout.tsx, app/zero/platform.ts, app/zero/legacy-alias.ts, app/zero/mutators.ts, tests/integration/client-runtime-config-and-mutation.test.ts, .maestro/reactive/client-runtime-config-and-mutation.yml, scripts/e2e/run-client-runtime-config-and-mutation.sh
> Depends on: MK6-MISSION-001, MK6-MCP-002

## Outcome

The native client rejects loopback, e2e identity, retired hosts, and wrong-plane configuration, while accepted custom mutations persist through the real Hono/Zero/Postgres path and rejected mutations roll back visibly.

## Acceptance Criteria

- [ ] AC-1: With a named reserved iOS simulator and real nonprod Postgres/Zero, `PLATFORM_IT=1 bash scripts/e2e/run-client-runtime-config-and-mutation.sh --json` proves a client mutation in Postgres and a second real Zero client within the declared SLO.
- [ ] AC-2: Missing/retired/wrong-plane configuration displays a terminal configuration error and sends zero requests to `127.0.0.1`; forced 409/423 visibly rolls back and reports rejection.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | One native client mutation reaches Postgres and another real Zero client. | AC-1 | `PLATFORM_IT=1 bash scripts/e2e/run-client-runtime-config-and-mutation.sh --json` |
| TC-2 | Retired-host configuration makes zero loopback requests and shows a terminal error. | AC-2 | `PLATFORM_IT=1 MK6_CLIENT_CONFIG_NEGATIVE=retired-host bash scripts/e2e/run-client-runtime-config-and-mutation.sh --json` |

`MANUAL-ONLY CLIENT-M1`: reserve an explicit simulator name/UDID, isolated DerivedData and Metro owner; never erase, delete, shut down, or default-select a shared simulator.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-CLIENT-001","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"client_mutation":{"seed_method":"ui_flow","description":"named native simulator connected to real nonprod Zero and Postgres","records":["mutationKey: mk6-client-mutation-1"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN a healthy native runtime WHEN a custom mutation is submitted THEN Postgres and another real Zero client observe it within SLO","verify":"PLATFORM_IT=1 bash scripts/e2e/run-client-runtime-config-and-mutation.sh --json","maps_to_ac":null,"scenario":{"test_tier":"e2e","tier":"visible","verification_service":"ios-zero-postgres-hono","negative_control":{"would_fail_if":["the durable mutation is removed or Zero is disconnected"]},"evidence":{"artifact_type":"screenshot","required_capture":true},"cases":[{"start_ref":"client_mutation","action":{"steps":["submit mk6-client-mutation-1 on the named simulator and observe it through another real Zero client"]},"end_state":{"must_observe":["postgresMutationCount: 1","zeroObserverCount: 1"],"must_not_observe":["postgresMutationCount: 0","empty mutation status"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Retired, missing and rejected configurations fail visibly without loopback fallback","verify":"PLATFORM_IT=1 MK6_CLIENT_CONFIG_NEGATIVE=retired-host bash scripts/e2e/run-client-runtime-config-and-mutation.sh --json","maps_to_ac":null},{"id":"TC-1","type":"test_criterion","description":"The native mutation is durable and observed by Zero","verify":"PLATFORM_IT=1 bash scripts/e2e/run-client-runtime-config-and-mutation.sh --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"Retired host causes zero loopback requests","verify":"PLATFORM_IT=1 MK6_CLIENT_CONFIG_NEGATIVE=retired-host bash scripts/e2e/run-client-runtime-config-and-mutation.sh --json","maps_to_ac":"AC-2"}]}
-->
