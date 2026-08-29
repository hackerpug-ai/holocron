/**
 * documents group — documents (vector-free), imports, citations
 * Vectors live on passages (Zero publication split cleanliness).
 * FTS via generated search_vector + GIN (schema-3).
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  createdAtColumn,
  idColumn,
  legacyConvexIdColumn,
  legacyConvexIdIndex,
  searchVectorColumn,
  searchVectorGinIndex,
  timestamptz,
  typedJsonb,
  weightedSearchVectorSql,
} from '../columns';
import { documentStatusValues, sqlInList } from '../enums';

export const documents = pgTable(
  'documents',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    title: text('title'),
    content: text('content'),
    category: text('category'),
    filePath: text('file_path'),
    fileType: text('file_type'),
    status: text('status').notNull().default('draft'),
    date: text('date'),
    time: text('time'),
    researchType: text('research_type'),
    iterations: integer('iterations'),
    // NOTE: embedding intentionally omitted — vectors live on passages (Zero split).
    isPublic: boolean('is_public').default(false),
    shareToken: text('share_token'),
    /** pipes-3: mission run that published this document (idempotent standing publish). */
    sourceRunId: uuid('source_run_id'),
    publishedAt: timestamptz('published_at'),
    publishIdempotencyKey: text('publish_idempotency_key'),
    createdAt: createdAtColumn(),
    searchVector: searchVectorColumn(weightedSearchVectorSql('title', 'content')),
  },
  (t) => [
    legacyConvexIdIndex('documents', t.legacyConvexId),
    index('documents_status_idx').on(t.status),
    index('documents_category_idx').on(t.category),
    index('documents_source_run_id_idx').on(t.sourceRunId),
    searchVectorGinIndex('documents_search_vector_gin', t.searchVector),
    check('documents_status_check', sql`status IN (${sql.raw(sqlInList(documentStatusValues))})`),
  ]
);

export const documentAssets = pgTable(
  'document_assets',
  {
    documentId: text('document_id').notNull(),
    fileObjectId: text('file_object_id').notNull(),
    createdAt: createdAtColumn(),
  },
  (t) => [
    primaryKey({ columns: [t.documentId, t.fileObjectId] }),
    index('document_assets_file_object_idx').on(t.fileObjectId),
  ]
);

export const imports = pgTable(
  'imports',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    documentId: uuid('document_id'),
    source: text('source'),
    text: text('text'),
    importedAt: timestamptz('imported_at'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('imports', t.legacyConvexId)]
);

export const citations = pgTable(
  'citations',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    sessionId: uuid('session_id'),
    documentId: uuid('document_id'),
    deepResearchSessionId: uuid('deep_research_session_id'),
    sourceUrl: text('source_url'),
    sourceTitle: text('source_title'),
    sourceDomain: text('source_domain'),
    claimText: text('claim_text'),
    claimMarker: text('claim_marker'),
    sourceType: text('source_type'),
    credibilityScore: integer('credibility_score'),
    evidenceType: text('evidence_type'),
    publishedDate: text('published_date'),
    authorCredentials: text('author_credentials'),
    retrievedAt: timestamptz('retrieved_at'),
    metadataJson: typedJsonb('metadata_json'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('citations', t.legacyConvexId)]
);
