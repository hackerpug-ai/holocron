/**
 * Transcript service internal actions
 * Handles YouTube API integration for fetching video transcripts
 * Handles Jina Reader fallback for videos without captions
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";

/**
 * "use node" directive - runs in Node.js environment (not V8 isolate)
 * Required for calling external APIs (YouTube Data API v3, Jina Reader)
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

/**
 * Helper function to extract transcript from Jina Reader content
 * Jina Reader returns cleaned text, so we look for transcript-like sections
 */
function extractTranscriptFromContent(content: string): string | null {
  // Look for common transcript patterns in the cleaned content
  // This is heuristic-based as Jina Reader output varies

  // Try to find sections that look like transcripts
  const transcriptPatterns = [
    /(?:Transcript|Description)(?:\n|$)([\s\S]+?)(?=\n\n|$)/i,
    /(?:In this video|Today I|Hey everyone)([\s\S]+)/i,
  ];

  for (const pattern of transcriptPatterns) {
    const match = content.match(pattern);
    if (match && match[1] && match[1].length > 100) {
      return match[1].trim();
    }
  }

  // Fallback: return first substantial paragraph
  const paragraphs = content.split(/\n\n+/);
  for (const para of paragraphs) {
    if (para.length > 200) {
      return para.trim();
    }
  }

  return null;
}

/**
 * Fetch transcript for a YouTube video via Jina Reader API (fallback)
 *
 * This function:
 * 1. Fetches the YouTube video page via Jina Reader
 * 2. Extracts transcript-like content from the page
 * 3. Stores the full transcript in Convex file storage
 * 4. Returns metadata with transcriptSource="jina_reader_api"
 *
 * Error handling:
 * - Rate limit (429): Returns { error: "Jina Reader rate limit exceeded", hasTranscript: false }
 * - No content: Returns { error: "No transcript content found", hasTranscript: false }
 * - Network errors: Returns { error: message, hasTranscript: false }
 */
export const fetchJinaTranscript = internalAction({
  args: {
    contentId: v.string(), // YouTube video ID
  },
  handler: async (ctx, args) => {
    const url = `https://www.youtube.com/watch?v=${args.contentId}`;

    try {
      // Fetch page content via Jina Reader
      const response = await fetch(`https://r.jina.ai/http://${url}`);

      if (!response.ok) {
        // Handle rate limit
        if (response.status === 429) {
          return {
            hasTranscript: false,
            error: "Jina Reader rate limit exceeded",
          };
        }
        return {
          hasTranscript: false,
          error: `Jina Reader fetch failed: ${response.status}`,
        };
      }

      const content = await response.text();

      // Extract transcript-like content from page
      const transcriptText = extractTranscriptFromContent(content);

      if (!transcriptText || transcriptText.length < 100) {
        return {
          hasTranscript: false,
          error: "No transcript content found in page",
        };
      }

      // Store in file storage
      const blob = new Blob([transcriptText], { type: "text/plain" });
      const storageId = await ctx.storage.store(blob);

      // Extract metadata
      const previewText = transcriptText.slice(0, 500);
      const wordCount = transcriptText.split(/\s+/).filter(w => w.length > 0).length;

      return {
        hasTranscript: true,
        transcript: {
          contentId: args.contentId,
          sourceUrl: url,
          transcriptType: "jina_fallback" as const,
          transcriptSource: "jina_reader_api",
          storageId,
          previewText,
          wordCount,
          generatedAt: Date.now(),
        },
      };
    } catch (error) {
      console.error("Jina Reader transcript error:", error);
      return {
        hasTranscript: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
