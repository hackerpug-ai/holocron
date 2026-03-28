# Epic 4: Voice UI — Screen, Visual Indicators, and Session Controls

> Epic Sequence: 4
> PRD: .spec/prd/voice-assistant/
> Tasks: 3

## Overview

Build the voice assistant UI: the voice session screen/overlay, visual state indicators (pulsing dot, waveform), mic button, and stop button. After this epic, users have a complete visual interface for voice interactions with clear feedback on session state.

## Human Test Steps

When this epic is complete, users should be able to:

1. Open a conversation and tap the voice button
2. Verify a connecting spinner appears briefly
3. Verify a pulsing indicator appears when listening
4. Speak and verify partial transcript text appears
5. Verify the indicator changes when the assistant is speaking
6. Tap the stop button and verify session ends with brief animation
7. Enable airplane mode and try to start a voice session
8. Verify an error message appears with retry option
9. Verify all colors and spacing use theme tokens (no hardcoded values)

## Acceptance Criteria (from PRD)

- Voice button visible on conversation screen to start a session
- Visual indicator shows current state: connecting spinner, listening pulse, speaking waveform
- Stop button ends the session
- Error state displayed with retry option
- Partial transcript displayed as text while user speaks
- Session timeout shows gentle message
- UI uses semantic theme tokens (no hardcoded colors)

## PRD Sections Covered

- UC-VSESS-01 (UI)
- UC-VSESS-03 (timeout UI)
- UC-VSESS-04 (end UI)
- UC-AUDIO-02 (playback indicator)
- UC-SPEECH-01 (transcript display)
- UC-ERREC-04 (permission UI)
- UC-ERREC-05 (unavailable UI)

## Dependencies

This epic depends on: Epic 2

This epic blocks the following epics:
- Epic 5

## Task List

| Task ID | Title | Type | Priority | Blocked By |
|---------|-------|------|----------|------------|
| US-012 | Create VoiceSessionOverlay component with state-driven visual indicators | DESIGN | P0 | US-005 |
| US-013 | Create VoiceMicButton component for session start/stop | DESIGN | P0 | - |
| US-014 | Integrate voice UI into conversation screen | FEATURE | P0 | US-008, US-012, US-013 |
