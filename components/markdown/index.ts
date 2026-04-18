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

export type { UseMarkdownParserResult } from './hooks/useMarkdownParser';
// Hooks
export { useMarkdownParser } from './hooks/useMarkdownParser';
export type {
  MarkdownRendererConfig,
  UseMarkdownRendererResult,
} from './hooks/useMarkdownRenderer';
export { useMarkdownRenderer } from './hooks/useMarkdownRenderer';
export type { MarkdownTextProps } from './MarkdownText';
export { MarkdownText } from './MarkdownText';
export type { MarkdownViewProps } from './MarkdownView';
// Entry point components
export { MarkdownView } from './MarkdownView';
export type { ParserOptions } from './parsers';
// Parser exports
export {
  countNodes,
  getContentSize,
  parseMarkdown,
  shouldVirtualize,
} from './parsers';
export type { CalloutNode, CalloutType, getCalloutVariant } from './parsers/callout-plugin';
export { remarkCalloutPlugin } from './parsers/callout-plugin';
export {
  HeadingRenderer,
  ListItemRenderer,
  ListRenderer,
  ParagraphRenderer,
  ThematicBreakRenderer,
} from './renderers/BlockElements';
export { CalloutRenderer } from './renderers/CalloutRenderer';
export { CodeBlockRenderer } from './renderers/CodeBlock';

export {
  EmphasisRenderer,
  InlineCodeRenderer,
  LinkRenderer,
  StrongRenderer,
  TextRenderer,
} from './renderers/InlineElements';
export type { CustomRenderers, RendererProps } from './renderers/NodeRenderer';
// Renderer exports (for advanced usage)
export { NodeRenderer } from './renderers/NodeRenderer';
export {
  TableCellRenderer,
  TableRenderer,
  TableRowRenderer,
} from './renderers/TableRenderer';
