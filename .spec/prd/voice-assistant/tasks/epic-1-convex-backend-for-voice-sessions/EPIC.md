# Epic 1: Convex Backend for Voice Sessions

> Epic Sequence: 1
> PRD: .spec/prd/voice-assistant/
> Tasks: 4

## Overview

Set up the Convex schema, mutations, queries, and actions needed to support voice sessions. This is the foundational data layer that all subsequent epics depend on. After this epic, the backend API is fully testable via Convex dashboard or unit tests.

## Human Test Steps

When this epic is complete, users should be able to:

1. Run pnpm convex dev and verify schema deploys without errors
2. Call voice.createSession via Convex dashboard and verify ephemeral key returned
3. Call voice.endSession and verify session marked completed
4. Call voice.recordTranscript and verify chatMessage created
5. Call voice.recordCommand and verify voiceCommand created
6. Call voice.getActiveSession and verify it returns active session then null after end
7. Run pnpm vitest run and verify all voice backend tests pass

## Acceptance Criteria (from PRD)

- voiceSessions and voiceCommands tables exist in schema with correct indexes
- voice.createSession action generates ephemeral token from OpenAI and creates session record
- voice.endSession mutation marks session complete with duration
- voice.recordTranscript mutation writes to chatMessages table
- voice.recordCommand mutation writes to voiceCommands table
- voice.getActiveSession query returns active session or null
- Orphaned session cleanup cron runs every 10 minutes

## PRD Sections Covered

- UC-VSESS-01 (backend)
- UC-VSESS-02 (persistence)
- UC-VSESS-04 (cleanup)
- 04-convex-schema
- 05-convex-endpoints

## Dependencies

This epic blocks the following epics:
- Epic 2
- Epic 3
- Epic 4

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| US-001 | Add voiceSessions and voiceCommands tables to Convex schema | INFRA | P0 | - |
| US-002 | Implement voice.createSession action with ephemeral token generation | FEATURE | P0 | US-001 |
| US-003 | Implement voice.endSession, voice.recordTranscript, voice.recordCommand mutations | FEATURE | P0 | US-001 |
| US-004 | Implement voice.getActiveSession query and orphaned session cleanup cron | FEATURE | P0 | US-001 |
