import type { Id } from '@/convex/_generated/dataModel'

type RecordTranscriptFn = (args: {
  sessionId: Id<'voiceSessions'>
  conversationId: Id<'conversations'>
  role: 'user' | 'agent'
  content: string
}) => Promise<unknown>

interface TranscriptRecorderOptions {
  recordTranscript: RecordTranscriptFn
  sessionId: Id<'voiceSessions'>
  conversationId: Id<'conversations'>
}

interface TranscriptRecorder {
  onUserTranscript: (content: string) => void
  onAgentTranscript: (content: string) => void
}

/**
 * Creates a fire-and-forget transcript recorder that persists voice turns
 * to Convex chatMessages via the recordTranscript mutation.
 *
 * Errors are logged but never re-thrown — recording must never block audio.
 */
export function createTranscriptRecorder({
  recordTranscript,
  sessionId,
  conversationId,
}: TranscriptRecorderOptions): TranscriptRecorder {
  function record(role: 'user' | 'agent', content: string): void {
    void recordTranscript({ sessionId, conversationId, role, content }).catch(
      (err: unknown) => {
        console.error('[transcript-recorder] Failed to record transcript:', err)
      }
    )
  }

  return {
    onUserTranscript: (content: string) => record('user', content),
    onAgentTranscript: (content: string) => record('agent', content),
  }
}
