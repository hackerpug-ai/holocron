# Plan: Upgrade Assimilate-Creator for Video Transcript Resilience

## Context

The current holocron system has a critical gap: it cannot process YouTube videos that lack transcripts. For example, Jaymin West's channel has several videos without available transcripts, causing the assimilation process to fail or skip valuable content.

This upgrade aims to:
1. **Add resilient transcript extraction** - Use ToS-compliant services to fetch transcripts when unavailable
2. **Store full transcripts** - Save complete transcripts in Convex storage for future analysis
3. **Enrich creator assimilation** - Link transcripts to creator profiles and video content
4. **Auto-create for all videos** - Every new YouTube video gets a transcript job automatically

## Research Summary: ToS-Compliant Transcript Extraction

Based on research using Exa and web search, here are the recommended ToS-compliant approaches:

### Primary Approach: YouTube Data API v3 (Official)
- **Cost**: Free (100 quota/day)
- **ToS Status**: Fully compliant (official Google API)
- **Reliability**: High (official endpoint)
- **Coverage**: Most videos have auto-generated captions
- **Implementation**: Uses `caption` endpoint from YouTube Data API v3

### Fallback Approach: Jina Reader API (Web Scraping)
- **Cost**: Free (100 requests/minute, no auth required)
- **ToS Status**: Compliant for personal use (content extraction service)
- **Reliability**: Medium (web scraper, may fail on complex pages)
- **Coverage**: Extracts transcript text from YouTube page HTML
- **Implementation**: `https://r.jina.ai/http://youtube.com/watch?v={videoId}`

