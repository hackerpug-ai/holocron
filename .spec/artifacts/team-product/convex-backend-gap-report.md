# Convex Backend Gap Report: Voice Assistant

**Date**: 2026-03-28
**Analyst**: convex-planner
**Source PRD**: .spec/prd/voice-assistant/technical-requirements.md
**Schema reviewed**: convex/schema.ts (957 lines, 30+ tables)
**Audio code reviewed**: convex/audio/actions.ts, mutations.ts, queries.ts, scheduled.ts

---

## Executive Summary

The proposed Convex schema has five critical errors that would cause immediate runtime failures, plus several design problems that would degrade performance or create maintenance burden. The most severe: `v.id("users")` references a table that does not exist in the schema. Beyond schema bugs, the PRD fundamentally misunderstands Convex's role in a real-time voice architecture — storing ephemeral session state (`listening`, `processing`, `speaking`) in Convex is wrong, and the proposed WebRTC transport has no implementation path in this stack. The existing `convex/audio/` module provides ~60% of what's needed for TTS output and can be extended rather than rebuilt.

---

## 1. Schema Gap Analysis

### 1.1 Critical Errors (Would Break at Runtime)

#### Error 1: `v.id("users")` — Table Does Not Exist

**Location**: `voiceSessions.userId`
**Impact**: Schema validation failure on deploy. The entire schema deploy would fail.

There is no `users` table in `convex/schema.ts`. This is a personal single-user app. Every existing session table (`shopSessions`, `assimilationSessions`, `deepResearchSessions`, `researchSessions`) has no `userId` field — they are scoped by `conversationId` or standalone.

**Fix**: Remove `userId` entirely. Use `conversationId: v.optional(v.id("conversations"))` to link to an existing conversation — the established pattern in this codebase.

#### Error 2: `v.any()` for `actionParams` and `result` in `voiceCommands`

**Location**: `voiceCommands.actionParams`, `voiceCommands.result`
**Impact**: No schema enforcement. Silent data corruption possible.

`v.any()` is used in this codebase only for config blobs that are truly dynamic. Voice command action params and results have known shapes.

**Fix**:
```typescript
actionParams: v.optional(v.record(v.string(), v.string())),
result: v.optional(v.object({
  success: v.boolean(),
  data: v.optional(v.any()),
  error: v.optional(v.string()),
})),
```

#### Error 3: `audioUrl: v.optional(v.string())` in `voiceSessions.context` turns

**Location**: `voiceSessions.context[].audioUrl`
**Impact**: Convex `ctx.storage.getUrl()` returns time-limited signed URLs. They expire. Storing them creates stale references that return 403 errors.

**Fix**: Remove `audioUrl` entirely. Voice assistant TTS responses should be ephemeral. If audio persistence is ever needed, store `storageId: v.optional(v.id("_storage"))` and resolve to URL at query time.

#### Error 4: `turnId: v.number()` as Cross-Table Correlation Key

**Location**: `voiceAnalytics.turnId`, `voiceCommands.turnId`
**Impact**: Integer turn IDs cannot be joined across tables. There is no mechanism in Convex to enforce or query by a shared integer counter.

**Fix**: Reference `voiceCommands` directly from `voiceAnalytics`:
```typescript
commandId: v.id("voiceCommands"),  // Replace turnId in voiceAnalytics
```

#### Error 5: Missing `returns` Validators on All Proposed Endpoints

**Location**: All proposed `mutation` and `query` stubs
**Impact**: CONVEX-RULES.md mandates explicit `returns` validators. All function stubs in the PRD omit `returns:`.

---

### 1.2 Design Problems (Would Work But Are Wrong)

#### Problem 1: `voiceSessions.state` — Ephemeral State in the Database

**Location**: `voiceSessions.state` union (`idle | listening | processing | speaking | error`)

