import { z } from 'zod';

export const getResearchSessionInputSchema = z.object({
  sessionId: z.string().min(1),
});

export const getResearchSessionOutputSchema = z
  .object({
    _id: z.string(),
    sessionId: z.string(),
    topic: z.string(),
    status: z.string(),
    iterations: z.array(z.unknown()),
  })
  .nullable();

export const searchResearchInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

export const searchResearchOutputSchema = z.object({
  sessions: z.array(
    z.object({
      sessionId: z.string(),
      topic: z.string(),
      relevanceScore: z.number(),
      status: z.string(),
      createdAt: z.number(),
    })
  ),
  totalResults: z.number().int(),
});
