import { z } from 'zod';

export const shopProductsInputSchema = z.object({
  query: z.string().min(1),
  retailers: z.array(z.string()).optional(),
  condition: z.enum(['new', 'used', 'any']).optional(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  verifiedOnly: z.boolean().optional(),
});

export const shopProductsOutputSchema = z.object({
  sessionId: z.string(),
  status: z.string(),
  totalListings: z.number().int().optional(),
  bestDeal: z.record(z.string(), z.unknown()).nullable().optional(),
  listings: z.array(z.record(z.string(), z.unknown())).optional(),
  durationMs: z.number().optional(),
  error: z.string().optional(),
});

export const getShopSessionInputSchema = z.object({
  sessionId: z.string().min(1),
});

export const getShopSessionOutputSchema = z.object({
  session: z.record(z.string(), z.unknown()).nullable(),
});

export const getShopListingsInputSchema = z.object({
  sessionId: z.string().min(1),
  limit: z.number().int().positive().optional(),
  excludeDuplicates: z.boolean().optional(),
  sortBy: z.enum(['price', 'dealScore', 'createdAt']).optional(),
});

export const getShopListingsOutputSchema = z.object({
  listings: z.array(z.record(z.string(), z.unknown())),
});
