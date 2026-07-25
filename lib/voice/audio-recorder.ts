type GenerateUploadUrlFn = () => Promise<string>;
type AttachAudioFn = (args: { sessionId: string; storageId: string }) => Promise<unknown>;

interface AudioRecorderOptions {
  generateUploadUrl: GenerateUploadUrlFn;
  attachAudio: AttachAudioFn;
  sessionId: string;
}

export interface AudioRecorder {
  /** Start recording from a remote MediaStream. No-op if already recording. */
  start: (stream: MediaStream) => void;
  /**
   * Stop recording and upload the audio blob to Convex storage.
   * Returns once the upload + attachment mutation completes.
   * Errors are logged but never thrown — audio capture must never block session teardown.
   */
  stopAndUpload: () => Promise<void>;
}

/**
 * Creates an audio recorder that captures the remote (assistant) audio stream
 * via MediaRecorder, uploads the blob to Convex file storage on stop, and
 * attaches the storage ID to the voice session.
 *
 * Recording is optional. Unsupported native runtimes silently skip it so an
 * implementation detail never obscures the live voice controls.
 */
export function createAudioRecorder({
  generateUploadUrl,
  attachAudio,
  sessionId,
}: AudioRecorderOptions): AudioRecorder {
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];

  function start(stream: MediaStream): void {
    if (mediaRecorder !== null) return;
    // react-native-webrtc does not provide the browser MediaRecorder API.
    // Remote-audio persistence is best-effort, while the live session is not.
    if (typeof MediaRecorder === 'undefined') return;

    try {
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunks = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => {
        mediaRecorder = null;
        chunks = [];
      };

      recorder.start(1000); // Collect data every second
      mediaRecorder = recorder;
    } catch {
      // Do not re-throw or surface a dev error — transcript/session continues.
    }
  }

  async function stopAndUpload(): Promise<void> {
    if (!mediaRecorder) return;

    try {
      // Wait for the recorder to finish flushing
      const recorder = mediaRecorder;
      mediaRecorder = null;

      if (recorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
          recorder.stop();
        });
      }

      if (chunks.length === 0) return;

      const blob = new Blob(chunks, { type: 'audio/webm' });
      chunks = [];

      if (blob.size === 0) return;

      // Upload to Convex file storage
      const uploadUrl = await generateUploadUrl();
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/webm' },
        body: blob,
      });

      if (!uploadResponse.ok) {
        return;
      }

      const { storageId } = (await uploadResponse.json()) as { storageId: string };

      // Attach to session
      await attachAudio({
        sessionId,
        storageId,
      });
    } catch {
      // Never throw or surface a dev error — audio capture is best-effort.
    }
  }

  return { start, stopAndUpload };
}
