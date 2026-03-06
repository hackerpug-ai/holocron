/**
 * Deep Research Type Definitions
 *
 * TypeScript types for deep research sessions and iterations matching the database schema.
 * @see db/migrations/*_create_deep_research.sql
 * @see PRD 08-uc-deep-research.md - UC-DR-01, UC-DR-02, UC-DR-03, UC-DR-04
 */

// ============================================================
// ENUM Types
// ============================================================

/** Session status for deep research sessions */
export type DeepResearchSessionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'cancelled'

/** Iteration status for individual research iterations */
export type DeepResearchIterationStatus = 'pending' | 'running' | 'completed'

// ============================================================
// Deep Research Session Types
// ============================================================

/** Raw row type from database deep_research_sessions table (snake_case, string dates) */
export interface DeepResearchSessionRow {
  id: string
  conversation_id: string | null
  topic: string
  max_iterations: number
  status: DeepResearchSessionStatus
  created_at: string
  updated_at: string
}

/**
 * App-level Deep Research Session type used throughout the UI
 * Transformed from DeepResearchSessionRow with camelCase and Date objects
 */
export interface DeepResearchSession {
  id: string
  conversationId: string | null
  topic: string
  maxIterations: number
  status: DeepResearchSessionStatus
  createdAt: Date
  updatedAt: Date
}

/** Insert type - fields with defaults are optional */
export interface DeepResearchSessionInsert {
  id?: string
  conversation_id?: string | null
  topic: string
  max_iterations?: number
  status?: DeepResearchSessionStatus
}

/** Update type - all fields optional */
export interface DeepResearchSessionUpdate {
  conversation_id?: string | null
  topic?: string
  max_iterations?: number
  status?: DeepResearchSessionStatus
  updated_at?: string
}

// ============================================================
// Deep Research Iteration Types
// ============================================================

/** Raw row type from database deep_research_iterations table (snake_case, string dates) */
export interface DeepResearchIterationRow {
  id: string
  session_id: string
  iteration_number: number
  coverage_score: number | null
  feedback: string | null
  refined_queries: unknown | null // JSONB array stored as unknown
  findings: string | null
  status: DeepResearchIterationStatus
  created_at: string
  updated_at: string
}

/**
 * App-level Deep Research Iteration type used throughout the UI
 * Transformed from DeepResearchIterationRow with camelCase and Date objects
 */
export interface DeepResearchIteration {
  id: string
  sessionId: string
  iterationNumber: number
  coverageScore: number | null
  feedback: string | null
  refinedQueries: string[] | null // Properly typed as string array
  findings: string | null
  status: DeepResearchIterationStatus
  createdAt: Date
  updatedAt: Date
}

/** Insert type - fields with defaults are optional */
export interface DeepResearchIterationInsert {
  id?: string
  session_id: string
  iteration_number: number
  coverage_score?: number | null
  feedback?: string | null
  refined_queries?: string[] | null
  findings?: string | null
  status?: DeepResearchIterationStatus
}

/** Update type - all fields optional */
export interface DeepResearchIterationUpdate {
  iteration_number?: number
  coverage_score?: number | null
  feedback?: string | null
  refined_queries?: string[] | null
  findings?: string | null
  status?: DeepResearchIterationStatus
  updated_at?: string
}

// ============================================================
// Helper Types
// ============================================================

/** Session with its iterations (for detail views) */
export interface DeepResearchSessionWithIterations extends DeepResearchSession {
  iterations: DeepResearchIteration[]
}

/** Summary card data for displaying session in list */
export interface DeepResearchSessionSummary {
  id: string
  topic: string
  status: DeepResearchSessionStatus
  lastIterationCompleted: number | null
  coverageScore: number | null
  createdAt: Date
}

/** Progress tracking for active sessions */
export interface DeepResearchProgress {
  sessionId: string
  currentIteration: number
  maxIterations: number
  estimatedRemaining: number
  coverageScore: number | null
  status: DeepResearchSessionStatus
}

// ============================================================
// Card Data Types for Chat Messages
// ============================================================

/** Card data for deep research confirmation message */
export interface DeepResearchConfirmationCard {
  card_type: 'deep_research_confirmation'
  session_id: string
  topic: string
  max_iterations: number
}

/** Card data for iteration progress message */
export interface IterationCard {
  card_type: 'iteration'
  session_id: string
  iteration_number: number
  coverage_score: number | null
  feedback: string | null
  findings: string | null
  estimated_remaining: number
}

/** Card data for final research result message */
export interface FinalResultCard {
  card_type: 'final_result'
  session_id: string
  topic: string
  total_iterations: number
  final_coverage_score: number
  findings_summary: string
}
