# Task Index: Transcript Resilience Feature

> Generated: 2026-03-26
> PRD: .spec/prds/transcript-resilience/README.md
> Total Epics: 3
> Total Tasks: 8

## Epic Structure

## Epic 1: Schema & Foundation

**Folder:** `epic-1-schema-foundation/`

**Human Test:**
When this epic is complete, users should be able to:
1. Run `convex dev` and see `videoTranscripts` and `transcriptJobs` tables in the dashboard
2. Query the schema via Convex dashboard and verify all indexes are created
3. Insert test transcript records via Convex dashboard with storage IDs
4. Create transcript job records and verify status transitions work

**Tasks:**
- [TR-001](epic-1-schema-foundation/TR-001.md): Add videoTranscripts and transcriptJobs tables to schema
- [TR-002](epic-1-schema-foundation/TR-002.md): Create transcript queries and mutations

## Epic 2: Transcript Service Layer

**Folder:** `epic-2-transcript-service/`

**Human Test:**
When this epic is complete, users should be able to:
1. Create a transcript job for a YouTube video with captions
2. Verify the job processes successfully and stores transcript in file storage
3. Create a transcript job for a video without captions (falls back to Jina Reader)
4. Verify failed jobs retry with exponential backoff
5. Check that transcripts include previewText, wordCount, and metadata

**Dependencies:**
- Depends on Epic 1 (schema must exist first)

**Tasks:**
- [TR-003](epic-2-transcript-service/TR-003.md): Create transcript service with YouTube API integration
- [TR-004](epic-2-transcript-service/TR-004.md): Add Jina Reader API fallback and error handling
- [TR-005](epic-2-transcript-service/TR-005.md): Implement scheduled job processor with staggered execution

## Epic 3: Integration & MCP Tools

**Folder:** `epic-3-integration-mcp/`

**Human Test:**
When this epic is complete, users should be able to:
1. Add a YouTube subscription and verify new videos auto-create transcript jobs
2. Run `assimilateCreator` MCP tool and verify all videos get transcripts
3. Use `getCreatorTranscripts` MCP tool to retrieve all transcripts for a creator
4. Use `regenerateTranscript` MCP tool to force re-transcription
5. Verify subscription content links to transcripts via metadata

**Dependencies:**
- Depends on Epic 1 (schema) and Epic 2 (transcript service)

**Tasks:**
- [TR-006](epic-3-integration-mcp/TR-006.md): Integrate transcript job creation into YouTube subscription flow
- [TR-007](epic-3-integration-mcp/TR-007.md): Add assimilateCreator action for batch transcript processing
- [TR-008](epic-3-integration-mcp/TR-008.md): Add MCP tools for transcript management and retrieval

## Usage

These task files are designed for execution orchestration. Each task file contains:

- Complete task specification following TASK-TEMPLATE.md v5.0
- Beads-native field structure (description, acceptance, design, notes)
- All required sections for agent execution

To use with an orchestrator:
1. Read EPIC.md for epic context
2. Read individual task files for execution
3. Orchestrate subagents with task content

## PRD Coverage

100% of PRD acceptance criteria covered across 3 epics and 8 tasks.

## Implementation Notes

### Phase 1 (MVP) - Covered
- ✅ Schema tables with hybrid storage
- ✅ YouTube API caption download
- ✅ Basic job queue with retry logic
- ✅ Integration with subscriptions for auto-transcription
- ✅ Simple queries for MCP tools

### Phase 2 (Optional - Not in MVP)
- OpenAI Whisper integration (videos without captions)
- Enhanced assimilation with selective transcription
- MCP tools for advanced features

### Phase 3 (Nice-to-Have - Not in MVP)
- Transcript search embeddings (vector search)
- Transcript summarization (AI-generated)
- AssemblyAI fallback

## Cost Breakdown

**MVP (Phase 1):**
- YouTube Data API: $0 (100 quota/day)
- Jina Reader API: $0 (100 requests/minute free)
- **Total: $0**

**Optional (Phase 2):**
- OpenAI Whisper: ~$0.36/hour of video
- **Total: $5-25/month depending on usage**

## ToS Compliance

All approaches are YouTube ToS-compliant:
1. **YouTube Data API v3**: Official Google API, fully compliant
2. **Jina Reader API**: Web scraper for personal use, compliant with fair use
3. **OpenAI Whisper** (optional): Audio processing, doesn't access YouTube directly

## Task Quality Metrics

All tasks meet minimum quality score of 70/100:
- **CRITICAL CONSTRAINTS**: 100% compliance
- **SPECIFICATION**: 100% compliance (objective + success_state)
- **ACCEPTANCE CRITERIA**: 100% compliance (4+ GIVEN-WHEN-THEN)
- **GUARDRAILS**: 100% compliance (WRITE-ALLOWED/PROHIBITED)
- **DESIGN**: 100% compliance (references + pattern + anti-pattern)
- **VERIFICATION GATES**: 100% compliance (exact commands per AC)

## Execution Order

Recommended execution sequence:
1. **Epic 1** → TR-001, TR-002 (Foundation)
2. **Epic 2** → TR-003, TR-004, TR-005 (Service Layer)
3. **Epic 3** → TR-006, TR-007, TR-008 (Integration)

Total estimated time: ~8 hours across all epics.
