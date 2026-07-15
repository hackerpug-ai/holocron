import { z } from 'zod';

export const searchImprovementsInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

export const searchImprovementsOutputSchema = z.array(z.record(z.string(), z.unknown()));

export const getImprovementInputSchema = z.object({
  id: z.string().min(1),
});

export const getImprovementOutputSchema = z
  .object({
    _id: z.string(),
    description: z.string(),
    status: z.string(),
    sourceScreen: z.string().optional(),
    closedReason: z.string().optional(),
    closedAt: z.number().optional(),
    createdAt: z.number().optional(),
  })
  .nullable();

export const listImprovementsInputSchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  limit: z.number().int().positive().optional(),
});

export const listImprovementsOutputSchema = z.array(z.record(z.string(), z.unknown()));

export const addImprovementInputSchema = z.object({
  items: z
    .array(
      z.object({
        description: z.string().min(1),
        sourceScreen: z.string().optional(),
      })
    )
    .min(1),
});

export const addImprovementOutputSchema = z.object({
  created: z.number().int(),
  ids: z.array(z.string()),
});

export const closeImprovementInputSchema = z.object({
  id: z.string().min(1),
  reason: z.string().optional(),
  evidence: z.array(z.string()).optional(),
});

export const closeImprovementOutputSchema = z.object({
  id: z.string(),
  status: z.string(),
});

export const setImprovementStatusInputSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['open', 'closed']),
  reason: z.string().optional(),
  evidence: z.array(z.string()).optional(),
});

export const setImprovementStatusOutputSchema = z.object({
  id: z.string(),
  status: z.string(),
});
