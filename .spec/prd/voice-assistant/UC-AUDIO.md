# UC-AUDIO: Audio Capture & Playback

## Overview

Audio Capture & Playback handles all audio I/O operations including microphone streaming, TTS playback, audio session management, and hardware routing.

---

## UC-AUDIO-01: Capture Microphone Audio

**Actor**: System
**Trigger**: Voice session enters LISTENING state
**Preconditions**: Microphone permission granted, audio session active

### Main Flow
1. System configures audio format (16kHz, mono, 16-bit PCM)
2. System starts microphone capture
3. Audio frames streamed to encoding buffer
4. Encoded chunks (Opus/PCM) sent to STT service
5. Capture continues until state change

### Alternate Flows
- **A1**: Microphone unavailable → Speak error, end session
- **A2**: Audio format negotiation fails → Fall back to compatible format

### Acceptance Criteria
- [ ] Capture latency <50ms
- [ ] Audio quality sufficient for 92% STT accuracy
- [ ] Works with device mic, AirPods, Bluetooth headsets
- [ ] No audible artifacts or clicks

---

## UC-AUDIO-02: Play TTS Audio

**Actor**: System
**Trigger**: TTS audio received from service
**Preconditions**: Active voice session, audio output available

### Main Flow
1. System receives audio stream (MP3/PCM)
2. System decodes to playable format
3. System applies audio ducking to other audio
4. Audio plays through selected output device
5. System monitors playback progress

### Alternate Flows
- **A1**: Bluetooth disconnects mid-playback → Route to speaker, continue
- **A2**: User interrupts → Stop playback immediately (<100ms)

### Acceptance Criteria
- [ ] Playback starts within 100ms of receiving first chunk
- [ ] Audio ducking fades other audio smoothly
- [ ] Volume respects system settings
- [ ] Works with all output routes (speaker, headphones, Bluetooth, CarPlay)

---

## UC-AUDIO-03: Manage Audio Session

**Actor**: System
**Trigger**: App enters foreground or voice session starts
**Preconditions**: iOS/Android audio session APIs available

### Main Flow
1. System activates audio session with appropriate category
2. System configures for voice chat mode
3. System handles interruptions (calls, other apps)
4. Session maintained until voice interaction ends
5. System deactivates session cleanly

### Alternate Flows
- **A1**: Phone call interrupts → Pause session, resume after call
- **A2**: Another app takes audio → Pause, reclaim when possible

### Acceptance Criteria
- [ ] Audio session survives app backgrounding (brief)
- [ ] Proper handling of interruption notifications
- [ ] No audio conflicts with system sounds
- [ ] Clean handoff with phone calls

---

## UC-AUDIO-04: Handle Audio Ducking

**Actor**: System
**Trigger**: TTS playback begins while other audio playing
**Preconditions**: Other audio active (music, podcast, etc.)

### Main Flow
1. System detects other audio is playing
2. System lowers other audio volume to 20%
3. TTS plays at full volume
4. After TTS completes, other audio fades back up
5. Transition takes 300ms

### Alternate Flows
- **A1**: User has ducking disabled → Other audio pauses completely
- **A2**: Navigation audio active → Both play (navigation takes priority)

### Acceptance Criteria
- [ ] Duck transition is smooth (no pops)
- [ ] Ducked audio remains audible but not competing
- [ ] Restoration happens within 500ms of TTS end
- [ ] Works with Spotify, Apple Music, Podcasts

---

## UC-AUDIO-05: Route Audio Output

**Actor**: System
**Trigger**: Audio output device changes or user connects headphones
**Preconditions**: Active voice session

### Main Flow
1. System detects audio route change
2. System determines new output device
3. System routes TTS to new output
4. Capture route updated if applicable (headset mic)
5. Session continues without interruption

### Alternate Flows
- **A1**: Bluetooth disconnects → Fall back to speaker
- **A2**: CarPlay connects → Route to car speakers

### Acceptance Criteria
- [ ] Route changes handled within 200ms
- [ ] No audio gap during transition
- [ ] Headset mic used when headset connected
- [ ] User can override route in settings

---

## L4 Holdout Scenarios

### H-AUDIO-01: Bluetooth Codec Switching
**Scenario**: Bluetooth headphones switch from SBC to AAC codec mid-session
**Expected**: Audio continues with minimal quality change
**Why Holdout**: Hardware-specific edge case

### H-AUDIO-02: CarPlay Audio Competition
**Scenario**: User starts voice while CarPlay navigation is giving directions
**Expected**: Voice takes priority, navigation ducked, both audible
**Why Holdout**: Complex multi-source audio mixing

### H-AUDIO-03: AirPods Auto-Switching
**Scenario**: AirPods automatically switch to another device mid-response
**Expected**: Detect loss, route to speaker, warn user
**Why Holdout**: Apple ecosystem edge case
