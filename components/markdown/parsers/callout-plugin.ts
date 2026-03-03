import type { Plugin } from 'unified'
import type { Root, Parent, Paragraph, Text } from 'mdast'
import { visit } from 'unist-util-visit'

/**
 * Callout types that map to Alert component variants
 */
export type CalloutType = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION'

/**
 * Callout node that extends MDAST
 */
export interface CalloutNode extends Parent {
  type: 'callout'
  data?: {
    calloutType: CalloutType
  }
  children: Array<Text | Paragraph>
}

/**
 * Regex pattern to match callout syntax: [!TYPE]
 * Matches: [!NOTE], [!WARNING], [!TIP], [!IMPORTANT], [!CAUTION]
 */
const CALLOUT_PATTERN = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i

/**
 * Determine Alert variant from callout type
 * - NOTE, TIP, IMPORTANT → default variant
 * - WARNING, CAUTION → destructive variant
 */
export function getCalloutVariant(type: CalloutType): 'default' | 'destructive' {
  return ['WARNING', 'CAUTION'].includes(type) ? 'destructive' : 'default'
}

/**
 * Remark plugin to parse custom callout syntax
 *
 * Transforms paragraphs starting with [!TYPE] into custom callout nodes:
 *
 * Input markdown:
 *   [!NOTE] This is a note
 *
 * Output MDAST:
 *   {
 *     type: 'callout',
 *     data: { calloutType: 'NOTE' },
 *     children: [
 *       { type: 'text', value: 'This is a note' }
 *     ]
 *   }
 */
export const remarkCalloutPlugin: Plugin<[], Root> = function remarkCalloutPlugin() {
  return function transformer(tree: Root): void {
    visit(tree, 'paragraph', (node: Paragraph, index, parent) => {
      if (!parent || index === undefined) return

      const firstChild = node.children[0]
      if (!firstChild || firstChild.type !== 'text') return

      const match = firstChild.value.match(CALLOUT_PATTERN)
      if (!match) return

      const [, type, title] = match
      const calloutType = type.toUpperCase() as CalloutType

      // Transform paragraph into callout node
      const calloutNode: CalloutNode = {
        type: 'callout',
        data: {
          calloutType,
        },
        children: [],
      }

      // Add title text if present
      if (title) {
        calloutNode.children.push({
          type: 'text',
          value: title,
        })
      }

      // Replace the paragraph with the callout node
      parent.children[index] = calloutNode as any
    })
  }
}