Storing real-time voice session state in Convex is architecturally wrong. These states transition at sub-100ms intervals (the PRD's interruption response target is <100ms). Each state transition requires a mutation round-trip to Convex — typical latency is 50-200ms. You cannot hit <100ms interruption response while routing state through the database.

The existing narration state machine (`components/narration/hooks/useNarrationState.ts`) correctly keeps all playback state client-side in a `useReducer`. Voice session state must follow the same pattern.

**Fix**: Remove `state` from the `voiceSessions` table. Add `completedAt: v.optional(v.number())` to indicate a finished session. The client state machine owns live state.

#### Problem 2: `voiceSessions.context` Array — Duplicates Existing Chat Pattern

**Location**: `voiceSessions.context: v.array(v.object({...}))`

The app already has `conversations` + `chatMessages` tables. Storing conversation turns as an embedded array creates a parallel, inferior system with no pagination, no per-turn querying, and a document size cap risk (Convex documents cap at ~1MB; a long session can hit this).

**Fix**: Remove `context` from `voiceSessions`. Add `conversationId: v.optional(v.id("conversations"))`. Voice turns become `chatMessages`.

#### Problem 3: `by_error_type` Index on Sparse Optional Field

**Location**: `voiceAnalytics.index("by_error_type", ["errorType"])`

`errorType` is `v.optional(v.string())`. Most records will have null here. Indexing a sparse optional field creates a large index full of null entries with minimal query value.

**Fix**: Drop this index. Use server-side aggregation for error analysis.

#### Problem 4: `voiceCommands` Uses `timestamp` Instead of `createdAt`

All 30+ tables in this schema use `createdAt: v.number()`. `voiceCommands` uses `timestamp: v.number()` instead, breaking the project convention.

**Fix**: Rename to `createdAt`, add `updatedAt: v.number()`.

#### Problem 5: `voiceAnalytics` Missing `createdAt`

All tables have `createdAt: v.number()`. `voiceAnalytics` omits it.

#### Problem 6: `voiceSessions.metadata` Required Object for Optional Data

Making metadata required forces every `startSession` call to provide device info. This should be optional telemetry.

**Fix**: `metadata: v.optional(v.object({...}))`

#### Problem 7: `by_user_recent` and `by_user` Indexes Are Invalid Without `userId`

Once `userId` is removed, both index definitions reference a non-existent field.

**Replacement indexes**:
```typescript
.index("by_started", ["startedAt"])
.index("by_created", ["createdAt"])
```

---

### 1.3 Corrected Schema

```typescript
// Add to convex/schema.ts

voiceSessions: defineTable({
  conversationId: v.optional(v.id("conversations")),
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
  .index("by_started", ["startedAt"])
  .index("by_created", ["createdAt"]),

voiceCommands: defineTable({
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
  .index("by_session", ["sessionId", "createdAt"]),

voiceAnalytics: defineTable({
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
  .index("by_session", ["sessionId"]),
```

---

## 2. Existing Code Reuse

### 2.1 What Can Be Reused Directly

| Existing Code | Voice Assistant Use | Notes |
|---|---|---|
| `ElevenLabsClient` in `convex/audio/actions.ts:9` | TTS for voice responses | Already initialized with `ELEVENLABS_API_KEY` |
| `MODEL_FLASH = "eleven_flash_v2_5"` at `actions.ts:11` | Use this, not PRD's `eleven_flash_v2` | PRD is one model version behind |
| `OUTPUT_FORMAT = "mp3_44100_128"` constant | Same format for voice responses | Already defined |
| `generateSegment` stream→Buffer→blob→storage pattern | Adapt for `synthesizeForVoice` — skip persistent storage for ephemeral TTS | Core pattern is correct |
| `ctx.storage.store()` + `ctx.storage.getUrl()` | If voice audio persistence is opted in | Identical pattern to narration |
| `resetSegmentForRetry` retry logic (max 3) at `mutations.ts:282` | Adapt for voice STT/TTS failure retries | Copy pattern directly |
| `timeoutStuckSegments` at `scheduled.ts:16` | Model for voice session timeout watchdog | Same cron watchdog pattern |
| `notifications` insert in `completeSegment` at `mutations.ts:219` | Fire notification when async voice command completes | Add `voice_complete` literal to type union |

### 2.2 New `synthesizeForVoice` Action

Add to `convex/audio/actions.ts` (extend existing module, not a new file):

```typescript
// Ephemeral TTS for voice responses — audio deleted after 5 minutes
export const synthesizeForVoice = internalAction({
  args: {
    text: v.string(),
    voiceId: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
    const voiceId = args.voiceId ?? DEFAULT_VOICE_ID;

    const audioStream = await client.textToSpeech.convert(voiceId, {
      text: args.text,
      model_id: MODEL_FLASH,
      output_format: OUTPUT_FORMAT,
      voice_settings: { stability: 0.6, similarity_boost: 0.75 },
    });

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const blob = new Blob([buffer], { type: "audio/mpeg" });
    const storageId = await ctx.storage.store(blob);

    await ctx.scheduler.runAfter(
      5 * 60 * 1000,
      internal.audio.actions.deleteVoiceAudio,
      { storageId }
    );

    return (await ctx.storage.getUrl(storageId)) as string;
  },
});

export const deleteVoiceAudio = internalAction({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.storage.delete(args.storageId);
    return null;
  },
});
```

### 2.3 Conversation Context Reuse

Voice turns should write to the existing `chatMessages` table via existing internal chat mutations. The `addTurn` mutation proposed in the PRD should not create parallel infrastructure.

---

## 3. API Design Review

### 3.1 Missing Endpoints

| Missing Endpoint | Type | Why Needed |
|---|---|---|
| `voice.getActiveSession` | query | Prevent duplicate concurrent sessions |
| `voice.recordCommand` | mutation | Record completed command separately from transcript |
| `voice.timeoutSession` | internalMutation | Clean up sessions abandoned on app crash |
| `audio.synthesizeForVoice` | internalAction | Ephemeral TTS for voice responses |

### 3.2 `addTurn` is Misdesigned

The proposed `addTurn` conflates two distinct operations that happen at different times:
1. Adding a conversational turn → maps to `chatMessages`, happens when STT completes
2. Recording a command with intent/entities/result → maps to `voiceCommands`, happens after action execution

**Fix**: Split into:
- `voice.recordTranscript` — writes user turn to `chatMessages` immediately on STT completion
- `voice.recordCommand` — writes to `voiceCommands` after intent classification and action execution

### 3.3 `logAnalytics` Validator Gap

The proposed `metrics: v.object({...})` uses `...` as a literal placeholder. This is a syntax error in Convex validator code. All fields must be explicitly typed.

### 3.4 `getRecentSessions` Needs a Default Limit

`limit: v.optional(v.number())` with no enforced default means callers can omit it and get all sessions. Enforce: `const effectiveLimit = args.limit ?? 20;` in the handler — matching the pattern used throughout the codebase.

---

## 4. Architecture Concerns

### 4.1 WebRTC Has No Implementation Path in This Stack

The PRD proposes WebRTC as primary audio transport. This cannot be implemented:

- Convex actions run on serverless Node.js — no WebRTC server capability.
- WebRTC requires a signaling server and STUN/TURN infrastructure outside Convex's model.
- Expo requires `react-native-webrtc` (native module not installed).

**Correct architecture**:
1. `expo-audio AudioRecorder` captures PCM audio on device
2. Client opens WebSocket directly to Deepgram (or HTTP streaming to OpenAI Realtime)
3. Convex receives only persistence writes — transcripts, commands, analytics — after processing

The PRD's architecture diagram showing audio flowing through Convex is incorrect. **Convex is not in the audio data path.**

### 4.2 Real-Time Session State Must Stay Client-Side

Storing `voiceSessions.state` in Convex on each sub-100ms transition is incompatible with the PRD's <100ms interruption response target. Convex mutation latency is 50-200ms.

State machine state (`listening`, `processing`, `speaking`) must be `useReducer` on the client — exactly the pattern used by `components/narration/hooks/useNarrationState.ts`. Convex only receives completed session records.

### 4.3 Real-Time UI via `useQuery` Subscriptions

The PRD does not mention Convex's real-time subscription model. `useQuery` automatically re-renders when underlying data changes — no polling needed. All reactive UI derived from `voiceSessions` or `voiceCommands` should use `useQuery`, not manual polling or state sync.

### 4.4 `action` vs `mutation` Boundary

`startSession`/`endSession` are correctly mutations (pure DB writes). Any endpoint that calls ElevenLabs must be an `action` or `internalAction` — mutations cannot make network calls. The PRD stubs do not distinguish these; the implementation plan must be explicit about this boundary.

---

## 5. Missing Convex Patterns

### 5.1 Session Timeout Watchdog

The existing `convex/audio/scheduled.ts:timeoutStuckSegments` (registered in `convex/crons.ts` as `audio-stuck-segment-cleanup` every 5 minutes) demonstrates the pattern. Voice sessions need:

- `timeoutOrphanedSessions` `internalMutation`: find `voiceSessions` where `completedAt` is null and `createdAt` is older than 10 minutes; mark them completed with an error note
- Register in `convex/crons.ts` following the same pattern

### 5.2 Optimistic Updates for Navigation Commands

Voice commands that navigate to a screen must apply optimistic updates before the Convex mutation confirms. Navigation cannot wait for a write-confirm if the <1.5s end-to-end latency target is to be met. The PRD omits this.

### 5.3 ElevenLabs Rate Limiting

The existing pipeline uses `STAGGER_MS = 200` to avoid ElevenLabs rate limits (`convex/audio/actions.ts:15`). The `rateLimitTracking` table already exists in the schema. Voice synthesis should check this table or apply the stagger pattern to avoid 429 errors during rapid back-to-back voice interactions.

### 5.4 `notifications` Table Extension

When a long-running voice-triggered command (e.g., deep research) completes asynchronously, the `notifications` table should fire. Add to the `type` union in `convex/schema.ts`:
```typescript
v.literal("voice_complete"),
```

---

## 6. Migration Path

All voice tables are new additions — zero-risk, no existing data modified.

### Step 1: Schema Addition
Add `voiceSessions`, `voiceCommands`, `voiceAnalytics` using corrected schema from §1.3. Deploy. No existing tables touched.

### Step 2: Audio Action Extension
Add `synthesizeForVoice` and `deleteVoiceAudio` to `convex/audio/actions.ts`. No existing functions modified.

### Step 3: Extend `notifications` Type Union
Add `v.literal("voice_complete")` to `notifications.type` in schema. Purely additive — existing rows unaffected.

### Step 4: Add Voice Mutations and Queries
Create `convex/voice/mutations.ts` and `convex/voice/queries.ts` with corrected function signatures. New files only.

### Step 5: Register Session Timeout Cron
Add to `convex/crons.ts`:
```typescript
crons.interval(
  "voice-session-timeout",
  { minutes: 10 },
  internal.voice.scheduled.timeoutOrphanedSessions
);
```

### Step 6: Client-Side Integration
Implement `VoiceSessionManager` as a `useReducer` hook modeled on `useNarrationState.ts`. Wire to Deepgram WebSocket directly. Call Convex mutations only for persistence. No additional schema changes needed.

---

## 7. Performance Notes

- `voiceCommands.by_session` uses compound `["sessionId", "createdAt"]` so commands are fetched in chronological order without post-query sort — critical for building conversation context
- All queries must use `withIndex` — `filter()` is banned per CONVEX-RULES.md. Analytics aggregations (average latency, etc.) must be computed in the handler after an indexed fetch
- Removing `context` array from `voiceSessions` eliminates the ~1MB document size cap risk during long sessions
- A 10-minute session at the <1.5s turn target generates ~200 combined writes (voiceCommands + voiceAnalytics). Well within Convex throughput but worth noting for billing

---

## 8. Summary of Blockers

| Severity | Issue | Fix |
|---|---|---|
| CRITICAL | `v.id("users")` — no users table | Remove `userId`; use `conversationId` or drop |
| CRITICAL | Ephemeral state in `voiceSessions.state` | Remove; keep state client-side in `useReducer` |
| CRITICAL | `audioUrl` stored in context turns | Remove; Convex URLs expire. Use `storageId` or omit |
| CRITICAL | `turnId: v.number()` cross-table join | Use `commandId: v.id("voiceCommands")` |
| CRITICAL | WebRTC transport has no implementation path | Use expo-audio + direct Deepgram WebSocket |
| HIGH | `context` array duplicates `chatMessages` | Replace with `conversationId` FK |
| HIGH | `addTurn` conflates two write operations | Split into `recordTranscript` + `recordCommand` |
| HIGH | Missing `returns` validators on all endpoints | Add `returns:` to every function |
| MEDIUM | `v.any()` for actionParams/result | Type with record/union |
| MEDIUM | `timestamp` instead of `createdAt` | Rename to match project convention |
| MEDIUM | Missing `createdAt` on voiceAnalytics | Add |
| MEDIUM | Required `metadata` object | Make optional |
| LOW | `by_error_type` index on sparse field | Drop this index |
| LOW | Wrong ElevenLabs model version in PRD | Update to `eleven_flash_v2_5` |
