/** Capture assistant audio and hand it to the authoritative upload lifecycle. */

type UploadAudioFn = (args: { sessionId: string; blob: Blob }) => Promise<unknown>;
type SessionIdFn = () => string;

interface AudioRecorderOptions {
  uploadAudio: UploadAudioFn;
  getSessionId: SessionIdFn;
}

export interface AudioRecorder {
  /** Start recording from a remote MediaStream. No-op if already recording. */
  start: (stream: MediaStream) => void;
  /** Stop recording, hash the bytes, and upload through Hono init/PUT/finalize. */
  stopAndUpload: () => Promise<void>;
  /** Stop recording without creating an upload intent (cancel/orphan safety). */
  stopAndDiscard: () => Promise<void>;
}

/**
 * MediaRecorder is optional in the native WebRTC runtime. When available, the
 * recorder buffers the assistant audio and delegates all persistence to the
 * caller, which owns the Hono content-addressed upload protocol.
 */
export function createAudioRecorder({
  uploadAudio,
  getSessionId,
}: AudioRecorderOptions): AudioRecorder {
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];

  function start(stream: MediaStream): void {
    if (mediaRecorder !== null) return;
    if (typeof MediaRecorder === 'undefined') return;

    try {
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunks = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        mediaRecorder = null;
        chunks = [];
      };
      recorder.start(1000);
      mediaRecorder = recorder;
    } catch {
      // Unsupported native runtimes keep the live voice session usable.
    }
  }

  async function stopRecorder(): Promise<Blob | null> {
    if (!mediaRecorder) return null;

    const recorder = mediaRecorder;
    mediaRecorder = null;
    try {
      if (recorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
          recorder.stop();
        });
      }
      if (chunks.length === 0) return null;
      const blob = new Blob(chunks, { type: 'audio/webm' });
      chunks = [];
      return blob.size > 0 ? blob : null;
    } catch {
      chunks = [];
      return null;
    }
  }

  async function stopAndUpload(): Promise<void> {
    const blob = await stopRecorder();
    if (!blob) return;
    const sessionId = getSessionId();
    if (!sessionId) return;
    try {
      await uploadAudio({ sessionId, blob });
    } catch {
      // Upload errors must not prevent voice-session teardown.
    }
  }

  async function stopAndDiscard(): Promise<void> {
    await stopRecorder();
  }

  return { start, stopAndUpload, stopAndDiscard };
}
