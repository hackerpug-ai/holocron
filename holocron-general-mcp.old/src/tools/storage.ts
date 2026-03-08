/**
 * Storage tools - creating and updating documents
 */

import { ConvexHttpClient } from 'convex/browser';
import { Document } from '../convex/types.js';

/**
 * Store a new document
 */
export async function storeDocument(
  client: ConvexHttpClient,
  args: {
    title: string;
    content: string;
    category: string;
    filePath?: string;
    fileType?: string;
    status?: string;
    date?: string;
    time?: string;
    researchType?: string;
    iterations?: number;
    embedding?: number[];
  }
): Promise<{ documentId: string }> {
  // Call Convex create mutation
  const documentId = (await client.mutation('documents/mutations:create', {
    ...args,
  })) as string;

  return { documentId };
}

/**
 * Update an existing document
 */
export async function updateDocument(
  client: ConvexHttpClient,
  args: {
    id: string;
    title?: string;
    content?: string;
    category?: string;
    filePath?: string;
    fileType?: string;
    status?: string;
    date?: string;
    time?: string;
    researchType?: string;
    iterations?: number;
    embedding?: number[];
  }
): Promise<Document | null> {
  const { id, ...updates } = args;

  // Call Convex update mutation
  const updated = (await client.mutation('documents/mutations:update', {
    id,
    ...updates,
  })) as Document | null;

  return updated;
}
