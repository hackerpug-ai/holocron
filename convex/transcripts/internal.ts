/**
 * Transcript service internal actions
 * Handles YouTube API integration for fetching video transcripts
 * Handles Jina Reader fallback for videos without captions
 *
 * NOTE: YouTube caption downloads require OAuth2 authentication.
 * API keys work for listing captions but NOT for downloading.
 * This module uses OAuth2 for downloads when available.
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { fetchNodeTranscript } from "./nodeTranscript";

/**
 * "use node" directive - runs in Node.js environment (not V8 isolate)
 * Required for calling external APIs (YouTube Data API v3, Jina Reader)
 */
"use node";

/**
 * Rate limiter for YouTube API calls to prevent bot protection
 * Tracks last request time and enforces minimum delay
 */
class YouTubeRateLimiter {
  private lastRequestTime = 0;
  private readonly minDelayMs: number;

  constructor(minDelayMs: number = 3000) {
    this.minDelayMs = minDelayMs;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minDelayMs) {
      const waitTime = this.minDelayMs - timeSinceLastRequest;
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }
}

// Global rate limiter instances (shared across all requests in this process)
const rateLimiter = new YouTubeRateLimiter(3000); // 3 seconds minimum between YouTube API calls
const jinaRateLimiter = new YouTubeRateLimiter(2000); // 2 seconds minimum between Jina Reader calls

/**
 * Transcript metadata returned from fetch actions
 */
interface TranscriptMetadata {
  contentId: string;
  sourceUrl: string;
  transcriptType: "api" | "node_fallback" | "jina_fallback";
  transcriptSource: string;
  storageId: Id<"_storage">;
  previewText: string;
  wordCount: number;
  generatedAt: number;
}

// YouTube API fetch results (uses hasCaptions)
interface FetchSuccessResult {
  hasCaptions: true;
  transcript: TranscriptMetadata;
}

interface FetchNoCaptionsResult {
  hasCaptions: false;
  transcript: null;
}

interface FetchErrorResult {
  hasCaptions: false;
  error: string;
}

type FetchTranscriptResult = FetchSuccessResult | FetchNoCaptionsResult | FetchErrorResult;

// Jina Reader fetch results (uses hasTranscript)
interface JinaFetchSuccessResult {
  hasTranscript: true;
  transcript: TranscriptMetadata;
}

interface JinaFetchErrorResult {
  hasTranscript: false;
  error: string;
}

type JinaFetchTranscriptResult = JinaFetchSuccessResult | JinaFetchErrorResult;

/**
 * Fetch transcript for a YouTube video via YouTube Data API v3
 *
 * This function:
 * 1. Lists available captions for the video (uses API key)
 * 2. Downloads caption track using OAuth2 (required by YouTube)
 * 3. Falls back to Jina Reader if OAuth2 unavailable or fails
 * 4. Stores the full transcript in Convex file storage
 * 5. Returns metadata including previewText, wordCount, and storageId
 *
 * IMPORTANT: YouTube caption downloads REQUIRE OAuth2 authentication.
 * API keys work for listing captions but NOT for downloading.
 *
 * Error handling:
 * - 404: Video not found (private/deleted)
 * - No captions: Returns { hasCaptions: false, transcript: null }
 * - Rate limit (429): Returns { error: "API rate limit exceeded", hasCaptions: false }
 * - OAuth2 failure: Falls back to Jina Reader automatically
 */
