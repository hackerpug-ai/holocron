import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { CalloutNode } from '../parsers/callout-plugin'
import type { CalloutType } from '../parsers/callout-plugin'
import * as React from 'react'

/**
 * CalloutRenderer maps custom callout syntax to Alert component
 *
 * Maps:
 * - [!NOTE], [!TIP], [!IMPORTANT] → default variant
 * - [!WARNING], [!CAUTION] → destructive variant
 */

interface CalloutRendererProps {
  node: CalloutNode
  testID?: string
}

// Map callout types to display titles and variants
const CALLOUT_CONFIG: Record<
  CalloutType,
  { title: string; variant: 'default' | 'destructive' }
> = {
  NOTE: {
    title: 'Note',
    variant: 'default',
  },
  TIP: {
    title: 'Tip',
    variant: 'default',
  },
  IMPORTANT: {
    title: 'Important',
    variant: 'default',
  },
  WARNING: {
    title: 'Warning',
    variant: 'destructive',
  },
  CAUTION: {
    title: 'Caution',
    variant: 'destructive',
  },
}

export const CalloutRenderer = React.memo(
  ({ node, testID }: CalloutRendererProps) => {
    const calloutType = node.data?.calloutType || 'NOTE'
    const config = CALLOUT_CONFIG[calloutType]

    // Get title from first text node or use default
    const firstChild = node.children[0]
    const customTitle = firstChild?.type === 'text' ? firstChild.value : null
    const title = customTitle || config.title

    // Get content excluding the title text node
    const content =
      node.children.length > 1
        ? node.children.slice(1)
        : customTitle
          ? []
          : node.children

    return (
      <Alert
        variant={config.variant}
        testID={testID}
        className="my-4"
      >
        <AlertTitle>{title}</AlertTitle>
        {content.length > 0 && (
          <AlertDescription>
            {content.map((child, index) => (
              <React.Fragment key={index}>
                {child.type === 'text' && child.value}
              </React.Fragment>
            ))}
          </AlertDescription>
        )}
      </Alert>
    )
  }
)
CalloutRenderer.displayName = 'CalloutRenderer'
