/**
 * What's New Types
 *
 * Shared types for the What's New module.
 */

/**
 * Finding - A single news item, release, or discussion
 */
export interface Finding {
  title: string;
  url: string;
  source: string;
  category: "discovery" | "release" | "trend" | "discussion";
  score?: number;
  summary?: string;
  publishedAt?: string;
  // Extended fields for enhanced filtering and ranking
  engagementVelocity?: number; // 0-100 score based on engagement rate
  crossSourceCorroboration?: number; // Count of sources mentioning this
  author?: string; // Author or creator name
  tags?: string[]; // Associated tags/topics
  metadataJson?: any; // Extensible metadata for future fields
  // Quality scoring fields
  qualityScore?: number; // 0-1 LLM-assessed quality score
  qualityReason?: string; // Brief explanation of quality assessment
  upvotes?: number; // Platform-specific upvote/like count
  commentCount?: number; // Number of comments/replies
  corroboration?: number; // Number of sources mentioning this item
  // Enhanced metadata for report tables (Phase 2)
  extendedDescription?: string; // 100-200 chars for table descriptions
  starCount?: number; // GitHub stars for ranking
  isDiscovery?: boolean; // true = new tool, false = known tool update
  platform?: string; // 'reddit', 'hn', 'github', 'devto', 'lobsters'
  releaseType?: 'official' | 'community' | 'unknown';
}

/**
 * FetchResult - Result from a single source fetch
 */
export interface FetchResult {
  source: string;
  findings: Finding[];
  error?: string;
}

/**
 * WorkflowPhase - Current phase of report generation workflow
 */
export type WorkflowPhase =
  | "pending"
  | "fetching"
  | "enriching"
  | "synthesizing"
  | "completed"
  | "failed";
