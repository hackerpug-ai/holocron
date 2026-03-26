import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get a transcript by contentId (e.g., YouTube video ID).
 * Returns null if transcript doesn't exist.
 */
export const getTranscript = internalQuery({
  args: {
    contentId: v.string(),
  },
  handler: async (ctx, args) => {
    const transcript = await ctx.db
      .query("videoTranscripts")
      .withIndex("by_content_id", (q) => q.eq("contentId", args.contentId))
      .first();

    if (!transcript) {
      return null;
    }

    return {
      _id: transcript._id,
      contentId: transcript.contentId,
      sourceUrl: transcript.sourceUrl,
      transcriptType: transcript.transcriptType,
      transcriptSource: transcript.transcriptSource,
      storageId: transcript.storageId,
      previewText: transcript.previewText,
      wordCount: transcript.wordCount,
      durationMs: transcript.durationMs ?? null,
      language: transcript.language ?? null,
      metadata: transcript.metadataJson ?? null,
      generatedAt: transcript.generatedAt,
      createdAt: transcript.createdAt,
    };
  },
});
