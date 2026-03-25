/**
 * Tool Configuration: Server-side security constants for agent plan validation.
 *
 * These constants are the authoritative source of truth for:
 *   1. Which tools require user approval (TOOLS_REQUIRING_APPROVAL)
 *   2. Which tool names are valid (VALID_TOOL_NAMES)
 *
 * The LLM is NOT trusted to set requiresApproval — the server enforces it
 * using TOOLS_REQUIRING_APPROVAL after receiving the plan steps.
 *
 * create_plan is intentionally excluded from VALID_TOOL_NAMES to prevent
 * nested plan creation.
 */

/**
 * Tools that have real write-side-effects and MUST always require user approval.
 * The createPlan mutation overrides each step's requiresApproval field using
 * this set, ignoring whatever value the LLM sent.
 */
export const TOOLS_REQUIRING_APPROVAL: Set<string> = new Set([
  "save_document",
  "subscribe",
  "unsubscribe",
  "assimilate",
  "deep_research",
  "shop_search",
  "whats_new",
]);

/**
 * All valid tool names that a plan step may reference.
 * createPlan throws if an unknown toolName is encountered.
 * create_plan is excluded to prevent nested plans.
 */
export const VALID_TOOL_NAMES: Set<string> = new Set([
  "search_knowledge_base",
  "browse_category",
  "knowledge_base_stats",
  "quick_research",
  "deep_research",
  "shop_search",
  "subscribe",
  "unsubscribe",
  "list_subscriptions",
  "check_subscriptions",
  "whats_new",
  "toolbelt_search",
  "save_document",
  "assimilate",
]);
