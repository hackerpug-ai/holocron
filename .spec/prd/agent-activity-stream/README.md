# PRD: Agent Activity Stream

**Status**: Draft  
**Author**: Justin Rich  
**Date**: 2026-04-05  
**Version**: 1.0

---

## Problem Statement

When the Holocron agent is working (research, tool calls, planning), the user only sees a 3-dot typing indicator or static loading cards. There is no visibility into what the agent is actually doing. This creates uncertainty and a perception of slowness, especially for multi-step workflows that take 10-60+ seconds.

## Inspiration

OpenAI ChatGPT's inline collapsible "thinking" blocks show agent activities in real-time. Each activity appears as a minimal text line (icon + description) that streams in as the agent works, then collapses or fades when complete. This provides transparency without cluttering the conversation.

## Goals

1. Show real-time agent activity inline in the chat message flow
2. Provide transparency into what the agent is doing at each moment
3. Keep the chat clean by fading activities away after completion
4. Work across all agentic workflows (chat, research, assimilation, plans)

## Non-Goals

- Replacing existing specialized cards (DeepResearchLoadingCard, AgentPlanCard, etc.)
- Showing raw LLM token streaming
- Persisting activity logs in the chat history permanently

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Visual style | Minimal inline text (no card border) | Matches ChatGPT's clean aesthetic, less visual noise than cards |
| Persistence | Fade away after agent completes | Keeps chat clean; specialized result cards remain |
| Data storage | Separate `agentActivityLogs` table | Avoids cluttering `chatMessages`; enables fine-grained reactivity |
| Anchor message | One `agent_activity` chatMessage per run | Single entry point in FlatList; soft-deleted on completion |
| Real-time updates | Convex `useQuery()` reactivity | No polling; automatic push when new entries are written |

---

## User Stories

### US-01: See Agent Thinking
**As a** user, **I want to** see what the agent is doing while it processes my request **so that** I know it's working and understand what it's doing.

**Acceptance Criteria:**
- When agent starts processing, inline activity text appears in the chat flow
- Each activity shows an icon (based on type) and a short description
- Activities stream in real-time as the agent works
- Default view shows last 2 activity lines

### US-02: Expand Activity Log
**As a** user, **I want to** expand the activity log to see all steps **so that** I can review everything the agent did.

**Acceptance Criteria:**
- Tapping the activity area expands to show all entries
- Chevron indicator rotates on expand/collapse
- Expanded view has max-height ~300px with scroll
- Smooth height animation (react-native-reanimated)

### US-03: Clean Chat After Completion
**As a** user, **I want** the activity stream to fade away when the agent finishes **so that** my chat stays clean and focused on results.

**Acceptance Criteria:**
- When `agentBusy` transitions to false, activity card fades out (opacity over 500ms, then height collapse over 300ms)
- The anchor message is soft-deleted by the backend
- Result cards, text responses, etc. remain visible as normal

### US-04: Activity Types
**As a** user, **I want** different activity types to show different icons **so that** I can quickly understand what kind of work the agent is doing.

**Acceptance Criteria:**
- `thinking` -> Sparkles icon
- `searching` -> Search icon
- `reading` -> BookOpen icon
- `tool_calling` -> Wrench icon
- `planning` -> ListChecks icon
- `researching` -> FlaskConical icon
- `synthesizing` -> PenLine icon

### US-05: Typing Indicator Suppression
**As a** user, **I want** the 3-dot typing indicator to be hidden when the activity stream is visible **so that** I don't see redundant loading states.

**Acceptance Criteria:**
- When an `agent_activity` message is the most recent, suppress `TypingIndicator`
- When no activity message exists, fall back to existing typing indicator behavior

---

## Technical Architecture

### Data Model

#### New table: `agentActivityLogs`

```ts
agentActivityLogs: defineTable({
  conversationId: v.id("conversations"),
  activityType: v.union(
    v.literal("thinking"),
    v.literal("searching"),
    v.literal("reading"),
    v.literal("tool_calling"),
    v.literal("planning"),
    v.literal("researching"),
    v.literal("synthesizing")
  ),
  summary: v.string(),              // "Searching for rental properties..."
  detail: v.optional(v.string()),   // Longer detail for expanded view
  metadata: v.optional(v.any()),    // { toolName, documentTitle, url, etc. }
  status: v.union(
    v.literal("in_progress"),
    v.literal("completed")
  ),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_conversation", ["conversationId", "createdAt"])
```

