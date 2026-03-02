# Task Index: Holocron Mobile Research Interface

> PRD Version: 3.1.0
> Generated: 2026-03-02
> Total Epics: 7 (3 planned, 4 pending)

## Epics

| Epic | Status | Tasks | Avg Score | Directory |
|------|--------|-------|-----------|-----------|
| [Epic 1: Foundation & Drawer Navigation](epic-1-foundation-drawer-navigation/EPIC.md) | Planned | 9 | 92 | `epic-1-foundation-drawer-navigation/` |
| [Epic 2: Chat Thread & Messaging](epic-2-chat-thread-messaging/EPIC.md) | Planned | 9 | 91 | `epic-2-chat-thread-messaging/` |
| [Epic 3: Slash Commands & Command Panel](epic-3-slash-commands-command-panel/EPIC.md) | Planned | 7 | 90 | `epic-3-slash-commands-command-panel/` |
| Epic 4: Knowledge Base & Result Cards | Not Started | 10 | -- | -- |
| Epic 5: Basic Research | Not Started | 8 | -- | -- |
| Epic 6: Deep Research | Not Started | 9 | -- | -- |
| Epic 7: Article Management & Navigation Extras | Not Started | 9 | -- | -- |

## Epic 1 Task Files

| ID | File | Title | Type | Priority |
|----|------|-------|------|----------|
| US-001 | [US-001.md](epic-1-foundation-drawer-navigation/US-001.md) | Set up Expo Router layout with drawer navigation | task (INFRA) | P0 |
| US-002 | [US-002.md](epic-1-foundation-drawer-navigation/US-002.md) | Create conversations table migration and Supabase types | task (INFRA) | P0 |
| US-003 | [US-003.md](epic-1-foundation-drawer-navigation/US-003.md) | Build conversations CRUD Edge Functions | feature | P1 |
| US-004 | [US-004.md](epic-1-foundation-drawer-navigation/US-004.md) | Design DrawerContent component | feature:design | P1 |
| US-005 | [US-005.md](epic-1-foundation-drawer-navigation/US-005.md) | Design ConversationActionMenu component | feature:design | P1 |
| US-006 | [US-006.md](epic-1-foundation-drawer-navigation/US-006.md) | Wire drawer to conversations API | feature:integration | P2 |
| US-007 | [US-007.md](epic-1-foundation-drawer-navigation/US-007.md) | Implement conversation management actions | feature:integration | P2 |
| US-008 | [US-008.md](epic-1-foundation-drawer-navigation/US-008.md) | Implement app-open-to-most-recent-conversation | feature:integration | P2 |
| US-009 | [US-009.md](epic-1-foundation-drawer-navigation/US-009.md) | Design drawer header with search bar placeholder | feature:design | P1 |

## Epic 2 Task Files

| ID | File | Title | Type | Priority |
|----|------|-------|------|----------|
| US-010 | [US-010.md](epic-2-chat-thread-messaging/US-010.md) | Create chat_messages table migration with types and indexes | task (INFRA) | P0 |
| US-011 | [US-011.md](epic-2-chat-thread-messaging/US-011.md) | Build chat-send Edge Function with basic agent response routing | feature | P1 |
| US-012 | [US-012.md](epic-2-chat-thread-messaging/US-012.md) | Build chat-history Edge Function with cursor-based pagination | feature | P1 |
| US-013 | [US-013.md](epic-2-chat-thread-messaging/US-013.md) | Design MessageBubble component (user, agent, system variants) | feature:design | P1 |
| US-014 | [US-014.md](epic-2-chat-thread-messaging/US-014.md) | Design ChatThread component with auto-scroll and infinite scroll | feature:design | P1 |
| US-015 | [US-015.md](epic-2-chat-thread-messaging/US-015.md) | Design ChatInput component with send button and empty validation | feature:design | P1 |
| US-016 | [US-016.md](epic-2-chat-thread-messaging/US-016.md) | Wire ChatThread to chat-history API with pagination | feature:integration | P2 |
| US-017 | [US-017.md](epic-2-chat-thread-messaging/US-017.md) | Wire ChatInput to chat-send API with optimistic updates | feature:integration | P2 |
| US-018 | [US-018.md](epic-2-chat-thread-messaging/US-018.md) | Add typing indicator and timestamp display to message bubbles | feature:design | P2 |

## Epic 3 Task Files

| ID | File | Title | Type | Priority |
|----|------|-------|------|----------|
| US-019 | [US-019.md](epic-3-slash-commands-command-panel/US-019.md) | Build slash command parser in chat-send Edge Function | feature | P1 |
| US-020 | [US-020.md](epic-3-slash-commands-command-panel/US-020.md) | Design CommandPanel component - story + variants | feature:design | P1 |
| US-021 | [US-021.md](epic-3-slash-commands-command-panel/US-021.md) | Design SlashCommandMessage component - monospace + badge | feature:design | P1 |
| US-022 | [US-022.md](epic-3-slash-commands-command-panel/US-022.md) | Wire "/" button and keyboard trigger to CommandPanel | feature:integration | P2 |
| US-023 | [US-023.md](epic-3-slash-commands-command-panel/US-023.md) | Implement real-time command filtering and panel dismiss | feature:integration | P2 |
| US-024 | [US-024.md](epic-3-slash-commands-command-panel/US-024.md) | Implement command insertion with syntax hint | feature:integration | P2 |
| US-025 | [US-025.md](epic-3-slash-commands-command-panel/US-025.md) | Build /help command handler returning descriptions | feature | P2 |

## References

- PRD: [.spec/prd/README.md](../prd/README.md)
- Roadmap: [.spec/prd/README-roadmap.md](../prd/README-roadmap.md)
- Deliberation Log: [.spec/DELIBERATION-LOG.md](../DELIBERATION-LOG.md)
