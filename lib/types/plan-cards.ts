/**
 * Plan Card Type Definitions
 *
 * TypeScript types for plan cards displayed in chat messages.
 * Supports deep-research, shop, and assimilation plan types.
 * Extensible for future plan types.
 *
 * @see lib/types/chat.ts - CardData discriminated union
 * @see components/agent/AgentPlanCard.tsx - Agent plan card component
 * @see components/assimilate/AssimilationPlanCard.tsx - Assimilation plan card component
 */

// ============================================================
// ENUM Types
// ============================================================

/** Plan type enumeration - all supported plan types */
export type PlanType = 'deep-research' | 'shop' | 'assimilation' | 'agent'

/** Plan status enumeration - lifecycle states for all plan types */
export type PlanStatus =
  | 'created'           // Plan created, waiting to start
  | 'pending_approval'  // Awaiting user approval
  | 'approved'          // Approved, ready to execute
  | 'executing'         // Actively executing
  | 'in_progress'       // Alternative to executing for some plan types
  | 'completed'         // Finished successfully
  | 'failed'            // Failed with error
  | 'cancelled'         // Cancelled by user
  | 'rejected'          // Rejected by user

/** Plan step status enumeration - individual step lifecycle states */
export type PlanStepStatus =
  | 'pending'           // Step not started
  | 'running'           // Step actively executing
  | 'awaiting_approval' // Step requires user approval
  | 'approved'          // Step approved, ready to execute
  | 'completed'         // Step finished successfully
  | 'skipped'           // Step was skipped
  | 'failed'            // Step failed with error

// ============================================================
// Base Plan Card Interface
// ============================================================

/**
 * Base interface for all plan card types.
 * Contains common fields shared across all plan types.
 */
export interface BasePlanCard {
  card_type: 'plan'
  plan_id: string
  plan_type: PlanType
  title: string
  status: PlanStatus
  created_at: number
  updated_at: number
}

// ============================================================
// Plan Step Types
// ============================================================

/**
 * Base interface for plan steps.
 * Individual plan types may extend this with additional fields.
 */
export interface BasePlanStep {
  stepIndex: number
  description: string
  status: PlanStepStatus
  requiresApproval: boolean
  startedAt?: number
  completedAt?: number
}

/**
 * Full plan step with optional result details.
 */
export interface PlanStep extends BasePlanStep {
  toolName?: string
  toolDisplayName?: string
  toolArgs?: Record<string, unknown>
  resultSummary?: string
  errorMessage?: string
}

// ============================================================
// Deep Research Plan Types
// ============================================================

/**
 * Deep research plan card data.
 * Displayed when a deep research plan is created.
 */
export interface DeepResearchPlanCard extends BasePlanCard {
  card_type: 'plan'
  plan_type: 'deep-research'
  session_id: string
  topic: string
  max_iterations: number
  total_steps: number
  current_step?: number
  query?: string
  subtasks?: Array<{
    id: string
    objective: string
    searchTerms: string[]
  }>
}

// ============================================================
// Shop Plan Types
// ============================================================

/**
 * Shop plan card data.
 * Displayed when a shopping search plan is created.
 */
export interface ShopPlanCard extends BasePlanCard {
  card_type: 'plan'
  plan_type: 'shop'
  session_id: string
  query: string
  total_steps: number
  current_step?: number
  retailers?: string[]
  max_results?: number
  price_range?: {
    min_cents?: number
    max_cents?: number
  }
}

// ============================================================
// Assimilation Plan Types
// ============================================================

/**
 * Assimilation dimension scores.
 * Maps dimension names to coverage scores (0-100).
 */
export type AssimilationDimensionScores = Record<string, number>

/**
 * Assimilation profile type.
 * Determines analysis depth and cost.
 */
export type AssimilationProfile = 'fast' | 'standard' | 'thorough'

/**
 * Assimilation plan card data.
 * Displayed when a repository assimilation plan is created.
 */
export interface AssimilationPlanCard extends BasePlanCard {
  card_type: 'plan'
  plan_type: 'assimilation'
  session_id: string
  repository_name: string
  repository_url: string
  profile: AssimilationProfile
  plan_summary: string
  total_steps: number
  current_step?: number
  dimension_scores?: AssimilationDimensionScores
  current_iteration?: number
  max_iterations?: number
  estimated_cost_usd?: number
}

// ============================================================
// Agent Plan Types
// ============================================================

/**
 * Agent plan card data.
 * Displayed when an agent creates a multi-step execution plan.
 */
