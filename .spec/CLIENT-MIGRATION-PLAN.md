# Client Migration Plan: Supabase to Convex

**Date**: 2026-03-05
**Author**: react-native-ui-planner
**Status**: DRAFT - For Review
**Related**: MIGRATION-ANALYSIS.md

---

## Executive Summary

This document details the migration strategy for React Native mobile app and CLI skill clients from Supabase to Convex, focusing on unified client interfaces, hook migration patterns, and real-time subscription strategies.

### Key Deliverables

1. **Shared Client Package Design** - Unified Convex client interface for both mobile and CLI
2. **Hook Migration Guide** - Systematic replacement of Supabase hooks with Convex equivalents
3. **Real-time Subscription Patterns** - Convex-native reactive queries replacing Supabase Realtime
4. **Gradual Migration Path** - Strategy for running both clients during transition

---

## Table of Contents

1. [Current Client Architecture](#current-client-architecture)
2. [Convex Client Architecture](#convex-client-architecture)
3. [Hook Migration Guide](#hook-migration-guide)
4. [Real-time Subscription Migration](#real-time-subscription-migration)
5. [Shared Client Package Design](#shared-client-package-design)
6. [Testing Strategy](#testing-strategy)
7. [Gradual Migration Timeline](#gradual-migration-timeline)
8. [Rollback Strategy](#rollback-strategy)

---

## Current Client Architecture

### React Native Mobile App

**Current Stack**:
- `@supabase/supabase-js` v2.98.0 - Direct Supabase client
- `@tanstack/react-query` v5.90.21 - Query caching and state management
- Supabase Realtime subscriptions - WebSocket-based updates

**Key Hooks**:
```typescript
// Current Supabase hooks
hooks/
├── use-chat-realtime.ts        // Supabase Realtime for chat messages
├── useLongRunningTask.ts       // Supabase + React Query for task monitoring
├── useConversations.ts         // Supabase + React Query for conversations
├── useDocuments.ts             // Supabase search functions
├── useChatSend.ts              // Edge Function calls via Supabase
└── taskRealtimeRegistry.ts     // Registry for task-specific subscriptions
```

**Direct Supabase Usage**:
```typescript
// lib/supabase.ts
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey)
export const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey)

// Search functions
export async function searchHybrid(query: string, options: {...}): Promise<SearchResult[]>
export async function searchFTS(query: string, options: {...}): Promise<SearchResult[]>
export async function searchVector(query: string, options: {...}): Promise<SearchResult[]>
export async function listDocuments(options: {...}): Promise<Document[]>
```

### CLI Skill (Claude Code holocron skill)

**Current Stack**:
- Direct `@supabase/supabase-js` client
- No React/React Query (Node.js environment)
- Direct PostgreSQL queries via Supabase client

**Usage Pattern**:
```typescript
import { supabaseAdmin } from '@/lib/supabase'

// Direct queries
const { data } = await supabaseAdmin
  .from('documents')
  .select('*')
  .eq('category', 'research')

// RPC calls
const { data } = await supabaseAdmin.rpc('hybrid_search', {...})
```

---

## Convex Client Architecture

### Convex Package Dependencies

**Required Installations**:
```json
{
  "dependencies": {
    "convex": "^1.16.0",           // Core Convex client
    "@convex-dev/react": "^1.16.0" // React hooks for Convex
  }
}
```

**To Remove** (post-migration):
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.98.0"  // REMOVE after migration
  }
}
```

### Convex Client Setup

**Mobile App (React Native)**:
```typescript
// lib/convex.ts
import { ConvexReactClient } from "convex/react";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL!;
const convex = new ConvexReactClient(convexUrl);

export default convex;
```

**Root Provider**:
```typescript
// app/_layout.tsx
import { ConvexProvider } from "convex/react";
import convex from "@/lib/convex";

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      {/* Existing providers */}
    </ConvexProvider>
  );
}
```

**CLI Skill (Node.js)**:
```typescript
// lib/convex-cli.ts
import { ConvexHttpClient } from "convex/server";

const convexUrl = process.env.CONVEX_URL!;
const convex = new ConvexHttpClient(convexUrl);

export default convex;
```

---

## Hook Migration Guide

### Migration Pattern: Supabase + React Query → Convex useQuery

**Before (Supabase + React Query)**:
```typescript
// hooks/useConversations.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Failed: ${error.message}`)
  return data as Conversation[]
}

export function useConversations() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['conversations'],
    queryFn: fetchConversations,
  })

  return { conversations: data ?? [], isLoading, error }
}
```

**After (Convex)**:
```typescript
// hooks/useConversations.ts
import { useQuery } from '@/convex/_generated/react'
import { api } from '@/convex/_generated'