### Optional Approach: OpenAI Whisper (Audio Processing)
- **Cost**: ~$0.36/hour ($0.006/minute)
- **ToS Status**: Compliant (doesn't access YouTube directly)
- **Reliability**: High (state-of-the-art speech recognition)
- **Coverage**: 100% (works on any video with audio)
- **Implementation**: Requires audio download via yt-dlp wrapper

**Recommendation**: Start with YouTube API + Jina Reader (MVP, $0 cost). Add Whisper later only if needed.

## Current System Analysis

### Existing Infrastructure
- **Creator Profiles**: `convex/creators/` - Multi-platform profile management (YouTube, Twitter, Bluesky, GitHub)
- **Subscription Content**: `convex/subscriptions/` - YouTube video fetching via RSS feeds
- **Document Storage**: `convex/documents/` - Document creation with embeddings
- **File Storage**: Convex storage API available (`_storage` IDs in schema)

### Current YouTube Flow
1. YouTube videos fetched via RSS feed in `convex/subscriptions/internal.ts`
2. Video metadata stored in `subscriptionContent` table
3. Content linked to documents after research
4. No transcript extraction or storage currently

### Gap Analysis
- No transcript fetching capability
- No video audio download
- No transcription service integration
- No transcript storage layer
- No link between videos and their transcripts

## Implementation Plan

### Phase 1: Schema Updates (MVP)

**File: `convex/schema.ts`**

Add new tables (following `audioSegments` pattern for hybrid storage):

```typescript
// Video transcripts storage (hybrid approach like audioSegments)
videoTranscripts: defineTable({
  contentId: v.string(), // YouTube video ID
  sourceUrl: v.string(), // YouTube video URL
  transcriptType: v.union(v.literal("api"), v.literal("generated"), v.literal("jina_fallback")),
  transcriptSource: v.string(), // youtube_api, jina_reader_api
  storageId: v.id("_storage"), // Full transcript in file storage
  previewText: v.string(), // First 500 chars for search/display
  wordCount: v.number(),
  durationMs: v.optional(v.number()),
  language: v.optional(v.string()),
  metadataJson: v.optional(v.any()),
  generatedAt: v.number(),
  createdAt: v.number(),
})
.index("by_content_id", ["contentId"])
.index("by_source_url", ["sourceUrl"]),

// Transcript generation jobs (follows audioJobs pattern)
transcriptJobs: defineTable({
  contentId: v.string(),
  sourceUrl: v.string(),
  status: v.union(v.literal("pending"), v.literal("downloading"), v.literal("transcribing"), v.literal("completed"), v.literal("failed"), v.literal("no_captions")),
  priority: v.number(), // 0-10, higher = sooner
  retryCount: v.number(),
  errorMessage: v.optional(v.string()),
  transcriptId: v.optional(v.id("videoTranscripts")),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
})
.index("by_status", ["status"])
.index("by_content", ["contentId"])
.index("by_priority", ["priority", "createdAt"]),
```

### Phase 2: Transcript Service Layer (MVP - ToS-Compliant)

**New File: `convex/transcripts/service.ts`**

Create ToS-compliant transcript service with fallback:

```typescript
// Service priorities (in order):
// 1. YouTube Data API (free, built-in captions) - PRIMARY
// 2. Jina Reader API (free, 100 requests/min) - FALLBACK for transcript text
// 3. OpenAI Whisper (paid, high accuracy) - OPTIONAL for missing transcripts

interface TranscriptService {
  name: string;
  fetchTranscript: (videoId: string) => Promise<TranscriptResult>;
  canHandle: (url: string) => boolean;
}
```

**ToS-Compliant Approach:**

1. **YouTube Data API v3** (Primary - ToS Compliant)
   - Uses official `caption` endpoint
   - Free: 100 quota/day
   - Returns both manual and auto-generated captions
   - ToS-compliant for all use cases

2. **Jina Reader API** (Fallback - ToS Compliant)
   - URL: `https://r.jina.ai/http://youtube.com/watch?v={videoId}`
   - Free: 100 requests/minute (no auth needed)
   - Extracts page content including transcript text
   - Acts as web scraper (ToS-compliant for personal use)
   - Lower reliability but works as fallback

3. **OpenAI Whisper** (Optional - ToS Compliant)
   - Only used when both above fail
   - Requires audio download (via yt-dlp wrapper)
   - Most accurate but adds cost
   - Can be skipped for MVP

**New File: `convex/transcripts/internal.ts`**

Internal actions for:
- Fetching from YouTube API caption endpoint (PRIMARY)
- Fallback to Jina Reader API for transcript extraction
- Optional: OpenAI Whisper for videos without any captions
- Storing transcripts to Convex storage
- Managing transcript job queue
- Idempotent job creation (follow `audioSegments` pattern)
- Staggered scheduling (1-5 second delays to avoid rate limits)

### Phase 3: Integration with Subscription Flow

**File: `convex/subscriptions/internal.ts`**

Modify `fetchYouTube()` function:
1. After discovering new video, check for existing transcript
2. If no transcript, create transcript job (priority 5 - medium)
3. Schedule high-priority job for immediate processing
4. Update subscription content with transcript metadata

### Phase 4: Creator Assimilation Enhancement

**File: `convex/creators/actions.ts`**

Add new action: `assimilateCreator`

```typescript
export const assimilateCreator = action({
  args: {
    profileId: v.id("creatorProfiles"),
    options: v.optional(v.object({
      maxVideos: v.number(), // Default: 50
      includeTranscripts: v.boolean(), // Default: true
      forceRegenerate: v.boolean(), // Re-transcribe existing
    }))
  },
  handler: async (ctx, args) => {
    // 1. Get all videos from creator's YouTube channel
    // 2. Fetch or generate transcripts for each video
    // 3. Store transcripts in holocron
    // 4. Create creator assimilation document
    // 5. Link all transcripts to creator profile
  }
})
```

### Phase 5: MCP Tool Updates

**File: `holocron-mcp/src/tools/creators.ts`**

Add new MCP tools:
- `assimilateCreator` - Start creator assimilation with transcript extraction
- `getCreatorTranscripts` - Retrieve all transcripts for a creator
- `regenerateTranscript` - Force re-transcription of a video

### Phase 6: Skill Updates

**New File: `brain/skills/assimilate-creator-resilient/SKILL.md`**

Update skill documentation to:
1. Document new transcript extraction flow
2. Add environment variable requirements (API keys)
3. Provide usage examples with error handling
4. Document cost considerations

## Critical Files to Create/Modify

### Files to Create
1. **`convex/transcripts/service.ts`** (NEW)
   - YouTube Data API integration
   - Jina Reader API fallback
   - Service orchestration logic

2. **`convex/transcripts/internal.ts`** (NEW)
   - Internal actions for transcript fetching
   - Job queue management
   - Storage operations

3. **`convex/transcripts/queries.ts`** (NEW)
   - Query existing transcripts
   - Check for duplicates
   - Fetch by contentId

4. **`convex/transcripts/mutations.ts`** (NEW)
   - Create transcript jobs
   - Update job status
   - Mark failures

5. **`convex/transcripts/scheduled.ts`** (NEW)
   - Scheduled job processing
   - Staggered execution
   - Retry logic

### Files to Modify
1. **`convex/schema.ts`** (MODIFY)
   - Add `videoTranscripts` table
   - Add `transcriptJobs` table
   - Follow `audioSegments` pattern

2. **`convex/subscriptions/internal.ts`** (MODIFY)
   - Modify `fetchYouTube()` function (line 158-195)
   - Add transcript job creation
   - Link transcripts to subscription content

3. **`convex/creators/actions.ts`** (MODIFY)
   - Add `assimilateCreator` action
   - Follow existing `discover` pattern

4. **`holocron-mcp/src/tools/creators.ts`** (MODIFY)
   - Add `assimilateCreator` MCP tool
   - Add `getCreatorTranscripts` MCP tool
   - Follow existing tool patterns

5. **`convex/schema.ts`** (MODIFY - existing)
   - No new dependencies for MVP
   - Uses existing YOUTUBE_API_KEY

## Critical Convex Patterns to Follow

### Pattern 1: Idempotent Job Creation (from `audioSegments`)
```typescript
// Prevents duplicate work, returns existing IDs if already created
export const createTranscriptJob = internalMutation({
  handler: async (ctx, args) => {
    // Check if job already exists for contentId
    // If exists and not terminal: return existing
    // If exists and failed: reset for retry
    // If not exists: create new job
  }
})
```

### Pattern 2: Staggered Scheduling (from `audio/actions.ts`)
```typescript
// Prevent thundering herd on YouTube API
const STAGGER_MS = 1000; // 1 second between jobs
let staggerIndex = 0;
for (const job of transcriptJobs) {
  await ctx.scheduler.runAfter(
    staggerIndex * STAGGER_MS,
    internal.transcripts.processJob,
    { jobId: job._id }
  );
  staggerIndex++;
}
```

### Pattern 3: Status Machine with Guards (from `assimilate/scheduled.ts`)
```typescript
const terminalStatuses = ["completed", "failed", "cancelled"];
if (terminalStatuses.includes(job.status)) {
  console.log(`Job already ${job.status}, skipping`);
  return;
}
```

### Pattern 4: Storage Cleanup (from `audio/mutations.ts`)
```typescript
// Delete storage before DB rows to prevent orphaned files
if (transcript.storageId) {
  await ctx.storage.delete(transcript.storageId);
}
await ctx.db.delete(transcript._id);
```

### Pattern 5: Graceful Degradation (from `creators/internal.ts`)
```typescript
if (!apiKey) {
  console.warn("YOUTUBE_API_KEY not set, returning unverified");
  return { verified: false, error: "API key not configured" };
}
```

## Error Handling Strategy

### Handle Private/Deleted Videos
```typescript
if (response.status === 404) {
  await ctx.runMutation(internal.transcripts.markFailed, {
    jobId,
    error: "Video private or deleted",
  });
}
```

### Handle No Captions Available
```typescript
if (!captions || captions.length === 0) {
  // Don't fail - mark as "no_captions"
  // Creator assimilation can continue without transcripts
  await ctx.runMutation(internal.transcripts.markNoCaptions, { jobId });
}
```

### Handle API Rate Limits
```typescript
if (response.status === 429) {
  // Exponential backoff
  await ctx.runMutation(internal.transcripts.scheduleRetry, {
    jobId,
    backoffMs: Math.pow(2, job.retryCount) * 1000
  });
}
```

## Verification Steps

1. **Schema Migration**: Run `convex dev` and verify new tables are created
2. **YouTube API Test**: Fetch built-in captions for a video with captions
3. **Jina Reader Fallback Test**: Test transcript extraction via Jina Reader API
4. **Storage Test**: Verify transcript stored in Convex file storage with hybrid approach
5. **Subscription Integration**: Verify new YouTube videos auto-create transcript jobs
6. **Assimilation Test**: Run creator assimilation and verify all videos processed
7. **Retrieval Test**: Query transcripts via MCP tool and verify content
8. **Error Handling**: Test with private/deleted videos (should fail gracefully)
9. **Idempotency Test**: Re-run transcript jobs and verify no duplicates created

## Testing Commands

```bash
# Start Convex dev server
convex dev

# Test YouTube API transcript fetch
curl "https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId={VIDEO_ID}&key={YOUTUBE_API_KEY}"

# Test Jina Reader fallback
curl "https://r.jina.ai/http://youtube.com/watch?v={VIDEO_ID}"

# Verify schema in Convex dashboard
# Check videoTranscripts and transcriptJobs tables
```

## Phase Prioritization (MVP vs Nice-to-Have)

### MVP (Do First) - YouTube API Only
1. ✅ Schema tables (`videoTranscripts`, `transcriptJobs`) with hybrid storage
2. ✅ YouTube API caption download (free, 100 quota/day)
3. ✅ Basic job queue with retry logic (follow `audioJobs` pattern)
4. ✅ Integration with `subscriptions/internal.ts` for auto-transcription
5. ✅ Simple `getTranscript` query for MCP tool

**Cost**: $0 (YouTube API is free)
**Dependencies**: None (uses existing YOUTUBE_API_KEY)

### Phase 2 - OpenAI Whisper Fallback
1. ✅ OpenAI Whisper integration for videos without captions
2. ✅ `assimilateCreator` action with transcript linking
3. ✅ MCP tools (`assimilateCreator`, `getCreatorTranscripts`)
4. ✅ Selective transcription (Tier 1 creators, recent videos, >10k views)

**Cost**: ~$0.36/hour of video ($0.006/minute)
**Dependencies**: `openai`: "^4.0.0", `OPENAI_API_KEY` env var

### Phase 3 - Nice-to-Have
1. ✅ Transcript search embeddings (vector search)
2. ✅ Transcript summarization (AI-generated)
3. ✅ AssemblyAI fallback (if needed)

**Cost**: Additional per usage
**Dependencies**: `assemblyai`: "^4.0.0" (optional)

## Dependencies

### MVP (Phase 1 - ToS-Compliant)
```json
{
  "dependencies": {
    // No new dependencies - uses existing YOUTUBE_API_KEY
    // Jina Reader API is free and doesn't require auth
  }
}
```

### Phase 2 (Optional - Whisper Integration)
```json
{
  "dependencies": {
    "openai": "^4.0.0",
    "yt-dlp-wrap": "^0.3.0"
  }
}
```

## Environment Variables Required

### MVP (Phase 1)
```
YOUTUBE_API_KEY=<existing - already configured>
# Jina Reader API - no key required (free tier)
```

### Phase 2 (Optional - Whisper Integration)
```
OPENAI_API_KEY=<new - for Whisper API>
```

## ToS Compliance Summary

All approaches are YouTube ToS-compliant:

1. **YouTube Data API v3**: Official Google API, fully compliant
2. **Jina Reader API**: Web scraper for personal use, compliant with fair use
3. **OpenAI Whisper**: Audio processing service, compliant as it doesn't access YouTube directly

**Key Point**: We're not scraping YouTube's HTML or using headless browsers on YouTube. We're using:
- Official API endpoints (YouTube Data API)
- Third-party content extraction services (Jina Reader)
- Audio processing on downloaded content (Whisper, if needed)

## Cost Breakdown

### MVP (Phase 1)
- **YouTube Data API**: $0 (100 quota/day is plenty for personal use)
- **Jina Reader API**: $0 (100 requests/minute free tier, no auth)
- **Total**: $0

### Optional (Phase 2 - Whisper)
- **OpenAI Whisper**: ~$0.36/hour of video ($0.006/minute)
- **Usage**: Only for videos without any captions
- **Total**: $5-25/month depending on usage

### Recommended Approach
Start with MVP (YouTube API + Jina Reader) = $0 cost. Add Whisper only if you find many videos without captions that need transcription.
