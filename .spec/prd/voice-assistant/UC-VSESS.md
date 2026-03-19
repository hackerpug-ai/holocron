# UC-VSESS: Voice Session Management

## Overview

Voice Session Management handles the lifecycle of voice interactions from activation through completion, including wake word detection, connection management, and context persistence.

---

## UC-VSESS-01: Start Voice Session

**Actor**: User
**Trigger**: User taps mic button or says wake word
**Preconditions**: App is open, microphone permission granted

### Main Flow
1. User activates voice (tap or wake word)
2. System plays activation sound
3. System initializes audio capture
4. System establishes WebRTC/WebSocket connection
5. System transitions to LISTENING state
6. System displays minimal visual indicator (pulsing dot)

### Alternate Flows
- **A1**: No network → Play error tone, speak "No internet connection"
- **A2**: Mic permission denied → Speak "Microphone access needed", guide to settings

### Acceptance Criteria
- [ ] Activation-to-listening latency <500ms
- [ ] Activation sound plays before listening starts
- [ ] Visual indicator appears immediately
- [ ] Works from background (when app is in focus)

---

## UC-VSESS-02: Maintain Session Context

**Actor**: System
**Trigger**: Ongoing voice conversation
**Preconditions**: Active voice session

### Main Flow
1. System maintains conversation history in memory
2. Each turn appends to context window
3. System sends context with each STT request
4. LLM receives full context for response generation
5. Context persists across interruptions within session

### Alternate Flows
- **A1**: Context exceeds token limit → Summarize older turns, retain recent
- **A2**: Session timeout → Preserve context for 5 minutes, then clear

### Acceptance Criteria
- [ ] Follow-up questions work without re-stating context
- [ ] "It", "that", "the last one" resolve correctly
- [ ] Context survives brief pauses (<30s)
- [ ] Context clears on explicit "start over" command

---

## UC-VSESS-03: Handle Session Timeout

**Actor**: System
**Trigger**: No user speech for configured duration
**Preconditions**: Active voice session in LISTENING state

### Main Flow
1. System detects silence exceeding timeout (default: 30s)
2. System plays gentle timeout sound
3. System speaks "I'll be here when you need me"
4. System transitions to IDLE state
5. Audio capture stops, connection maintained (warm)

### Alternate Flows
- **A1**: User speaks during timeout announcement → Cancel timeout, resume listening
- **A2**: Driving mode active → Extend timeout to 60s

### Acceptance Criteria
- [ ] Timeout is interruptible
- [ ] Connection stays warm for 5 minutes
- [ ] Quick re-activation (<200ms) after timeout
- [ ] No abrupt cutoff mid-thought

---

## UC-VSESS-04: End Voice Session

**Actor**: User
**Trigger**: User says "goodbye", "stop", or taps stop button
**Preconditions**: Active voice session

### Main Flow
1. User issues end command
2. System plays acknowledgment sound
3. System speaks brief farewell (e.g., "Talk soon")
4. System stops audio capture
5. System closes WebRTC connection
6. System transitions to IDLE state

### Alternate Flows
- **A1**: Session ended by app backgrounding → Silent end, no farewell
- **A2**: End during response → Stop TTS immediately, then end

### Acceptance Criteria
- [ ] Immediate response to stop commands
- [ ] Farewell is brief (<2s)
- [ ] Resources released cleanly
- [ ] No orphaned connections

---

## UC-VSESS-05: Wake Word Activation

**Actor**: User
**Trigger**: User says "Hey Holocron" (or configured wake word)
**Preconditions**: App running, wake word detection enabled

### Main Flow
1. On-device wake word model continuously monitors
2. System detects wake word with high confidence
3. System plays activation sound
4. System transitions from IDLE to LISTENING
5. User's command after wake word is captured

### Alternate Flows
- **A1**: False positive detection → User says "cancel" or timeout applies
- **A2**: Wake word + command in same utterance → Process both seamlessly

### Acceptance Criteria
- [ ] Wake word detection runs on-device (no cloud)
- [ ] False positive rate <1%
- [ ] Works with background noise <70dB
- [ ] Battery impact <5% per hour when active

---

## L4 Holdout Scenarios

### H-VSESS-01: Rapid Start/Stop
**Scenario**: User taps mic button repeatedly (5 times in 2 seconds)
**Expected**: System handles gracefully, no crashes, settles to final state
**Why Holdout**: Edge case stress test, not core flow

### H-VSESS-02: Session During Phone Call
**Scenario**: User tries to start voice session while on phone call
**Expected**: System detects audio session conflict, speaks "Phone call in progress"
**Why Holdout**: Platform-specific edge case

### H-VSESS-03: Network Transition Mid-Session
**Scenario**: WiFi → Cellular handoff during active conversation
**Expected**: Session maintains continuity with <1s audio gap
**Why Holdout**: Complex network handling, P1 feature
