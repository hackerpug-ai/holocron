/**
 * Index file for whatsNew module
 * Exports all queries, mutations, and actions
 */

export * from "./queries";
export * from "./mutations";
export * from "./actions";
export * from "./quality";
export * from "./workflow";

// Re-export internal module for cron jobs and internal references
export * as internal from "./internal";

// Re-export top-level functions for MCP tools and direct access
export { getRecentReports, getRecentSubscriptionContent, getLatestReport, saveReport } from "../whatsNew";
