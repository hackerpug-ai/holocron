# Epic 6: Activity Indicator, Document Discipline & Cleanup

**Sequence**: 6 of 6
**Priority**: P0 (UI) / P2 (cron)
**Wall-clock estimate**: ~12 hours (6 tasks)

## Overview

Close out the PRD with the phase-aware activity indicator, the document discipline footer, their ChatThread integrations, and the telemetry retention cron. After this epic, the user sees live progress during agent turns ("Finding recommendations…"), every assistant message shows a "Saved to KB" link or a "Save this to KB" quick action, and the `agentTelemetry` table is bounded by a daily 90-day TTL cron.

## Human Test Steps

1. Send the canonical failing query
2. Observe the `AgentActivityIndicator` mount at the bottom of chat with the text "Finding recommendations…" while the tool runs
3. Verify the indicator disappears when phase returns to `idle`
4. Enable iOS Reduce Motion in device settings, resend a query, verify the indicator's pulse animation is disabled (text label only, no animation)
5. Enable VoiceOver, trigger a phase change, verify screen reader announces the new label
6. After an `answer_question` response arrives, see `DocumentDisciplineFooter` below the assistant message with "Save this to KB" text
7. Tap Save → see "Saved to KB · Open →" transition (footer updates in place)
8. Tap Open → navigate to the document detail screen
9. Send a message that triggers `deep_research` — confirm the footer shows "Saved to KB · Open →" immediately (not "Save this to KB") because the tool already created a doc
10. Verify the footer is ABSENT for clarification bubbles and user messages
11. Send a query → confirm only one of (AgentActivityIndicator, TypingIndicator) is visible at a time
12. Run `npx convex run chat/telemetryMutations:deleteOldTelemetry '{"olderThanMs":7776000000}'` — confirm only rows older than 90 days are deleted
13. Run `vitest --project=storybook --run` — all Epic 6 stories pass

## PRD Sections Covered

- `07-uc-rel.md` — UC-REL-07 (activity indicator), UC-REL-08 (doc discipline footer), UC-REL-09 (Hook + integration)
- `09-technical-requirements.md` — Build Sequence Tasks 23, 24, 25, 28, 29, 30, 15
- Risk 5 mitigation (telemetry retention)

## Acceptance Criteria (Epic-level)

- [ ] `useAgentActivity(conversationId)` hook returns `{ phase, toolName, loading, error }` directly from Convex query (no useState syncing)
- [ ] `AgentActivityIndicator` maps phase → text and hides when phase='idle'
- [ ] Tool-specific messages for `find_recommendations`, `kb_search`, `quick_research`, `deep_research`
- [ ] Reduce Motion disables pulse animation; screen-reader announces phase changes
- [ ] `DocumentDisciplineFooter` dual-state (Saved vs Save this) with router navigation
- [ ] `ChatThread` wraps eligible assistant messages with the footer via `isFooterEligible` helper (unit-tested)
- [ ] `ChatThread` mounts AgentActivityIndicator at the bottom, suppresses TypingIndicator when AAI active
- [ ] Daily cron deletes `agentTelemetry` rows older than 90 days in batches
- [ ] No `react-native-paper` imports

## Tasks

| ID         | Title                                          | Agent                     | Priority | Effort | Est (min) | Depends On                          |
|------------|------------------------------------------------|---------------------------|----------|--------|-----------|-------------------------------------|
| REL-UI-001 | useAgentActivity hook (phase subscription)     | react-native-ui-implementer | P0     | S      | 90        | INT-007                             |
| REL-UI-002 | AgentActivityIndicator phase-aware component   | react-native-ui-implementer | P0     | M      | 150       | REL-UI-001                          |
| REL-UI-003 | DocumentDisciplineFooter component             | react-native-ui-implementer | P0     | M      | 150       | —                                   |
| INT-UI-003 | ChatThread wrap: DocumentDisciplineFooter      | react-native-ui-implementer | P0     | M      | 150       | REL-UI-003                          |
| INT-UI-004 | ChatThread mount: AgentActivityIndicator       | react-native-ui-implementer | P0     | S      | 90        | REL-UI-001, REL-UI-002              |
| REL-002    | Telemetry retention cron (90-day TTL)          | convex-implementer        | P2       | S      | 60        | INT-005, INT-008                    |

**Total estimate**: ~690 minutes (~11.5 hours)

## Dependency Graph

```
INT-007 ── REL-UI-001 ─┬── REL-UI-002 ── INT-UI-004
                        │
REL-UI-003 ── INT-UI-003

INT-005 + INT-008 ── REL-002 (parallel, backend housekeeping)
```

Parallelizable: REL-UI-003 can run immediately alongside REL-UI-001/002. REL-002 is a small backend task that can run any time after Epic 2's INT-008.

## Blocks

- (none — this is the final epic; after this the full PRD is shipped)

## Definition of Done

1. All 6 tasks pass their verification gates
2. Human test steps above all pass on a real device
3. Storybook coverage: every new UI component has 4+ stories
4. No regression in existing `TypingIndicator` behavior
5. `deleteOldTelemetry` cron verified by manual `npx convex run` invocation
6. Commit ends at a green tree
7. Full PRD human-level success definitions in `00-overview.md` all hold
