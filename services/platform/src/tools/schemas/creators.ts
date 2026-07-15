import { z } from 'zod';

export const assimilateCreatorInputSchema = z.object({
  profileId: z.string().min(1),
  forceRegenerate: z.boolean().optional(),
});

export const assimilateCreatorOutputSchema = z.object({
  success: z.boolean(),
  documentId: z.string().optional(),
  videosFound: z.number().int().optional(),
  transcriptsCreated: z.number().int().optional(),
  transcriptsSkipped: z.number().int().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
});

export const getCreatorTranscriptsInputSchema = z.object({
  profileId: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

export const getCreatorTranscriptsOutputSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

export const regenerateTranscriptInputSchema = z.object({
  contentId: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  priority: z.number().int().min(0).max(10).optional(),
});

export const regenerateTranscriptOutputSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});
