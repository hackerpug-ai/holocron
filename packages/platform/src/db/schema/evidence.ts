/**
 * evidence-graph substrate (fulcrum ledger)
 * sources → passages → claims → entities → relations → beliefs
 * Vectors live on passages (not documents) for Zero publication split.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
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
  vector,
  weightedSearchVectorSql,
} from '../columns';
import { relationTypeValues, sourceKindValues, sqlInList } from '../enums';

/** claims.status — admission lifecycle (CHECK claims_status_check, migration 0041). */
export const claimStatusValues = ['admitted', 'provisional', 'contested', 'refuted'] as const;

/** claims.polarity — evidence stance (CHECK claims_polarity_check, migration 0041). */
export const claimPolarityValues = ['support', 'refute'] as const;

export const sources = pgTable(
  'sources',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    sourceKind: text('source_kind').notNull().default('other'),
    documentId: text('document_id'),
    /** Exact dedup key */
    contentHash: text('content_hash'),
    title: text('title'),
    url: text('url'),
    metadataJson: typedJsonb('metadata_json'),
    // Fulcrum fetch artifact (written at retrieve time; not an RRF snippet).
    // A claim's quote_text MUST be an exact substring of normalized_text.
    normalizedText: text('normalized_text'),
    retrievedAt: timestamptz('retrieved_at'),
    sourceDomain: text('source_domain'),
    provenanceGroup: text('provenance_group'),
    selfSourced: boolean('self_sourced').notNull().default(false),
    createdAt: createdAtColumn(),
    searchVector: searchVectorColumn(weightedSearchVectorSql('title', 'url')),
  },
  (t) => [
    legacyConvexIdIndex('sources', t.legacyConvexId),
    uniqueIndex('sources_content_hash_uidx').on(t.contentHash),
    index('sources_document_id_idx').on(t.documentId),
    searchVectorGinIndex('sources_search_vector_gin', t.searchVector),
    check('sources_kind_check', sql`source_kind IN (${sql.raw(sqlInList(sourceKindValues))})`),
  ]
);

export const passages = pgTable(
  'passages',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    sourceId: text('source_id').notNull(),
    documentId: text('document_id'),
    ordinal: integer('ordinal').default(0),
    text: text('text').notNull(),
    tokenCount: integer('token_count'),
    situatingHeader: text('situating_header'),
    /** Qwen3-Embedding vector(1024); HNSW cosine */
    embedding: vector('embedding', { dimensions: 1024 }),
    metadataJson: typedJsonb('metadata_json'),
    createdAt: createdAtColumn(),
    searchVector: searchVectorColumn(weightedSearchVectorSql('text', 'situating_header')),
  },
  (t) => [
    legacyConvexIdIndex('passages', t.legacyConvexId),
    hnswEmbeddingIndex('passages_embedding_hnsw', t.embedding),
    index('passages_source_id_idx').on(t.sourceId),
    index('passages_document_id_idx').on(t.documentId),
    searchVectorGinIndex('passages_search_vector_gin', t.searchVector),
  ]
);

export const claims = pgTable(
  'claims',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    sourceId: text('source_id'),
    passageId: text('passage_id'),
    claimText: text('claim_text').notNull(),
    claimCategory: text('claim_category'),
    confidence: doublePrecision('confidence'),
    metadataJson: typedJsonb('metadata_json'),
    // Fulcrum admission columns (additive; migration 0041).
    candidateId: text('candidate_id'),
    component: text('component'),
    polarity: text('polarity'),
    status: text('status').notNull().default('provisional'),
    quoteText: text('quote_text'),
    passesGate: boolean('passes_gate'),
    qualifyingGrade: doublePrecision('qualifying_grade'),
    targetClaimId: text('target_claim_id'),
    createdAt: createdAtColumn(),
    searchVector: searchVectorColumn(weightedSearchVectorSql('claim_text')),
  },
  (t) => [
    legacyConvexIdIndex('claims', t.legacyConvexId),
    index('claims_source_id_idx').on(t.sourceId),
    index('claims_passage_id_idx').on(t.passageId),
    searchVectorGinIndex('claims_search_vector_gin', t.searchVector),
    check('claims_status_check', sql`status IN (${sql.raw(sqlInList(claimStatusValues))})`),
    check('claims_polarity_check', sql`polarity IN (${sql.raw(sqlInList(claimPolarityValues))})`),
  ]
);

export const entities = pgTable(
  'entities',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    entityType: text('entity_type'),
    name: text('name').notNull(),
    canonicalName: text('canonical_name'),
    metadataJson: typedJsonb('metadata_json'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('entities', t.legacyConvexId)]
);

export const relations = pgTable(
  'relations',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    relationType: text('relation_type').notNull(),
    subjectId: text('subject_id').notNull(),
    subjectKind: text('subject_kind'),
    objectId: text('object_id').notNull(),
    objectKind: text('object_kind'),
    /** Bi-temporal: world-truth window */
    validFrom: timestamptz('valid_from'),
    validTo: timestamptz('valid_to'),
    /** Bi-temporal: system-knowledge window (current = tx_to IS NULL) */
    txFrom: timestamptz('tx_from').default(sql`now()`),
    txTo: timestamptz('tx_to'),
    confidence: doublePrecision('confidence'),
    metadataJson: typedJsonb('metadata_json'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('relations', t.legacyConvexId),
    index('relations_current_idx')
      .on(t.relationType, t.subjectId, t.objectId)
      .where(sql`${t.txTo} IS NULL`),
    check(
      'relations_type_check',
      sql`relation_type IN (${sql.raw(sqlInList(relationTypeValues))})`
    ),
  ]
);

export const beliefs = pgTable(
  'beliefs',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    claimId: text('claim_id'),
    statement: text('statement').notNull(),
    confidence: doublePrecision('confidence'),
    /** Supersession chain */
    supersedesId: text('supersedes_id'),
    validFrom: timestamptz('valid_from'),
    validTo: timestamptz('valid_to'),
    txFrom: timestamptz('tx_from').default(sql`now()`),
    txTo: timestamptz('tx_to'),
    actor: text('actor'),
    runId: text('run_id'),
    idempotencyKey: text('idempotency_key'),
    metadataJson: typedJsonb('metadata_json'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('beliefs', t.legacyConvexId),
    index('beliefs_current_idx').on(t.claimId).where(sql`${t.txTo} IS NULL`),
  ]
);
