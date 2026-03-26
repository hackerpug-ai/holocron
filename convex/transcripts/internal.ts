/**
 * Transcript service internal actions
 * Handles YouTube API integration for fetching video transcripts
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";

/**
 * "use node" directive - runs in Node.js environment (not V8 isolate)
 * Required for calling external APIs (YouTube Data API v3)
 */
"use node";

/**
 * Fetch transcript for a YouTube video via YouTube Data API v3
 *
 * This function:
 * 1. Lists available captions for the video
 * 2. Downloads the first available caption track
 * 3. Stores the full transcript in Convex file storage
 * 4. Returns metadata including previewText, wordCount, and storageId
 *
 * Error handling:
 * - 404: Video not found (private/deleted)
 * - No captions: Returns { hasCaptions: false, transcript: null }
 * - Rate limit (429): Returns { error: "API rate limit exceeded", hasCaptions: false }
 */
export const fetchYouTubeTranscript = internalAction({
  args: {
    contentId: v.string(), // YouTube video ID
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.warn("YOUTUBE_API_KEY not set, cannot fetch transcript");
      return {
        hasCaptions: false,
        error: "YouTube API key not configured",
      };
    }

    try {
      // Step 1: List captions for video
      const captionsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${args.contentId}&key=${apiKey}`
      );

      if (!captionsResponse.ok) {
        // Handle 404 - video not found (private/deleted)
        if (captionsResponse.status === 404) {
          return {
            hasCaptions: false,
            error: "Video not found",
          };
        }
        // Handle rate limit (429)
        if (captionsResponse.status === 429) {
          return {
            hasCaptions: false,
            error: "API rate limit exceeded",
          };
        }
        throw new Error(`YouTube API error: ${captionsResponse.status}`);
      }

      const captionsData = await captionsResponse.json();

      // Check if captions are available
      if (!captionsData.items || captionsData.items.length === 0) {
        return {
          hasCaptions: false,
          transcript: null,
        };
      }

      // Step 2: Download first available caption track
      const captionTrack = captionsData.items[0];
      const downloadUrl = `https://www.googleapis.com/youtube/v3/captions/${captionTrack.id}?key=${apiKey}`;
      const transcriptResponse = await fetch(downloadUrl);

      if (!transcriptResponse.ok) {
        throw new Error(`Failed to download caption: ${transcriptResponse.status}`);
      }

      const transcriptText = await transcriptResponse.text();

      // Step 3: Store in file storage
      const blob = new Blob([transcriptText], { type: "text/plain" });
      const storageId = await ctx.storage.store(blob);

      // Step 4: Extract metadata
      const previewText = transcriptText.slice(0, 500);
      const wordCount = transcriptText.split(/\s+/).filter(w => w.length > 0).length;

      return {
        hasCaptions: true,
        transcript: {
          contentId: args.contentId,
          sourceUrl: `https://www.youtube.com/watch?v=${args.contentId}`,
          transcriptType: "api" as const,
          transcriptSource: "youtube_api",
          storageId,
          previewText,
          wordCount,
          generatedAt: Date.now(),
        },
      };
    } catch (error) {
      console.error("YouTube transcript fetch error:", error);
      return {
        hasCaptions: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
