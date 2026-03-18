/**
 * DocumentSavedCard - Confirmation after /save command
 */

import { View, useColorScheme } from 'react-native'
import { Text } from '@/components/ui/text'
import { Card } from '@/components/ui/card'
import { FileText, Check, Tag } from 'lucide-react-native'
import { colors } from '@/lib/theme'
import type { DocumentSavedCardData } from '@/lib/types/chat'

export interface DocumentSavedCardProps {
  data: DocumentSavedCardData
  testID?: string
}

export function DocumentSavedCard({
  data,
  testID = 'document-saved-card',
}: DocumentSavedCardProps) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const themeColors = isDark ? colors.dark : colors.light

  return (
    <Card testID={testID} className="border-border bg-card overflow-hidden">
      {/* Success accent bar */}
      <View className="h-1 bg-emerald-500" />

      <View className="p-4">
        {/* Header with success indicator */}
        <View className="mb-3 flex-row items-center gap-2">
          <View className="rounded-full bg-emerald-500/20 p-1">
            <Check size={16} color="#10B981" />
          </View>
          <Text className="text-foreground flex-1 text-lg font-bold">
            Document Saved
          </Text>
          <FileText size={20} color={themeColors.primary} />
        </View>

        {/* Document info */}
        <View className="gap-2">
          {/* Title */}
          <Text className="text-foreground text-base font-semibold">
            {data.title}
          </Text>

          {/* Category badge */}
          {data.category && (
            <View className="flex-row">
              <View className="flex-row items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
                <Tag size={12} color={themeColors.mutedForeground} />
                <Text className="text-muted-foreground text-xs font-medium">
                  {data.category}
                </Text>
              </View>
            </View>
          )}

          {/* Note */}
          <View className="mt-2 rounded-lg bg-muted p-3">
            <Text className="text-muted-foreground text-sm">
              Document has been saved to your knowledge base. Use /search to find it later.
            </Text>
          </View>
        </View>
      </View>
    </Card>
  )
}
