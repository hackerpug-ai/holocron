"use node";

import { action, internalAction } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { createHash } from "crypto";
import { ElevenLabsClient } from "elevenlabs";

const DEFAULT_VOICE_ID = "DODLEQrClDo8wCz460ld";
const MODEL_FLASH = "eleven_flash_v2_5";
const MODEL_MULTILINGUAL = "eleven_multilingual_v2";
const FLASH_CHAR_LIMIT = 5000;
const OUTPUT_FORMAT = "mp3_44100_128";
const STAGGER_MS = 200;

// ============================================================================
// Helper
// ============================================================================

/**
 * Parse markdown into discrete paragraph segments suitable for TTS.
 * Returns each segment with its paragraph index, a SHA-256 content hash,
 * and the cleaned text.
 */
export const extractParagraphs = (
  markdown: string
): { index: number; hash: string; text: string }[] => {
  let text = markdown;

  // Strip fenced code blocks
  text = text.replace(/```[\s\S]*?```/g, "");

  // Strip inline images ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "");

  // Strip HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Split on double newlines to get logical paragraphs
  const rawBlocks = text.split(/\n{2,}/);

  const segments: { index: number; hash: string; text: string }[] = [];
  let index = 0;

  for (const block of rawBlocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Heading lines become their own segment (for natural pacing)
    if (/^#{1,6}\s+/.test(trimmed)) {
      const headingText = trimmed.replace(/^#{1,6}\s+/, "");
      const segmentText = headingText;
      const hash = createHash("sha256").update(segmentText).digest("hex");
      segments.push({ index, hash, text: segmentText });
      index += 1;
      continue;
    }

    // Regular paragraph — collapse internal newlines to spaces
    const segmentText = trimmed.replace(/\n/g, " ");
    const hash = createHash("sha256").update(segmentText).digest("hex");
    segments.push({ index, hash, text: segmentText });
    index += 1;
  }

  return segments;
};

// ============================================================================
// Internal: generate a single audio segment
// ============================================================================

export const generateSegment = internalAction({
  args: {
    segmentId: v.id("audioSegments"),
    text: v.string(),
    voiceId: v.string(),
    previous_text: v.optional(v.string()),
    next_text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Mark as generating
    await ctx.runMutation(internal.audio.mutations.markGenerating, {
      segmentId: args.segmentId,
    });

    try {
      const client = new ElevenLabsClient({
        apiKey: process.env.ELEVENLABS_API_KEY,
      });

      const audioStream = await client.textToSpeech.convert(args.voiceId, {
        text: args.text,
        model_id: args.text.length > FLASH_CHAR_LIMIT ? MODEL_MULTILINGUAL : MODEL_FLASH,
        output_format: OUTPUT_FORMAT,
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.75,
        },
        ...(args.previous_text ? { previous_text: args.previous_text } : {}),
        ...(args.next_text ? { next_text: args.next_text } : {}),
      });

      // Collect stream chunks into a single Buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      // OUTPUT_FORMAT is mp3_44100_128 (128kbps CBR MP3) — duration is deterministic
      const durationMs = Math.round((buffer.length * 8) / (128 * 1000) * 1000);

      // Store audio in Convex file storage
      const blob = new Blob([buffer], { type: "audio/mpeg" });
      const storageId = await ctx.storage.store(blob);

      await ctx.runMutation(internal.audio.mutations.completeSegment, {
        segmentId: args.segmentId,
        storageId,
        durationMs,
      });
    } catch (err) {
      // Extract detailed error info from ElevenLabs SDK errors
      let errorMessage = "Unknown error";
      if (err instanceof Error) {
        errorMessage = err.message;
        // ElevenLabs SDK errors may have statusCode and body properties
        const apiErr = err as Error & { statusCode?: number; body?: unknown };
        if (apiErr.statusCode) {
          errorMessage = `Status ${apiErr.statusCode}: ${err.message}`;
        }
        if (apiErr.body) {
          try {
            const bodyStr = typeof apiErr.body === "string"
              ? apiErr.body
              : JSON.stringify(apiErr.body);
            errorMessage += ` | Body: ${bodyStr}`;
          } catch {
            // JSON stringify failed — keep original message
          }
        }
      }
      console.error(
        `[generateSegment] Failed for segment ${args.segmentId}:`,
        errorMessage,
        err
      );
      try {
        await ctx.runMutation(internal.audio.mutations.failSegment, {
          segmentId: args.segmentId,
          errorMessage,
        });
      } catch {
        // Segment may have been deleted by concurrent regeneration — safe to ignore
      }
    }
  },
});

