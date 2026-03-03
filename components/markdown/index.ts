/**
 * Custom Markdown Renderer for React Native
 *
 * A robust, reusable markdown renderer that prioritizes design system
 * components over utility classes. Supports both short chat messages and
 * long-form articles with maximum performance optimization.
 *
 * @example
 * ```tsx
 * // For long documents (articles, documentation)
 * import { MarkdownView } from '@/components/markdown'
 *
 * <MarkdownView
 *   content={markdown}
 *   onLinkPress={(url) => Linking.openURL(url)}
 * />
 *
 * // For short chat messages
 * import { MarkdownText } from '@/components/markdown'
 *
 * <MarkdownText
 *   content={message}
 *   onLinkPress={(url) => Linking.openURL(url)}
 * />
 * ```
 */

// Entry point components
export { MarkdownView } from './MarkdownView'
export type { MarkdownViewProps } from './MarkdownView'

export { MarkdownText } from './MarkdownText'
export type { MarkdownTextProps } from './MarkdownText'

// Hooks
export { useMarkdownParser } from './hooks/useMarkdownParser'
export type { UseMarkdownParserResult } from './hooks/useMarkdownParser'

export { useMarkdownRenderer } from './hooks/useMarkdownRenderer'
export type {
  MarkdownRendererConfig,
  UseMarkdownRendererResult,
} from './hooks/useMarkdownRenderer'

// Parser exports
export {
  parseMarkdown,
  countNodes,
  getContentSize,
  shouldVirtualize,
} from './parsers'
export type { ParserOptions } from './parsers'

export { remarkCalloutPlugin } from './parsers/callout-plugin'
export type { CalloutNode, CalloutType, getCalloutVariant } from './parsers/callout-plugin'

// Renderer exports (for advanced usage)
export { NodeRenderer } from './renderers/NodeRenderer'
export type { CustomRenderers, RendererProps } from './renderers/NodeRenderer'

export {
  HeadingRenderer,
  ParagraphRenderer,
  ListRenderer,
  ListItemRenderer,
  ThematicBreakRenderer,
} from './renderers/BlockElements'

export {
  LinkRenderer,
  EmphasisRenderer,
  StrongRenderer,
  InlineCodeRenderer,
  TextRenderer,
} from './renderers/InlineElements'

export { CodeBlockRenderer } from './renderers/CodeBlock'

export {
  TableRenderer,
  TableRowRenderer,
  TableCellRenderer,
} from './renderers/TableRenderer'

export { CalloutRenderer } from './renderers/CalloutRenderer'