export function useConversations() {
  const conversations = useQuery(api.conversations.list)
  return {
    conversations: conversations ?? [],
    isLoading: conversations === undefined,
    error: null, // Convex handles errors internally
  }
}
```

### 1. useConversations Migration

**File**: `hooks/useConversations.ts`

**Current Implementation**:
- React Query with manual fetching
- Optimistic updates via `onMutate` callbacks
- Supabase direct queries

**Convex Implementation**:
```typescript
// hooks/useConversationsConvex.ts
import { useQuery, useMutation } from '@/convex/_generated/react'
import { api } from '@/convex/_generated'
import type { Id } from '@/convex/_generated/dataModel'

export interface UseConversationsReturn {
  conversations: Array<{
    id: Id<"conversations">
    title: string
    lastMessage?: string
    lastMessageAt?: Date
    createdAt: Date
    updatedAt: Date
  }>
  activeConversationId: Id<"conversations"> | null
  isLoading: boolean
  isCreating: boolean
  isRenaming: boolean
  isDeleting: boolean
  error: Error | null
  createConversation: () => Promise<Id<"conversations">>
  switchConversation: (id: Id<"conversations">) => void
  renameConversation: (id: Id<"conversations">, newTitle: string) => Promise<void>
  deleteConversation: (id: Id<"conversations">) => Promise<Id<"conversations"> | null>
}

export function useConversations(): UseConversationsReturn {
  // Query for all conversations (automatic reactivity)
  const conversations = useQuery(api.conversations.list)

  // Mutations
  const create = useMutation(api.conversations.create)
  const update = useMutation(api.conversations.update)
  const remove = useMutation(api.conversations.remove)

  return {
    conversations: conversations ?? [],
    isLoading: conversations === undefined,
    isCreating: create.isLoading,
    isRenaming: update.isLoading,
    isDeleting: remove.isLoading,
    error: null, // Convex handles errors via UI
    createConversation: async () => await create.mutate({}),
    switchConversation: (id) => { /* local state */ },
    renameConversation: async (id, title) => await update.mutate({ id, title }),
    deleteConversation: async (id) => await remove.mutate({ id }),
  }
}
```

**Key Changes**:
- No more `queryKey` management (Convex handles this)
- No more manual optimistic updates (Convex provides automatic optimistic updates)
- No more `invalidateQueries` (Convex queries auto-update)
- Simplified error handling (Convex manages error states)

---

### 2. useLongRunningTask Migration

**File**: `hooks/useLongRunningTask.ts`

**Current Implementation Complexity**:
- 362 lines of code
- Supabase Realtime subscriptions with manual channel management
- React Query polling + Realtime updates
- Custom registry for task-specific subscriptions
- Complex cleanup logic for channels

**Convex Implementation** (Dramatic Simplification):
```typescript
// hooks/useLongRunningTaskConvex.ts
import { useQuery } from '@/convex/_generated/react'
import { api } from '@/convex/_generated'
import type { Id } from '@/convex/_generated/dataModel'
import { useEffect, useRef } from 'react'

export interface UseLongRunningTaskOptions<TResult = unknown> {
  taskType: 'deep-research' | 'assimilate' | 'shop' | 'research'
  conversationId: Id<"conversations"> | null
  onSuccess?: (result: TResult) => void
  onError?: (error: Error) => void
  onProgress?: (status: string, message: string | null) => void
}

