import { remark } from 'remark'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type { Processor } from 'unified'
import type { Root } from 'mdast'
import { remarkCalloutPlugin } from './callout-plugin'
import { sanitizeMarkdown } from '@/lib/sanitizeMarkdown'

/**
 * Parser options for markdown processing
 */
export interface ParserOptions {
  /** Enable GitHub Flavored Markdown (tables, strikethrough, task lists) */
  enableGfm?: boolean
  /** Enable custom callout syntax [!NOTE], [!WARNING], etc. */
  enableCallouts?: boolean
  /** Sanitize markdown content before parsing */
  sanitize?: boolean
}

/**
 * Default parser options
 */
const DEFAULT_OPTIONS: ParserOptions = {
  enableGfm: true,
  enableCallouts: true,
  sanitize: true,
}

/**
 * Parse markdown content into MDAST (Markdown Abstract Syntax Tree)
 *
 * Features:
 * - GitHub Flavored Markdown support (tables, strikethrough, task lists)
 * - Custom callout syntax [!NOTE], [!WARNING], etc.
 * - Optional sanitization for security
 *
 * @param markdown - Raw markdown content
 * @param options - Parser configuration options
 * @returns MDAST tree
 *
 * @example
 * ```tsx
 * const ast = parseMarkdown('# Hello\n\nThis is **bold** text')
 * // Returns MDAST tree with heading and paragraph nodes
 * ```
 */
export function parseMarkdown(markdown: string, options: ParserOptions = {}): Root {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Sanitize input if enabled
  const content = opts.sanitize ? sanitizeMarkdown(markdown) : markdown

  // Build the remark processor with proper typing
  let processor = remark().use(remarkParse)

  // Add GFM support (tables, strikethrough, task lists)
  if (opts.enableGfm) {
    processor = processor.use(remarkGfm) as Processor<any, any, any, any, any>
  }

  // Add custom callout plugin
  if (opts.enableCallouts) {
    processor = processor.use(remarkCalloutPlugin) as Processor<any, any, any, any, any>
  }

  // Parse the markdown
  try {
    const tree = processor.parse(content)
    return tree as Root
  } catch (error) {
    console.error('[parseMarkdown] Failed to parse markdown:', error)
    // Return a minimal tree on error
    return {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              value: content,
            },
          ],
        },
      ],
    }
  }
}

/**
 * Count the number of nodes in an MDAST tree
 * Useful for determining if virtualization is needed
 *
 * @param tree - MDAST tree
 * @returns Number of nodes in the tree
 */
export function countNodes(tree: Root): number {
  let count = 0

  function traverse(node: any) {
    count++
    if (node.children) {
      for (const child of node.children) {
        traverse(child)
      }
    }
  }

  traverse(tree)
  return count
}

/**
 * Calculate approximate size of markdown content in bytes
 *
 * @param markdown - Raw markdown content
 * @returns Size in bytes
 */
export function getContentSize(markdown: string): number {
  return new Blob([markdown]).size
}

/**
 * Determine if content should use virtualized rendering
 * Thresholds: >5KB or >100 nodes
 *
 * @param markdown - Raw markdown content
 * @param tree - Parsed MDAST tree
 * @returns true if virtualization is recommended
 */
export function shouldVirtualize(markdown: string, tree: Root): boolean {
  const size = getContentSize(markdown)
  const nodes = countNodes(tree)

  return size > 5000 || nodes > 100
}

// Export types and plugin
export { remarkCalloutPlugin }
export type { CalloutNode, CalloutType } from './callout-plugin'
