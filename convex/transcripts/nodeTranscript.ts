/**
 * Node.js YouTube Transcript Fetcher
 * Uses youtube-transcript package to bypass bot protection
 * This can run directly in Convex actions (no external service needed)
 *
 * Note: youtube-transcript is an ESM-only module, so we use dynamic import
 */

export interface TranscriptResponse {
  text: string;
  duration: number;
  offset: number;
  lang?: string;
}

export interface TranscriptResult {
  success: boolean;
  transcript?: string;
  error?: string;
  metadata?: {
    wordCount: number;
    charCount: number;
    entryCount: number;
  };
}

/**
 * Fetch transcript for a YouTube video using Node.js
 *
 * This function uses the youtube-transcript package which accesses
 * YouTube's internal transcript endpoints that aren't subject to
 * the same bot protection as HTTP-based scrapers.
 *
 * @param videoId - YouTube video ID
 * @returns TranscriptResult with transcript data or error
 */
export async function fetchNodeTranscript(videoId: string): Promise<TranscriptResult> {
  try {
    // Dynamic import of ESM-only module
    const { YoutubeTranscript } = await import('youtube-transcript/dist/youtube-transcript.esm.js');

    // Fetch transcript data using youtube-transcript
    const transcriptData: TranscriptResponse[] = await YoutubeTranscript.fetchTranscript(
      videoId,
      { lang: 'en' } // Prefer English captions
    );

    // Format transcript as plain text
    // transcriptData is an array of {text, duration, offset} objects
    const transcriptText = transcriptData
      .map(entry => entry.text)
      .join(' ')
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Calculate metadata
    const wordCount = transcriptText.split(/\s+/).length;
    const charCount = transcriptText.length;

    if (transcriptText.length < 50) {
      return {
        success: false,
        error: 'Transcript too short - may be auto-generated or incomplete',
      };
    }


    return {
      success: true,
      transcript: transcriptText,
      metadata: {
        wordCount,
        charCount,
        entryCount: transcriptData.length,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for specific error types
    if (errorMessage.includes('Could not retrieve') || errorMessage.includes('transcripts') || errorMessage.includes('No transcripts are available')) {
      return {
        success: false,
        error: 'No captions available for this video',
      };
    }

    if (errorMessage.includes('private') || errorMessage.includes('Unauthorized')) {
      return {
        success: false,
        error: 'Video is private or access is forbidden',
      };
    }

    console.error(`[NodeTranscript] ❌ Failed for ${videoId}: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Check if a video has transcripts available without fetching
 */
export async function hasTranscript(videoId: string): Promise<boolean> {
  try {
    const { YoutubeTranscript } = await import('youtube-transcript/dist/youtube-transcript.esm.js');
    await YoutubeTranscript.fetchTranscript(videoId);
    return true;
  } catch {
    return false;
  }
}
