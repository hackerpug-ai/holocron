/**
 * Index file for whatsNew module
 * Exports all queries, mutations, and actions
 */

// Re-export top-level functions for MCP tools and direct access
export {
  getLatestReport,
  getRecentReports,
  getRecentSubscriptionContent,
  saveReportInternal as saveReport,
  saveReportWithEmbeddingsPublic as saveReportWithEmbeddings,
} from '../whatsNew';
export * from './actions';
// Re-export internal module for cron jobs and internal references
export * as internal from './internal';
export * from './mutations';
export * from './quality';
export * from './queries';
export * from './workflow';
