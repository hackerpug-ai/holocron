/**
 * Type declarations for youtube-transcript ESM module
 */

declare interface TranscriptResponse {
  text: string;
  duration: number;
  offset: number;
  lang?: string;
}

declare module 'youtube-transcript/dist/youtube-transcript.esm.js' {
  export class YoutubeTranscript {
    static fetchTranscript(
      videoId: string,
      config?: { lang?: string }
    ): Promise<TranscriptResponse[]>;
  }
}
