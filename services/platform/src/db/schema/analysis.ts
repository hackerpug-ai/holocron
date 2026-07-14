/**
 * analysis group — MERGE 12→3 via type/kind discriminators + payload jsonb.
 * Targets only: analysis_sessions, analysis_items, analysis_evidence.
 * NEVER create revenue_validation_* / competitive_analysis_* / ai_roi_* / flights_* shells.
 */

import { sql } from 'drizzle-orm';
import { check, doublePrecision, integer, pgTable, text } from 'drizzle-orm/pg-core';
import {
  createdAtColumn,
  idColumn,
  legacyConvexIdColumn,
  legacyConvexIdIndex,
  timestamptz,
  typedJsonb,
  updatedAtColumn,
} from '../columns';
import {
  analysisEvidenceKindValues,
  analysisItemKindValues,
  analysisSessionTypeValues,
  lifecycleStatusValues,
  sqlInList,
} from '../enums';

export const analysisSessions = pgTable(
  'analysis_sessions',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    /** type discriminator: revenue_validation | competitive_analysis | ai_roi | flights */
    type: text('type').notNull(),
    status: text('status').notNull().default('pending'),
    productName: text('product_name'),
    company: text('company'),
    market: text('market'),
    codebaseUrl: text('codebase_url'),
    documentId: text('document_id'),
    desirabilityScore: doublePrecision('desirability_score'),
    viabilityScore: doublePrecision('viability_score'),
    feasibilityScore: doublePrecision('feasibility_score'),
    totalScore: doublePrecision('total_score'),
    verdict: text('verdict'),
    confidenceLevel: text('confidence_level'),
    agentCount: integer('agent_count'),
    sourceCount: integer('source_count'),
    errorReason: text('error_reason'),
    /** Domain-specific sparse fields (tam/sam/som, porters, flight params, …) */
    payload: typedJsonb<Record<string, unknown>>('payload'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    completedAt: timestamptz('completed_at'),
  },
  (t) => [
    legacyConvexIdIndex('analysis_sessions', t.legacyConvexId),
    check(
      'analysis_sessions_type_check',
      sql`type IN (${sql.raw(sqlInList(analysisSessionTypeValues))})`
    ),
    check(
      'analysis_sessions_status_check',
      sql`status IN (${sql.raw(sqlInList(lifecycleStatusValues))})`
    ),
  ]
);

export const analysisItems = pgTable(
  'analysis_items',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    sessionId: text('session_id'),
    /** kind discriminator */
    kind: text('kind').notNull(),
    name: text('name'),
    rank: integer('rank'),
    confidence: doublePrecision('confidence'),
    url: text('url'),
    /** Domain-specific sparse fields */
    payload: typedJsonb<Record<string, unknown>>('payload'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('analysis_items', t.legacyConvexId),
    check(
      'analysis_items_kind_check',
      sql`kind IN (${sql.raw(sqlInList(analysisItemKindValues))})`
    ),
  ]
);

export const analysisEvidence = pgTable(
  'analysis_evidence',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    sessionId: text('session_id'),
    kind: text('kind').notNull(),
    claim: text('claim'),
    tier: text('tier'),
    sourceTitle: text('source_title'),
    sourceUrl: text('source_url'),
    dimension: text('dimension'),
    challengeStatus: text('challenge_status'),
    opportunityId: text('opportunity_id'),
    source: text('source'),
    payload: typedJsonb<Record<string, unknown>>('payload'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('analysis_evidence', t.legacyConvexId),
    check(
      'analysis_evidence_kind_check',
      sql`kind IN (${sql.raw(sqlInList(analysisEvidenceKindValues))})`
    ),
  ]
);
