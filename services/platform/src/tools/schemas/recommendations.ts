import { z } from 'zod';

export const findRecommendationsInputSchema = z.object({
  query: z.string().min(1),
  count: z.number().int().min(3).max(7).optional(),
  location: z.string().optional(),
  constraints: z.array(z.string()).optional(),
});

export const findRecommendationsOutputSchema = z.array(
  z
    .object({
      name: z.string().optional(),
    })
    .passthrough()
);
