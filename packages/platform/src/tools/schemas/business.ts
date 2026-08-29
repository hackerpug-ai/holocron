/**
 * Business-report tool / mission schemas (Sprint 22 / pipes-2).
 *
 * One parameterized template covers four report kinds. Output shapes mirror
 * the former Convex revenue-validation / competitive / ai-roi / flights reports.
 */
import { z } from 'zod';

export const BUSINESS_REPORT_KINDS = [
  'revenue-validation',
  'competitive',
  'ai-roi',
  'flights',
] as const;

export type BusinessReportKind = (typeof BUSINESS_REPORT_KINDS)[number];

export const BusinessReportKindSchema = z.enum(BUSINESS_REPORT_KINDS);

/** Required component keys per report kind (validated before reasoning). */
export const REQUIRED_COMPONENTS_BY_KIND: Record<BusinessReportKind, readonly string[]> = {
  'revenue-validation': ['market_sizing', 'competitive_positioning', 'unit_economics', 'dvf'],
  competitive: ['competitor_matrix', 'market_snapshot'],
  'ai-roi': ['opportunities', 'roi_summary'],
  flights: ['route', 'price_calendar'],
};

export const MarketSizingSchema = z
  .object({
    tam: z.number().positive(),
    sam: z.number().positive(),
    som: z.number().positive(),
    currency: z.string().min(1).default('USD'),
    notes: z.string().optional(),
  })
  .strict();

export const CompetitivePositioningEntrySchema = z
  .object({
    name: z.string().min(1),
    pricing: z.string().optional(),
    differentiator: z.string().optional(),
    url: z.string().optional(),
  })
  .strict();

export const UnitEconomicsScenarioSchema = z
  .object({
    ltv: z.number().nonnegative().optional(),
    cac: z.number().nonnegative().optional(),
    ltvCacRatio: z.number().nonnegative().optional(),
    paybackMonths: z.number().nonnegative().optional(),
  })
  .strict();

export const UnitEconomicsSchema = z
  .object({
    base: UnitEconomicsScenarioSchema.optional(),
    bull: UnitEconomicsScenarioSchema.optional(),
    bear: UnitEconomicsScenarioSchema.optional(),
  })
  .strict();

export const CompetitorMatrixEntrySchema = z
  .object({
    name: z.string().min(1),
    focus: z.string().optional(),
    pricing: z.string().optional(),
    strength: z.string().optional(),
  })
  .strict();

export const AiRoiOpportunitySchema = z
  .object({
    name: z.string().min(1),
    expectedRoi: z.number(),
    priority: z.enum(['HIGH', 'MEDIUM', 'LOW', 'DROPPED']),
    rationale: z.string().optional(),
  })
  .strict();

export const FlightRouteSchema = z
  .object({
    origin: z.string().min(1),
    destination: z.string().min(1),
    route: z.string().min(1),
  })
  .strict();

export const FlightPriceCalendarEntrySchema = z
  .object({
    date: z.string().min(1),
    price: z.number().nonnegative(),
    currency: z.string().min(1).default('USD'),
  })
  .strict();

export const BusinessReportComponentsSchema = z
  .object({
    marketSizing: MarketSizingSchema.optional(),
    competitivePositioning: z.array(CompetitivePositioningEntrySchema).optional(),
    unitEconomics: UnitEconomicsSchema.optional(),
    competitorMatrix: z.array(CompetitorMatrixEntrySchema).optional(),
    marketSnapshot: z.string().optional(),
    opportunities: z.array(AiRoiOpportunitySchema).optional(),
    roiSummary: z.string().optional(),
    route: FlightRouteSchema.optional(),
    priceCalendar: z.array(FlightPriceCalendarEntrySchema).optional(),
    dvf: z
      .object({
        desirability: z.number().min(0).max(10),
        viability: z.number().min(0).max(10),
        feasibility: z.number().min(0).max(10),
        total: z.number().min(0).max(100),
      })
      .strict()
      .optional(),
  })
  .strict();

export const BusinessReportOutputSchema = z
  .object({
    reportKind: BusinessReportKindSchema,
    target: z.string().min(1),
    destination: z.string().optional(),
    templateKey: z.literal('business-report'),
    verdict: z.enum(['GO', 'CAUTION', 'NO-GO']).optional(),
    dvfScore: z.number().min(0).max(100).optional(),
    marketSizing: MarketSizingSchema.optional(),
    competitivePositioning: z.array(CompetitivePositioningEntrySchema).optional(),
    unitEconomics: UnitEconomicsSchema.optional(),
    competitorMatrix: z.array(CompetitorMatrixEntrySchema).optional(),
    marketSnapshot: z.string().optional(),
    opportunities: z.array(AiRoiOpportunitySchema).optional(),
    roiSummary: z.string().optional(),
    route: FlightRouteSchema.optional(),
    priceCalendar: z.array(FlightPriceCalendarEntrySchema).optional(),
    sections: z.array(
      z
        .object({
          id: z.string().min(1),
          title: z.string().min(1),
          body: z.string().min(1),
        })
        .strict()
    ),
    recommendations: z.array(z.string().min(1)),
    evidence: z.array(
      z
        .object({
          claim: z.string().min(1),
          tier: z.number().int().min(1).max(5).optional(),
          source: z.string().optional(),
        })
        .strict()
    ),
    assayText: z.string().min(1),
    challengeText: z.string().min(1),
    assayInstanceId: z.string().min(1),
    challengeInstanceId: z.string().min(1),
    reasoningProvider: z.literal('fleet'),
    fleetManifestVersion: z.string().min(1),
  })
  .strict();

export type BusinessReportOutput = z.infer<typeof BusinessReportOutputSchema>;
export type BusinessReportComponents = z.infer<typeof BusinessReportComponentsSchema>;

/** Mission-stage context that accumulates through the business-report pipeline. */
export const BusinessReportContextSchema = z
  .object({
    goal: z.string().min(1),
    reportKind: BusinessReportKindSchema,
    target: z.string().min(1),
    destination: z.string().optional(),
    role: z.string().min(1).optional(),
    endpoint: z.string().optional(),
    litellmModelId: z.string().optional(),
    modelRevision: z.string().optional(),
    fleetManifestVersion: z.string().optional(),
    components: BusinessReportComponentsSchema,
    missingComponents: z.array(z.string()),
    checkpointKey: z.string().optional(),
    assayText: z.string().optional(),
    challengeText: z.string().optional(),
    assayInstanceId: z.string().optional(),
    challengeInstanceId: z.string().optional(),
    draft: BusinessReportOutputSchema.partial().optional(),
  })
  .strict();

export type BusinessReportContext = z.infer<typeof BusinessReportContextSchema>;
