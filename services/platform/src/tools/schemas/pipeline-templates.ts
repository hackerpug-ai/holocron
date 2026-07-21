/**
 * Sprint 22 / pipes-3 — output schemas for whatsnew / assimilate / shop / subscriptions
 * mission templates. Shapes match former Convex pipeline outputs.
 */
import { z } from 'zod';

// ── whatsNew / daily-briefing ──────────────────────────────────────────────

export const WhatsNewHeadlineSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1).optional(),
    url: z.string().min(1),
    source: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
  })
  .strict();
export type WhatsNewHeadline = z.infer<typeof WhatsNewHeadlineSchema>;

export const WhatsNewSummarySchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
  })
  .strict();
export type WhatsNewSummary = z.infer<typeof WhatsNewSummarySchema>;

export const WhatsNewOutputSchema = z
  .object({
    documentType: z.literal('daily-briefing'),
    date: z.string().min(1),
    headlines: z.array(WhatsNewHeadlineSchema).min(1),
    summaries: z.array(WhatsNewSummarySchema).min(1),
    links: z.array(z.string().min(1)).min(1),
    templateKey: z.literal('whatsnew'),
    goal: z.string().min(1),
    fleetManifestVersion: z.string().min(1).optional(),
  })
  .strict();

export type WhatsNewOutput = z.infer<typeof WhatsNewOutputSchema>;

export const WhatsNewContextSchema = z
  .object({
    goal: z.string().min(1),
    date: z.string().min(1),
    role: z.string().min(1).optional(),
    endpoint: z.string().min(1).optional(),
    litellmModelId: z.string().min(1).optional(),
    modelRevision: z.string().min(1).optional(),
    fleetManifestVersion: z.string().min(1).optional(),
    headlines: z.array(WhatsNewHeadlineSchema).optional(),
    summaries: z.array(WhatsNewSummarySchema).optional(),
    links: z.array(z.string().min(1)).optional(),
    assayText: z.string().optional(),
  })
  .strict();

export type WhatsNewContext = z.infer<typeof WhatsNewContextSchema>;

// ── assimilate ─────────────────────────────────────────────────────────────

export const AssimilateArchitectureComponentSchema = z
  .object({
    name: z.string().min(1),
    path: z.string().min(1).optional(),
    responsibility: z.string().min(1).optional(),
  })
  .strict();

export const AssimilateArchitectureSchema = z
  .object({
    overview: z.string().min(1),
    components: z.array(AssimilateArchitectureComponentSchema).min(1),
  })
  .strict();
export type AssimilateArchitecture = z.infer<typeof AssimilateArchitectureSchema>;

export const AssimilatePatternSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    examples: z.array(z.string()).optional(),
  })
  .strict();
export type AssimilatePattern = z.infer<typeof AssimilatePatternSchema>;

export const AssimilateEvaluationSchema = z
  .object({
    architecture: z.number().min(1).max(5),
    patterns: z.number().min(1).max(5),
    documentation: z.number().min(1).max(5).optional(),
    testing: z.number().min(1).max(5).optional(),
    notes: z.string().optional(),
  })
  .strict();
export type AssimilateEvaluation = z.infer<typeof AssimilateEvaluationSchema>;

export const AssimilateOutputSchema = z
  .object({
    repoUrl: z.string().min(1),
    architecture: AssimilateArchitectureSchema,
    patterns: z.array(AssimilatePatternSchema).min(1),
    evaluation: AssimilateEvaluationSchema,
    templateKey: z.literal('assimilate'),
    goal: z.string().min(1),
    fleetManifestVersion: z.string().min(1).optional(),
  })
  .strict();

export type AssimilateOutput = z.infer<typeof AssimilateOutputSchema>;

export const AssimilateContextSchema = z
  .object({
    goal: z.string().min(1),
    repoUrl: z.string().min(1),
    role: z.string().min(1).optional(),
    endpoint: z.string().min(1).optional(),
    litellmModelId: z.string().min(1).optional(),
    modelRevision: z.string().min(1).optional(),
    fleetManifestVersion: z.string().min(1).optional(),
    architecture: AssimilateArchitectureSchema.optional(),
    patterns: z.array(AssimilatePatternSchema).optional(),
    evaluation: AssimilateEvaluationSchema.optional(),
    assayText: z.string().optional(),
  })
  .strict();

export type AssimilateContext = z.infer<typeof AssimilateContextSchema>;

// ── shop ───────────────────────────────────────────────────────────────────

export const ShopProductSchema = z
  .object({
    title: z.string().min(1),
    price: z.number(),
    currency: z.string().min(1).default('USD'),
    rating: z.number().min(0).max(5),
    url: z.string().min(1),
    retailer: z.string().min(1).optional(),
    condition: z.string().optional(),
  })
  .strict();
export type ShopProduct = z.infer<typeof ShopProductSchema>;

export const ShopOutputSchema = z
  .object({
    query: z.string().min(1),
    products: z.array(ShopProductSchema).min(1),
    templateKey: z.literal('shop'),
    goal: z.string().min(1),
    fleetManifestVersion: z.string().min(1).optional(),
  })
  .strict();

export type ShopOutput = z.infer<typeof ShopOutputSchema>;

export const ShopContextSchema = z
  .object({
    goal: z.string().min(1),
    query: z.string().min(1),
    role: z.string().min(1).optional(),
    endpoint: z.string().min(1).optional(),
    litellmModelId: z.string().min(1).optional(),
    modelRevision: z.string().min(1).optional(),
    fleetManifestVersion: z.string().min(1).optional(),
    products: z.array(ShopProductSchema).optional(),
    assayText: z.string().optional(),
  })
  .strict();

export type ShopContext = z.infer<typeof ShopContextSchema>;

// ── subscriptions ──────────────────────────────────────────────────────────

export const SubscriptionsOutputSchema = z
  .object({
    templateKey: z.literal('subscriptions'),
    goal: z.string().min(1),
    documentId: z.string().uuid(),
    sourceRunId: z.string().uuid(),
    publishedAt: z.string().min(1),
    subworkflowCalls: z.array(z.string().min(1)).min(1),
    researchRunId: z.string().uuid().optional(),
    researchAdmitted: z.boolean().optional(),
    topic: z.string().optional(),
    fleetManifestVersion: z.string().min(1).optional(),
  })
  .strict();

export type SubscriptionsOutput = z.infer<typeof SubscriptionsOutputSchema>;

export const SubscriptionsContextSchema = z
  .object({
    goal: z.string().min(1),
    topic: z.string().min(1).optional(),
    role: z.string().min(1).optional(),
    endpoint: z.string().min(1).optional(),
    litellmModelId: z.string().min(1).optional(),
    modelRevision: z.string().min(1).optional(),
    fleetManifestVersion: z.string().min(1).optional(),
    subworkflowCalls: z.array(z.string().min(1)).optional(),
    researchRunId: z.string().uuid().optional(),
    researchOutput: z.record(z.string(), z.unknown()).optional(),
    researchAdmitted: z.boolean().optional(),
    documentId: z.string().uuid().optional(),
    publishedAt: z.string().optional(),
    sourceRunId: z.string().uuid().optional(),
  })
  .strict();

export type SubscriptionsContext = z.infer<typeof SubscriptionsContextSchema>;
