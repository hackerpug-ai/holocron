# Epic 1: Foundation & Drawer Navigation

> Epic ID: epic-1-foundation-drawer-navigation
> PRD Version: 3.1.0
> Appetite: 2 weeks (core scope)
> Tasks: 9 (US-001 through US-009)
> Use Cases: UC-NV-01, UC-NV-02, UC-NV-03, UC-NV-04

## Theme

Stand up the Expo project skeleton with drawer navigation, conversation persistence, and multi-conversation CRUD. After this epic, the user can open the app, see a drawer with conversations, create/switch/rename/delete conversations, and land on the most recent chat.

## PRD Sections Covered

| Section | Use Case | Description |
|---------|----------|-------------|
| §04 | UC-NV-01 | Open Drawer Menu |
| §04 | UC-NV-02 | Create New Chat |
| §04 | UC-NV-03 | Switch Conversation |
| §04 | UC-NV-04 | Manage Conversation |
| §11 | Technical Requirements | conversations table, conversation API endpoints |

## Deliberation Summary

| UC ID | Decision | Deferred Items |
|-------|----------|----------------|
| UC-NV-01 | Core happy path + active highlighting | Search wiring (Epic 7), section link nav logic |
| UC-NV-02 | Full implementation | Title auto-update after first message (Epic 2) |
| UC-NV-03 | Full implementation | None |
| UC-NV-04 | Long-press menu with rename + delete | Swipe-to-delete gesture |

Full deliberation: [DELIBERATION-LOG.md](../../.spec/DELIBERATION-LOG.md)

## Dependency Graph

```
US-001 (Layout)     US-002 (DB Migration)    US-009 (DrawerHeader)    US-005 (ActionMenu)
    |                    |                        |                       |
    |                    v                        v                       |
    |               US-003 (Edge Functions)  US-004 (DrawerContent)      |
    |                    |                        |                       |
    +--------------------+------------------------+                       |
                         |                                                |
                         v                                                |
                    US-006 (Wire to API) <--------------------------------+
                         |           |
                         v           v
                    US-007       US-008
                    (Manage)     (App-open)
```

### Parallel Execution Lanes

| Lane | Tasks | Description |
|------|-------|-------------|
| **Infrastructure** | US-001, US-002 (parallel) | Layout + DB migration (no dependencies between them) |
| **Backend** | US-003 (after US-002) | Edge Functions for CRUD |
| **Design** | US-009, US-005, US-004 (parallel, US-004 after US-001) | DrawerHeader refinement, ActionMenu, DrawerContent |
| **Integration** | US-006 (after US-001, US-003, US-004) | Wire drawer to API |
| **Integration** | US-007 (after US-005, US-006), US-008 (after US-006) | Management actions + app-open logic |

## Task Summary

| ID | Title | Type | Priority | Agent | Score |
|----|-------|------|----------|-------|-------|
| US-001 | Set up Expo Router layout with drawer navigation | task (INFRA) | P0 | react-native-ui-implementer | 93 |
| US-002 | Create conversations table migration and Supabase types | task (INFRA) | P0 | devops-engineer | 95 |
| US-003 | Build conversations CRUD Edge Functions | feature | P1 | ai-tooling-implementer | 97 |
| US-004 | Design DrawerContent component | feature:design | P1 | react-native-ui-implementer | 92 |
| US-005 | Design ConversationActionMenu component | feature:design | P1 | react-native-ui-implementer | 91 |
| US-006 | Wire drawer to conversations API | feature:integration | P2 | react-native-ui-implementer | 91 |
| US-007 | Implement conversation management actions | feature:integration | P2 | react-native-ui-implementer | 91 |
| US-008 | Implement app-open-to-most-recent-conversation | feature:integration | P2 | react-native-ui-implementer | 90 |
| US-009 | Design drawer header with search bar placeholder | feature:design | P1 | react-native-ui-implementer | 88 |

**Average Quality Score: 92/100** (all tasks above 70 minimum)

## Human Test Steps

1. Open the app and verify it lands on the most recent conversation (or an empty new chat if none exist)
2. Swipe from the left edge or tap the hamburger icon to open the pushover drawer
3. Verify the drawer shows "Articles" link pinned at top, app section links, and a conversation list
4. Tap the compose icon in the drawer to create a new conversation and verify it appears at the top of the list
5. Tap a different conversation in the drawer to switch to it and verify the drawer closes
6. Long-press a conversation to rename it and verify the title updates in the list
7. Long-press a conversation to delete it, confirm the dialog, and verify it is removed
8. Delete the last conversation and verify the system creates a new empty conversation automatically

## Agent Roster

| Agent | Tasks | Verified |
|-------|-------|----------|
| react-native-ui-implementer | US-001, US-004, US-005, US-006, US-007, US-008, US-009 | Yes |
| devops-engineer | US-002 | Yes |
| ai-tooling-implementer | US-003 | Yes |

## Blocks

Epic 2 (Chat Thread & Messaging), Epic 3 (Slash Commands), Epic 4 (Knowledge Base), Epic 5 (Basic Research), Epic 6 (Deep Research), Epic 7 (Article Management)
