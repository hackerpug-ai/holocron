/**
 * Shared document category constants.
 * SINGLE SOURCE OF TRUTH for categories across Convex backend and React Native app.
 *
 * To add a new category:
 * 1. Add it to DOCUMENT_CATEGORIES array below
 * 2. Add display metadata to CATEGORY_METADATA
 * 3. The CategoryBadge component will automatically support it
 */

/**
 * Valid document categories.
 * These match the schema in convex/schema.ts and CategoryBadge component.
 */
export const DOCUMENT_CATEGORIES = [
  'research',
  'general',
  'patterns',
  'business',
  'technical-analysis',
  'platforms',
  'libraries',
  'claude-code-configuration',
  'toolbelt',
] as const

/**
 * Type for valid document categories
 */
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

/**
 * Check if a string is a valid document category
 */
export function isValidCategory(value: string): value is DocumentCategory {
  return DOCUMENT_CATEGORIES.includes(value as DocumentCategory)
}

/**
 * Category display metadata for UI components
 */
export const CATEGORY_METADATA: Record<
  DocumentCategory,
  { label: string; color: 'blue' | 'green' | 'purple' | 'orange' | 'pink' | 'yellow' | 'cyan' | 'red' | 'gray' }
> = {
  research: { label: 'Research', color: 'blue' },
  general: { label: 'General', color: 'gray' },
  patterns: { label: 'Patterns', color: 'purple' },
  business: { label: 'Business', color: 'green' },
  'technical-analysis': { label: 'Technical Analysis', color: 'orange' },
  platforms: { label: 'Platforms', color: 'cyan' },
  libraries: { label: 'Libraries', color: 'pink' },
  'claude-code-configuration': { label: 'Claude Code', color: 'yellow' },
  toolbelt: { label: 'Toolbelt', color: 'red' },
}

/**
 * Default category when none is specified or when mapping fails
 */
export const DEFAULT_CATEGORY: DocumentCategory = 'general'

/**
 * Map any string to a valid category, falling back to default
 */
export function mapToCategory(value: string | undefined | null): DocumentCategory {
  if (!value) return DEFAULT_CATEGORY
  if (isValidCategory(value)) return value
  return DEFAULT_CATEGORY
}
