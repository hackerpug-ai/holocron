# MK6-DECOMMISSION-001: Rerun D08-03/D08-09 and gate permanent Convex deletion

> Status: Backlog
> Assignee: devops-engineer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: manual verification
> Wave: 8
> Proposed by: mastra-planner
> Files: .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/**, .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/**, .gate-evidence/mk6-decommission/**
> Depends on: MK6-PROMOTION-001

## Outcome

The soaked exact release passes a new restore and two-device drill, after which permanent Convex deletion remains blocked until an explicit named operator authorizes D08-05.

## Acceptance Criteria

- [ ] AC-1: `MANUAL-ONLY DECOM-M1`: rerun `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --fresh-target --release "$MK6_PROMOTED_RELEASE" --json`; new D08-03 bytes prove the soaked release and pass deletion/mutation controls.
- [ ] AC-2: `MANUAL-ONLY DECOM-M2`: rerun `PLATFORM_IT=1 bash scripts/verify-mk6-retired-plane.sh --d08-09 --release "$MK6_PROMOTED_RELEASE" --json` from two real devices and retain fresh complete capture hashes.
- [ ] AC-3: `MANUAL-ONLY DECOM-M3`: only after AC-1/AC-2, a named operator records explicit D08-05 authorization, exact Convex target identity, deletion receipt, and post-delete Postgres/Zero/MCP/native smoke; without authorization no delete command runs.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Fresh D08-03 binds retained restore bytes to the soaked release. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --fresh-target --release "$MK6_PROMOTED_RELEASE" --json` |
| TC-2 | Fresh D08-09 uses two real devices and the same soaked release. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-mk6-retired-plane.sh --d08-09 --release "$MK6_PROMOTED_RELEASE" --json` |
| TC-3 | Post-delete smoke proves non-empty Postgres, Zero, MCP, and native behavior. | AC-3 | `MANUAL-ONLY: authorized operator records D08-05 receipt, then runs PLATFORM_IT=1 bash scripts/verify-mk6-retired-plane.sh --post-delete-smoke --release "$MK6_PROMOTED_RELEASE" --json` |

This task cannot self-authorize deletion. Absent operator authorization is a successful closed gate, not a reason to force, skip, or simulate D08-05.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-DECOMMISSION-001","tdd_mode":"skipped","verification_policy":{"requires_tests":true,"requires_red_evidence":false,"requires_seeded_evidence":true},"fixtures":{"soaked_release":{"seed_method":"recorded_external","description":"same exact release after 72-hour soak","records":["soakHours: 72","healthyServiceCount: 4"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN the exact soaked release WHEN fresh D08-03 and two-device D08-09 run THEN retained restore and live captures bind to it","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --fresh-target --release \"$MK6_PROMOTED_RELEASE\" --json","maps_to_ac":null,"scenario":{"test_tier":"e2e","tier":"visible","verification_service":"restore-tailnet-postgres-zero-mcp","topology":"multi-node","negative_control":{"would_fail_if":["one retained receipt is deleted or the second real device is removed"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"soaked_release","action":{"steps":["restore the soaked release and drive D08-09 from two real devices"]},"end_state":{"must_observe":["soakHours: 72","d08PassCount: 2"],"must_not_observe":["d08PassCount: 0","empty capture hashes"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"D08-05 remains closed until explicit named operator authorization and post-delete smoke","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-retired-plane.sh --post-delete-smoke --release \"$MK6_PROMOTED_RELEASE\" --json","maps_to_ac":null},{"id":"TC-1","type":"test_criterion","description":"Fresh D08-03 binds the soaked release","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-recovery-evidence.sh --fresh-target --release \"$MK6_PROMOTED_RELEASE\" --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"Fresh two-device D08-09 binds the soaked release","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-retired-plane.sh --d08-09 --release \"$MK6_PROMOTED_RELEASE\" --json","maps_to_ac":"AC-1"},{"id":"TC-3","type":"test_criterion","description":"Authorized post-delete smoke proves four non-empty surfaces","verify":"PLATFORM_IT=1 bash scripts/verify-mk6-retired-plane.sh --post-delete-smoke --release \"$MK6_PROMOTED_RELEASE\" --json","maps_to_ac":"AC-2"}]}
-->
