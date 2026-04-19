/**
 * DESIGN-002: Shared category accent colors for newsfeed components
 *
 * Single source of truth for category hex values. All components consuming
 * category colors MUST import from this file to prevent drift.
 *
 * @see .spec/prd/newsfeed-redesign/tasks/sprint-01-intelligence-briefing-screen/DESIGN-002-define-shared-category-colors-constant.md
 */

export const CATEGORY_COLORS = {
  discovery: '#F59E0B',
  release: '#10B981',
  trend: '#3B82F6',
  discussion: '#6B7280',
} as const;

/**
 * Type narrowing for category keys.
 *
 * Uses `keyof typeof` pattern to derive type from the object keys,
 * ensuring type safety without duplicating the union definition.
 *
 * @example
 * ```ts
 * function getCategoryColor(key: CategoryKey): string {
 *   return CATEGORY_COLORS[key];
 * }
 * ```
 */
export type CategoryKey = keyof typeof CATEGORY_COLORS;

// Freeze the object at runtime to prevent accidental mutations
Object.freeze(CATEGORY_COLORS);
