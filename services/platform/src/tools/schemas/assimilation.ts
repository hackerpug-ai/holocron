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
    _id: z.string().optional(),
    status: z.string(),
    profile: z.string().optional(),
    repositoryName: z.string().optional(),
    repositoryUrl: z.string().optional(),
    currentIteration: z.number().optional(),
    maxIterations: z.number().optional(),
    dimensionScores: z.record(z.string(), z.unknown()).optional(),
    estimatedCostUsd: z.number().optional(),
    planSummary: z.string().optional(),
    planContent: z.string().optional(),
    documentId: z.string().optional(),
    errorReason: z.string().optional(),
    createdAt: z.number().optional(),
    completedAt: z.number().optional(),
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
