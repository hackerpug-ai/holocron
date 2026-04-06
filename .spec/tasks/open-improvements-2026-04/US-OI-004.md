# US-OI-004: Voice Assistant Audio Recording

> Task ID: US-OI-004
> Type: FEATURE
> Priority: P2
> Estimate: 180 minutes
> Assignee: general-purpose

## CRITICAL CONSTRAINTS

### MUST
- Read `convex/voice/mutations.ts`, `lib/voice/webrtc-connection.ts`, `lib/voice/transcript-recorder.ts`, and `convex/schema.ts` before modifying
- Preserve existing transcript recording - audio recording is additive
- Use Convex file storage for audio blobs (not external storage)
- Handle the case where audio recording fails gracefully (transcript should still work)

### NEVER
- Break existing voice session or transcript functionality
- Store raw PCM data (too large) - use compressed format (webm/opus or mp4/aac)
- Record audio without user awareness (this is a personal app but good practice)

### STRICTLY
- Audio recording must capture the assistant's remote audio track
- Audio must be retrievable for playback after the session ends
- Schema migration must handle existing voice sessions that have no audio

## SPECIFICATION

**Objective:** Capture and store the assistant's audio during voice sessions so users can replay what the assistant said.

**Current State:**
- `convex/voice/mutations.ts`: `recordTranscript()` records TEXT ONLY (role, content, messageType)
- `lib/voice/webrtc-connection.ts`: `onTrack` callback (line ~90) receives remote audio track but only renders to UI
- `lib/voice/transcript-recorder.ts`: 44-line module that captures text transcripts only
- Schema: `voiceSessions` table has no audio storage fields

**Success looks like:** After a voice session ends, the user can play back the assistant's audio responses.

## ACCEPTANCE CRITERIA

| # | Given | When | Then | Verify |
|---|-------|------|------|--------|
| 1 | Voice session is active | Assistant speaks via WebRTC | Audio stream is captured via MediaRecorder on the remote track | Review webrtc-connection.ts for MediaRecorder on remote stream |
| 2 | Voice session ends | Session completes | Audio blob is uploaded to Convex file storage | `grep -r 'storage.store\|generateUploadUrl' convex/voice/` |
| 3 | Voice session with audio | User views session history | Audio file reference is stored in voiceSessions table | `grep 'audioStorageId\|audioFileId' convex/schema.ts` |
| 4 | Previous voice sessions | User views old sessions | Old sessions without audio display gracefully (no error) | Schema field is optional |
| 5 | Audio recording fails | MediaRecorder throws | Transcript recording continues normally, error logged | Review error handling around MediaRecorder |

## TEST CRITERIA

Review agents verify ALL test criteria are TRUE before marking task complete.

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|-------------------|------------|--------|--------|
| 1 | MediaRecorder is instantiated on the remote audio track in webrtc-connection.ts | AC-1 | `grep -c 'MediaRecorder' lib/voice/webrtc-connection.ts` > 0 | [ ] TRUE [ ] FALSE |
| 2 | Convex file storage upload exists in voice mutations or actions | AC-2 | `grep -c 'generateUploadUrl\|storage' convex/voice/mutations.ts convex/voice/actions.ts` > 0 | [ ] TRUE [ ] FALSE |
| 3 | voiceSessions schema has optional audio storage field | AC-3, AC-4 | `grep 'audio' convex/schema.ts | grep -q 'optional'` | [ ] TRUE [ ] FALSE |
| 4 | TypeScript compiles without errors | AC-1-5 | `pnpm tsc --noEmit` exits 0 | [ ] TRUE [ ] FALSE |
| 5 | All existing tests pass | AC-4 | `pnpm vitest run` exits 0 | [ ] TRUE [ ] FALSE |

## GUARDRAILS

### WRITE-ALLOWED
- `lib/voice/webrtc-connection.ts` (MODIFY) - Add MediaRecorder on remote track
- `lib/voice/transcript-recorder.ts` (MODIFY) - May need audio recording coordinator
- `convex/voice/mutations.ts` (MODIFY) - Add audio storage mutation
- `convex/voice/actions.ts` (CREATE or MODIFY) - Upload URL generation action
- `convex/schema.ts` (MODIFY) - Add optional audioStorageId to voiceSessions

### WRITE-PROHIBITED
- `convex/voice/queries.ts` - Query changes are a separate UI task
- `app/` screen components - Playback UI is a separate task
- OpenAI API integration - Don't change the WebRTC connection setup

## DESIGN

### Schema addition
```typescript
// In voiceSessions table definition
audioStorageId: v.optional(v.id("_storage")),
```

### Audio capture pattern
```typescript
// In webrtc-connection.ts, inside onTrack callback
const mediaRecorder = new MediaRecorder(remoteStream, {
  mimeType: 'audio/webm;codecs=opus'
})
const chunks: Blob[] = []
mediaRecorder.ondataavailable = (e) => chunks.push(e.data)
mediaRecorder.onstop = async () => {
  const blob = new Blob(chunks, { type: 'audio/webm' })
  // Upload to Convex storage
  await uploadAudioBlob(sessionId, blob)
}
mediaRecorder.start()
```

### Upload flow
```typescript
// Generate upload URL via Convex action, upload blob, store reference
const uploadUrl = await generateUploadUrl()
const result = await fetch(uploadUrl, { method: 'POST', body: blob })
const { storageId } = await result.json()
await patchVoiceSession(sessionId, { audioStorageId: storageId })
```

## CODING STANDARDS

- **brain/docs/REACT-RULES.md**: N/A (mostly backend + lib code)
- **CLAUDE.md**: Commit automatically, run all pre-commit checks

## DEPENDENCIES

No task dependencies.

## REQUIRED READING

1. `lib/voice/webrtc-connection.ts` - ALL
   Focus: onTrack callback (line ~90), how remote audio stream is received

2. `convex/voice/mutations.ts` - ALL
   Focus: recordTranscript pattern, session lifecycle

3. `lib/voice/transcript-recorder.ts` - ALL
   Focus: Current recording pattern to parallel for audio

4. `convex/schema.ts` - Search for "voiceSessions"
   Focus: Current table definition, storage patterns used elsewhere
