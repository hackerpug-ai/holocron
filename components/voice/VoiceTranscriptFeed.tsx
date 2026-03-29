/**
 * VoiceTranscriptFeed
 *
 * Scrollable transcript display within the voice overlay.
 *
 * Features:
 * - FlatList of TranscriptEntry items (not ScrollView, for performance)
 * - User entries: right-aligned, bg-secondary background, radius.lg
 * - Agent entries: left-aligned, bg-muted background, 3dp left accent bar in colors.primary, radius.lg
 * - Auto-scrolls to bottom on new entries via ref.current.scrollToEnd()
 * - Partial entries (isPartial: true) show blinking cursor (Animated.View, 500ms opacity loop)
 * - Font: text-sm (14px)
 * - maxHeight ~220dp
 *
 * Uses Paper Text component, theme tokens from useTheme().
 */

import { useEffect, useRef } from 'react'
import { Animated, FlatList, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/text'
import { useTheme } from '@/hooks/use-theme'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TranscriptEntry {
  id: string
  speaker: 'user' | 'agent'
  text: string
  timestamp: string
  isPartial?: boolean
}

export interface VoiceTranscriptFeedProps {
  /** Array of transcript entries to display */
  transcript: TranscriptEntry[]
  /** Optional testID for the root container */
  testID?: string
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/**
 * Blinking cursor for partial entries.
 * Uses 500ms opacity loop (on/off).
 */
function BlinkingCursor({ color }: { color: string }) {
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ])
    )
    blink.start()
    return () => blink.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[
        styles.cursor,
        {
          backgroundColor: color,
          opacity,
        },
      ]}
    />
  )
}

/**
 * Individual transcript entry.
 */
function TranscriptEntryItem({
  entry,
  colors,
  spacing,
  radius,
  isLast,
}: {
  entry: TranscriptEntry
  colors: ReturnType<typeof useTheme>['colors']
  spacing: ReturnType<typeof useTheme>['spacing']
  radius: ReturnType<typeof useTheme>['radius']
  isLast: boolean
}) {
  const isUser = entry.speaker === 'user'

  return (
    <View
      testID={`voice-assistant-transcript-entry-${entry.id}`}
      style={[
        styles.entryContainer,
        isUser ? styles.userEntry : styles.agentEntry,
        {
          marginBottom: isLast ? 0 : spacing.sm,
        },
      ]}
    >
      {/* Accent bar for agent entries */}
      {!isUser && (
        <View
          style={[
            styles.accentBar,
            {
              backgroundColor: colors.primary,
              borderTopLeftRadius: radius.lg,
              borderBottomLeftRadius: radius.lg,
            },
          ]}
        />
      )}

      {/* Entry content */}
      <View
        style={[
          styles.entryContent,
          {
            backgroundColor: isUser ? colors.secondary : colors.muted,
            borderRadius: radius.lg,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          },
        ]}
      >
        <Text
          variant="p"
          className="text-sm"
          style={{ color: isUser ? colors.primaryForeground : colors.foreground }}
        >
          {entry.text}
        </Text>

        {/* Blinking cursor for partial entries */}
        {entry.isPartial && <BlinkingCursor color={isUser ? colors.primaryForeground : colors.foreground} />}
      </View>
    </View>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

/**
 * VoiceTranscriptFeed renders a scrollable transcript display.
 *
 * @example
 * ```tsx
 * <VoiceTranscriptFeed
 *   transcript={[
 *     { id: '1', speaker: 'user', text: 'Hello', timestamp: '12:00:00' },
 *     { id: '2', speaker: 'agent', text: 'Hi there!', timestamp: '12:00:01', isPartial: true },
 *   ]}
 * />
 * ```
 */
export function VoiceTranscriptFeed({
  transcript,
  testID = 'voice-transcript-feed',
}: VoiceTranscriptFeedProps) {
  const { colors, spacing, radius } = useTheme()
  const flatListRef = useRef<FlatList<TranscriptEntry>>(null)

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (transcript.length > 0) {
      // Small delay to ensure layout is complete
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [transcript])

  const renderItem = ({ item, index }: { item: TranscriptEntry; index: number }) => (
    <TranscriptEntryItem
      entry={item}
      colors={colors}
      spacing={spacing}
      radius={radius}
      isLast={index === transcript.length - 1}
    />
  )

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          maxHeight: 220,
          paddingHorizontal: spacing.lg,
        },
      ]}
    >
      <FlatList
        ref={flatListRef}
        data={transcript}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        inverted={false}
        scrollEnabled={transcript.length > 0}
        contentContainerStyle={[
          styles.listContent,
          transcript.length === 0 && styles.emptyList,
        ]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text variant="muted" className="text-sm" style={{ color: colors.mutedForeground }}>
              No transcript yet
            </Text>
          </View>
        }
      />
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  listContent: {
    paddingVertical: 8, // Small padding for top/bottom breathing room
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  entryContainer: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 8, // Default spacing (overridden by prop)
  },
  userEntry: {
    justifyContent: 'flex-end',
  },
  agentEntry: {
    justifyContent: 'flex-start',
  },
  accentBar: {
    width: 3, // Fixed width for accent bar
    marginRight: 0,
  },
  entryContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  cursor: {
    width: 2,
    height: 16, // ~14px font size + a bit
    marginLeft: 2,
  },
})
