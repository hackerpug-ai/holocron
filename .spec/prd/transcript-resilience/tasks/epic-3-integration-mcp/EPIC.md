# Epic 3: Integration & MCP Tools

> Epic Sequence: 3
> PRD: .spec/prds/transcript-resilience/README.md
> Tasks: 3

## Overview

Integrate the transcript service into existing workflows: auto-create transcript jobs for new YouTube videos from subscriptions, add creator assimilation action with transcript linking, and expose new MCP tools for manual transcript management. This epic makes transcripts automatically available and queryable.

## Human Test Steps

When this epic is complete, users should be able to:

1. Add a YouTube subscription and verify new videos auto-create transcript jobs
2. Run `assimilateCreator` MCP tool and verify all videos get transcripts
3. Use `getCreatorTranscripts` MCP tool to retrieve all transcripts for a creator
4. Use `regenerateTranscript` MCP tool to force re-transcription
5. Verify subscription content links to transcripts via metadata

## Acceptance Criteria (from PRD)

- Modify `fetchYouTube()` to create transcript jobs for new videos
- Add `assimilateCreator` action to batch process creator videos
- Add MCP tools: `assimilateCreator`, `getCreatorTranscripts`, `regenerateTranscript`
- Update subscription content with transcript metadata
- Link transcripts to creator profiles
- Auto-create transcript jobs for all new YouTube videos

## PRD Sections Covered

- Phase 3: Integration with Subscription Flow
- Phase 4: Creator Assimilation Enhancement
- Phase 5: MCP Tool Updates
- Current System Analysis: YouTube Flow integration

## Dependencies

This epic depends on Epic 1 (schema) and Epic 2 (transcript service).

## Task List

| Task ID | Title | Type | Priority |
|---------|-------|------|----------|
| TR-006 | Integrate transcript job creation into YouTube subscription flow | FEATURE | P0 |
| TR-007 | Add assimilateCreator action for batch transcript processing | FEATURE | P1 |
| TR-008 | Add MCP tools for transcript management and retrieval | FEATURE | P1 |
