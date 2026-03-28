# Epic 2: WebRTC Connection Manager and Voice State Machine

> Epic Sequence: 2
> PRD: .spec/prd/voice-assistant/
> Tasks: 4

## Overview

Build the client-side WebRTC connection manager that establishes and maintains the connection to OpenAI Realtime API, plus the voice session state machine (useReducer). After this epic, tapping a button connects to OpenAI via WebRTC and audio flows bidirectionally.

## Human Test Steps

When this epic is complete, users should be able to:

1. Open the app and tap the voice button on any conversation
2. Verify the app requests microphone permission if not already granted
3. Verify the visual state transitions from IDLE to CONNECTING to LISTENING
4. Speak into the microphone and verify OpenAI responds with audio
5. Verify you can hear the assistant's response through the speaker
6. Verify the state shows SPEAKING while assistant talks
7. Tap the stop button and verify connection closes cleanly
8. Verify state returns to IDLE after stopping

## Acceptance Criteria (from PRD)

- useVoiceSession hook manages IDLE/CONNECTING/LISTENING/SPEAKING states via useReducer
- WebRTC connection established with RTCPeerConnection + data channel named 'oai-events'
- Microphone audio captured via getUserMedia and added to peer connection
- Remote audio track received and routed to speaker via InCallManager
- Session.update sent on data channel after connection with correct config
- Data channel events parsed and dispatched to state machine
- Connection teardown cleans up all resources

## PRD Sections Covered

- UC-VSESS-01
- UC-VSESS-03
- UC-VSESS-04
- UC-AUDIO-01
- UC-AUDIO-02
- UC-AUDIO-03
- 01-webrtc-connection
- 02-session-config

## Dependencies

This epic depends on: Epic 1

This epic blocks the following epics:
- Epic 3
- Epic 4
- Epic 5

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| US-005 | Implement useVoiceSessionState reducer for voice state machine | FEATURE | P0 | - |
| US-006 | Implement WebRTC connection manager module | FEATURE | P0 | US-002 |
| US-007 | Implement data channel event handler for OpenAI Realtime events | FEATURE | P0 | US-006 |
| US-008 | Implement useVoiceSession hook integrating state machine, WebRTC, and Convex | FEATURE | P0 | US-005, US-006, US-007, US-002 |