// ============================================================================
// Internal shared generation logic
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runGeneration(
  ctx: { runQuery: any; runMutation: any; scheduler: { runAfter: any } },
  documentId: string,
  voiceId: string
): Promise<{ jobId: string; segmentCount: number }> {
  // Fetch the document content
  const document = await ctx.runQuery(api.documents.queries.get, {
    id: documentId,
  });

  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }

  const paragraphs = extractParagraphs(document.content ?? "");

  if (paragraphs.length === 0) {
    // Create a job even for empty documents so callers always get a jobId
    const jobId = await ctx.runMutation(internal.audio.mutations.createJob, {
      documentId,
      voiceId,
      totalSegments: 0,
    });
    return { jobId, segmentCount: 0 };
  }

  // Create (or return existing) job for this document
  const jobId = await ctx.runMutation(internal.audio.mutations.createJob, {
    documentId,
    voiceId,
    totalSegments: paragraphs.length,
  });

  // Create pending segment rows (idempotent — returns existing IDs if present)
  const segmentIds: string[] = await ctx.runMutation(
    internal.audio.mutations.createSegments,
    {
      documentId,
      voiceId,
      jobId,
      paragraphs: paragraphs.map(({ index, hash }) => ({ index, hash })),
    }
  );

  // Check which segments still need generation (skip already-completed ones)
  const existingSegments = await ctx.runQuery(api.audio.queries.getSegments, {
    documentId: documentId as any,
  });
  const completedIndexes = new Set(
    existingSegments
      .filter((s: { status: string }) => s.status === "completed")
      .map((s: { paragraphIndex: number }) => s.paragraphIndex)
  );

  // Stagger scheduling to avoid thundering-herd on ElevenLabs
  let staggerIndex = 0;
  for (let i = 0; i < segmentIds.length; i++) {
    if (completedIndexes.has(i)) continue; // Already generated — skip
    await ctx.scheduler.runAfter(
      staggerIndex * STAGGER_MS,
      internal.audio.actions.generateSegment,
      {
        segmentId: segmentIds[i],
        text: paragraphs[i].text,
        voiceId,
        previous_text: i > 0 ? paragraphs[i - 1].text : undefined,
        next_text: i < paragraphs.length - 1 ? paragraphs[i + 1].text : undefined,
      }
    );
    staggerIndex++;
  }

  return { jobId, segmentCount: paragraphs.length };
}

// ============================================================================
// Public: generate audio for a document
// ============================================================================

export const generateForDocument = action({
  args: {
    documentId: v.id("documents"),
    voiceId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ jobId: string; segmentCount: number }> => {
    const voiceId = args.voiceId ?? DEFAULT_VOICE_ID;
    // Idempotency is handled inside runGeneration via createJob
    return runGeneration(ctx, args.documentId, voiceId);
  },
});

// ============================================================================
// Public: delete existing audio and regenerate
// ============================================================================

export const regenerateForDocument = action({
  args: {
    documentId: v.id("documents"),
    voiceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const voiceId = args.voiceId ?? DEFAULT_VOICE_ID;

    // Delete all existing segments and jobs from DB (storage deleted inside mutation)
    await ctx.runMutation(internal.audio.mutations.deleteAllForDocument, {
      documentId: args.documentId,
    });

    return runGeneration(ctx, args.documentId, voiceId);
  },
});

// ============================================================================
// Public: retry failed segments
// ============================================================================

export const retryFailedSegments = action({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const status = await ctx.runQuery(api.audio.queries.getStatus, {
      documentId: args.documentId,
    });
    if (status.failed === 0) return { retried: 0 };

    // Get all segments to find failed ones
    const segments = await ctx.runQuery(api.audio.queries.getSegments, {
      documentId: args.documentId,
    });
    const failedSegments = segments.filter(
      (s: { status: string }) => s.status === "failed"
    );

    // Re-extract paragraphs to get text for failed segments
    const document = await ctx.runQuery(api.documents.queries.get, {
      id: args.documentId,
    });
    if (!document) return { retried: 0 };
    const paragraphs = extractParagraphs(document.content ?? "");

    // Get the job to find voiceId
    const job = await ctx.runQuery(api.audio.queries.getJob, {
      documentId: args.documentId,
    });
    const voiceId = job?.voiceId ?? DEFAULT_VOICE_ID;

    let retriedCount = 0;
    for (const segment of failedSegments) {
      const result = await ctx.runMutation(
        internal.audio.mutations.resetSegmentForRetry,
        { segmentId: segment._id }
      );
      if (!result.retried) continue;

      const paraIndex = paragraphs.findIndex(
        (p: { index: number }) => p.index === segment.paragraphIndex
      );
      if (paraIndex === -1) continue;
      const para = paragraphs[paraIndex];

      await ctx.scheduler.runAfter(
        0,
        internal.audio.actions.generateSegment,
        {
          segmentId: segment._id,
          text: para.text,
          voiceId,
          previous_text: paraIndex > 0 ? paragraphs[paraIndex - 1].text : undefined,
          next_text: paraIndex < paragraphs.length - 1 ? paragraphs[paraIndex + 1].text : undefined,
        }
      );
      retriedCount++;
    }

    return { retried: retriedCount };
  },
});