#### Message type addition

Add `v.literal("agent_activity")` to `chatMessages.messageType` union in `convex/schema.ts`.

#### Card data type

```ts
export interface AgentActivityCardData {
  card_type: 'agent_activity'
  conversation_id: string
}
```

### Backend Mutations & Queries

**New directory: `convex/agentActivity/`**

| File | Exports | Purpose |
|------|---------|---------|
| `mutations.ts` | `logActivity`, `completeActivity`, `clearForConversation` | Write activity entries |
| `queries.ts` | `getForConversation` | Read activities (reactive) |
| `emit.ts` | `emitActivity`, `completeActivity` | Thin helper for Node.js actions |

### Backend Integration Points

| Workflow | File | Activities Emitted |
|----------|------|--------------------|
| Chat agent | `convex/chat/agent.ts` | thinking (triage), thinking (LLM call), tool_calling, planning |
| Deep research | `convex/research/actions.ts` | researching, searching, reading, synthesizing |
| Agent plans | `convex/agentPlans/actions.ts` | tool_calling per step |
| Assimilation | `convex/assimilate/actions.ts` | reading, synthesizing |

**Agent run lifecycle:**
1. `agent.run()` starts -> create anchor `agent_activity` message -> emit `thinking`
2. During processing -> emit activities per step
3. Agent finishes -> soft-delete anchor message (triggers fade on client)

**Skip threshold:** If triage resolves with `directResponse` in <500ms, skip activity logging entirely.

### Frontend Component

**New file: `components/chat/AgentActivityCard.tsx`**

Minimal inline style, no card border:
```
  [Sparkles] Understanding your request...
  [Search]   Searching for rental properties...
  [BookOpen]  Reading: Market Analysis Report
```

**Key behaviors:**
- `useQuery(api.agentActivity.queries.getForConversation)` for real-time data
- New entries animate in with `FadeIn.duration(200)` (react-native-reanimated)
- In-progress entries show pulsing `...` suffix
- Completed entries show muted text color
- Collapsed: last 2 entries + chevron to expand
- Expanded: all entries in ScrollView (max-height 300px)
- Fade-out: when `agentBusy` goes false, opacity 1->0 over 500ms, then height collapse 300ms

**Integration:**
- `MessageBubble.tsx`: Add handler for `agent_activity` message type
- `ChatThread.tsx`: Suppress `TypingIndicator` when activity card is present

---

## Implementation Phases

### Phase 1: Data Layer
1. Add `agentActivityLogs` table to schema
2. Add `agent_activity` to message type union
3. Create `convex/agentActivity/` (mutations, queries, emit helper)
4. Deploy schema

### Phase 2: Agent Integration
5. Update `convex/chat/agent.ts` - emit activities during agent runs
6. Update `convex/research/actions.ts` - emit research activities
7. Update `convex/agentPlans/actions.ts` - emit plan step activities
8. Update `convex/assimilate/` actions - emit assimilation activities

### Phase 3: Frontend
9. Add types to `lib/types/chat.ts`
10. Create `components/chat/AgentActivityCard.tsx`
11. Update `MessageBubble.tsx` - render new card type
12. Update `ChatThread.tsx` - suppress typing indicator

### Phase 4: Polish
13. Storybook story for AgentActivityCard
14. Edge case handling (quick responses, no activities, conversation switch)
15. Cleanup: scheduled job to delete old activity logs (>24h)

---

## Verification Plan

| Check | Command | Pass Criteria |
|-------|---------|---------------|
| Type check | `pnpm tsc --noEmit` | Exit code 0 |
| Schema deploy | `npx convex dev` | No errors |
| Tests | `pnpm vitest run` | All pass |
| Manual: chat | Send message | Activity lines appear inline, fade after response |
| Manual: research | `/research topic` | Research activities stream in real-time |
| Manual: typing indicator | Send message | 3-dot hidden when activity card present |
| Storybook | `vitest --project=storybook --run` | All stories render |

---

## Open Questions

1. Should voice agent sessions also emit activities? (Deferred - can add later)
2. Should we add a user setting to disable activity stream? (Not for v1)
3. Should activities be visible in conversation history when scrolling back? (No - they fade away)
