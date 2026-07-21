import { z } from 'zod';

/**
 * Shared evidence-research mission output (pipes-1).
 * Registered in the mission registry as mission.research.output@1 — this
 * export keeps the tool/schema surface aligned with the template contract.
 */
export const evidenceResearchMissionOutputSchema = z
  .object({
    goal: z.string().min(1),
    assayInstanceId: z.string().min(1),
    challengeInstanceId: z.string().min(1),
    admitted: z.boolean(),
    direction: z.enum(['supporting', 'refuting', 'mixed', 'none']),
    coveredComponents: z.array(z.string()),
    missingComponents: z.array(z.string()),
    reason: z.string(),
    componentsCovered: z.number().int().nonnegative(),
    independentSourceCount: z.number().int().nonnegative(),
    admittedEvidenceIds: z.array(z.string()),
    rejectedEvidenceIds: z.array(z.string()),
    executorRef: z.literal('evidence-gate'),
    topic: z.string().optional(),
    instantiation: z
      .enum(['research', 'deepResearch', 'subscriptions-research', 'fulcrum'])
      .optional(),
  })
  .passthrough();

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
