import type { CategoryType } from '@/components/CategoryBadge'

/**
 * Maps Convex document categories to UI display categories
 * All document categories map to 'general' except 'research' which maps to 'research'
 */
export function mapDocumentCategoryToCategoryType(docCategory: string): CategoryType {
  return docCategory === 'research' ? 'research' : 'general'
}

/**
 * Maps UI category type back to Convex document category
 * Only 'research' (and research-related types) map directly to 'research'
 * All others return undefined (no filter applied)
 */
export function mapCategoryTypeToDocumentCategory(categoryType: CategoryType | undefined): string | undefined {
  // Research-related categories map to 'research' in Convex
  if (categoryType === 'research' || categoryType === 'deep-research' || categoryType === 'factual' || categoryType === 'academic') {
    return 'research'
  }
  // All other categories return undefined (no filter)
  return undefined
}
