import { useState } from 'react'
import { View, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { RecommendationItem } from './RecommendationItem'
import { RecommendationSources } from './RecommendationSources'
import { RecommendationActionSheet } from './RecommendationActionSheet'
import type { RecommendationListCardProps, RecommendationItemData } from './types/recommendation'

export function RecommendationListCard({
  data,
  showSummary = true,
  onSaveAllToKB,
  onSaveRecommendation,
  testID,
}: RecommendationListCardProps) {
  const [activeItem, setActiveItem] = useState<RecommendationItemData | null>(null)

  const handleSaveRecommendation = (item: RecommendationItemData) => {
    onSaveRecommendation?.(item)
    setActiveItem(null)
  }

  return (
    <View testID={testID || 'recommendation-list-card'} className="py-4">
      {showSummary && data.summary && (
        <View className="px-6 pb-2">
          <Text className="text-xs uppercase text-muted-foreground">Summary</Text>
          <Text className="text-sm text-foreground">{data.summary}</Text>
        </View>
      )}

      {data.items.map((item, i) => (
        <RecommendationItem
          key={`${item.id}-${i}`}
          item={item}
          index={i}
          onLongPress={setActiveItem}
        />
      ))}

      {data.title && (
        <View className="px-6 pb-2">
          <Text className="text-xs uppercase text-muted-foreground">Sources</Text>
          <RecommendationSources
            sources={[
              {
                name: data.title,
                type: 'document',
                url: data.contextTag || '',
              },
            ]}
          />
        </View>
      )}

      {onSaveAllToKB && (
        <View className="px-4 pt-3">
          <Pressable
            testID="recommendation-list-save-all"
            onPress={() => onSaveAllToKB(data.items)}
            className="py-2 rounded bg-secondary items-center"
          >
            <Text className="text-sm text-secondary-foreground">Save list to KB</Text>
          </Pressable>
        </View>
      )}

      <RecommendationActionSheet
        visible={!!activeItem}
        item={activeItem}
        onDismiss={() => setActiveItem(null)}
        onSave={handleSaveRecommendation}
      />
    </View>
  )
}
