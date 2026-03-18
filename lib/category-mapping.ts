/**
 * Category mapping utilities for the app layer.
 * Re-exports shared category constants from convex/lib/categories.ts
 */
import {
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
  isValidCategory,
  mapToCategory,
} from '@/convex/lib/categories'
import type { CategoryType } from '@/components/CategoryBadge'

// Re-export for backward compatibility
export const VALID_CATEGORIES: CategoryType[] = [...DOCUMENT_CATEGORIES]

/**
 * Maps any document category string to a valid CategoryType.
 * Returns the category if valid, otherwise defaults to 'general'.
 */
export function mapDocumentCategoryToCategoryType(docCategory: string): CategoryType {
  return mapToCategory(docCategory) as CategoryType
}

/**
 * Maps CategoryType to document category string (pass-through for valid categories).
 * Returns undefined for undefined input (no filter).
 */
export function mapCategoryTypeToDocumentCategory(
  categoryType: CategoryType | undefined | null
): string | undefined {
  if (!categoryType) return undefined
  return categoryType // CategoryType values ARE the document categories
}

/**
 * Type guard to check if a string is a valid CategoryType
 */
export function isValidCategoryType(value: string): value is CategoryType {
  return isValidCategory(value)
}

// Re-export types and utilities from shared module
export { DOCUMENT_CATEGORIES, type DocumentCategory, isValidCategory, mapToCategory }
