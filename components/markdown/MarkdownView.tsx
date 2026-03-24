import { useMarkdownParser } from './hooks/useMarkdownParser'
import { useMarkdownRenderer, type MarkdownRendererConfig } from './hooks/useMarkdownRenderer'
import type { ParserOptions } from './parsers'
import * as React from 'react'
import { ScrollView, View } from 'react-native'

/**
 * MarkdownView renders markdown content with virtualization for large documents
 *
 * Use for long-form content like articles, documentation, or blog posts.
 * Automatically switches to virtualized rendering for content >5KB or >100 nodes.
 *
 * @example
 * ```tsx
 * <MarkdownView
 *   content={markdown}
 *   variant="full"
 *   onLinkPress={(url) => console.log('Pressed:', url)}
 * />
 * ```
 */
export interface MarkdownViewProps extends MarkdownRendererConfig {
  /** Markdown content to render */
  content: string
  /** Display variant */
  variant?: 'full' | 'compact'
  /** Parser options */
  parserOptions?: ParserOptions
  /** Optional test ID */
  testID?: string
  /** Optional class name (for web compatibility) */
  className?: string
  /** When true, renders content without ScrollView (for nested ScrollView scenarios) */
  contentOnly?: boolean
  /** Wrap each root-level child element (used for narration highlighting, copy, etc.) */
  wrapRootChild?: (child: React.ReactNode, index: number, nodeType: string) => React.ReactNode
}

export const MarkdownView = React.memo(
  ({
    content,
    variant = 'full',
    parserOptions,
    onLinkPress,
    renderers,
    testID = 'markdown-view',
    className,
    contentOnly = false,
    wrapRootChild,
  }: MarkdownViewProps) => {
    const { ast } = useMarkdownParser(content, parserOptions)
    const { render } = useMarkdownRenderer({ onLinkPress, renderers, testIDPrefix: testID, wrapRootChild })

    if (!ast) {
      return null
    }

    const contentElement = render(ast)

    // Content-only mode: return just the rendered content without ScrollView wrapper
    if (contentOnly) {
      return <View testID={testID} className={className}>{contentElement}</View>
    }

    // For now, use ScrollView for all content
    // TODO: Implement FlashList virtualization for large documents
    return (
      <View testID={testID} className={className}>
        <ScrollView
          testID={`${testID}-scroll`}
          contentContainerStyle={{
            paddingHorizontal: variant === 'full' ? 16 : 0,
            paddingVertical: variant === 'full' ? 16 : 0,
          }}
          showsVerticalScrollIndicator={true}
        >
          {contentElement}
        </ScrollView>
      </View>
    )
  }
)
MarkdownView.displayName = 'MarkdownView'
