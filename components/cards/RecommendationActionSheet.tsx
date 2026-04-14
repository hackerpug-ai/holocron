import { Share, View, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import type { RecommendationActionSheetProps } from './types/recommendation'

export function RecommendationActionSheet({
  visible,
  onDismiss,
  item,
  onSave,
  onOpenInBrowser,
  testID,
}: RecommendationActionSheetProps) {
  if (!visible || !item) return null

  const handleSave = () => {
    onSave?.(item)
    onDismiss()
  }

  const handleShare = async () => {
    const message = `${item.title}\n${item.description || ''}`
    try {
      await Share.share({ message })
    } catch {
      // Share was dismissed or errored - dismiss the sheet
    }
    onDismiss()
  }

  const handleOpenInBrowser = () => {
    onOpenInBrowser?.(item)
    onDismiss()
  }

  return (
    <View
      testID={testID || 'recommendation-action-sheet'}
      className="absolute bottom-0 left-0 right-0 bg-background border-t border-border rounded-t-lg"
    >
      <View className="py-2">
        <Pressable
          testID="recommendation-action-save"
          onPress={handleSave}
          className="px-4 py-3 active:bg-muted"
        >
          <Text className="text-base text-foreground">Save to KB</Text>
        </Pressable>

        {item.url && (
          <Pressable
            testID="recommendation-action-open-browser"
            onPress={handleOpenInBrowser}
            className="px-4 py-3 active:bg-muted"
          >
            <Text className="text-base text-foreground">Open in Browser</Text>
          </Pressable>
        )}

        <Pressable
          testID="recommendation-action-share"
          onPress={handleShare}
          className="px-4 py-3 active:bg-muted"
        >
          <Text className="text-base text-foreground">Share</Text>
        </Pressable>

        <View className="h-px bg-border mx-4" />

        <Pressable
          testID="recommendation-action-dismiss"
          onPress={onDismiss}
          className="px-4 py-3 active:bg-muted"
        >
          <Text className="text-base text-muted-foreground">Dismiss</Text>
        </Pressable>
      </View>
    </View>
  )
}
