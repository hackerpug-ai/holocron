/**
 * Central registration file for documents functions
 * This file ensures all documents functions are deployed by importing them
 */

// Import all documents queries to ensure deployment
export {
  get,
  list,
  count,
  countWithFilter,
  getSampleWithEmbedding,
  countByCategory,
  vectorSearch,
  fullTextSearch,
  findDocumentsWithoutEmbeddings,
  countDocumentsWithoutEmbeddings,
  getByShareToken,
  getSection,
} from "./documents/queries";

// Import all documents mutations to ensure deployment
export {
  create,
  update,
  remove,
  insertFromMigration,
  publishDocument,
  unpublishDocument,
  clearAll,
  appendText,
} from "./documents/mutations";

// Import documents actions to ensure deployment
export {
  hybridSearch,
} from "./documents/search";

// Import documents storage actions to ensure deployment
export {
  createWithEmbedding,
  updateWithEmbedding,
} from "./documents/storage";

// Import documents scheduled functions to ensure deployment
export {
  backfillOrphanedEmbeddings,
} from "./documents/scheduled";
