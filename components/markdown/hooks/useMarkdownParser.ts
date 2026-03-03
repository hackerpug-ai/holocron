import { useMemo } from 'react'
import type { Root } from 'mdast'
import { parseMarkdown, type ParserOptions } from '../parsers'

/**
 * Result of markdown parsing hook
 */
export interface UseMarkdownParserResult {
  /** Parsed MDAST tree */
  ast: Root | null
  /** Error if parsing failed */
  error: Error | null
  /** Number of nodes in the tree */
  nodeCount: number
  /** Content size in bytes */
  contentSize: number
}

/**
 * Simple hash function for content caching
 */
function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(36)
}

/**
 * Cache for parsed markdown trees
 */
const parseCache = new Map<string, Root>()

/**
 * Maximum cache size to prevent memory leaks
 */
const MAX_CACHE_SIZE = 50

/**
 * Clear old entries from cache when size exceeds limit
 */
function trimCache() {
  if (parseCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(parseCache.entries())
    // Remove oldest entries (first half)
    entries.slice(0, Math.floor(MAX_CACHE_SIZE / 2)).forEach(([key]) => {
      parseCache.delete(key)
    })
  }
}

/**
 * Hook to parse markdown content with memoization and caching
 *
 * Features:
 * - Content-based caching (same content = cached AST)
 * - Memoization for stable references
 * - Error handling with fallback to plain text
 * - Automatic cache trimming
 *
 * @param markdown - Raw markdown content
 * @param options - Parser configuration options
 * @returns Parsed AST, error, and metadata
 *
 * @example
 * ```tsx
 * const { ast, error, nodeCount } = useMarkdownParser(markdown)
 * if (error) return <Text>Error parsing markdown</Text>
 * return <MarkdownRenderer ast={ast} />
 * ```
 */
export function useMarkdownParser(
  markdown: string,
  options: ParserOptions = {}
): UseMarkdownParserResult {
  // Empty content check
  const isEmpty = !markdown || markdown.trim().length === 0

  return useMemo(() => {
    // Handle empty content
    if (isEmpty) {
      return {
        ast: { type: 'root', children: [] },
        error: null,
        nodeCount: 0,
        contentSize: 0,
      }
    }

    try {
      // Generate cache key from content and options
      const cacheKey = hashString(JSON.stringify({ markdown, options }))

      // Check cache first
      let ast = parseCache.get(cacheKey)

      if (!ast) {
        // Parse and cache
        ast = parseMarkdown(markdown, options)
        trimCache()
        parseCache.set(cacheKey, ast)
      }

      // Count nodes
      let nodeCount = 0
      function traverse(node: any) {
        nodeCount++
        if (node.children) {
          for (const child of node.children) {
            traverse(child)
          }
        }
      }
      traverse(ast)

      // Calculate content size
      const contentSize = new Blob([markdown]).size

      return {
        ast,
        error: null,
        nodeCount,
        contentSize,
      }
    } catch (error) {
      console.error('[useMarkdownParser] Failed to parse markdown:', error)
      return {
        ast: {
          type: 'root',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: markdown }],
            },
          ],
        },
        error: error as Error,
        nodeCount: 1,
        contentSize: markdown.length,
      }
    }
  }, [markdown, JSON.stringify(options), isEmpty])
}

/**
 * Clear the parse cache (useful for testing or memory management)
 */
export function clearParseCache() {
  parseCache.clear()
}
