# Epic 2: Chat Thread & Messaging

> Epic ID: epic-2-chat-thread-messaging
> PRD Version: 3.1.0
> Appetite: 2 weeks (core scope)
> Tasks: 9 (US-010 through US-018)
> Use Cases: UC-CI-01, UC-CI-04

## Theme

Build the core chat experience - message thread with user/agent bubbles, input bar, message persistence, and basic agent responses. After this epic, the user can send messages, see agent responses, scroll through history, and have conversations persist across app restarts.

## PRD Sections Covered

| Section | Use Case | Description |
|---------|----------|-------------|
| §05 | UC-CI-01 | Send Chat Message |
| §05 | UC-CI-04 | View Chat History |
| §11 | Technical Requirements | chat_messages table, chat-send endpoint, chat-history endpoint |

## Deliberation Summary

| UC ID | Decision | Deferred Items |
|-------|----------|----------------|
| UC-CI-01 | Full implementation with optimistic updates | Slash command parsing (Epic 3), result cards (Epic 4) |
| UC-CI-04 | Cursor-based pagination with infinite scroll | Clear history action (Epic 7), result card tap (Epic 4) |

Full deliberation: [DELIBERATION-LOG.md](../../DELIBERATION-LOG.md)

## Dependency Graph

```
US-010 (DB Migration)
    |
    +----------------------+
    |                      |
    v                      v
US-011 (chat-send)    US-012 (chat-history)
    |                      |
    |     US-013 (MessageBubble)   US-015 (ChatInput)
    |           |                       |
    |           v                       |
    |     US-014 (ChatThread) <---------+
    |           |                       |
    +-----+-----+                       |
          |                             |
          v                             |
    US-016 (Wire history) <-------------+
          |
          v
    US-017 (Wire send)
          |
          v
    US-018 (Typing + Timestamps)
```

### Parallel Execution Lanes

| Lane | Tasks | Description |
|------|-------|-------------|
| **Infrastructure** | US-010 | Database migration for chat_messages table |
| **Backend** | US-011, US-012 (parallel after US-010) | Edge Functions for send and history |
| **Design** | US-013, US-015 (parallel), US-014 (after US-013) | MessageBubble, ChatInput, ChatThread components |
| **Integration** | US-016 (after US-012, US-014), US-017 (after US-011, US-015, US-016) | Wire components to APIs |
| **Polish** | US-018 (after US-013, US-014) | Typing indicator and timestamp formatting |

## Task Summary

| ID | Title | Type | Priority | Agent | Score |
|----|-------|------|----------|-------|-------|
| US-010 | Create chat_messages table migration with types and indexes | task (INFRA) | P0 | supabase-implementer | 95 |
| US-011 | Build chat-send Edge Function with basic agent response routing | feature | P1 | supabase-implementer | 92 |
| US-012 | Build chat-history Edge Function with cursor-based pagination | feature | P1 | supabase-implementer | 90 |
| US-013 | Design MessageBubble component (user, agent, system variants) | feature:design | P1 | react-native-ui-implementer | 91 |
| US-014 | Design ChatThread component with auto-scroll and infinite scroll | feature:design | P1 | react-native-ui-implementer | 93 |
| US-015 | Design ChatInput component with send button and empty validation | feature:design | P1 | react-native-ui-implementer | 90 |
| US-016 | Wire ChatThread to chat-history API with pagination | feature:integration | P2 | react-native-ui-implementer | 91 |
| US-017 | Wire ChatInput to chat-send API with optimistic updates | feature:integration | P2 | react-native-ui-implementer | 92 |
| US-018 | Add typing indicator and timestamp display to message bubbles | feature:design | P2 | react-native-ui-implementer | 88 |

**Average Quality Score: 91/100** (all tasks above 70 minimum)

## Human Test Steps

1. Type a message in the chat input bar and tap send (or press enter)
2. Verify the user's message appears as a chat bubble immediately
3. Verify a typing/thinking indicator appears while the agent processes
4. Verify the agent's response appears as a distinct message bubble
5. Scroll up to see older messages and verify infinite scroll loads more
6. Close and reopen the app - verify chat history persists
7. Verify messages show timestamps
8. Verify empty message cannot be sent (send button disabled)

## Agent Roster

| Agent | Tasks | Role |
|-------|-------|------|
| supabase-implementer | US-010, US-011, US-012 | Database migration and Edge Functions |
| supabase-reviewer | (reviews US-010, US-011, US-012) | Backend code review |
| react-native-ui-implementer | US-013, US-014, US-015, US-016, US-017, US-018 | UI components and integration |
| react-native-ui-reviewer | (reviews US-013-US-018) | UI code review |

## Blocks

Epic 3 (Slash Commands & Command Panel), Epic 4 (Knowledge Base & Result Cards), Epic 5 (Basic Research), Epic 6 (Deep Research)

## Depends On

Epic 1 (Foundation & Drawer Navigation) - requires conversations table and Expo Router layout
