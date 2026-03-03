import { useMarkdownParser } from './hooks/useMarkdownParser'
import { useMarkdownRenderer } from './hooks/useMarkdownRenderer'
import type { CustomRenderers } from './renderers/NodeRenderer'
import type { ParserOptions } from './parsers'
import * as React from 'react'
import { View } from 'react-native'

/**
 * MarkdownText renders markdown content inline without virtualization
 *
 * Use for short content like chat messages, tooltips, or inline previews.
 * Optimized for content <5KB with minimal overhead.
 *
 * @example
 * ```tsx
 * <MarkdownText
 *   content={markdown}
 *   onLinkPress={(url) => console.log('Pressed:', url)}
 * />
 * ```
 */
export interface MarkdownTextProps {
  /** Markdown content to render */
  content: string
  /** Callback when links are pressed */
  onLinkPress?: (url: string) => void
  /** Custom renderers for overriding defaults */
  renderers?: CustomRenderers
  /** Parser options */
  parserOptions?: ParserOptions
  /** Optional test ID */
  testID?: string
  /** Optional class name (for web compatibility) */
  className?: string
}

export const MarkdownText = React.memo(
  ({
    content,
    onLinkPress,
    renderers,
    parserOptions,
    testID = 'markdown-text',
    className,
  }: MarkdownTextProps) => {
    const { ast } = useMarkdownParser(content, parserOptions)
    const { render } = useMarkdownRenderer({ onLinkPress, renderers, testIDPrefix: testID })

    if (!ast) {
      return null
    }

    return <View testID={testID} className={className}>{render(ast)}</View>
  }
)
MarkdownText.displayName = 'MarkdownText'
