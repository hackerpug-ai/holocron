import { z } from 'zod';

export const startAssimilationInputSchema = z.object({
  repositoryUrl: z.string().min(1),
  profile: z.enum(['fast', 'standard', 'thorough']).optional(),
  autoApprove: z.boolean().optional(),
});

export const startAssimilationOutputSchema = z.object({
  sessionId: z.string(),
  status: z.string(),
  existing: z.boolean().optional(),
  verdict: z.enum(['COMPLETE', 'PARTIAL']).optional(),
  documentId: z.string().optional(),
  markdown: z.string().optional(),
});

export const assimilationSessionIdInputSchema = z.object({
  sessionId: z.string().min(1),
});

export const approveAssimilationPlanOutputSchema = z.object({
  approved: z.boolean(),
  sessionId: z.string(),
});

export const rejectAssimilationPlanInputSchema = z.object({
  sessionId: z.string().min(1),
  feedback: z.string().optional(),
});

export const rejectAssimilationPlanOutputSchema = z.object({
  rejected: z.boolean(),
  sessionId: z.string(),
  replanning: z.boolean().optional(),
});

export const getAssimilationStatusOutputSchema = z
  .object({
    _id: z.string().nullish(),
    status: z.string(),
    profile: z.string().nullish(),
    repositoryName: z.string().nullish(),
    repositoryUrl: z.string().nullish(),
    currentIteration: z.number().nullish(),
    maxIterations: z.number().nullish(),
    dimensionScores: z.record(z.string(), z.unknown()).nullish(),
    estimatedCostUsd: z.number().nullish(),
    planSummary: z.string().nullish(),
    planContent: z.string().nullish(),
    documentId: z.string().nullish(),
    errorReason: z.string().nullish(),
    createdAt: z.number().nullish(),
    completedAt: z.number().nullish(),
  })
  .nullable();

export const cancelAssimilationOutputSchema = z.object({
  cancelled: z.boolean(),
  sessionId: z.string(),
});

export const steerAssimilationInputSchema = z.object({
  sessionId: z.string().min(1),
  note: z.string().min(1),
});

export const steerAssimilationOutputSchema = z.object({
  steered: z.boolean(),
  sessionId: z.string(),
});
