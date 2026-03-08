/**
 * Type definitions for Holocron research data
 *
 * These types mirror the Convex schema but use plain TypeScript types
 * suitable for MCP tool responses (no Convex-specific types)
 */

/**
 * Confidence level enumeration
 */
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

/**
 * Session status enumeration
 */
export type SessionStatus = "pending" | "running" | "paused" | "completed" | "cancelled" | "error";

/**
 * Iteration status enumeration
 */
export type IterationStatus = "pending" | "running" | "completed";

/**
 * 5-factor confidence statistics
 */
export interface ConfidenceFactors {
  sourceCredibility: number; // 0-100
  evidenceQuality: number; // 0-100
  corroboration: number; // 0-100
  recency: number; // 0-100
  expertConsensus: number; // 0-100
}

/**
 * Aggregated confidence statistics for a session
 */
export interface ConfidenceStats {
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  averageConfidenceScore: number; // 0-100
  claimsWithMultipleSources: number;
  totalClaims: number;
}

/**
 * Citation for a research finding
 */
export interface Citation {
  url: string;
  title: string;
  domain?: string;
  sourceType: string;
  credibilityScore: number;
}

/**
 * Research finding with confidence data
 */
export interface ResearchFinding {
  id: string;
  claimText: string;
  claimCategory: string | null;
  confidenceScore: number; // 0-100
  confidenceLevel: ConfidenceLevel;
  factors?: ConfidenceFactors;
  citations: Citation[];
  caveats: string[];
  warnings: string[];
  sourceCount?: number;
  createdAt?: number;
}

/**
 * Research iteration
 */
export interface ResearchIteration {
  id: string;
  sessionId: string;
  iterationNumber: number;
  coverageScore: number | null;
  feedback: string | null;
  refinedQueries: string | null;
  findings: string | null;
  status: IterationStatus;
  createdAt: number;
  updatedAt: number;
}

/**
 * Complete research session with iterations and findings
 */
export interface ResearchSession {
  id: string;
  conversationId: string | null;
  topic: string;
  maxIterations: number;
  status: SessionStatus;
  currentIteration?: number;
  currentCoverageScore?: number;
  confidenceStats?: ConfidenceStats;
  iterations: ResearchIteration[];
  findings?: ResearchFinding[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Hybrid search result for iterations
 */
export interface IterationSearchResult {
  sessionId: string;
  topic: string;
  findings: string;
  score: number; // 0-1 relevance score
  iterationNumber: number;
}

/**
 * Progress update during research
 */
export interface ProgressUpdate {
  type: "progress" | "complete" | "error";
  iteration?: number;
  maxIterations?: number;
  coverageScore?: number;
  status?: SessionStatus;
  result?: ResearchSessionResult;
  error?: string;
}

/**
 * Final research session result
 */
export interface ResearchSessionResult {
  sessionId: string;
  topic: string;
  status: SessionStatus;
  iterations: number;
  coverageScore: number;
  confidenceStats: ConfidenceStats;
  findings: ResearchFinding[];
}
