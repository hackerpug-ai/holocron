import type { Content } from 'mdast'
import {
  Blockquote,
  Code,
  List,
  Heading,
  Link,
  Paragraph,
  Strong,
  Emphasis,
  InlineCode,
  Text as MdastText,
  ThematicBreak,
  Table,
} from 'mdast'
import * as React from 'react'
import { View } from 'react-native'
import {
  BlockquoteRenderer,
  HeadingRenderer,
  ParagraphRenderer,
  ListRenderer,
  ListItemRenderer,
  ThematicBreakRenderer,
} from './BlockElements'
import {
  LinkRenderer,
  EmphasisRenderer,
  StrongRenderer,
  InlineCodeRenderer,
  TextRenderer,
} from './InlineElements'
import { CodeBlockRenderer } from './CodeBlock'
import { TableRenderer, TableRowRenderer, TableCellRenderer } from './TableRenderer'
import { CalloutRenderer } from './CalloutRenderer'

/**
 * Type guard to check if node has children property
 */
function isParent(node: Content): node is any {
  return 'children' in node && Array.isArray((node as any).children)
}

/**
 * Props passed to all node renderers
 */
export interface RendererProps {
  node: any
  children?: React.ReactNode
  index?: number
  parentOrdered?: boolean
  onLinkPress?: (url: string) => void
  testID?: string
}

/**
 * Custom renderers for overriding default node rendering
 */
export interface CustomRenderers {
  heading?: (props: RendererProps) => React.ReactNode
  paragraph?: (props: RendererProps) => React.ReactNode
  list?: (props: RendererProps) => React.ReactNode
  listItem?: (props: RendererProps) => React.ReactNode
  link?: (props: RendererProps) => React.ReactNode
  emphasis?: (props: RendererProps) => React.ReactNode
  strong?: (props: RendererProps) => React.ReactNode
  inlineCode?: (props: RendererProps) => React.ReactNode
  code?: (props: RendererProps) => React.ReactNode
  thematicBreak?: (props: RendererProps) => React.ReactNode
  table?: (props: RendererProps) => React.ReactNode
  callout?: (props: RendererProps) => React.ReactNode
}

export interface NodeRendererProps {
  node: Content
  renderers?: CustomRenderers
  onLinkPress?: (url: string) => void
  testID?: string
  index?: number
  parentOrdered?: boolean
}

/**
 * NodeRenderer maps MDAST nodes to React components
 * This is the core renderer that dispatches to specific element renderers
 */
export const NodeRenderer = React.memo(
  ({ node, renderers, onLinkPress, testID, index, parentOrdered }: NodeRendererProps) => {
    const children = isParent(node) && (
      <React.Fragment>
        {(node as any).children.map((child: any, childIndex: number) => (
          <NodeRenderer
            key={getNodeKey(child, childIndex)}
            node={child}
            renderers={renderers}
            onLinkPress={onLinkPress}
            testID={testID ? `${testID}-${childIndex}` : undefined}
            index={childIndex}
            parentOrdered={node.type === 'list' ? ((node as any).ordered ?? false) : undefined}
          />
        ))}
      </React.Fragment>
    )

    // Custom renderers
    if (renderers) {
      switch (node.type as string) {
        case 'heading':
          return renderers.heading ? (
            renderers.heading({ node, children, testID })
          ) : (
            renderHeading(node as Heading, children, testID)
          )
        case 'paragraph':
          return renderers.paragraph ? (
            renderers.paragraph({ node, children, testID })
          ) : (
            renderParagraph(node as Paragraph, children, testID)
          )
        case 'list':
          return renderers.list ? (
            renderers.list({ node, children, testID })
          ) : (
            renderList(node as List, children, testID)
          )
        case 'listItem':
          return renderers.listItem ? (
            renderers.listItem({ node, children, testID, index, parentOrdered })
          ) : (
            renderListItem(node, children, testID, index ?? 0, parentOrdered ?? false)
          )
        case 'link':
          return renderers.link ? (
            renderers.link({ node, children, onLinkPress, testID })
          ) : (
            renderLink(node as Link, children, onLinkPress, testID)
          )
        case 'emphasis':
          return renderers.emphasis ? (
            renderers.emphasis({ node, children, testID })
          ) : (
            <EmphasisRenderer node={node as Emphasis} testID={testID}>
              {children}
            </EmphasisRenderer>
          )
        case 'strong':
          return renderers.strong ? (
            renderers.strong({ node, children, testID })
          ) : (
            <StrongRenderer node={node as Strong} testID={testID}>
              {children}
            </StrongRenderer>
          )
        case 'inlineCode':
          return renderers.inlineCode ? (
            renderers.inlineCode({ node, children: (node as InlineCode).value, testID })
          ) : (
            <InlineCodeRenderer node={node as InlineCode} testID={testID}>
              {(node as InlineCode).value}
            </InlineCodeRenderer>
          )
        case 'code':
          return renderers.code ? (
            renderers.code({ node, children: (node as Code).value, testID })
          ) : (
            <CodeBlockRenderer node={node as Code} testID={testID} />
          )
        case 'thematicBreak':
          return renderers.thematicBreak ? (
            renderers.thematicBreak({ node, testID })
          ) : (
            <ThematicBreakRenderer node={node as ThematicBreak} testID={testID} />
          )
        case 'table':
          return renderers.table ? (
            renderers.table({ node, children, testID })
          ) : (
            renderTable(node as Table, children, testID)
          )
        case 'blockquote':
          return (
            <BlockquoteRenderer node={node as Blockquote} testID={testID}>
              {children}
            </BlockquoteRenderer>
          )
        case 'callout':
          return renderers.callout ? (
            renderers.callout({ node, children, testID })
          ) : (
            <CalloutRenderer node={node as any} testID={testID} />
          )
      }
    }

    // Default renderers - use string comparison for all node types including 'callout'
    switch (node.type as string) {
      case 'heading':
        return renderHeading(node as Heading, children, testID)
      case 'paragraph':
        return renderParagraph(node as Paragraph, children, testID)
      case 'list':
        return renderList(node as List, children, testID)
      case 'listItem':
        return renderListItem(node, children, testID, index ?? 0, parentOrdered ?? false)
      case 'link':
        return renderLink(node as Link, children, onLinkPress, testID)
      case 'emphasis':
        return (
          <EmphasisRenderer node={node as Emphasis} testID={testID}>
            {children}
          </EmphasisRenderer>
        )
      case 'strong':
        return (
          <StrongRenderer node={node as Strong} testID={testID}>
            {children}
          </StrongRenderer>
        )
      case 'inlineCode':
        return (
          <InlineCodeRenderer node={node as InlineCode} testID={testID}>
            {(node as InlineCode).value}
          </InlineCodeRenderer>
        )
      case 'code':
        return <CodeBlockRenderer node={node as Code} testID={testID} />
      case 'thematicBreak':
        return <ThematicBreakRenderer node={node as ThematicBreak} testID={testID} />
      case 'text':
        return <TextRenderer node={node as MdastText} testID={testID}>{(node as MdastText).value}</TextRenderer>
      case 'table':
        return renderTable(node as Table, children, testID)
      case 'tableRow':
        return renderTableRow(node, children, testID)
      case 'tableCell':
        return renderTableCell(node, children, testID, index)
      case 'blockquote':
        return (
          <BlockquoteRenderer node={node as Blockquote} testID={testID}>
            {children}
          </BlockquoteRenderer>
        )
      case 'callout':
        return <CalloutRenderer node={node as any} testID={testID} />
      default:
        return <View testID={testID}>{children}</View>
    }
  }
)
NodeRenderer.displayName = 'NodeRenderer'

