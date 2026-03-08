/**
 * Type imports from holocron Convex deployment
 * These types mirror the schema defined in holocron/convex/schema.ts
 */

import { Id } from 'convex/values';

/**
 * Document type from holocron documents table
 */
export interface Document {
  _id: Id<'documents'>;
  _creationTime: number;
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
  embedding?: number[]; // 1536 dimensions
  createdAt: number;
}

/**
 * Search result with score
 */
export interface SearchResult extends Omit<Document, 'embedding'> {
  score: number;
  embedding?: number[];
}