export interface UseLongRunningTaskReturn {
  task: {
    id: Id<"tasks">
    status: 'pending' | 'queued' | 'loading' | 'running' | 'completed' | 'error' | 'cancelled'
    progressMessage: string | null
    currentStep: number | null
    totalSteps: number | null
    result: unknown | null
    errorMessage: string | null
  } | null
  isLoading: boolean
  isRunning: boolean
  error: Error | null
}

export function useLongRunningTask<TResult = unknown>(
  options: UseLongRunningTaskOptions<TResult>
): UseLongRunningTaskReturn {
  const { taskType, conversationId, onSuccess, onError, onProgress } = options
  const successCalledRef = useRef<Set<string>>(new Set())

  // SINGLE QUERY - Convex handles all real-time updates automatically
  const task = useQuery(
    api.tasks.getByConversationAndType,
    conversationId ? { conversationId, taskType } : "skip"
  )

  // Handle callbacks
  useEffect(() => {
    if (!task) return

    // Progress callback
    onProgress?.(task.status, task.progressMessage)

    // Success callback
    if (task.status === 'completed' && task.result) {
      if (!successCalledRef.current.has(task.id)) {
        successCalledRef.current.add(task.id)
        onSuccess?.(task.result as TResult)
      }
    }

    // Error callback
    if (task.status === 'error') {
      if (!successCalledRef.current.has(task.id)) {
        successCalledRef.current.add(task.id)
        onError?.(new Error(task.errorMessage ?? 'Unknown error'))
      }
    }
  }, [task, onSuccess, onError, onProgress])

  return {
    task,
    isLoading: task === undefined,
    isRunning: task ? ['queued', 'loading', 'running'].includes(task.status) : false,
    error: null,
  }
}
```

**Lines of Code Reduction**: 362 → ~80 lines (78% reduction)

**Key Improvements**:
- No manual subscription management
- No cleanup logic (Convex handles this)
- No polling interval configuration
- No `taskRealtimeRegistry` needed
- Automatic reactivity via Convex queries

---

### 3. useChatRealtime Migration

**File**: `hooks/use-chat-realtime.ts`

**Current Implementation**:
```typescript
// 81 lines of Supabase Realtime subscription management
const channel = supabase
  .channel(`chat-${conversationId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'chat_messages',
    filter: `conversation_id=eq.${conversationId}`,
  }, handleNewMessage)
  .subscribe()

// Cleanup
return () => {
  supabase.removeChannel(channel)
}
```

**Convex Implementation** (No Hook Needed!):
```typescript
// Simply use useQuery directly in component
import { useQuery } from '@/convex/_generated/react'
import { api } from '@/convex/_generated'

function ChatThread({ conversationId }: { conversationId: Id<"conversations"> }) {
  // Auto-subscribes to new messages - no manual subscription needed
  const messages = useQuery(
    api.chatMessages.listByConversation,
    { conversationId }
  )

  return (
    <FlatList
      data={messages ?? []}
      renderItem={({ item }) => <MessageBubble message={item} />}
    />
  )
}
```

**Key Changes**:
- Delete `use-chat-realtime.ts` entirely (no longer needed)
- Use `useQuery` directly in components
- Convex automatically pushes new messages to client

---

### 4. useDocuments Migration

**File**: `hooks/useDocuments.ts`

**Current Implementation**:
- Supabase RPC calls for search
- Manual state management with `useState`
- Manual fetching with `useEffect`

**Convex Implementation**:
```typescript
// hooks/useDocumentsConvex.ts
import { useQuery } from '@/convex/_generated/react'
import { api } from '@/convex/_generated'
import type { Id } from '@/convex/_generated/dataModel'

export interface UseDocumentsOptions {
  category?: string | null
  searchQuery?: string
  enabled?: boolean
}

export function useDocuments(options: UseDocumentsOptions = {}) {
  const { category, searchQuery, enabled = true } = options

  // Single query - Convex handles all filtering server-side
  const documents = useQuery(
    api.documents.search,
    enabled ? { query: searchQuery ?? '', category: category ?? undefined } : "skip"
  )

  return {
    articles: documents?.map(doc => ({
      id: doc._id,
      title: doc.title,
      category: doc.category,
      date: doc.createdAt,
      snippet: doc.content?.slice(0, 200) + '...',
    })) ?? [],
    loading: documents === undefined,
    error: null,
  }
}
```

**Key Changes**:
- No manual `useState` for data
- No `useEffect` for fetching
- Single Convex query handles both list and search
- Server-side filtering for better performance

---

### 5. useChatSend Migration

**File**: `hooks/useChatSend.ts`

**Current Implementation**:
```typescript
// Supabase Edge Function call
const response = await fetch(`${supabaseUrl}/functions/v1/chat-router`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${supabaseAnonKey}` },
  body: JSON.stringify({ message, conversationId }),
})
```

**Convex Implementation**:
```typescript
// hooks/useChatSendConvex.ts
import { useMutation } from '@/convex/_generated/react'
import { api } from '@/convex/_generated'

