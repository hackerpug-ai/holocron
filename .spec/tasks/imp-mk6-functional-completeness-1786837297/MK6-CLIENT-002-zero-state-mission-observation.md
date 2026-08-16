# MK6-CLIENT-002: Make drawer and Zero state semantics truthful

> Status: Backlog
> Assignee: react-native-ui-implementer
> Reviewer: react-native-ui-reviewer
> Priority: P0
> Type: bugfix
> Wave: 9
> Proposed by: mastra-planner
> Files: app/(drawer)/_layout.tsx, screens/DrawerContent.tsx, app/(drawer)/missions.tsx, app/zero/queries.ts, app/toolbelt/add.tsx, hooks/use-zero-query-state.ts, hooks/use-whats-new-feed.ts, hooks/use-file-object-by-content-hash.ts, components/deep-research/DeepResearchDetailView.tsx, app/(drawer)/research/[sessionId].tsx, components/articles/ArticleImportModal.tsx, components/improvements/ImprovementSubmitSheet.tsx, tests/integration/drawer-mission-observation.test.ts, tests/integration/client-zero-state-semantics.test.ts, .maestro/reactive/drawer-mission-observation.yml, .maestro/reactive/client-zero-state-semantics.yml, .maestro/reactive/run-drawer-mission-observation.sh, .maestro/reactive/run-client-zero-state-semantics.sh
> Depends on: MK6-CLIENT-001

## Outcome

Drawer and mission surfaces distinguish loading, fresh empty, stale cache, terminal sync error, and rejection, and display one real mission progression/result through Zero.

## Acceptance Criteria

- [ ] AC-1: `PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --json` cold-launches seeded real Postgres conversations, creates a Toolbelt mission, and displays queued/running/terminal state plus one durable output row under replay.
- [ ] AC-2: Zero-down with a wiped replica produces a terminal error rather than an empty list; restore plus the real Retry control recovers. Import/research/improvement failures are visible and a blob is not called synced until its real `file_objects` row is observed.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | One real Toolbelt mission progresses to one terminal Zero-visible result. | AC-1 | `PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --json` |
| TC-2 | Zero-down is visibly distinct from a fresh empty list and Retry recovers. | AC-2 | `PLATFORM_IT=1 MK6_ZERO_STATE_NEGATIVE=zero-down bash .maestro/reactive/run-client-zero-state-semantics.sh --json` |

Current no-op Retry, `isLoading=false`, `error=null`, console-only error, synthetic report, and live-looking fallback progress are explicit forbidden outcomes.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"MK6-CLIENT-002","tdd_mode":"red_first","verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},"fixtures":{"drawer_mission":{"seed_method":"ui_flow","description":"real Postgres conversations and Toolbelt mission on named simulator","records":["conversationCount: 2","missionKey: mk6-drawer-mission-1"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN seeded real conversations WHEN a Toolbelt mission runs THEN drawer and Zero show one queued-to-terminal mission and one output","verify":"PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --json","maps_to_ac":null,"scenario":{"test_tier":"e2e","tier":"visible","verification_service":"ios-zero-postgres-mission","negative_control":{"would_fail_if":["the drawer is a static empty shell or mission observation is disconnected"]},"evidence":{"artifact_type":"screenshot","required_capture":true},"cases":[{"start_ref":"drawer_mission","action":{"steps":["cold launch, open drawer, submit mk6-drawer-mission-1, and replay final event"]},"end_state":{"must_observe":["conversationCount: 2","terminalMissionCount: 1","visibleResultCount: 1"],"must_not_observe":["conversationCount: 0","empty mission list"]}}]}},{"id":"AC-2","type":"acceptance_criterion","description":"Zero-down and rejection states are visible and recover through real Retry","verify":"PLATFORM_IT=1 MK6_ZERO_STATE_NEGATIVE=zero-down bash .maestro/reactive/run-client-zero-state-semantics.sh --json","maps_to_ac":null},{"id":"TC-1","type":"test_criterion","description":"One real mission reaches one visible terminal result","verify":"PLATFORM_IT=1 bash .maestro/reactive/run-drawer-mission-observation.sh --json","maps_to_ac":"AC-1"},{"id":"TC-2","type":"test_criterion","description":"Zero-down differs from empty and Retry restores rows","verify":"PLATFORM_IT=1 MK6_ZERO_STATE_NEGATIVE=zero-down bash .maestro/reactive/run-client-zero-state-semantics.sh --json","maps_to_ac":"AC-2"}]}
-->
