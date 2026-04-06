import type { Id } from '@/convex/_generated/dataModel'

type GenerateUploadUrlFn = () => Promise<string>
type AttachAudioFn = (args: {
  sessionId: Id<'voiceSessions'>
  storageId: Id<'_storage'>
}) => Promise<unknown>

interface AudioRecorderOptions {
  generateUploadUrl: GenerateUploadUrlFn
  attachAudio: AttachAudioFn
  sessionId: Id<'voiceSessions'>
}

export interface AudioRecorder {
  /** Start recording from a remote MediaStream. No-op if already recording. */
  start: (stream: MediaStream) => void
  /**
   * Stop recording and upload the audio blob to Convex storage.
   * Returns once the upload + attachment mutation completes.
   * Errors are logged but never thrown — audio capture must never block session teardown.
   */
  stopAndUpload: () => Promise<void>
}

/**
 * Creates an audio recorder that captures the remote (assistant) audio stream
 * via MediaRecorder, uploads the blob to Convex file storage on stop, and
 * attaches the storage ID to the voice session.
 *
 * Errors are caught and logged — audio recording failures must never break
 * the transcript recording or voice session lifecycle.
 */
export function createAudioRecorder({
  generateUploadUrl,
  attachAudio,
  sessionId,
}: AudioRecorderOptions): AudioRecorder {
  let mediaRecorder: MediaRecorder | null = null
  let chunks: Blob[] = []

  function start(stream: MediaStream): void {
    if (mediaRecorder !== null) return

    try {
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunks = []

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      recorder.onerror = () => {
        console.error('[audio-recorder] MediaRecorder error — stopping capture')
        mediaRecorder = null
        chunks = []
      }

      recorder.start(1000) // Collect data every second
      mediaRecorder = recorder
    } catch (err) {
      console.error('[audio-recorder] Failed to start MediaRecorder:', err)
      // Do not re-throw — transcript recording must continue
    }
  }

  async function stopAndUpload(): Promise<void> {
    if (!mediaRecorder) return

    try {
      // Wait for the recorder to finish flushing
      const recorder = mediaRecorder
      mediaRecorder = null

      if (recorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          recorder.onstop = () => resolve()
          recorder.stop()
        })
      }

      if (chunks.length === 0) return

      const blob = new Blob(chunks, { type: 'audio/webm' })
      chunks = []

      if (blob.size === 0) return

      // Upload to Convex file storage
      const uploadUrl = await generateUploadUrl()
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/webm' },
        body: blob,
      })

      if (!uploadResponse.ok) {
        console.error('[audio-recorder] Upload failed:', uploadResponse.status)
        return
      }

      const { storageId } = (await uploadResponse.json()) as { storageId: string }

      // Attach to session
      await attachAudio({
        sessionId,
        storageId: storageId as Id<'_storage'>,
      })
    } catch (err) {
      console.error('[audio-recorder] Failed to upload audio:', err)
      // Never throw — audio recording is best-effort
    }
  }

  return { start, stopAndUpload }
}
