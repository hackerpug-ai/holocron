import { createBuilder } from '@rocicorp/zero';
import { schema } from './schema';

const builder = createBuilder(schema);

/**
 * Builder-only queries: zero-cache can evaluate these server-side WITHOUT a
 * ZERO_QUERY_URL. The legacy named-query registry form requires a separate
 * zero-query-server process that is NOT deployed in the sprint substrate.
 *
 * Zero's `useQuery` accepts a plain `Query` directly, so no named-query
 * wrapper is required.
 */

/** Chat messages for a conversation (S-COLDBOOT-02 reference vertical). */
export const chatMessagesByConversation = (conversationId: string) =>
  builder.chat_messages.where('conversation_id', conversationId).orderBy('created_at', 'asc');

/**
 * All documents ordered by created_at desc (contract: documentsByOwner).
 * Owner scoping is enforced by zero-cache permissions / scoped key; the
 * documents table has no owner_id column in Postgres.
 */
export const documentsByOwner = () => builder.documents.orderBy('created_at', 'desc');

/** Optional category filter for the articles list. */
export const documentsByCategory = (category: string) =>
  builder.documents.where('category', category).orderBy('created_at', 'desc');

/** Single document by id (contract: documentById). */
export const documentById = (id: string) => builder.documents.where('id', id).one();

/** Also accept legacy Convex ids during soak (legacy_convex_id alias). */
export const documentByLegacyId = (legacyId: string) =>
  builder.documents.where('legacy_convex_id', legacyId).one();

/** Audio segments for a document (contract: audioSegmentsByDocument). */
export const audioSegmentsByDocument = (documentId: string) =>
  builder.audio_segments.where('document_id', documentId).orderBy('paragraph_index', 'asc');

/** Audio jobs for a document (contract: audioJobByDocument). */
export const audioJobByDocument = (documentId: string) =>
  builder.audio_jobs.where('document_id', documentId).orderBy('created_at', 'desc');

export { builder as zeroBuilder };