// ============================================================================
// HELPER RENDERERS
// ============================================================================

function renderHeading(node: Heading, children: React.ReactNode, testID?: string) {
  return <HeadingRenderer node={node} testID={testID}>{children}</HeadingRenderer>
}

function renderParagraph(node: Paragraph, children: React.ReactNode, testID?: string) {
  return <ParagraphRenderer node={node} testID={testID}>{children}</ParagraphRenderer>
}

function renderList(node: List, children: React.ReactNode, testID?: string) {
  return <ListRenderer node={node} testID={testID}>{children}</ListRenderer>
}

function renderListItem(node: any, children: React.ReactNode, testID?: string, index: number = 0, parentOrdered: boolean = false) {
  return (
    <ListItemRenderer
      node={node}
      index={index}
      parentOrdered={parentOrdered}
      testID={testID}
    >
      {children}
    </ListItemRenderer>
  )
}

function renderLink(
  node: Link,
  children: React.ReactNode,
  onLinkPress?: (url: string) => void,
  testID?: string
) {
  return (
    <LinkRenderer node={node} onLinkPress={onLinkPress} testID={testID}>
      {children}
    </LinkRenderer>
  )
}

function renderTable(node: Table, children: React.ReactNode, testID?: string) {
  return <TableRenderer node={node} testID={testID}>{children}</TableRenderer>
}

function renderTableRow(node: any, children: React.ReactNode, testID?: string) {
  return <TableRowRenderer node={node} isHeader={node.isHeader} testID={testID}>{children}</TableRowRenderer>
}

function renderTableCell(node: any, children: React.ReactNode, testID?: string, index?: number) {
  return <TableCellRenderer node={node} isHeader={node.isHeader} columnIndex={index} testID={testID}>{children}</TableCellRenderer>
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Generate a unique key for each node
 */
function getNodeKey(node: Content, index: number): string {
  if (node.type === 'text') {
    return `text-${index}-${String((node as MdastText).value).slice(0, 20)}`
  }
  if (node.type === 'heading') {
    return `heading-${(node as Heading).depth}-${index}`
  }
  return `${node.type}-${index}`
}

/**
 * Check if a node is a table header row
 */
/**
 * Process table to mark header rows
 */
export function processTable(tableNode: Table): Table {
  if (tableNode.children.length > 0) {
    // Mark first row as header
    const firstRow = tableNode.children[0]
    if (firstRow.type === 'tableRow') {
      (firstRow as any).isHeader = true
    }
  }
  return tableNode
}
