/**
 * DESIGN-002: Shared category accent colors for newsfeed components
 *
 * Single source of truth for category colors — re-exported from theme tokens
 * so production code never embeds raw #RRGGBB literals.
 *
 * @see .spec/prd/newsfeed-redesign/tasks/sprint-01-intelligence-briefing-screen/DESIGN-002-define-shared-category-colors-constant.md
 */

import { brandColors } from '@/lib/theme';

export const CATEGORY_COLORS = brandColors.category;

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
