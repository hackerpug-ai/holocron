# Epic 2: Chat Thread & Messaging

> Epic ID: epic-2-chat-thread-messaging
> PRD Version: 3.1.0
> Appetite: 2 weeks (core scope)
> Tasks: 9 (US-010 through US-018)
> Use Cases: UC-CI-01, UC-CI-04
> Depends on: Epic 1 (Foundation & Drawer Navigation)

## Theme

Build the core chat experience — message thread with user/agent bubbles, input bar, message persistence, and basic agent responses. After this epic, the user can send messages, see agent responses, scroll through history, and have conversations persist across app restarts.

## PRD Sections Covered

| Section | Use Case | Description |
|---------|----------|-------------|
| §05 | UC-CI-01 | Send Chat Message |
| §05 | UC-CI-04 | View Chat History |
| §11 | Technical Requirements | chat_messages table, chat-send endpoint, chat-history endpoint |

## Deliberation Summary

| UC ID | Decision | Deferred Items |
|-------|----------|----------------|
| UC-CI-01 | Full implementation with basic agent routing | Advanced agent routing (slash command parsing deferred to Epic 3) |
| UC-CI-04 | Full implementation with cursor-based pagination | Clear chat history action (deferred to Epic 7: UC-NV-05) |

## Dependency Graph

```
US-010 (DB Migration)
    |
    v
US-011 (chat-send Edge Function)     US-012 (chat-history Edge Function)
    |                                      |
    +------------------+-------------------+
                       |
                       v
US-013 (MessageBubble)     US-015 (ChatInput)
    |                           |
    v                           |
US-014 (ChatThread)             |
    |                           |
    +---------------------------+
                |
                v
        US-016 (Wire ChatThread)
                |
                v
        US-017 (Wire ChatInput)
                |
                v
        US-018 (Typing + Timestamps)
```

### Parallel Execution Lanes

| Lane | Tasks | Description |
|------|-------|-------------|
| **Infrastructure** | US-010 | Database migration for chat_messages |
| **Backend** | US-011, US-012 (parallel after US-010) | Edge Functions for send and history |
| **Design** | US-013, US-014, US-015 (parallel) | MessageBubble, ChatThread, ChatInput components |
| **Integration** | US-016 (after US-012, US-014), US-017 (after US-011, US-015, US-016) | Wire to APIs |
| **Polish** | US-018 (after US-017) | Typing indicator and timestamps |

## Task Summary

| ID | Title | Type | Priority | Agent | Score |
|----|-------|------|----------|-------|-------|
| US-010 | Create chat_messages table migration with types and indexes | task (INFRA) | P0 | devops-engineer | 94 |
| US-011 | Build chat-send Edge Function with basic agent response routing | feature | P1 | ai-tooling-implementer | 96 |
| US-012 | Build chat-history Edge Function with cursor-based pagination | feature | P1 | ai-tooling-implementer | 94 |
| US-013 | Design MessageBubble component (user, agent, system variants) | feature:design | P1 | react-native-ui-implementer | 91 |
| US-014 | Design ChatThread component with auto-scroll and infinite scroll | feature:design | P1 | react-native-ui-implementer | 92 |
| US-015 | Design ChatInput component with send button and empty validation | feature:design | P1 | react-native-ui-implementer | 90 |
| US-016 | Wire ChatThread to chat-history API with pagination | feature:integration | P2 | react-native-ui-implementer | 91 |
| US-017 | Wire ChatInput to chat-send API with optimistic updates | feature:integration | P2 | react-native-ui-implementer | 92 |
| US-018 | Add typing indicator and timestamp display to message bubbles | feature:integration | P2 | react-native-ui-implementer | 89 |

**Average Quality Score: 92/100** (all tasks above 70 minimum)

## Human Test Steps

1. Type a message in the chat input bar and tap send (or press enter)
2. Verify the user's message appears as a chat bubble immediately
3. Verify a typing/thinking indicator appears while the agent processes
4. Verify the agent's response appears as a distinct message bubble
5. Scroll up to see older messages and verify infinite scroll loads more
6. Close and reopen the app — verify chat history persists
7. Verify messages show timestamps
8. Verify empty message cannot be sent (send button disabled)

## Agent Roster

| Agent | Tasks | Verified |
|-------|-------|----------|
| devops-engineer | US-010 | Yes |
| ai-tooling-implementer | US-011, US-012 | Yes |
| react-native-ui-implementer | US-013, US-014, US-015, US-016, US-017, US-018 | Yes |

## Blocks

Epic 3 (Slash Commands), Epic 4 (Knowledge Base), Epic 5 (Basic Research), Epic 6 (Deep Research), Epic 7 (Article Management)
