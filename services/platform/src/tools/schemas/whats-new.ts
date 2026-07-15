import { z } from 'zod';

export const getWhatsNewReportInputSchema = z.object({
  forceRefresh: z.boolean().optional(),
});

export const getWhatsNewReportOutputSchema = z
  .object({
    content: z.string().optional(),
    generatedAt: z.number().optional(),
    isFromToday: z.boolean().optional(),
    stats: z.record(z.string(), z.unknown()).optional(),
    report: z.record(z.string(), z.unknown()).optional(),
  })
  .nullable();

export const listWhatsNewReportsInputSchema = z.object({
  limit: z.number().int().positive().optional(),
});

export const listWhatsNewReportsOutputSchema = z.array(z.record(z.string(), z.unknown()));
