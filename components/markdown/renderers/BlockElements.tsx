import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import type { Blockquote, Heading, List, ListItem, Paragraph, ThematicBreak } from 'mdast'
import * as React from 'react'
import { StyleSheet, View } from 'react-native'

/**
 * BlockElements renderer handles all block-level markdown elements
 * including headings, paragraphs, lists, and thematic breaks
 */

// ============================================================================
// HEADINGS
// ============================================================================

interface HeadingProps {
  node: Heading
  children: React.ReactNode
  testID?: string
}

export const HeadingRenderer = React.memo(
  ({ node, children, testID }: HeadingProps) => {
    const { spacing } = useTheme()

    // Map MDAST heading depth to Text variant
    // h1 (depth 1) → variant="h1"
    // h2 (depth 2) → variant="h2"
    // h3 (depth 3) → variant="h3"
    // h4 (depth 4) → variant="h4"
    // h5 (depth 5) → variant="h4" (use h4 styling for h5/h6)
    // h6 (depth 6) → variant="h4"
    const getVariant = (): 'h1' | 'h2' | 'h3' | 'h4' => {
      if (node.depth === 1) return 'h1'
      if (node.depth === 2) return 'h2'
      if (node.depth === 3) return 'h3'
      return 'h4' // h4, h5, h6 all use h4 variant
    }

    const getMarginTop = () => {
      if (node.depth === 1) return spacing.xl
      if (node.depth === 2) return spacing.xl
      return spacing.lg
    }

    const variant = getVariant()
    const styles = useStyles()

    return (
      <Text
        variant={variant}
        testID={testID}
        style={[
          styles.heading,
          { marginTop: getMarginTop(), marginBottom: spacing.md },
        ]}
      >
        {children}
      </Text>
    )
  }
)
HeadingRenderer.displayName = 'HeadingRenderer'

// ============================================================================
// PARAGRAPHS
// ============================================================================

interface ParagraphProps {
  node: Paragraph
  children: React.ReactNode
  testID?: string
}

export const ParagraphRenderer = React.memo(
  ({ children, testID }: ParagraphProps) => {
    const { spacing } = useTheme()
    const styles = useStyles()

    return (
      <Text
        variant="p"
        testID={testID}
        style={[styles.paragraph, { marginBottom: spacing.lg }]}
      >
        {children}
      </Text>
    )
  }
)
ParagraphRenderer.displayName = 'ParagraphRenderer'

// ============================================================================
// LISTS
// ============================================================================

interface ListProps {
  node: List
  children: React.ReactNode
  testID?: string
}

export const ListRenderer = React.memo(({ node, children, testID }: ListProps) => {
  const { spacing } = useTheme()
  const styles = useStyles()

  const listStyle = node.ordered ? styles.orderedList : styles.unorderedList

  return (
    <View testID={testID} style={[listStyle, { marginBottom: spacing.lg }]}>
      {children}
    </View>
  )
})
ListRenderer.displayName = 'ListRenderer'

interface ListItemProps {
  node: ListItem
  index: number
  parentOrdered: boolean
  children: React.ReactNode
  testID?: string
}

export const ListItemRenderer = React.memo(
  ({ node, index, parentOrdered, children, testID }: ListItemProps) => {
    const { spacing, colors } = useTheme()
    const styles = useStyles()

    const bulletText = parentOrdered ? `${index + 1}.` : '•'

    // Use flexbox layout for proper alignment of bullet and content
    // This handles both plain text and links (which use Text with onPress)
    return (
      <View
        testID={testID}
        style={[styles.listItem, { marginBottom: spacing.sm }]}
      >
        <Text
          variant="p"
          style={[styles.bullet, { color: colors.foreground }]}
        >
          {bulletText}
        </Text>
        <View style={styles.listItemContent}>
          {children}
        </View>
      </View>
    )
  }
)
ListItemRenderer.displayName = 'ListItemRenderer'

// ============================================================================
// BLOCKQUOTE
// ============================================================================

interface BlockquoteProps {
  node: Blockquote
  children: React.ReactNode
  testID?: string
}

export const BlockquoteRenderer = React.memo(
  ({ children, testID }: BlockquoteProps) => {
    const { spacing, colors } = useTheme()

    return (
      <View
        testID={testID}
        style={{
          borderLeftWidth: 3,
          borderLeftColor: colors.border,
          paddingLeft: spacing.md,
          marginBottom: spacing.lg,
          opacity: 0.85,
        }}
      >
        {children}
      </View>
    )
  }
)
BlockquoteRenderer.displayName = 'BlockquoteRenderer'

// ============================================================================
// THEMATIC BREAK (Horizontal Rule)
// ============================================================================

interface ThematicBreakProps {
  node: ThematicBreak
  testID?: string
}

export const ThematicBreakRenderer = React.memo(
  ({ testID }: ThematicBreakProps) => {
    const { spacing, colors } = useTheme()
    const styles = useStyles()

    return (
      <View
        testID={testID}
        style={[
          styles.hr,
          {
            backgroundColor: colors.border,
            marginVertical: spacing.xl,
          },
        ]}
      />
    )
  }
)
ThematicBreakRenderer.displayName = 'ThematicBreakRenderer'

// ============================================================================
// STYLES
// ============================================================================

const useStyles = () => {
  const { spacing } = useTheme()

  return StyleSheet.create({
    heading: {
      // Colors from Text variant
    },
    paragraph: {
      // Spacing handled via prop
    },
    unorderedList: {
      paddingLeft: spacing.lg,
    },
    orderedList: {
      paddingLeft: spacing.lg,
    },
    listItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    bullet: {
      marginRight: spacing.sm,
      lineHeight: 24,
    },
    listItemContent: {
      flex: 1,
    },
    hr: {
      height: 1,
      width: '100%',
    },
  })
}
