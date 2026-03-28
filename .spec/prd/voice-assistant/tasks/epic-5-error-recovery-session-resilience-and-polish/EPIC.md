# Epic 5: Error Recovery, Session Resilience, and Polish

> Epic Sequence: 5
> PRD: .spec/prd/voice-assistant/
> Tasks: 4

## Overview

Implement error recovery flows: network failure handling with retry, recognition failure guidance, service unavailability display, permission guidance, and session timeout behavior. After this epic, the voice assistant handles all failure modes gracefully with spoken guidance.

## Human Test Steps

When this epic is complete, users should be able to:

1. Start a voice session, then enable airplane mode
2. Verify the assistant says 'Lost connection. Trying again...' and retries
3. Verify after max retries the assistant says 'No internet. Please check your connection.'
4. Start a voice session when OpenAI API is down (mock or rate-limit)
5. Verify 'Voice assistant is currently unavailable' is displayed
6. Deny microphone permission and try to start a voice session
7. Verify the assistant guides to settings with platform-specific instructions
8. Start a session, stay silent for 30 seconds
9. Verify the assistant says 'I will be here when you need me' and transitions to idle
10. Verify quick re-activation after timeout works within 200ms

## Acceptance Criteria (from PRD)

- Network failure triggers retry with spoken feedback
- Service unavailable shows clear UI message and allows retry
- Session timeout speaks gentle message and transitions to idle
- Permission denied guides user to settings
- Execution failures spoken as user-friendly messages
- No orphaned WebRTC connections after any error path
- All error paths tested

## PRD Sections Covered

- UC-ERREC-01
- UC-ERREC-02
- UC-ERREC-03
- UC-ERREC-04
- UC-ERREC-05
- UC-VSESS-03 (timeout)
- UC-SPEECH-04 (interruption)

## Dependencies

This epic depends on: Epic 2, Epic 3

No epic dependencies.

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| US-015 | Implement network failure detection and retry with spoken feedback | FEATURE | P0 | US-008 |
| US-016 | Implement service unavailable handling and permission guidance | FEATURE | P0 | US-008, US-012 |
| US-017 | Implement session timeout behavior with spoken farewell | FEATURE | P0 | US-008 |
| US-018 | Implement execution failure handling with user-friendly spoken messages | FEATURE | P0 | US-010 |
