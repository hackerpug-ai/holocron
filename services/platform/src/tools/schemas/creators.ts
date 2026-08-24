import { z } from 'zod';

export const assimilateCreatorInputSchema = z.object({
  profileId: z.string().min(1),
  forceRegenerate: z.boolean().optional(),
});

export const assimilateCreatorOutputSchema = z.object({
  success: z.boolean(),
  documentId: z.string().nullish(),
  videosFound: z.number().int().nullish(),
  transcriptsCreated: z.number().int().nullish(),
  transcriptsSkipped: z.number().int().nullish(),
  status: z.string().nullish(),
  error: z.string().nullish(),
});

export const getCreatorTranscriptsInputSchema = z.object({
  profileId: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

export const getCreatorTranscriptsOutputSchema = z.object({
  success: z.boolean(),
  data: z.unknown().nullish(),
  error: z.string().nullish(),
});

export const regenerateTranscriptInputSchema = z.object({
  contentId: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  priority: z.number().int().min(0).max(10).optional(),
});

export const regenerateTranscriptOutputSchema = z.object({
  success: z.boolean(),
  data: z.unknown().nullish(),
  error: z.string().nullish(),
});

export const transcribeVideoUrlInputSchema = z.object({
  url: z.string().min(1),
});

export const transcribeVideoUrlOutputSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      transcript: z.string().nullish(),
      metadata: z
        .object({
          videoId: z.string().nullish(),
          language: z.string().nullish(),
          kind: z.string().nullish(),
          wordCount: z.number().int().nullish(),
          charCount: z.number().int().nullish(),
          entryCount: z.number().int().nullish(),
          preview: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
  error: z.string().nullish(),
  message: z.string().nullish(),
});
