# 05 - Convex Endpoints

## Actions

### `voice.createSession`

Generates ephemeral token and creates session record.

```typescript
// convex/voice/actions.ts
export const createSession = action({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.object({
    ephemeralKey: v.string(),
    expiresAt: v.number(),
    sessionId: v.id("voiceSessions"),
  }),
  handler: async (ctx, args) => {
    // 1. POST to https://api.openai.com/v1/realtime/client_secrets
    // 2. Create voiceSessions record via mutation
    // 3. Return ephemeral key + session ID
  },
})
```

## Mutations

### `voice.endSession`

```typescript
export const endSession = mutation({
  args: { sessionId: v.id("voiceSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Mark session completed, calculate total duration
  },
})
```

### `voice.recordTranscript`

Writes voice turns to the existing `chatMessages` table (not a separate store).

```typescript
export const recordTranscript = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("agent")),
    content: v.string(),
  },
  returns: v.id("chatMessages"),
  handler: async (ctx, args) => {
    // Write to existing chatMessages table with messageType: "text"
  },
})
```

### `voice.recordCommand`

Records function call execution details for audit trail.

```typescript
export const recordCommand = mutation({
  args: {
    sessionId: v.id("voiceSessions"),
    transcript: v.string(),
    intent: v.string(),
    actionType: v.string(),
    success: v.boolean(),
    entities: v.optional(v.array(v.object({
      type: v.string(),
      value: v.string(),
      confidence: v.number(),
    }))),
    actionParams: v.optional(v.record(v.string(), v.string())),
    result: v.optional(v.object({
      success: v.boolean(),
      data: v.optional(v.any()),
      error: v.optional(v.string()),
    })),
  },
  returns: v.id("voiceCommands"),
  handler: async (ctx, args) => {
    // Write to voiceCommands table
  },
})
```

## Queries

### `voice.getActiveSession`

Prevents duplicate concurrent sessions.

```typescript
export const getActiveSession = query({
  args: { conversationId: v.id("conversations") },
  returns: v.union(
    v.object({
      _id: v.id("voiceSessions"),
      conversationId: v.id("conversations"),
      startedAt: v.number(),
      turnCount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    // Find session where conversationId matches and completedAt is undefined
    // Use .withIndex("by_conversation")
  },
})
```

## Scheduled Functions

### `voice.timeoutOrphanedSessions`

Cleans up sessions abandoned by app crash or disconnect.

```typescript
// convex/voice/scheduled.ts
export const timeoutOrphanedSessions = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    // Find sessions where completedAt is null and createdAt > 10 min ago
    // Mark as completed with errorMessage: "Session timed out"
    // Return count of timed-out sessions
  },
})
```

### Cron Registration

Add to `convex/crons.ts`:

```typescript
crons.interval(
  "voice-session-timeout",
  { minutes: 10 },
  internal.voice.scheduled.timeoutOrphanedSessions
);
```

## File Organization

```
convex/voice/
├── actions.ts      # createSession (generates ephemeral token)
├── mutations.ts    # endSession, recordTranscript, recordCommand
├── queries.ts      # getActiveSession
└── scheduled.ts    # timeoutOrphanedSessions
```