export const fetchYouTubeTranscript = internalAction({
  args: {
    contentId: v.string(), // YouTube video ID
  },
  handler: async (ctx, args): Promise<FetchTranscriptResult> => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.warn("YOUTUBE_API_KEY not set, cannot fetch transcript");
      return {
        hasCaptions: false,
        error: "YouTube API key not configured",
      };
    }

    try {
      // Step 1: List captions for video (API key works for listing)
      await rateLimiter.waitIfNeeded();
      
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


      // Step 2: Try OAuth2 download first
      let accessToken: string | null = null;
      try {
        accessToken = await ctx.runAction(internal.transcripts.oauth.getAccessToken, {});
      } catch {
        
      }

      const captionTrack = captionsData.items[0];
      let transcriptText: string | null = null;
      let transcriptSource = "youtube_api_oauth2";

      if (accessToken) {
        // Try OAuth2 download (required by YouTube for caption downloads)
        await rateLimiter.waitIfNeeded();
        
        const oauthUrl = `https://www.googleapis.com/youtube/v3/captions/${captionTrack.id}`;
        const oauthResponse = await fetch(oauthUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (oauthResponse.ok) {
          transcriptText = await oauthResponse.text();
          console.log(`[YouTube] ✅ Transcript downloaded via OAuth2 (${transcriptText.length} chars)`);
        } else {
          console.warn(`[YouTube] OAuth2 download failed: ${oauthResponse.status}`);
          // Don't give up yet, try API key (might work for some public videos)
        }
      } else {
        
      }

      // Step 3: Try API key download (may work for some public videos)
      if (!transcriptText) {
        await rateLimiter.waitIfNeeded();
        const apiUrl = `https://www.googleapis.com/youtube/v3/captions/${captionTrack.id}?key=${apiKey}`;
        const apiResponse = await fetch(apiUrl);

        if (apiResponse.ok) {
          transcriptText = await apiResponse.text();
          transcriptSource = "youtube_api";
          console.log(`[YouTube] ✅ Transcript downloaded via API key (${transcriptText.length} chars)`);
        } else {
          console.warn(`[YouTube] API key download failed: ${apiResponse.status}`);
        }
      }

      // Step 4: If both YouTube methods fail, try Node.js youtube-transcript package
      if (!transcriptText) {
        

        const nodeResult = await fetchNodeTranscript(args.contentId);

        if (nodeResult.success && nodeResult.transcript) {
          
          const blob = new Blob([nodeResult.transcript], { type: "text/plain" });
          const storageId = await ctx.storage.store(blob);
          const previewText = nodeResult.transcript.slice(0, 500);
          const wordCount = nodeResult.metadata?.wordCount || nodeResult.transcript.split(/\s+/).filter(w => w.length > 0).length;

          return {
            hasCaptions: true,
            transcript: {
              contentId: args.contentId,
              sourceUrl: `https://www.youtube.com/watch?v=${args.contentId}`,
              transcriptType: "node_fallback" as const,
              transcriptSource: "youtube_transcript_nodejs",
              storageId,
              previewText,
              wordCount,
              generatedAt: Date.now(),
            },
          };
        }

        

        // Step 5: If Node.js method also fails, fall back to Jina Reader
        const jinaResult = await ctx.runAction(
          internal.transcripts.internal.fetchJinaTranscript,
          { contentId: args.contentId }
        );

        if (jinaResult.hasTranscript) {
          
          return {
            hasCaptions: true,
            transcript: jinaResult.transcript,
          };
        }

        return {
          hasCaptions: false,
          error: "Failed to download transcript via YouTube API (OAuth2/API key), Node.js youtube-transcript, or Jina Reader",
        };
      }

      // Step 5: Store and return transcript
      const blob = new Blob([transcriptText], { type: "text/plain" });
      const storageId = await ctx.storage.store(blob);

      const previewText = transcriptText.slice(0, 500);
      const wordCount = transcriptText.split(/\s+/).filter(w => w.length > 0).length;

      return {
        hasCaptions: true,
        transcript: {
          contentId: args.contentId,
          sourceUrl: `https://www.youtube.com/watch?v=${args.contentId}`,
          transcriptType: "api" as const,
          transcriptSource,
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
  handler: async (ctx, args): Promise<JinaFetchTranscriptResult> => {
    const url = `https://www.youtube.com/watch?v=${args.contentId}`;

    try {
      // Rate limit before Jina Reader call
      await jinaRateLimiter.waitIfNeeded();

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
