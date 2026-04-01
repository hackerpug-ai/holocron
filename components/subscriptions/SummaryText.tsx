/**
 * SummaryText - Shared component for displaying expandable/collapsible summaries
 *
 * Displays:
 * - Summary text truncated to 2-3 lines by default
 * - "Read more" button when text exceeds maxLength
 * - "Show less" button when expanded
 * - Smooth expand/collapse animation
 *
 * Returns null when no summary is provided (cards show title-only).
 */

import { useState } from 'react'
import { Pressable, LayoutAnimation, Platform, UIManager } from 'react-native'
import { Text } from '@/components/ui/text'

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

export interface SummaryTextProps {
  /** Optional summary text to display */
  summary?: string
  /** Title fallback (used when summary is undefined) */
  title: string
  /** Maximum lines to show when collapsed */
  maxLines?: number
  /** Maximum character length before truncation */
  maxLength?: number
  /** Test ID for testing */
  testID?: string
}

/**
 * SummaryText component
 *
 * @example
 * ```tsx
 * <SummaryText
 *   summary="This is a long summary that needs truncation..."
 *   title="Article Title"
 *   testID="video-card-summary"
 * />
 * ```
 */
export function SummaryText({
  summary,
  title: _title,
  maxLines = 3,
  maxLength = 150,
  testID = 'card-summary',
}: SummaryTextProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Return null if no summary - card shows title-only
  if (!summary) {
    return null
  }

  const shouldTruncate = summary.length > maxLength && !isExpanded

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setIsExpanded(!isExpanded)
  }

  return (
    <Pressable
      onPress={shouldTruncate ? toggleExpand : undefined}
      className="gap-1"
      testID={testID}
    >
      <Text
        variant="small"
        className="text-muted-foreground"
        numberOfLines={isExpanded ? undefined : maxLines}
        testID={`${testID}-text`}
      >
        {shouldTruncate ? summary.slice(0, maxLength) + '...' : summary}
      </Text>
      {summary.length > maxLength && (
        <Text
          variant="small"
          className="text-primary"
          onPress={toggleExpand}
          testID={`${testID}-toggle`}
        >
          {isExpanded ? 'Show less' : 'Read more'}
        </Text>
      )}
    </Pressable>
  )
}