export function useChatSend() {
  const send = useMutation(api.chat.send)

  return {
    sendMessage: async (message: string, conversationId: Id<"conversations">) => {
      await send.mutate({ message, conversationId })
    },
    isLoading: send.isLoading,
  }
}
```

**Key Changes**:
- No HTTP fetch calls
- No Authorization header management
- Type-safe arguments
- Automatic optimistic updates (optional)

---

## Real-time Subscription Migration

### Supabase Realtime → Convex Reactive Queries

**Supabase Pattern** (Manual Subscription Management):
```typescript
// 1. Create channel
const channel = supabase.channel('task-updates')

// 2. Subscribe to table changes
channel.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'long_running_tasks',
  filter: `conversation_id=eq.${conversationId}`,
}, callback)

// 3. Subscribe
channel.subscribe()

// 4. Cleanup on unmount
return () => supabase.removeChannel(channel)
```

**Convex Pattern** (Automatic Reactivity):
```typescript
// Just use useQuery - Convex handles the rest
const task = useQuery(api.tasks.getByConversation, { conversationId })
// Component re-renders automatically when task changes
```

### Real-time Feature Mapping

| Feature | Supabase | Convex |
|---------|----------|--------|
| **Chat messages** | `supabase.channel().on('postgres_changes')` | `useQuery(api.chatMessages.list)` |
| **Task progress** | `supabase.channel().on('postgres_changes')` | `useQuery(api.tasks.get)` |
| **Conversation list** | Manual `refetch()` + Realtime | `useQuery(api.conversations.list)` |
| **Document search** | RPC call + manual fetch | `useQuery(api.documents.search)` |

### Benefits of Convex Reactivity

1. **No Subscription Management**
   - No channel creation/destroy logic
   - No cleanup functions
   - No memory leaks from forgotten subscriptions

2. **Automatic Optimistic Updates**
   - Optional: mutations immediately update local cache
   - Server response validates/optimistic update rolls back

3. **Consistent State**
   - Single source of truth (Convex query)
   - No race conditions between polling and subscriptions
   - No stale data issues

---

## Shared Client Package Design

### Problem

Mobile app (React Native) and CLI skill (Node.js) need different Convex clients:
- Mobile: `ConvexReactClient` (React hooks)
- CLI: `ConvexHttpClient` (async/await)

### Solution: Unified Client Interface

**Package Structure**:
```
packages/
└── holocron-convex-client/
    ├── src/
    │   ├── index.ts              # Main exports
    │   ├── react.ts              # React Native client
    │   ├── node.ts               # CLI skill client
    │   ├── types.ts              # Shared types
    │   └── generated/            # Convex-generated types
    ├── package.json
    └── tsconfig.json
```

**Shared Types** (`src/types.ts`):
```typescript
// Shared across mobile and CLI
export interface Conversation {
  id: string
  title: string
  lastMessage?: string
  createdAt: Date
  updatedAt: Date
}

