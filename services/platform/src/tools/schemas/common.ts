/**
 * Shared Zod primitives for the platform tool registry.
 * No z.any() — use z.unknown() for open values.
 */
import { z } from 'zod';

export const SourceTypeEnum = z.enum([
  'youtube',
  'newsletter',
  'changelog',
  'reddit',
  'ebay',
  'whats-new',
  'github',
]);

export const ToolSourceTypeEnum = z.enum([
  'github',
  'npm',
  'pypi',
  'website',
  'cargo',
  'go',
  'other',
]);

export const ToolCategoryEnum = z.enum([
  'libraries',
  'cli',
  'framework',
  'service',
  'database',
  'tool',
]);

export const ToolStatusEnum = z.enum(['complete', 'draft', 'archived']);

/** Open JSON object (metadata bags) — never z.any(). */
export const JsonRecordSchema = z.record(z.string(), z.unknown());

/** Generic document / result row used by search tools. */
export const SearchResultItemSchema = z.object({
  _id: z.string(),
  title: z.string().optional(),
  score: z.number().optional(),
  content: z.string().optional(),
});

export const SearchResultsOutputSchema = z.object({
  results: z.array(SearchResultItemSchema),
  totalResults: z.number().int(),
});

/** Nullable opaque record for get_* tools that may return null. */
export const NullableRecordSchema = z.record(z.string(), z.unknown()).nullable();
