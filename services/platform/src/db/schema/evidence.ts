/**
 * evidence-graph substrate (fulcrum ledger)
 * sources → passages → claims → entities → relations → beliefs
 * Vectors live on passages (not documents) for Zero publication split.
 */

import { sql } from 'drizzle-orm';
import { check, doublePrecision, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import {
  createdAtColumn,
  idColumn,
  legacyConvexIdColumn,
  legacyConvexIdIndex,
  timestamptz,
  typedJsonb,
  vector,
} from '../columns';
import { relationTypeValues, sourceKindValues, sqlInList } from '../enums';

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
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('sources', t.legacyConvexId),
    uniqueIndex('sources_content_hash_uidx').on(t.contentHash),
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
    /** Qwen3-Embedding vector(1024); HNSW in schema-3 */
    embedding: vector('embedding', { dimensions: 1024 }),
    metadataJson: typedJsonb('metadata_json'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('passages', t.legacyConvexId)]
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
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('claims', t.legacyConvexId)]
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
  (t) => [legacyConvexIdIndex('beliefs', t.legacyConvexId)]
);
