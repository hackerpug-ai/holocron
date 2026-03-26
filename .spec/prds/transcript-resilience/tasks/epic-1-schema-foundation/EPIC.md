# Epic 1: Schema & Foundation

> Epic Sequence: 1
> PRD: .spec/prds/transcript-resilience/README.md
> Tasks: 2

## Overview

Establish the database schema and foundational infrastructure for resilient transcript storage. This epic creates the necessary Convex tables following the hybrid storage pattern (metadata in database, full content in file storage) used by `audioSegments`. The schema supports idempotent job creation, status tracking, and graceful degradation.

## Human Test Steps

When this epic is complete, users should be able to:

1. Run `convex dev` and see `videoTranscripts` and `transcriptJobs` tables in the dashboard
2. Query the schema via Convex dashboard and verify all indexes are created
3. Insert test transcript records via Convex dashboard with storage IDs
4. Create transcript job records and verify status transitions work

## Acceptance Criteria (from PRD)

- Add `videoTranscripts` table with hybrid storage (storageId + previewText)
- Add `transcriptJobs` table with status machine (pending → completed/failed/no_captions)
- Create proper indexes for content lookup and job queue processing
- Follow `audioSegments` pattern for file storage integration
- Support idempotent job creation via database constraints

## PRD Sections Covered

- Phase 1: Schema Updates (MVP)
- Critical Files to Create/Modify: `convex/schema.ts`
- Critical Convex Patterns to Follow: Pattern 1 (Idempotent Job Creation)

## Dependencies

No epic dependencies.

## Task List

| Task ID | Title | Type | Priority |
|---------|-------|------|----------|
| TR-001 | Add videoTranscripts and transcriptJobs tables to schema | INFRA | P0 |
| TR-002 | Create transcript queries and mutations | INFRA | P0 |
