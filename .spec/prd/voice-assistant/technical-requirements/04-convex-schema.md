# 04 - Convex Schema

## voiceSessions Table

```typescript
export const voiceSessions = defineTable({
  conversationId: v.id("conversations"),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  turnCount: v.number(),
  totalDurationMs: v.optional(v.number()),
  metadata: v.optional(v.object({
    deviceType: v.string(),
    platform: v.string(),
    appVersion: v.string(),
  })),
  errorMessage: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_conversation", ["conversationId"])
  .index("by_started", ["startedAt"])
  .index("by_created", ["createdAt"])
```

**Design Notes:**
- `conversationId` links voice session to existing chat conversation
- NO `userId` — no users table exists (single-user personal app)
- NO `state` field — voice state lives in client-side `useReducer`
- NO `context` array — voice turns write to `chatMessages` via `conversationId`
- `metadata` is optional (telemetry, not required for every session)

## voiceCommands Table

```typescript
export const voiceCommands = defineTable({
  sessionId: v.id("voiceSessions"),
  transcript: v.string(),
  intent: v.string(),
  entities: v.array(v.object({
    type: v.string(),
    value: v.string(),
    confidence: v.number(),
  })),
  actionType: v.string(),
  actionParams: v.optional(v.record(v.string(), v.string())),
  result: v.optional(v.object({
    success: v.boolean(),
    data: v.optional(v.any()),
    error: v.optional(v.string()),
  })),
  success: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_session", ["sessionId", "createdAt"])
```

**Design Notes:**
- Compound index `["sessionId", "createdAt"]` returns commands in chronological order
- `actionParams` typed as `v.record` (not `v.any()`)
- `result` typed as proper object (not `v.any()`)
- Uses `createdAt` (not `timestamp`) to match project convention

## voiceAnalytics Table (P2 — Deferred)

```typescript
export const voiceAnalytics = defineTable({
  sessionId: v.id("voiceSessions"),
  commandId: v.optional(v.id("voiceCommands")),
  sttLatencyMs: v.number(),
  llmLatencyMs: v.number(),
  ttsLatencyMs: v.number(),
  totalLatencyMs: v.number(),
  sttConfidence: v.optional(v.number()),
  errorType: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  recovered: v.optional(v.boolean()),
  createdAt: v.number(),
})
  .index("by_session", ["sessionId"])
```

**Design Notes:**
- Uses `commandId` FK instead of integer `turnId`
- NO `by_error_type` index (sparse optional field, low query value)
- Metric fields use `*Ms` suffix for clarity
- Deferred to P2 — not needed for V1 launch

## Schema Corrections Applied

These errors from the original PRD were fixed:

| Original Issue | Fix |
|---------------|-----|
| `v.id("users")` — no users table | Removed; use `conversationId` |
| `state` stored in DB | Removed; client-side `useReducer` |
| `audioUrl` in context turns | Removed; Convex URLs expire |
| `turnId: v.number()` cross-table | Replaced with `commandId: v.id("voiceCommands")` |
| `context` array duplicating chatMessages | Removed; use `conversationId` FK |
| `v.any()` for actionParams/result | Typed properly |
| `timestamp` instead of `createdAt` | Renamed to match convention |
| Missing `returns` validators | Added to all endpoints (see 05-convex-endpoints.md) |
