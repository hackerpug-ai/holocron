# MK6-DEP-001: Provision the real MK-VI verification environment

> Status: Backlog
> Assignee: devops-engineer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: infrastructure
> Wave: 0
> Proposed by: mastra-planner
> Files: services/platform/deploy/nonprod/mk6-verification.compose.yaml, services/platform/deploy/nonprod/provision-mk6-verification.sh, scripts/verify-mk6-live-dependencies.sh, services/platform/tests/integration/helpers/mk6-live-services.ts
> Depends on: none

## Outcome

One fail-closed preflight provisions isolated real Postgres, Mastra/Hono, scheduler, and Zero services and proves every external prerequisite before behavioral tasks spend a run.

## Constraints

- Never substitute a fixture service, in-memory database, mocked fleet/R2 endpoint, or historical receipt.
- Generated service namespaces, ports, databases, and volumes must be unique to the run and must not restart or mutate operator-owned services.
- Secrets are referenced only by environment-variable name and are never written to reports, argv, logs, or task artifacts.

## Acceptance Criteria

- [ ] AC-1: `bash scripts/verify-mk6-live-dependencies.sh --provision-isolated --json` exits 0 only after real Postgres accepts a write/read, the real serving Mastra process returns its release identity, scheduler heartbeat advances, Zero replicates one non-empty row, and the configured fleet completes one prompt.
- [ ] AC-2: The same command exits non-zero with a named dependency when Postgres, fleet, Mastra, scheduler, or Zero is unavailable; it reports `manual_only` for non-generatable R2 restore credentials, a named iOS simulator reservation, and a second authorized tailnet device rather than faking them.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | An isolated real stack produces non-empty identities and one cross-service sentinel. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-live-dependencies.sh --provision-isolated --json` |
| TC-2 | With `MK6_NEGATIVE_DEPENDENCY=zero`, preflight fails and names Zero without marking the run ready. | AC-2 | `PLATFORM_IT=1 MK6_NEGATIVE_DEPENDENCY=zero bash scripts/verify-mk6-live-dependencies.sh --provision-isolated --json` |

## Manual-only gates

- `MANUAL-ONLY DEP-M1`: an operator supplies the existing names `R2_RESTORE_ACCESS_KEY_ID` and `R2_RESTORE_SECRET_ACCESS_KEY`; absence blocks backup/recovery work.
- `MANUAL-ONLY DEP-M2`: an operator reserves one explicit `MAESTRO_DEVICE` plus simulator UDID and confirms no concurrent Xcode/DerivedData owner.
- `MANUAL-ONLY DEP-M3`: an operator identifies a second authorized real tailnet device for D08-09; one-host evidence cannot pass.

## Handoff

Dispatch `devops-engineer`; reviewer = `mastra-reviewer`. Provisioning proves dependencies only and cannot satisfy any downstream product AC.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-DEP-001","tdd_mode":"shared","verification_policy":{"requires_tests":true,"requires_red_evidence":false,"requires_seeded_evidence":true},"fixtures":{"isolated_stack":{"seed_method":"cli","description":"isolated real Postgres, Mastra, scheduler, Zero and fleet namespace","records":["mk6-dep-sentinel-1"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN an isolated namespace WHEN live dependency provisioning runs THEN one real sentinel crosses Postgres, Mastra, scheduler, Zero and fleet","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-live-dependencies.sh --provision-isolated --json","maps_to_ac":null,"scenario":{"id":"dep-stack","test_tier":"integration","tier":"visible","verification_service":"mk6-live-stack","negative_control":{"would_fail_if":["Zero is disconnected or Postgres is replaced by an in-memory stub"]},"evidence":{"artifact_type":"api_response","required_capture":true},"cases":[{"start_ref":"isolated_stack","action":{"steps":["provision the isolated real services and submit sentinel mk6-dep-sentinel-1"]},"end_state":{"must_observe":["sentinelCount: 1","fleetCompletionCount: 1"],"must_not_observe":["sentinelCount: 0","empty release identity"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Dependency absence is named and manual-only prerequisites remain blocked","verify":"PLATFORM_IT=1 MK6_NEGATIVE_DEPENDENCY=zero bash scripts/verify-mk6-live-dependencies.sh --provision-isolated --json","maps_to_ac":null,"scenario":{"id":"dep-zero-missing","test_tier":"integration","tier":"visible","verification_service":"mk6-dependency-preflight","negative_control":{"would_fail_if":["Zero is disconnected but readiness still succeeds"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"isolated_stack","action":{"steps":["run preflight with only isolated Zero absent"]},"end_state":{"must_observe":["failureClass: ZERO_UNAVAILABLE","readyCount: 0"],"must_not_observe":["readyCount: 1","empty dependency name"]}}]}},{"id":"TC-1","type":"test_criterion","description":"The real isolated stack emits non-empty identities and one sentinel","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-live-dependencies.sh --provision-isolated --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"The Zero-negative run exits non-zero and cannot report ready","verify":"PLATFORM_IT=1 MK6_NEGATIVE_DEPENDENCY=zero bash scripts/verify-mk6-live-dependencies.sh --provision-isolated --json","maps_to_ac":"AC-2"}]}
-->
