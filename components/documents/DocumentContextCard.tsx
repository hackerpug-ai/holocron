/**
 * DocumentContextCard - Shows a document reference in chat
 * Displays full doc or excerpt with visual distinction between the two.
 */

import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { FileText, Scissors, Tag } from '@/components/ui/icons'
import { useTheme } from '@/hooks/use-theme'
import type { DocumentContextCardData } from '@/lib/types/chat'

export interface DocumentContextCardProps {
  data: DocumentContextCardData
  onPress?: () => void
  testID?: string
}

export function DocumentContextCard({
  data,
  testID = 'document-context-card',
}: DocumentContextCardProps) {
  const { colors: themeColors } = useTheme()
  const isExcerpt = data.scope === 'excerpt'

  return (
    <Card testID={testID} className="border-border bg-card overflow-hidden">
      {/* Accent bar - primary for full, muted for excerpt */}
      <View
        className="h-1"
        style={{ backgroundColor: isExcerpt ? themeColors.mutedForeground : themeColors.primary }}
      />

      <View className="p-4">
        {/* Header */}
        <View className="mb-2 flex-row items-center gap-2">
          <View
            className="rounded-full p-1"
            style={{ backgroundColor: isExcerpt ? `${themeColors.mutedForeground}20` : `${themeColors.primary}20` }}
          >
            {isExcerpt ? (
              <Scissors size={14} color={themeColors.mutedForeground} />
            ) : (
              <FileText size={14} color={themeColors.primary} />
            )}
          </View>
          <Text className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            {isExcerpt ? 'Document Excerpt' : 'Full Document'}
          </Text>
        </View>

        {/* Title */}
        <Text className="text-foreground text-base font-semibold" numberOfLines={2}>
          {data.title}
        </Text>

        {/* Category badge */}
        {data.category && (
          <View className="mt-2 flex-row">
            <View className="flex-row items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
              <Tag size={12} color={themeColors.mutedForeground} />
              <Text className="text-muted-foreground text-xs font-medium">
                {data.category}
              </Text>
            </View>
          </View>
        )}

        {/* Excerpt preview */}
        {isExcerpt && data.excerpt && (
          <View className="mt-3 rounded-lg bg-muted p-3">
            <Text className="text-muted-foreground text-sm leading-relaxed" numberOfLines={4}>
              {data.excerpt}
            </Text>
          </View>
        )}

        {/* Full doc hint */}
        {!isExcerpt && (
          <View className="mt-3 rounded-lg bg-muted p-3">
            <Text className="text-muted-foreground text-sm">
              Tap to view the full document
            </Text>
          </View>
        )}
      </View>
    </Card>
  )
}