export interface Document {
  id: string
  title: string
  content: string
  category: string
  embedding?: number[]
}

export interface Task {
  id: string
  taskType: string
  status: 'pending' | 'running' | 'completed' | 'error'
  progressMessage?: string
  result?: unknown
}
```

**React Client** (`src/react.ts`):
```typescript
import { useQuery, useMutation } from '@/convex/_generated/react'
import { api } from '@/convex/_generated'

export function useConversations() {
  const conversations = useQuery(api.conversations.list)
  return { conversations, isLoading: conversations === undefined }
}

export function useChatSend() {
  const send = useMutation(api.chat.send)
  return { sendMessage: send.mutate, isLoading: send.isLoading }
}

export function useDocuments(query: string) {
  const documents = useQuery(api.documents.search, { query })
  return { documents, isLoading: documents === undefined }
}
```

**Node Client** (`src/node.ts`):
```typescript
import convex from '@/lib/convex-cli'
import { api } from '@/convex/_generated'

export async function listConversations(): Promise<Conversation[]> {
  return await convex.query(api.conversations.list)
}

export async function sendChat(message: string, conversationId: string): Promise<void> {
  await convex.mutation(api.chat.send, { message, conversationId })
}

export async function searchDocuments(query: string): Promise<Document[]> {
  return await convex.query(api.documents.search, { query })
}
```

**Main Exports** (`src/index.ts`):
```typescript
// React exports (for mobile app)
export { useConversations, useChatSend, useDocuments } from './react'

// Node exports (for CLI skill)
export { listConversations, sendChat, searchDocuments } from './node'

// Types (shared)
export type { Conversation, Document, Task } from './types'
```

**Usage in Mobile App**:
```typescript
// app/(tabs)/chat.tsx
import { useConversations, useChatSend } from 'holocron-convex-client'

export function ChatScreen() {
  const { conversations } = useConversations()
  const { sendMessage } = useChatSend()
  // ...
}
```

**Usage in CLI Skill**:
```typescript
// skills/holocron/index.ts
import { listConversations, searchDocuments } from 'holocron-convex-client'

export async function queryHolocron(query: string) {
  const docs = await searchDocuments(query)
  return docs
}
```

---

## Testing Strategy

### Unit Tests

**Hook Testing** (React Native Testing Library):
```typescript
// hooks/__tests__/useConversationsConvex.test.ts
import { renderHook, waitFor } from '@testing-library/react-native'
import { useConversations } from '../useConversationsConvex'
import { ConvexProvider } from 'convex/react'

test('fetches conversations', async () => {
  const { result } = renderHook(() => useConversations(), {
    wrapper: ({ children }) => (
      <ConvexProvider client={mockConvexClient}>
        {children}
      </ConvexProvider>
    ),
  })

  await waitFor(() => {
    expect(result.current.conversations).toHaveLength(3)
  })
})
```

### Integration Tests

**End-to-End Chat Flow**:
```typescript
// e2e/chat-flow.test.ts
import { describe, it, expect } from '@jest/globals'
import { sendMessage } from '@/hooks/useChatSendConvex'
import { getMessages } from '@/hooks/useChatMessagesConvex'

describe('Chat Flow', () => {
  it('sends message and receives response', async () => {
    // Send message
    await sendMessage('Hello', testConversationId)

    // Wait for response
    await waitFor(async () => {
      const messages = await getMessages(testConversationId)
      expect(messages).toHaveLength(2) // User + Assistant
    })
  })
})
```

### Real-time Update Tests

**Task Progress Monitoring**:
```typescript
// e2e/task-progress.test.ts
import { useLongRunningTask } from '@/hooks/useLongRunningTaskConvex'

