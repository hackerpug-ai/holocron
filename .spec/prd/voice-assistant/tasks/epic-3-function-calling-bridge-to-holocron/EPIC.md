# Epic 3: Function Calling Bridge to Holocron

> Epic Sequence: 3
> PRD: .spec/prd/voice-assistant/
> Tasks: 3

## Overview

Implement the function calling bridge that receives tool calls from OpenAI Realtime via data channel, executes them against Convex backend, and returns results. After this epic, the user can ask questions and the assistant searches the knowledge base, creates notes, checks research status, and navigates the app.

## Human Test Steps

When this epic is complete, users should be able to:

1. Start a voice session and say 'Search for voice assistant research'
2. Verify the assistant announces 'Searching your knowledge base' then speaks results
3. Say 'Create a note about testing voice commands'
4. Verify the assistant confirms and creates a document in Convex
5. Say 'Go to settings'
6. Verify the app navigates to the settings screen
7. Say 'Check my recent research sessions'
8. Verify the assistant reads back research session status
9. Verify all voice turns appear in the chat conversation history

## Acceptance Criteria (from PRD)

- Tool definitions registered with OpenAI session for all P0 tools
- Function call dispatcher routes to correct Convex query/mutation/action
- Results sent back via conversation.item.create + response.create on data channel
- Pure read tools return data immediately
- Agent dispatcher tools handle async with timeout
- navigate_app tool triggers Expo Router navigation
- Transcripts recorded to chatMessages for persistence

## PRD Sections Covered

- UC-QUERY-01
- UC-QUERY-02
- UC-QUERY-03
- UC-QUERY-04
- UC-SPEECH-01 (transcription)
- UC-VSESS-02 (context)
- 03-function-calling

## Dependencies

This epic depends on: Epic 1, Epic 2

This epic blocks the following epics:
- Epic 5

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| US-009 | Implement tool definitions and session.update tool registration | FEATURE | P0 | - |
| US-010 | Implement function call dispatcher that routes to Convex endpoints | FEATURE | P0 | US-007, US-009 |
| US-011 | Implement transcript persistence — record voice turns to chatMessages | FEATURE | P0 | US-007, US-003 |
