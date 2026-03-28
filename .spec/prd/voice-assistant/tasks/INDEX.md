# Task Index: Holocron Voice Assistant

> Generated: 2026-03-28
> PRD: .spec/prd/voice-assistant/
> Total Epics: 5
> Total Tasks: 18

## Epic Structure

## Epic 1: Convex Backend for Voice Sessions

**Folder:** `epic-1-convex-backend-for-voice-sessions/`

**Human Test:**
1. Run pnpm convex dev and verify schema deploys without errors
2. Call voice.createSession via Convex dashboard and verify ephemeral key returned
3. Call voice.endSession and verify session marked completed
4. Call voice.recordTranscript and verify chatMessage created
5. Call voice.recordCommand and verify voiceCommand created
6. Call voice.getActiveSession and verify it returns active session then null after end
7. Run pnpm vitest run and verify all voice backend tests pass

**Tasks:**
- [US-001](epic-1-convex-backend-for-voice-sessions/US-001.md): Add voiceSessions and voiceCommands tables to Convex schema
- [US-002](epic-1-convex-backend-for-voice-sessions/US-002.md): Implement voice.createSession action with ephemeral token generation
- [US-003](epic-1-convex-backend-for-voice-sessions/US-003.md): Implement voice.endSession, voice.recordTranscript, voice.recordCommand mutations
- [US-004](epic-1-convex-backend-for-voice-sessions/US-004.md): Implement voice.getActiveSession query and orphaned session cleanup cron

## Epic 2: WebRTC Connection Manager and Voice State Machine

**Folder:** `epic-2-webrtc-connection-manager-and-voice-state-machine/`

**Human Test:**
1. Open the app and tap the voice button on any conversation
2. Verify the app requests microphone permission if not already granted
3. Verify the visual state transitions from IDLE to CONNECTING to LISTENING
4. Speak into the microphone and verify OpenAI responds with audio
5. Verify you can hear the assistant's response through the speaker
6. Verify the state shows SPEAKING while assistant talks
7. Tap the stop button and verify connection closes cleanly
8. Verify state returns to IDLE after stopping

**Tasks:**
- [US-005](epic-2-webrtc-connection-manager-and-voice-state-machine/US-005.md): Implement useVoiceSessionState reducer for voice state machine
- [US-006](epic-2-webrtc-connection-manager-and-voice-state-machine/US-006.md): Implement WebRTC connection manager module
- [US-007](epic-2-webrtc-connection-manager-and-voice-state-machine/US-007.md): Implement data channel event handler for OpenAI Realtime events
- [US-008](epic-2-webrtc-connection-manager-and-voice-state-machine/US-008.md): Implement useVoiceSession hook integrating state machine, WebRTC, and Convex

## Epic 3: Function Calling Bridge to Holocron

**Folder:** `epic-3-function-calling-bridge-to-holocron/`

**Human Test:**
1. Start a voice session and say 'Search for voice assistant research'
2. Verify the assistant announces 'Searching your knowledge base' then speaks results
3. Say 'Create a note about testing voice commands'
4. Verify the assistant confirms and creates a document in Convex
5. Say 'Go to settings'
6. Verify the app navigates to the settings screen
7. Say 'Check my recent research sessions'
8. Verify the assistant reads back research session status
9. Verify all voice turns appear in the chat conversation history

**Tasks:**
- [US-009](epic-3-function-calling-bridge-to-holocron/US-009.md): Implement tool definitions and session.update tool registration
- [US-010](epic-3-function-calling-bridge-to-holocron/US-010.md): Implement function call dispatcher that routes to Convex endpoints
- [US-011](epic-3-function-calling-bridge-to-holocron/US-011.md): Implement transcript persistence — record voice turns to chatMessages

## Epic 4: Voice UI — Screen, Visual Indicators, and Session Controls

**Folder:** `epic-4-voice-ui-screen-visual-indicators-and-session-controls/`

**Human Test:**
1. Open a conversation and tap the voice button
2. Verify a connecting spinner appears briefly
3. Verify a pulsing indicator appears when listening
4. Speak and verify partial transcript text appears
5. Verify the indicator changes when the assistant is speaking
6. Tap the stop button and verify session ends with brief animation
7. Enable airplane mode and try to start a voice session
8. Verify an error message appears with retry option
9. Verify all colors and spacing use theme tokens (no hardcoded values)

**Tasks:**
- [US-012](epic-4-voice-ui-screen-visual-indicators-and-session-controls/US-012.md): Create VoiceSessionOverlay component with state-driven visual indicators
- [US-013](epic-4-voice-ui-screen-visual-indicators-and-session-controls/US-013.md): Create VoiceMicButton component for session start/stop
- [US-014](epic-4-voice-ui-screen-visual-indicators-and-session-controls/US-014.md): Integrate voice UI into conversation screen

## Epic 5: Error Recovery, Session Resilience, and Polish

**Folder:** `epic-5-error-recovery-session-resilience-and-polish/`

**Human Test:**
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

**Tasks:**
- [US-015](epic-5-error-recovery-session-resilience-and-polish/US-015.md): Implement network failure detection and retry with spoken feedback
- [US-016](epic-5-error-recovery-session-resilience-and-polish/US-016.md): Implement service unavailable handling and permission guidance
- [US-017](epic-5-error-recovery-session-resilience-and-polish/US-017.md): Implement session timeout behavior with spoken farewell
- [US-018](epic-5-error-recovery-session-resilience-and-polish/US-018.md): Implement execution failure handling with user-friendly spoken messages

## Usage

These task files are designed for execution with `/kb-run-epic`.

Each task file contains:
- Complete task specification following TASK-TEMPLATE.md v5.0
- All required sections for agent execution

To execute:
1. `/kb-run-epic epic-1-convex-backend-for-voice-sessions` to run an epic
2. Tasks are dispatched to assigned agents in dependency order
3. Reviewers verify each completion before marking done

## PRD Coverage

100% of PRD P0 acceptance criteria covered.
