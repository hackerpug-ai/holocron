/**
 * Central registration file for documents functions
 * This file ensures all documents functions are deployed by importing them
 */

// Import all documents mutations to ensure deployment
export {
  appendText,
  clearAll,
  create,
  insertFromMigration,
  publishDocument,
  remove,
  unpublishDocument,
  update,
} from './documents/mutations';
// Import all documents queries to ensure deployment
export {
  count,
  countByCategory,
  countDocumentsWithoutEmbeddings,
  countWithFilter,
  findDocumentsWithoutEmbeddings,
  fullTextSearch,
  get,
  getByShareToken,
  getSampleWithEmbedding,
  getSection,
  list,
  vectorSearch,
} from './documents/queries';
// Import documents scheduled functions to ensure deployment
export { backfillOrphanedEmbeddings } from './documents/scheduled';
// Import documents actions to ensure deployment
export { hybridSearch } from './documents/search';
// Import documents storage actions to ensure deployment
export {
  createWithEmbedding,
  updateWithEmbedding,
} from './documents/storage';
