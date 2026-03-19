# UC-ERREC: Error Recovery

## Overview

Error Recovery handles failures gracefully with spoken guidance, automatic retries, and fallback strategies to maintain user trust and session continuity.

---

## UC-ERREC-01: Handle Network Failure

**Actor**: System
**Trigger**: Network request fails or connection drops
**Preconditions**: Active voice session

### Main Flow
1. System detects network error
2. System plays subtle error tone
3. System speaks: "Lost connection. Trying again..."
4. System retries with exponential backoff (1s, 2s, 4s)
5. On success, resume normal operation

### Alternate Flows
- **A1**: Retries exhausted → "No internet. Please check your connection."
- **A2**: Partial recovery → Resume from last successful state
- **A3**: User speaks during retry → Queue input, process after recovery

### Acceptance Criteria
- [ ] First retry within 1s of failure
- [ ] Max 3 retries before giving up
- [ ] User informed of status at each step
- [ ] No data loss from queued actions

---

## UC-ERREC-02: Handle Recognition Failure

**Actor**: System
**Trigger**: STT returns low confidence or fails to transcribe
**Preconditions**: User speech detected but not understood

### Main Flow
1. System detects transcript confidence <70%
2. System speaks: "I didn't catch that. Could you say it again?"
3. System returns to LISTENING state
4. User repeats command
5. Second attempt processed normally

### Alternate Flows
- **A1**: Second attempt also fails → Offer alternatives or spell option
- **A2**: User speaks differently → Accept alternate phrasing
- **A3**: Noise detected → "It's noisy here. Try speaking closer."

### Acceptance Criteria
- [ ] Never show garbled partial text to user
- [ ] Prompt is polite and actionable
- [ ] Max 2 retry prompts before escalating
- [ ] Tracks repeated failures for diagnostics

---

## UC-ERREC-03: Handle Execution Failure

**Actor**: System
**Trigger**: Backend API call fails
**Preconditions**: User action being processed

### Main Flow
1. System receives error from Holocron API
2. System classifies error (transient vs permanent)
3. System speaks appropriate message:
   - Transient: "Something went wrong. Let me try again."
   - Permanent: "I can't do that right now. [reason]"
4. For transient, retry once automatically
5. For permanent, offer alternative if available

### Alternate Flows
- **A1**: Rate limited → "Too many requests. Try again in a moment."
- **A2**: Permission error → "You don't have access to that."
- **A3**: Resource not found → "I couldn't find that [item type]."

### Acceptance Criteria
- [ ] Error messages are user-friendly (no technical jargon)
- [ ] Transient errors retried automatically once
- [ ] Permanent errors explained with next steps
- [ ] Error type logged for debugging

---

## UC-ERREC-04: Guide to Permission Fix

**Actor**: System
**Trigger**: Required permission not granted
**Preconditions**: Action requires permission user hasn't granted

### Main Flow
1. System detects permission issue (microphone, etc.)
2. System speaks: "I need [permission] to help with that."
3. System provides guidance: "Go to Settings, then Holocron..."
4. System offers to open settings if possible
5. Once granted, resume operation

### Alternate Flows
- **A1**: User declines → Acknowledge, suggest alternatives
- **A2**: Permission permanently denied → Explain full reset process
- **A3**: System settings unavailable → Provide step-by-step guide

### Acceptance Criteria
- [ ] Permission needs detected before user frustration
- [ ] Instructions are platform-specific (iOS/Android)
- [ ] Deep link to settings when available
- [ ] Graceful handling of declined permissions

---

## UC-ERREC-05: Activate Fallback Mode

**Actor**: System
**Trigger**: Primary service unavailable for extended period
**Preconditions**: Primary STT/TTS failing repeatedly

### Main Flow
1. System detects primary service down (3 consecutive failures)
2. System switches to fallback services
3. System announces: "Switching to backup. Quality may vary."
4. Session continues with fallback
5. System periodically checks if primary is back

### Alternate Flows
- **A1**: Fallback also fails → "Voice is unavailable. Try again later."
- **A2**: Primary recovers → Silently switch back
- **A3**: Partial fallback → Use what's available (device TTS + cloud STT)

### Acceptance Criteria
- [ ] Fallback activated within 10s of primary failure
- [ ] User warned about potential quality difference
- [ ] Automatic recovery when primary returns
- [ ] All core features work in fallback mode

---

## L4 Holdout Scenarios

### H-ERREC-01: Cascading Failures
**Scenario**: Network fails, then fallback TTS fails, then device TTS fails
**Expected**: Gracefully degrade to text display with error explanation
**Why Holdout**: Triple failure is extremely rare

### H-ERREC-02: Corrupt Audio Stream
**Scenario**: Audio from TTS service is corrupted/garbled
**Expected**: Detect corruption, discard chunk, request re-synthesis
**Why Holdout**: Requires audio validation logic

### H-ERREC-03: Session State Corruption
**Scenario**: Internal state becomes inconsistent (e.g., SPEAKING but no audio)
**Expected**: Detect via watchdog, reset session cleanly
**Why Holdout**: Defensive programming, hard to reproduce
