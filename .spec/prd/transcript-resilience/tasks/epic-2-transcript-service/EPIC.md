# Epic 2: Transcript Service Layer

> Epic Sequence: 2
> PRD: .spec/prds/transcript-resilience/README.md
> Tasks: 3

## Overview

Implement the ToS-compliant transcript extraction service with YouTube Data API v3 as primary and Jina Reader API as fallback. This epic handles the actual transcript fetching, storage to Convex file storage, and job queue management with staggered scheduling to avoid API rate limits.

## Human Test Steps

When this epic is complete, users should be able to:

1. Create a transcript job for a YouTube video with captions
2. Verify the job processes successfully and stores transcript in file storage
3. Create a transcript job for a video without captions (falls back to Jina Reader)
4. Verify failed jobs retry with exponential backoff
5. Check that transcripts include previewText, wordCount, and metadata

## Acceptance Criteria (from PRD)

- YouTube Data API v3 integration for caption download (primary)
- Jina Reader API fallback for transcript text extraction
- Store full transcripts in Convex file storage with previewText
- Implement staggered scheduling (1-5 second delays)
- Handle private/deleted videos gracefully (404 → failed)
- Handle no captions available (mark as "no_captions" not failed)
- Handle API rate limits with exponential backoff

## PRD Sections Covered

- Phase 2: Transcript Service Layer (MVP - ToS-Compliant)
- Research Summary: YouTube Data API v3, Jina Reader API
- Error Handling Strategy
- Critical Convex Patterns to Follow: Pattern 2 (Staggered Scheduling), Pattern 5 (Graceful Degradation)

## Dependencies

This epic depends on Epic 1 (schema must exist first).

## Task List

| Task ID | Title | Type | Priority |
|---------|-------|------|----------|
| TR-003 | Create transcript service with YouTube API integration | FEATURE | P0 |
| TR-004 | Add Jina Reader API fallback and error handling | FEATURE | P0 |
| TR-005 | Implement scheduled job processor with staggered execution | FEATURE | P0 |
