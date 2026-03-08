/**
 * Retrieval tools - getting documents by ID or listing
 */

import { ConvexHttpClient } from 'convex/browser';
import { Document } from '../convex/types.js';

/**
 * Get a single document by ID
 */
export async function getDocument(
  client: ConvexHttpClient,
  args: {
    id: string;
  }
): Promise<Document | null> {
  const { id } = args;

  // Call Convex get query
  const document = (await client.query('documents/queries:get', {
    id,
  })) as Document | null;

  return document;
}

/**
 * List documents with optional filtering
 */
export async function listDocuments(
  client: ConvexHttpClient,
  args: {
    category?: string;
    limit?: number;
  }
): Promise<{ documents: Document[] }> {
  const { category, limit = 100 } = args;

  // Call Convex list query
  const documents = (await client.query('documents/queries:list', {
    category,
    limit,
  })) as Document[];

  return { documents };
}
