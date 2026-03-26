/**
 * Transcript service orchestration
 * Handles fallback logic between YouTube API and Jina Reader
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

/**
 * "use node" directive - runs in Node.js environment (not V8 isolate)
 * Required for calling other internal actions
 */
"use node";

/**
 * Orchestrate transcript fetching with fallback
 * Tries YouTube API first, then Jina Reader
 *
 * This function:
 * 1. Tries YouTube API (primary)
 * 2. If no captions or API fails, tries Jina Reader (fallback)
 * 3. Returns success with transcript if either service works
 * 4. Returns failure if both services fail
 *
 * Error handling:
 * - YouTube API failure: Logs error, tries Jina Reader
 * - Jina Reader failure: Returns error gracefully
 * - Both fail: Returns { success: false, error: "..." }
 */
export const fetchTranscriptWithFallback = internalAction({
  args: {
    contentId: v.string(),
    sourceUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    transcript?: {
      contentId: string;
      sourceUrl: string;
      transcriptType: "api" | "node_fallback" | "jina_fallback";
      transcriptSource: string;
      storageId: Id<"_storage">;
      previewText: string;
      wordCount: number;
      generatedAt: number;
    };
    source?: string;
    error?: string;
  }> => {
    // Try YouTube API first (primary)
    const youtubeResult = await ctx.runAction(
      internal.transcripts.internal.fetchYouTubeTranscript,
      { contentId: args.contentId }
    );

    if (youtubeResult.hasCaptions && youtubeResult.transcript) {
      console.log(`Transcript found via YouTube API for ${args.contentId}`);
      return {
        success: true,
        transcript: youtubeResult.transcript,
        source: "youtube_api",
      };
    }

    // YouTube API failed or no captions, try Jina Reader (fallback)
    const youtubeError = 'error' in youtubeResult ? youtubeResult.error : undefined;
    if (youtubeError) {
      console.log(`YouTube API failed for ${args.contentId}: ${youtubeError}, trying Jina Reader`);
    } else {
      console.log(`No captions via YouTube API for ${args.contentId}, trying Jina Reader`);
    }

    const jinaResult = await ctx.runAction(
      internal.transcripts.internal.fetchJinaTranscript,
      { contentId: args.contentId }
    );

    if (jinaResult.hasTranscript && jinaResult.transcript) {
      console.log(`Transcript found via Jina Reader for ${args.contentId}`);
      return {
        success: true,
        transcript: jinaResult.transcript,
        source: "jina_reader_api",
      };
    }

    // Both failed
    console.log(`No transcript found for ${args.contentId} via any source`);
    return {
      success: false,
      error: "No transcript available (tried YouTube API and Jina Reader)",
    };
  },
});
