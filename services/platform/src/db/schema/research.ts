/**
 * research group — MERGE 5→3 via `system` discriminator (simple | deep).
 * Targets only: research_sessions, research_iterations, research_findings.
 * NEVER create deep_research_* shell tables.
 */

import { sql } from 'drizzle-orm';
import { check, doublePrecision, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import {
  createdAtColumn,
  hnswEmbeddingIndex,
  idColumn,
  legacyConvexIdColumn,
  legacyConvexIdIndex,
  searchVectorColumn,
  searchVectorGinIndex,
  timestamptz,
  typedJsonb,
  updatedAtColumn,
  vector,
  weightedSearchVectorSql,
} from '../columns';
import { lifecycleStatusValues, researchSystemValues, sqlInList } from '../enums';

export const researchSessions = pgTable(
  'research_sessions',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    /** system discriminator: simple | deep */
    system: text('system').notNull().default('simple'),
    query: text('query'),
    topic: text('topic'),
    researchType: text('research_type'),
    researchMode: text('research_mode'),
    inputType: text('input_type'),
    refinedTopic: text('refined_topic'),
    status: text('status').notNull().default('pending'),
    maxIterations: integer('max_iterations'),
    currentIteration: integer('current_iteration'),
    coverageScore: doublePrecision('coverage_score'),
    currentCoverageScore: doublePrecision('current_coverage_score'),
    /** Typed jsonb polymorphic plan */
    plan: typedJsonb('plan'),
    findings: typedJsonb('findings'),
    finalConfidenceSummary: typedJsonb('final_confidence_summary'),
    outputConfidenceFilter: typedJsonb('output_confidence_filter'),
    documentId: uuid('document_id'),
    conversationId: uuid('conversation_id'),
    taskId: uuid('task_id'),
    errorText: text('error_text'),
    errorReason: text('error_reason'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    completedAt: timestamptz('completed_at'),
  },
  (t) => [
    legacyConvexIdIndex('research_sessions', t.legacyConvexId),
    check(
      'research_sessions_system_check',
      sql`system IN (${sql.raw(sqlInList(researchSystemValues))})`
    ),
    check(
      'research_sessions_status_check',
      sql`status IN (${sql.raw(sqlInList(lifecycleStatusValues))})`
    ),
  ]
);

export const researchIterations = pgTable(
  'research_iterations',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    system: text('system').notNull().default('simple'),
    sessionId: uuid('session_id'),
    iterationNumber: integer('iteration_number'),
    status: text('status').notNull().default('pending'),
    findingsSummary: text('findings_summary'),
    summary: text('summary'),
    sources: typedJsonb('sources'),
    findings: typedJsonb('findings'),
    reviewScore: doublePrecision('review_score'),
    coverageScore: doublePrecision('coverage_score'),
    reviewFeedback: text('review_feedback'),
    feedback: text('feedback'),
    reviewGaps: typedJsonb('review_gaps'),
    refinedQueries: typedJsonb('refined_queries'),
    confidenceStats: typedJsonb('confidence_stats'),
    embedding: vector('embedding', { dimensions: 1024 }),
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('research_iterations', t.legacyConvexId),
    hnswEmbeddingIndex('research_iterations_embedding_hnsw', t.embedding),
    index('research_iterations_session_id_idx').on(t.sessionId),
    check(
      'research_iterations_system_check',
      sql`system IN (${sql.raw(sqlInList(researchSystemValues))})`
    ),
    check(
      'research_iterations_status_check',
      sql`status IN (${sql.raw(sqlInList(lifecycleStatusValues))})`
    ),
  ]
);

export const researchFindings = pgTable(
  'research_findings',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    system: text('system').notNull().default('deep'),
    sessionId: uuid('session_id'),
    iterationId: uuid('iteration_id'),
    claimText: text('claim_text'),
    claimCategory: text('claim_category'),
    sourceCredibilityScore: doublePrecision('source_credibility_score'),
    evidenceQualityScore: doublePrecision('evidence_quality_score'),
    corroborationScore: doublePrecision('corroboration_score'),
    recencyScore: doublePrecision('recency_score'),
    expertConsensusScore: doublePrecision('expert_consensus_score'),
    confidenceScore: doublePrecision('confidence_score'),
    confidenceLevel: text('confidence_level'),
    citationIds: typedJsonb('citation_ids'),
    confidenceFactors: typedJsonb('confidence_factors'),
    caveats: typedJsonb('caveats'),
    warnings: typedJsonb('warnings'),
    embedding: vector('embedding', { dimensions: 1024 }),
    createdAt: createdAtColumn(),
    searchVector: searchVectorColumn(weightedSearchVectorSql('claim_text')),
  },
  (t) => [
    legacyConvexIdIndex('research_findings', t.legacyConvexId),
    hnswEmbeddingIndex('research_findings_embedding_hnsw', t.embedding),
    index('research_findings_session_id_idx').on(t.sessionId),
    searchVectorGinIndex('research_findings_search_vector_gin', t.searchVector),
    check(
      'research_findings_system_check',
      sql`system IN (${sql.raw(sqlInList(researchSystemValues))})`
    ),
  ]
);
