/**
 * Shared status / discriminator vocabularies.
 * Postgres CHECK constraints + Zod enums stay in lockstep.
 */
import { z } from 'zod';

/** Canonical lifecycle status (normalized: in-progress → in_progress). */
export const lifecycleStatusValues = [
  'pending',
  'planning',
  'pending_approval',
  'rejected',
  'queued',
  'in_progress',
  'running',
  'completed',
  'failed',
  'cancelled',
  'canceled',
  'paused',
  'draft',
  'active',
  'archived',
  'superseded',
] as const;

export const LifecycleStatusSchema = z.enum(lifecycleStatusValues);
export type LifecycleStatus = z.infer<typeof LifecycleStatusSchema>;

/** Task / plan / tool-call status. */
export const workStatusValues = [
  'pending',
  'in_progress',
  'running',
  'completed',
  'failed',
  'cancelled',
  'canceled',
  'awaiting_approval',
  'approved',
  'rejected',
  'skipped',
] as const;

export const WorkStatusSchema = z.enum(workStatusValues);
export type WorkStatus = z.infer<typeof WorkStatusSchema>;

/** Document pipeline status. */
export const documentStatusValues = [
  'draft',
  'pending',
  'processing',
  'in_progress',
  'ready',
  'published',
  'failed',
  'archived',
] as const;

export const DocumentStatusSchema = z.enum(documentStatusValues);
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

/** Analysis session type discriminator (business 12→3). */
export const analysisSessionTypeValues = [
  'revenue_validation',
  'competitive_analysis',
  'ai_roi',
  'flights',
] as const;

export const AnalysisSessionTypeSchema = z.enum(analysisSessionTypeValues);
export type AnalysisSessionType = z.infer<typeof AnalysisSessionTypeSchema>;

/** Analysis item kind discriminator. */
export const analysisItemKindValues = [
  'revenue_validation_competitor',
  'competitive_analysis_competitor',
  'competitive_analysis_feature',
  'ai_roi_opportunity',
  'flights_route',
  'flights_price_calendar',
] as const;

export const AnalysisItemKindSchema = z.enum(analysisItemKindValues);
export type AnalysisItemKind = z.infer<typeof AnalysisItemKindSchema>;

/** Analysis evidence kind discriminator. */
export const analysisEvidenceKindValues = ['revenue_validation', 'ai_roi'] as const;

export const AnalysisEvidenceKindSchema = z.enum(analysisEvidenceKindValues);
export type AnalysisEvidenceKind = z.infer<typeof AnalysisEvidenceKindSchema>;

/** Research system discriminator (smart/simple vs deep). */
export const researchSystemValues = ['simple', 'deep'] as const;

export const ResearchSystemSchema = z.enum(researchSystemValues);
export type ResearchSystem = z.infer<typeof ResearchSystemSchema>;

/** Evidence relation types (bi-temporal edge table). */
export const relationTypeValues = [
  'supports',
  'contradicts',
  'refines',
  'derived_from',
  'about',
] as const;

export const RelationTypeSchema = z.enum(relationTypeValues);
export type RelationType = z.infer<typeof RelationTypeSchema>;

/** Source kinds for the canonical corpus. */
export const sourceKindValues = [
  'self_sourced',
  'web',
  'document',
  'subscription',
  'import',
  'other',
] as const;

export const SourceKindSchema = z.enum(sourceKindValues);
export type SourceKind = z.infer<typeof SourceKindSchema>;

/** SQL fragment for IN (...) CHECK lists. */
export function sqlInList(values: readonly string[]): string {
  return values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
}