export interface AgentPlanCard extends BasePlanCard {
  card_type: 'plan'
  plan_type: 'agent'
  conversation_id: string
  total_steps: number
  current_step?: number
}

// ============================================================
// Plan Metadata Types
// ============================================================

/**
 * Common metadata for all plan types.
 */
export interface PlanMetadata {
  plan_id: string
  created_at: number
  updated_at: number
  started_at?: number
  completed_at?: number
  error_message?: string
  error_details?: Record<string, unknown>
}

/**
 * Deep research plan metadata.
 */
export interface DeepResearchPlanMetadata extends PlanMetadata {
  session_id: string
  topic: string
  max_iterations: number
  total_iterations?: number
  final_coverage_score?: number
  findings_summary?: string
}

/**
 * Shop plan metadata.
 */
export interface ShopPlanMetadata extends PlanMetadata {
  session_id: string
  query: string
  total_listings?: number
  best_deal_id?: string
  duration_ms?: number
}

/**
 * Assimilation plan metadata.
 */
export interface AssimilationPlanMetadata extends PlanMetadata {
  session_id: string
  repository_name: string
  repository_url: string
  profile: AssimilationProfile
  dimension_scores?: AssimilationDimensionScores
  current_iteration?: number
  max_iterations?: number
  estimated_cost_usd?: number
  document_id?: string
}

/**
 * Agent plan metadata.
 */
export interface AgentPlanMetadata extends PlanMetadata {
  conversation_id: string
  current_step_index?: number
}

// ============================================================
// Discriminated Union
// ============================================================

/**
 * Discriminated union of all plan card types.
 * Use this type when accepting any plan card.
 */
export type PlanCard =
  | DeepResearchPlanCard
  | ShopPlanCard
  | AssimilationPlanCard
  | AgentPlanCard

/**
 * Discriminated union of all plan metadata types.
 */
export type PlanMetadataUnion =
  | DeepResearchPlanMetadata
  | ShopPlanMetadata
  | AssimilationPlanMetadata
  | AgentPlanMetadata

// ============================================================
// Type Guards
// ============================================================

/**
 * Check if a plan status is a terminal state.
 */
export function isTerminalPlanStatus(status: PlanStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'rejected'
}

/**
 * Check if a plan status is an active state.
 */
export function isActivePlanStatus(status: PlanStatus): boolean {
  return status === 'executing' || status === 'in_progress'
}

/**
 * Check if a plan status is awaiting user action.
 */
export function isAwaitingActionPlanStatus(status: PlanStatus): boolean {
  return status === 'pending_approval'
}

/**
 * Check if a step status is a terminal state.
 */
export function isTerminalStepStatus(status: PlanStepStatus): boolean {
  return status === 'completed' || status === 'skipped' || status === 'failed'
}

/**
 * Check if a step status is an active state.
 */
export function isActiveStepStatus(status: PlanStepStatus): boolean {
  return status === 'running' || status === 'awaiting_approval' || status === 'approved'
}

/**
 * Type guard for DeepResearchPlanCard.
 */
export function isDeepResearchPlanCard(card: PlanCard): card is DeepResearchPlanCard {
  return card.plan_type === 'deep-research'
}

/**
 * Type guard for ShopPlanCard.
 */
export function isShopPlanCard(card: PlanCard): card is ShopPlanCard {
  return card.plan_type === 'shop'
}

/**
 * Type guard for AssimilationPlanCard.
 */
export function isAssimilationPlanCard(card: PlanCard): card is AssimilationPlanCard {
  return card.plan_type === 'assimilation'
}

/**
 * Type guard for AgentPlanCard.
 */
export function isAgentPlanCard(card: PlanCard): card is AgentPlanCard {
  return card.plan_type === 'agent'
}

// ============================================================
// Helper Types
// ============================================================

/**
 * Progress tracking for active plans.
 */
export interface PlanProgress {
  planId: string
  currentStep: number | null
  totalSteps: number
  status: PlanStatus
}

/**
 * Error information for failed plans.
 */
export interface PlanError {
  errorMessage: string | null
  errorDetails: Record<string, unknown> | null
}

/**
 * Calculate progress percentage for a plan.
 * Returns 0-100, or null if progress cannot be determined.
 */
export function calculatePlanProgress(currentStep: number | null, totalSteps: number): number | null {
  if (currentStep === null) {
    return null
  }
  if (totalSteps === 0) {
    return 0
  }
  return Math.min(100, Math.max(0, (currentStep / totalSteps) * 100))
}