test('tracks task progress', async () => {
  const progressUpdates: string[] = []

  renderHook(() => useLongRunningTask({
    taskType: 'deep-research',
    conversationId: testConversationId,
    onProgress: (status, message) => progressUpdates.push(message ?? ''),
  }))

  // Start task (via backend)
  await startDeepResearch(testConversationId)

  // Wait for progress updates
  await waitFor(() => {
    expect(progressUpdates).toContain('Researching topic...')
    expect(progressUpdates).toContain('Finding sources...')
  })
})
```

### Migration Validation Tests

**Data Consistency**:
```typescript
// tests/migration-validation.test.ts
import { supabaseAdmin } from '@/lib/supabase'
import convex from '@/lib/convex-cli'

test('conversations match between Supabase and Convex', async () => {
  // Fetch from both systems
  const supabaseConvos = await supabaseAdmin.from('conversations').select('*')
  const convexConvos = await convex.query(api.conversations.list)

  // Compare counts
  expect(supabaseConvos.data?.length).toEqual(convexConvos.length)

  // Compare data
  expect(convexConvos).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: expect.any(String),
        createdAt: expect.any(Date),
      }),
    ])
  )
})
```

---

## Gradual Migration Timeline

### Phase 1: Dual-Client Setup (Week 1)

**Goal**: Run Supabase and Convex in parallel

**Tasks**:
1. Install Convex dependencies
```bash
pnpm add convex @convex-dev/react
```

2. Initialize Convex project
```bash
npx convex dev
```

3. Create Convex client files
```bash
# Create Convex setup files
touch lib/convex.ts
touch lib/convex-cli.ts
```

4. Update root layout to include ConvexProvider
```typescript
// app/_layout.tsx
import { ConvexProvider } from "convex/react";
import convex from "@/lib/convex";

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      {/* Existing providers */}
    </ConvexProvider>
  );
}
```

**Exit Criteria**:
- Convex client initialized
- No app crashes
- Supabase still functional

---

### Phase 2: Migrate Non-Critical Hooks (Week 2)

**Goal**: Migrate low-risk hooks first

**Hooks to Migrate**:
1. `useDocuments` - Low risk, read-only
2. `useConversations` - CRUD operations, no complex state

**Migration Steps**:
1. Create new Convex hooks with `Convex` suffix
```bash
# Create new hooks
touch hooks/useDocumentsConvex.ts
touch hooks/useConversationsConvex.ts
```

2. Update components to use new hooks
```typescript
// Before
import { useDocuments } from '@/hooks/useDocuments'

// After
import { useDocuments } from '@/hooks/useDocumentsConvex'
```

3. Test thoroughly before deleting old hooks

**Exit Criteria**:
- `useDocuments` migrated
- `useConversations` migrated
- All tests pass
- No UI regressions

---

### Phase 3: Migrate Complex Hooks (Week 3)

**Goal**: Migrate complex real-time hooks

**Hooks to Migrate**:
1. `useLongRunningTask` - High complexity, critical for research workflows
2. `useChatRealtime` - DELETE (no longer needed with Convex)

**Migration Steps**:
1. Create `useLongRunningTaskConvex`
2. Test with deep-research workflow
3. Delete `use-chat-realtime.ts` (functionality built into Convex)
4. Delete `taskRealtimeRegistry.ts` (no longer needed)

**Exit Criteria**:
- `useLongRunningTask` migrated
- Real-time updates functional
- Task progress monitoring works
- ~200 lines of code deleted

---

### Phase 4: Migrate Chat Interface (Week 4)

**Goal**: Migrate core chat functionality

**Hooks to Migrate**:
1. `useChatSend` - Core chat interaction
2. `useChatHistory` - Message display

**Migration Steps**:
1. Create `useChatSendConvex`
2. Update chat components to use Convex queries
3. Test message sending/receiving
4. Test real-time message updates

**Exit Criteria**:
- Chat interface functional
- Real-time message updates work
- No message loss during migration

---

### Phase 5: CLI Skill Migration (Week 5)

**Goal**: Migrate CLI skill to use Convex

**Tasks**:
1. Install Convex dependencies in CLI skill
2. Create `ConvexHttpClient` setup
3. Replace Supabase calls with Convex queries
4. Test all CLI skill commands

**Exit Criteria**:
- CLI skill uses Convex
- All skill commands functional
- Search results match Supabase

---

### Phase 6: Cleanup (Week 6)

**Goal**: Remove Supabase dependencies

**Tasks**:
1. Remove `@supabase/supabase-js` from package.json
2. Delete `lib/supabase.ts`
3. Delete old Supabase hooks
4. Remove Supabase environment variables
5. Update documentation

**Exit Criteria**:
- Zero Supabase dependencies
- Zero Supabase code
- Clean codebase

---

## Rollback Strategy

### Safe Rollback at Each Phase

**Phase 1-2 Rollback**:
```typescript
// Simply revert import changes
// Before
import { useDocuments } from '@/hooks/useDocumentsConvex'

