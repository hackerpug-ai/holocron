import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'
import type { Code } from 'mdast'
// TODO: Implement proper syntax highlighting with react-native-render-html
// For now, using basic code block styling
// import Prism from 'react-syntax-highlighter/dist/esm/prism'
import * as React from 'react'
import { Platform, ScrollView, StyleSheet, View } from 'react-native'

/**
 * CodeBlock renderer handles fenced code blocks with syntax highlighting
 * Uses react-syntax-highlighter for language detection and coloring
 */

interface CodeBlockProps {
  node: Code
  testID?: string
}

export const CodeBlockRenderer = React.memo(({ node, testID }: CodeBlockProps) => {
  const { spacing, radius, colors, typography } = useTheme()
  const styles = useStyles(typography)

  // Get language from node meta (e.g., ```typescript)
  const language = node.lang || 'text'
  const code = node.value

  // Render code with monospace styling
  // TODO: Consider using react-native-render-html for full syntax highlighting
  const renderCodeContent = () => {
    return (
      <Text
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
          fontSize: typography.bodySmall.fontSize,
          lineHeight: 22,
          color: colors.codeBlockForeground,
        }}
      >
        {code}
      </Text>
    )
  }

  return (
    <View
      testID={testID}
      style={[
        styles.codeBlock,
        {
          backgroundColor: colors.codeBlockBg,
          padding: spacing.lg,
          borderRadius: radius.lg,
          marginBottom: spacing.lg,
          borderLeftWidth: 4,
          borderLeftColor: colors.link,
        },
      ]}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={`Code block in ${language}`}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        {renderCodeContent()}
      </ScrollView>
    </View>
  )
})
CodeBlockRenderer.displayName = 'CodeBlockRenderer'

const useStyles = (_typography: any) => {
  return StyleSheet.create({
    codeBlock: {
      overflow: 'hidden',
    },
  })
}
