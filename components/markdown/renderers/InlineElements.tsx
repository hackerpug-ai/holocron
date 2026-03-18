import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import type { InlineCode, Link, Strong, Emphasis, Text as MdastText } from 'mdast'
import * as React from 'react'
import { Platform, StyleSheet, Text as RNText } from 'react-native'

/**
 * InlineElements renderer handles inline markdown elements
 * including links, emphasis, strong text, and inline code
 */

// ============================================================================
// LINKS
// ============================================================================

interface LinkProps {
  node: Link
  children: React.ReactNode
  onLinkPress?: (url: string) => void
  testID?: string
}

export const LinkRenderer = React.memo(
  ({ node, children, onLinkPress, testID }: LinkProps) => {
    const { colors } = useTheme()
    const url = node.url

    const handlePress = () => {
      if (onLinkPress) {
        onLinkPress(url)
      }
    }

    // Use Text with onPress for inline rendering (can be nested in other Text)
    return (
      <Text
        onPress={handlePress}
        testID={testID}
        accessible={true}
        accessibilityRole="link"
        accessibilityLabel={`Link to ${url}`}
        style={{ color: colors.link, textDecorationLine: 'underline' }}
      >
        {children}
      </Text>
    )
  }
)
LinkRenderer.displayName = 'LinkRenderer'

// ============================================================================
// EMPHASIS (Italic)
// ============================================================================

interface EmphasisProps {
  node: Emphasis
  children: React.ReactNode
  testID?: string
}

export const EmphasisRenderer = React.memo(
  ({ children, testID }: EmphasisProps) => {
    return (
      <Text
        style={{ fontStyle: 'italic' }}
        testID={testID}
      >
        {children}
      </Text>
    )
  }
)
EmphasisRenderer.displayName = 'EmphasisRenderer'

// ============================================================================
// STRONG (Bold)
// ============================================================================

interface StrongProps {
  node: Strong
  children: React.ReactNode
  testID?: string
}

export const StrongRenderer = React.memo(
  ({ children, testID }: StrongProps) => {
    return (
      <Text
        style={{ fontWeight: '700' }}
        testID={testID}
      >
        {children}
      </Text>
    )
  }
)
StrongRenderer.displayName = 'StrongRenderer'

// ============================================================================
// INLINE CODE
// ============================================================================

interface InlineCodeProps {
  node: InlineCode
  children: React.ReactNode
  testID?: string
}

export const InlineCodeRenderer = React.memo(
  ({ children, testID }: InlineCodeProps) => {
    const { spacing, colors, radius } = useTheme()
    const styles = useStyles()

    return (
      <Text
        variant="code"
        testID={testID}
        style={[
          styles.inlineCode,
          {
            backgroundColor: colors.codeInlineBg,
            color: colors.codeInline,
            paddingHorizontal: spacing.sm,
            paddingVertical: 3,
            borderRadius: radius.sm,
          },
        ]}
      >
        {children}
      </Text>
    )
  }
)
InlineCodeRenderer.displayName = 'InlineCodeRenderer'

// ============================================================================
// TEXT (Plain text nodes)
// ============================================================================

interface TextProps {
  node: MdastText
  children: React.ReactNode
  testID?: string
}

export const TextRenderer = React.memo(({ children, testID }: TextProps) => {
  return <RNText testID={testID}>{children}</RNText>
})
TextRenderer.displayName = 'TextRenderer'

// ============================================================================
// STYLES
// ============================================================================

const useStyles = () => {
  return StyleSheet.create({
    inlineCode: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 14,
    },
  })
}
