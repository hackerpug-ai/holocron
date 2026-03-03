import { useMemo } from 'react'
import React from 'react'
import type { Root } from 'mdast'
import { NodeRenderer } from '../renderers/NodeRenderer'
import type { CustomRenderers } from '../renderers/NodeRenderer'

/**
 * Configuration for markdown rendering
 */
export interface MarkdownRendererConfig {
  /** Custom renderers for overriding default node rendering */
  renderers?: CustomRenderers
  /** Callback when links are pressed */
  onLinkPress?: (url: string) => void
  /** Test ID prefix for all rendered elements */
  testIDPrefix?: string
}

/**
 * Result of useMarkdownRenderer hook
 */
export interface UseMarkdownRendererResult {
  /** Render function that takes AST and returns React elements */
  render: (ast: Root) => React.ReactNode
  /** Configuration passed to the hook */
  config: MarkdownRendererConfig
}

/**
 * Hook to configure markdown rendering with memoization
 *
 * This hook provides a stable render function and configuration
 * for use with the useMarkdownParser hook
 *
 * @param config - Renderer configuration
 * @returns Render function and config
 *
 * @example
 * ```tsx
 * const { ast } = useMarkdownParser(markdown)
 * const { render } = useMarkdownRenderer({ onLinkPress })
 * return render(ast)
 * ```
 */
export function useMarkdownRenderer(
  config: MarkdownRendererConfig = {}
): UseMarkdownRendererResult {
  const { renderers, onLinkPress, testIDPrefix } = config

  const render = useMemo(() => {
    return (ast: Root) => {
      if (!ast || !ast.children || ast.children.length === 0) {
        return null
      }

      // NodeRenderer is now imported directly

      return (
        <React.Fragment>
          {ast.children.map((child, index) => (
            <NodeRenderer
              key={`root-${index}`}
              node={child}
              renderers={renderers}
              onLinkPress={onLinkPress}
              testID={testIDPrefix ? `${testIDPrefix}-${index}` : undefined}
            />
          ))}
        </React.Fragment>
      )
    }
  }, [renderers, onLinkPress, testIDPrefix])

  return {
    render,
    config,
  }
}
