/**
 * Ported chat specialist table (UC-SVC-03).
 *
 * One typed row per specialist: name, fleet role binding, least-privilege tool
 * id list, and system prompt. Tool ids resolve through the shared registry at
 * module load — a missing id fails boot rather than the first chat turn.
 */
import { getTool } from '../tools/registry.ts';

export const SPECIALIST_NAMES = [
  'knowledge',
  'research',
  'podcast',
  'commerce',
  'subscriptions',
  'discovery',
  'documents',
  'analysis',
  'improvements',
  'planner',
] as const;

export type SpecialistName = (typeof SPECIALIST_NAMES)[number];

/** Fleet Role Manifest role — never a provider name (UC-INFER-01 AC-2). */
export type FleetRoleBinding = 'divergent' | 'convergent';

export type SpecialistConfig = {
  name: SpecialistName;
  /** Fleet role used with createFleetAgentWithResolved. */
  fleetRole: FleetRoleBinding;
  /** Registry tool ids granted to this specialist (least privilege). */
  toolIds: readonly string[];
  systemPrompt: string;
};

const BASE_FORMATTING = `
## Formatting
- Write short paragraphs (2-3 sentences max). Use bullet points for lists.
- Lead with the most important information first.
- Never fabricate facts, citations, document IDs, or sources.
- After tool results, answer with your analysis as text.`;

export const SPECIALISTS: Record<SpecialistName, SpecialistConfig> = {
  knowledge: {
    name: 'knowledge',
    fleetRole: 'divergent',
    toolIds: ['search_knowledge_base', 'browse_category', 'knowledge_base_stats', 'get_document'],
    systemPrompt: `You are Holocron's knowledge specialist. Help users find and explore saved documents.

## Tools
- search_knowledge_base: Search documents by query. Use first for any lookup.
- browse_category: Browse documents in a category.
- knowledge_base_stats: Document counts by category.
- get_document: Full document by ID from search results.

Always search first. Include document IDs in results. Answer follow-ups from context without re-searching.
${BASE_FORMATTING}`,
  },
  research: {
    name: 'research',
    fleetRole: 'convergent',
    toolIds: ['quick_research', 'deep_research', 'answer_question', 'find_recommendations'],
    systemPrompt: `You are Holocron's research specialist. Find NEW information from the web and research tools.
Use answer_question for most factual questions, quick_research when the user wants saved results,
deep_research only when they ask for a comprehensive deep dive, and find_recommendations for named options.
${BASE_FORMATTING}`,
  },
  podcast: {
    name: 'podcast',
    fleetRole: 'convergent',
    toolIds: ['quick_research', 'deep_research', 'answer_question', 'find_recommendations'],
    systemPrompt: `You are Holocron's podcast content specialist. Analyze podcast topics and related research using research tools.
${BASE_FORMATTING}`,
  },
  commerce: {
    name: 'commerce',
    fleetRole: 'divergent',
    toolIds: ['shop_search'],
    systemPrompt: `You are Holocron's shopping specialist. Use shop_search to find products and compare prices.
Extract product query, condition, and budget when present.
${BASE_FORMATTING}`,
  },
  subscriptions: {
    name: 'subscriptions',
    fleetRole: 'divergent',
    toolIds: ['subscribe', 'unsubscribe', 'list_subscriptions', 'check_subscriptions'],
    systemPrompt: `You are Holocron's subscription manager. Add, remove, list, and check content subscriptions.
${BASE_FORMATTING}`,
  },
  discovery: {
    name: 'discovery',
    fleetRole: 'divergent',
    toolIds: ['whats_new'],
    systemPrompt: `You are Holocron's discovery specialist. Surface what's new using the whats_new tool.
${BASE_FORMATTING}`,
  },
  documents: {
    name: 'documents',
    fleetRole: 'convergent',
    toolIds: ['save_document', 'update_document', 'get_document'],
    systemPrompt: `You are Holocron's documents specialist. Save, update, and retrieve user documents.
${BASE_FORMATTING}`,
  },
  analysis: {
    name: 'analysis',
    fleetRole: 'convergent',
    toolIds: ['assimilate'],
    systemPrompt: `You are Holocron's repository analysis specialist. Use assimilate for repo architecture work.
${BASE_FORMATTING}`,
  },
  improvements: {
    name: 'improvements',
    fleetRole: 'convergent',
    toolIds: ['add_improvement', 'search_improvements', 'get_improvement', 'list_improvements'],
    systemPrompt: `You are Holocron's improvements specialist. Track and search product improvement requests.
${BASE_FORMATTING}`,
  },
  planner: {
    name: 'planner',
    fleetRole: 'convergent',
    toolIds: ['create_plan'],
    systemPrompt: `You are Holocron's multi-step planner. Use create_plan when a request needs 2+ sequential tool steps.
${BASE_FORMATTING}`,
  },
};

export function isSpecialistName(value: string): value is SpecialistName {
  return (SPECIALIST_NAMES as readonly string[]).includes(value);
}

export function getSpecialist(name: SpecialistName): SpecialistConfig {
  const config = SPECIALISTS[name];
  if (!config) {
    throw new Error(`Unknown specialist: ${name}`);
  }
  return config;
}

/** Resolve each granted tool id through the shared registry (throws if missing). */
export function resolveSpecialistTools(
  toolIds: readonly string[]
): Record<string, ReturnType<typeof getTool>['tool']> {
  const tools: Record<string, ReturnType<typeof getTool>['tool']> = {};
  for (const id of toolIds) {
    tools[id] = getTool(id).tool;
  }
  return tools;
}

/** Module-load validation: every specialist grant resolves in the registry. */
function assertSpecialistGrantsResolve(): void {
  for (const name of SPECIALIST_NAMES) {
    const { toolIds } = SPECIALISTS[name];
    for (const id of toolIds) {
      getTool(id);
    }
  }
}

assertSpecialistGrantsResolve();
