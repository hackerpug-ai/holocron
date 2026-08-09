/**
 * Shared document category constants for the RN client.
 * Single source of truth for CategoryBadge and category-mapping.
 */

export const DOCUMENT_CATEGORIES = [
  'research',
  'deep-research',
  'factual',
  'academic',
  'entity',
  'url',
  'general',
  'patterns',
  'business',
  'technical-analysis',
  'platforms',
  'libraries',
  'claude-code-configuration',
  'toolbelt',
  'revenue-validation',
  'competitive-analysis',
  'ai-roi',
  'flights',
  'creator-analysis',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export function isValidCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

export const CATEGORY_METADATA: Record<
  DocumentCategory,
  {
    label: string;
    color: 'blue' | 'green' | 'purple' | 'orange' | 'pink' | 'yellow' | 'cyan' | 'red' | 'gray';
  }
> = {
  research: { label: 'Research', color: 'blue' },
  'deep-research': { label: 'Deep Research', color: 'purple' },
  factual: { label: 'Factual', color: 'green' },
  academic: { label: 'Academic', color: 'cyan' },
  entity: { label: 'Entity', color: 'orange' },
  url: { label: 'URL', color: 'pink' },
  general: { label: 'General', color: 'gray' },
  patterns: { label: 'Patterns', color: 'purple' },
  business: { label: 'Business', color: 'green' },
  'technical-analysis': { label: 'Technical Analysis', color: 'orange' },
  platforms: { label: 'Platforms', color: 'cyan' },
  libraries: { label: 'Libraries', color: 'pink' },
  'claude-code-configuration': { label: 'Claude Code', color: 'yellow' },
  toolbelt: { label: 'Toolbelt', color: 'red' },
  'revenue-validation': { label: 'Revenue Validation', color: 'green' },
  'competitive-analysis': { label: 'Competitive Analysis', color: 'orange' },
  'ai-roi': { label: 'AI ROI', color: 'blue' },
  flights: { label: 'Flights', color: 'cyan' },
  'creator-analysis': { label: 'Creator Analysis', color: 'purple' },
};

export const DEFAULT_CATEGORY: DocumentCategory = 'general';

export function mapToCategory(value: string | undefined | null): DocumentCategory {
  if (!value) return DEFAULT_CATEGORY;
  if (isValidCategory(value)) return value;
  return DEFAULT_CATEGORY;
}