// After
import { useDocuments } from '@/hooks/useDocuments'
```

**Phase 3-4 Rollback**:
- Keep Supabase running in parallel
- Feature flag to switch between clients
```typescript
const USE_CONVEX = process.env.EXPO_PUBLIC_USE_CONVEX === 'true'

export function useLongRunningTask(options) {
  if (USE_CONVEX) {
    return useLongRunningTaskConvex(options)
  } else {
    return useLongRunningTaskSupabase(options)
  }
}
```

**Phase 5-6 Rollback**:
- Reinstall `@supabase/supabase-js`
- Restore `lib/supabase.ts`
- Revert import changes

### Data Rollback

**If Convex data corruption detected**:
1. Keep Supabase running in parallel for 2 weeks post-migration
2. Daily data consistency checks
3. Immediate rollback to Supabase if issues detected

---

## Success Criteria

### Functional Requirements

| ID | Criterion | Measurement | Target |
|----|-----------|-------------|--------|
| **FR-1** | All hooks migrated to Convex | Hook count | 100% |
| **FR-2** | Real-time updates functional | Update latency | < 500ms p95 |
| **FR-3** | CLI skill migrated | Command success rate | 100% |
| **FR-4** | Code reduction | Lines of code deleted | > 30% |
| **FR-5** | Zero Supabase dependencies | Dependency check | 0 Supabase imports |

### Non-Functional Requirements

| ID | Criterion | Measurement | Target |
|----|-----------|-------------|--------|
| **NFR-1** | Improved developer experience | Hook complexity | < 100 lines/hook |
| **NFR-2** | No data loss | Row count comparison | 100% |
| **NFR-3** | Tests pass | Test coverage | > 80% |
| **NFR-4** | Documentation updated | Doc completeness | 100% |

---

## Open Questions

1. **Q: Can Convex handle 1536-dimensional vector embeddings efficiently?**
   - **Answer**: Phase 0 POC will validate this
   - **Decision point**: End of Phase 0

2. **Q: What's the performance impact of dual-client setup?**
   - **Answer**: Minimal - both clients use WebSocket connections
   - **Mitigation**: Monitor bundle size and connection count

3. **Q: How do we handle Convex deployment vs Supabase during migration?**
   - **Answer**: Keep Supabase as primary until Phase 6 complete
   - **Rollback**: Always have Supabase available for fallback

4. **Q: What about existing Supabase Edge Functions?**
   - **Answer**: Port to Convex Actions in Phase 2-3
   - **Migration**: One function at a time, test thoroughly

---

## Conclusion

This migration provides a significant opportunity to:
1. **Simplify codebase** - 30%+ reduction in client code
2. **Improve DX** - Automatic reactivity, no manual subscriptions
3. **Unify clients** - Single API for mobile and CLI
4. **Better observability** - Convex dashboard vs Supabase logs

**Recommendation**: Proceed with Phase 1 (Dual-Client Setup) to validate assumptions before full commitment.

**Next Steps**:
1. Review this plan with engineering-manager
2. Schedule Phase 1 kickoff
3. Set up Convex POC environment
4. Execute Phase 1 tasks

---

**Document Version**: 1.0
**Last Updated**: 2026-03-05
**Next Review**: After Phase 1 completion
